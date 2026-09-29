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
          province: "Lusaka",
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
    assert.match(html, /data-ac-clinic-card-link="1"/);
    assert.match(html, /data-ac-clinic-key="demo-centre"/);
    assert.match(html, /class="acw-clinic-card__link"/);
    assert.doesNotMatch(html, /<h2><a href=/);
    assert.equal((html.match(/href="\/clinics\/demo-centre"/g) || []).length, 1);
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
    assert.match(css, /\[data-ac-acw-screen="ACW02"\] \.acw-clinic-card__link/);
    assert.match(css, /@media \(max-width: 767px\)[\s\S]*acw-search--desktop[\s\S]*display:\s*none/);
  });

  it("directory card href resolves to clinic detail for published tenant", async () => {
    if (!requireDb()) return;
    const stamp = `${Date.now().toString(36)}nav`;
    const published = await provisionPublishedClinic(stamp);
    const app = appWithEnv();

    const directory = await request(app).get("/clinics");
    assert.equal(directory.status, 200);
    assert.match(
      directory.text,
      new RegExp(`href="/clinics/${published.clinicKey}"[^>]*data-ac-clinic-card-link="1"`)
    );
    assert.match(
      directory.text,
      new RegExp(`data-ac-clinic-key="${published.clinicKey}"`)
    );
    const detail = await request(app).get(`/clinics/${published.clinicKey}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, new RegExp(`Published Clinic ${stamp}`));

    const missing = await request(app).get("/clinics/does-not-exist-clinic-key-zzzz");
    assert.ok([404, 410].includes(missing.status));

    const legacy = await request(app).get(`/c/${published.clinicKey}`);
    assert.ok([200, 301, 302].includes(legacy.status));
    if (legacy.status >= 300) {
      assert.match(String(legacy.headers.location || ""), new RegExp(`/clinics/${published.clinicKey}`));
    }
  });

  it("every directory card href opens the matching clinic and ignores unpublished tenants", async () => {
    if (!requireDb()) return;
    const stamp = `${Date.now().toString(36)}all`;
    const a = await provisionPublishedClinic(`${stamp}a`);
    const b = await provisionPublishedClinic(`${stamp}b`);
    const hidden = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `ac_hidnav_${stamp}`,
      displayName: "Hidden Nav Clinic",
      productKey: "activeclinic",
      productTenantKey: `ac-hidnav-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(hidden.ok, true);
    const hidHco = await createHealthcareOrganization(pool, {
      organizationId: hidden.records.organization.id,
      legalName: "Hidden Nav Legal",
      publicName: `Hidden Nav Never ${stamp}`,
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(hidHco.ok, true);

    const app = appWithEnv();
    const directory = await request(app).get("/clinics");
    assert.equal(directory.status, 200);
    assert.doesNotMatch(directory.text, new RegExp(`Hidden Nav Never ${stamp}`));

    const hrefRe =
      /<a[^>]*class="acw-clinic-card__link"[^>]*href="(\/clinics\/[^"]+)"[^>]*data-ac-clinic-card-link="1"[^>]*data-ac-clinic-key="([^"]+)"/gs;
    const cards = [];
    let match;
    while ((match = hrefRe.exec(directory.text))) {
      cards.push({ href: match[1], key: match[2] });
    }
    // Fallback if whitespace between attributes breaks the primary regex.
    if (!cards.length) {
      const loose =
        /href="(\/clinics\/[^"]+)"[\s\S]{0,120}?data-ac-clinic-card-link="1"[\s\S]{0,80}?data-ac-clinic-key="([^"]+)"/g;
      while ((match = loose.exec(directory.text))) {
        cards.push({ href: match[1], key: match[2] });
      }
    }
    assert.ok(cards.length >= 2);
    const byKey = new Map(cards.map((c) => [c.key, c.href]));
    assert.equal(byKey.get(a.clinicKey), `/clinics/${a.clinicKey}`);
    assert.equal(byKey.get(b.clinicKey), `/clinics/${b.clinicKey}`);
    assert.equal(byKey.has(`ac_hidnav_${stamp}`), false);

    for (const entry of [
      { clinic: a, label: `${stamp}a` },
      { clinic: b, label: `${stamp}b` },
    ]) {
      const page = await request(app).get(`/clinics/${entry.clinic.clinicKey}`);
      assert.equal(page.status, 200, entry.clinic.clinicKey);
      assert.match(page.text, new RegExp(`Published Clinic ${entry.label}`));
      assert.match(page.text, new RegExp(entry.clinic.clinicKey));
      const other = entry.clinic === a ? b : a;
      assert.doesNotMatch(
        page.text,
        new RegExp(`data-ac-clinic-key="${other.clinicKey}"`)
      );
    }

    await pool.query(
      `UPDATE activeclinic.healthcare_organizations
          SET website_published = false
        WHERE organization_id = $1`,
      [a.org.records.organization.id]
    );
    const afterUnpublish = await request(app).get("/clinics");
    assert.doesNotMatch(
      afterUnpublish.text,
      new RegExp(`href="/clinics/${a.clinicKey}"[^>]*data-ac-clinic-card-link="1"`)
    );
    const directUnpublished = await request(app).get(`/clinics/${a.clinicKey}`);
    assert.ok(
      [403, 404, 410].includes(directUnpublished.status),
      `unpublished direct status ${directUnpublished.status}`
    );
  });

  it("directoryClinicDetailHref always uses the shared /clinics/:key helper", () => {
    const {
      directoryClinicDetailHref,
    } = require("../src/activeclinic/services/activeClinicPublicVisibilityService");
    const {
      isPublicOrganizationKey,
    } = require("../src/platform/website/publicWebsiteUrl");
    assert.equal(directoryClinicDetailHref("Julflona-Clinic"), "/clinics/julflona-clinic");
    assert.equal(directoryClinicDetailHref(" ac-demo "), "/clinics/ac-demo");
    assert.equal(directoryClinicDetailHref(""), "");
    assert.equal(directoryClinicDetailHref(null), "");
    assert.equal(directoryClinicDetailHref(".."), "");
    assert.equal(directoryClinicDetailHref("."), "");
    assert.equal(directoryClinicDetailHref("foo/bar"), "");
    assert.equal(directoryClinicDetailHref("has space"), "");
    assert.equal(isPublicOrganizationKey("julflona-clinic"), true);
    assert.equal(isPublicOrganizationKey(".."), false);
  });

  it("invalid clinic keys fail closed; encoded and inactive clinics behave safely", async () => {
    if (!requireDb()) return;
    const stamp = `${Date.now().toString(36)}enc`;
    const published = await provisionPublishedClinic(stamp);
    const app = appWithEnv();

    const encoded = await request(app)
      .get(`/clinics/${encodeURIComponent(published.clinicKey.toUpperCase())}`)
      .redirects(1);
    assert.equal(encoded.status, 200);
    assert.match(encoded.text, new RegExp(`Published Clinic ${stamp}`));
    assert.match(String(encoded.request.url || ""), new RegExp(published.clinicKey));

    for (const bad of [
      "_leading-underscore",
      "9starts-with-digit",
      "has space",
      "bad!",
      "too-long-" + "x".repeat(80),
      "does-not-exist-clinic-key-zzzz",
    ]) {
      const res = await request(app).get(`/clinics/${encodeURIComponent(bad)}`);
      assert.ok(
        [400, 404, 410].includes(res.status),
        `expected fail-closed for ${bad}, got ${res.status}`
      );
    }

    await pool.query(
      `UPDATE platform.organizations SET status = 'inactive', updated_at = now() WHERE id = $1`,
      [published.org.records.organization.id]
    );
    const listed = await request(app).get("/clinics");
    assert.doesNotMatch(
      listed.text,
      new RegExp(`href="/clinics/${published.clinicKey}"[^>]*data-ac-clinic-card-link="1"`)
    );
    const directInactive = await request(app).get(`/clinics/${published.clinicKey}`);
    assert.ok(
      [403, 404, 410].includes(directInactive.status),
      `inactive direct status ${directInactive.status}`
    );
  });
});
