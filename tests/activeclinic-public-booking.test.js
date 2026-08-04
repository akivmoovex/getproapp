"use strict";

/**
 * ActiveClinic public booking wizard and my-booking (P24–P26).
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const {
  createFacility,
} = require("../src/activeclinic/services/facilityService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, getCsrfCookieName } = require("../src/platform/http/v5Csrf");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 980000000;

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

function mergeCookies(existing, res) {
  const jar = new Map();
  for (const c of [].concat(existing || [])) {
    jar.set(String(c).split("=")[0], c);
  }
  for (const c of [].concat(res.headers["set-cookie"] || [])) {
    jar.set(String(c).split("=")[0], c);
  }
  return Array.from(jar.values());
}

async function provisionBookableClinic(stamp) {
  const orgKey = `ac_bkw_${stamp}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: orgKey,
    displayName: "Booking Wizard Clinic",
    productKey: "activeclinic",
    productTenantKey: `ac-bkw-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true);
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Bkw Legal",
    publicName: "Booking Wizard Clinic",
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

describe("ActiveClinic public booking (P24–P26)", () => {
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

  it("consultation wizard reaches review and submits pending", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const tenant = await provisionBookableClinic(stamp);
    const app = appWithEnv();
    const base = `/clinics/${tenant.orgKey}`;

    let cookies = [];
    const entry = await request(app).get(`${base}/book`);
    assert.equal(entry.status, 200);
    assert.match(entry.text, /data-ac-page-section="booking-consultation-type"/);
    assert.match(entry.text, /data-ac-booking-progress="1"/);
    assert.match(entry.text, /SMS reminders are not sent/i);
    assert.doesNotMatch(entry.text, /href="#"/);
    cookies = mergeCookies(cookies, entry);
    let csrf = extractCsrf(entry);

    const toDoctor = await request(app)
      .post(`${base}/book`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, wizardAction: "continue", serviceKey: "" });
    assert.equal(toDoctor.status, 303);
    cookies = mergeCookies(cookies, toDoctor);

    const doctor = await request(app).get(`${base}/book/doctor`).set("Cookie", cookies);
    assert.equal(doctor.status, 200);
    assert.match(doctor.text, /data-ac-page-section="booking-choose-doctor"/);
    cookies = mergeCookies(cookies, doctor);
    csrf = extractCsrf(doctor);

    const toSlot = await request(app)
      .post(`${base}/book/doctor`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, doctorChoice: "any" });
    assert.equal(toSlot.status, 303);
    cookies = mergeCookies(cookies, toSlot);

    const slot = await request(app).get(`${base}/book/slot`).set("Cookie", cookies);
    assert.equal(slot.status, 200);
    assert.match(slot.text, /data-ac-slot-state="no_slots_published"/);
    cookies = mergeCookies(cookies, slot);
    csrf = extractCsrf(slot);

    const toPatient = await request(app)
      .post(`${base}/book/slot`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, preferredStartsAt: "2030-06-01T09:30" });
    assert.equal(toPatient.status, 303);
    cookies = mergeCookies(cookies, toPatient);

    const patient = await request(app).get(`${base}/book/patient`).set("Cookie", cookies);
    cookies = mergeCookies(cookies, patient);
    csrf = extractCsrf(patient);

    const toReview = await request(app)
      .post(`${base}/book/patient`)
      .set("Cookie", cookies)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        patientFirstName: "Wizard",
        patientLastName: "Tester",
        patientPhone: "+260977000111",
        visitReason: "Checkup",
      });
    assert.equal(toReview.status, 303);
    cookies = mergeCookies(cookies, toReview);

    const review = await request(app).get(`${base}/book/review`).set("Cookie", cookies);
    assert.equal(review.status, 200);
    assert.match(review.text, /data-ac-page-section="booking-review"/);
    assert.match(review.text, /name="idempotencyKey"/);
    cookies = mergeCookies(cookies, review);
    csrf = extractCsrf(review);

    const idemMatch = review.text.match(/name="idempotencyKey"\s+value="([^"]+)"/);
    assert.ok(idemMatch);

    const submit = await request(app)
      .post(`${base}/book/submit`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, idempotencyKey: idemMatch[1] });
    assert.equal(submit.status, 200);
    assert.match(submit.text, /pending clinic confirmation/i);
    assert.match(submit.text, /not a confirmed appointment/i);
    assert.match(submit.text, /SMS reminders are not sent/i);

    const rows = await pool.query(
      `SELECT status FROM activeclinic.public_booking_requests WHERE organization_id = $1`,
      [tenant.organizationId]
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].status, "submitted_pending_confirmation");
  });

  it("duplicate wizard submit is idempotent", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const tenant = await provisionBookableClinic(stamp);
    const app = appWithEnv();
    const base = `/clinics/${tenant.orgKey}`;

    let cookies = [];
    const entry = await request(app).get(`${base}/book`);
    cookies = mergeCookies(cookies, entry);
    let csrf = extractCsrf(entry);

    for (const step of [
      { url: `${base}/book`, body: { wizardAction: "continue", serviceKey: "" } },
    ]) {
      const r = await request(app).post(step.url).set("Cookie", cookies).type("form").send({ [CSRF_FIELD]: csrf, ...step.body });
      cookies = mergeCookies(cookies, r);
    }
    const doctor = await request(app).get(`${base}/book/doctor`).set("Cookie", cookies);
    cookies = mergeCookies(cookies, doctor);
    csrf = extractCsrf(doctor);
    const slotRedir = await request(app).post(`${base}/book/doctor`).set("Cookie", cookies).type("form").send({ [CSRF_FIELD]: csrf, doctorChoice: "any" });
    cookies = mergeCookies(cookies, slotRedir);
    const slotPage = await request(app).get(`${base}/book/slot`).set("Cookie", cookies);
    cookies = mergeCookies(cookies, slotPage);
    csrf = extractCsrf(slotPage);
    const patRedir = await request(app).post(`${base}/book/slot`).set("Cookie", cookies).type("form").send({ [CSRF_FIELD]: csrf, preferredStartsAt: "2030-07-01T10:00" });
    cookies = mergeCookies(cookies, patRedir);
    const patPage = await request(app).get(`${base}/book/patient`).set("Cookie", cookies);
    cookies = mergeCookies(cookies, patPage);
    csrf = extractCsrf(patPage);
    const revRedir = await request(app).post(`${base}/book/patient`).set("Cookie", cookies).type("form").send({
      [CSRF_FIELD]: csrf,
      patientFirstName: "Dup",
      patientLastName: "Test",
      patientPhone: "+260977000222",
    });
    cookies = mergeCookies(cookies, revRedir);
    const review = await request(app).get(`${base}/book/review`).set("Cookie", cookies);
    cookies = mergeCookies(cookies, review);
    csrf = extractCsrf(review);
    const idem = review.text.match(/name="idempotencyKey"\s+value="([^"]+)"/)[1];

    const first = await request(app).post(`${base}/book/submit`).set("Cookie", cookies).type("form").send({ [CSRF_FIELD]: csrf, idempotencyKey: idem });
    assert.equal(first.status, 200);
    const second = await request(app).post(`${base}/book/submit`).set("Cookie", cookies).type("form").send({ [CSRF_FIELD]: csrf, idempotencyKey: idem });
    assert.equal(second.status, 200);

    const rows = await pool.query(
      `SELECT COUNT(*)::int AS n FROM activeclinic.public_booking_requests WHERE organization_id = $1`,
      [tenant.organizationId]
    );
    assert.equal(rows.rows[0].n, 1);
  });

  it("procedure referral honesty banner on booking form", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const tenant = await provisionBookableClinic(stamp);
    await pool.query(
      `INSERT INTO activeclinic.public_procedures (
         organization_id, healthcare_organization_id, procedure_key,
         display_name, summary, category, referral_required, status
       ) VALUES ($1, $2, 'mri', 'MRI scan', 'Imaging', 'diagnostic', true, 'active')`,
      [tenant.organizationId, tenant.healthcareOrganizationId]
    );
    const app = appWithEnv();
    const page = await request(app).get(`/clinics/${tenant.orgKey}/book/procedures/mri`);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-ac-referral="required"/);
    assert.match(page.text, /upload is not available online/i);
    assert.match(page.text, /clinic will follow up/i);
    assert.match(page.text, /SMS reminders are not sent/i);
  });

  it("my-booking cancel gated by status and cancellation is request not completed", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const tenant = await provisionBookableClinic(stamp);
    const app = appWithEnv();
    const base = `/clinics/${tenant.orgKey}`;

    let cookies = [];
    const entry = await request(app).get(`${base}/book`);
    cookies = mergeCookies(cookies, entry);
    let csrf = extractCsrf(entry);
    const d1 = await request(app).post(`${base}/book`).set("Cookie", cookies).type("form").send({ [CSRF_FIELD]: csrf, wizardAction: "continue", serviceKey: "" });
    cookies = mergeCookies(cookies, d1);
    const doctor = await request(app).get(`${base}/book/doctor`).set("Cookie", cookies);
    cookies = mergeCookies(cookies, doctor);
    csrf = extractCsrf(doctor);
    const d2 = await request(app).post(`${base}/book/doctor`).set("Cookie", cookies).type("form").send({ [CSRF_FIELD]: csrf, doctorChoice: "any" });
    cookies = mergeCookies(cookies, d2);
    const slot = await request(app).get(`${base}/book/slot`).set("Cookie", cookies);
    cookies = mergeCookies(cookies, slot);
    csrf = extractCsrf(slot);
    const d3 = await request(app).post(`${base}/book/slot`).set("Cookie", cookies).type("form").send({ [CSRF_FIELD]: csrf, preferredStartsAt: "2030-08-01T11:00" });
    cookies = mergeCookies(cookies, d3);
    const patient = await request(app).get(`${base}/book/patient`).set("Cookie", cookies);
    cookies = mergeCookies(cookies, patient);
    csrf = extractCsrf(patient);
    const d4 = await request(app).post(`${base}/book/patient`).set("Cookie", cookies).type("form").send({
      [CSRF_FIELD]: csrf,
      patientFirstName: "Cancel",
      patientLastName: "Gate",
      patientPhone: "+260977000333",
    });
    cookies = mergeCookies(cookies, d4);
    const review = await request(app).get(`${base}/book/review`).set("Cookie", cookies);
    cookies = mergeCookies(cookies, review);
    csrf = extractCsrf(review);
    const idem = review.text.match(/name="idempotencyKey"\s+value="([^"]+)"/)[1];
    const submitted = await request(app).post(`${base}/book/submit`).set("Cookie", cookies).type("form").send({ [CSRF_FIELD]: csrf, idempotencyKey: idem });
    const tokenMatch = submitted.text.match(/my-booking\?token=([^"]+)/);
    assert.ok(tokenMatch);
    const token = tokenMatch[1];

    const detailPending = await request(app).get(`${base}/my-booking?token=${encodeURIComponent(token)}`);
    assert.match(detailPending.text, /Request cancellation/);
    assert.match(detailPending.text, /data-ac-booking-status="submitted_pending_confirmation"/);

    await pool.query(
      `UPDATE activeclinic.public_booking_requests SET status = 'cancelled' WHERE organization_id = $1`,
      [tenant.organizationId]
    );
    const detailCancelled = await request(app).get(`${base}/my-booking?token=${encodeURIComponent(token)}`);
    assert.match(detailCancelled.text, /data-ac-actions-unavailable="1"/);
    assert.doesNotMatch(detailCancelled.text, /Request cancellation/);

    await pool.query(
      `UPDATE activeclinic.public_booking_requests SET status = 'submitted_pending_confirmation' WHERE organization_id = $1`,
      [tenant.organizationId]
    );
    const cancelReview = await request(app).get(`${base}/my-booking/cancel?token=${encodeURIComponent(token)}`);
    cookies = mergeCookies([], cancelReview);
    csrf = extractCsrf(cancelReview);
    const cancelPost = await request(app)
      .post(`${base}/my-booking/cancel`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, token, reason: "Schedule conflict" });
    assert.equal(cancelPost.status, 200);
    assert.match(cancelPost.text, /data-ac-page-section="cancellation-submitted"/);
    assert.match(cancelPost.text, /not yet cancelled/i);
    assert.match(cancelPost.text, /request — your booking is/i);
  });
});
