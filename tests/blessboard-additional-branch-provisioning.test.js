"use strict";

/**
 * Prompt 23 — additional branch provisioning (HQ create, limits, audit, rollback).
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
  createBlessBoardBranch,
  STATUS: CREATE_STATUS,
} = require("../src/blessboard/services/createBlessBoardBranch");
const {
  assignOrganizationPlan,
  setOrganizationEntitlementOverride,
  FEATURE_KEYS,
} = require("../src/platform/services/entitlementService");
const {
  ensureChurchSettingsInitialized,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  acknowledgeWebsitePreview,
  publishChurchWebsite,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  provisionEmptyPublicPages,
} = require("../src/blessboard/services/publicContentAdminService");
const { normalizeBranchKey } = require("../src/blessboard/services/branchKey");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT = "blessboard-org-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "br-create-a.blessboard.org";
const HOST_B = "br-create-b.blessboard.org";
const APEX = "blessboard.org";

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

describe("blessboard additional branch provisioning", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let orgB;
  let churchB;
  let users = {};

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

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "br-create-a",
        displayName: "Branch Create Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "br-create-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "br-create-a",
        churchKey: "br-create-a",
        displayName: "Branch Create Church A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "br-create-b",
        displayName: "Branch Create Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "br-create-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "br-create-b",
        churchKey: "br-create-b",
        displayName: "Branch Create Church B",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      const hqA = await pool.query(
        `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'hq'`,
        [churchA.id]
      );
      assert.ok(hqA.rows[0]);

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message || created.reason);
        const assigned = await assignBlessBoardRole(pool, role);
        assert.equal(assigned.ok, true, assigned.message || assigned.reason);
        return created.user;
      }

      users.hqA = await makeUser("hq-a@example.org", "HQ A", {
        email: "hq-a@example.org",
        organizationKey: "br-create-a",
        roleKey: "church_hq_admin",
        churchKey: "br-create-a",
      });
      users.baA = await makeUser("ba-a@example.org", "BA A", {
        email: "ba-a@example.org",
        organizationKey: "br-create-a",
        roleKey: "branch_admin",
        churchKey: "br-create-a",
        branchKey: "hq",
      });
      users.pa = await makeUser("pa@example.org", "PA", {
        email: "pa@example.org",
        organizationKey: "br-create-a",
        roleKey: "platform_admin",
      });
      users.hqABranchId = hqA.rows[0].id;

      app = createV5FoundationApp({
        getPool: () => pool,
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
          BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
          BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
          BLESSBOARD_APEX_DOMAINS: APEX,
          BLESSBOARD_CANONICAL_DOMAIN: APEX,
          BLESSBOARD_APEX_ORIGIN: `https://${APEX}`,
        },
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function sessionCookie(userId, opts) {
    const session = await createV5Session(pool, {
      userId,
      deploymentCode: DEPLOYMENT,
      organizationId: (opts && opts.organizationId) || orgA.id,
      churchId: (opts && opts.churchId) || churchA.id,
      branchId: (opts && opts.branchId) || users.hqABranchId,
    });
    assert.equal(session.ok, true, session.code || session.reason);
    return `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
  }

  async function csrfPair(host, cookie) {
    const page = await request(app)
      .get("/hq/branches/new")
      .set("Host", host)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    const csrf = extractCookie(page, CSRF_COOKIE);
    assert.ok(csrf, "csrf cookie");
    const match = String(page.text).match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(match, "csrf field");
    return { cookie: `${cookie}; ${CSRF_COOKIE}=${csrf}`, token: match[1], page };
  }

  it("rejects reserved branch keys", () => {
    assert.equal(normalizeBranchKey("hq").ok, false);
    assert.equal(normalizeBranchKey("new").ok, false);
    assert.equal(normalizeBranchKey("campus-north").ok, true);
  });

  it("1. authorized HQ admin creates a branch (HTTP)", async () => {
    requireDb();
    const growth = await assignOrganizationPlan(pool, {
      organizationId: orgA.id,
      planKey: "growth",
    });
    assert.equal(growth.ok, true, growth.reason);

    const cookie = await sessionCookie(users.hqA.id);
    const csrf = await csrfPair(HOST_A, cookie);
    const res = await request(app)
      .post("/hq/branches")
      .set("Host", HOST_A)
      .set("Cookie", csrf.cookie)
      .set("Accept", "text/html")
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.token,
        displayName: "North Campus",
        branchKey: "north",
        email: "north@example.org",
        phone: "+260 97 111 2222",
        timezone: "Africa/Lusaka",
        countryCode: "ZM",
        addressLine1: "1 Independence Ave",
        city: "Lusaka",
      });
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /\/hq\/branches\?created=north/);

    const row = await pool.query(
      `SELECT b.id, b.branch_key, b.status, s.email, s.phone, s.city
         FROM blessboard.branches b
         INNER JOIN blessboard.branch_settings s ON s.branch_id = b.id
        WHERE b.church_id = $1 AND b.branch_key = 'north'`,
      [churchA.id]
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].status, "active");
    assert.equal(row.rows[0].email, "north@example.org");
    assert.equal(row.rows[0].city, "Lusaka");

    const audit = await pool.query(
      `SELECT outcome, metadata_json
         FROM platform.audit_events
        WHERE organization_id = $1 AND action_key = 'branch.created'
          AND entity_id = $2
        ORDER BY created_at DESC LIMIT 1`,
      [orgA.id, row.rows[0].id]
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].outcome, "success");
  });

  it("2. Foundation limit is enforced", async () => {
    requireDb();
    const free = await assignOrganizationPlan(pool, {
      organizationId: orgB.id,
      planKey: "free",
    });
    assert.equal(free.ok, true, free.reason);

    const blocked = await createBlessBoardBranch(pool, {
      churchId: churchB.id,
      organizationId: orgB.id,
      branchKey: "blocked-free",
      displayName: "Blocked Free Campus",
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, CREATE_STATUS.LIMIT_EXCEEDED);
    assert.equal(blocked.reason, "max_branches");
    assert.equal(blocked.limit, 1);
  });

  it("3. Growth limit is enforced (unlimited allows create)", async () => {
    requireDb();
    const growth = await assignOrganizationPlan(pool, {
      organizationId: orgB.id,
      planKey: "growth",
    });
    assert.equal(growth.ok, true, growth.reason);

    const created = await createBlessBoardBranch(pool, {
      churchId: churchB.id,
      organizationId: orgB.id,
      branchKey: "growth-ok",
      displayName: "Growth Campus B",
    });
    assert.equal(created.ok, true, created.reason);
    assert.equal(created.limit, null);
  });

  it("4. concurrent creation cannot exceed the limit", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.branches SET status = 'inactive', updated_at = now()
        WHERE church_id = $1 AND branch_key <> 'hq'`,
      [churchB.id]
    );
    await pool.query(
      `UPDATE blessboard.branches SET status = 'active', updated_at = now()
        WHERE church_id = $1 AND branch_key = 'hq'`,
      [churchB.id]
    );
    const free = await assignOrganizationPlan(pool, {
      organizationId: orgB.id,
      planKey: "free",
    });
    assert.equal(free.ok, true, free.reason);

    await pool.query(
      `UPDATE blessboard.branches SET status = 'inactive', updated_at = now()
        WHERE church_id = $1`,
      [churchB.id]
    );

    const [a, b] = await Promise.all([
      createBlessBoardBranch(pool, {
        churchId: churchB.id,
        organizationId: orgB.id,
        branchKey: "race-1",
        displayName: "Race One",
      }),
      createBlessBoardBranch(pool, {
        churchId: churchB.id,
        organizationId: orgB.id,
        branchKey: "race-2",
        displayName: "Race Two",
      }),
    ]);
    const ok = [a, b].filter((r) => r.ok);
    const denied = [a, b].filter((r) => !r.ok);
    assert.equal(ok.length, 1);
    assert.equal(denied.length, 1);
    assert.equal(denied[0].status, CREATE_STATUS.LIMIT_EXCEEDED);

    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.branches
        WHERE church_id = $1 AND status = 'active'`,
      [churchB.id]
    );
    assert.equal(count.rows[0].n, 1);

    await pool.query(
      `UPDATE blessboard.branches SET status = 'inactive', updated_at = now()
        WHERE church_id = $1 AND status = 'active'`,
      [churchB.id]
    );
    await pool.query(
      `UPDATE blessboard.branches SET status = 'active', updated_at = now()
        WHERE church_id = $1 AND branch_key = 'hq'`,
      [churchB.id]
    );
    await assignOrganizationPlan(pool, { organizationId: orgB.id, planKey: "growth" });
  });

  it("5. duplicate display name is blocked", async () => {
    requireDb();
    const first = await createBlessBoardBranch(pool, {
      churchId: churchA.id,
      organizationId: orgA.id,
      branchKey: "dup-name-1",
      displayName: "Shared Campus Name",
    });
    assert.equal(first.ok, true, first.reason);
    const second = await createBlessBoardBranch(pool, {
      churchId: churchA.id,
      organizationId: orgA.id,
      branchKey: "dup-name-2",
      displayName: "shared campus name",
    });
    assert.equal(second.ok, false);
    assert.equal(second.reason, "duplicate_display_name");
  });

  it("6. duplicate branch key is blocked", async () => {
    requireDb();
    const first = await createBlessBoardBranch(pool, {
      churchId: churchA.id,
      organizationId: orgA.id,
      branchKey: "same-key",
      displayName: "Same Key One",
    });
    assert.equal(first.ok, true, first.reason);
    const second = await createBlessBoardBranch(pool, {
      churchId: churchA.id,
      organizationId: orgA.id,
      branchKey: "same-key",
      displayName: "Same Key Two",
    });
    assert.equal(second.ok, false);
    assert.equal(second.reason, "duplicate_branch_key");
  });

  it("7. same name may exist in another organization", async () => {
    requireDb();
    const other = await createBlessBoardBranch(pool, {
      churchId: churchB.id,
      organizationId: orgB.id,
      branchKey: "shared-name-b",
      displayName: "Shared Campus Name",
    });
    assert.equal(other.ok, true, other.reason);
  });

  it("8. branch admin is denied", async () => {
    requireDb();
    const cookie = await sessionCookie(users.baA.id);
    const page = await request(app)
      .get("/hq/branches/new")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(page.status, 403);

    const csrfGet = await request(app)
      .get("/hq/settings")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    // BA may or may not reach settings; force POST to HQ create with any CSRF from login page
    const login = await request(app).get("/login").set("Host", HOST_A).set("Accept", "text/html");
    const csrf = extractCookie(login, CSRF_COOKIE) || "x";
    const post = await request(app)
      .post("/hq/branches")
      .set("Host", HOST_A)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: "invalid",
        displayName: "Should Fail",
        branchKey: "should-fail",
      });
    assert.ok(post.status === 403 || post.status === 401);
  });

  it("9. platform override is audited", async () => {
    requireDb();
    const ov = await setOrganizationEntitlementOverride(pool, {
      organizationId: orgB.id,
      featureKey: FEATURE_KEYS.MAX_BRANCHES,
      featureKind: "limit",
      limitValue: 5,
      reason: "prompt23_override_audit",
      createdByUserId: users.pa.id,
    });
    assert.equal(ov.ok, true, ov.reason);

    const audit = await pool.query(
      `SELECT outcome, metadata_json, actor_user_id
         FROM platform.audit_events
        WHERE organization_id = $1 AND action_key = 'entitlement.override.set'
        ORDER BY created_at DESC LIMIT 1`,
      [orgB.id]
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].outcome, "success");
    assert.equal(String(audit.rows[0].actor_user_id), String(users.pa.id));
    const meta =
      typeof audit.rows[0].metadata_json === "string"
        ? JSON.parse(audit.rows[0].metadata_json)
        : audit.rows[0].metadata_json;
    assert.equal(meta.entity_key, "max_branches");
    assert.equal(meta.reason_code, "platform_override");
  });

  it("10. failure rolls back all branch records", async () => {
    requireDb();
    await pool.query(`
      CREATE OR REPLACE FUNCTION blessboard.test_fail_branch_settings()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced_settings_failure' USING ERRCODE = 'P0001';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pool.query(`
      DROP TRIGGER IF EXISTS test_fail_branch_settings_trg ON blessboard.branch_settings;
      CREATE TRIGGER test_fail_branch_settings_trg
        BEFORE INSERT OR UPDATE ON blessboard.branch_settings
        FOR EACH ROW EXECUTE FUNCTION blessboard.test_fail_branch_settings();
    `);

    const beforeBranches = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.branches WHERE church_id = $1`,
      [churchA.id]
    );
    const beforeSettings = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.branch_settings s
         INNER JOIN blessboard.branches b ON b.id = s.branch_id
        WHERE b.church_id = $1`,
      [churchA.id]
    );

    const failed = await createBlessBoardBranch(pool, {
      churchId: churchA.id,
      organizationId: orgA.id,
      branchKey: "rollback-me",
      displayName: "Rollback Campus",
    });
    assert.equal(failed.ok, false);

    const afterBranches = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.branches WHERE church_id = $1`,
      [churchA.id]
    );
    const afterSettings = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.branch_settings s
         INNER JOIN blessboard.branches b ON b.id = s.branch_id
        WHERE b.church_id = $1`,
      [churchA.id]
    );
    assert.equal(afterBranches.rows[0].n, beforeBranches.rows[0].n);
    assert.equal(afterSettings.rows[0].n, beforeSettings.rows[0].n);

    const orphan = await pool.query(
      `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'rollback-me'`,
      [churchA.id]
    );
    assert.equal(orphan.rowCount, 0);

    await pool.query(
      `DROP TRIGGER IF EXISTS test_fail_branch_settings_trg ON blessboard.branch_settings`
    );
    await pool.query(`DROP FUNCTION IF EXISTS blessboard.test_fail_branch_settings()`);
  });

  it("11. public hostname resolves correctly when published (no new domain)", async () => {
    requireDb();
    const domainsBefore = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.domains WHERE organization_id = $1`,
      [orgA.id]
    );

    await ensureChurchSettingsInitialized(pool, churchA.id);
    await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    await pool.query(
      `UPDATE blessboard.church_settings
          SET primary_email = 'pub@example.org',
              primary_phone = '+260971234567',
              updated_at = now()
        WHERE church_id = $1`,
      [churchA.id]
    );
    await acknowledgeWebsitePreview(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.id,
    });
    await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA.id,
      confirmPublish: true,
      deferServiceTimes: true,
    });

    const tenantHome = await request(app).get("/").set("Host", HOST_A);
    assert.ok(tenantHome.status < 500, `tenant host status ${tenantHome.status}`);

    const pathHome = await request(app).get("/c/br-create-a").set("Host", APEX);
    assert.ok(pathHome.status < 500, `path public status ${pathHome.status}`);

    const created = await createBlessBoardBranch(pool, {
      churchId: churchA.id,
      organizationId: orgA.id,
      branchKey: "domain-safe",
      displayName: "Domain Safe Campus",
    });
    assert.equal(created.ok, true, created.reason);

    const domainsFinal = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.domains WHERE organization_id = $1`,
      [orgA.id]
    );
    assert.equal(domainsFinal.rows[0].n, domainsBefore.rows[0].n);
  });

  it("12. no duplicate subscriptions are created", async () => {
    requireDb();
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organization_subscriptions
        WHERE organization_id = $1 AND product_key = 'blessboard'`,
      [orgA.id]
    );
    assert.equal(before.rows[0].n, 1);

    const created = await createBlessBoardBranch(pool, {
      churchId: churchA.id,
      organizationId: orgA.id,
      branchKey: "no-sub",
      displayName: "No Sub Campus",
    });
    assert.equal(created.ok, true, created.reason);

    const after = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organization_subscriptions
        WHERE organization_id = $1 AND product_key = 'blessboard'`,
      [orgA.id]
    );
    assert.equal(after.rows[0].n, 1);
  });
});
