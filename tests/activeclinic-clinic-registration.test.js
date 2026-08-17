"use strict";

/**
 * ActiveClinic public clinic registration repair tests.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
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
  createClinicRegistrationApplication,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const {
  inspectActiveClinicPublicSchema,
} = require("../src/activeclinic/services/activeClinicPublicSchemaStatus");
const {
  classifyRegistrationError,
} = require("../src/activeclinic/services/activeClinicPublicRegistrationLog");

let pool;
let databaseUrl;
let skipReason = null;

function extractCsrf(res) {
  const cookies = [].concat(res.headers["set-cookie"] || []);
  const name = getCsrfCookieName({ PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 });
  const raw = cookies.find((c) => String(c).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

describe("ActiveClinic clinic registration repair", () => {
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

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) {
      // eslint-disable-next-line no-console
      console.log("skip:", skipReason);
      return false;
    }
    return true;
  }

  function appWithEnv() {
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

  const valid = {
    clinicName: "ActiveClinic Registration Test",
    contactName: "Test Administrator",
    contactEmail: "registration-test@example.invalid",
    contactPhone: "+260970000000",
    province: "Lusaka Province",
    city: "Lusaka",
    address: "123 Independence Avenue",
    countryCode: "ZM",
    notes: "Automated registration repair verification",
    password: "clinic-admin-pass-12",
    passwordConfirm: "clinic-admin-pass-12",
  };

  it("form field contract maps HTML names to service/SQL columns", () => {
    const v = validateClinicRegistrationInput(valid);
    assert.equal(v.ok, true);
    assert.equal(v.normalized.clinicName, valid.clinicName);
    assert.equal(v.normalized.contactName, valid.contactName);
    assert.equal(v.normalized.contactEmail, "registration-test@example.invalid");
    assert.equal(v.normalized.contactPhone, "+260970000000");
    assert.equal(v.normalized.province, "Lusaka Province");
    assert.equal(v.normalized.city, "Lusaka");
    assert.equal(v.normalized.address, valid.address);
    assert.equal(v.normalized.countryCode, "ZM");
    assert.equal(v.normalized.notes, valid.notes);
  });

  it("rejects short names and whitespace-only notes before SQL", () => {
    const short = validateClinicRegistrationInput({ ...valid, clinicName: "A" });
    assert.equal(short.ok, false);
    assert.ok(short.errors.clinicName);

    const notes = validateClinicRegistrationInput({ ...valid, notes: "   " });
    assert.equal(notes.ok, true);
    assert.equal(notes.normalized.notes, null);

    const weak = validateClinicRegistrationInput({ ...valid, password: "short", passwordConfirm: "short" });
    assert.equal(weak.ok, false);
    assert.ok(weak.errors.password);
  });

  it("schema status reports registration table after migrate", async () => {
    if (!requireDb()) return;
    const status = await inspectActiveClinicPublicSchema(pool);
    assert.equal(status.ok, true);
    assert.equal(status.clinicRegistrationApplications, true);
    assert.equal(status.websitePublishedColumn, true);
  });

  it("valid review→confirm creates pending application and redirects", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const getForm = await request(app).get("/register-clinic");
    assert.equal(getForm.status, 200);
    const csrf = extractCsrf(getForm);
    assert.ok(csrf);

    const review = await request(app)
      .post("/register-clinic")
      .set("Cookie", getForm.headers["set-cookie"])
      .type("form")
      .send({ [CSRF_FIELD]: csrf, ...valid });
    assert.equal(review.status, 200);
    assert.match(review.text, /Review your application/);
    assert.match(review.text, /name="action" value="confirm"/);

    const csrf2 = extractCsrf(review) || csrf;
    const confirm = await request(app)
      .post("/register-clinic")
      .set("Cookie", review.headers["set-cookie"] || getForm.headers["set-cookie"])
      .redirects(0)
      .type("form")
      .send({ [CSRF_FIELD]: csrf2, action: "confirm", ...valid });
    assert.equal(confirm.status, 303);
    assert.match(confirm.headers.location, /\/register-clinic\/success\?ref=AC-/);

    const rows = await pool.query(
      `SELECT application_number, status, clinic_name
         FROM activeclinic.clinic_registration_applications
        WHERE contact_email_normalized = $1`,
      ["registration-test@example.invalid"]
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].status, "pending_review");
    assert.equal(rows.rows[0].clinic_name, valid.clinicName);
    const hashRow = await pool.query(
      `SELECT administrator_password_hash IS NOT NULL AS has_hash, address
         FROM activeclinic.clinic_registration_applications
        WHERE contact_email_normalized = $1`,
      ["registration-test@example.invalid"]
    );
    assert.equal(hashRow.rows[0].has_hash, true);
    assert.equal(hashRow.rows[0].address, valid.address);

    const orgs = await pool.query(
      `SELECT count(*)::int AS n FROM platform.organizations WHERE display_name = $1`,
      [valid.clinicName]
    );
    assert.equal(orgs.rows[0].n, 0);

    const success = await request(app).get(confirm.headers.location);
    assert.equal(success.status, 200);
    assert.match(success.text, /pending review/i);
    assert.match(success.text, /data-ac-application-ref=/);
  });

  it("duplicate confirm does not insert a second row", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const email = `dup-${Date.now()}@example.invalid`;
    const payload = { ...valid, contactEmail: email, contactPhone: "+260971111111" };
    const getForm = await request(app).get("/register-clinic");
    const csrf = extractCsrf(getForm);

    await request(app)
      .post("/register-clinic")
      .set("Cookie", getForm.headers["set-cookie"])
      .type("form")
      .send({ [CSRF_FIELD]: csrf, action: "confirm", ...payload });

    const second = await request(app)
      .post("/register-clinic")
      .set("Cookie", getForm.headers["set-cookie"])
      .type("form")
      .send({ [CSRF_FIELD]: csrf, action: "confirm", ...payload });
    assert.equal(second.status, 400);
    assert.match(second.text, /recently submitted/i);

    const rows = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.clinic_registration_applications WHERE contact_email_normalized = $1`,
      [email.toLowerCase()]
    );
    assert.equal(rows.rows[0].n, 1);
  });

  it("CSRF failure returns 403 without creating rows", async () => {
    if (!requireDb()) return;
    const before = await pool.query(`SELECT count(*)::int AS n FROM activeclinic.clinic_registration_applications`);
    const app = appWithEnv();
    const getForm = await request(app).get("/register-clinic");
    const res = await request(app)
      .post("/register-clinic")
      .set("Cookie", getForm.headers["set-cookie"])
      .type("form")
      .send({ [CSRF_FIELD]: "invalid", action: "confirm", ...valid, contactEmail: "csrf@example.invalid" });
    assert.equal(res.status, 403);
    const after = await pool.query(`SELECT count(*)::int AS n FROM activeclinic.clinic_registration_applications`);
    assert.equal(after.rows[0].n, before.rows[0].n);
  });

  it("missing table surfaces controlled 500 with request id and classified schema error", async () => {
    if (!requireDb()) return;
    await pool.query("DROP TABLE IF EXISTS activeclinic.clinic_registration_applications CASCADE");
    const app = appWithEnv();
    const getForm = await request(app).get("/register-clinic");
    const csrf = extractCsrf(getForm);
    const res = await request(app)
      .post("/register-clinic")
      .set("Cookie", getForm.headers["set-cookie"])
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        action: "confirm",
        ...valid,
        contactEmail: "notable@example.invalid",
      });
    assert.equal(res.status, 500);
    assert.match(res.text, /could not save your application/i);
    assert.match(res.text, /data-ac-request-id=/);
    assert.doesNotMatch(res.text, /42P01|stack|password|DATABASE_URL/i);

    const classified = classifyRegistrationError({ code: "42P01", message: 'relation "activeclinic.clinic_registration_applications" does not exist' });
    assert.equal(classified.category, "schema_missing");
  });

  it("public-schema-status reports not ok when registration table missing", async () => {
    if (!requireDb()) return;
    const status = await inspectActiveClinicPublicSchema(pool);
    assert.equal(status.clinicRegistrationApplications, false);
    assert.equal(status.ok, false);
    assert.match(String(status.pendingHint || ""), /019/);

    const app = appWithEnv();
    const res = await request(app).get("/__ac/public-schema-status");
    assert.equal(res.status, 503);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.schema.clinicRegistrationApplications, false);
  });
});
