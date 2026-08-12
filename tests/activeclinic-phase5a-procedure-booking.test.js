"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { createHealthcareOrganization } = require("../src/activeclinic/services/healthcareOrganizationService");
const { createFacility } = require("../src/activeclinic/services/facilityService");
const { createActiveClinicFoundationApp } = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, getCsrfCookieName } = require("../src/platform/http/v5Csrf");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 990000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function extractCsrf(res) {
  const cookies = [].concat(res.headers["set-cookie"] || []);
  const name = getCsrfCookieName({ PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 });
  const raw = cookies.find((cookie) => String(cookie).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function mergeCookies(existing, res) {
  const jar = new Map();
  for (const cookie of [].concat(existing || [])) {
    jar.set(String(cookie).split("=")[0], cookie);
  }
  for (const cookie of [].concat(res.headers["set-cookie"] || [])) {
    jar.set(String(cookie).split("=")[0], cookie);
  }
  return Array.from(jar.values());
}

async function provisionBookableClinic(stamp) {
  const orgKey = `ac_p25_${stamp}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: orgKey,
    displayName: "Procedure Booking Clinic",
    productKey: "activeclinic",
    productTenantKey: `ac-p25-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true);
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Procedure Booking Legal",
    publicName: "Procedure Booking Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  await pool.query(
    `UPDATE activeclinic.healthcare_organizations
     SET website_published = true, public_booking_enabled = true
     WHERE id = $1`,
    [hco.healthcareOrganization.id]
  );
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true);
  return {
    orgKey,
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
  };
}

async function addProcedure(tenant, procedureKey, referralRequired = true) {
  const inserted = await pool.query(
    `INSERT INTO activeclinic.public_procedures (
       organization_id, healthcare_organization_id, procedure_key,
       display_name, summary, category, referral_required,
       preparation_instructions, estimated_duration_minutes, status
     ) VALUES ($1, $2, $3, $4, 'Diagnostic imaging', 'diagnostic', $5,
               'Do not eat for four hours before your visit.', 45, 'active')
     RETURNING id`,
    [
      tenant.organizationId,
      tenant.healthcareOrganizationId,
      procedureKey,
      procedureKey === "mri" ? "MRI scan" : "Procedure test",
      referralRequired,
    ]
  );
  return inserted.rows[0].id;
}

describe("ActiveClinic Phase 5A P25 procedure booking wizard", () => {
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
        SESSION_SECRET: "b".repeat(48),
        DATABASE_URL: databaseUrl,
      },
    });
  }

  it("renders every required step and submits a normalized pending request", async () => {
    if (!requireDb()) return;
    const tenant = await provisionBookableClinic(Date.now().toString(36));
    await addProcedure(tenant, "mri", true);
    const app = appWithEnv();
    const base = `/clinics/${tenant.orgKey}/book/procedures/mri`;
    let cookies = [];

    const info = await request(app).get(base);
    assert.equal(info.status, 200);
    assert.match(info.text, /data-ac-page-section="procedure-info"/);
    assert.match(info.text, /data-ac-booking-progress="1"/);
    assert.match(info.text, /name="preparationAcknowledged"/);
    cookies = mergeCookies(cookies, info);
    let csrf = extractCsrf(info);

    const toReferral = await request(app)
      .post(base)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, wizardAction: "continue", preparationAcknowledged: "1" });
    assert.equal(toReferral.status, 303);
    assert.equal(toReferral.headers.location, `${base}/referral`);
    cookies = mergeCookies(cookies, toReferral);

    const referral = await request(app).get(`${base}/referral`).set("Cookie", cookies);
    assert.equal(referral.status, 200);
    assert.match(referral.text, /data-ac-page-section="procedure-referral"/);
    assert.match(referral.text, /data-ac-referral="required"/);
    assert.match(referral.text, /upload is not available online/i);
    assert.match(referral.text, /clinic will follow up/i);
    cookies = mergeCookies(cookies, referral);
    csrf = extractCsrf(referral);

    const toTime = await request(app)
      .post(`${base}/referral`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, referralNotes: "Referral from Dr Test" });
    assert.equal(toTime.status, 303);
    cookies = mergeCookies(cookies, toTime);

    const time = await request(app).get(`${base}/time`).set("Cookie", cookies);
    assert.equal(time.status, 200);
    assert.match(time.text, /data-ac-page-section="procedure-time"/);
    assert.match(time.text, /data-ac-slot-state="no_slots_published"/);
    assert.match(time.text, /name="preferredStartsAt"/);
    assert.doesNotMatch(time.text, /data-ac-slot-grid|data-ac-slot-option|class="[^"]*ac-slot-grid/);
    cookies = mergeCookies(cookies, time);
    csrf = extractCsrf(time);

    const toPatient = await request(app)
      .post(`${base}/time`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, preferredStartsAt: "2031-03-04T09:30" });
    assert.equal(toPatient.status, 303);
    cookies = mergeCookies(cookies, toPatient);

    const patient = await request(app).get(`${base}/patient`).set("Cookie", cookies);
    assert.equal(patient.status, 200);
    assert.match(patient.text, /data-ac-page-section="procedure-patient"/);
    assert.match(patient.text, /name="phone_country"/);
    assert.match(patient.text, /name="phone_national"/);
    assert.match(patient.text, /name="patientPhone"/);
    cookies = mergeCookies(cookies, patient);
    csrf = extractCsrf(patient);

    const toReview = await request(app)
      .post(`${base}/patient`)
      .set("Cookie", cookies)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        patientFirstName: "Procedure",
        patientLastName: "Patient",
        patientPhone: "",
        phone_country: "ZM",
        phone_national: "0977000111",
        patientEmail: "procedure@example.com",
      });
    assert.equal(toReview.status, 303);
    cookies = mergeCookies(cookies, toReview);

    const review = await request(app).get(`${base}/review`).set("Cookie", cookies);
    assert.equal(review.status, 200);
    assert.match(review.text, /data-ac-page-section="procedure-review"/);
    assert.match(review.text, /Referral from Dr Test/);
    assert.match(review.text, /2031-03-04T09:30/);
    assert.match(review.text, /Procedure Patient/);
    assert.match(review.text, /name="idempotencyKey"/);
    cookies = mergeCookies(cookies, review);
    csrf = extractCsrf(review);
    const idempotencyKey = review.text.match(/name="idempotencyKey"\s+value="([^"]+)"/)[1];

    const submitted = await request(app)
      .post(`${base}/submit`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, idempotencyKey });
    assert.equal(submitted.status, 200);
    assert.match(submitted.text, /MRI scan/);
    assert.match(submitted.text, /pending clinic confirmation/i);
    assert.match(submitted.text, /not a confirmed appointment/i);

    const rows = await pool.query(
      `SELECT booking_kind, status, patient_phone_normalized, referral_status,
              referral_notes, preparation_acknowledged, preferred_starts_at
       FROM activeclinic.public_booking_requests
       WHERE organization_id = $1`,
      [tenant.organizationId]
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].booking_kind, "procedure");
    assert.equal(rows.rows[0].status, "submitted_pending_confirmation");
    assert.equal(rows.rows[0].patient_phone_normalized, "+260977000111");
    assert.equal(rows.rows[0].referral_status, "submitted_pending_review");
    assert.equal(rows.rows[0].referral_notes, "Referral from Dr Test");
    assert.equal(rows.rows[0].preparation_acknowledged, true);
    assert.ok(rows.rows[0].preferred_starts_at);
  });

  it("rejects invalid steps and enforces CSRF", async () => {
    if (!requireDb()) return;
    const tenant = await provisionBookableClinic(`${Date.now().toString(36)}x`);
    await addProcedure(tenant, "mri", true);
    const app = appWithEnv();
    const base = `/clinics/${tenant.orgKey}/book/procedures/mri`;
    let cookies = [];
    const info = await request(app).get(base);
    cookies = mergeCookies(cookies, info);
    const csrf = extractCsrf(info);

    const noCsrf = await request(app)
      .post(base)
      .set("Cookie", cookies)
      .type("form")
      .send({ preparationAcknowledged: "1" });
    assert.equal(noCsrf.status, 403);

    const noAcknowledgement = await request(app)
      .post(base)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(noAcknowledgement.status, 400);
    assert.match(noAcknowledgement.text, /reviewed the preparation information/i);

    const guardedPatient = await request(app).get(`${base}/patient`).set("Cookie", cookies);
    assert.equal(guardedPatient.status, 303);
    assert.equal(guardedPatient.headers.location, `${base}/time`);
  });

  it("returns unavailable for a procedure owned by another clinic", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const first = await provisionBookableClinic(`${stamp}a`);
    const second = await provisionBookableClinic(`${stamp}b`);
    await addProcedure(second, "other-clinic-only", false);
    const app = appWithEnv();

    const response = await request(app)
      .get(`/clinics/${first.orgKey}/book/procedures/other-clinic-only`);
    assert.equal(response.status, 404);
    assert.match(response.text, /procedure.*unavailable|not available/i);
  });

  it("hides and renumbers the referral step when it is not required", async () => {
    if (!requireDb()) return;
    const tenant = await provisionBookableClinic(`${Date.now().toString(36)}n`);
    await addProcedure(tenant, "no-referral", false);
    const app = appWithEnv();
    const base = `/clinics/${tenant.orgKey}/book/procedures/no-referral`;
    let cookies = [];
    const info = await request(app).get(base);
    assert.equal(info.status, 200);
    assert.match(info.text, /Step 1 of 4/);
    assert.doesNotMatch(info.text, /<span class="ac-booking-progress__label">Referral<\/span>/);
    cookies = mergeCookies(cookies, info);
    const csrf = extractCsrf(info);

    const continued = await request(app)
      .post(base)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, preparationAcknowledged: "1" });
    assert.equal(continued.status, 303);
    assert.equal(continued.headers.location, `${base}/time`);
  });
});
