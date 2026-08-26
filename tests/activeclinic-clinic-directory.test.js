"use strict";

/**
 * ActiveClinic public clinic directory repair tests.
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
const {
  listPublishableClinics,
} = require("../src/activeclinic/services/activeClinicPublicVisibilityService");
const {
  classifyDirectoryError,
} = require("../src/activeclinic/services/activeClinicPublicDirectoryLog");
const {
  renderPublicPage,
} = require("../src/activeclinic/http/renderActiveClinicPublic");
const fs = require("node:fs");
const path = require("node:path");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 971100000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

describe("ActiveClinic clinic directory repair", () => {
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

  async function provisionPublishedClinic(stamp) {
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `ac_dir_${stamp}`,
      displayName: `Directory Clinic ${stamp}`,
      productKey: "activeclinic",
      productTenantKey: `ac-dir-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(org.ok, true);
    const hco = await createHealthcareOrganization(pool, {
      organizationId: org.records.organization.id,
      legalName: `Legal ${stamp}`,
      publicName: `Published Clinic ${stamp}`,
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
    return { org, hco, facility, clinicKey: org.records.organization.organizationKey || `ac_dir_${stamp}` };
  }

  it("empty directory returns HTTP 200 with empty state", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const res = await request(app).get("/clinics");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-ac-directory-state="empty"/);
    assert.match(res.text, /No clinics found/);
    assert.doesNotMatch(res.text, /Directory temporarily unavailable/);
  });

  it("published clinic appears; unpublished remains hidden", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const published = await provisionPublishedClinic(stamp);

    const hidden = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `ac_hid_${stamp}`,
      displayName: "Hidden Clinic",
      productKey: "activeclinic",
      productTenantKey: `ac-hid-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(hidden.ok, true);
    const hidHco = await createHealthcareOrganization(pool, {
      organizationId: hidden.records.organization.id,
      legalName: "Hidden Legal",
      publicName: "Hidden Clinic Never Publish",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(hidHco.ok, true);

    const listed = await listPublishableClinics(pool, {});
    assert.equal(listed.ok, true);
    assert.ok(listed.clinics.some((c) => c.publicName.includes(`Published Clinic ${stamp}`)));
    assert.ok(!listed.clinics.some((c) => /Hidden Clinic Never Publish/.test(c.publicName)));

    const app = appWithEnv();
    const res = await request(app).get("/clinics");
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(`Published Clinic ${stamp}`));
    assert.match(res.text, new RegExp(`/clinics/${published.clinicKey}`));
    assert.doesNotMatch(res.text, /Hidden Clinic Never Publish/);
  });

  it("no-match search returns 200 empty/no-match state", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const res = await request(app).get("/clinics?q=zzzz-no-clinic-should-match-zzzz");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-ac-directory-state="empty"/);
    assert.match(res.text, /No clinics match your search|Clear filters|View all clinics/);
  });

  it("repository error returns controlled 503 with request id", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const res = await request(app).get("/clinics?_directoryError=1");
    assert.equal(res.status, 503);
    assert.match(res.text, /data-ac-directory-state="error"/);
    assert.match(res.text, /Directory temporarily unavailable/);
    assert.match(res.text, /data-ac-request-id=/);
    assert.doesNotMatch(res.text, /DATABASE_URL|password|at Object\./);
  });

  it("classifies missing schema as schema_missing", () => {
    const classified = classifyDirectoryError({
      code: "42P01",
      message: 'relation "activeclinic.healthcare_organizations" does not exist',
    });
    assert.equal(classified.category, "schema_missing");
    assert.equal(classified.safeDatabaseErrorCode, "42P01");
  });

  it("SQL-injection-like search is parameterized and returns 200", async () => {
    if (!requireDb()) return;
    const app = appWithEnv();
    const res = await request(app).get("/clinics").query({ q: "'; DROP TABLE clinics;--" });
    assert.equal(res.status, 200);
    assert.match(res.text, /Find Your Care/);
  });

  it("classifies missing public_website_visible as schema_column_missing", () => {
    const classified = classifyDirectoryError({
      code: "42703",
      message: "column ast.public_website_visible does not exist",
    });
    assert.equal(classified.category, "schema_column_missing");
    assert.equal(classified.safeDatabaseErrorCode, "42703");
  });

  it("incomplete optional clinic metadata still returns 200", async () => {
    if (!requireDb()) return;
    const stamp = `${Date.now().toString(36)}opt`;
    const published = await provisionPublishedClinic(stamp);
    await pool.query(
      `UPDATE activeclinic.healthcare_organizations
          SET website_tagline = NULL,
              website_logo_url = NULL,
              public_phone_display = NULL,
              public_email_display = NULL
        WHERE id = $1`,
      [published.hco.healthcareOrganization.id]
    );
    const app = appWithEnv();
    const res = await request(app).get("/clinics").set("Host", "activeclinic.pronline.org");
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(`Published Clinic ${stamp}`));
    assert.match(res.text, new RegExp(`/clinics/${published.clinicKey}`));
    assert.doesNotMatch(res.text, /Directory temporarily unavailable/);
  });

  it("BlessBoard organization does not appear in the ActiveClinic directory", async () => {
    if (!requireDb()) return;
    const stamp = `${Date.now().toString(36)}bb`;
    const bb = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `bb_dir_${stamp}`,
      displayName: `BlessBoard Dir ${stamp}`,
      productKey: "blessboard",
      productTenantKey: `bb-dir-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(bb.ok, true, JSON.stringify(bb));
    const listed = await listPublishableClinics(pool, {});
    assert.equal(listed.ok, true);
    assert.ok(!listed.clinics.some((c) => /BlessBoard Dir/.test(c.publicName || "")));
    const app = appWithEnv();
    const res = await request(app).get("/clinics");
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, new RegExp(`BlessBoard Dir ${stamp}`));
  });

  it("ACW02 visual structure matches Stitch composition without fake chips or a persistent sidebar", () => {
    const html = renderPublicPage({
      pageId: "public-clinics-directory",
      pageTitle: "Find a Clinic",
      contentTemplate: "public/clinics-directory",
      shellVariant: "platform",
      locals: {
        clinics: [{
          clinicKey: "demo-centre",
          publicName: "ActiveClinic Demo Centre",
          city: "Lusaka",
          province: "Lusaka Province",
          websiteTagline: "Demonstration clinic — sample information only",
          services: ["Blood pressure check"],
          publicBasePath: "/clinics/demo-centre",
        }],
        search: "",
        location: "",
        service: "",
        province: "",
        city: "",
        directoryState: "ready",
      },
    });
    assert.match(html, /data-ac-acw-screen="ACW02"/);
    assert.match(html, /Find Your Care/);
    assert.match(html, /Find a Clinic/);
    assert.match(html, /data-ac-directory-search="1"/);
    assert.match(html, /data-ac-directory-search-mobile="1"/);
    assert.match(html, /data-ac-filter-drawer/);
    assert.match(html, /View Clinic/);
    assert.match(html, /href="\/clinics\/demo-centre"/);
    assert.match(html, /Key Services/);
    assert.doesNotMatch(html, /ac-directory-filters-sidebar/);
    assert.doesNotMatch(html, /Open Now/);
    assert.doesNotMatch(html, /Telehealth available/);
    assert.doesNotMatch(html, /Accessible Facility/);
    assert.equal((html.match(/data-ac-public-footer="platform"/g) || []).length, 1);
    assert.equal((html.match(/id="ac-directory-filter-drawer"/g) || []).length, 1);
    const css = fs.readFileSync(
      path.join(__dirname, "..", "public", "activeclinic", "acw-platform.css"),
      "utf8"
    );
    assert.match(css, /\[data-ac-acw-screen="ACW02"\] \.acw-search--desktop/);
    assert.match(css, /\[data-ac-acw-screen="ACW02"\] \.acw-search--compact/);
    assert.match(css, /@media \(max-width: 767px\)[\s\S]*acw-search--desktop[\s\S]*display:\s*none/);
  });
});
