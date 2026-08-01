"use strict";

/**
 * Prompt 43 — platform-admin login observability + multi-worker session continuity.
 * Uses ephemeral foundation DB only.
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
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { hashSessionToken } = require("../src/platform/session/sessionToken");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const REQUIRED_EVENTS = [
  "apex_login_get",
  "apex_login_post_started",
  "apex_login_csrf_rejected",
  "apex_login_account_not_found",
  "apex_login_password_rejected",
  "apex_login_roles_loaded",
  "apex_login_session_created",
  "apex_login_redirect",
  "v5_session_cookie_missing",
  "v5_session_loaded",
  "platform_admin_authorized",
  "platform_admin_denied",
];
const FORBIDDEN_LOG_PATTERNS = [
  /password_hash/i,
  /SESSION_SECRET/i,
  /DATABASE_URL/i,
  /blessboard_org_sid=/i,
  /blessboard_org_v5_csrf=/i,
  /correct-horse-battery-staple/,
  /platform-admin@example\.org/,
];

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

function cookieHeader(...pairs) {
  return pairs.filter(Boolean).join("; ");
}

function parseAuthEvents(lines) {
  const events = [];
  for (const line of lines) {
    const idx = String(line).indexOf("[blessboard-v5-auth] ");
    if (idx < 0) continue;
    const json = String(line).slice(idx + "[blessboard-v5-auth] ".length);
    events.push(JSON.parse(json));
  }
  return events;
}

describe("blessboard platform-admin login diagnosis (prompt 43)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let logLines = [];
  let app;
  let appB;

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
      await provisionPlatformTenant(pool, {
        organizationKey: "pa-login-org",
        displayName: "PA Login Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "pa-login-org",
        hostname: "pa-login.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      await provisionBlessBoardChurch(pool, {
        organizationKey: "pa-login-org",
        churchKey: "pa-login-org",
        displayName: "PA Login Org",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      const created = await createBlessBoardUser(pool, {
        email: "platform-admin@example.org",
        displayName: "Platform Administrator",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      const role = await assignBlessBoardRole(pool, {
        email: "platform-admin@example.org",
        organizationKey: "pa-login-org",
        roleKey: "platform_admin",
      });
      assert.equal(role.ok, true, role.message);

      const member = await createBlessBoardUser(pool, {
        email: "hq-only@example.org",
        displayName: "HQ Only",
        password: PASSWORD,
      });
      assert.equal(member.ok, true, member.message);
      const memberRole = await assignBlessBoardRole(pool, {
        email: "hq-only@example.org",
        organizationKey: "pa-login-org",
        roleKey: "church_hq_admin",
        churchKey: "pa-login-org",
      });
      assert.equal(memberRole.ok, true, memberRole.message);

      const env = {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
      };
      const log = (line) => {
        logLines.push(String(line));
      };
      app = createV5FoundationApp({ getPool: () => pool, env, log });
      // Second "worker" shares DB pool + secret — simulates LiteSpeed multi-process with shared SESSION_SECRET.
      appB = createV5FoundationApp({ getPool: () => pool, env, log });
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

  async function loginFlow(email, password, nextPath, targetApp) {
    const useApp = targetApp || app;
    const loginPath = nextPath
      ? `/login?next=${encodeURIComponent(nextPath)}`
      : "/login?next=/admin";
    const getLogin = await request(useApp).get(loginPath).set("Host", "blessboard.org");
    const csrf = extractCookie(getLogin, CSRF_COOKIE);
    const match = getLogin.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(csrf);
    assert.ok(match);
    const post = await request(useApp)
      .post(loginPath)
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        email,
        password,
        [CSRF_FIELD]: match[1],
      });
    return { getLogin, post, csrf };
  }

  it("valid platform-admin login creates DB session, sets cookie, redirects to /admin", async () => {
    requireDb();
    logLines = [];
    const { post } = await loginFlow("platform-admin@example.org", PASSWORD, "/admin");
    assert.equal(post.status, 303);
    assert.equal(post.headers.location, "/admin");
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid);
    const setCookie = [].concat(post.headers["set-cookie"] || []).join(";");
    assert.match(setCookie, new RegExp(`${DEFAULT_V5_COOKIE}=`));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//i);
    assert.doesNotMatch(setCookie, /Domain=/i);

    const hash = hashSessionToken(sid);
    const row = await pool.query(
      `SELECT id FROM platform.deployment_sessions
        WHERE session_token_hash = $1 AND revoked_at IS NULL`,
      [hash]
    );
    assert.equal(row.rows.length, 1);

    const admin = await request(app)
      .get("/admin")
      .set("Host", "blessboard.org")
      .set("Accept", "text/html")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.equal(admin.status, 200);

    const events = parseAuthEvents(logLines).map((e) => e.event);
    for (const name of [
      "apex_login_get",
      "apex_login_post_started",
      "apex_login_roles_loaded",
      "apex_login_session_created",
      "apex_login_redirect",
      "v5_session_loaded",
      "platform_admin_authorized",
    ]) {
      assert.ok(events.includes(name), `missing event ${name}`);
    }
    for (const line of logLines) {
      for (const pat of FORBIDDEN_LOG_PATTERNS) {
        assert.doesNotMatch(line, pat);
      }
    }
  });

  it("session cookie works on a second simulated worker", async () => {
    requireDb();
    const { post } = await loginFlow("platform-admin@example.org", PASSWORD, "/admin", app);
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid);
    const admin = await request(appB)
      .get("/admin")
      .set("Host", "blessboard.org")
      .set("Accept", "text/html")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.equal(admin.status, 200);
  });

  it("invalid password and CSRF keep safe responses and emit expected events", async () => {
    requireDb();
    logLines = [];
    const badPw = await loginFlow("platform-admin@example.org", "wrong-password-xx", "/admin");
    assert.equal(badPw.post.status, 401);
    assert.match(badPw.post.text, /Invalid email or password/i);

    const getLogin = await request(app).get("/login").set("Host", "blessboard.org");
    const csrf = extractCookie(getLogin, CSRF_COOKIE);
    const noCsrf = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ email: "platform-admin@example.org", password: PASSWORD });
    assert.equal(noCsrf.status, 403);

    const missing = await loginFlow("nobody@example.org", PASSWORD, "/admin");
    assert.equal(missing.post.status, 401);
    assert.match(missing.post.text, /Invalid email or password/i);

    const events = parseAuthEvents(logLines).map((e) => e.event);
    assert.ok(events.includes("apex_login_password_rejected"));
    assert.ok(events.includes("apex_login_csrf_rejected"));
    assert.ok(events.includes("apex_login_account_not_found"));
  });

  it("missing platform_admin role is denied for /admin", async () => {
    requireDb();
    logLines = [];
    const { post } = await loginFlow("hq-only@example.org", PASSWORD, "/admin");
    assert.equal(post.status, 303);
    assert.equal(post.headers.location, "/account");
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    const admin = await request(app)
      .get("/admin")
      .set("Host", "blessboard.org")
      .set("Accept", "text/html")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.equal(admin.status, 403);
    const events = parseAuthEvents(logLines).map((e) => e.event);
    assert.ok(events.includes("platform_admin_denied"));
  });

  it("www canonical redirect preserves login path; unauthenticated /admin logs cookie missing", async () => {
    requireDb();
    logLines = [];
    const www = await request(app).get("/login?next=/admin").set("Host", "www.blessboard.org");
    assert.equal(www.status, 301);
    assert.equal(www.headers.location, "https://blessboard.org/login?next=/admin");

    const anon = await request(app)
      .get("/admin")
      .set("Host", "blessboard.org")
      .set("Accept", "text/html");
    assert.equal(anon.status, 303);
    assert.match(String(anon.headers.location || ""), /^\/login(\?|$)/);
    const events = parseAuthEvents(logLines).map((e) => e.event);
    assert.ok(events.includes("v5_session_cookie_missing"));
    assert.ok(events.includes("platform_admin_denied"));
  });

  it("GET /login?next=/admin always renders; /admin survives missing growth-offer table", async () => {
    requireDb();
    logLines = [];
    await pool.query(`DROP TABLE IF EXISTS blessboard.organization_growth_trial_offers CASCADE`);

    const loginGet = await request(app)
      .get("/login?next=/admin")
      .set("Host", "blessboard.org");
    assert.equal(loginGet.status, 200);
    assert.match(loginGet.text, /id="bb-auth-login-form"/);
    assert.doesNotMatch(loginGet.text, /Organization directory is temporarily unavailable/i);

    const { post } = await loginFlow("platform-admin@example.org", PASSWORD, "/admin");
    assert.equal(post.status, 303);
    assert.equal(post.headers.location, "/admin");
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid);

    const admin = await request(app)
      .get("/admin")
      .set("Host", "blessboard.org")
      .set("Accept", "text/html")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.equal(admin.status, 200);
    assert.match(admin.text, /data-bb-pa-dashboard="1"/);
    assert.doesNotMatch(admin.text, /Organization directory is temporarily unavailable/i);

    const events = parseAuthEvents(logLines).map((e) => e.event);
    assert.ok(events.includes("apex_login_rendered"));
    assert.ok(events.includes("apex_login_session_created"));
    assert.ok(events.includes("platform_admin_authorized"));
  });

  it("required observability event names are covered by this suite", () => {
    requireDb();
    // Static inventory check — events are exercised above; keep names stable for ops docs.
    for (const name of REQUIRED_EVENTS) {
      assert.match(name, /^[a-z0-9_]+$/);
    }
  });
});
