"use strict";

/**
 * BlessBoard CSRF cookie issuance must follow app env + req.platform,
 * not a conflicting process.env.PLATFORM_DEPLOYMENT_CODE.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const bcrypt = require("bcryptjs");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  provisionPlatformTenant,
} = require("../src/platform/services/provisionPlatformTenant");
const {
  provisionBlessBoardChurch,
} = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createV5Session } = require("../src/platform/session/createV5Session");
const {
  createMoovexPlatformRuntimeApp,
  buildDefaultProductApps,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const { getCsrfCookieName, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  getV5SessionCookieName,
} = require("../src/platform/session/v5SessionCookie");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_ORG_STAGING,
  COOKIE_ORG,
  CSRF_COOKIE_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const IDENTITY_KEY = "moovex-platform-v7";
const UNIFIED_SID = "moovex_platform_testing_sid";
const UNIFIED_CSRF = "moovex_platform_testing_csrf";
const BB_HOST = "blessboard.pronline.org";
const TENANT_HOST = "demo-church.blessboard.pronline.org";
const PASSWORD = "1234567890";
const QA_EMAIL = "qa.csrf.hq@demo-church.example.test";

const UNIFIED_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
});

const PROCESS_KEYS = ["PLATFORM_DEPLOYMENT_CODE", "DEPLOYMENT_ENV"];

function withProcessEnv(overrides, fn) {
  const prev = {};
  for (const key of PROCESS_KEYS) {
    prev[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  const restore = () => {
    for (const key of PROCESS_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") return result.finally(restore);
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

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

function setCookieNames(res) {
  return [].concat(res.headers["set-cookie"] || []).map((line) => String(line).split("=")[0]);
}

function csrfField(html) {
  const match = String(html || "").match(/name="_csrf" value="([^"]+)"/);
  return match ? match[1] : null;
}

describe("BlessBoard CSRF request-scoped configuration", () => {
  let pool;
  let app;
  let tenantApp;
  let skipReason = null;
  let orgId;
  let churchId;
  let branchId;
  let hqUserId;
  let branchUserId;
  let memberUserId;

  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      await pool.query(
        `INSERT INTO platform.deployments (
           deployment_code, application_code, release_version, canonical_domain,
           environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
         ) VALUES (
           $1, 'platform', 'v7', 'pronline.org',
           'testing', 'active', false, 'read_write', 'moovex_platform_testing_sid'
         )
         ON CONFLICT (deployment_code) DO UPDATE SET
           status = 'active',
           application_code = 'platform',
           session_cookie_name = EXCLUDED.session_cookie_name,
           updated_at = now()`,
        [CODE_MOOVEX_PLATFORM_TESTING]
      );
      const prov = await provisionPlatformTenant(pool, {
        organizationKey: "demo-church",
        displayName: "Demo Church",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "demo-church",
        hostname: TENANT_HOST,
        domainType: "canonical",
        deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message || prov.code);
      orgId = prov.records.organization.id;
      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "demo-church",
        churchKey: "demo-church",
        displayName: "Demo Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
        countryCode: "ZM",
      });
      assert.equal(ch.ok, true, ch.message || ch.code);
      churchId = ch.records.church.id;
      branchId = ch.records.hqBranch.id;
      const hash = await bcrypt.hash(PASSWORD, 4);
      const hq = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status)
         VALUES ($1, $1, 'HQ Admin', $2, 'active')
         RETURNING id`,
        [QA_EMAIL, hash]
      );
      hqUserId = hq.rows[0].id;
      await pool.query(
        `INSERT INTO blessboard.user_roles
           (user_id, organization_id, church_id, role_key, status)
         VALUES ($1, $2, $3, 'church_hq_admin', 'active')`,
        [hqUserId, orgId, churchId]
      );
      const ba = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status)
         VALUES ('ba.csrf@demo-church.example.test', 'ba.csrf@demo-church.example.test',
                 'Branch Admin', $1, 'active')
         RETURNING id`,
        [hash]
      );
      branchUserId = ba.rows[0].id;
      await pool.query(
        `INSERT INTO blessboard.user_roles
           (user_id, organization_id, church_id, branch_id, role_key, status)
         VALUES ($1, $2, $3, $4, 'branch_admin', 'active')`,
        [branchUserId, orgId, churchId, branchId]
      );
      const mem = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status)
         VALUES ('member.csrf@demo-church.example.test', 'member.csrf@demo-church.example.test',
                 'Member', $1, 'active')
         RETURNING id`,
        [hash]
      );
      memberUserId = mem.rows[0].id;
      const memberRow = await pool.query(
        `INSERT INTO blessboard.members
           (church_id, user_id, first_name, last_name, preferred_name, email_normalized, email_display, status)
         VALUES ($1, $2, 'Member', 'Csrf', 'Member',
                 'member.csrf@demo-church.example.test', 'member.csrf@demo-church.example.test', 'active')
         RETURNING id`,
        [churchId, memberUserId]
      );
      await pool.query(
        `INSERT INTO blessboard.member_branch_memberships
           (member_id, branch_id, membership_status, is_primary, joined_at)
         VALUES ($1, $2, 'active', true, now())`,
        [memberRow.rows[0].id, branchId]
      );

      const productApps = buildDefaultProductApps({
        env: UNIFIED_ENV,
        getPool: () => pool,
      });
      app = createMoovexPlatformRuntimeApp({
        env: UNIFIED_ENV,
        getPool: () => pool,
        productApps,
      });
      tenantApp = productApps.blessboard;
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function sessionCookie(userId) {
    const created = await createV5Session(pool, {
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      userId,
      organizationId: orgId,
      churchId,
      branchId,
    });
    assert.equal(created.ok, true, created.code);
    return `${UNIFIED_SID}=${created.rawToken}`;
  }

  function assertUnifiedCsrfCookie(res) {
    assert.ok(extractCookie(res, UNIFIED_CSRF), `missing ${UNIFIED_CSRF}`);
    assert.equal(setCookieNames(res).includes(CSRF_COOKIE_ORG), false);
    assert.equal(getCsrfCookieName(UNIFIED_ENV), UNIFIED_CSRF);
  }

  async function assertFormAndPost(processOverrides, getOpts, postFn) {
    const target = getOpts.app || app;
    return withProcessEnv(processOverrides, async () => {
      const getRes = await request(target)
        .get(getOpts.path)
        .set("Host", getOpts.host)
        .set("Accept", "text/html")
        .set("Cookie", getOpts.cookie || "");
      assert.equal(getRes.status, getOpts.getStatus || 200, `GET ${getOpts.path} ${getRes.status}`);
      const token = csrfField(getRes.text) || extractCookie(getRes, UNIFIED_CSRF);
      assert.ok(token, `CSRF token missing on ${getOpts.path}`);
      assertUnifiedCsrfCookie(getRes);
      const cookie = `${getOpts.cookie ? `${getOpts.cookie}; ` : ""}${UNIFIED_CSRF}=${extractCookie(getRes, UNIFIED_CSRF)}`;
      return postFn({ token, cookie, getRes, target });
    });
  }

  const matrices = [
    ["A present", { PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING, DEPLOYMENT_ENV: "testing" }],
    ["B absent", {}],
    ["C wrong", { PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING }],
  ];

  it("Test 3: password reset form cookie follows app env under wrong process env", async () => {
    requireDb();
    await assertFormAndPost(
      { PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING },
      { path: "/forgot-password", host: BB_HOST },
      async ({ token, cookie }) => {
        const post = await request(app)
          .post("/forgot-password")
          .set("Host", BB_HOST)
          .set("Cookie", cookie)
          .type("form")
          .send({ [CSRF_FIELD]: token, email: "reset@example.test" });
        assert.notEqual(post.status, 403);
        assert.equal(post.status, 200);
      }
    );
  });

  it("Test 5: apex register-church CSRF cookie and POST", async () => {
    requireDb();
    await assertFormAndPost(
      { PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING },
      { path: "/register-church", host: BB_HOST },
      async ({ token, cookie }) => {
        const post = await request(app)
          .post("/register-church")
          .set("Host", BB_HOST)
          .set("Cookie", cookie)
          .type("form")
          .send({
            [CSRF_FIELD]: token,
            church_name: "CSRF Test Church",
            contact_name: "CSRF Tester",
            email: `csrf-reg-${Date.now()}@example.test`,
            selected_plan: "foundation",
            consent_contact: "on",
          });
        assert.notEqual(post.status, 403);
      }
    );
  });

  it("Test 6: invite accept CSRF cookie; POST is not a CSRF 403", async () => {
    requireDb();
    await assertFormAndPost(
      { PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING },
      { path: "/invite/accept", host: BB_HOST, getStatus: 400 },
      async ({ token, cookie }) => {
        const post = await request(app)
          .post("/invite/accept")
          .set("Host", BB_HOST)
          .set("Cookie", cookie)
          .type("form")
          .send({ [CSRF_FIELD]: token, token: "", password: "abcdefghij" });
        assert.notEqual(post.status, 403, `invite CSRF rejected ${post.status}`);
      }
    );
  });

  it("Test 4: tenant registration CSRF cookie and POST", async () => {
    requireDb();
    await assertFormAndPost(
      { PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING },
      { path: "/register", host: TENANT_HOST, app: tenantApp },
      async ({ token, cookie, target }) => {
        const post = await request(target)
          .post("/register")
          .set("Host", TENANT_HOST)
          .set("Cookie", cookie)
          .type("form")
          .send({
            [CSRF_FIELD]: token,
            first_name: "Csrf",
            last_name: "Member",
            email: `csrf-member-${Date.now()}@example.test`,
          });
        assert.notEqual(post.status, 403);
      }
    );
  });

  it("Test 1: member profile form CSRF cookie and POST", async () => {
    requireDb();
    const sid = await sessionCookie(memberUserId);
    await assertFormAndPost(
      { PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING },
      { path: "/member/profile", host: TENANT_HOST, cookie: sid, app: tenantApp },
      async ({ token, cookie, target }) => {
        const post = await request(target)
          .post("/member/profile")
          .set("Host", TENANT_HOST)
          .set("Accept", "text/html")
          .set("Cookie", cookie)
          .type("form")
          .send({ [CSRF_FIELD]: token, preferredName: "Member Updated" });
        assert.notEqual(post.status, 403);
        assert.ok([200, 303].includes(post.status), `member profile ${post.status}`);
      }
    );
  });

  it("Test 2: branch admin form CSRF cookie and POST logout", async () => {
    requireDb();
    const sid = await sessionCookie(branchUserId);
    await assertFormAndPost(
      { PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING },
      { path: "/branch-admin", host: TENANT_HOST, cookie: sid, app: tenantApp },
      async ({ token, cookie, target }) => {
        const post = await request(target)
          .post("/branch-admin/logout")
          .set("Host", TENANT_HOST)
          .set("Cookie", cookie)
          .type("form")
          .send({ [CSRF_FIELD]: token });
        assert.equal(post.status, 303);
        assert.equal(post.headers.location, "/login");
        const names = setCookieNames(post);
        assert.ok(names.includes(UNIFIED_SID));
        assert.equal(names.includes(COOKIE_ORG), false);
        assert.ok(names.includes(UNIFIED_CSRF));
        assert.equal(names.includes(CSRF_COOKIE_ORG), false);
      }
    );
  });

  for (const [label, overrides] of matrices) {
    it(`Matrix ${label}: forgot-password CSRF cookie name stays unified`, async () => {
      requireDb();
      await withProcessEnv(overrides, async () => {
        const res = await request(app).get("/forgot-password").set("Host", BB_HOST);
        assert.equal(res.status, 200);
        assert.ok(csrfField(res.text));
        assertUnifiedCsrfCookie(res);
      });
    });

    it(`Matrix ${label}: tenant /register CSRF cookie name stays unified`, async () => {
      requireDb();
      await withProcessEnv(overrides, async () => {
        const res = await request(tenantApp).get("/register").set("Host", TENANT_HOST);
        assert.equal(res.status, 200);
        assert.ok(csrfField(res.text));
        assertUnifiedCsrfCookie(res);
      });
    });
  }

  it("HQ logout clears the unified session cookie under wrong process env", async () => {
    requireDb();
    const created = await createV5Session(pool, {
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      userId: hqUserId,
      organizationId: orgId,
      churchId,
      branchId,
    });
    assert.equal(created.ok, true, created.code);
    await withProcessEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING }, async () => {
      const page = await request(app)
        .get("/hq")
        .set("Host", BB_HOST)
        .set("Accept", "text/html")
        .set("Cookie", `${UNIFIED_SID}=${created.rawToken}`);
      assert.equal(page.status, 200);
      const token = csrfField(page.text);
      const csrf = extractCookie(page, UNIFIED_CSRF);
      assert.ok(token && csrf);
      const logout = await request(app)
        .post("/hq/logout")
        .set("Host", BB_HOST)
        .set("Cookie", `${UNIFIED_SID}=${created.rawToken}; ${UNIFIED_CSRF}=${csrf}`)
        .type("form")
        .send({ [CSRF_FIELD]: token });
      assert.equal(logout.status, 303);
      const names = setCookieNames(logout);
      assert.ok(names.includes(UNIFIED_SID));
      assert.equal(names.includes(COOKIE_ORG), false);
      const revoked = await pool.query(
        `SELECT revoked_at FROM platform.deployment_sessions WHERE session_token_hash IN (
           SELECT session_token_hash FROM platform.deployment_sessions
            WHERE user_id = $1
            ORDER BY created_at DESC LIMIT 1
         )`,
        [hqUserId]
      );
      assert.ok(revoked.rows[0] && revoked.rows[0].revoked_at);
    });
  });

  it("member logout clears unified cookies under wrong process env", async () => {
    requireDb();
    const sid = await sessionCookie(memberUserId);
    await assertFormAndPost(
      { PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING },
      { path: "/member/profile", host: TENANT_HOST, cookie: sid, app: tenantApp },
      async ({ token, cookie, target }) => {
        const post = await request(target)
          .post("/member/logout")
          .set("Host", TENANT_HOST)
          .set("Cookie", cookie)
          .type("form")
          .send({ [CSRF_FIELD]: token });
        assert.equal(post.status, 303);
        const names = setCookieNames(post);
        assert.ok(names.includes(UNIFIED_SID));
        assert.ok(names.includes(UNIFIED_CSRF));
        assert.equal(names.includes(COOKIE_ORG), false);
        assert.equal(names.includes(CSRF_COOKIE_ORG), false);
        const revoked = await pool.query(
          `SELECT revoked_at FROM platform.deployment_sessions
            WHERE user_id = $1
            ORDER BY created_at DESC LIMIT 1`,
          [memberUserId]
        );
        assert.ok(revoked.rows[0] && revoked.rows[0].revoked_at);
      }
    );
  });

  it("tenant /logout clears the unified session cookie under wrong process env", async () => {
    requireDb();
    const sid = await sessionCookie(memberUserId);
    await withProcessEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING }, async () => {
      const page = await request(tenantApp)
        .get("/account")
        .set("Host", TENANT_HOST)
        .set("Accept", "text/html")
        .set("Cookie", sid);
      assert.equal(page.status, 200);
      const token = csrfField(page.text);
      const csrf = extractCookie(page, UNIFIED_CSRF);
      assert.ok(token && csrf);
      const logout = await request(tenantApp)
        .post("/logout")
        .set("Host", TENANT_HOST)
        .set("Cookie", `${sid}; ${UNIFIED_CSRF}=${csrf}`)
        .type("form")
        .send({ [CSRF_FIELD]: token });
      assert.equal(logout.status, 303);
      const names = setCookieNames(logout);
      assert.ok(names.includes(UNIFIED_SID));
      assert.ok(names.includes(UNIFIED_CSRF));
      assert.equal(names.includes(COOKIE_ORG), false);
      assert.equal(names.includes(CSRF_COOKIE_ORG), false);
    });
  });
});
