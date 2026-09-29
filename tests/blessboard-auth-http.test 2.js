"use strict";

/**
 * V5 apex authentication HTTP tests (ephemeral Postgres).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { spawnSync } = require("child_process");
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
const {
  createV5FoundationApp,
  UNAVAILABLE_STATUS,
} = require("../src/platform/http/v5FoundationServer");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { hashSessionToken } = require("../src/platform/session/sessionToken");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";

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

describe("blessboard v5 auth http", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      await provisionPlatformTenant(pool, {
        organizationKey: "auth-http-org",
        displayName: "Auth HTTP Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "auth-http-org",
        hostname: "auth-http.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      await provisionBlessBoardChurch(pool, {
        organizationKey: "auth-http-org",
        churchKey: "auth-http-org",
        displayName: "Auth HTTP Org",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      const created = await createBlessBoardUser(pool, {
        email: "admin@example.org",
        displayName: "Administrator",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      const role = await assignBlessBoardRole(pool, {
        email: "admin@example.org",
        organizationKey: "auth-http-org",
        roleKey: "church_hq_admin",
        churchKey: "auth-http-org",
      });
      assert.equal(role.ok, true, role.message);

      const paCreated = await createBlessBoardUser(pool, {
        email: "platform-admin@example.org",
        displayName: "Platform Administrator",
        password: PASSWORD,
      });
      assert.equal(paCreated.ok, true, paCreated.message);
      const paRole = await assignBlessBoardRole(pool, {
        email: "platform-admin@example.org",
        organizationKey: "auth-http-org",
        roleKey: "platform_admin",
      });
      assert.equal(paRole.ok, true, paRole.message);

      app = createV5FoundationApp({
        getPool: () => pool,
        enableDiagnosticHostContext: false,
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        },
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

  async function loginFlow(email, password, nextPath) {
    const loginPath = nextPath
      ? `/login?next=${encodeURIComponent(nextPath)}`
      : "/login";
    const getLogin = await request(app).get(loginPath).set("Host", "blessboard.org");
    const csrf = extractCookie(getLogin, CSRF_COOKIE);
    assert.ok(csrf);
    const match = getLogin.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(match);
    const post = await request(app)
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

  it("GET /login returns 200 on apex; transfer unavailable on tenant when routing off", async () => {
    requireDb();
    const apex = await request(app).get("/login").set("Host", "blessboard.org");
    assert.equal(apex.status, 200);
    assert.match(apex.text, /Sign in/);
    const tenant = await request(app).get("/login").set("Host", "auth-http.blessboard.org");
    assert.equal(tenant.status, 400);
  });

  it("valid credentials create hashed session and HttpOnly cookie", async () => {
    requireDb();
    const { post } = await loginFlow("admin@example.org", PASSWORD);
    assert.equal(post.status, 303);
    assert.equal(post.headers.location, "/hq");
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid);
    const setCookie = String(post.headers["set-cookie"] || "");
    assert.match(setCookie, new RegExp(`${DEFAULT_V5_COOKIE}=`));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);

    const hash = hashSessionToken(sid);
    const row = await pool.query(
      `SELECT session_token_hash, deployment_code, revoked_at
         FROM platform.deployment_sessions
        WHERE session_token_hash = $1`,
      [hash]
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].deployment_code, "blessboard-org-staging");
    assert.equal(row.rows[0].revoked_at, null);
    assert.notEqual(row.rows[0].session_token_hash, sid);

    const account = await request(app)
      .get("/account")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.equal(account.status, 200);
    assert.match(account.text, /Administrator/);
    assert.doesNotMatch(account.text, /password_hash|\$2a\$/i);
    assert.doesNotMatch(account.text, /data-bb-platform-admin-link|href="\/admin"/);
  });

  it("platform_admin login redirects to /admin and honors safe next paths", async () => {
    requireDb();
    const plain = await loginFlow("platform-admin@example.org", PASSWORD);
    assert.equal(plain.post.status, 303);
    assert.equal(plain.post.headers.location, "/admin");

    const nextAdmin = await loginFlow("platform-admin@example.org", PASSWORD, "/admin");
    assert.equal(nextAdmin.post.status, 303);
    assert.equal(nextAdmin.post.headers.location, "/admin");

    const nextOrgs = await loginFlow(
      "platform-admin@example.org",
      PASSWORD,
      "/admin/organizations"
    );
    assert.equal(nextOrgs.post.status, 303);
    assert.equal(nextOrgs.post.headers.location, "/admin/organizations");

    const unsafe = await loginFlow(
      "platform-admin@example.org",
      PASSWORD,
      "https://evil.example/admin"
    );
    assert.equal(unsafe.post.status, 303);
    assert.equal(unsafe.post.headers.location, "/admin");
    assert.doesNotMatch(String(unsafe.post.headers.location), /^https?:/i);

    const sid = extractCookie(plain.post, DEFAULT_V5_COOKIE);
    const account = await request(app)
      .get("/account")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.equal(account.status, 200);
    assert.match(account.text, /data-bb-platform-admin-link="1"/);
    assert.match(account.text, /href="\/admin"/);
    assert.match(account.text, /Open Platform Admin/);
  });

  it("ordinary apex HQ user ignores next=/admin and lands on /hq", async () => {
    requireDb();
    const { post } = await loginFlow("admin@example.org", PASSWORD, "/admin");
    assert.equal(post.status, 303);
    assert.equal(post.headers.location, "/hq");
  });

  it("invalid email and password return the same generic error", async () => {
    requireDb();
    const missing = await loginFlow("nobody@example.org", PASSWORD);
    assert.equal(missing.post.status, 401);
    assert.match(missing.post.text, /Invalid email, phone number, or password/i);
    assert.match(missing.post.text, /data-bb-auth-error="credentials"/);
    assert.match(missing.post.text, /id="bb-auth-error-summary"/);
    assert.match(missing.post.text, /id="email-error"/);
    assert.match(missing.post.text, /id="password-error"/);
    assert.doesNotMatch(missing.post.text, /does not exist|no account|unknown user/i);
    const badPw = await loginFlow("admin@example.org", "wrong-password-xx");
    assert.equal(badPw.post.status, 401);
    assert.match(badPw.post.text, /Invalid email, phone number, or password/i);
    assert.match(badPw.post.text, /data-bb-auth-error="credentials"/);
  });

  it("login and account chrome expose accessible controls without session internals", async () => {
    requireDb();
    const login = await request(app).get("/login").set("Host", "blessboard.org");
    assert.equal(login.status, 200);
    assert.match(login.text, /data-bb-shell="apex-auth"/);
    assert.match(login.text, /for="login_email"/);
    assert.match(login.text, /for="password"/);
    assert.match(login.text, /data-bb-auth-password-toggle/);
    assert.match(login.text, /name="_csrf"/);
    assert.match(login.text, /tenant-auth\.js/);

    const { post } = await loginFlow("admin@example.org", PASSWORD);
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    const account = await request(app)
      .get("/account")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.equal(account.status, 200);
    assert.match(account.text, /data-bb-apex-account="1"/);
    assert.match(account.text, /method="post" action="\/logout"/);
    assert.match(account.text, /name="_csrf"/);
    assert.doesNotMatch(account.text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    assert.doesNotMatch(account.text, /session_token|password_hash|organizationId|deploymentCode/i);
  });

  it("CSRF required for login and logout", async () => {
    requireDb();
    const getLogin = await request(app).get("/login").set("Host", "blessboard.org");
    const csrf = extractCookie(getLogin, CSRF_COOKIE);
    const noCsrf = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ email: "admin@example.org", password: PASSWORD });
    assert.equal(noCsrf.status, 403);

    const { post } = await loginFlow("admin@example.org", PASSWORD);
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    const logoutNoCsrf = await request(app)
      .post("/logout")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`))
      .type("form")
      .send({});
    assert.equal(logoutNoCsrf.status, 403);
  });

  it("logout revokes session; repeated logout is safe", async () => {
    requireDb();
    const { post } = await loginFlow("admin@example.org", PASSWORD);
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    const account = await request(app)
      .get("/account")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    const csrf = extractCookie(account, CSRF_COOKIE);
    const match = account.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(match);

    const logout = await request(app)
      .post("/logout")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: match[1] });
    assert.equal(logout.status, 303);

    const hash = hashSessionToken(sid);
    const row = await pool.query(
      `SELECT revoked_at FROM platform.deployment_sessions WHERE session_token_hash = $1`,
      [hash]
    );
    assert.ok(row.rows[0].revoked_at);

    const again = await request(app)
      .post("/logout")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: match[1] });
    assert.ok(again.status === 303 || again.status === 403);
  });

  it("suspended user and user without role cannot log in", async () => {
    requireDb();
    await createBlessBoardUser(pool, {
      email: "suspended@example.org",
      displayName: "Suspended",
      password: PASSWORD,
    });
    await assignBlessBoardRole(pool, {
      email: "suspended@example.org",
      organizationKey: "auth-http-org",
      roleKey: "platform_admin",
    });
    await pool.query(
      `UPDATE blessboard.users SET status = 'suspended' WHERE email_normalized = 'suspended@example.org'`
    );
    const suspended = await loginFlow("suspended@example.org", PASSWORD);
    assert.equal(suspended.post.status, 401);

    await createBlessBoardUser(pool, {
      email: "norole@example.org",
      displayName: "No Role",
      password: PASSWORD,
    });
    const norole = await loginFlow("norole@example.org", PASSWORD);
    assert.equal(norole.post.status, 401);
    assert.match(norole.post.text, /not available|Invalid email, phone number, or password|Invalid email or password/i);
  });

  it("session from another deployment is rejected", async () => {
    requireDb();
    const { post } = await loginFlow("admin@example.org", PASSWORD);
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    await pool.query(
      `UPDATE platform.deployment_sessions
          SET deployment_code = 'blessboard-com-production'
        WHERE session_token_hash = $1`,
      [hashSessionToken(sid)]
    );
    const account = await request(app)
      .get("/account")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`));
    assert.equal(account.status, 303);
    assert.equal(account.headers.location, "/login");
  });

  it("foundation health and unavailable routes remain stable", async () => {
    requireDb();
    assert.equal((await request(app).get("/healthz")).status, 200);
    assert.equal((await request(app).get("/").set("Host", "blessboard.org")).status, 200);
    assert.equal(
      (await request(app).get("/member").set("Host", "blessboard.org").set("Accept", "text/plain"))
        .status,
      UNAVAILABLE_STATUS
    );
    await loginFlow("admin@example.org", "bad");
    assert.equal((await request(app).get("/healthz")).status, 200);
  });

  it("user create CLI hashes password and does not print it", async () => {
    requireDb();
    const result = spawnSync(
      process.execPath,
      [
        path.join(ROOT, "db/scripts/blessboard-user-create.js"),
        "--confirm",
        "--email",
        "cliuser@example.org",
        "--display-name",
        "CLI User",
        "--password-stdin",
      ],
      {
        input: PASSWORD,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
        },
        encoding: "utf8",
      }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stdout, new RegExp(PASSWORD));
    assert.doesNotMatch(result.stderr || "", new RegExp(PASSWORD));
    const row = await pool.query(
      `SELECT password_hash FROM blessboard.users WHERE email_normalized = 'cliuser@example.org'`
    );
    assert.match(row.rows[0].password_hash, /^\$2[aby]?\$/);
    assert.notEqual(row.rows[0].password_hash, PASSWORD);
  });
});
