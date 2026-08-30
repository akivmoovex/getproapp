"use strict";

/**
 * BB-REG-07: BlessBoard registration success screen (shared AC presentation).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { assertChurchReadySuccessRedirect } = require("./helpers/blessboardRegistrationSuccess");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  generatePublicRegistrationReference,
  sanitizePublicRegistrationReference,
  buildRegistrationSuccessRedirect,
  buildRegistrationSuccessViewModel,
} = require("../src/platform/registration/registrationSuccessPresentation");
const {
  renderPublicPage,
} = require("../src/activeclinic/http/renderActiveClinicPublic");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
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
    new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
  );
  return (m && (m[1] || m[2])) || null;
}

describe("registration success presentation (shared)", () => {
  it("generates AC/BB prefixes and rejects database ids", () => {
    const ac = generatePublicRegistrationReference("AC");
    const bb = generatePublicRegistrationReference("BB");
    assert.match(ac, /^AC-[A-Z0-9]+-[A-Z0-9]+$/);
    assert.match(bb, /^BB-[A-Z0-9]+-[A-Z0-9]+$/);
    assert.equal(sanitizePublicRegistrationReference("AC-TEST-1", "AC"), "AC-TEST-1");
    assert.equal(
      sanitizePublicRegistrationReference("11111111-1111-4111-8111-111111111111", "BB"),
      null
    );
    assert.equal(sanitizePublicRegistrationReference("<script>", "BB"), null);
    assert.match(
      buildRegistrationSuccessRedirect({
        productCode: "blessboard",
        reference: "BB-ABC-DEF",
        ready: true,
      }),
      /^\/register-church\/success\?ref=BB-ABC-DEF&ready=1$/
    );
  });

  it("ActiveClinic success chrome is unchanged", () => {
    const html = renderPublicPage({
      pageId: "public-register-clinic-success",
      pageTitle: "Clinic created",
      contentTemplate: "public/register-clinic-success",
      shellVariant: "platform",
      locals: {
        wizardStep: "success",
        ready: true,
        reviewRequired: false,
        applicationReference: "AC-TEST-1",
        csrfToken: "x",
      },
    });
    assert.match(html, /Clinic Registered Successfully/);
    assert.match(html, /data-ac-sign-in="1"/);
    assert.match(html, /href="\/login"/);
    assert.match(html, /data-ac-continue-onboarding="1"/);
    assert.match(html, /href="\/app"/);
    assert.match(html, /Return home/);
    assert.match(html, /data-ac-application-ref="AC-TEST-1"/);
  });

  it("unauthenticated BlessBoard continue goes through login", () => {
    const vm = buildRegistrationSuccessViewModel({
      productCode: "blessboard",
      reference: "BB-ABC-DEF",
      ready: true,
      authenticated: false,
    });
    assert.equal(vm.dashboardHref, "/login?next=/hq");
    assert.equal(vm.showContinue, true);
  });
});

describe("BB-REG-07 BlessBoard registration success screen", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";

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
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
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
    const stamp = uniq("bbreg07");
    const phoneTail = String(1000000 + Math.floor(Math.random() * 8000000)).slice(-7);
    const body = {
      church_name: `Success Church ${stamp}`,
      country: "ZM",
      city: "Lusaka",
      contact_name: "Pastor Test",
      role_in_church: "Pastor",
      phone_country: "ZM",
      phone_national: phoneTail,
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
    return { app, body, post, getRes };
  }

  it("successful Foundation registration redirects to success with ref and ready=1", async () => {
    requireDb();
    const { app, body, post } = await registerChurch();
    assert.equal(post.status, 303, post.text && String(post.text).slice(0, 400));
    assertChurchReadySuccessRedirect(post.headers.location);
    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid, "session cookie established");

    const success = await request(app)
      .get(post.headers.location)
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`);
    assert.equal(success.status, 200);
    assert.match(success.text, /Church Registered Successfully/);
    assert.match(success.text, /organisation, church, administrator account, and website foundation/i);
    assert.match(success.text, /Reference:/);
    assert.match(success.text, /data-bb-application-ref="BB-/);
    assert.match(success.text, /Accounts created/);
    assert.match(success.text, /Website foundation/);
    assert.match(success.text, /unpublished/);
    assert.match(success.text, /What happens next/);
    assert.match(success.text, /No Platform Admin approval/);
    assert.match(success.text, /data-bb-sign-in="1"/);
    assert.match(success.text, /href="\/login"/);
    assert.match(success.text, /data-bb-continue-dashboard="1"/);
    assert.match(success.text, /href="\/hq"/);
    assert.match(success.text, /Return home/);
    assert.match(success.text, /href="\/"/);
    assert.doesNotMatch(success.text, /review=1|We received your registration/);

    const appRow = await pool.query(
      `SELECT organization_id FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    const organizationId = appRow.rows[0].organization_id;
    const website = await pool.query(
      `SELECT status, lifecycle_status
         FROM platform.website_instances
        WHERE organization_id = $1 AND product_code = 'blessboard' AND status <> 'archived'`,
      [organizationId]
    );
    assert.equal(website.rows.length, 1);
    assert.equal(website.rows[0].status, "coming_soon");
    assert.equal(website.rows[0].lifecycle_status, "provisional");

    const hq = await request(app)
      .get("/hq")
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${sid}`);
    assert.ok(
      hq.status === 200 ||
        (hq.status === 303 && /^\/hq(\/|$)/.test(String(hq.headers.location || ""))),
      `Continue to dashboard /hq got ${hq.status}`
    );
  });

  it("success?review=1 does not become a ready success screen", async () => {
    requireDb();
    const app = makeApp();
    const bounced = await request(app)
      .get("/register-church/success?ref=BB-TEST-1&review=1&ready=1")
      .set("Host", APEX);
    assert.equal(bounced.status, 303);
    assert.equal(bounced.headers.location, "/register-church?review=1");
  });

  it("form ?ready=1 is not a provisioned-success screen", async () => {
    requireDb();
    const app = makeApp();
    const form = await request(app).get("/register-church?ready=1").set("Host", APEX);
    assert.equal(form.status, 200);
    assert.doesNotMatch(form.text, /Church Registered Successfully/);
    assert.doesNotMatch(form.text, /Your church workspace has been created/);
    assert.doesNotMatch(form.text, /data-bb-register-workspace=/);
  });
});
