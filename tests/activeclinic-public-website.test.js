"use strict";

/**
 * ActiveClinic public website and booking (P20–P26).
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
let phoneSeq = 970000000;

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

async function provisionOrg(input) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    ...input,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

describe("ActiveClinic public website (P20–P26)", () => {
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

  it("migration 019 public tables exist", async () => {
    if (!requireDb()) return;
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'activeclinic'
         AND table_name IN (
           'clinic_registration_applications',
           'public_booking_requests',
           'public_booking_access_tokens',
           'public_procedures',
           'public_contact_inquiries'
         )
       ORDER BY table_name`
    );
    assert.equal(tables.rows.length, 5);
  });

  it("platform home and about render public shell", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const home = await request(app).get("/");
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-shell="public"/);
    assert.match(home.text, /data-ac-page="public-home"|data-ac-page-section="public-home"/);
    assert.match(home.text, /Find a clinic/);

    const about = await request(app).get("/about");
    assert.equal(about.status, 200);
    assert.match(about.text, /About ActiveClinic/);
  });

  it("directory excludes unpublished clinics", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const published = await provisionOrg({
      organizationKey: `ac_pub_${stamp}`,
      displayName: "Juflona Hospital & Medical Centre",
      productKey: "activeclinic",
      productTenantKey: `ac-pub-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const pubHco = await createHealthcareOrganization(pool, {
      organizationId: published.records.organization.id,
      legalName: "Juflona Legal",
      publicName: "Juflona Hospital & Medical Centre",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(pubHco.ok, true);
    await pool.query(
      `UPDATE activeclinic.healthcare_organizations
       SET website_published = true, public_booking_enabled = true
       WHERE id = $1`,
      [pubHco.healthcareOrganization.id]
    );
    const facility = await createFacility(pool, {
      organizationId: published.records.organization.id,
      healthcareOrganizationId: pubHco.healthcareOrganization.id,
      facilityKey: "main",
      displayName: "Main",
      facilityType: "hospital",
      status: "active",
      isPrimary: true,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Lusaka",
      province: "Lusaka",
    });
    assert.equal(facility.ok, true);
    await pool.query(
      `UPDATE activeclinic.facilities
       SET show_in_directory = true, website_published = true
       WHERE id = $1`,
      [facility.facility.id]
    );

    const unpublished = await provisionOrg({
      organizationKey: `ac_hid_${stamp}`,
      displayName: "Hidden Clinic",
      productKey: "activeclinic",
      productTenantKey: `ac-hid-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const hidHco = await createHealthcareOrganization(pool, {
      organizationId: unpublished.records.organization.id,
      legalName: "Hidden Legal",
      publicName: "Hidden Clinic",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(hidHco.ok, true);

    const app = appWithEnv();
    const dir = await request(app).get("/clinics");
    assert.equal(dir.status, 200);
    assert.match(dir.text, /Juflona Hospital/);
    assert.doesNotMatch(dir.text, /Hidden Clinic/);

    const tenant = await request(app).get(`/clinics/ac_pub_${stamp}`);
    assert.equal(tenant.status, 200);
    assert.match(tenant.text, /Juflona Hospital/);

    const hidden = await request(app).get(`/clinics/ac_hid_${stamp}`);
    assert.equal(hidden.status, 404);

    const unknown = await request(app).get("/clinics/no-such-clinic-key");
    assert.equal(unknown.status, 404);
  });

  it("clinic onboarding requires CSRF and creates pending application", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const form = await request(app).get("/register-clinic");
    assert.equal(form.status, 200);
    const csrf = extractCsrf(form);
    assert.ok(csrf);

    const bad = await request(app)
      .post("/register-clinic")
      .type("form")
      .send({
        clinicName: "New Clinic",
        contactName: "Ada",
        contactEmail: `ada-${Date.now()}@example.com`,
        contactPhone: "+260977123456",
        countryCode: "ZM",
      });
    assert.equal(bad.status, 403);

    const ok = await request(app)
      .post("/register-clinic")
      .set("Cookie", form.headers["set-cookie"])
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        clinicName: "New Clinic Lusaka",
        contactName: "Ada Lovelace",
        contactEmail: `ada-${Date.now()}@example.com`,
        contactPhone: "0977123456",
        province: "Lusaka",
        city: "Lusaka",
        countryCode: "ZM",
      });
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.location, "/register-clinic/success");

    const success = await request(app).get("/register-clinic/success");
    assert.equal(success.status, 200);
    assert.match(success.text, /Application received/);
    assert.match(success.text, /not.*published/i);
  });

  it("booking creates pending request not confirmed appointment", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const org = await provisionOrg({
      organizationKey: `ac_book_${stamp}`,
      displayName: "Bookable Clinic",
      productKey: "activeclinic",
      productTenantKey: `ac-book-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const hco = await createHealthcareOrganization(pool, {
      organizationId: org.records.organization.id,
      legalName: "Book Legal",
      publicName: "Bookable Clinic",
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

    const app = appWithEnv();
    const entry = await request(app).get(`/clinics/ac_book_${stamp}/book`);
    assert.equal(entry.status, 200);
    const csrf = extractCsrf(entry);
    assert.ok(csrf);

    const submit = await request(app)
      .post(`/clinics/ac_book_${stamp}/book`)
      .set("Cookie", entry.headers["set-cookie"])
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        patientFirstName: "Jane",
        patientLastName: "Patient",
        patientPhone: "+260966112233",
        preferredStartsAt: "2030-01-15T10:00",
        visitReason: "General check",
      });
    assert.equal(submit.status, 200);
    assert.match(submit.text, /pending clinic confirmation/i);
    assert.match(submit.text, /not a confirmed appointment/i);

    const rows = await pool.query(
      `SELECT status, booking_kind FROM activeclinic.public_booking_requests
       WHERE organization_id = $1`,
      [org.records.organization.id]
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].status, "submitted_pending_confirmation");
    assert.equal(rows.rows[0].booking_kind, "consultation");
  });
});
