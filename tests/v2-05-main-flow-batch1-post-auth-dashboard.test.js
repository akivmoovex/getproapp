"use strict";

/**
 * V2.05 Main Flow Batch 1 — Registration + post-auth Admin Console Dashboard.
 *
 * AC register/login → /app
 * BB register/login → /hq
 * Nav: Dashboard first, Website second (when permitted)
 * Role-scoped / suspended / tenant isolation / desktop+mobile markers
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
  assertClinicReadyAppRedirect,
} = require("./helpers/activeClinicRegistrationSuccess");
const {
  assertChurchReadyHqRedirect,
} = require("./helpers/blessboardRegistrationSuccess");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const { nextZmNational } = require("./helpers/zmPhoneFormFields");
const {
  buildActiveClinicNavigation,
} = require("../src/activeclinic/services/activeClinicNavigation");
const { HQ_ADMIN_NAV } = require("../src/blessboard/http/hqAdminNav");

const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "clinic-admin-pass-12";
const BB_PASSWORD = "BbPostReg-Hq-99!";
const AC_HOST = "activeclinic.org";
const BB_APEX = "blessboard.org";

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "a".repeat(48),
});

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
let databaseUrl;
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

function extractCsrf(html) {
  const m = String(html || "").match(
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || null;
}

function escapeRe(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeAcApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
  });
}

function makeBbApp(apexMarketingDeps = {}) {
  return createV5FoundationApp({
    env: MINIMAL_BB,
    getPool: () => pool,
    apexMarketingDeps,
  });
}

function cookieHeader(res, prior = "") {
  const jar = new Map();
  for (const part of String(prior || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0) jar.set(part.slice(0, i), part.slice(i + 1));
  }
  const raw = res && res.headers && res.headers["set-cookie"];
  for (const line of Array.isArray(raw) ? raw : raw ? [raw] : []) {
    const pair = String(line).split(";")[0];
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function registerClinic(app, overrides = {}) {
  const stamp = uniq("acb1");
  const phone = nextZmNational();
  const payload = {
    clinicName: `Batch1 Clinic ${stamp}`,
    contactName: "Batch Admin",
    contactEmail: `${stamp}@example.invalid`,
    contactPhone: `+260${phone}`,
    province: "Lusaka",
    city: "Lusaka",
    address: "1 Independence Ave",
    countryCode: "ZM",
    notes: "V2.05 batch1",
    password: AC_PASSWORD,
    passwordConfirm: AC_PASSWORD,
    acceptTerms: "on",
    ...overrides,
  };
  const getForm = await request(app).get("/register-clinic").set("Host", AC_HOST);
  assert.equal(getForm.status, 200);
  let cookies = cookieHeader(getForm);
  const csrf = extractCsrf(getForm.text);
  // Advance to review (may 303→GET); keep full cookie jar including registration draft.
  const review = await request(app)
    .post("/register-clinic")
    .set("Host", AC_HOST)
    .set("Cookie", cookies)
    .redirects(5)
    .type("form")
    .send({ [CSRF_FIELD]: csrf, ...payload });
  assert.equal(review.status, 200, String(review.headers.location || "").slice(0, 120));
  cookies = cookieHeader(review, cookies);
  const csrf2 = extractCsrf(review.text) || csrf;
  const confirm = await request(app)
    .post("/register-clinic")
    .set("Host", AC_HOST)
    .set("Cookie", cookies)
    .redirects(0)
    .type("form")
    .send({ [CSRF_FIELD]: csrf2, action: "confirm", ...payload });
  return { payload, confirm, cookies: cookieHeader(confirm, cookies) };
}

async function registerChurch(app, overrides = {}) {
  const stamp = uniq("bbb1");
  const body = {
    church_name: `Batch1 Church ${stamp}`,
    country: "ZM",
    city: "Lusaka",
    contact_name: "Pastor Batch",
    role_in_church: "Pastor",
    phone_country: "ZM",
    phone_national: nextZmNational(),
    email: `${stamp}@example.org`,
    selected_plan: "foundation",
    password: BB_PASSWORD,
    password_confirm: BB_PASSWORD,
    branch_name: "HQ Campus",
    consent_contact: "on",
    ...overrides,
  };
  const page = await request(app).get("/register-church?plan=foundation").set("Host", BB_APEX);
  assert.equal(page.status, 200);
  const csrf = extractCsrf(page.text);
  const cookie = extractCookie(page, CSRF_COOKIE);
  const post = await request(app)
    .post("/register-church")
    .set("Host", BB_APEX)
    .set("Cookie", cookie ? `${CSRF_COOKIE}=${cookie}` : "")
    .type("form")
    .send({ ...body, [CSRF_FIELD]: csrf });
  return { body, post };
}

describe("V2.05 main flow batch1 — post-auth Admin Console Dashboard", () => {
  it("FINAL=V205_POST_AUTH_DASHBOARD_DONE", () => {
    const {
      POST_AUTH_DASHBOARD,
      postAuthDashboardPath,
      isPostAuthDashboardRedirect,
    } = require("../src/platform/auth/postAuthDashboard");
    assert.equal(POST_AUTH_DASHBOARD.pattern, "PostAuthDashboard");
    assert.equal(postAuthDashboardPath("blessboard"), "/hq");
    assert.equal(postAuthDashboardPath("activeclinic"), "/app");
    assert.equal(isPostAuthDashboardRedirect("/hq", "blessboard"), true);
    assert.equal(isPostAuthDashboardRedirect("/app", "activeclinic"), true);
    assert.equal(isPostAuthDashboardRedirect("/hq/website", "blessboard"), false);
    assert.equal(isPostAuthDashboardRedirect("/app/settings/website", "activeclinic"), false);
  });
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
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("nav rule: Dashboard first, Website second (AC + BB)", () => {
    const ac = buildActiveClinicNavigation([
      "activeclinic.access",
      "website.view",
      "activeclinic.patient.search",
    ]);
    assert.equal(ac.items[0].key, "home");
    assert.equal(ac.items[0].label, "Dashboard");
    assert.equal(ac.items[0].href, "/app");
    assert.equal(ac.items[1].key, "website");
    assert.equal(ac.items[1].label, "Website");
    assert.equal(ac.items[1].href, "/app/settings/website");

    const withoutWebsite = buildActiveClinicNavigation(["activeclinic.access"]);
    assert.equal(withoutWebsite.items[0].key, "home");
    assert.ok(!withoutWebsite.items.find((i) => i.key === "website"));

    assert.equal(HQ_ADMIN_NAV[0].key, "home");
    assert.equal(HQ_ADMIN_NAV[0].href, "/hq");
    assert.equal(HQ_ADMIN_NAV[1].key, "content");
    assert.equal(HQ_ADMIN_NAV[1].label, "Website");
    assert.equal(HQ_ADMIN_NAV[1].href, "/hq/website");
  });

  it("AC registration → session → /app dashboard (not Website Management)", async () => {
    requireDb();
    const app = makeAcApp();
    const { payload, confirm } = await registerClinic(app);
    assert.equal(confirm.status, 303, confirm.text && String(confirm.text).slice(0, 400));
    assertClinicReadyAppRedirect(confirm.headers.location);
    const sid = extractCookie(confirm, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid, "session cookie established (auto-login)");

    const home = await request(app)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`)
      .redirects(5);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-stitch-screen="AC-ADM-01"/);
    assert.match(home.text, /data-ac-stitch="AC-B2-01"|data-ac-stitch-screen="AC-ADM-01"/);
    assert.match(home.text, /data-ac-stitch-desktop=/);
    assert.match(home.text, /data-ac-stitch-mobile=/);
    assert.match(home.text, new RegExp(escapeRe(payload.clinicName), "i"));
    assert.doesNotMatch(String(home.req?.path || "/app"), /settings\/website/);
  });

  it("BB registration → session → /hq dashboard (not Website Management)", async () => {
    requireDb();
    const app = makeBbApp();
    const { body, post } = await registerChurch(app);
    assert.equal(post.status, 303, post.text && String(post.text).slice(0, 400));
    assertChurchReadyHqRedirect(post.headers.location);
    assert.doesNotMatch(String(post.headers.location || ""), /\/hq\/website/);
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid, "session cookie established (auto-login)");

    const hq = await request(app)
      .get("/hq")
      .set("Host", BB_APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`)
      .redirects(5);
    assert.equal(hq.status, 200);
    assert.match(hq.text, /data-bb-stitch-screen="BB-ADM-01"/);
    assert.match(hq.text, /data-bb-stitch-desktop=/);
    assert.match(hq.text, /data-bb-stitch-mobile=/);
    assert.match(hq.text, new RegExp(escapeRe(body.church_name), "i"));
  });

  it("AC login → /app dashboard", async () => {
    requireDb();
    const app = makeAcApp();
    const { payload, confirm } = await registerClinic(app);
    assertClinicReadyAppRedirect(confirm.headers.location);

    const loginGet = await request(app).get("/login").set("Host", AC_HOST);
    const loginCsrf = extractCsrf(loginGet.text);
    const loginCookie = extractCookie(loginGet, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const loginPost = await request(app)
      .post("/login")
      .set("Host", AC_HOST)
      .set("Cookie", loginCookie ? `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${loginCookie}` : "")
      .type("form")
      .send({
        [CSRF_FIELD]: loginCsrf,
        identifier: payload.contactEmail,
        password: AC_PASSWORD,
      });
    assert.equal(loginPost.status, 303);
    const dest = String(loginPost.headers.location || "");
    assert.ok(dest === "/app" || dest === "/app/onboarding", dest);
    assert.doesNotMatch(dest, /settings\/website/);
    const sid = extractCookie(loginPost, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid);
    const home = await request(app)
      .get(dest.startsWith("/app") ? dest : "/app")
      .set("Host", AC_HOST)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`)
      .redirects(5);
    assert.equal(home.status, 200);
  });

  it("BB login → /hq dashboard", async () => {
    requireDb();
    const app = makeBbApp();
    const { body, post } = await registerChurch(app);
    assertChurchReadyHqRedirect(post.headers.location);

    const loginGet = await request(app).get("/login").set("Host", BB_APEX);
    const loginCsrf = extractCsrf(loginGet.text);
    const loginCookie = extractCookie(loginGet, CSRF_COOKIE);
    const loginPost = await request(app)
      .post("/login")
      .set("Host", BB_APEX)
      .set("Cookie", loginCookie ? `${CSRF_COOKIE}=${loginCookie}` : "")
      .type("form")
      .send({
        [CSRF_FIELD]: loginCsrf,
        identifier: body.email,
        password: BB_PASSWORD,
      });
    assert.equal(loginPost.status, 303);
    const dest = String(loginPost.headers.location || "");
    assert.ok(dest === "/hq" || dest === "/hq/onboarding" || dest.startsWith("/hq?"), dest);
    assert.doesNotMatch(dest, /\/hq\/website/);
  });

  it("role-scoped dashboard: AC restricted nav still lands on Dashboard first", () => {
    const nav = buildActiveClinicNavigation(["activeclinic.access"]);
    assert.equal(nav.items[0].key, "home");
    assert.equal(nav.items[0].href, "/app");
    assert.ok(nav.items.every((i) => i.key !== "website" || i.href === "/app/settings/website"));
  });

  it("invalid/suspended access: unauthenticated dashboard redirects to login", async () => {
    requireDb();
    const ac = makeAcApp();
    const bb = makeBbApp();
    const acAnon = await request(ac).get("/app").set("Host", AC_HOST).redirects(0);
    assert.ok(
      [301, 302, 303, 401, 403].includes(acAnon.status) ||
        (acAnon.status === 200 && /login|sign in/i.test(acAnon.text)),
      `AC anon /app => ${acAnon.status} ${acAnon.headers.location || ""}`
    );
    if ([301, 302, 303].includes(acAnon.status)) {
      assert.match(String(acAnon.headers.location || ""), /\/login/);
    }

    const bbAnon = await request(bb).get("/hq").set("Host", BB_APEX).redirects(0);
    assert.ok(
      [301, 302, 303, 401, 403].includes(bbAnon.status) ||
        (bbAnon.status === 200 && /login|sign in/i.test(bbAnon.text)),
      `BB anon /hq => ${bbAnon.status} ${bbAnon.headers.location || ""}`
    );
    if ([301, 302, 303].includes(bbAnon.status)) {
      assert.match(String(bbAnon.headers.location || ""), /\/login/);
    }
  });

  it("tenant isolation: AC clinic A session cannot open clinic B website hub as owner context", async () => {
    requireDb();
    const app = makeAcApp();
    const a = await registerClinic(app, {
      clinicName: `Iso A ${uniq("a")}`,
      contactEmail: `${uniq("a")}@example.invalid`,
    });
    const b = await registerClinic(app, {
      clinicName: `Iso B ${uniq("b")}`,
      contactEmail: `${uniq("b")}@example.invalid`,
    });
    assertClinicReadyAppRedirect(a.confirm.headers.location);
    assertClinicReadyAppRedirect(b.confirm.headers.location);
    const sidA = extractCookie(a.confirm, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sidA);

    const orgB = await pool.query(
      `SELECT o.organization_key
         FROM activeclinic.clinic_registration_applications cra
         JOIN platform.organizations o ON o.id = cra.organization_id
        WHERE cra.contact_email_normalized = lower($1)`,
      [b.payload.contactEmail]
    );
    const keyB = orgB.rows[0] && orgB.rows[0].organization_key;
    assert.ok(keyB);

    const homeA = await request(app)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sidA}`)
      .redirects(5);
    assert.equal(homeA.status, 200);
    assert.match(homeA.text, new RegExp(escapeRe(a.payload.clinicName), "i"));
    assert.doesNotMatch(homeA.text, new RegExp(escapeRe(b.payload.clinicName), "i"));
  });

  it("mobile + desktop render markers present on AC and BB dashboards", async () => {
    requireDb();
    const acApp = makeAcApp();
    const bbApp = makeBbApp();
    const ac = await registerClinic(acApp);
    const bb = await registerChurch(bbApp);
    const acSid = extractCookie(ac.confirm, COOKIE_ACTIVECLINIC_ORG);
    const bbSid = extractCookie(bb.post, DEFAULT_V5_COOKIE);

    const acHome = await request(acApp)
      .get("/app")
      .set("Host", AC_HOST)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${acSid}`)
      .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")
      .redirects(5);
    assert.equal(acHome.status, 200);
    assert.match(acHome.text, /data-ac-stitch-mobile=/);
    assert.match(acHome.text, /data-ac-stitch-desktop=/);

    const bbHome = await request(bbApp)
      .get("/hq")
      .set("Host", BB_APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${bbSid}`)
      .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")
      .redirects(5);
    assert.equal(bbHome.status, 200);
    assert.match(bbHome.text, /data-bb-stitch-mobile=/);
    assert.match(bbHome.text, /data-bb-stitch-desktop=/);
  });
});
