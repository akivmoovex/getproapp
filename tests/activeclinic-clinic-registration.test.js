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
    province: "Lusaka",
    city: "Lusaka",
    address: "123 Independence Avenue",
    countryCode: "ZM",
    notes: "Automated registration repair verification",
    password: "clinic-admin-pass-12",
    passwordConfirm: "clinic-admin-pass-12",
    acceptTerms: "on",
  };

  it("form field contract maps HTML names to service/SQL columns", () => {
    const v = validateClinicRegistrationInput(valid);
    assert.equal(v.ok, true);
    assert.equal(v.normalized.clinicName, valid.clinicName);
    assert.equal(v.normalized.contactName, valid.contactName);
    assert.equal(v.normalized.contactEmail, "registration-test@example.invalid");
    assert.equal(v.normalized.contactPhone, "+260970000000");
    assert.equal(v.normalized.province, "Lusaka");
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
    // DBCL08 D6: soft inspectActiveClinicPublicSchema probe removed — assert SQL directly.
    const tables = await pool.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'activeclinic'
              AND table_name = 'clinic_registration_applications'
         ) AS clinic_reg,
         EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'activeclinic'
              AND table_name = 'healthcare_organizations'
              AND column_name = 'website_published'
         ) AS website_published`
    );
    assert.equal(tables.rows[0].clinic_reg, true);
    assert.equal(tables.rows[0].website_published, true);
  });

  it("valid review→confirm auto-provisions organization and redirects", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const agent = request.agent(app);
    const getForm = await agent.get("/register-clinic");
    assert.equal(getForm.status, 200);
    const csrf = extractCsrf(getForm);
    assert.ok(csrf);

    const review = await agent
      .post("/register-clinic")
      .redirects(5)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, ...valid });
    assert.equal(review.status, 200);
    assert.match(review.text, /Review your details|name="action" value="confirm"|data-ac-acw-step="review"/i);

    const csrf2 = extractCsrf(review) || csrf;
    const confirm = await agent
      .post("/register-clinic")
      .redirects(0)
      .type("form")
      .send({ [CSRF_FIELD]: csrf2, action: "confirm", ...valid });
    assert.equal(confirm.status, 303);
    assert.match(confirm.headers.location, /^\/app(?:\?|$)/);
    assert.doesNotMatch(String(confirm.headers.location || ""), /register-clinic\/success/);
    assert.doesNotMatch(String(confirm.headers.location || ""), /\/app\/settings\/website/);

    const rows = await pool.query(
      `SELECT application_number, status, clinic_name
         FROM activeclinic.clinic_registration_applications
        WHERE contact_email_normalized = $1`,
      ["registration-test@example.invalid"]
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].status, "active");
    assert.equal(rows.rows[0].clinic_name, valid.clinicName);
    const hashRow = await pool.query(
      `SELECT administrator_password_hash IS NOT NULL AS has_hash, address, organization_id, provisioning_status
         FROM activeclinic.clinic_registration_applications
        WHERE contact_email_normalized = $1`,
      ["registration-test@example.invalid"]
    );
    assert.equal(hashRow.rows[0].has_hash, false);
    assert.equal(hashRow.rows[0].address, valid.address);
    assert.ok(hashRow.rows[0].organization_id);
    assert.ok(["provisioned", "website_pending"].includes(hashRow.rows[0].provisioning_status));

    const orgs = await pool.query(
      `SELECT count(*)::int AS n FROM platform.organizations WHERE display_name = $1`,
      [valid.clinicName]
    );
    assert.equal(orgs.rows[0].n, 1);

    const success = await request(app).get(
      `/register-clinic/success?ref=${encodeURIComponent(rows.rows[0].application_number)}&ready=1`
    );
    assert.equal(success.status, 200);
    assert.match(success.text, /Your clinic is ready/i);
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
    // Soft-twin of an already-active registration is idempotent (303) or an explicit duplicate (400).
    assert.ok([303, 400].includes(second.status), `unexpected status ${second.status}`);
    if (second.status === 400) {
      assert.match(second.text, /already registered|recently submitted/i);
    }

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
    assert.doesNotMatch(res.text, /42P01|DATABASE_URL|node_modules\/pg|relation "activeclinic/i);

    const classified = classifyRegistrationError({ code: "42P01", message: 'relation "activeclinic.clinic_registration_applications" does not exist' });
    assert.equal(classified.category, "schema_missing");
  });

  it("public-schema-status probe route removed (DBCL10)", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const res = await request(app).get("/__ac/public-schema-status");
    assert.equal(res.status, 404);
  });
});
