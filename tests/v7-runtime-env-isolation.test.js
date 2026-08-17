"use strict";

/**
 * Runtime config isolation: explicit app env is authoritative even when
 * process.env.PLATFORM_DEPLOYMENT_CODE is absent or wrong.
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
const {
  createV5FoundationApp,
  resolveApexHosts,
  isApexHost,
} = require("../src/platform/http/v5FoundationServer");
const { getBlessBoardApexDomainSet } = require("../src/church/blessBoardEnv");
const { getCsrfCookieName, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  getV5SessionCookieName,
} = require("../src/platform/session/v5SessionCookie");
const {
  resolvePlatformRequestContext,
} = require("../src/platform/http/platformRequestContext");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_ORG_STAGING,
  COOKIE_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const IDENTITY_KEY = "moovex-platform-v7";
const UNIFIED_SID = "moovex_platform_testing_sid";
const BB_HOST = "blessboard.pronline.org";
const AC_HOST = "activeclinic.pronline.org";
const PASSWORD = "1234567890";
const QA_EMAIL = "qa.finance_officer@demo-church.example.test";
const QA_PHONE = "+260971000008";

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

const STAGING_ENV = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "s".repeat(40),
});

const PROCESS_KEYS = ["PLATFORM_DEPLOYMENT_CODE", "DEPLOYMENT_ENV", "DATABASE_IDENTITY_EXPECTED"];

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

function dummyPool() {
  return { query: async () => ({ rows: [] }) };
}

function makeUnifiedRuntime(getPool) {
  const productApps = buildDefaultProductApps({
    env: UNIFIED_ENV,
    getPool: getPool || dummyPool,
  });
  return createMoovexPlatformRuntimeApp({
    env: UNIFIED_ENV,
    getPool: getPool || dummyPool,
    productApps,
  });
}

describe("runtime env isolation (helpers)", () => {
  before(() => resetDeploymentProfileWarningsForTests());

  it("Test 2: resolveApexHosts uses app env when process deployment code is absent", () => {
    withProcessEnv({}, () => {
      const apex = resolveApexHosts(UNIFIED_ENV);
      assert.equal(apex.has(BB_HOST), true);
      assert.equal(getBlessBoardApexDomainSet(UNIFIED_ENV).has(BB_HOST), true);
      assert.equal(
        isApexHost(
          { headers: { host: BB_HOST }, get: () => BB_HOST, hostname: BB_HOST },
          { env: UNIFIED_ENV }
        ),
        true
      );
    });
  });

  it("Test 3: wrong process deployment code does not change app-env apex hosts", () => {
    withProcessEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING }, () => {
      const apex = resolveApexHosts(UNIFIED_ENV);
      assert.equal(apex.has(BB_HOST), true);
      assert.equal(apex.has("blessboard.org"), false);
      const stagingApex = resolveApexHosts(STAGING_ENV);
      assert.equal(stagingApex.has("blessboard.org"), true);
      assert.equal(stagingApex.has(BB_HOST), false);
    });
  });

  it("Test 1: present process env still resolves unified apex", () => {
    withProcessEnv(
      {
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
        DEPLOYMENT_ENV: "testing",
      },
      () => {
        assert.equal(resolveApexHosts(UNIFIED_ENV).has(BB_HOST), true);
      }
    );
  });
});

describe("runtime env isolation (HTTP GET /login)", () => {
  before(() => resetDeploymentProfileWarningsForTests());

  function loginApp() {
    return makeUnifiedRuntime();
  }

  it("BlessBoard GET /login is 200 when process env lacks PLATFORM_DEPLOYMENT_CODE", async () => {
    await withProcessEnv({}, async () => {
      const res = await request(loginApp()).get("/login").set("Host", BB_HOST);
      assert.equal(res.status, 200, res.text && res.text.slice(0, 120));
      assert.doesNotMatch(res.text, /could not start sign-in/i);
    });
  });

  it("BlessBoard GET /login is 200 when process env has a different deployment code", async () => {
    await withProcessEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING }, async () => {
      const res = await request(loginApp()).get("/login").set("Host", BB_HOST);
      assert.equal(res.status, 200, res.text && res.text.slice(0, 120));
      assert.equal(getV5SessionCookieName(UNIFIED_ENV), UNIFIED_SID);
      assert.notEqual(getV5SessionCookieName(UNIFIED_ENV), COOKIE_ORG);
    });
  });

  it("Test 4: two apps in one process keep independent apex behavior", async () => {
    await withProcessEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING }, async () => {
      const unified = loginApp();
      const staging = createV5FoundationApp({
        env: STAGING_ENV,
        allowPlatformRuntimeChild: true,
        getPool: dummyPool,
        log: () => {},
      });
      const a1 = await request(unified).get("/login").set("Host", BB_HOST);
      const b1 = await request(staging).get("/login").set("Host", "blessboard.org");
      const a2 = await request(unified).get("/login").set("Host", BB_HOST);
      assert.equal(a1.status, 200);
      assert.equal(b1.status, 200);
      assert.equal(a2.status, 200);
      const unifiedCsrf = getCsrfCookieName(UNIFIED_ENV);
      const stagingCsrf = getCsrfCookieName(STAGING_ENV);
      assert.ok(extractCookie(a1, unifiedCsrf), "unified CSRF cookie");
      assert.ok(extractCookie(b1, stagingCsrf), "staging CSRF cookie");
      assert.notEqual(unifiedCsrf, stagingCsrf);
      assert.equal(extractCookie(a2, unifiedCsrf) != null, true);
    });
  });
});

describe("Stage 10 host matrix under unified app env", () => {
  it("resolves products by host and rejects production hosts on testing", () => {
    withProcessEnv({}, () => {
      const cases = [
        [BB_HOST, "blessboard"],
        [AC_HOST, "activeclinic"],
        ["netraz.pronline.org", "ngo"],
        ["getproapp.pronline.org", "getpro"],
      ];
      for (const [hostname, product] of cases) {
        const r = resolvePlatformRequestContext({ env: UNIFIED_ENV, hostname });
        assert.equal(r.ok, true, `${hostname} ${r.code || ""}`);
        assert.equal(r.platform.productKey, product);
        assert.equal(r.platform.sessionCookieName, UNIFIED_SID);
      }
      for (const hostname of ["activeclinic.org", "blessboard.com", "netraz.org"]) {
        const r = resolvePlatformRequestContext({ env: UNIFIED_ENV, hostname });
        assert.equal(r.ok, false);
        assert.equal(r.code, "PLATFORM_ENVIRONMENT_HOST_MISMATCH");
      }
    });
  });

  it("HTTP 421 for production hosts on the testing runtime", async () => {
    await withProcessEnv({ PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING }, async () => {
      const app = makeUnifiedRuntime();
      for (const hostname of ["activeclinic.org", "blessboard.com", "netraz.org"]) {
        const res = await request(app).get("/login").set("Host", hostname);
        assert.equal(res.status, 421, hostname);
        assert.equal(res.body.code, "PLATFORM_ENVIRONMENT_HOST_MISMATCH");
      }
    });
  });
});

describe("BlessBoard auth matrix vs process.env", () => {
  let pool;
  let app;
  let skipReason = null;
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
        hostname: "demo-church.blessboard.pronline.org",
        domainType: "canonical",
        deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
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
      app = makeUnifiedRuntime(() => pool);
      csrfCookieName = getCsrfCookieName(UNIFIED_ENV);
      sessionCookieName = getV5SessionCookieName(UNIFIED_ENV);
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

  async function loginFlow(processOverrides) {
    return withProcessEnv(processOverrides, async () => {
      const getLogin = await request(app).get("/login").set("Host", BB_HOST);
      assert.equal(getLogin.status, 200, `GET /login ${getLogin.status}`);
      const csrfCookie = extractCookie(getLogin, csrfCookieName);
      const match = getLogin.text.match(/name="_csrf" value="([^"]+)"/);
      assert.ok(csrfCookie && match, "csrf");
      const post = await request(app)
        .post("/login")
        .set("Host", BB_HOST)
        .set("Cookie", `${csrfCookieName}=${csrfCookie}`)
        .set("Accept", "text/html")
        .type("form")
        .send({
          [CSRF_FIELD]: match[1],
          email: QA_EMAIL,
          password: PASSWORD,
        });
      assert.equal(post.status, 303);
      assert.equal(post.headers.location, "/hq");
      const sid = extractCookie(post, sessionCookieName);
      assert.ok(sid);
      assert.equal(sessionCookieName, UNIFIED_SID);
      const hq = await request(app)
        .get("/hq")
        .set("Host", BB_HOST)
        .set("Cookie", `${sessionCookieName}=${sid}`);
      assert.equal(String(hq.headers.location || "").startsWith("/login"), false);
      assert.ok([200, 302, 303].includes(hq.status));

      const logoutCsrf = extractCookie(post, csrfCookieName) || csrfCookie;
      assert.ok(logoutCsrf);
      const logout = await request(app)
        .post("/logout")
        .set("Host", BB_HOST)
        .set("Cookie", `${sessionCookieName}=${sid}; ${csrfCookieName}=${logoutCsrf}`)
        .type("form")
        .send({ [CSRF_FIELD]: logoutCsrf });
      assert.ok([302, 303].includes(logout.status), `logout ${logout.status} ${String(logout.text).slice(0, 80)}`);
      const afterLogout = await request(app)
        .get("/hq")
        .set("Host", BB_HOST)
        .set("Cookie", `${sessionCookieName}=${sid}`);
      const afterLoc = String(afterLogout.headers.location || "");
      assert.ok(
        afterLogout.status === 401 || afterLoc.startsWith("/login"),
        `expected unauthenticated /hq, got ${afterLogout.status} ${afterLoc}`
      );
      return { getLogin, post, hq, logout, sid };
    });
  }

  it("Matrix A: process env present and correct", async () => {
    requireDb();
    await loginFlow({
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
      DEPLOYMENT_ENV: "testing",
    });
  });

  it("Matrix B: process env absent", async () => {
    requireDb();
    await loginFlow({});
  });

  it("Matrix C: process env deliberately wrong", async () => {
    requireDb();
    await loginFlow({ PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING });
  });

  it("ActiveClinic host does not use BlessBoard apex login", async () => {
    requireDb();
    await withProcessEnv({}, async () => {
      const res = await request(app).get("/login").set("Host", AC_HOST);
      assert.doesNotMatch(String(res.text || ""), /BlessBoard home site/i);
      assert.match(String(res.text || ""), /data-ac-page="login"|Sign In/i);
    });
  });
});
