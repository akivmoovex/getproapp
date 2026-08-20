"use strict";

/**
 * ActiveClinic.org ACW01–ACW07 public marketing and directory behaviour.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
let phoneSeq = 973300000;

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

describe("ActiveClinic ACW public site", () => {
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

  async function provisionPublishedClinic(stamp, overrides = {}) {
    const orgKey = overrides.organizationKey || `ac_acw_${stamp}`;
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: orgKey,
      displayName: overrides.displayName || `ACW Clinic ${stamp}`,
      productKey: "activeclinic",
      productTenantKey: overrides.productTenantKey || `ac-acw-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const hco = await createHealthcareOrganization(pool, {
      organizationId: org.records.organization.id,
      legalName: "Legal",
      publicName: overrides.publicName || `Published ACW Clinic ${stamp}`,
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(hco.ok, true);
    await pool.query(
      `UPDATE activeclinic.healthcare_organizations
       SET website_published = true, public_booking_enabled = $2
       WHERE id = $1`,
      [hco.healthcareOrganization.id, overrides.booking === true]
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
      city: overrides.city || "Lusaka",
      province: overrides.province || "Lusaka",
    });
    assert.equal(facility.ok, true);
    await pool.query(
      `UPDATE activeclinic.facilities
       SET show_in_directory = true, website_published = true
       WHERE id = $1`,
      [facility.facility.id]
    );
    return {
      orgKey,
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
    };
  }

  it("homepage, branding, and public navigation use real routes", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const home = await request(app).get("/");
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-public-variant="platform"/);
    assert.match(home.text, /data-ac-acw-screen="ACW01"/);
    assert.match(home.text, />ActiveClinic</);
    assert.match(home.text, /Find a Clinic/);
    assert.match(home.text, /Register Your Clinic/);
    assert.match(home.text, /href="\/login"/);
    assert.match(home.text, /data-ac-home-section="clinic-benefits"/);
    assert.match(home.text, /data-ac-home-section="patient-benefits"/);
    assert.match(home.text, /data-ac-home-section="platform-capabilities"/);
    assert.match(home.text, /data-ac-public-footer="platform"/);
    assert.match(home.text, /href="\/clinics"/);
    assert.match(home.text, /href="\/for-clinics"/);
    assert.match(home.text, /href="\/for-patients"/);
    assert.match(home.text, /href="\/about"/);
    assert.match(home.text, /href="\/contact"/);
    assert.match(home.text, /href="\/register-clinic"/);
    assert.doesNotMatch(home.text, /href="#"/);
    assert.match(home.text, /acw-platform.css/);
    assert.match(home.text, /family=Inter/);
  });

  it("ACW marketing pages render and keep CTAs on real routes", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const pages = [
      ["/for-clinics", "ACW03-01", "/register-clinic"],
      ["/features", "ACW03-03", "/for-clinics"],
      ["/clinic-website", "ACW04", "/register-clinic"],
      ["/for-patients", "ACW05", "/clinics"],
      ["/about", "ACW06", "/contact"],
      ["/contact", "ACW07", "/register-clinic"],
    ];
    for (const [route, screen, cta] of pages) {
      const res = await request(app).get(route);
      assert.equal(res.status, 200, route);
      assert.match(res.text, new RegExp(screen), route);
      assert.match(res.text, new RegExp(`href="${cta}"`), route);
      assert.doesNotMatch(res.text, /href="#"/, route);
    }
    const solutions = await request(app).get("/solutions");
    assert.equal(solutions.status, 200);
    assert.match(solutions.text, /Honest product boundaries/);
  });

  it("directory excludes unpublished clinics and supports search filters", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const published = await provisionPublishedClinic(stamp, {
      publicName: `Ndola Care ${stamp}`,
      city: "Ndola",
      province: "Copperbelt",
      booking: true,
    });
    await pool.query(
      `INSERT INTO activeclinic.appointment_service_types (
         organization_id, healthcare_organization_id, service_key,
         display_name, public_bookable, public_website_visible, public_summary, status
       ) VALUES ($1, $2, 'paeds-clinic', 'Paediatric clinic', false, true, 'Child health', 'active')`,
      [published.organizationId, published.healthcareOrganizationId]
    );

    const hidden = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `ac_acw_hid_${stamp}`,
      displayName: "Hidden ACW Clinic",
      productKey: "activeclinic",
      productTenantKey: `ac-acw-hid-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(hidden.ok, true);
    const hidHco = await createHealthcareOrganization(pool, {
      organizationId: hidden.records.organization.id,
      legalName: "Hidden Legal",
      publicName: "Hidden ACW Never Publish",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(hidHco.ok, true);

    const app = appWithEnv();
    const dir = await request(app).get("/clinics");
    assert.equal(dir.status, 200);
    assert.match(dir.text, /data-ac-acw-screen="ACW02"/);
    assert.match(dir.text, new RegExp(`Ndola Care ${stamp}`));
    assert.match(dir.text, /View Clinic/);
    assert.match(dir.text, new RegExp(`/clinics/${published.orgKey}`));
    assert.doesNotMatch(dir.text, /Hidden ACW Never Publish/);

    const byName = await request(app).get("/clinics").query({ q: `Ndola Care ${stamp}` });
    assert.equal(byName.status, 200);
    assert.match(byName.text, new RegExp(`Ndola Care ${stamp}`));

    const byLocation = await request(app).get("/clinics").query({ location: "Ndola" });
    assert.equal(byLocation.status, 200);
    assert.match(byLocation.text, new RegExp(`Ndola Care ${stamp}`));

    const byService = await request(app).get("/clinics").query({ service: "Paediatric" });
    assert.equal(byService.status, 200);
    assert.match(byService.text, new RegExp(`Ndola Care ${stamp}`));
    assert.match(byService.text, /Paediatric clinic/);

    const empty = await request(app).get("/clinics").query({ q: "zzzz-no-clinic-should-match-zzzz" });
    assert.equal(empty.status, 200);
    assert.match(empty.text, /data-ac-directory-state="empty"/);

    const tenant = await request(app).get(`/clinics/${published.orgKey}`);
    assert.equal(tenant.status, 200);
    assert.match(tenant.text, /data-ac-public-variant="tenant"/);
    assert.doesNotMatch(tenant.text, /acw-platform.css/);
  });

  it("contact validates server-side and only shows success after insert", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const bareSuccess = await request(app).get("/contact/success");
    assert.equal(bareSuccess.status, 303);
    assert.match(String(bareSuccess.headers.location), /\/contact$/);

    const agent = request.agent(app);
    const form = await agent.get("/contact");
    assert.equal(form.status, 200);
    const csrf = extractCsrf(form);
    assert.ok(csrf);

    const invalid = await agent.post("/contact").type("form").send({
      [CSRF_FIELD]: csrf,
      senderName: "A",
      senderEmail: "not-an-email",
      message: "",
    });
    assert.equal(invalid.status, 400);
    assert.match(invalid.text, /Please check your information/);

    const before = await pool.query("SELECT COUNT(*)::int AS n FROM activeclinic.platform_contact_inquiries");
    const validCsrf = extractCsrf(invalid) || csrf;
    const posted = await agent.post("/contact").type("form").send({
      [CSRF_FIELD]: validCsrf,
      senderName: "Chioma Banda",
      senderEmail: "chioma@example.com",
      message: "I would like to register a clinic in Lusaka.",
    });
    assert.equal(posted.status, 303);
    assert.equal(posted.headers.location, "/contact/success");
    const after = await pool.query("SELECT COUNT(*)::int AS n FROM activeclinic.platform_contact_inquiries");
    assert.equal(after.rows[0].n, before.rows[0].n + 1);

    const success = await agent.get("/contact/success");
    assert.equal(success.status, 200);
    assert.match(success.text, /Message received/);
  });

  it("responsive contracts exist for desktop and mobile platform chrome", async () => {
    if (!requireDb()) return;
    const css = fs.readFileSync(
      path.join(__dirname, "../public/activeclinic/acw-platform.css"),
      "utf8"
    );
    assert.match(css, /overflow-x:\s*clip/);
    assert.match(css, /@media \(min-width: 768px\)/);
    assert.match(css, /@media \(max-width: 767px\)/);
    const app = appWithEnv();
    const home = await request(app).get("/");
    assert.match(home.text, /name="viewport"/);
    assert.match(home.text, /ac-public-nav-toggle/);
    assert.match(home.text, /data-ac-mobile-bottom-nav="platform"/);
    assert.match(home.text, /aria-label="Primary"/);
    assert.match(home.text, /aria-label="ActiveClinic home"/);
  });
});
