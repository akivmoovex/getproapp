"use strict";

/**
 * BB-REG-WEB-01 — Post-registration website editor routing (success receipt).
 * V2.04: POST /register-church → authenticated /hq (no success detour).
 * Success page remains reachable by stored ref; primary Edit CTA when visited.
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
  loadPublicRegistrationReference,
  buildChurchReadySuccessPath,
} = require("./helpers/blessboardRegistrationSuccess");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { nextZmNational } = require("./helpers/zmPhoneFormFields");
const {
  resolveBlessBoardRegistrationSuccessWebsite,
} = require("../src/blessboard/services/resolveRegistrationSuccessWebsite");
const {
  buildPublicWebsiteEditPath,
  PRODUCT_CODE,
} = require("../src/platform/website/publicWebsiteUrl");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "BbPostReg-Edit-12!";
const APEX = "blessboard.org";

const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
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

function decodeHref(raw) {
  return String(raw || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

function extractPrimaryEditHref(html) {
  const primary = String(html).match(
    /href="([^"]+)"[^>]*data-bb-primary-edit-website="1"|data-bb-primary-edit-website="1"[^>]*href="([^"]+)"/
  );
  if (primary) return decodeHref(primary[1] || primary[2]);
  const any = String(html).match(
    /href="([^"]+)"[^>]*data-bb-build-website="1"|data-bb-build-website="1"[^>]*href="([^"]+)"/
  );
  return any ? decodeHref(any[1] || any[2]) : null;
}

function makeApp() {
  return createV5FoundationApp({
    env: MINIMAL_BB,
    getPool: () => pool,
  });
}

async function registerChurch(overrides) {
  const app = makeApp();
  const getRes = await request(app).get("/register-church?plan=foundation").set("Host", APEX);
  const csrf = extractCsrfToken(getRes.text);
  const csrfCookie = extractCookie(getRes, CSRF_COOKIE);
  const stamp = uniq("bbregweb01");
  const body = {
    church_name: `EditRoute Church ${stamp}`,
    country: "ZM",
    city: "Lusaka",
    contact_name: "Pastor Edit",
    role_in_church: "Pastor",
    phone_country: "ZM",
    phone_national: nextZmNational(),
    email: `${stamp}@example.org`,
    selected_plan: "foundation",
    password: PASSWORD,
    password_confirm: PASSWORD,
    branch_name: "HQ Campus",
    consent_contact: "on",
    [CSRF_FIELD]: csrf,
    ...overrides,
  };
  const post = await request(app)
    .post("/register-church")
    .set("Host", APEX)
    .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
    .type("form")
    .send(body);
  return { app, body, post };
}

describe("BB-REG-WEB-01 post-registration website editor route", () => {
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

  it("A–F + J: POST → /hq authenticated; success receipt Edit CTA remains canonical", async () => {
    requireDb();
    const { app, body, post } = await registerChurch();
    assert.equal(post.status, 303, post.text && String(post.text).slice(0, 400));
    assertChurchReadyHqRedirect(post.headers.location);
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid, "session cookie");

    const ref = await loadPublicRegistrationReference(pool, body.email);
    assert.ok(ref, "public registration reference stored");
    const sessionOrg = await pool.query(
      `SELECT organization_id, public_registration_reference
         FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    assert.equal(sessionOrg.rowCount, 1);
    const organizationId = sessionOrg.rows[0].organization_id;

    const resolved = await resolveBlessBoardRegistrationSuccessWebsite(pool, {
      reference: ref,
      ready: true,
      sessionOrganizationId: organizationId,
    });
    assert.equal(resolved.showWebsite, true);
    assert.ok(resolved.organizationKey, "organizationKey from provisioned church");
    assert.ok(resolved.branchKey, "branchKey from provisioned church");
    assert.match(resolved.editPath, new RegExp(`^/c/${resolved.organizationKey}/`));
    assert.match(resolved.editPath, /website_edit=1/);
    assert.match(resolved.editPath, /website_mode=draft/);

    const expectedEdit = buildPublicWebsiteEditPath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey: resolved.organizationKey,
      scope: { kind: "branch", branchKey: resolved.branchKey },
    });
    assert.equal(resolved.editPath, expectedEdit);

    const hq = await request(app)
      .get("/hq")
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`)
      .redirects(5);
    assert.ok(
      hq.status === 200 ||
        (hq.status === 303 && /^\/hq(\/|$)/.test(String(hq.headers.location || ""))),
      `post-reg /hq got ${hq.status}`
    );

    const success = await request(app)
      .get(buildChurchReadySuccessPath(ref))
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`);
    assert.equal(success.status, 200);
    assert.match(success.text, /Edit your website/);
    assert.match(success.text, /data-bb-primary-edit-website="1"/);
    const href = extractPrimaryEditHref(success.text);
    assert.equal(href, expectedEdit);
    assert.doesNotMatch(href, /^\/hq(?:\?|$)/);

    // Dashboard remains available as secondary on success receipt
    assert.match(success.text, /data-bb-continue-dashboard="1"/);
    assert.match(success.text, /href="\/hq"/);
    assert.match(success.text, /data-bb-dashboard-secondary="1"/);

    const edit = await request(app)
      .get(expectedEdit)
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`)
      .redirects(5);
    assert.equal(edit.status, 200);
    assert.match(edit.text, /data-website-chrome|data-gp-website-editor|data-website-start|website_edit/);
    assert.match(
      edit.text,
      new RegExp(body.church_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    );

    const refresh = await request(app)
      .get(expectedEdit)
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`)
      .redirects(5);
    assert.equal(refresh.status, 200);
    assert.match(refresh.text, /data-website-chrome|data-gp-website-editor|data-website-start|website_edit/);
  });

  it("G: correct organization/branch in edit CTA for distinct churches", async () => {
    requireDb();
    const a = await registerChurch({ church_name: `Alpha ${uniq("g")}` });
    const b = await registerChurch({ church_name: `Beta ${uniq("g")}` });
    assert.equal(a.post.status, 303);
    assert.equal(b.post.status, 303);
    assertChurchReadyHqRedirect(a.post.headers.location);
    assertChurchReadyHqRedirect(b.post.headers.location);
    const sidA = extractCookie(a.post, DEFAULT_V5_COOKIE);
    const sidB = extractCookie(b.post, DEFAULT_V5_COOKIE);
    const refA = await loadPublicRegistrationReference(pool, a.body.email);
    const refB = await loadPublicRegistrationReference(pool, b.body.email);
    const successA = await request(a.app)
      .get(buildChurchReadySuccessPath(refA))
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sidA}`);
    const successB = await request(b.app)
      .get(buildChurchReadySuccessPath(refB))
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sidB}`);
    const hrefA = extractPrimaryEditHref(successA.text);
    const hrefB = extractPrimaryEditHref(successB.text);
    assert.ok(hrefA && hrefB);
    assert.notEqual(hrefA, hrefB);
    assert.match(hrefA, /^\/c\/[^/?]+\/[^/?]+\?/);
    assert.match(hrefB, /^\/c\/[^/?]+\/[^/?]+\?/);
  });

  it("H: cross-tenant success page does not expose foreign edit CTA", async () => {
    requireDb();
    const a = await registerChurch({ church_name: `Owner ${uniq("h")}` });
    const b = await registerChurch({ church_name: `Other ${uniq("h")}` });
    const refB = await loadPublicRegistrationReference(pool, b.body.email);
    assert.ok(refB);
    const sidA = extractCookie(a.post, DEFAULT_V5_COOKIE);
    const leaked = await request(a.app)
      .get(`/register-church/success?ref=${encodeURIComponent(refB)}&ready=1`)
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sidA}`);
    assert.equal(leaked.status, 200);
    assert.equal(extractPrimaryEditHref(leaked.text), null);
    assert.doesNotMatch(leaked.text, /data-bb-primary-edit-website="1"/);
    assert.doesNotMatch(leaked.text, /data-bb-registration-website-url/);
  });

  it("I: failed / incomplete provisioning stays off editor path", async () => {
    requireDb();
    const app = makeApp();
    // Validation failure — remain on form, never success/editor
    const getRes = await request(app).get("/register-church?plan=foundation").set("Host", APEX);
    const csrf = extractCsrfToken(getRes.text);
    const csrfCookie = extractCookie(getRes, CSRF_COOKIE);
    const fail = await request(app)
      .post("/register-church")
      .set("Host", APEX)
      .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        church_name: "",
        country: "ZM",
        city: "Lusaka",
        contact_name: "X",
        role_in_church: "Pastor",
        phone_country: "ZM",
        phone_national: nextZmNational(),
        email: `fail-${uniq("i")}@example.org`,
        selected_plan: "foundation",
        password: PASSWORD,
        password_confirm: PASSWORD,
        consent_contact: "on",
        [CSRF_FIELD]: csrf,
      });
    assert.ok([200, 400].includes(fail.status), `fail status ${fail.status}`);
    assert.doesNotMatch(String(fail.headers.location || ""), /register-church\/success/);
    assert.doesNotMatch(String(fail.headers.location || ""), /website_edit=1/);

    // Success without ready=1 must not expose edit CTA
    const noReady = await request(app)
      .get("/register-church/success?ref=BB-FAKE-REF")
      .set("Host", APEX);
    assert.equal(noReady.status, 200);
    assert.equal(extractPrimaryEditHref(noReady.text), null);
  });
});
