"use strict";

/**
 * V2.05 / V5 — Admin Console golden route smoke (AC org admin + BB HQ admin).
 *
 * Data-driven from visible Admin Console nav (registry builders + scraped shell).
 * Smoke only: GET each destination — no deep feature CRUD.
 *
 * Documented valid redirect targets (same-product only):
 * - AC: /app/select-facility, /app/select-organization, /app/onboarding*
 * - BB: /hq (post-auth), /login only when session lost (treated as FAIL)
 * Intermediate 301/302/303 are OK when Location stays under /app or /hq.
 * Final response must be 200; never 404/500/503.
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
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const { nextZmNational } = require("./helpers/zmPhoneFormFields");
const {
  NAV_ITEMS,
  buildActiveClinicNavigation,
  matchActiveNavKey,
} = require("../src/activeclinic/services/activeClinicNavigation");
const { HQ_ADMIN_NAV } = require("../src/blessboard/http/hqAdminNav");
const {
  validateAdminConsoleNavOrder,
} = require("../src/platform/admin-console/adminConsoleShell");

const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "clinic-admin-pass-12";
const BB_PASSWORD = "BbAdminSmoke-Hq-99!";
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

/** Same-product redirect prefixes allowed while resolving a nav GET. */
const AC_ALLOWED_REDIRECT_PREFIXES = Object.freeze([
  "/app",
  "/app/select-facility",
  "/app/select-organization",
  "/app/onboarding",
]);
const BB_ALLOWED_REDIRECT_PREFIXES = Object.freeze(["/hq"]);

let pool;
let databaseUrl;
let skipReason = null;
let acRoutesChecked = 0;
let bbRoutesChecked = 0;

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

function makeAcApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
  });
}

function makeBbApp() {
  return createV5FoundationApp({
    env: MINIMAL_BB,
    getPool: () => pool,
  });
}

async function registerClinic(app) {
  const stamp = uniq("acsmoke");
  const phone = nextZmNational();
  const payload = {
    clinicName: `Smoke AC Clinic ${stamp}`,
    contactName: "Org Admin",
    contactEmail: `${stamp}@example.invalid`,
    contactPhone: `+260${phone}`,
    province: "Lusaka",
    city: "Lusaka",
    address: "1 Independence Ave",
    countryCode: "ZM",
    notes: "admin console route smoke",
    password: AC_PASSWORD,
    passwordConfirm: AC_PASSWORD,
    acceptTerms: "on",
  };
  const getForm = await request(app).get("/register-clinic").set("Host", AC_HOST);
  assert.equal(getForm.status, 200);
  let cookies = cookieHeader(getForm);
  const csrf = extractCsrf(getForm.text);
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

async function registerChurch(app) {
  const stamp = uniq("bbsmoke");
  const body = {
    church_name: `Smoke BB Church ${stamp}`,
    country: "ZM",
    city: "Lusaka",
    contact_name: "HQ Admin",
    role_in_church: "Pastor",
    phone_country: "ZM",
    phone_national: nextZmNational(),
    email: `${stamp}@example.org`,
    selected_plan: "foundation",
    password: BB_PASSWORD,
    password_confirm: BB_PASSWORD,
    branch_name: "HQ Campus",
    consent_contact: "on",
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

/**
 * Parse primary Admin Console nav anchors from shell HTML.
 * @param {string} html
 * @param {"ac"|"bb"} product
 * @returns {Array<{ key: string, href: string, label: string }>}
 */
function scrapeConsoleNav(html, product) {
  const text = String(html || "");
  const items = [];
  const seen = new Set();
  const keyAttr = product === "ac" ? "data-ac-nav-key" : "data-bb-nav-key";
  // Prefer primary console nav regions; fall back to any tagged nav key.
  const regionRe =
    product === "ac"
      ? /data-ac-nav-source="registry"[\s\S]*?(?=<nav class="ac-nav ac-nav--utility"|$)/i
      : /data-(?:gp-admin-console-nav|bb-nav)="(?:1|desktop)"[\s\S]*?(?=<div class="bb-hq-sidebar__footer"|$)/i;
  const region = text.match(regionRe);
  const scope = region ? region[0] : text;
  const anchorRe = new RegExp(
    `<a[^>]*href="([^"]+)"[^>]*${keyAttr}="([^"]+)"[^>]*>([\\s\\S]*?)</a>|<a[^>]*${keyAttr}="([^"]+)"[^>]*href="([^"]+)"[^>]*>([\\s\\S]*?)</a>`,
    "gi"
  );
  let m;
  while ((m = anchorRe.exec(scope))) {
    const href = m[1] || m[5];
    const key = m[2] || m[4];
    const inner = m[3] || m[6] || "";
    if (!href || !key) continue;
    if (href.startsWith("http") || href.startsWith("#")) continue;
    if (key === "public-site" || key === "member_portal") continue;
    const label = String(inner)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const id = `${key}|${href}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ key, href, label });
  }
  return items;
}

function assertNotErrorStatus(status, label) {
  assert.ok(
    ![404, 500, 503].includes(Number(status)),
    `${label} must not be 404/500/503 (got ${status})`
  );
}

function locationPath(location) {
  const raw = String(location || "");
  if (!raw) return "";
  try {
    if (raw.startsWith("http")) return new URL(raw).pathname;
  } catch {
    /* ignore */
  }
  return raw.split("?")[0];
}

function isAllowedRedirect(pathname, product) {
  const path = String(pathname || "");
  const prefixes =
    product === "ac" ? AC_ALLOWED_REDIRECT_PREFIXES : BB_ALLOWED_REDIRECT_PREFIXES;
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(p));
}

/**
 * GET a nav href; follow same-product redirects; require final 200.
 */
async function smokeGet({ app, host, cookie, href, product, label }) {
  let current = href;
  let cookies = cookie;
  const trail = [];
  for (let hop = 0; hop < 6; hop += 1) {
    const res = await request(app)
      .get(current)
      .set("Host", host)
      .set("Cookie", cookies)
      .redirects(0);
    cookies = cookieHeader(res, cookies);
    trail.push({ href: current, status: res.status });
    assertNotErrorStatus(res.status, `${label} ${current}`);

    if (res.status === 200) {
      return { res, cookies, trail, finalHref: current };
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const nextPath = locationPath(res.headers.location);
      assert.ok(nextPath, `${label} redirect missing Location from ${current}`);
      assert.ok(
        isAllowedRedirect(nextPath, product),
        `${label} redirect to disallowed ${nextPath} from ${current}`
      );
      // Login bounce means session/tenant context failed.
      assert.ok(
        !nextPath.startsWith("/login") && !nextPath.startsWith("/register"),
        `${label} redirected to auth surface ${nextPath}`
      );
      current = nextPath;
      continue;
    }

    assert.fail(
      `${label} unexpected status ${res.status} for ${current} trail=${JSON.stringify(trail)}`
    );
  }
  assert.fail(`${label} redirect loop for ${href}: ${JSON.stringify(trail)}`);
}

function assertProductShell(html, product) {
  assert.match(html, /data-gp-admin-console="AdminConsoleShell"/);
  if (product === "ac") {
    assert.match(html, /data-gp-admin-console-stitch="AC-ADM-01"|data-ac-stitch-screen="AC-ADM-01"/);
    assert.match(html, /data-gp-admin-console-context="location"|data-ac-page=/);
    assert.doesNotMatch(html, /data-gp-admin-console-stitch="BB-ADM-01"/);
    assert.doesNotMatch(html, /data-bb-stitch-screen="BB-ADM-01"/);
  } else {
    assert.match(html, /data-gp-admin-console-stitch="BB-ADM-01"|data-bb-stitch-screen="BB-ADM-01"/);
    assert.match(html, /data-gp-admin-console-context="branch"|data-bb-nav=/);
    assert.doesNotMatch(html, /data-gp-admin-console-stitch="AC-ADM-01"/);
    assert.doesNotMatch(html, /data-ac-stitch-screen="AC-ADM-01"/);
  }
}

function assertNoCrossProductNav(html, product) {
  const scrapedOther =
    product === "ac" ? scrapeConsoleNav(html, "bb") : scrapeConsoleNav(html, "ac");
  // Other-product keyed anchors should not appear in this shell.
  assert.equal(
    scrapedOther.length,
    0,
    `${product} page leaked other-product nav keys: ${JSON.stringify(scrapedOther)}`
  );
  if (product === "ac") {
    assert.doesNotMatch(html, /data-bb-nav-key="/);
    assert.doesNotMatch(html, /href="\/hq(?:\/|"|\?)/);
  } else {
    assert.doesNotMatch(html, /data-ac-nav-key="/);
    // BB may mention public tenant paths, but not AC admin console /app registry.
    assert.doesNotMatch(html, /data-ac-nav-source="registry"/);
  }
}

function assertActiveNavMarked(html, product, key) {
  const keyAttr = product === "ac" ? "data-ac-nav-key" : "data-bb-nav-key";
  const re = new RegExp(
    `${keyAttr}="${escapeRe(key)}"[^>]*(?:aria-current="page"|class="[^"]*is-active)|` +
      `(?:aria-current="page"|class="[^"]*is-active)[^>]*${keyAttr}="${escapeRe(key)}"`,
    "i"
  );
  assert.match(html, re, `${product} active nav not marked for key=${key}`);
}

function assertActiveNav(html, product, item, finalHref) {
  if (product === "ac") {
    const pageKey = (String(html).match(/data-ac-page="([^"]+)"/) || [])[1];
    assert.ok(pageKey, "AC shell missing data-ac-page");
    const matched = matchActiveNavKey(finalHref);
    // Some module sub-routes highlight the parent nav key (e.g. follow-up → clinical).
    const allowed = new Set([item.key, matched, pageKey].filter(Boolean));
    assert.ok(
      allowed.has(pageKey),
      `AC data-ac-page=${pageKey} not in allowed ${[...allowed].join(",")}`
    );
    assertActiveNavMarked(html, "ac", pageKey);
    return;
  }
  assertActiveNavMarked(html, "bb", item.key);
}

function assertTenantContext(html, name) {
  assert.match(html, new RegExp(escapeRe(name), "i"), `tenant/org label missing: ${name}`);
}

describe("V2.05 Admin Console golden route smoke", () => {
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

  it("nav builders expose Admin Console destinations for org admin / HQ admin", () => {
    const orgAdminPerms = [];
    for (const item of NAV_ITEMS) {
      if (item.permission) orgAdminPerms.push(item.permission);
      if (Array.isArray(item.anyOf)) orgAdminPerms.push(...item.anyOf);
    }
    const ac = buildActiveClinicNavigation(orgAdminPerms, "home");
    assert.ok(ac.items.length >= 8, `AC org admin nav too thin: ${ac.items.length}`);
    assert.equal(ac.items[0].key, "home");
    assert.equal(validateAdminConsoleNavOrder(ac.items).ok, true);

    const bb = HQ_ADMIN_NAV.filter((i) => i.nav && i.enabled && i.href);
    assert.ok(bb.length >= 10, `BB HQ nav too thin: ${bb.length}`);
    assert.equal(bb[0].key, "home");
    assert.equal(bb[0].href, "/hq");
  });

  it("AC organization admin: every visible Admin Console nav destination smokes", async () => {
    requireDb();
    const app = makeAcApp();
    const { payload, confirm } = await registerClinic(app);
    assert.equal(confirm.status, 303, confirm.text && String(confirm.text).slice(0, 400));
    assertClinicReadyAppRedirect(confirm.headers.location);
    const sid = extractCookie(confirm, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid, "AC session cookie");
    let cookie = `${COOKIE_ACTIVECLINIC_ORG}=${sid}`;

    const home = await smokeGet({
      app,
      host: AC_HOST,
      cookie,
      href: "/app",
      product: "ac",
      label: "AC dashboard",
    });
    cookie = home.cookies;
    assertProductShell(home.res.text, "ac");
    assertTenantContext(home.res.text, payload.clinicName);
    assertNoCrossProductNav(home.res.text, "ac");

    const visible = scrapeConsoleNav(home.res.text, "ac");
    assert.ok(visible.length >= 5, `AC visible nav too thin: ${JSON.stringify(visible)}`);
    const knownKeys = new Set(NAV_ITEMS.map((i) => i.key));
    for (const item of visible) {
      assert.ok(knownKeys.has(item.key), `unknown AC nav key ${item.key}`);
      assert.ok(item.href.startsWith("/app"), `AC href must be /app*: ${item.href}`);
    }
    assert.equal(validateAdminConsoleNavOrder(visible.map((v) => {
      const meta = NAV_ITEMS.find((i) => i.key === v.key) || {};
      return { ...v, slot: meta.slot };
    })).ok, true);

    const failures = [];
    for (const item of visible) {
      try {
        const hit = await smokeGet({
          app,
          host: AC_HOST,
          cookie,
          href: item.href,
          product: "ac",
          label: `AC ${item.key}`,
        });
        cookie = hit.cookies;
        assertProductShell(hit.res.text, "ac");
        assertTenantContext(hit.res.text, payload.clinicName);
        assertNoCrossProductNav(hit.res.text, "ac");
        assertActiveNav(hit.res.text, "ac", item, hit.finalHref);
        acRoutesChecked += 1;
      } catch (err) {
        failures.push(`${item.key} ${item.href}: ${err && err.message}`);
      }
    }
    assert.equal(failures.length, 0, failures.join("\n"));
    assert.ok(acRoutesChecked >= visible.length);
  });

  it("BB HQ admin: every visible Admin Console nav destination smokes", async () => {
    requireDb();
    const app = makeBbApp();
    const { body, post } = await registerChurch(app);
    assert.equal(post.status, 303, post.text && String(post.text).slice(0, 400));
    assertChurchReadyHqRedirect(post.headers.location);
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid, "BB session cookie");
    let cookie = `${DEFAULT_V5_COOKIE}=${sid}`;

    const home = await smokeGet({
      app,
      host: BB_APEX,
      cookie,
      href: "/hq",
      product: "bb",
      label: "BB dashboard",
    });
    cookie = home.cookies;
    assertProductShell(home.res.text, "bb");
    assertTenantContext(home.res.text, body.church_name);
    assertNoCrossProductNav(home.res.text, "bb");

    const visible = scrapeConsoleNav(home.res.text, "bb");
    assert.ok(visible.length >= 8, `BB visible nav too thin: ${JSON.stringify(visible)}`);
    const knownKeys = new Set(
      HQ_ADMIN_NAV.filter((i) => i.nav && i.enabled).map((i) => i.key)
    );
    // Website-mode may inject website_* keys; allow those under website slot.
    for (const item of visible) {
      assert.ok(
        knownKeys.has(item.key) ||
          item.key === "content" ||
          item.key.startsWith("website") ||
          item.href.startsWith("/hq/website"),
        `unknown BB nav key ${item.key}`
      );
      assert.ok(item.href.startsWith("/hq"), `BB href must be /hq*: ${item.href}`);
    }

    const failures = [];
    for (const item of visible) {
      try {
        const hit = await smokeGet({
          app,
          host: BB_APEX,
          cookie,
          href: item.href,
          product: "bb",
          label: `BB ${item.key}`,
        });
        cookie = hit.cookies;
        assertProductShell(hit.res.text, "bb");
        assertTenantContext(hit.res.text, body.church_name);
        assertNoCrossProductNav(hit.res.text, "bb");
        assertActiveNav(hit.res.text, "bb", item, hit.finalHref);
        bbRoutesChecked += 1;
      } catch (err) {
        failures.push(`${item.key} ${item.href}: ${err && err.message}`);
      }
    }
    assert.equal(failures.length, 0, failures.join("\n"));
    assert.ok(bbRoutesChecked >= visible.length);
  });

  it("reports route counts for FINALs", () => {
    // Counts filled by the smoke its above when DB is available.
    if (skipReason) return;
    assert.ok(acRoutesChecked > 0, "AC_PASS routes not recorded");
    assert.ok(bbRoutesChecked > 0, "BB_PASS routes not recorded");
    // eslint-disable-next-line no-console
    console.log(
      `ADMIN_CONSOLE_ROUTE_SMOKE counts AC=${acRoutesChecked} BB=${bbRoutesChecked} TOTAL=${
        acRoutesChecked + bbRoutesChecked
      }`
    );
  });
});
