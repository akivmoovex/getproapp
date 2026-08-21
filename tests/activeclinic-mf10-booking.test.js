"use strict";

/**
 * MF10 public booking chrome on the existing request wizard.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
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
const { createFacility } = require("../src/activeclinic/services/facilityService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, getCsrfCookieName } = require("../src/platform/http/v5Csrf");

const ROOT = path.join(__dirname, "..");
let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 970000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
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
  for (const c of [].concat(existing || [])) jar.set(String(c).split("=")[0], c);
  for (const c of [].concat(res.headers["set-cookie"] || [])) jar.set(String(c).split("=")[0], c);
  return Array.from(jar.values());
}

async function provisionBookableClinic(stamp, keyPrefix) {
  const orgKey = `${keyPrefix}_${stamp}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: orgKey,
    displayName: "MF10 Clinic",
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "MF10 Legal",
    publicName: "MF10 Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  await pool.query(
    `UPDATE activeclinic.healthcare_organizations
     SET website_published = true, public_booking_enabled = true
     WHERE id = $1`,
    [hco.healthcareOrganization.id]
  );
  await createFacility(pool, {
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
  return {
    orgKey,
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
  };
}

describe("ActiveClinic MF10 public booking chrome", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

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

  it("templates omit copay, insurance, and fake live slots", () => {
    const service = fs.readFileSync(path.join(ROOT, "views/activeclinic/booking/consultation-type.ejs"), "utf8");
    const doctor = fs.readFileSync(path.join(ROOT, "views/activeclinic/booking/consultation-doctor.ejs"), "utf8");
    const slot = fs.readFileSync(path.join(ROOT, "views/activeclinic/booking/consultation-slot.ejs"), "utf8");
    const review = fs.readFileSync(path.join(ROOT, "views/activeclinic/booking/consultation-review.ejs"), "utf8");
    const success = fs.readFileSync(path.join(ROOT, "views/activeclinic/booking/request-submitted.ejs"), "utf8");
    assert.match(service, /data-ac-mf-family="MF10"/);
    assert.match(doctor, /Any available provider/);
    assert.doesNotMatch(doctor, /Gender Preference|Next Available|Dr\. Sarah Jenkins/);
    assert.match(slot, /data-ac-slot-state="no_slots_published"/);
    assert.doesNotMatch(slot, /09:00 AM|Continue to Confirm/);
    assert.doesNotMatch(review, /Estimated Copay|Insurance Information|Confirm Appointment/);
    assert.match(success, /Pending clinic confirmation/);
    assert.doesNotMatch(success, /Appointment confirmed/);
  });

  it("consultation steps render MF10 chrome and keep pending request semantics", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const tenant = await provisionBookableClinic(stamp, "ac_mf10");
    const other = await provisionBookableClinic(`${stamp}b`, "ac_mf10b");
    const app = appWithEnv();
    const base = `/clinics/${tenant.orgKey}`;

    let cookies = [];
    const entry = await request(app).get(`${base}/book`);
    assert.equal(entry.status, 200);
    assert.match(entry.text, /data-ac-mf-screen="MF10-01"/);
    assert.match(entry.text, /Select service/);
    assert.doesNotMatch(entry.text, /Estimated Copay|BlueCross/);
    cookies = mergeCookies(cookies, entry);
    let csrf = extractCsrf(entry);

    const toDoctor = await request(app)
      .post(`${base}/book`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, wizardAction: "continue", serviceKey: "not-a-real-service" });
    assert.equal(toDoctor.status, 303);
    cookies = mergeCookies(cookies, toDoctor);

    const doctor = await request(app).get(`${base}/book/doctor`).set("Cookie", cookies);
    assert.equal(doctor.status, 200);
    assert.match(doctor.text, /data-ac-mf-screen="MF10-03"/);
    assert.match(doctor.text, /name="doctorChoice" value="any"/);
    cookies = mergeCookies(cookies, doctor);
    csrf = extractCsrf(doctor);

    const toSlot = await request(app)
      .post(`${base}/book/doctor`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, doctorChoice: "any" });
    cookies = mergeCookies(cookies, toSlot);

    const slot = await request(app).get(`${base}/book/slot`).set("Cookie", cookies);
    assert.equal(slot.status, 200);
    assert.match(slot.text, /data-ac-mf-screen="MF10-05"/);
    assert.match(slot.text, /data-ac-slot-state="no_slots_published"/);
    assert.match(slot.text, /Choose another provider/);
    cookies = mergeCookies(cookies, slot);
    csrf = extractCsrf(slot);

    const toPatient = await request(app)
      .post(`${base}/book/slot`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, preferredDate: "2030-06-01", preferredTime: "09:30" });
    assert.equal(toPatient.status, 303);
    cookies = mergeCookies(cookies, toPatient);

    const patient = await request(app).get(`${base}/book/patient`).set("Cookie", cookies);
    assert.equal(patient.status, 200);
    assert.match(patient.text, /name="patientFirstName"/);
    cookies = mergeCookies(cookies, patient);
    csrf = extractCsrf(patient);

    const toReview = await request(app)
      .post(`${base}/book/patient`)
      .set("Cookie", cookies)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        patientFirstName: "MF10",
        patientLastName: "Tester",
        patientPhone: "+260977001010",
      });
    cookies = mergeCookies(cookies, toReview);

    const review = await request(app).get(`${base}/book/review`).set("Cookie", cookies);
    assert.equal(review.status, 200);
    assert.match(review.text, /data-ac-mf-screen="MF10-07"/);
    assert.match(review.text, /Submit request/);
    assert.doesNotMatch(review.text, /Estimated Copay|Insurance Information/);
    cookies = mergeCookies(cookies, review);
    csrf = extractCsrf(review);
    const idem = review.text.match(/name="idempotencyKey"\s+value="([^"]+)"/)[1];

    const badCsrf = await request(app)
      .post(`${base}/book/submit`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: "nope", idempotencyKey: idem });
    assert.equal(badCsrf.status, 403);

    const submit = await request(app)
      .post(`${base}/book/submit`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, idempotencyKey: idem });
    assert.equal(submit.status, 200);
    assert.match(submit.text, /pending clinic confirmation/i);
    assert.doesNotMatch(submit.text, /Appointment confirmed/);

    const rows = await pool.query(
      `SELECT status, organization_id FROM activeclinic.public_booking_requests WHERE organization_id = $1`,
      [tenant.organizationId]
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].status, "submitted_pending_confirmation");

    const foreign = await request(app).get(`/clinics/${other.orgKey}/book`);
    assert.equal(foreign.status, 200);
    const foreignSlot = await request(app)
      .post(`/clinics/${other.orgKey}/book`)
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(foreign), wizardAction: "continue", serviceKey: "" });
    assert.ok([303, 400, 403].includes(foreignSlot.status));
  });
});
