"use strict";

/**
 * V2.04 BB registration auto-login — root cause + minimal fix.
 *
 * 1. brand-new user → registration → session → /hq
 * 2. reused canonical identity → session → /hq
 * 3. multi-church admin → newly-created church context
 * 4. forced/derived tenant mismatch regression (registration matches login)
 * 5. session creation failure → no partial authenticated session
 * 6. normal /login behavior unchanged (source contract)
 * 7. cross-tenant isolation unchanged (source contract)
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
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
const {
  establishBlessBoardSession,
  sessionTenantContextFromPreferred,
  classifyEstablishSessionError,
} = require("../src/blessboard/services/establishBlessBoardSession");
const { authenticateBlessBoardUser } = require("../src/blessboard/services/authenticateBlessBoardUser");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "BbAutoLogin-Fix-99!";
const APEX = "blessboard.org";
const DEPLOYMENT = "blessboard-org-staging";

const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
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
  return { csrf, cookie };
}

function registerBody(overrides = {}) {
  const stamp = uniq("bbal");
  return {
    church_name: `AutoLogin Church ${stamp}`,
    country: "ZM",
    city: "Lusaka",
    contact_name: "Pastor Auto",
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

describe("V2.04 BB registration auto-login root-cause fix", () => {
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

  it("4 (contract): registration uses requireOrganizationId; login does not force church/branch", () => {
    const routes = read("src/blessboard/http/apexMarketingRoutes.js");
    const establish = read("src/blessboard/services/establishBlessBoardSession.js");
    const auth = read("src/blessboard/services/authenticateBlessBoardUser.js");

    assert.match(routes, /requireOrganizationId:\s*records\.organizationId/);
    assert.doesNotMatch(
      routes,
      /establishSession\([\s\S]*?organizationId:\s*records\.organizationId[\s\S]*?churchId:\s*records\.churchId/
    );
    assert.match(establish, /sessionTenantContextFromPreferred/);
    assert.match(establish, /preferCatalogueSessionRole/);
    assert.match(establish, /classifyEstablishSessionError/);
    assert.match(auth, /requireOrganizationId/);
    assert.doesNotMatch(
      auth,
      /establishBlessBoardSession\(db,\s*\{[\s\S]*churchId:/
    );
  });

  it("4b: forced input church/branch are ignored — preferred catalogue wins", () => {
    const preferred = {
      organization_id: "org-preferred",
      church_id: "church-preferred",
      branch_id: "branch-preferred",
      role_key: "organisation_administrator",
    };
    const tenant = sessionTenantContextFromPreferred(preferred);
    assert.equal(tenant.organizationId, "org-preferred");
    assert.equal(tenant.churchId, "church-preferred");
    assert.equal(tenant.branchId, "branch-preferred");

    const classified = classifyEstablishSessionError({
      code: "23503",
      constraint: "deployment_sessions_church_fkey",
      message: "insert or update on table violates foreign key " + "a".repeat(50),
    });
    assert.equal(classified.code, "fk_violation");
    assert.equal(classified.pgCode, "23503");
    assert.match(classified.message, /\[redacted\]/);
  });

  it("1: brand-new user → registration → session → /hq", async () => {
    requireDb();
    const app = makeApp();
    const body = registerBody();
    const post = await postRegister(app, body);
    assert.equal(post.status, 303, post.text && String(post.text).slice(0, 400));
    assertChurchReadyHqRedirect(post.headers.location);
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid, "session cookie issued");

    const hq = await request(app)
      .get("/hq")
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`)
      .redirects(5);
    assert.equal(hq.status, 200);
    assert.match(hq.text, new RegExp(escapeRe(body.church_name), "i"));
  });

  it("2: reused canonical identity → session → /hq", async () => {
    requireDb();
    const app = makeApp();
    const phoneNational = nextZmNational();
    const email = `${uniq("reuse")}@example.org`;
    const first = registerBody({
      email,
      phone_national: phoneNational,
      church_name: `Reuse First ${uniq("r1")}`,
    });
    const post1 = await postRegister(app, first);
    assert.equal(post1.status, 303);
    assert.ok(extractCookie(post1, DEFAULT_V5_COOKIE));

    const secondName = `Reuse Second ${uniq("r2")}`;
    const post2 = await postRegister(
      app,
      registerBody({
        email,
        phone_national: phoneNational,
        church_name: secondName,
        multi_org_identity_ack: "on",
      })
    );
    assert.equal(post2.status, 303, post2.text && String(post2.text).slice(0, 400));
    assertChurchReadyHqRedirect(post2.headers.location);
    const sid2 = extractCookie(post2, DEFAULT_V5_COOKIE);
    assert.ok(sid2);

    const hq = await request(app)
      .get("/hq")
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid2}`)
      .redirects(5);
    assert.equal(hq.status, 200);
    assert.match(hq.text, new RegExp(escapeRe(secondName), "i"));
  });

  it("3: multi-church admin → correct newly-created church context", async () => {
    requireDb();
    const app = makeApp();
    const phoneNational = nextZmNational();
    const email = `${uniq("multi")}@example.org`;
    const nameA = `Multi Church A ${uniq("a")}`;
    const nameB = `Multi Church B ${uniq("b")}`;
    const postA = await postRegister(
      app,
      registerBody({ email, phone_national: phoneNational, church_name: nameA })
    );
    assert.equal(postA.status, 303);
    const postB = await postRegister(
      app,
      registerBody({
        email,
        phone_national: phoneNational,
        church_name: nameB,
        multi_org_identity_ack: "on",
      })
    );
    assert.equal(postB.status, 303);
    const sid = extractCookie(postB, DEFAULT_V5_COOKIE);
    assert.ok(sid);

    const sessionRow = await pool.query(
      `SELECT organization_id, church_id, branch_id
         FROM platform.deployment_sessions
        WHERE revoked_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`
    );
    assert.ok(sessionRow.rowCount >= 1);
    const orgId = sessionRow.rows[0].organization_id;
    assert.ok(orgId);
    const church = await pool.query(
      `SELECT display_name FROM blessboard.churches WHERE organization_id = $1 LIMIT 1`,
      [orgId]
    );
    assert.match(String(church.rows[0] && church.rows[0].display_name), new RegExp(escapeRe(nameB), "i"));

    const hq = await request(app)
      .get("/hq")
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`)
      .redirects(5);
    assert.equal(hq.status, 200);
    assert.match(hq.text, new RegExp(escapeRe(nameB), "i"));
  });

  it("5: session creation failure → no partial authenticated session", async () => {
    requireDb();
    const app = makeApp({
      establishSession: async () => ({
        ok: false,
        status: "session_create_failed",
        message: "deployment_not_found",
        failureCode: "deployment_not_found",
        rawToken: null,
        session: null,
        user: null,
      }),
    });
    const body = registerBody({ church_name: `Fail Session ${uniq("fs")}` });
    const post = await postRegister(app, body);
    assert.equal(post.status, 303);
    assert.equal(extractCookie(post, DEFAULT_V5_COOKIE), null);
    // Provision still committed (church exists) — no auth cookie.
    const found = await pool.query(
      `SELECT 1 FROM blessboard.churches WHERE display_name = $1 LIMIT 1`,
      [body.church_name]
    );
    assert.equal(found.rowCount, 1);
  });

  it("6: normal /login path still establishes session via shared helper (unchanged contract)", async () => {
    requireDb();
    const app = makeApp();
    const body = registerBody({ church_name: `Login Path ${uniq("lp")}` });
    const post = await postRegister(app, body);
    assert.equal(post.status, 303);
    // Clear by using authenticate helper directly (same as /login).
    const auth = await authenticateBlessBoardUser(pool, {
      identifier: body.email,
      email: body.email,
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
    });
    assert.equal(auth.ok, true, auth.message || auth.status);
    assert.ok(auth.rawToken);
    assert.ok(auth.tenantContext || auth.session);
  });

  it("7: cross-tenant isolation — establish with requireOrganizationId cannot attach foreign org", async () => {
    requireDb();
    const app = makeApp();
    const a = registerBody({ church_name: `Iso A ${uniq("ia")}` });
    const b = registerBody({ church_name: `Iso B ${uniq("ib")}` });
    const postA = await postRegister(app, a);
    const postB = await postRegister(app, b);
    assert.equal(postA.status, 303);
    assert.equal(postB.status, 303);

    const userA = await pool.query(
      `SELECT id FROM blessboard.users WHERE email_normalized = $1 LIMIT 1`,
      [String(a.email).toLowerCase()]
    );
    const orgB = await pool.query(
      `SELECT organization_id FROM blessboard.churches WHERE display_name = $1 LIMIT 1`,
      [b.church_name]
    );
    assert.ok(userA.rowCount && orgB.rowCount);

    const hijack = await establishBlessBoardSession(pool, {
      userId: userA.rows[0].id,
      deploymentCode: DEPLOYMENT,
      requireOrganizationId: orgB.rows[0].organization_id,
    });
    assert.equal(hijack.ok, false);
    assert.equal(hijack.status, "no_active_role");
    assert.equal(hijack.session, null);
    assert.equal(hijack.rawToken, undefined);
  });
});
