"use strict";

/**
 * Regression: testing maintenance organization purge must remove website-
 * bearing tenants (e.g. Demi Church Name 12 / Demo11) without aborting the
 * whole batch on a single failure.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  FULL_RESET_CONFIRM_PHRASE,
  previewTestingDataReset,
  executeTestingDataReset,
  STATUS,
  ORGANIZATION_SCOPED_TABLES,
} = require("../src/platform/services/testingDataResetService");
const {
  countOrganizationScopedResiduals,
  purgeOrganizationTree,
  listPlatformAdminPreserveSet,
} = require("../src/platform/repositories/testingDataResetRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const SESSION_SECRET = "test-session-secret-at-least-32-chars!!";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET,
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "off",
    BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED: "0",
    ...overrides,
  };
}

async function seedWebsiteBearingOrg(pool, opts) {
  const key = opts.organizationKey;
  const displayName = opts.displayName;
  const hostname = opts.hostname;
  const tenant = await provisionPlatformTenant(pool, {
    organizationKey: key,
    displayName,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: key,
    hostname,
    domainType: "canonical",
    deploymentCode: "blessboard-org-staging",
    isPrimary: true,
  });
  assert.equal(tenant.ok, true, JSON.stringify(tenant));
  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: key,
    churchKey: key,
    displayName,
    legalName: null,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: opts.branchDisplayName || "Headquarters",
  });
  assert.equal(church.ok, true, JSON.stringify(church));

  const email = opts.adminEmail;
  const user = await createBlessBoardUser(pool, {
    email,
    displayName: `${displayName} Admin`,
    password: PASSWORD,
  });
  assert.equal(user.ok, true, user.message);
  const role = await assignBlessBoardRole(pool, {
    email,
    organizationKey: key,
    roleKey: "church_hq_admin",
    churchKey: key,
  });
  assert.equal(role.ok, true, role.message);

  const orgId = tenant.records.organization.id;
  const churchId = church.records.church.id;
  const branchId = church.records.hqBranch.id;
  const userId = user.user.id;

  // Website publication versions — the FK that previously blocked cleanup.
  await pool.query(
    `INSERT INTO blessboard.website_publication_versions
       (organization_id, church_id, version_number, status, theme_key, source_type,
        snapshot_json, change_summary_json, created_by, published_by, published_at)
     VALUES
       ($1, $2, 1, 'superseded', 'default', 'initial_setup', '{}'::jsonb, '{}'::jsonb, $3, $3, now() - interval '1 day'),
       ($1, $2, 2, 'published', 'default', 'hq_edit', '{}'::jsonb, '{}'::jsonb, $3, $3, now())`,
    [orgId, churchId, userId]
  );

  await pool.query(
    `INSERT INTO blessboard.website_inline_field_drafts
       (organization_id, church_id, branch_id, page_key, section_key, field_key,
        new_value, editor_user_id, status)
     VALUES
       ($1, $2, NULL, 'home', 'hero', 'heading', 'Hello', $3, 'applied'),
       ($1, $2, NULL, 'home', 'hero', 'buttonText', 'Visit', $3, 'draft')`,
    [orgId, churchId, userId]
  );

  await pool.query(
    `INSERT INTO blessboard.website_audit_events
       (organization_id, branch_id, actor_user_id, action_type, page_key, section_key, entity_id)
     VALUES
       ($1, NULL, $2, 'field_saved', 'home', 'hero', gen_random_uuid()),
       ($1, NULL, $2, 'published', 'home', NULL, gen_random_uuid())`,
    [orgId, userId]
  );

  await pool.query(
    `INSERT INTO blessboard.website_approval_settings (organization_id, updated_by)
     VALUES ($1, $2)
     ON CONFLICT (organization_id) DO NOTHING`,
    [orgId, userId]
  );

  // Member + messaging + form submission surface for full-tree coverage.
  const member = await pool.query(
    `INSERT INTO blessboard.members
       (church_id, first_name, last_name, status, email_normalized, email_display)
     VALUES ($1, 'Member', 'One', 'active', $2, $2)
     RETURNING id`,
    [churchId, `member-${key}@example.org`]
  );
  const memberId = member.rows[0].id;

  await pool.query(
    `INSERT INTO blessboard.member_branch_memberships
       (member_id, branch_id, membership_status, is_primary)
     VALUES ($1, $2, 'active', true)`,
    [memberId, branchId]
  );

  const msg = await pool.query(
    `INSERT INTO blessboard.messages
       (church_id, created_by_user_id, sender_display_name, message_type, title, body, status, sent_at)
     VALUES ($1, $2, 'HQ', 'announcement', 'Hello', 'Body text for purge coverage', 'sent', now())
     RETURNING id`,
    [churchId, userId]
  );
  await pool.query(
    `INSERT INTO blessboard.message_audiences (message_id, audience_type)
     VALUES ($1, 'all_active_members')`,
    [msg.rows[0].id]
  );
  await pool.query(
    `INSERT INTO blessboard.member_notifications
       (church_id, member_id, message_id, source_type, category, title, body,
        sender_display_name, message_type)
     VALUES ($1, $2, $3, 'message', 'church', 'Hello', 'Body', 'HQ', 'announcement')`,
    [churchId, memberId, msg.rows[0].id]
  );

  const form = await pool.query(
    `INSERT INTO blessboard.forms
       (church_id, title, status, published_at, schema_json)
     VALUES ($1, 'Contact', 'published', now(), '{"version":1,"fields":[]}'::jsonb)
     RETURNING id`,
    [churchId]
  );
  await pool.query(
    `INSERT INTO blessboard.form_submissions
       (form_id, church_id, member_id, branch_id, answers_json)
     VALUES ($1, $2, $3, $4, '{"ok":true}'::jsonb)`,
    [form.rows[0].id, churchId, memberId, branchId]
  );

  // Ensure marker is set (provision path should set it; assert explicitly).
  const marker = await pool.query(
    `SELECT test_cleanup_eligible FROM platform.organizations WHERE id = $1`,
    [orgId]
  );
  assert.equal(marker.rows[0].test_cleanup_eligible, true);

  return {
    orgId,
    orgKey: key,
    displayName,
    churchId,
    branchId,
    userId,
    memberId,
  };
}

describe("blessboard testing organization purge", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let appTesting;
  let paUser;
  let paSessionRaw;
  let paOrgId;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const paOrg = await provisionPlatformTenant(pool, {
        organizationKey: "pa-fixture",
        displayName: "PA Fixture Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "pa-fixture",
        hostname: "pa-fixture.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      paOrgId = paOrg.records.organization.id;

      const created = await createBlessBoardUser(pool, {
        email: "pa-org-purge@example.org",
        displayName: "PA Org Purge",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      paUser = created.user;
      const role = await assignBlessBoardRole(pool, {
        email: "pa-org-purge@example.org",
        organizationKey: "pa-fixture",
        roleKey: "platform_admin",
      });
      assert.equal(role.ok, true, role.message);

      const session = await createV5Session(pool, {
        deploymentCode: "blessboard-org-staging",
        userId: paUser.id,
        organizationId: paOrgId,
      });
      assert.equal(session.ok, true);
      paSessionRaw = session.rawToken;

      appTesting = createV5FoundationApp({
        env: baseEnv({ DEPLOYMENT_ENV: "testing" }),
        getPool: () => pool,
      });
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

  it("1. normally provisioned test organization is fully deleted", async () => {
    requireDb();
    const seeded = await seedWebsiteBearingOrg(pool, {
      organizationKey: "normal-purge-org",
      displayName: "Normal Purge Org",
      hostname: "normal-purge.blessboard.org",
      adminEmail: "normal-purge-admin@example.org",
    });

    const preview = await previewTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_organizations",
      sessionSecret: SESSION_SECRET,
    });
    assert.equal(preview.ok, true);

    const result = await executeTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_organizations",
      confirmPhrase: "clear_organizations",
      confirmChecked: true,
      previewToken: preview.previewToken,
      sessionSecret: SESSION_SECRET,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.organizationPurge.deleted >= 1);

    const org = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE id = $1`,
      [seeded.orgId]
    );
    assert.equal(org.rows[0].n, 0);
    const residuals = await countOrganizationScopedResiduals(pool, seeded.orgId);
    assert.deepEqual(residuals, []);
    assert.ok(ORGANIZATION_SCOPED_TABLES.length >= 10);
  });

  it("2–3. Demi Church Name 12 and Demo11 equivalents are deleted", async () => {
    requireDb();
    const demi = await seedWebsiteBearingOrg(pool, {
      organizationKey: "demi-church-name-12",
      displayName: "Demi Church Name 12",
      hostname: "demi-church-name-12.blessboard.org",
      branchDisplayName: "Kafue",
      adminEmail: "demi12-admin@example.org",
    });
    const demo = await seedWebsiteBearingOrg(pool, {
      organizationKey: "demo11",
      displayName: "Demo11",
      hostname: "demo11.blessboard.org",
      branchDisplayName: "Demo11 Kafue",
      adminEmail: "demo11-admin@example.org",
    });

    const preview = await previewTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_organizations",
      sessionSecret: SESSION_SECRET,
    });
    const result = await executeTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_organizations",
      confirmPhrase: "clear_organizations",
      confirmChecked: true,
      previewToken: preview.previewToken,
      sessionSecret: SESSION_SECRET,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(result.ok, true, JSON.stringify(result));

    for (const seeded of [demi, demo]) {
      const org = await pool.query(
        `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE id = $1`,
        [seeded.orgId]
      );
      assert.equal(org.rows[0].n, 0, seeded.displayName);
      const residuals = await countOrganizationScopedResiduals(pool, seeded.orgId);
      assert.deepEqual(residuals, [], seeded.displayName);
      const churches = await pool.query(
        `SELECT COUNT(*)::int AS n FROM blessboard.churches WHERE id = $1`,
        [seeded.churchId]
      );
      assert.equal(churches.rows[0].n, 0);
      const versions = await pool.query(
        `SELECT COUNT(*)::int AS n FROM blessboard.website_publication_versions
          WHERE organization_id = $1`,
        [seeded.orgId]
      );
      assert.equal(versions.rows[0].n, 0);
    }
  });

  it("4–5. rich tenant graph is fully deleted with no org-scoped orphans", async () => {
    requireDb();
    const rich = await seedWebsiteBearingOrg(pool, {
      organizationKey: "rich-purge-org",
      displayName: "Rich Purge Org",
      hostname: "rich-purge.blessboard.org",
      adminEmail: "rich-purge-admin@example.org",
    });

    // Registration application linked to org.
    await pool.query(
      `INSERT INTO blessboard.platform_church_registration_applications
         (church_name, country, city, contact_name, contact_email, contact_phone,
          contact_phone_normalized, selected_plan, consent_terms, risk_decision,
          risk_reason_codes, risk_decided_at, organization_id, status,
          application_status, provisioning_status, provisioned_at)
       VALUES
         ('Rich Purge Org', 'ZM', 'Lusaka', 'Rich', 'rich-reg@example.org', '+260971000099',
          '+260971000099', 'foundation', true, 'allow', ARRAY[]::text[], now(), $1, 'closed',
          'closed', 'provisioned', now())`,
      [rich.orgId]
    );

    const preview = await previewTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_organizations",
      sessionSecret: SESSION_SECRET,
    });
    const result = await executeTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_organizations",
      confirmPhrase: "clear_organizations",
      confirmChecked: true,
      previewToken: preview.previewToken,
      sessionSecret: SESSION_SECRET,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(result.ok, true, JSON.stringify(result));

    const residuals = await countOrganizationScopedResiduals(pool, rich.orgId);
    assert.deepEqual(residuals, []);

    // Application may remain but must be unlinked.
    const linked = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.platform_church_registration_applications
        WHERE organization_id = $1`,
      [rich.orgId]
    );
    assert.equal(linked.rows[0].n, 0);
  });

  it("6–7. failed organization is reported; remaining orgs still process", async () => {
    requireDb();
    const good = await seedWebsiteBearingOrg(pool, {
      organizationKey: "survive-purge-org",
      displayName: "Survive Purge Org",
      hostname: "survive-purge.blessboard.org",
      adminEmail: "survive-purge-admin@example.org",
    });
    const bad = await seedWebsiteBearingOrg(pool, {
      organizationKey: "fail-purge-org",
      displayName: "Fail Purge Org",
      hostname: "fail-purge.blessboard.org",
      adminEmail: "fail-purge-admin@example.org",
    });

    // Inject an unhandled dependent: temporary FK table simulating a future schema gap.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blessboard._purge_test_blocker (
        organization_id UUID PRIMARY KEY
          REFERENCES platform.organizations (id) ON DELETE RESTRICT
      )
    `);
    await pool.query(
      `INSERT INTO blessboard._purge_test_blocker (organization_id) VALUES ($1)
       ON CONFLICT DO NOTHING`,
      [bad.orgId]
    );

    try {
      const preview = await previewTestingDataReset(pool, {
        env: baseEnv(),
        actorUserId: paUser.id,
        action: "clear_organizations",
        sessionSecret: SESSION_SECRET,
      });
      const result = await executeTestingDataReset(pool, {
        env: baseEnv(),
        actorUserId: paUser.id,
        action: "clear_organizations",
        confirmPhrase: "clear_organizations",
        confirmChecked: true,
        previewToken: preview.previewToken,
        sessionSecret: SESSION_SECRET,
        deploymentCode: "blessboard-org-staging",
      });

      assert.equal(result.ok, false);
      assert.equal(result.reason, "organization_purge_partial_failure");
      assert.ok(result.organizationPurge.failed >= 1);
      assert.ok(result.organizationPurge.deleted >= 1);

      const failed = result.organizationPurge.results.filter((r) => r.status === "failed");
      assert.ok(failed.some((r) => r.id === bad.orgId));
      assert.ok(failed[0].reason);

      const goodGone = await pool.query(
        `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE id = $1`,
        [good.orgId]
      );
      assert.equal(goodGone.rows[0].n, 0);

      const badStill = await pool.query(
        `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE id = $1`,
        [bad.orgId]
      );
      assert.equal(badStill.rows[0].n, 1);
    } finally {
      await pool.query(`DELETE FROM blessboard._purge_test_blocker`);
      await pool.query(`DROP TABLE IF EXISTS blessboard._purge_test_blocker`);
      // Clean leftover bad org via direct purge now that blocker is gone.
      const preserve = await listPlatformAdminPreserveSet(pool);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await purgeOrganizationTree(client, {
          organizationId: bad.orgId,
          preserveOrgIds: preserve.orgIds,
          preserveUserIds: preserve.userIds,
        });
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    }
  });

  it("8. production database identity blocks the operation", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.database_identity SET environment_code = 'production'
        WHERE identity_key = $1`,
      [IDENTITY_KEY]
    );
    try {
      const blocked = await executeTestingDataReset(pool, {
        env: baseEnv({ DEPLOYMENT_ENV: "testing" }),
        actorUserId: paUser.id,
        action: "clear_organizations",
        confirmPhrase: "clear_organizations",
        confirmChecked: true,
        previewToken: "x",
        sessionSecret: SESSION_SECRET,
        deploymentCode: "blessboard-org-staging",
      });
      assert.equal(blocked.ok, false);
      assert.equal(blocked.status, STATUS.IDENTITY_BLOCKED);
    } finally {
      await pool.query(
        `UPDATE platform.database_identity SET environment_code = 'testing'
          WHERE identity_key = $1`,
        [IDENTITY_KEY]
      );
    }
  });

  it("9. non-test organization is never deleted", async () => {
    requireDb();
    const protectedTenant = await provisionPlatformTenant(pool, {
      organizationKey: "production-like-org",
      displayName: "Production Like Org",
      legalName: null,
      dataEnvironment: "production",
      productKey: "blessboard",
      productTenantKey: "production-like-org",
      hostname: "production-like.blessboard.org",
      domainType: "canonical",
      deploymentCode: "blessboard-org-staging",
      isPrimary: true,
    });
    assert.equal(protectedTenant.ok, true);
    const protectedId = protectedTenant.records.organization.id;

    const marker = await pool.query(
      `SELECT test_cleanup_eligible, data_environment
         FROM platform.organizations WHERE id = $1`,
      [protectedId]
    );
    assert.equal(marker.rows[0].test_cleanup_eligible, false);
    assert.equal(marker.rows[0].data_environment, "production");

    // Also seed an eligible org so cleanup has work.
    await seedWebsiteBearingOrg(pool, {
      organizationKey: "eligible-beside-protected",
      displayName: "Eligible Beside Protected",
      hostname: "eligible-beside.blessboard.org",
      adminEmail: "eligible-beside@example.org",
    });

    const preview = await previewTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_organizations",
      sessionSecret: SESSION_SECRET,
    });
    const result = await executeTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_organizations",
      confirmPhrase: "clear_organizations",
      confirmChecked: true,
      previewToken: preview.previewToken,
      sessionSecret: SESSION_SECRET,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(result.ok, true, JSON.stringify(result));

    const still = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE id = $1`,
      [protectedId]
    );
    assert.equal(still.rows[0].n, 1);

    const paStill = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE id = $1`,
      [paOrgId]
    );
    assert.equal(paStill.rows[0].n, 1);
  });

  it("10. organizations page no longer lists deleted records after cleanup", async () => {
    requireDb();
    const listed = await seedWebsiteBearingOrg(pool, {
      organizationKey: "listed-then-purged",
      displayName: "Listed Then Purged",
      hostname: "listed-then-purged.blessboard.org",
      adminEmail: "listed-then-purged@example.org",
    });

    const before = await request(appTesting)
      .get("/admin/organizations")
      .set("Host", "blessboard.org")
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${paSessionRaw}`);
    assert.equal(before.status, 200);
    assert.match(before.text, /Listed Then Purged/);

    const preview = await previewTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_organizations",
      sessionSecret: SESSION_SECRET,
    });
    const result = await executeTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_organizations",
      confirmPhrase: "clear_organizations",
      confirmChecked: true,
      previewToken: preview.previewToken,
      sessionSecret: SESSION_SECRET,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(result.ok, true, JSON.stringify(result));

    const after = await request(appTesting)
      .get("/admin/organizations")
      .set("Host", "blessboard.org")
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${paSessionRaw}`);
    assert.equal(after.status, 200);
    assert.doesNotMatch(after.text, /Listed Then Purged/);
    assert.doesNotMatch(after.text, new RegExp(listed.orgId, "i"));
    assert.match(after.text, /PA Fixture Org|Organizations/i);
  });
});
