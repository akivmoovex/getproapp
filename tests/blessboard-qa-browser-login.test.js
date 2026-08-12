"use strict";

/**
 * BlessBoard QA browser login — reproduces apex POST /login under
 * moovex-platform-testing + blessboard.pronline.org (real HTTP path).
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
} = require("../src/platform/config/deploymentProfiles");
const {
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const IDENTITY_KEY = "moovex-platform-v7";
const DEPLOYMENT = CODE_MOOVEX_PLATFORM_TESTING;
const PASSWORD = "1234567890";
const QA_EMAIL = "qa.finance_officer@demo-church.example.test";
const QA_PHONE = "+260971000008";
const BB_HOST = "blessboard.pronline.org";
const AC_HOST = "activeclinic.pronline.org";

const ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
  DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
});

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

describe("blessboard QA browser login (moovex-platform-testing)", () => {
  let pool;
  let app;
  let skipSuite = false;
  let skipReason = "";
  let csrfCookieName;
  let sessionCookieName;

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
           session_cookie_name = EXCLUDED.session_cookie_name,
           updated_at = now()`,
        [DEPLOYMENT]
      );

      const prov = await provisionPlatformTenant(pool, {
        organizationKey: "demo-church",
        displayName: "Demo Church",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "demo-church",
        hostname: "demo-church.blessboard.pronline.org",
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message || prov.code);
      const org = prov.records.organization;

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
      const church = ch.records.church;

      const hash = await bcrypt.hash(PASSWORD, 4);
      const user = await pool.query(
        `INSERT INTO blessboard.users
           (email_normalized, email_display, display_name, password_hash, status,
            phone_normalized, phone_display)
         VALUES ($1, $1, 'QA Finance Officer', $2, 'active', $3, '0971000008')
         RETURNING id`,
        [QA_EMAIL, hash, QA_PHONE]
      );
      await pool.query(
        `INSERT INTO blessboard.user_roles
           (user_id, organization_id, church_id, role_key, status)
         VALUES ($1, $2, $3, 'church_hq_admin', 'active')`,
        [user.rows[0].id, org.id, church.id]
      );

      const productApps = buildDefaultProductApps({
        env: ENV,
        getPool: () => pool,
      });
      app = createMoovexPlatformRuntimeApp({
        env: ENV,
        getPool: () => pool,
        productApps,
      });
      csrfCookieName = getCsrfCookieName(ENV);
      sessionCookieName = getV5SessionCookieName(ENV);
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

  async function postLogin(host, identifier, password) {
    const getLogin = await request(app).get("/login").set("Host", host);
    assert.equal(getLogin.status, 200, `GET /login on ${host}`);
    const csrfCookie = extractCookie(getLogin, csrfCookieName);
    assert.ok(csrfCookie, `csrf cookie ${csrfCookieName}`);
    const match = getLogin.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(match, "csrf field");
    const res = await request(app)
      .post("/login")
      .set("Host", host)
      .set("Cookie", `${csrfCookieName}=${csrfCookie}`)
      .set("Accept", "text/html")
      .type("form")
      .send({
        [CSRF_FIELD]: match[1],
        email: identifier,
        password,
      });
    return res;
  }

  it("email login creates session cookie that authenticates the follow-up /hq request", async () => {
    requireDb();
    const res = await postLogin(BB_HOST, QA_EMAIL, PASSWORD);
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/hq");
    const sid = extractCookie(res, sessionCookieName);
    assert.ok(sid, `session cookie ${sessionCookieName} issued`);
    assert.equal(sessionCookieName, "moovex_platform_testing_sid");

    // Browser-equivalent: cookie name written must be the name read on the next request.
    const follow = await request(app)
      .get("/hq")
      .set("Host", BB_HOST)
      .set("Cookie", `${sessionCookieName}=${sid}`);
    const loc = String(follow.headers.location || "");
    assert.equal(loc.startsWith("/login"), false, `unexpected redirect ${loc}`);
    assert.ok([200, 302, 303].includes(follow.status));
  });

  it("phone login creates session and redirects to HQ", async () => {
    requireDb();
    const res = await postLogin(BB_HOST, QA_PHONE, PASSWORD);
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/hq");
    const sid = extractCookie(res, sessionCookieName);
    assert.ok(sid, "session cookie issued");
    const follow = await request(app)
      .get("/hq")
      .set("Host", BB_HOST)
      .set("Cookie", `${sessionCookieName}=${sid}`);
    assert.equal(String(follow.headers.location || "").startsWith("/login"), false);
  });

  it("wrong password is rejected", async () => {
    requireDb();
    const res = await postLogin(BB_HOST, QA_EMAIL, "wrongpasswordxx");
    assert.equal(res.status, 401);
    assert.match(res.text, /Invalid email, phone number, or password/i);
    assert.equal(extractCookie(res, sessionCookieName), null);
  });

  it("ActiveClinic hostname does not authenticate BlessBoard QA into BlessBoard", async () => {
    requireDb();
    const res = await postLogin(AC_HOST, QA_EMAIL, PASSWORD);
    // ActiveClinic owns /login on its host — must not issue a BlessBoard HQ redirect.
    assert.notEqual(res.headers.location, "/hq");
    assert.notEqual(res.headers.location, "/branch-admin");
    assert.equal(extractCookie(res, sessionCookieName), null);
    assert.ok(res.status === 401 || res.status === 400 || res.status === 200);
  });

  it("inactive moovex-platform-testing deployment fails session create", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.deployments SET status = 'retired' WHERE deployment_code = $1`,
      [DEPLOYMENT]
    );
    try {
      const res = await postLogin(BB_HOST, QA_EMAIL, PASSWORD);
      assert.equal(res.status, 401);
      assert.equal(extractCookie(res, sessionCookieName), null);
    } finally {
      await pool.query(
        `UPDATE platform.deployments SET status = 'active' WHERE deployment_code = $1`,
        [DEPLOYMENT]
      );
    }
  });
});
