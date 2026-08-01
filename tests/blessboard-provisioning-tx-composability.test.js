"use strict";

/**
 * Transaction composability tests for V5 provisioning services (ephemeral Postgres).
 * Uses disposable keys only; outer ROLLBACK verifies no permanent rows.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  resolveManageTransactionOption,
  withProvisioningTransaction,
  isPool,
  isConnectedClient,
} = require("../src/platform/db/provisioningTransaction");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { recordAuditEvent } = require("../src/platform/services/auditEventService");

function uniqueKey(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Wrap a pg Client to count transaction control statements.
 * @param {import('pg').PoolClient} client
 */
function instrumentClient(client) {
  const counts = { begin: 0, commit: 0, rollback: 0, release: 0 };
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);

  client.query = (text, ...rest) => {
    const sql = typeof text === "string" ? text.trim().toUpperCase() : "";
    if (sql === "BEGIN") counts.begin += 1;
    if (sql === "COMMIT") counts.commit += 1;
    if (sql === "ROLLBACK") counts.rollback += 1;
    return originalQuery(text, ...rest);
  };
  client.release = (...args) => {
    counts.release += 1;
    return originalRelease(...args);
  };

  return { client, counts, restore: () => {
    client.query = originalQuery;
    client.release = originalRelease;
  } };
}

describe("blessboard provisioning transaction composability", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("rejects manageTransaction:false with a Pool", () => {
    const resolved = resolveManageTransactionOption(pool || { connect() {}, query() {} }, {
      manageTransaction: false,
    });
    assert.equal(resolved.ok, false);
    assert.match(resolved.message, /connected client required/i);
  });

  it("classifies Pool vs Client", async () => {
    requireDb();
    assert.equal(isPool(pool), true);
    const client = await pool.connect();
    try {
      assert.equal(isConnectedClient(client), true);
      assert.equal(isPool(client), false);
    } finally {
      client.release();
    }
  });

  it("standalone provisionPlatformTenant begins, commits, and releases once", async () => {
    requireDb();
    const key = uniqueKey("tx-stand");
    const connects = [];
    const wrapPool = {
      connect: async () => {
        const raw = await pool.connect();
        const instr = instrumentClient(raw);
        connects.push(instr);
        return instr.client;
      },
      query: pool.query.bind(pool),
    };

    const result = await provisionPlatformTenant(wrapPool, {
      organizationKey: key,
      displayName: "TX Standalone",
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: key,
      hostname: `${key}.blessboard.test`,
      domainType: "canonical",
      deploymentCode: "blessboard-org-staging",
      isPrimary: true,
    });
    assert.equal(result.ok, true);
    assert.equal(connects.length, 1);
    assert.equal(connects[0].counts.begin, 1);
    assert.equal(connects[0].counts.commit, 1);
    assert.equal(connects[0].counts.rollback, 0);
    assert.equal(connects[0].counts.release, 1);
  });

  it("composed services issue no inner BEGIN/COMMIT/ROLLBACK/release", async () => {
    requireDb();
    const key = uniqueKey("tx-comp");
    const client = await pool.connect();
    const instr = instrumentClient(client);
    try {
      await client.query("BEGIN");
      const beforeBegin = instr.counts.begin;

      const org = await provisionPlatformTenant(
        client,
        {
          organizationKey: key,
          displayName: "TX Composed",
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: `${key}.blessboard.test`,
          domainType: "canonical",
          deploymentCode: "blessboard-org-staging",
          isPrimary: true,
        },
        { manageTransaction: false }
      );
      assert.equal(org.ok, true);

      const church = await provisionBlessBoardChurch(
        client,
        {
          organizationKey: key,
          churchKey: key,
          displayName: "TX Composed",
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "Headquarters",
        },
        { manageTransaction: false }
      );
      assert.equal(church.ok, true);

      const email = `${key}@example.org`;
      const user = await createBlessBoardUser(
        client,
        { email, displayName: "TX Admin", password: "TestPassword99" },
        { manageTransaction: false }
      );
      assert.equal(user.ok, true);

      const role = await assignBlessBoardRole(
        client,
        {
          email,
          organizationKey: key,
          roleKey: "church_hq_admin",
          churchKey: key,
        },
        { manageTransaction: false }
      );
      assert.equal(role.ok, true);

      const audit = await recordAuditEvent(client, {
        deploymentCode: "blessboard-org-staging",
        organizationId: org.records.organization.id,
        churchId: church.records.church.id,
        actionKey: "provision.tx_composability_probe",
        entityType: "organization",
        entityId: org.records.organization.id,
        outcome: "success",
        metadata: { status: "probe" },
      });
      assert.equal(audit.ok, true);

      // Only the outer BEGIN from this test; services must not add more.
      assert.equal(instr.counts.begin, beforeBegin);
      assert.equal(instr.counts.commit, 0);
      assert.equal(instr.counts.rollback, 0);
      assert.equal(instr.counts.release, 0);

      await client.query("ROLLBACK");
    } finally {
      instr.restore();
      client.release();
    }

    const leftover = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM platform.organizations WHERE organization_key = $1) AS orgs,
         (SELECT COUNT(*)::int FROM blessboard.churches WHERE church_key = $1) AS churches,
         (SELECT COUNT(*)::int FROM blessboard.users WHERE email_normalized = $2) AS users`,
      [key, `${key}@example.org`]
    );
    assert.equal(leftover.rows[0].orgs, 0);
    assert.equal(leftover.rows[0].churches, 0);
    assert.equal(leftover.rows[0].users, 0);
  });

  it("full-chain outer commit persists org, church, user, role, subscription, audit", async () => {
    requireDb();
    const key = uniqueKey("tx-ok");
    const email = `${key}@example.org`;
    let orgId = null;

    await withProvisioningTransaction(pool, async (client) => {
      const org = await provisionPlatformTenant(
        client,
        {
          organizationKey: key,
          displayName: "TX Commit Chain",
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: `${key}.blessboard.test`,
          domainType: "canonical",
          deploymentCode: "blessboard-org-staging",
          isPrimary: true,
        },
        { manageTransaction: false }
      );
      assert.equal(org.ok, true);
      orgId = org.records.organization.id;

      const church = await provisionBlessBoardChurch(
        client,
        {
          organizationKey: key,
          churchKey: key,
          displayName: "TX Commit Chain",
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "Headquarters",
        },
        { manageTransaction: false }
      );
      assert.equal(church.ok, true);

      const user = await createBlessBoardUser(
        client,
        { email, displayName: "TX Commit Admin", password: "TestPassword99" },
        { manageTransaction: false }
      );
      assert.equal(user.ok, true);

      const role = await assignBlessBoardRole(
        client,
        {
          email,
          organizationKey: key,
          roleKey: "branch_admin",
          churchKey: key,
          branchKey: "hq",
        },
        { manageTransaction: false }
      );
      assert.equal(role.ok, true);

      const audit = await recordAuditEvent(client, {
        deploymentCode: "blessboard-org-staging",
        organizationId: orgId,
        churchId: church.records.church.id,
        actionKey: "provision.tx_chain_commit",
        entityType: "organization",
        entityId: orgId,
        outcome: "success",
        metadata: { status: "committed" },
      });
      assert.equal(audit.ok, true);
    });

    const check = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM platform.organizations WHERE id = $1) AS orgs,
         (SELECT COUNT(*)::int FROM blessboard.churches WHERE organization_id = $1) AS churches,
         (SELECT COUNT(*)::int FROM blessboard.branches b
            JOIN blessboard.churches c ON c.id = b.church_id WHERE c.organization_id = $1) AS branches,
         (SELECT COUNT(*)::int FROM blessboard.users WHERE email_normalized = $2) AS users,
         (SELECT COUNT(*)::int FROM blessboard.user_roles ur
            JOIN blessboard.users u ON u.id = ur.user_id
           WHERE u.email_normalized = $2 AND ur.organization_id = $1) AS roles,
         (SELECT COUNT(*)::int FROM platform.organization_subscriptions
           WHERE organization_id = $1 AND product_key = 'blessboard'
             AND status IN ('active','trialing','past_due')) AS subs,
         (SELECT COUNT(*)::int FROM platform.audit_events
           WHERE organization_id = $1 AND action_key = 'provision.tx_chain_commit') AS audits`,
      [orgId, email]
    );
    assert.equal(check.rows[0].orgs, 1);
    assert.equal(check.rows[0].churches, 1);
    assert.equal(check.rows[0].branches, 1);
    assert.equal(check.rows[0].users, 1);
    assert.equal(check.rows[0].roles, 1);
    assert.equal(check.rows[0].subs, 1);
    assert.equal(check.rows[0].audits, 1);
  });

  it("full-chain outer rollback after church leaves no partial tenant", async () => {
    requireDb();
    const key = uniqueKey("tx-rb");
    const email = `${key}@example.org`;

    await assert.rejects(async () => {
      await withProvisioningTransaction(pool, async (client) => {
        const org = await provisionPlatformTenant(
          client,
          {
            organizationKey: key,
            displayName: "TX Rollback",
            dataEnvironment: "testing",
            productKey: "blessboard",
            productTenantKey: key,
            hostname: `${key}.blessboard.test`,
            domainType: "canonical",
            deploymentCode: "blessboard-org-staging",
            isPrimary: true,
          },
          { manageTransaction: false }
        );
        assert.equal(org.ok, true);

        const church = await provisionBlessBoardChurch(
          client,
          {
            organizationKey: key,
            churchKey: key,
            displayName: "TX Rollback",
            dataEnvironment: "testing",
            hqBranchKey: "hq",
            hqBranchDisplayName: "Headquarters",
          },
          { manageTransaction: false }
        );
        assert.equal(church.ok, true);

        const user = await createBlessBoardUser(
          client,
          { email, displayName: "TX RB Admin", password: "TestPassword99" },
          { manageTransaction: false }
        );
        assert.equal(user.ok, true);

        await assignBlessBoardRole(
          client,
          {
            email,
            organizationKey: key,
            roleKey: "church_hq_admin",
            churchKey: key,
          },
          { manageTransaction: false }
        );

        await recordAuditEvent(client, {
          deploymentCode: "blessboard-org-staging",
          organizationId: org.records.organization.id,
          actionKey: "provision.tx_chain_rollback",
          entityType: "organization",
          entityId: org.records.organization.id,
          outcome: "success",
          metadata: { status: "should_roll_back" },
        });

        throw new Error("deliberate_outer_failure");
      });
    }, /deliberate_outer_failure/);

    const leftover = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM platform.organizations WHERE organization_key = $1) AS orgs,
         (SELECT COUNT(*)::int FROM platform.organization_products op
            JOIN platform.organizations o ON o.id = op.organization_id
           WHERE o.organization_key = $1) AS enrolments,
         (SELECT COUNT(*)::int FROM platform.domains WHERE hostname = $2) AS domains,
         (SELECT COUNT(*)::int FROM blessboard.churches WHERE church_key = $1) AS churches,
         (SELECT COUNT(*)::int FROM blessboard.users WHERE email_normalized = $3) AS users,
         (SELECT COUNT(*)::int FROM platform.organization_subscriptions os
            JOIN platform.organizations o ON o.id = os.organization_id
           WHERE o.organization_key = $1) AS subs,
         (SELECT COUNT(*)::int FROM platform.audit_events
           WHERE action_key = 'provision.tx_chain_rollback') AS audits`,
      [key, `${key}.blessboard.test`, email]
    );
    assert.equal(leftover.rows[0].orgs, 0);
    assert.equal(leftover.rows[0].enrolments, 0);
    assert.equal(leftover.rows[0].domains, 0);
    assert.equal(leftover.rows[0].churches, 0);
    assert.equal(leftover.rows[0].users, 0);
    assert.equal(leftover.rows[0].subs, 0);
    assert.equal(leftover.rows[0].audits, 0);
  });

  it("composed failure result does not commit when manageTransaction is false", async () => {
    requireDb();
    const key = uniqueKey("tx-fail");
    const client = await pool.connect();
    const instr = instrumentClient(client);
    try {
      await client.query("BEGIN");
      const missing = await provisionBlessBoardChurch(
        client,
        {
          organizationKey: key,
          churchKey: key,
          displayName: "Missing Org",
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        },
        { manageTransaction: false }
      );
      assert.equal(missing.ok, false);
      assert.equal(missing.status, "organization_not_found");
      assert.equal(instr.counts.rollback, 0);
      assert.equal(instr.counts.commit, 0);
      await client.query("ROLLBACK");
    } finally {
      instr.restore();
      client.release();
    }
  });
});
