"use strict";

/**
 * ActiveClinic public registration Terms of Service + legal pages.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, getCsrfCookieName } = require("../src/platform/http/v5Csrf");
const {
  validateClinicRegistrationInput,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  TERMS_VERSION,
  PRIVACY_VERSION,
  TERMS_REQUIRED_MESSAGE,
  validateTermsAcceptance,
} = require("../src/activeclinic/legal/termsAcceptance");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 973000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function extractCsrf(res) {
  const cookies = [].concat(res.headers["set-cookie"] || []);
  const name = getCsrfCookieName({ PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 });
  const raw = cookies.find((c) => String(c).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function appWithEnv() {
  resetDeploymentProfileWarningsForTests();
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: {
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
      SESSION_SECRET: "a".repeat(48),
      DATABASE_URL: databaseUrl,
    },
  });
}

function validFields(overrides) {
  const stamp = Date.now().toString(36);
  return {
    clinicName: `Terms Clinic ${stamp}`,
    contactName: "Terms Administrator",
    contactEmail: `terms-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    password: "clinic-admin-pass-12",
    passwordConfirm: "clinic-admin-pass-12",
    ...overrides,
  };
}

async function counts() {
  const q = async (sql) => {
    const row = await pool.query(sql);
    return Number(row.rows[0].n);
  };
  return {
    applications: await q("SELECT COUNT(*)::int AS n FROM activeclinic.clinic_registration_applications"),
    organizations: await q("SELECT COUNT(*)::int AS n FROM platform.organizations"),
    healthcare: await q("SELECT COUNT(*)::int AS n FROM activeclinic.healthcare_organizations"),
    facilities: await q("SELECT COUNT(*)::int AS n FROM activeclinic.facilities"),
    identities: await q("SELECT COUNT(*)::int AS n FROM platform.identities"),
    websites: await q("SELECT COUNT(*)::int AS n FROM platform.website_instances"),
  };
}

describe("ActiveClinic registration Terms of Service", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) {
      // eslint-disable-next-line no-console
      console.log("skip:", skipReason);
      return false;
    }
    return true;
  }

  it("rejects missing and false Terms acceptance without persisting", () => {
    assert.equal(validateTermsAcceptance({}).ok, false);
    assert.equal(validateTermsAcceptance({ acceptTerms: "false" }).ok, false);
    assert.equal(validateTermsAcceptance({ acceptTerms: "off" }).ok, false);
    assert.equal(validateTermsAcceptance({ acceptTerms: "0" }).ok, false);
    assert.equal(validateTermsAcceptance({ acceptTerms: "on" }).ok, true);
    assert.equal(validateTermsAcceptance({ acceptTerms: "on" }).termsVersion, TERMS_VERSION);
    const fields = validateClinicRegistrationInput(validFields());
    assert.equal(fields.ok, true);
    const confirm = validateClinicRegistrationInput(validFields(), { requireTermsAcceptance: true });
    assert.equal(confirm.ok, false);
    assert.equal(confirm.errors.registration_consent, TERMS_REQUIRED_MESSAGE);
  });

  it("registration UI uses create-clinic journey and unchecked Terms checkbox", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const page = await request(app).get("/register-clinic");
    assert.equal(page.status, 200);
    assert.match(page.text, />Clinic</);
    assert.match(page.text, />Staff Setup</);
    assert.match(page.text, />Review</);
    assert.doesNotMatch(page.text, />Submitted</);
    assert.doesNotMatch(page.text, /Submit application/);
    assert.doesNotMatch(page.text, /Already submitted\?/);
    assert.doesNotMatch(page.text, /Check application status/);

    const csrf = extractCsrf(page);
    const review = await request(app)
      .post("/register-clinic")
      .set("Cookie", page.headers["set-cookie"])
      .type("form")
      .send({ [CSRF_FIELD]: csrf, ...validFields() });
    assert.equal(review.status, 200);
    assert.match(review.text, /data-ac-page-section="register-clinic-review"/);
    assert.match(review.text, /Create clinic/);
    assert.match(review.text, /name="registration_consent"/);
    assert.match(review.text, /href="\/terms"/);
    assert.match(review.text, /href="\/privacy"/);
    assert.doesNotMatch(review.text, /target="_blank"/);
    assert.doesNotMatch(review.text, /checked/);
    assert.doesNotMatch(review.text, /Submit application/);
    assert.doesNotMatch(review.text, />Submitted</);
    assert.doesNotMatch(review.text, /pending approval|Awaiting approval/i);
    assert.doesNotMatch(review.text, /BlessBoard/);
  });

  it("forged confirm without Terms does not create resources", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const before = await counts();
    const page = await request(app).get("/register-clinic");
    const csrf = extractCsrf(page);
    const fields = validFields();
    const rejected = await request(app)
      .post("/register-clinic")
      .set("Cookie", page.headers["set-cookie"])
      .type("form")
      .send({ [CSRF_FIELD]: csrf, action: "confirm", ...fields });
    assert.equal(rejected.status, 400);
    assert.match(rejected.text, /Please confirm that you agree to the Terms of Service and Privacy Policy/);
    assert.deepEqual(await counts(), before);

    const falseAccept = await request(app)
      .post("/register-clinic")
      .set("Cookie", page.headers["set-cookie"])
      .type("form")
      .send({ [CSRF_FIELD]: csrf, action: "confirm", ...fields, acceptTerms: "false" });
    assert.equal(falseAccept.status, 400);
    assert.deepEqual(await counts(), before);
  });

  it("direct service submit without Terms does not provision", async () => {
    if (!requireDb()) return;
    const before = await counts();
    const result = await submitAndProvisionClinicRegistration(pool, {
      ...validFields(),
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(result.ok, false);
    assert.equal(result.errors.registration_consent, TERMS_REQUIRED_MESSAGE);
    assert.deepEqual(await counts(), before);
  });

  it("accepted Terms provisions clinic and persists versioned acceptance", async () => {
    if (!requireDb()) return;
    const fields = validFields();
    const result = await submitAndProvisionClinicRegistration(pool, {
      ...fields,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.organizationId);
    assert.ok(result.healthcareOrganization || result.application);
    const row = await pool.query(
      `SELECT terms_version, terms_accepted_at, privacy_version, privacy_acknowledged_at,
              organization_id, healthcare_organization_id, facility_id, website_instance_id,
              clinic_admin_staff_id, provisioning_status
         FROM activeclinic.clinic_registration_applications
        WHERE id = $1`,
      [result.application.id]
    );
    assert.equal(row.rows[0].terms_version, TERMS_VERSION);
    assert.equal(row.rows[0].privacy_version, PRIVACY_VERSION);
    assert.ok(row.rows[0].terms_accepted_at);
    assert.ok(row.rows[0].privacy_acknowledged_at);
    assert.ok(row.rows[0].organization_id);
    assert.ok(row.rows[0].healthcare_organization_id);
    assert.ok(row.rows[0].facility_id);
    assert.ok(row.rows[0].clinic_admin_staff_id);
    assert.ok(row.rows[0].website_instance_id);
    const site = await pool.query(
      `SELECT status, publish_policy FROM platform.website_instances WHERE id = $1`,
      [row.rows[0].website_instance_id]
    );
    assert.notEqual(String(site.rows[0].status || "").toLowerCase(), "published");
  });

  it("GET /terms and /privacy are ActiveClinic legal pages", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const terms = await request(app).get("/terms");
    assert.equal(terms.status, 200);
    assert.match(terms.text, /Terms of Service/);
    assert.match(terms.text, /data-ac-legal-version="1"/);
    assert.match(terms.text, new RegExp(TERMS_VERSION));
    assert.match(terms.text, /not<\/strong> the healthcare provider/i);
    assert.match(terms.text, /not<\/strong> automatically published/i);
    assert.doesNotMatch(terms.text, /BlessBoard/);
    assert.doesNotMatch(terms.text, /HIPAA certified|ISO 27001 certified/i);

    const privacy = await request(app).get("/privacy");
    assert.equal(privacy.status, 200);
    assert.match(privacy.text, /Privacy Policy/);
    assert.match(privacy.text, new RegExp(PRIVACY_VERSION));
    assert.match(privacy.text, /clinic registration/i);
    assert.doesNotMatch(privacy.text, /BlessBoard/);
  });
});
