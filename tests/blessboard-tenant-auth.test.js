"use strict";

/**
 * BlessBoard V5 tenant ↔ apex login transfer (host-only cookies; no Domain=.blessboard.org).
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
const {
  createV5FoundationApp,
} = require("../src/platform/http/v5FoundationServer");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { hashSessionToken } = require("../src/platform/session/sessionToken");
const {
  createTenantLoginTransferRequest,
  loadAuthTransferByRawToken,
  issueTenantLoginRedeemCode,
  redeemTenantLoginTransfer,
  tenantFromTransfer,
  TRANSFER_TTL_MS,
} = require("../src/platform/services/authTransferService");
const {
  redactAuthTransferQuery,
  getApexOrigin,
  safeTenantNextPath,
  safePlatformAdminNextPath,
  resolveApexPostLoginPath,
  hasPlatformAdminRole,
} = require("../src/blessboard/http/tenantLoginHelpers");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "ta-a.blessboard.org";
const HOST_B = "ta-b.blessboard.org";

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

function extractLocationQuery(location, key) {
  const u = new URL(String(location), "https://blessboard.org");
  return u.searchParams.get(key);
}

describe("auth transfer helpers", () => {
  it("redacts transfer query params from logs", () => {
    assert.match(redactAuthTransferQuery("/login?tr=SECRET&x=1"), /tr=REDACTED/);
    assert.match(redactAuthTransferQuery("/auth/callback?code=SECRET"), /code=REDACTED/);
    assert.doesNotMatch(redactAuthTransferQuery("/login?tr=SECRET"), /SECRET/);
  });

  it("safeTenantNextPath rejects open redirects and path traversal", () => {
    assert.equal(safeTenantNextPath("/hq"), "/hq");
    assert.equal(safeTenantNextPath("/branch-admin"), "/branch-admin");
    assert.equal(safeTenantNextPath("/account"), "/account");
    assert.equal(safeTenantNextPath("/member"), "/member");
    assert.equal(safeTenantNextPath("/hq/settings"), "/hq/settings");
    assert.equal(safeTenantNextPath("//evil"), null);
    assert.equal(safeTenantNextPath("https://evil/hq"), null);
    assert.equal(safeTenantNextPath("/hq/../evil"), null);
    assert.equal(safeTenantNextPath("/hq/%2e%2e/evil"), null);
    assert.equal(safeTenantNextPath("/admin"), null);
    assert.equal(safeTenantNextPath("/hq?x=1"), null);
    assert.equal(safeTenantNextPath("hq"), null);
  });

  it("safePlatformAdminNextPath accepts only local /admin paths", () => {
    assert.equal(safePlatformAdminNextPath("/admin"), "/admin");
    assert.equal(safePlatformAdminNextPath("/admin/organizations"), "/admin/organizations");
    assert.equal(safePlatformAdminNextPath("/admin/"), "/admin/");
    assert.equal(safePlatformAdminNextPath("//evil.com/admin"), null);
    assert.equal(safePlatformAdminNextPath("https://evil.com/admin"), null);
    assert.equal(safePlatformAdminNextPath("/\\evil"), null);
    assert.equal(safePlatformAdminNextPath("/admin/../account"), null);
    assert.equal(safePlatformAdminNextPath("/admin/%2e%2e/account"), null);
    assert.equal(safePlatformAdminNextPath("/account"), null);
    assert.equal(safePlatformAdminNextPath("/hq"), null);
    assert.equal(safePlatformAdminNextPath("/administrator"), null);
    assert.equal(safePlatformAdminNextPath("admin"), null);
  });

  it("resolveApexPostLoginPath routes platform_admin to /admin and others to /account", () => {
    assert.equal(resolveApexPostLoginPath([{ roleKey: "platform_admin" }], null), "/admin");
    assert.equal(
      resolveApexPostLoginPath([{ roleKey: "platform_admin" }], "/admin/organizations"),
      "/admin/organizations"
    );
    assert.equal(
      resolveApexPostLoginPath([{ roleKey: "platform_admin" }], "https://evil/admin"),
      "/admin"
    );
    assert.equal(resolveApexPostLoginPath([{ roleKey: "church_hq_admin" }], "/admin"), "/hq");
    assert.equal(resolveApexPostLoginPath([{ roleKey: "church_hq_admin" }], null), "/hq");
    assert.equal(resolveApexPostLoginPath([{ roleKey: "church_hq_admin" }], "/hq/content"), "/hq/content");
    assert.equal(resolveApexPostLoginPath([{ roleKey: "member" }], null), "/account");
    assert.equal(hasPlatformAdminRole(["platform_admin"]), true);
    assert.equal(hasPlatformAdminRole(["church_hq_admin"]), false);
  });

  it("TRANSFER_TTL_MS is at most five minutes", () => {
    assert.ok(TRANSFER_TTL_MS > 0);
    assert.ok(TRANSFER_TTL_MS <= 5 * 60 * 1000);
  });
});

describe("blessboard tenant-auth transfer http", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let appOff;
  let orgA;
  let churchA;
  let campusA;
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
        organizationKey: "ta-a",
        displayName: "TA Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ta-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "ta-a",
        churchKey: "ta-a",
        displayName: "TA Church A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;

      const campus = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus', 'Campus', 'branch', 'active', false, 'Africa/Lusaka', 'ZM')
         RETURNING id`,
        [churchA.id]
      );
      campusA = campus.rows[0];

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "ta-b",
        displayName: "TA Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ta-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provB.ok, true);
      await provisionBlessBoardChurch(pool, {
        organizationKey: "ta-b",
        churchKey: "ta-b",
        displayName: "TA Church B",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });

      async function make(email, displayName, role) {
        const created = await createBlessBoardUser(pool, { email, displayName, password: PASSWORD });
        assert.equal(created.ok, true, created.message);
        const assign = await assignBlessBoardRole(pool, role);
        assert.equal(assign.ok, true, assign.message);
        return created.user;
      }

      users.platform = await make("ta-platform@example.org", "TA Platform", {
        email: "ta-platform@example.org",
        organizationKey: "ta-a",
        roleKey: "platform_admin",
      });
      users.hq = await make("ta-hq@example.org", "TA HQ", {
        email: "ta-hq@example.org",
        organizationKey: "ta-a",
        roleKey: "church_hq_admin",
        churchKey: "ta-a",
      });
      users.branch = await make("ta-branch@example.org", "TA Branch", {
        email: "ta-branch@example.org",
        organizationKey: "ta-a",
        roleKey: "branch_admin",
        churchKey: "ta-a",
        branchKey: "hq",
      });
      users.campus = await make("ta-campus@example.org", "TA Campus", {
        email: "ta-campus@example.org",
        organizationKey: "ta-a",
        roleKey: "branch_admin",
        churchKey: "ta-a",
        branchKey: "campus",
      });
      users.other = await make("ta-other@example.org", "TA Other", {
        email: "ta-other@example.org",
        organizationKey: "ta-b",
        roleKey: "church_hq_admin",
        churchKey: "ta-b",
      });

      const env = {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
        BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
        PUBLIC_SCHEME: "https",
        BLESSBOARD_APEX_ORIGIN: "https://blessboard.org",
      };
      app = createV5FoundationApp({ getPool: () => pool, env });
      appOff = createV5FoundationApp({
        getPool: () => pool,
        env: { ...env, BLESSBOARD_TENANT_ROUTING_MODE: "off" },
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

  async function completeTenantLogin(host, email, password) {
    const start = await request(app).get("/login").set("Host", host).redirects(0);
    assert.equal(start.status, 303);
    const loc = start.headers.location;
    assert.match(loc, /^https:\/\/blessboard\.org\/login\?tr=/);
    assert.equal(getApexOrigin({ BLESSBOARD_APEX_ORIGIN: "https://blessboard.org" }), "https://blessboard.org");
    const tr = extractLocationQuery(loc, "tr");
    assert.ok(tr);

    const apexGet = await request(app).get(`/login?tr=${encodeURIComponent(tr)}`).set("Host", "blessboard.org");
    assert.equal(apexGet.status, 200);
    assert.match(apexGet.text, new RegExp(host.replace(/\./g, "\\.")));
    assert.doesNotMatch(apexGet.text, new RegExp(tr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(apexGet.text, /name="tr"/);
    assert.equal(apexGet.headers["referrer-policy"], "no-referrer");
    const csrf = extractCookie(apexGet, CSRF_COOKIE);
    const match = apexGet.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(csrf && match);

    const post = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${CSRF_COOKIE}=${csrf}`))
      .redirects(0)
      .type("form")
      .send({
        email,
        password,
        tr,
        [CSRF_FIELD]: match[1],
      });
    assert.equal(post.status, 303);
    assert.match(String(post.headers.location || ""), new RegExp(`https://${host}/auth/callback\\?code=`));
    assert.doesNotMatch(String(post.headers["set-cookie"] || ""), /Domain=/i);
    const code = extractLocationQuery(post.headers.location, "code");
    assert.ok(code);
    assert.notEqual(code, tr);

    const callback = await request(app)
      .get(`/auth/callback?code=${encodeURIComponent(code)}`)
      .set("Host", host)
      .redirects(0);
    assert.equal(callback.status, 303);
    assert.equal(callback.headers["referrer-policy"], "no-referrer");
    const sid = extractCookie(callback, DEFAULT_V5_COOKIE);
    assert.ok(sid);
    assert.doesNotMatch(String(callback.headers["set-cookie"] || ""), /Domain=/i);
    return { sid, code, tr, callback, post };
  }

  it("tenant login initiates apex flow", async () => {
    requireDb();
    const res = await request(app).get("/login").set("Host", HOST_A).redirects(0);
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /^https:\/\/blessboard\.org\/login\?tr=/);
  });

  it("unknown tenant and routing-off cannot initiate login", async () => {
    requireDb();
    const unknown = await request(app).get("/login").set("Host", "unknown-ta.blessboard.org");
    assert.equal(unknown.status, 400);
    const off = await request(appOff).get("/login").set("Host", HOST_A);
    assert.equal(off.status, 400);
  });

  it("inactive tenant cannot initiate login", async () => {
    requireDb();
    await pool.query(`UPDATE platform.domains SET status = 'inactive' WHERE hostname = $1`, [HOST_A]);
    try {
      const res = await request(app).get("/login").set("Host", HOST_A);
      assert.equal(res.status, 400);
    } finally {
      await pool.query(`UPDATE platform.domains SET status = 'active' WHERE hostname = $1`, [HOST_A]);
    }
  });

  it("authorized HQ and platform_admin succeed; stores hash only", async () => {
    requireDb();
    const { sid, code } = await completeTenantLogin(HOST_A, "ta-hq@example.org", PASSWORD);
    const hash = hashSessionToken(sid);
    const sessions = await pool.query(
      `SELECT session_token_hash FROM platform.deployment_sessions WHERE session_token_hash = $1`,
      [hash]
    );
    assert.equal(sessions.rowCount, 1);
    assert.notEqual(sessions.rows[0].session_token_hash, sid);

    const codeHash = hashSessionToken(code);
    const transfers = await pool.query(
      `SELECT transfer_token_hash, consumed_at, user_id IS NOT NULL AS has_user
         FROM platform.auth_transfers WHERE transfer_token_hash = $1`,
      [codeHash]
    );
    assert.equal(transfers.rowCount, 1);
    assert.ok(transfers.rows[0].consumed_at);
    assert.equal(transfers.rows[0].has_user, true);

    const hq = await request(app)
      .get("/hq")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`);
    assert.equal(hq.status, 200);

    const { sid: platSid } = await completeTenantLogin(HOST_A, "ta-platform@example.org", PASSWORD);
    const platHq = await request(app)
      .get("/hq")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${platSid}`);
    assert.equal(platHq.status, 200);
  });

  it("authorized branch_admin succeeds for assigned primary branch; campus-only rejected", async () => {
    requireDb();
    const { sid } = await completeTenantLogin(HOST_A, "ta-branch@example.org", PASSWORD);
    const ba = await request(app)
      .get("/branch-admin")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`);
    assert.equal(ba.status, 200);

    const start = await request(app).get("/login").set("Host", HOST_A).redirects(0);
    const tr = extractLocationQuery(start.headers.location, "tr");
    const apexGet = await request(app).get(`/login?tr=${encodeURIComponent(tr)}`).set("Host", "blessboard.org");
    const csrf = extractCookie(apexGet, CSRF_COOKIE);
    const match = apexGet.text.match(/name="_csrf" value="([^"]+)"/);
    const post = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        email: "ta-campus@example.org",
        password: PASSWORD,
        tr,
        [CSRF_FIELD]: match[1],
      });
    assert.ok(post.status === 403 || post.status === 401);
    assert.equal(extractCookie(post, DEFAULT_V5_COOKIE) == null || post.status === 403, true);
  });

  it("unauthorized user for tenant is rejected", async () => {
    requireDb();
    const start = await request(app).get("/login").set("Host", HOST_A).redirects(0);
    const tr = extractLocationQuery(start.headers.location, "tr");
    const apexGet = await request(app).get(`/login?tr=${encodeURIComponent(tr)}`).set("Host", "blessboard.org");
    const csrf = extractCookie(apexGet, CSRF_COOKIE);
    const match = apexGet.text.match(/name="_csrf" value="([^"]+)"/);
    const post = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        email: "ta-other@example.org",
        password: PASSWORD,
        tr,
        [CSRF_FIELD]: match[1],
      });
    assert.ok([401, 403].includes(post.status));
  });

  it("transfer is hostname-bound, single-use, and replay rejected", async () => {
    requireDb();
    const { sid, code } = await completeTenantLogin(HOST_A, "ta-hq@example.org", PASSWORD);
    const replay = await request(app)
      .get(`/auth/callback?code=${encodeURIComponent(code)}`)
      .set("Host", HOST_A)
      .set("Accept", "text/html");
    assert.equal(replay.status, 400);
    assert.match(replay.text, /already been used/i);
    assert.match(replay.text, /data-bb-auth-error="consumed"/);
    assert.doesNotMatch(replay.text, new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(replay.headers["referrer-policy"], "no-referrer");

    const otherHost = await request(app)
      .get(`/auth/callback?code=${encodeURIComponent(code)}`)
      .set("Host", HOST_B);
    assert.equal(otherHost.status, 400);

    const cross = await request(app)
      .get("/hq")
      .set("Host", HOST_B)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`);
    assert.equal(cross.status, 403);
  });

  it("expired transfer fails closed; CSRF enforced; no password on tenant POST", async () => {
    requireDb();
    const hq = await pool.query(
      `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'hq' LIMIT 1`,
      [churchA.id]
    );
    const created2 = await createTenantLoginTransferRequest(pool, {
      deploymentCode: "blessboard-org-v5",
      hostname: HOST_A,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: hq.rows[0].id,
    });
    assert.equal(created2.ok, true);
    await pool.query(
      `UPDATE platform.auth_transfers
          SET created_at = now() - interval '10 minutes',
              expires_at = now() - interval '1 minute'
        WHERE transfer_token_hash = $1`,
      [hashSessionToken(created2.rawToken)]
    );
    const loaded = await loadAuthTransferByRawToken(pool, {
      rawToken: created2.rawToken,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.status, "expired");

    const tenantPost = await request(app)
      .post("/login")
      .set("Host", HOST_A)
      .type("form")
      .send({ email: "ta-hq@example.org", password: PASSWORD });
    assert.equal(tenantPost.status, 400);

    const start = await request(app).get("/login").set("Host", HOST_A).redirects(0);
    const tr = extractLocationQuery(start.headers.location, "tr");
    const apexGet = await request(app).get(`/login?tr=${encodeURIComponent(tr)}`).set("Host", "blessboard.org");
    const csrf = extractCookie(apexGet, CSRF_COOKIE);
    const noCsrf = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ email: "ta-hq@example.org", password: PASSWORD, tr });
    assert.equal(noCsrf.status, 403);
  });

  it("apex cookie is not shared; logout revokes tenant session", async () => {
    requireDb();
    const apexGet = await request(app).get("/login").set("Host", "blessboard.org");
    const csrf = extractCookie(apexGet, CSRF_COOKIE);
    const match = apexGet.text.match(/name="_csrf" value="([^"]+)"/);
    const apexPost = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader(`${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        email: "ta-hq@example.org",
        password: PASSWORD,
        [CSRF_FIELD]: match[1],
      });
    const apexSid = extractCookie(apexPost, DEFAULT_V5_COOKIE);
    assert.ok(apexSid);
    const noTenant = await request(app)
      .get("/hq")
      .set("Host", HOST_A)
      .set("Accept", "text/html");
    assert.equal(noTenant.status, 303);

    const { sid } = await completeTenantLogin(HOST_A, "ta-hq@example.org", PASSWORD);
    const account = await request(app)
      .get("/account")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`);
    assert.equal(account.status, 200);
    const tenantCsrf = extractCookie(account, CSRF_COOKIE);
    const csrfMatch = account.text.match(/name="_csrf" value="([^"]+)"/);
    const logout = await request(app)
      .post("/logout")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${sid}`, `${CSRF_COOKIE}=${tenantCsrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: csrfMatch[1] });
    assert.equal(logout.status, 303);
    const after = await request(app)
      .get("/hq")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`)
      .set("Accept", "text/html");
    assert.equal(after.status, 303);
  });

  it("service rejects hostname mismatch and deployment mismatch", async () => {
    requireDb();
    const hq = await pool.query(
      `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'hq' LIMIT 1`,
      [churchA.id]
    );
    const created = await createTenantLoginTransferRequest(pool, {
      deploymentCode: "blessboard-org-v5",
      hostname: HOST_A,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: hq.rows[0].id,
    });
    assert.equal(created.ok, true);
    const issued = await issueTenantLoginRedeemCode(pool, {
      rawRequestToken: created.rawToken,
      deploymentCode: "blessboard-org-v5",
      userId: users.hq.id,
      tenant: tenantFromTransfer(created.transfer),
    });
    assert.equal(issued.ok, true);
    const wrongHost = await redeemTenantLoginTransfer(pool, {
      rawToken: issued.rawToken,
      deploymentCode: "blessboard-org-v5",
      hostname: HOST_B,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: hq.rows[0].id,
    });
    assert.equal(wrongHost.ok, false);
    assert.equal(wrongHost.status, "hostname_mismatch");

    const wrongDeploy = await redeemTenantLoginTransfer(pool, {
      rawToken: issued.rawToken,
      deploymentCode: "blessboard-com-v4",
      hostname: HOST_A,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: hq.rows[0].id,
    });
    assert.equal(wrongDeploy.ok, false);
    assert.equal(wrongDeploy.status, "deployment_mismatch");
  });
});
