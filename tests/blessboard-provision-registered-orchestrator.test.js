"use strict";

/**
 * provisionRegisteredBlessBoardChurch orchestrator tests (ephemeral Postgres).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
  STATUS,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

describe("provisionRegisteredBlessBoardChurch orchestrator", () => {
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

  async function insertApplication(overrides = {}) {
    const key = uniq("orch");
    const row = await appRepo.createApplication(pool, {
      church_name: overrides.church_name || `Orch Church ${key}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: overrides.contact_name || "Ada Admin",
      contact_email: overrides.contact_email || `${key}@example.org`,
      contact_phone: "+254700000001",
      selected_plan: overrides.selected_plan || "foundation",
      consent_terms: true,
      branch_name: "Main Campus",
    });
    // Ensure Phase-1 status columns (defaults apply on insert).
    assert.equal(row.application_status, "submitted");
    assert.equal(row.provisioning_status, "not_started");
    return row;
  }

  async function countsForOrgKey(organizationKey) {
    const r = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM platform.organizations WHERE organization_key = $1) AS orgs,
         (SELECT COUNT(*)::int FROM blessboard.churches WHERE church_key = $1) AS churches,
         (SELECT COUNT(*)::int FROM blessboard.branches b
            JOIN blessboard.churches c ON c.id = b.church_id WHERE c.church_key = $1) AS branches,
         (SELECT COUNT(*)::int FROM platform.domains d
            JOIN platform.organizations o ON o.id = d.organization_id
           WHERE o.organization_key = $1) AS domains,
         (SELECT COUNT(*)::int FROM platform.organization_subscriptions os
            JOIN platform.organizations o ON o.id = os.organization_id
           WHERE o.organization_key = $1) AS subs,
         (SELECT COUNT(*)::int FROM blessboard.organization_onboarding oo
            JOIN platform.organizations o ON o.id = oo.organization_id
           WHERE o.organization_key = $1) AS onboarding,
         (SELECT COUNT(*)::int FROM blessboard.public_pages pp
            JOIN blessboard.churches c ON c.id = pp.church_id
           WHERE c.church_key = $1 AND pp.status = 'draft') AS draft_pages,
         (SELECT COUNT(*)::int FROM blessboard.public_pages pp
            JOIN blessboard.churches c ON c.id = pp.church_id
           WHERE c.church_key = $1 AND pp.status = 'published') AS published_pages`,
      [organizationKey]
    );
    return r.rows[0];
  }

  it("provisions a submitted Free application end-to-end without domains", async () => {
    requireDb();
    const app = await insertApplication();
    const keyGuess = String(app.church_name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const result = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: app.id,
      administratorPassword: "TestPassword99",
      requestId: "req-orch-1",
      actorContext: { type: "test", source: "unit", dataEnvironment: "testing" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, STATUS.OK);
    assert.equal(result.alreadyProvisioned, false);
    assert.ok(result.records.organizationId);
    assert.ok(result.records.churchId);
    assert.ok(result.records.branchId);
    assert.ok(result.records.administratorUserId);
    assert.equal(result.records.applicationStatus, "closed");
    assert.equal(result.records.provisioningStatus, "provisioned");

    const orgKey = result.records.organizationKey;
    assert.match(orgKey, /^[a-z]/);
    assert.ok(orgKey.includes(keyGuess.slice(0, 8)) || orgKey.length >= 3);

    const counts = await countsForOrgKey(orgKey);
    assert.equal(counts.orgs, 1);
    assert.equal(counts.churches, 1);
    assert.equal(counts.branches, 1);
    assert.equal(counts.domains, 0);
    assert.equal(counts.subs, 1);
    assert.equal(counts.onboarding, 1);
    assert.equal(counts.draft_pages, 8);
    assert.equal(counts.published_pages, 0);

    const appRow = await appRepo.findApplicationById(pool, app.id);
    assert.equal(appRow.application_status, "closed");
    assert.equal(appRow.provisioning_status, "provisioned");
    assert.equal(String(appRow.organization_id), String(result.records.organizationId));
    assert.ok(appRow.provisioned_at);

    const roles = await pool.query(
      `SELECT role_key FROM blessboard.user_roles
        WHERE user_id = $1 AND organization_id = $2 AND status = 'active'
        ORDER BY role_key`,
      [result.records.administratorUserId, result.records.organizationId]
    );
    assert.deepEqual(
      roles.rows.map((r) => r.role_key),
      ["branch_admin", "church_hq_admin"]
    );

    const plan = await pool.query(
      `SELECT p.plan_key FROM platform.organization_subscriptions s
         JOIN platform.plans p ON p.id = s.plan_id
        WHERE s.organization_id = $1`,
      [result.records.organizationId]
    );
    assert.equal(plan.rows[0].plan_key, "free");
  });

  it("idempotent second call returns existing organization without duplicates", async () => {
    requireDb();
    const app = await insertApplication();
    const first = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: app.id,
      administratorPassword: "TestPassword99",
      actorContext: { dataEnvironment: "testing" },
    });
    assert.equal(first.ok, true);

    const second = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: app.id,
      administratorPassword: "TestPassword99",
      actorContext: { dataEnvironment: "testing" },
    });
    assert.equal(second.ok, true);
    assert.equal(second.alreadyProvisioned, true);
    assert.equal(second.records.organizationId, first.records.organizationId);
    assert.equal(second.records.churchId, first.records.churchId);

    const counts = await countsForOrgKey(first.records.organizationKey);
    assert.equal(counts.orgs, 1);
    assert.equal(counts.churches, 1);
    assert.equal(counts.branches, 1);
    assert.equal(counts.onboarding, 1);
    assert.equal(counts.domains, 0);
  });

  it("duplicate administrator email moves application to duplicate_review", async () => {
    requireDb();
    const email = `${uniq("dupe")}@example.org`;
    await createBlessBoardUser(pool, {
      email,
      displayName: "Existing User",
      password: "ExistingPass99",
    });

    const app = await insertApplication({ contact_email: email, church_name: `Dupe Church ${uniq("d")}` });
    const result = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: app.id,
      administratorPassword: "NewPassword99",
      actorContext: { dataEnvironment: "testing" },
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.DUPLICATE_EMAIL_REVIEW);

    const appRow = await appRepo.findApplicationById(pool, app.id);
    assert.equal(appRow.application_status, "duplicate_review");
    assert.equal(appRow.provisioning_status, "not_started");
    assert.equal(appRow.organization_id, null);

    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE display_name = $1`,
      [app.church_name]
    );
    assert.equal(orgs.rows[0].n, 0);

    const user = await pool.query(
      `SELECT display_name FROM blessboard.users WHERE email_normalized = $1`,
      [email.toLowerCase()]
    );
    assert.equal(user.rows[0].display_name, "Existing User");
  });

  it("duplicate organization key returns SLUG_UNAVAILABLE without partial records", async () => {
    requireDb();
    const key = uniq("taken");
    await provisionPlatformTenant(pool, {
      organizationKey: key,
      displayName: "Taken Org",
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: key,
      hostname: `${key}.blessboard.test`,
      domainType: "canonical",
      deploymentCode: "blessboard-org-v5",
    });

    const app = await insertApplication({ church_name: key });
    const result = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: app.id,
      administratorPassword: "TestPassword99",
      requestedOrganizationKey: key,
      actorContext: { dataEnvironment: "testing" },
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.SLUG_UNAVAILABLE);

    const appRow = await appRepo.findApplicationById(pool, app.id);
    assert.equal(appRow.application_status, "submitted");
    assert.equal(appRow.provisioning_status, "not_started");
    assert.equal(appRow.organization_id, null);
  });

  it("failed provisioning persists provisioning_failed and rolls back tenant rows", async () => {
    requireDb();
    const app = await insertApplication({ church_name: `Fail Church ${uniq("f")}` });

    const original = require("../src/blessboard/services/provisionBlessBoardChurch").provisionBlessBoardChurch;
    const churchMod = require("../src/blessboard/services/provisionBlessBoardChurch");
    churchMod.provisionBlessBoardChurch = async () => ({
      ok: false,
      status: "church_conflict",
      message: "injected_failure",
    });

    try {
      const result = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: app.id,
        administratorPassword: "TestPassword99",
        actorContext: { dataEnvironment: "testing" },
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, STATUS.PROVISIONING_FAILED);

      const appRow = await appRepo.findApplicationById(pool, app.id);
      assert.equal(appRow.provisioning_status, "provisioning_failed");
      assert.equal(appRow.application_status, "submitted");
      assert.ok(appRow.provisioning_failed_at);
      assert.ok(appRow.provisioning_error_code);

      const orgs = await pool.query(
        `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE display_name = $1`,
        [app.church_name]
      );
      assert.equal(orgs.rows[0].n, 0);
    } finally {
      churchMod.provisionBlessBoardChurch = original;
    }
  });

  it("explicit retry after failure succeeds once the fault is removed", async () => {
    requireDb();
    const app = await insertApplication({ church_name: `Retry Church ${uniq("r")}` });

    const churchMod = require("../src/blessboard/services/provisionBlessBoardChurch");
    const original = churchMod.provisionBlessBoardChurch;
    churchMod.provisionBlessBoardChurch = async () => ({
      ok: false,
      status: "church_conflict",
      message: "injected_failure",
    });

    try {
      const failed = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: app.id,
        administratorPassword: "TestPassword99",
        actorContext: { dataEnvironment: "testing" },
      });
      assert.equal(failed.ok, false);

      const blocked = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: app.id,
        administratorPassword: "TestPassword99",
        actorContext: { dataEnvironment: "testing" },
      });
      assert.equal(blocked.status, STATUS.RETRY_NOT_ALLOWED);

      churchMod.provisionBlessBoardChurch = original;

      const ok = await provisionRegisteredBlessBoardChurch(
        pool,
        {
          applicationId: app.id,
          administratorPassword: "TestPassword99",
          actorContext: { dataEnvironment: "testing" },
        },
        { allowRetry: true }
      );
      assert.equal(ok.ok, true);
      assert.equal(ok.records.provisioningStatus, "provisioned");

      const counts = await countsForOrgKey(ok.records.organizationKey);
      assert.equal(counts.orgs, 1);
      assert.equal(counts.domains, 0);
    } finally {
      churchMod.provisionBlessBoardChurch = original;
    }
  });

  it("concurrent calls for the same application do not double-provision", async () => {
    requireDb();
    const app = await insertApplication({ church_name: `Concurrent ${uniq("c")}` });
    const input = {
      applicationId: app.id,
      administratorPassword: "TestPassword99",
      actorContext: { dataEnvironment: "testing" },
    };
    const [a, b] = await Promise.all([
      provisionRegisteredBlessBoardChurch(pool, input),
      provisionRegisteredBlessBoardChurch(pool, input),
    ]);
    assert.ok(a.ok && b.ok);
    const ids = [a.records.organizationId, b.records.organizationId];
    assert.equal(ids[0], ids[1]);
    const counts = await countsForOrgKey(a.records.organizationKey);
    assert.equal(counts.orgs, 1);
    assert.equal(counts.churches, 1);
    assert.equal(counts.branches, 1);
  });

  it("skipDomain platform provision creates no domain rows", async () => {
    requireDb();
    const key = uniq("nodom");
    const result = await provisionPlatformTenant(pool, {
      organizationKey: key,
      displayName: "No Domain Org",
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: key,
      deploymentCode: "blessboard-org-v5",
      skipDomain: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.records.domain, null);
    const domains = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.domains WHERE organization_id = $1`,
      [result.records.organization.id]
    );
    assert.equal(domains.rows[0].n, 0);
  });
});
