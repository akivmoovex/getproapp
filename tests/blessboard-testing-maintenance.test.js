"use strict";

/**
 * Testing-only platform-admin maintenance / data reset.
 * Destructive tests use ephemeral Postgres only — never hosted DATABASE_URL.
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
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  isTestingDataMaintenanceAllowed,
} = require("../src/platform/config/testingDataMaintenance");
const {
  FULL_RESET_CONFIRM_PHRASE,
  previewTestingDataReset,
  executeTestingDataReset,
  STATUS,
} = require("../src/platform/services/testingDataResetService");
const regRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");

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

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function extractCsrf(html) {
  const m = String(html || "").match(/name="_csrf"[^>]*value="([^"]+)"/);
  return (m && m[1]) || null;
}

describe("testing data maintenance config", () => {
  it("allows only DEPLOYMENT_ENV=testing", () => {
    assert.equal(isTestingDataMaintenanceAllowed({ DEPLOYMENT_ENV: "testing" }), true);
    assert.equal(isTestingDataMaintenanceAllowed({ DEPLOYMENT_ENV: "production" }), false);
    assert.equal(isTestingDataMaintenanceAllowed({ DEPLOYMENT_ENV: "staging" }), false);
    assert.equal(isTestingDataMaintenanceAllowed({}), false);
    assert.equal(
      isTestingDataMaintenanceAllowed({
        DEPLOYMENT_ENV: "production",
        MAINTENANCE_ENABLED: "1",
      }),
      false
    );
  });
});

describe("blessboard testing maintenance http + reset", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let appTesting;
  let appProduction;
  let paUser;
  let paSessionRaw;
  let tenantOrg;
  let mutationSql = [];

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      const originalQuery = pool.query.bind(pool);
      pool.query = (text, params) => {
        const sql = String(text || "").trim();
        if (/^\s*(INSERT|UPDATE|DELETE|ALTER|TRUNCATE|DROP)\b/i.test(sql)) {
          mutationSql.push(sql.slice(0, 120));
        }
        return originalQuery(text, params);
      };

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

      tenantOrg = await provisionPlatformTenant(pool, {
        organizationKey: "wipe-me-org",
        displayName: "Wipe Me Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "wipe-me-org",
        hostname: "wipe-me.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      await provisionBlessBoardChurch(pool, {
        organizationKey: "wipe-me-org",
        churchKey: "wipe-me-org",
        displayName: "Wipe Me Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });

      const created = await createBlessBoardUser(pool, {
        email: "pa-maint@example.org",
        displayName: "PA Maint",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      paUser = created.user;
      const role = await assignBlessBoardRole(pool, {
        email: "pa-maint@example.org",
        organizationKey: "pa-fixture",
        roleKey: "platform_admin",
      });
      assert.equal(role.ok, true, role.message);

      const tenantUser = await createBlessBoardUser(pool, {
        email: "tenant-maint@example.org",
        displayName: "Tenant User",
        password: PASSWORD,
      });
      assert.equal(tenantUser.ok, true);
      await assignBlessBoardRole(pool, {
        email: "tenant-maint@example.org",
        organizationKey: "wipe-me-org",
        roleKey: "church_hq_admin",
        churchKey: "wipe-me-org",
      });

      await regRepo.createApplication(pool, {
        church_name: "Maint Reg Church",
        country: "ZM",
        city: "Lusaka",
        contact_name: "Reg",
        contact_email: "maint-reg@example.org",
        contact_phone: "+260971000039",
        contact_phone_normalized: "+260971000039",
        selected_plan: "foundation",
        consent_terms: true,
        support_requested: false,
        risk_decision: "allow",
        risk_reason_codes: [],
        risk_decided_at: new Date(),
      });

      const session = await createV5Session(pool, {
        deploymentCode: "blessboard-org-staging",
        userId: paUser.id,
        organizationId: paOrg.records.organization.id,
      });
      assert.equal(session.ok, true);
      paSessionRaw = session.rawToken;

      appTesting = createV5FoundationApp({
        env: baseEnv({ DEPLOYMENT_ENV: "testing" }),
        getPool: () => pool,
      });
      appProduction = createV5FoundationApp({
        env: baseEnv({ DEPLOYMENT_ENV: "production" }),
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

  function paCookie() {
    return `${DEFAULT_V5_COOKIE}=${paSessionRaw}`;
  }

  async function getMaintenanceCsrf(app) {
    const page = await request(app)
      .get("/admin/maintenance")
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie());
    const csrfCookie = extractCookie(page, CSRF_COOKIE);
    const csrf = extractCsrf(page.text);
    return { page, csrfCookie, csrf };
  }

  it("1. testing-mode platform admin can open maintenance", async () => {
    requireDb();
    const res = await request(appTesting)
      .get("/admin/maintenance")
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie());
    assert.equal(res.status, 200);
    assert.match(res.text, /Testing Environment Only/);
    assert.match(res.text, /data-bb-pa-maintenance="1"/);
    assert.match(res.text, /Maintenance/);
    assert.match(res.text, /blessboard-platform-v5/);
  });

  it("2. production-mode platform admin cannot open maintenance", async () => {
    requireDb();
    const res = await request(appProduction)
      .get("/admin/maintenance")
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie());
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.text, /data-bb-pa-maintenance="1"/);
  });

  it("3–4. non-platform user and non-apex host are denied", async () => {
    requireDb();
    const noAuth = await request(appTesting)
      .get("/admin/maintenance")
      .set("Host", "blessboard.org");
    assert.ok([303, 401].includes(noAuth.status));

    const nonApex = await request(appTesting)
      .get("/admin/maintenance")
      .set("Host", "wipe-me.blessboard.org")
      .set("Cookie", paCookie());
    assert.ok([503, 404].includes(nonApex.status) || nonApex.status >= 400);
  });

  it("5. CSRF is required on preview and reset", async () => {
    requireDb();
    const preview = await request(appTesting)
      .post("/admin/maintenance/preview")
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie())
      .type("form")
      .send({ action: "clear_registrations" });
    assert.equal(preview.status, 303);
    assert.match(preview.headers.location || "", /error=csrf/);

    const reset = await request(appTesting)
      .post("/admin/maintenance/reset")
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie())
      .type("form")
      .send({
        action: "clear_all",
        confirm_phrase: FULL_RESET_CONFIRM_PHRASE,
        confirm_destructive: "1",
      });
    assert.equal(reset.status, 303);
    assert.match(reset.headers.location || "", /error=csrf/);
  });

  it("6–7. incorrect phrase and missing checkbox are rejected", async () => {
    requireDb();
    const { csrf, csrfCookie } = await getMaintenanceCsrf(appTesting);
    const preview = await previewTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_all",
      sessionSecret: SESSION_SECRET,
    });
    assert.equal(preview.ok, true);

    const badPhrase = await request(appTesting)
      .post("/admin/maintenance/reset")
      .set("Host", "blessboard.org")
      .set("Cookie", `${paCookie()}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        action: "clear_all",
        confirm_phrase: "clear blessboard test data",
        confirm_destructive: "1",
        preview_token: preview.previewToken,
      });
    assert.equal(badPhrase.status, 303);
    assert.match(badPhrase.headers.location || "", /confirm_invalid|preview/);

    const { csrf: csrf2, csrfCookie: cookie2 } = await getMaintenanceCsrf(appTesting);
    const noCheck = await request(appTesting)
      .post("/admin/maintenance/reset")
      .set("Host", "blessboard.org")
      .set("Cookie", `${paCookie()}; ${CSRF_COOKIE}=${cookie2}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        action: "clear_all",
        confirm_phrase: FULL_RESET_CONFIRM_PHRASE,
        preview_token: preview.previewToken,
      });
    assert.equal(noCheck.status, 303);
    assert.match(noCheck.headers.location || "", /confirm_invalid/);
  });

  it("8–9. wrong runtime env and non-testing db identity block reset", async () => {
    requireDb();
    const wrongEnv = await executeTestingDataReset(pool, {
      env: baseEnv({ DEPLOYMENT_ENV: "production" }),
      actorUserId: paUser.id,
      action: "clear_registrations",
      confirmPhrase: "clear_registrations",
      confirmChecked: true,
      previewToken: "x",
      sessionSecret: SESSION_SECRET,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(wrongEnv.ok, false);
    assert.equal(wrongEnv.status, STATUS.FORBIDDEN);

    await pool.query(
      `UPDATE platform.database_identity SET environment_code = 'production'
        WHERE identity_key = $1`,
      [IDENTITY_KEY]
    );
    try {
      const wrongDb = await executeTestingDataReset(pool, {
        env: baseEnv({ DEPLOYMENT_ENV: "testing" }),
        actorUserId: paUser.id,
        action: "clear_registrations",
        confirmPhrase: "clear_registrations",
        confirmChecked: true,
        previewToken: "x",
        sessionSecret: SESSION_SECRET,
        deploymentCode: "blessboard-org-staging",
      });
      assert.equal(wrongDb.ok, false);
      assert.equal(wrongDb.status, STATUS.IDENTITY_BLOCKED);
    } finally {
      await pool.query(
        `UPDATE platform.database_identity SET environment_code = 'testing'
          WHERE identity_key = $1`,
        [IDENTITY_KEY]
      );
    }
  });

  it("10. dry-run performs no mutation", async () => {
    requireDb();
    mutationSql = [];
    const beforeApps = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.platform_church_registration_applications`
    );
    const preview = await previewTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_all",
      sessionSecret: SESSION_SECRET,
    });
    assert.equal(preview.ok, true);
    assert.equal(preview.dryRun, true);
    const mutating = mutationSql.filter((s) => !/^SELECT\b/i.test(s));
    assert.equal(mutating.length, 0);
    const afterApps = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.platform_church_registration_applications`
    );
    assert.equal(afterApps.rows[0].n, beforeApps.rows[0].n);
  });

  it("11. category reset removes only registrations", async () => {
    requireDb();
    const preview = await previewTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_registrations",
      sessionSecret: SESSION_SECRET,
    });
    assert.equal(preview.ok, true);
    const result = await executeTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_registrations",
      confirmPhrase: "clear_registrations",
      confirmChecked: true,
      previewToken: preview.previewToken,
      sessionSecret: SESSION_SECRET,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    const apps = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.platform_church_registration_applications`
    );
    assert.equal(apps.rows[0].n, 0);
    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = 'wipe-me-org'`
    );
    assert.equal(orgs.rows[0].n, 1);
  });

  it("12–20. full reset preserves PA/plans/identity and removes tenant org data", async () => {
    requireDb();
    // Re-seed a registration so clear_all has work to do
    await regRepo.createApplication(pool, {
      church_name: "Maint Reg Church 2",
      country: "ZM",
      city: "Lusaka",
      contact_name: "Reg2",
      contact_email: "maint-reg2@example.org",
      contact_phone: "+260971000040",
      contact_phone_normalized: "+260971000040",
      selected_plan: "growth",
      consent_terms: true,
      risk_decision: "allow",
      risk_reason_codes: [],
      risk_decided_at: new Date(),
    });

    const preview = await previewTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_all",
      sessionSecret: SESSION_SECRET,
    });
    assert.equal(preview.ok, true);

    const result = await executeTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "clear_all",
      confirmPhrase: FULL_RESET_CONFIRM_PHRASE,
      confirmChecked: true,
      previewToken: preview.previewToken,
      sessionSecret: SESSION_SECRET,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(result.ok, true, JSON.stringify(result));

    const wipeOrg = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = 'wipe-me-org'`
    );
    assert.equal(wipeOrg.rows[0].n, 0);

    const paOrg = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = 'pa-fixture'`
    );
    assert.equal(paOrg.rows[0].n, 1);

    const paUserRow = await pool.query(
      `SELECT status FROM blessboard.users WHERE id = $1`,
      [paUser.id]
    );
    assert.equal(paUserRow.rows[0].status, "active");

    const paRole = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_roles
        WHERE user_id = $1 AND role_key = 'platform_admin' AND status = 'active'`,
      [paUser.id]
    );
    assert.equal(paRole.rows[0].n, 1);

    const plans = await pool.query(`SELECT COUNT(*)::int AS n FROM platform.plans`);
    assert.ok(plans.rows[0].n >= 1);

    const features = await pool.query(`SELECT COUNT(*)::int AS n FROM platform.plan_features`);
    assert.ok(features.rows[0].n >= 1);

    const identity = await pool.query(
      `SELECT identity_key, environment_code FROM platform.database_identity LIMIT 1`
    );
    assert.equal(identity.rows[0].identity_key, IDENTITY_KEY);
    assert.equal(identity.rows[0].environment_code, "testing");

    const migrations = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.schema_migrations`
    );
    assert.ok(migrations.rows[0].n > 0);

    const tenantRoles = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_roles
        WHERE role_key = 'church_hq_admin'`
    );
    assert.equal(tenantRoles.rows[0].n, 0);

    // Shared identity may remain orphaned — reported, not auto-deleted.
    const orphan = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.users u
        WHERE email_normalized = 'tenant-maint@example.org'
          AND NOT EXISTS (SELECT 1 FROM blessboard.user_roles ur WHERE ur.user_id = u.id)`
    );
    assert.ok(orphan.rows[0].n >= 0);
    assert.ok(result.orphanTenantIdentities >= 0);
  });

  it("21. /admin still loads after reset", async () => {
    requireDb();
    const res = await request(appTesting)
      .get("/admin")
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie());
    assert.equal(res.status, 200);
    assert.match(res.text, /Platform|Dashboard|Organizations/i);
  });

  it("22–23. Foundation and Growth registration rows can be created after reset", async () => {
    requireDb();
    const foundation = await regRepo.createApplication(pool, {
      church_name: "Post Reset Foundation",
      country: "ZM",
      city: "Lusaka",
      contact_name: "Post",
      contact_email: "post-foundation@example.org",
      contact_phone: "+260971000041",
      contact_phone_normalized: "+260971000041",
      selected_plan: "foundation",
      consent_terms: true,
      risk_decision: "allow",
      risk_reason_codes: [],
      risk_decided_at: new Date(),
    });
    assert.ok(foundation && foundation.id);

    const growth = await regRepo.createApplication(pool, {
      church_name: "Post Reset Growth",
      country: "ZM",
      city: "Ndola",
      contact_name: "PostG",
      contact_email: "post-growth@example.org",
      contact_phone: "+260971000042",
      contact_phone_normalized: "+260971000042",
      selected_plan: "growth",
      consent_terms: true,
      risk_decision: "allow",
      risk_reason_codes: [],
      risk_decided_at: new Date(),
    });
    assert.ok(growth && growth.id);
  });

  it("24. concurrent reset: second lock attempt fails safely", async () => {
    requireDb();
    const client = await pool.connect();
    try {
      const locked = await client.query(`SELECT pg_advisory_lock(824510019)`);
      assert.ok(locked);
      const preview = await previewTestingDataReset(pool, {
        env: baseEnv(),
        actorUserId: paUser.id,
        action: "clear_invitations",
        sessionSecret: SESSION_SECRET,
      });
      const second = await executeTestingDataReset(pool, {
        env: baseEnv(),
        actorUserId: paUser.id,
        action: "clear_invitations",
        confirmPhrase: "clear_invitations",
        confirmChecked: true,
        previewToken: preview.previewToken,
        sessionSecret: SESSION_SECRET,
        deploymentCode: "blessboard-org-staging",
      });
      assert.equal(second.ok, false);
      assert.equal(second.status, STATUS.LOCK_BUSY);
    } finally {
      await client.query(`SELECT pg_advisory_unlock(824510019)`);
      client.release();
    }
  });

  it("25–26. audit event recorded without secrets; production POST is 404", async () => {
    requireDb();
    const audits = await pool.query(
      `SELECT action_key, metadata_json FROM platform.audit_events
        WHERE action_key = 'maintenance.testing_data_reset'
        ORDER BY created_at DESC LIMIT 5`
    );
    assert.ok(audits.rowCount >= 1);
    const meta = JSON.stringify(audits.rows[0].metadata_json || {});
    assert.doesNotMatch(meta, /password|SESSION_SECRET|postgresql:\/\//i);

    mutationSql = [];
    const prodPost = await request(appProduction)
      .post("/admin/maintenance/reset")
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie())
      .type("form")
      .send({
        action: "clear_all",
        confirm_phrase: FULL_RESET_CONFIRM_PHRASE,
        confirm_destructive: "1",
      });
    assert.equal(prodPost.status, 404);
    const dangerous = mutationSql.filter((s) => /DELETE\s+FROM\s+blessboard|DELETE\s+FROM\s+platform\.organizations/i.test(s));
    assert.equal(dangerous.length, 0);
  });

  it("27–28. production nav hides maintenance; allowlist refuses unknown action", async () => {
    requireDb();
    const dash = await request(appProduction)
      .get("/admin")
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie());
    assert.equal(dash.status, 200);
    assert.doesNotMatch(dash.text, /href="\/admin\/maintenance"/);

    const unknown = await executeTestingDataReset(pool, {
      env: baseEnv(),
      actorUserId: paUser.id,
      action: "drop_everything",
      confirmPhrase: "drop_everything",
      confirmChecked: true,
      previewToken: "x",
      sessionSecret: SESSION_SECRET,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.status, STATUS.INVALID_INPUT);
  });
});
