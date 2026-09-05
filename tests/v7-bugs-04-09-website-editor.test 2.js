"use strict";

/**
 * Bugs 04–09: visual version preview, website editor coverage,
 * FAQ collection editing, centralized nav, and Find-a-clinic hidden
 * on public clinic websites.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
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
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const instanceRepo = require("../src/platform/website/instanceRepository");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const versionService = require("../src/platform/website/versionService");
const resolver = require("../src/platform/website/resolver");
const {
  unclassifiedRows,
  expectedInlineKeysForPage,
  PUBLIC_PAGES,
  CLASSIFICATION,
  COVERAGE,
} = require("../src/activeclinic/website/activeClinicWebsiteEditorCoverage");
const {
  DIRECTORY_LABELS,
  buildClinicWebsiteNav,
} = require("../src/activeclinic/website/activeClinicClinicWebsiteNav");
const {
  isPublicClinicDirectoryNavEnabled,
  PUBLIC_DIRECTORY_ENTRY_POINTS,
} = require("../src/activeclinic/website/activeClinicPublicCapabilities");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "bugs0409-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 740000000;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function clinicPayload(overrides) {
  stamp += 1;
  return {
    clinicName: `Bugs0409 Clinic ${stamp}`,
    contactName: "Website Admin",
    contactEmail: `bugs0409-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka",
    city: "Lusaka",
    address: `${stamp} Independence Avenue`,
    countryCode: "ZM",
    notes: "bugs 04-09",
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    ...overrides,
  };
}

async function sessionCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

function extractCsrf(res) {
  const html = String(res.text || "");
  const meta = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const field = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
  return field ? field[1] : issueCsrfToken(MINIMAL_AC);
}

function cookieHeader(session, pageRes) {
  const parts = [session];
  const set = pageRes && pageRes.headers && pageRes.headers["set-cookie"];
  if (Array.isArray(set)) parts.push(...set);
  else if (set) parts.push(set);
  return parts.join("; ");
}

function websiteKeys(html) {
  return [...String(html).matchAll(/data-website-key="([^"]+)"/g)].map((m) => m[1]);
}

function hasDirectoryCopy(html) {
  return DIRECTORY_LABELS.some((label) => {
    const re = new RegExp(`>${label}<|aria-label="${label}"`, "i");
    return re.test(String(html));
  });
}

describe("v7 bugs 04-09 website editor architecture", () => {
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
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("coverage matrix has no unclassified sections", () => {
    assert.equal(unclassifiedRows().length, 0);
    const classes = new Set(COVERAGE.map((row) => row.classification));
    assert.deepEqual(
      [...classes].sort(),
      [CLASSIFICATION.EDITABLE_CONTENT, CLASSIFICATION.OPERATIONAL_DATA, CLASSIFICATION.PLATFORM_CONTROLLED].sort()
    );
    assert.ok(PUBLIC_PAGES.includes("services"));
    assert.ok(expectedInlineKeysForPage("contact").includes("contact.page_title"));
    assert.ok(expectedInlineKeysForPage("home").includes("home.faq_heading"));
  });

  it("central nav hides directory links and protects system items", () => {
    assert.equal(isPublicClinicDirectoryNavEnabled({}), false);
    const nav = buildClinicWebsiteNav(
      {
        clinicKey: "demo",
        publicName: "Demo",
        publicBookingEnabled: true,
        showDoctors: true,
        showPricing: true,
        showPatientInformation: true,
        publicPagePaths: {
          home: "/clinics/demo",
          about: "/clinics/demo/about",
          doctors: "/clinics/demo/doctors",
          services: "/clinics/demo/services",
          pricing: "/clinics/demo/pricing",
          location: "/clinics/demo/location",
          contact: "/clinics/demo/contact",
          book: "/clinics/demo/book",
          patientLogin: "/clinics/demo/patient/login",
          myBooking: "/clinics/demo/my-booking",
          patientInformation: "/clinics/demo/patient-information",
          privacy: "/clinics/demo/privacy",
          terms: "/clinics/demo/terms",
        },
      },
      { env: {} }
    );
    assert.equal(nav.directoryNavEnabled, false);
    const hrefs = []
      .concat(nav.desktop, nav.drawer, nav.footerQuick, nav.footerLegal, nav.bottom)
      .map((item) => `${item.label} ${item.href}`);
    assert.equal(hrefs.some((row) => /\/clinics$/.test(row.split(" ").pop())), false);
    assert.equal(
      hrefs.some((row) => /All clinics|ActiveClinic directory|Find a clinic/.test(row)),
      false
    );
    assert.ok(nav.desktop.some((item) => item.key === "patientLogin" && item.protected));
    assert.ok(nav.desktop.some((item) => item.key === "book" && item.protected));
    assert.ok(nav.bottom.some((item) => item.key === "doctors" && item.label === "Doctors"));
  });

  it("public directory entry points are gated except the QA /clinics route", () => {
    assert.equal(isPublicClinicDirectoryNavEnabled({}), false);
    const advertised = PUBLIC_DIRECTORY_ENTRY_POINTS.filter((row) => row.gated);
    const qaRoutes = PUBLIC_DIRECTORY_ENTRY_POINTS.filter((row) => row.qa_route);
    assert.ok(advertised.length >= 12);
    assert.ok(qaRoutes.some((row) => row.destination === "/clinics"));
    assert.ok(qaRoutes.some((row) => row.destination === "/clinics/search"));
    assert.equal(
      advertised.every((row) => row.destination === "/clinics" || row.destination.startsWith("/clinics")),
      true
    );
  });

  it("version preview renders HTML, stays read-only, and isolates draft/live", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const result = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(result.ok, true, JSON.stringify(result));
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      allowEmpty: true,
      actorIdentityId: result.identityId,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const availability = await setClinicWebsiteAvailability(pool, {
      organizationKey: result.slug,
      public: true,
      overrideReadiness: true,
      reason: "bugs0409_preview",
    });
    assert.equal(availability.ok, true, JSON.stringify(availability));
    const listed = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: result.organizationId,
    });
    const version = (listed.versions || [])[0];
    assert.ok(version && version.id);

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const cookie = await sessionCookie(result.identityId, result.organizationId);
    const preview = await request(app)
      .get(`/clinics/${result.slug}/website/versions/${version.id}`)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(preview.status, 200, preview.text.slice(0, 240));
    assert.match(String(preview.headers["content-type"] || ""), /html/);
    assert.doesNotMatch(preview.text, /"ok"\s*:\s*true/);
    assert.match(preview.text, /Previewing saved version/);
    assert.match(preview.text, /This version is read-only/);
    assert.doesNotMatch(preview.text, /data-website-start="1"/);
    assert.doesNotMatch(preview.text, /data-website-collection-key="home.faq"/);
    assert.match(preview.text, new RegExp(payload.clinicName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const asJson = await request(app)
      .get(`/clinics/${result.slug}/website/versions/${version.id}?format=json`)
      .set("Cookie", cookie)
      .set("Accept", "application/json");
    assert.equal(asJson.status, 200);
    const jsonBody = JSON.parse(asJson.text);
    assert.equal(jsonBody.ok, true);
    assert.equal(jsonBody.version.id, version.id);

    const denied = await request(app)
      .get(`/clinics/${result.slug}/website/versions/${version.id}`)
      .set("Accept", "text/html");
    assert.ok([401, 403, 404].includes(denied.status), String(denied.status));

    const liveBefore = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    const draftBefore = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.DRAFT,
    });
    const titleLive = liveBefore.values["home.hero.title"];
    const titleDraft = draftBefore.values["home.hero.title"];

    const editPage = await request(app)
      .get(`/clinics/${result.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", cookie);
    assert.equal(editPage.status, 200);
    assert.match(editPage.text, /data-website-collection-key="home.faq"/);
    assert.match(editPage.text, /data-website-nav-editor="1"/);
    assert.equal(hasDirectoryCopy(editPage.text), false);
    const csrf = extractCsrf(editPage);
    const cookies = cookieHeader(cookie, editPage);
    const faqSave = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookies)
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.faq",
        value: [
          { question: "Draft-only FAQ?", answer: "Yes, this stays in draft until publish." },
          { question: "Second question?", answer: "Second answer." },
        ],
      });
    assert.equal(faqSave.status, 200, faqSave.text);
    assert.equal(JSON.parse(faqSave.text).published, false);

    const contactSave = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookies)
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "contact.page_title",
        value: "Draft Contact Heading",
      });
    assert.equal(contactSave.status, 200, contactSave.text);

    const liveAfter = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    const draftAfter = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(liveAfter.values["home.hero.title"], titleLive);
    assert.equal(JSON.stringify(liveAfter.values["home.faq"]), JSON.stringify(liveBefore.values["home.faq"]));
    assert.notEqual(JSON.stringify(draftAfter.values["home.faq"]), JSON.stringify(liveAfter.values["home.faq"]));
    assert.equal(draftAfter.values["contact.page_title"], "Draft Contact Heading");
    assert.notEqual(liveAfter.values["contact.page_title"], "Draft Contact Heading");

    const publicHome = await request(app).get(`/clinics/${result.slug}`);
    assert.equal(publicHome.status, 200);
    assert.doesNotMatch(publicHome.text, /Draft-only FAQ\?/);
    assert.doesNotMatch(publicHome.text, /data-website-start="1"/);
    assert.equal(hasDirectoryCopy(publicHome.text), false);
    assert.doesNotMatch(publicHome.text, />Find</);

    const publicServices = await request(app).get(`/clinics/${result.slug}/services`);
    assert.equal(publicServices.status, 200);
    assert.doesNotMatch(publicServices.text, /Example: General consultation/);
    assert.doesNotMatch(publicServices.text, /data-ac-template-examples=/);
    assert.match(publicServices.text, /Service listings are not available yet|No public services yet|No public services are published/);
    assert.doesNotMatch(publicServices.text, /Manage public catalogue/);

    const publicContact = await request(app).get(`/clinics/${result.slug}/contact`);
    assert.equal(publicContact.status, 200);
    assert.match(publicContact.text, /Send message/);
    assert.doesNotMatch(publicContact.text, /Draft Contact Heading/);

    const draftContact = await request(app)
      .get(`/clinics/${result.slug}/contact?website_edit=1&website_mode=draft`)
      .set("Cookie", cookie);
    assert.equal(draftContact.status, 200);
    assert.match(draftContact.text, /Draft Contact Heading/);
    assert.match(draftContact.text, /Manage clinic contact details/);
    for (const key of expectedInlineKeysForPage("contact")) {
      assert.ok(websiteKeys(draftContact.text).includes(key), `contact missing ${key}`);
    }

    const draftServices = await request(app)
      .get(`/clinics/${result.slug}/services?website_edit=1&website_mode=draft`)
      .set("Cookie", cookie);
    assert.equal(draftServices.status, 200);
    assert.match(draftServices.text, /Manage public catalogue/);
    for (const key of expectedInlineKeysForPage("services")) {
      assert.ok(websiteKeys(draftServices.text).includes(key), `services missing ${key}`);
    }

    const faqRemove = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookies)
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.faq",
        value: [{ question: "Only one left?", answer: "Removed the others in draft." }],
      });
    assert.equal(faqRemove.status, 200);
    const draftFaq = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(draftFaq.values["home.faq"].length, 1);
    const liveFaq = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.notEqual(liveFaq.values["home.faq"].length, 1);

    const historic = await versionService.getWebsiteVersion(pool, {
      versionId: version.id,
      organizationId: result.organizationId,
      instanceId: instance.id,
    });
    assert.equal(historic.ok, true);
    assert.equal(historic.version.id, version.id);
    const historicTitle = historic.version.snapshot.values["home.hero.title"];
    const publishedTitleX = `Published X ${payload.clinicName}`;
    const savePublished = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookies)
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.title",
        value: publishedTitleX,
      });
    assert.equal(savePublished.status, 200, savePublished.text);
    const publishX = await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      actorIdentityId: result.identityId,
    });
    assert.equal(publishX.ok, true, JSON.stringify(publishX));
    const listedBeforeRestore = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: result.organizationId,
    });
    const liveBeforeRestore = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveBeforeRestore.values["home.hero.title"], publishedTitleX);
    assert.notEqual(publishedTitleX, historicTitle);

    const restoreRes = await request(app)
      .post(`/clinics/${result.slug}/website/versions/${version.id}/restore`)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(restoreRes.status, 200, restoreRes.text);
    const restoreBody = JSON.parse(restoreRes.text);
    assert.equal(restoreBody.ok, true);
    assert.equal(restoreBody.code, "restored_draft");
    assert.equal(restoreBody.publishedUnchanged, true);

    const liveAfterRestore = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    const draftAfterRestore = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(liveAfterRestore.values["home.hero.title"], publishedTitleX);
    assert.equal(draftAfterRestore.values["home.hero.title"], historicTitle);
    const listedAfter = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: result.organizationId,
    });
    assert.equal((listedAfter.versions || []).length, (listedBeforeRestore.versions || []).length);
    const historicStill = await versionService.getWebsiteVersion(pool, {
      versionId: version.id,
      organizationId: result.organizationId,
      instanceId: instance.id,
    });
    assert.equal(historicStill.version.snapshot.values["home.hero.title"], historicTitle);

    const publicAfterRestore = await request(app).get(`/clinics/${result.slug}`);
    assert.equal(publicAfterRestore.status, 200);
    assert.match(publicAfterRestore.text, new RegExp(publishedTitleX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(publicAfterRestore.text, /Draft-only FAQ\?/);

    const previewAfter = await request(app)
      .get(`/clinics/${result.slug}/website/versions/${version.id}`)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(previewAfter.status, 200);
    assert.match(previewAfter.text, /Restore as new draft/);
    assert.doesNotMatch(previewAfter.text, /Restore as new current version/);
    assert.doesNotMatch(previewAfter.text, /data-website-start="1"/);

    const historyPage = await request(app)
      .get(`/clinics/${result.slug}/website/history`)
      .set("Cookie", cookie);
    assert.equal(historyPage.status, 200);
    assert.match(historyPage.text, /Restore as new draft/);
    assert.doesNotMatch(historyPage.text, /Restore as new current version/);
    assert.doesNotMatch(historyPage.text, /href="\/app\/clinical"/);

    const restoreAgain = await request(app)
      .post(`/clinics/${result.slug}/website/versions/${version.id}/restore`)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(restoreAgain.status, 200);
    const liveIdempotent = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveIdempotent.values["home.hero.title"], publishedTitleX);
  });

  it("apex and platform chrome advertise public directory navigation", async () => {
    if (!requireDb()) return;
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const home = await request(app).get("/");
    assert.equal(home.status, 200);
    assert.match(home.text, /Find a Clinic/);
    assert.match(home.text, /href="\/clinics"/);
    assert.match(home.text, /href="\/register-clinic"/);

    const about = await request(app).get("/about");
    assert.equal(about.status, 200);
    assert.match(about.text, /href="\/clinics"/);

    const solutions = await request(app).get("/solutions");
    assert.equal(solutions.status, 200);
    assert.match(solutions.text, /href="\/clinics"/);

    const directory = await request(app).get("/clinics");
    assert.equal(directory.status, 200);
    assert.match(directory.text, /Find a Clinic|Find Your Care/);
  });
});
