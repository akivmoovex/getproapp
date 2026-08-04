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

async function provisionPublishedClinic(stamp, overrides = {}) {
  const orgKey = overrides.organizationKey || `ac_tenant_${stamp}`;
  const org = await provisionOrg({
    organizationKey: orgKey,
    displayName: overrides.displayName || "Tenant Test Clinic",
    productKey: "activeclinic",
    productTenantKey: overrides.productTenantKey || `ac-tenant-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Tenant Legal",
    publicName: overrides.publicName || "Tenant Test Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  await pool.query(
    `UPDATE activeclinic.healthcare_organizations
     SET website_published = true, public_booking_enabled = true,
         website_tagline = $2, website_about = $3
     WHERE id = $1`,
    [
      hco.healthcareOrganization.id,
      overrides.websiteTagline || "Quality care",
      overrides.websiteAbout || "A test clinic for public website coverage.",
    ]
  );
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main Campus",
    facilityType: "clinic",
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
     SET show_in_directory = true, website_published = true,
         address_line_1 = $2, public_hours_json = $3::jsonb
     WHERE id = $1`,
    [
      facility.facility.id,
      "123 Test Road",
      JSON.stringify({ Mon: "08:00–17:00", Tue: "08:00–17:00" }),
    ]
  );
  return {
    orgKey,
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
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

  it("platform home and about render public shell with content sections", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const home = await request(app).get("/");
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-shell="public"/);
    assert.match(home.text, /data-ac-page-section="public-home"/);
    assert.match(home.text, /Find a clinic/);
    assert.match(home.text, /data-ac-home-section="discovery"/);
    assert.match(home.text, /data-ac-home-section="patient-benefits"/);
    assert.match(home.text, /data-ac-home-section="clinic-benefits"/);
    assert.match(home.text, /data-ac-home-section="platform-capabilities"/);
    assert.match(home.text, /data-ac-home-section="privacy"/);
    assert.match(home.text, /data-ac-home-section="final-cta"/);
    assert.match(home.text, /does not expose medical records/i);
    assert.match(home.text, /do not claim real-time appointment availability/i);

    const about = await request(app).get("/about");
    assert.equal(about.status, 200);
    assert.match(about.text, /About ActiveClinic/);
    assert.match(about.text, /ac-capability-badge--available/);
    assert.match(about.text, /ac-capability-badge--pilot/);
    assert.match(about.text, /ac-capability-badge--planned/);

    const solutions = await request(app).get("/solutions");
    assert.equal(solutions.status, 200);
    assert.match(solutions.text, /Honest product boundaries/);
  });

  it("public nav links are real routes without placeholder anchors", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const home = await request(app).get("/");
    assert.equal(home.status, 200);
    assert.doesNotMatch(home.text, /href="#"/);
    assert.match(home.text, /href="\/clinics"/);
    assert.match(home.text, /href="\/register-clinic"/);
    assert.match(home.text, /href="\/solutions"/);
    assert.match(home.text, /href="\/about"/);
    assert.match(home.text, /Find a clinic/);
  });

  it("directory empty state and search query aliases", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const empty = await request(app).get("/clinics?q=zzzz-no-clinic-should-match-zzzz");
    assert.equal(empty.status, 200);
    assert.match(empty.text, /data-ac-directory-state="empty"/);
    assert.match(empty.text, /View all clinics|Register your clinic/);
    assert.match(empty.text, /href="\/about"/);

    const viaSearch = await request(app).get("/clinics?search=lusaka");
    assert.equal(viaSearch.status, 200);
    assert.match(viaSearch.text, /Clinic directory/);
  });

  it("directory error state renders without stack trace", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const err = await request(app).get("/clinics?_directoryError=1");
    assert.equal(err.status, 503);
    assert.match(err.text, /data-ac-directory-state="error"/);
    assert.match(err.text, /Retry/);
    assert.doesNotMatch(err.text, /at Object\./);
    assert.doesNotMatch(err.text, /Error: directory_unavailable/);
  });

  it("directory loading state renders loading partial in test mode", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const loading = await request(app).get("/clinics?_directoryLoading=1");
    assert.equal(loading.status, 200);
    assert.match(loading.text, /data-ac-directory-state="loading"/);
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
    assert.equal(hidden.status, 403);
    assert.match(hidden.text, /data-ac-page-section="tenant-clinic-unavailable"/);

    const unknown = await request(app).get("/clinics/no-such-clinic-key");
    assert.equal(unknown.status, 404);
    assert.match(unknown.text, /data-ac-page-section="tenant-clinic-not-found"/);
  });

  it("clinic onboarding review then confirm creates pending application", async () => {
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

    const email = `ada-${Date.now()}@example.com`;
    const review = await request(app)
      .post("/register-clinic")
      .set("Cookie", form.headers["set-cookie"])
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        clinicName: "New Clinic Lusaka",
        contactName: "Ada Lovelace",
        contactEmail: email,
        contactPhone: "0977123456",
        province: "Lusaka",
        city: "Lusaka",
        countryCode: "ZM",
      });
    assert.equal(review.status, 200);
    assert.match(review.text, /data-ac-page-section="register-clinic-review"/);
    assert.match(review.text, /Review your application/);
    assert.match(review.text, /New Clinic Lusaka/);

    const confirmCsrf = extractCsrf(review);
    const ok = await request(app)
      .post("/register-clinic")
      .set("Cookie", review.headers["set-cookie"])
      .type("form")
      .send({
        [CSRF_FIELD]: confirmCsrf,
        action: "confirm",
        clinicName: "New Clinic Lusaka",
        contactName: "Ada Lovelace",
        contactEmail: email,
        contactPhone: "0977123456",
        province: "Lusaka",
        city: "Lusaka",
        countryCode: "ZM",
      });
    assert.equal(ok.status, 303);
    assert.match(ok.headers.location, /^\/register-clinic\/success\?ref=AC-/);

    const success = await request(app).get(ok.headers.location);
    assert.equal(success.status, 200);
    assert.match(success.text, /Application received/);
    assert.match(success.text, /data-ac-application-ref=/);
    assert.match(success.text, /not.*published/i);
    assert.match(success.text, /not.*SMS/i);
  });

  it("clinic onboarding validation error uses dedicated form state", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const form = await request(app).get("/register-clinic");
    const csrf = extractCsrf(form);

    const invalid = await request(app)
      .post("/register-clinic")
      .set("Cookie", form.headers["set-cookie"])
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        clinicName: "",
        contactName: "",
        contactEmail: "not-an-email",
        contactPhone: "",
        countryCode: "ZM",
      });
    assert.equal(invalid.status, 400);
    assert.match(invalid.text, /data-ac-form-state="validation_error"/);
    assert.match(invalid.text, /Please fix the following/);
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

  it("P22–P23 tenant pages: pricing, location, contact success, nav, procedure detail, book prefill", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const tenant = await provisionPublishedClinic(stamp);

    await pool.query(
      `INSERT INTO activeclinic.public_procedures (
         organization_id, healthcare_organization_id, procedure_key,
         display_name, summary, category, referral_required, preparation_instructions, status
       ) VALUES ($1, $2, 'ultrasound', 'Ultrasound scan', 'Diagnostic imaging', 'diagnostic', true, 'Fast for 6 hours.', 'active')`,
      [tenant.organizationId, tenant.healthcareOrganizationId]
    );

    await pool.query(
      `INSERT INTO activeclinic.appointment_service_types (
         organization_id, healthcare_organization_id, service_key,
         display_name, public_bookable, public_summary, status
       ) VALUES ($1, $2, 'general-consult', 'General consultation', true, 'Routine visit', 'active')`,
      [tenant.organizationId, tenant.healthcareOrganizationId]
    );

    const app = appWithEnv();
    const home = await request(app).get(`/clinics/${tenant.orgKey}`);
    assert.equal(home.status, 200);
    assert.doesNotMatch(home.text, /href="#"/);
    assert.match(home.text, /href="\/clinics\/[^"]+\/pricing"/);
    assert.match(home.text, /href="\/clinics\/[^"]+\/location"/);
    assert.match(home.text, /href="\/clinics\/[^"]+\/patient\/login"/);

    const pricing = await request(app).get(`/clinics/${tenant.orgKey}/pricing`);
    assert.equal(pricing.status, 200);
    assert.match(pricing.text, /data-ac-page-section="tenant-pricing"/);
    assert.match(pricing.text, /data-ac-price-state="no-public-prices"/);
    assert.match(pricing.text, /Contact clinic for fees/);

    const location = await request(app).get(`/clinics/${tenant.orgKey}/location`);
    assert.equal(location.status, 200);
    assert.match(location.text, /data-ac-page-section="tenant-location"/);
    assert.match(location.text, /123 Test Road/);
    assert.match(location.text, /08:00–17:00/);

    const contactForm = await request(app).get(`/clinics/${tenant.orgKey}/contact`);
    const csrf = extractCsrf(contactForm);
    const contactPost = await request(app)
      .post(`/clinics/${tenant.orgKey}/contact`)
      .set("Cookie", contactForm.headers["set-cookie"])
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        senderName: "Test User",
        senderEmail: `user-${stamp}@example.com`,
        message: "Hello clinic",
      });
    assert.equal(contactPost.status, 303);
    assert.equal(contactPost.headers.location, `/clinics/${tenant.orgKey}/contact/success`);

    const contactSuccess = await request(app).get(`/clinics/${tenant.orgKey}/contact/success`);
    assert.equal(contactSuccess.status, 200);
    assert.match(contactSuccess.text, /data-ac-page-section="tenant-contact-success"/);
    assert.match(contactSuccess.text, /Message received/);

    const services = await request(app).get(`/clinics/${tenant.orgKey}/services`);
    assert.equal(services.status, 200);
    assert.match(services.text, /href="\/clinics\/[^"]+\/procedures\/ultrasound"/);
    assert.doesNotMatch(services.text, /href="\/clinics\/[^"]+\/book\/procedures\/ultrasound"/);

    const procedureDetail = await request(app).get(`/clinics/${tenant.orgKey}/procedures/ultrasound`);
    assert.equal(procedureDetail.status, 200);
    assert.match(procedureDetail.text, /data-ac-page-section="tenant-procedure-detail"/);
    assert.match(procedureDetail.text, /data-ac-referral="required"/);
    assert.match(procedureDetail.text, /Fast for 6 hours/);

    const bookPrefill = await request(app).get(`/clinics/${tenant.orgKey}/book?service=general-consult`);
    assert.equal(bookPrefill.status, 200);
    assert.match(bookPrefill.text, /data-ac-page-section="booking-consultation-type"/);
    assert.match(bookPrefill.text, /value="general-consult"/);
  });
});
