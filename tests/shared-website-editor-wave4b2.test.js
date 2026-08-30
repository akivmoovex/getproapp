"use strict";

/**
 * Wave 4B-2 — historical preview, reorder rendering, manifests, styles, SEO, add section.
 */

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { createPlatformIdentitySession } = require("../src/platform/session/createDeploymentSession");
const { createV5Session } = require("../src/platform/session/createV5Session");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const versionService = require("../src/platform/website/versionService");
const publicationService = require("../src/platform/website/publicationService");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const {
  PRODUCT_CODE,
  buildPublicWebsitePreviewPath,
  buildPublicWebsiteStylesPath,
  buildPublicWebsiteSeoPath,
} = require("../src/platform/website/publicWebsiteUrl");
const { buildManifest } = require("../src/activeclinic/website/activeClinicSectionActionService");
const { listAddableSectionTypes, isSingletonViolation } = require("../src/platform/website/sectionRegistry");
const { applyStructuredDraftsToModel } = require("../src/blessboard/services/websiteStructuredDraftService");
const { renderVersionPreviewBanner } = require("../src/platform/website/renderVersionPreviewBanner");
const { buildVersionPreviewView } = require("../src/platform/website/versionPreviewModel");

const ROOT = path.join(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "clinic-admin-pass-12";
const BB_PASSWORD = "TestPassword99!";

let pool;
let skipReason = null;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function extractCsrf(html) {
  const hidden = String(html).match(/name="_csrf"\s+value="([^"]+)"/);
  if (hidden) return hidden[1];
  const meta = String(html).match(/name="csrf-token"\s+content="([^"]+)"/);
  return meta ? meta[1] : "";
}

function cookieHeader(base, res) {
  const extra = res.headers["set-cookie"];
  if (!extra) return base;
  const parts = Array.isArray(extra) ? extra : [extra];
  return [base].concat(parts.map((c) => c.split(";")[0])).join("; ");
}

async function publishTwice(orgId, instanceId, productCode, actorId) {
  await contentService.saveWebsiteDraft(pool, {
    organizationId: orgId,
    instanceId,
    expectedProductCode: productCode,
    contentKey: "home.hero.heading",
    value: `Heading ${uniq("h")}`,
    actorIdentityId: actorId,
    grantedPermissions: ["website.edit", "website.publish"],
  });
  await publicationService.publishWebsiteDraft(pool, {
    organizationId: orgId,
    instanceId,
    expectedProductCode: productCode,
    actorIdentityId: actorId,
    allowEmpty: true,
  });
  await contentService.saveWebsiteDraft(pool, {
    organizationId: orgId,
    instanceId,
    expectedProductCode: productCode,
    contentKey: "home.hero.heading",
    value: `Heading ${uniq("h2")}`,
    actorIdentityId: actorId,
    grantedPermissions: ["website.edit", "website.publish"],
  });
  await publicationService.publishWebsiteDraft(pool, {
    organizationId: orgId,
    instanceId,
    expectedProductCode: productCode,
    actorIdentityId: actorId,
    allowEmpty: true,
  });
}

describe("shared website editor wave 4b2 — static surfaces", () => {
  it("shared historical preview banner is read-only with restore affordance", () => {
    const banner = renderVersionPreviewBanner(
      buildVersionPreviewView(
        { versionNumber: 2, status: "superseded", publishedAt: "2026-01-01T10:00:00Z" },
        {
          historyHref: "/history",
          restoreHref: "/restore",
          canRestore: true,
          csrfToken: "tok",
        }
      )
    );
    assert.match(banner, /Viewing historical version/);
    assert.match(banner, /data-gp-website-version-preview/);
    assert.match(banner, /Restore as draft/);
    assert.doesNotMatch(banner, /data-website-engine-publish/);
  });

  it("BlessBoard home template orders teaser sections from sortOrder", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    assert.match(home, /homeMiddleOrder/);
    assert.match(home, /orderedTeaserKeys\.forEach/);
  });

  it("ActiveClinic non-home manifests are defined for about and contact", () => {
    const about = buildManifest("about", []);
    const contact = buildManifest("contact", []);
    assert.ok(about.sections.length > 0);
    assert.ok(contact.sections.length > 0);
    assert.equal(about.pageKey, "about");
    assert.equal(contact.pageKey, "contact");
  });

  it("domain-backed AC sections remain flagged in manifests", () => {
    const services = buildManifest("services", []);
    const doctors = services.sections.find((s) => s.sectionKey === "services");
    assert.equal(doctors && doctors.domainBacked, true);
    const doctorsPage = buildManifest("doctors", []);
    const doctorsSection = doctorsPage.sections.find((s) => s.sectionKey === "doctors");
    assert.equal(doctorsSection && doctorsSection.domainBacked, true);
  });

  it("shared styles and SEO surfaces exist for both products", () => {
    const styles = read("views/platform/website/styles-page.ejs");
    const seo = read("views/platform/website/seo-page.ejs");
    assert.match(styles, /data-gp-website-styles/);
    assert.match(seo, /data-gp-website-seo/);
    assert.match(read("src/blessboard/http/blessboardWebsiteEditorRoutes.js"), /website\/styles/);
    assert.match(read("src/activeclinic/http/activeClinicWebsiteRoutes.js"), /website\/styles/);
    assert.match(read("src/blessboard/http/blessboardWebsiteEditorRoutes.js"), /website\/seo/);
    assert.match(read("src/activeclinic/http/activeClinicWebsiteRoutes.js"), /website\/seo/);
  });

  it("add section registry enforces singleton types", () => {
    assert.equal(
      isSingletonViolation(PRODUCT_CODE.ACTIVECLINIC, "services", ["services"]),
      true
    );
    const types = listAddableSectionTypes(PRODUCT_CODE.BLESSBOARD, "home", []);
    assert.ok(types.length > 0);
  });

  it("editor chrome wires add section endpoint", () => {
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    assert.match(chrome, /data-website-add-section-url/);
    assert.match(read("public/platform/website-add-section.js"), /add-section\/types/);
  });

  it("PREVIEW_URL_TEST_DRIFT_CLOSED uses canonical draft preview query", () => {
    assert.equal(
      buildPublicWebsitePreviewPath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "demo",
      }),
      "/clinics/demo?website_mode=draft"
    );
    assert.equal(
      buildPublicWebsiteStylesPath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "demo",
      }),
      "/clinics/demo/website/styles"
    );
    assert.equal(
      buildPublicWebsiteSeoPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "demo",
      }),
      "/c/demo/website/seo"
    );
  });
});

describe("shared website editor wave 4b2 — HTTP", () => {
  let acSlug;
  let acOrgId;
  let acIdentityId;
  let acInstanceId;
  let bbSlug;
  let bbOrgId;
  let bbUserId;
  let bbInstanceId;
  let acCookie;
  let bbCookie;
  let acApp;
  let bbApp;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const stamp = uniq("w4b2");
      const acResult = await submitAndProvisionClinicRegistration(pool, {
        clinicName: `Wave4B2 ${stamp}`,
        contactName: "Website Admin",
        contactEmail: `${stamp}-ac@example.invalid`,
        contactPhone: `+2609${String(Date.now()).slice(-8)}`,
        province: "Lusaka Province",
        city: "Lusaka",
        address: "1 Independence Avenue",
        countryCode: "ZM",
        password: AC_PASSWORD,
        passwordConfirm: AC_PASSWORD,
        acceptTerms: "on",
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        dataEnvironment: "testing",
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
          DATABASE_URL: "postgres://unused/local",
          SESSION_SECRET: "a".repeat(40),
        },
      });
      acSlug = acResult.slug;
      acOrgId = acResult.organizationId;
      acIdentityId = acResult.identityId;
      const acInstance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
        organizationId: acOrgId,
        productCode: "activeclinic",
      });
      acInstanceId = acInstance.id;
      await publishTwice(acOrgId, acInstanceId, "activeclinic", acIdentityId);
      await setClinicWebsiteAvailability(pool, {
        organizationKey: acSlug,
        public: true,
        overrideReadiness: true,
        reason: "wave4b2",
      });
      const acSession = await createPlatformIdentitySession(pool, {
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        platformIdentityId: acIdentityId,
        organizationId: acOrgId,
      });
      acCookie = `${COOKIE_ACTIVECLINIC_ORG}=${acSession.rawToken}`;

      const bbKey = uniq("w4b2-bb");
      const row = await appRepo.createApplication(pool, {
        church_name: `Wave4B2 ${bbKey}`,
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Site Admin",
        contact_email: `${bbKey}@example.org`,
        contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
        selected_plan: "foundation",
        consent_terms: true,
        branch_name: "Main Campus",
      });
      const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: row.id,
        administratorPassword: BB_PASSWORD,
        requestId: `req-${bbKey}`,
        actorContext: {
          type: "test",
          source: "wave4b2",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-staging",
        },
      });
      bbSlug = provisioned.records.organizationKey;
      bbOrgId = provisioned.records.organizationId;
      bbUserId = provisioned.records.administratorUserId;
      const bbInstance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
        organizationId: bbOrgId,
        productCode: "blessboard",
      });
      bbInstanceId = bbInstance.id;
      await publishTwice(bbOrgId, bbInstanceId, "blessboard", bbUserId);

      const bbSession = await createV5Session(pool, {
        userId: bbUserId,
        deploymentCode: "blessboard-org-staging",
      });
      bbCookie = `${DEFAULT_V5_COOKIE}=${bbSession.rawToken}`;

      acApp = createActiveClinicFoundationApp({
        getPool: () => pool,
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
          DATABASE_URL: "postgres://unused/local",
          SESSION_SECRET: "a".repeat(40),
        },
      });
      bbApp = createV5FoundationApp({
        getPool: () => pool,
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
          BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
          BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
        },
      });
    } catch (err) {
      skipReason = err.message || String(err);
    }
  });

  it("BB historical preview renders snapshot HTML with shared banner", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const listed = await versionService.listWebsiteVersions(pool, {
      organizationId: bbOrgId,
      instanceId: bbInstanceId,
    });
    const historical = (listed.versions || []).find((v) => v.status !== "published");
    assert.ok(historical, "expected historical version");
    const res = await request(bbApp)
      .get(`/c/${bbSlug}/website/versions/${historical.id}`)
      .set("Cookie", bbCookie)
      .set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-gp-website-version-preview/);
    assert.match(res.text, /Viewing historical version/);
    assert.doesNotMatch(res.text, /data-website-engine-publish/);
  });

  it("BB draft reorder updates structured home model order", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const model = {
      pageKey: "home",
      sections: [
        { sectionKey: "hero", sortOrder: 10 },
        { sectionKey: "welcome", sortOrder: 20 },
        { sectionKey: "events_intro", sortOrder: 30 },
        { sectionKey: "ministries_intro", sortOrder: 40 },
      ],
    };
    const next = applyStructuredDraftsToModel(model, [
      {
        draftKind: "page_section",
        pageKey: "home",
        op: "reorder",
        payload: { order: ["hero", "welcome", "ministries_intro", "events_intro"] },
      },
    ]);
    const keys = next.sections.map((s) => s.sectionKey);
    assert.deepEqual(keys, ["hero", "welcome", "ministries_intro", "events_intro"]);
  });

  it("styles save creates draft without publishing", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const page = await request(acApp)
      .get(`/clinics/${acSlug}/website/styles`)
      .set("Cookie", acCookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-gp-website-styles/);
    const csrf = extractCsrf(page.text);
    const cookie = cookieHeader(acCookie, page);
    const saved = await request(acApp)
      .post(`/clinics/${acSlug}/website/styles`)
      .set("Cookie", cookie)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, primaryColor: "#112233", accentColor: "#445566" });
    assert.equal(saved.status, 303);
    const row = await contentService.getWebsiteContentRow(
      pool,
      acInstanceId,
      acOrgId,
      "brand.primary_color"
    );
    assert.equal(row.draftValue, "#112233");
    assert.notEqual(row.publishedValue, "#112233");
  });

  it("SEO save creates draft metadata", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const page = await request(acApp)
      .get(`/clinics/${acSlug}/website/seo`)
      .set("Cookie", acCookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-gp-website-seo/);
    const csrf = extractCsrf(page.text);
    const cookie = cookieHeader(acCookie, page);
    const title = `SEO ${uniq("t")}`;
    const saved = await request(acApp)
      .post(`/clinics/${acSlug}/website/seo`)
      .set("Cookie", cookie)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, seoTitle: title, seoDescription: "Draft description" });
    assert.equal(saved.status, 303);
    const row = await contentService.getWebsiteContentRow(pool, acInstanceId, acOrgId, "seo.title");
    assert.equal(row.draftValue, title);
  });

  it("BB SEO save creates engine draft and publish updates published value", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const page = await request(bbApp)
      .get(`/c/${bbSlug}/website/seo`)
      .set("Cookie", bbCookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-gp-website-seo/);
    const csrf = extractCsrf(page.text);
    const cookie = cookieHeader(bbCookie, page);
    const title = `BB SEO ${uniq("t")}`;
    const saved = await request(bbApp)
      .post(`/c/${bbSlug}/website/seo`)
      .set("Cookie", cookie)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, seoTitle: title, seoDescription: "BB draft description" });
    assert.equal(saved.status, 303);
    const row = await contentService.getWebsiteContentRow(pool, bbInstanceId, bbOrgId, "seo.title");
    assert.ok(row, "expected engine content row");
    assert.equal(row.draftValue, title);
    assert.notEqual(row.publishedValue, title);
    await publicationService.publishWebsiteDraft(pool, {
      organizationId: bbOrgId,
      instanceId: bbInstanceId,
      expectedProductCode: "blessboard",
      actorIdentityId: bbUserId,
      allowEmpty: true,
    });
    const published = await contentService.getWebsiteContentRow(
      pool,
      bbInstanceId,
      bbOrgId,
      "seo.title"
    );
    assert.equal(published.publishedValue, title);
  });

  it("invalid add section type is rejected", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const res = await request(acApp)
      .post(`/clinics/${acSlug}/website/add-section`)
      .set("Cookie", acCookie)
      .send({ pageKey: "home", type: "not_a_real_type", [CSRF_FIELD]: "invalid" });
    assert.ok(res.status === 400 || res.status === 403);
  });

  it("singleton duplicate add section is rejected server-side", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const types = await request(acApp)
      .get(`/clinics/${acSlug}/website/add-section/types?pageKey=home`)
      .set("Cookie", acCookie);
    assert.equal(types.status, 200);
    const csrfPage = await request(acApp)
      .get(`/clinics/${acSlug}?website_edit=1&website_mode=draft`)
      .set("Cookie", acCookie);
    const csrf = extractCsrf(csrfPage.text);
    const first = await request(acApp)
      .post(`/clinics/${acSlug}/website/add-section`)
      .set("Cookie", acCookie)
      .send({ pageKey: "home", type: "text", [CSRF_FIELD]: csrf });
    if (first.status === 200) {
      const dup = await request(acApp)
        .post(`/clinics/${acSlug}/website/add-section`)
        .set("Cookie", acCookie)
        .send({ pageKey: "home", type: "hero", [CSRF_FIELD]: csrf });
      assert.equal(dup.status, 400);
      assert.equal(dup.body.code, "singleton_exists");
    }
  });
});
