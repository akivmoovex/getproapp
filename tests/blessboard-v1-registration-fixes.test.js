"use strict";

/**
 * BlessBoard V1.0 registration fixes 01–03:
 * country-code phone selector, environment-aware phone validation,
 * immediate church-admin access (no routine platform-admin approval).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  validatePlatformChurchRegistration,
  formFromBody,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  resolvePhoneValidationMode,
  VALIDATION_MODES,
} = require("../src/platform/services/phoneNumberService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";

const BASE_FORM = Object.freeze({
  church_name: "Phone Policy Church",
  country: "Zambia",
  city: "Lusaka",
  contact_name: "Pastor Test",
  role_in_church: "Pastor",
  email: "bb-reg-phone@example.org",
  consent_contact: "on",
  selected_plan: "foundation",
});

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

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

describe("BlessBoard V1 registration phone policy (BB-REG-02)", () => {
  it("mode is env-driven: production strict, testing relaxed; NODE_ENV does not override DEPLOYMENT_ENV", () => {
    assert.equal(resolvePhoneValidationMode({ DEPLOYMENT_ENV: "production" }), VALIDATION_MODES.STRICT);
    assert.equal(resolvePhoneValidationMode({ DEPLOYMENT_ENV: "testing" }), VALIDATION_MODES.RELAXED);
    assert.equal(
      resolvePhoneValidationMode({
        DEPLOYMENT_ENV: "production",
        NODE_ENV: "test",
        HOST: "blessboard.pronline.org",
      }),
      VALIDATION_MODES.STRICT
    );
    assert.equal(
      resolvePhoneValidationMode({
        DEPLOYMENT_ENV: "testing",
        NODE_ENV: "production",
      }),
      VALIDATION_MODES.RELAXED
    );
  });

  it("1. valid Zambia production phone is accepted and stored as E.164", () => {
    const result = validatePlatformChurchRegistration(
      {
        ...BASE_FORM,
        phone_country: "ZM",
        phone_national: "971234567",
      },
      { env: { DEPLOYMENT_ENV: "production" } }
    );
    assert.equal(result.ok, true);
    assert.equal(result.data.contact_phone_normalized, "+260971234567");
  });

  it("2. invalid production phone is rejected (server-authoritative)", () => {
    const short = validatePlatformChurchRegistration(
      {
        ...BASE_FORM,
        phone_country: "ZM",
        phone_national: "12",
      },
      { env: { DEPLOYMENT_ENV: "production" } }
    );
    assert.equal(short.ok, false);
    assert.equal(short.field, "phone");
    assert.match(String(short.error), /valid phone number/i);

    const zeros = validatePlatformChurchRegistration(
      {
        ...BASE_FORM,
        phone_country: "ZM",
        phone_national: "000000000",
      },
      { env: { DEPLOYMENT_ENV: "production" } }
    );
    assert.equal(zeros.ok, false);
    assert.equal(zeros.field, "phone");
  });

  it("3. testing fixture / synthetic QA phone is accepted under relaxed policy", () => {
    const fixture = validatePlatformChurchRegistration(
      {
        ...BASE_FORM,
        phone_country: "ZM",
        phone_national: "000000000",
      },
      { env: { DEPLOYMENT_ENV: "testing" } }
    );
    assert.equal(fixture.ok, true);
    assert.equal(fixture.data.contact_phone_normalized, "+260000000000");

    const qa = validatePlatformChurchRegistration(
      {
        ...BASE_FORM,
        phone: "+260970000001",
      },
      { env: { DEPLOYMENT_ENV: "testing" } }
    );
    assert.equal(qa.ok, true);
    assert.equal(qa.data.contact_phone_normalized, "+260970000001");
  });

  it("4. production cannot inherit the relaxed testing rule from NODE_ENV/host", () => {
    const result = validatePlatformChurchRegistration(
      {
        ...BASE_FORM,
        phone_country: "ZM",
        phone_national: "000000000",
      },
      {
        env: {
          DEPLOYMENT_ENV: "production",
          NODE_ENV: "test",
          HOST: "testing.blessboard.org",
        },
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.field, "phone");
  });

  it("legacy full E.164 and structured ZM national normalize identically", () => {
    const legacy = validatePlatformChurchRegistration(
      { ...BASE_FORM, phone: "+260971234567" },
      { env: { DEPLOYMENT_ENV: "production" } }
    );
    const structured = validatePlatformChurchRegistration(
      { ...BASE_FORM, phone_country: "ZM", phone_national: "97 1234567" },
      { env: { DEPLOYMENT_ENV: "production" } }
    );
    assert.equal(legacy.ok && structured.ok, true);
    assert.equal(legacy.data.contact_phone_normalized, structured.data.contact_phone_normalized);
    assert.equal(legacy.data.contact_phone_normalized, "+260971234567");
  });

  it("formFromBody preserves structured phone fields and never echoes passwords", () => {
    const form = formFromBody({
      ...BASE_FORM,
      phone_country: "ke",
      phone_national: "712345678",
      password: PASSWORD,
      password_confirm: PASSWORD,
    });
    assert.equal(form.phone_country, "KE");
    assert.equal(form.phone_national, "712345678");
    assert.equal(form.password, undefined);
    assert.doesNotMatch(JSON.stringify(form), /TestPassword/);
  });
});

describe("BlessBoard V1 registration UI + immediate admin (BB-REG-01, BB-REG-03)", () => {
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
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function makeApp(envExtra = {}) {
    return createV5FoundationApp({
      env: {
        NODE_ENV: "test",
        DEPLOYMENT_ENV: "testing",
        BLESSBOARD_TENANT_ROUTING_MODE: "off",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        ...envExtra,
      },
      getPool: () => pool,
    });
  }

  it("GET /register-church defaults Zambia (+260) with country + national fields", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/register-church").set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-ac-phone-field/);
    assert.match(res.text, /data-ac-phone-named="1"/);
    assert.match(res.text, /name="phone_country"/);
    assert.match(res.text, /name="phone_national"/);
    assert.match(res.text, /id="register_phone-country-value"[^>]*value="ZM"|value="ZM"[^>]*id="register_phone-country-value"/);
    assert.match(res.text, /Zambia \(\+260\)/);
    assert.match(res.text, /data-iso="KE"/);
    assert.match(res.text, /ac-phone-field\.css/);
    assert.match(res.text, /ac-phone-field\.js/);
    assert.match(res.text, /placeholder="97 1234567"/);
    assert.doesNotMatch(res.text, /pending until a platform administrator/i);
  });

  it("Foundation registration provisions, logs in, and opens HQ without approval", async () => {
    requireDb();
    const app = makeApp();
    const getRes = await request(app).get("/register-church?plan=foundation").set("Host", APEX);
    assert.equal(getRes.status, 200);
    const csrf = extractCsrfToken(getRes.text);
    const csrfCookie = extractCookie(getRes, CSRF_COOKIE);
    assert.ok(csrf && csrfCookie);

    const key = uniq("bbv1");
    const body = {
      church_name: `V1 Church ${key}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "V1 Administrator",
      role_in_church: "Administrator",
      phone_country: "ZM",
      phone_national: "971234567",
      email: `${key}@example.org`,
      selected_plan: "foundation",
      organization_key: key,
      password: PASSWORD,
      password_confirm: PASSWORD,
      branch_name: "HQ Campus",
      consent_contact: "on",
      [CSRF_FIELD]: csrf,
    };

    const post = await request(app)
      .post("/register-church")
      .set("Host", APEX)
      .set("Cookie", `${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send(body);

    assert.equal(post.status, 303);
    assert.equal(post.headers.location, "/hq");
    assert.notEqual(post.headers.location, "/register-church?review=1");
    assert.doesNotMatch(String(post.headers.location || ""), /submitted=1|review=1/);

    const sid = extractCookie(post, DEFAULT_V5_COOKIE);
    assert.ok(sid, "session cookie established");

    const appRow = await pool.query(
      `SELECT application_status, provisioning_status, status, organization_id, contact_phone_normalized
         FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    assert.equal(appRow.rows.length, 1);
    assert.equal(appRow.rows[0].application_status, "active");
    assert.equal(appRow.rows[0].provisioning_status, "provisioned");
    assert.equal(appRow.rows[0].contact_phone_normalized, "+260971234567");
    const organizationId = appRow.rows[0].organization_id;
    assert.ok(organizationId);

    const org = await pool.query(
      `SELECT id, organization_key FROM platform.organizations WHERE id = $1`,
      [organizationId]
    );
    assert.equal(org.rows[0].organization_key, key);

    const roles = await pool.query(
      `SELECT ur.role_key, ur.organization_id
         FROM blessboard.user_roles ur
         JOIN blessboard.users u ON u.id = ur.user_id
        WHERE lower(u.email_normalized) = lower($1)
          AND ur.status = 'active'`,
      [body.email]
    );
    assert.ok(roles.rows.some((r) => r.role_key === "church_hq_admin"));
    assert.ok(roles.rows.every((r) => r.organization_id === organizationId));

    const otherOrgs = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.user_roles ur
         JOIN blessboard.users u ON u.id = ur.user_id
        WHERE lower(u.email_normalized) = lower($1)
          AND ur.organization_id <> $2`,
      [body.email, organizationId]
    );
    assert.equal(otherOrgs.rows[0].n, 0);

    const session = `${DEFAULT_V5_COOKIE}=${sid}`;
    const hq = await request(app).get("/hq").set("Host", APEX).set("Cookie", session);
    assert.ok(
      hq.status === 200 ||
        (hq.status === 303 && /^\/hq(\/|$)/.test(String(hq.headers.location || ""))),
      `GET /hq expected admin landing, got ${hq.status} ${hq.headers.location || ""}`
    );
    assert.doesNotMatch(hq.text || "", /Not found on this host/i);
    assert.doesNotMatch(hq.text || "", /wait for approval|pending application/i);

    const website = await request(app).get("/hq/website").set("Host", APEX).set("Cookie", session);
    assert.equal(website.status, 200, website.text.slice(0, 300));
    assert.doesNotMatch(website.text, /Not found on this host/i);
  });
});
