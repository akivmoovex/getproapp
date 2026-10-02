"use strict";

/**
 * V2.04 — BB post-registration auto-login + dashboard redirect.
 *
 * A. new user registration → authenticated → /hq
 * B. reused phone identity → authenticated → /hq
 * C. role assignment failure → no authenticated partial church session
 * D. unauthenticated direct /hq still protected
 * E. correct new church context loaded after redirect
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  assertChurchReadyHqRedirect,
} = require("./helpers/blessboardRegistrationSuccess");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const { nextZmNational } = require("./helpers/zmPhoneFormFields");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "BbPostReg-Hq-99!";
const APEX = "blessboard.org";

const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
  [ENV_KEY]: "1",
});

let pool;
let skipReason = null;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
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

function extractCsrfToken(html) {
  const m = String(html || "").match(
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || null;
}

function makeApp(apexMarketingDeps = {}) {
  return createV5FoundationApp({
    env: MINIMAL_BB,
    getPool: () => pool,
    apexMarketingDeps,
  });
}

function escapeRe(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getRegisterPage(app) {
  const res = await request(app).get("/register-church?plan=foundation").set("Host", APEX);
  assert.equal(res.status, 200);
  const csrf = extractCsrfToken(res.text);
  const cookie = extractCookie(res, CSRF_COOKIE);
  assert.ok(csrf && cookie);
  return { res, csrf, cookie };
}

function registerBody(overrides = {}) {
  const stamp = uniq("bbhq");
  return {
    church_name: `PostReg HQ Church ${stamp}`,
    country: "ZM",
    city: "Lusaka",
    contact_name: "Pastor HQ",
    role_in_church: "Pastor",
    phone_country: "ZM",
    phone_national: nextZmNational(),
    email: `${stamp}@example.org`,
    selected_plan: "foundation",
    password: PASSWORD,
    password_confirm: PASSWORD,
    branch_name: "HQ Campus",
    consent_contact: "on",
    ...overrides,
  };
}

async function postRegister(app, body) {
  const page = await getRegisterPage(app);
  return request(app)
    .post("/register-church")
    .set("Host", APEX)
    .set("Cookie", `${CSRF_COOKIE}=${page.cookie}`)
    .type("form")
    .send({ ...body, [CSRF_FIELD]: page.csrf });
}

describe("V2.04 BB post-registration auto-login → /hq", () => {
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
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("A: new user registration → authenticated → /hq", async () => {
    requireDb();
    const app = makeApp();
    const body = registerBody();
    const post = await postRegister(app, body);
    assert.equal(post.status, 303, post.text && String(post.text).slice(0, 400));
    assertChurchReadyHqRedirect(post.headers.location);
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid, "session cookie established (auto-login)");

    const hq = await request(app)
      .get("/hq")
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`)
      .redirects(5);
    assert.ok(
      hq.status === 200,
      `authenticated /hq expected 200, got ${hq.status}`
    );
    assert.doesNotMatch(String(hq.headers.location || ""), /\/login/);
    assert.match(hq.text, new RegExp(escapeRe(body.church_name), "i"));
  });

  it("B: reused phone identity → authenticated → /hq", async () => {
    requireDb();
    const app = makeApp();
    const phoneNational = nextZmNational();
    const email = `${uniq("reuse")}@example.org`;
    const first = registerBody({
      email,
      phone_national: phoneNational,
      church_name: `First Phone Church ${uniq("p1")}`,
    });
    const post1 = await postRegister(app, first);
    assert.equal(post1.status, 303);
    assertChurchReadyHqRedirect(post1.headers.location);
    assert.ok(extractCookie(post1, DEFAULT_V5_COOKIE));

    const secondName = `Second Phone Church ${uniq("p2")}`;
    const second = registerBody({
      email,
      phone_national: phoneNational,
      church_name: secondName,
      multi_org_identity_ack: "on",
    });
    const post2 = await postRegister(app, second);
    assert.equal(post2.status, 303, post2.text && String(post2.text).slice(0, 400));
    assertChurchReadyHqRedirect(post2.headers.location);
    const sid2 = extractCookie(post2, DEFAULT_V5_COOKIE);
    assert.ok(sid2, "session cookie for reused identity");

    const users = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.users WHERE email_normalized = $1`,
      [email.toLowerCase()]
    );
    assert.equal(users.rows[0].n, 1, "canonical identity reused (no duplicate user)");

    const hq = await request(app)
      .get("/hq")
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid2}`)
      .redirects(5);
    assert.equal(hq.status, 200);
    assert.match(hq.text, new RegExp(escapeRe(secondName), "i"));
  });

  it("C: role assignment failure → no authenticated partial church session", async () => {
    requireDb();
    const app = makeApp({
      provisionFn: async () => ({
        ok: false,
        status: "administrator_not_found",
        message: "role_assignment_failed",
        alreadyProvisioned: false,
        records: null,
      }),
    });
    const body = registerBody({ church_name: `Role Fail Church ${uniq("rf")}` });
    const orgsBefore = (
      await pool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`)
    ).rows[0].n;

    const post = await postRegister(app, body);
    assert.notEqual(post.status, 303);
    assert.ok(!extractCookie(post, DEFAULT_V5_COOKIE), "no session cookie on role failure");
    assert.doesNotMatch(String(post.headers.location || ""), /^\/hq(?:\?|$)/);
    assert.equal(
      (await pool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`)).rows[0].n,
      orgsBefore,
      "no partial church org after role assignment failure"
    );

    const hq = await request(app).get("/hq").set("Host", APEX);
    assert.ok(
      hq.status === 303 || hq.status === 401 || hq.status === 403,
      `unauthenticated /hq must not render dashboard (${hq.status})`
    );
    if (hq.status === 303) {
      assert.match(String(hq.headers.location || ""), /\/login/);
    }
  });

  it("D: unauthenticated direct /hq still protected", async () => {
    requireDb();
    const app = makeApp();
    const hq = await request(app)
      .get("/hq")
      .set("Host", APEX)
      .set("Accept", "text/html");
    assert.ok(
      hq.status === 303 || hq.status === 401 || hq.status === 403,
      `unauthenticated /hq must not render dashboard (${hq.status})`
    );
    if (hq.status === 303) {
      assert.match(String(hq.headers.location || ""), /^\/login(?:\?|$)/);
      assert.match(String(hq.headers.location || ""), /next=\/hq|next=%2Fhq/);
    }
    assert.doesNotMatch(hq.text || "", /HQ Overview/i);
  });

  it("E: correct new church context loaded after redirect", async () => {
    requireDb();
    const app = makeApp();
    const churchName = `Context Church ${uniq("ctx")}`;
    const body = registerBody({ church_name: churchName });
    const post = await postRegister(app, body);
    assert.equal(post.status, 303);
    assertChurchReadyHqRedirect(post.headers.location);
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid);

    const appRow = await pool.query(
      `SELECT organization_id
         FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    assert.equal(appRow.rowCount, 1);
    const organizationId = String(appRow.rows[0].organization_id);
    const org = await pool.query(
      `SELECT display_name FROM platform.organizations WHERE id = $1`,
      [organizationId]
    );
    assert.equal(org.rows[0].display_name, churchName);

    const hq = await request(app)
      .get("/hq")
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`)
      .redirects(5);
    assert.equal(hq.status, 200);
    // Tenant shell/dashboard must surface the newly provisioned church (not a prior tenant).
    assert.match(hq.text, new RegExp(escapeRe(churchName), "i"));
    assert.doesNotMatch(hq.text, /\/login\?next=/);
  });
});
