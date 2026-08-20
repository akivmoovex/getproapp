"use strict";

/**
 * ActiveClinic clinic mini-website CMS: pages, sections, blocks,
 * navigation, media ownership, reserved slugs, draft vs published.
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
const publicationService = require("../src/platform/website/publicationService");
const instanceRepo = require("../src/platform/website/instanceRepository");
const mediaService = require("../src/platform/website/mediaService");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const {
  validateCustomSlug,
  RESERVED_SLUGS,
} = require("../src/activeclinic/website/clinicWebsiteCms");
const cmsService = require("../src/activeclinic/website/clinicWebsiteCmsService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "clinic-admin-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 860000000;

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
    clinicName: `CMS Clinic ${stamp}`,
    contactName: "Website Admin",
    contactEmail: `cms-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka Province",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "cms",
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

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
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

async function provisionClinic() {
  const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
  assert.equal(result.ok, true, JSON.stringify(result));
  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
    organizationId: result.organizationId,
    productCode: "activeclinic",
  });
  if (instance) {
    await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      expectedProductCode: "activeclinic",
      actorIdentityId: result.identityId,
      allowEmpty: true,
    });
  }
  await setClinicWebsiteAvailability(pool, {
    organizationKey: result.slug,
    public: true,
    overrideReadiness: true,
    reason: "cms_test",
  });
  return result;
}

describe("ActiveClinic website CMS slugs", () => {
  it("rejects reserved and invalid slugs", () => {
    assert.equal(validateCustomSlug("about").ok, false);
    assert.equal(validateCustomSlug("about").code, "reserved_slug");
    assert.equal(validateCustomSlug("book").ok, false);
    assert.equal(validateCustomSlug("login").ok, false);
    assert.equal(validateCustomSlug("!!!").ok, false);
    assert.equal(validateCustomSlug("patient-stories").ok, true);
    assert.ok(RESERVED_SLUGS.has("website"));
  });
});

describe("ActiveClinic website CMS", () => {
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

  it("lets clinic admins create custom pages, blocks, and publish them", async () => {
    if (!requireDb()) return;
    const clinic = await provisionClinic();
    const app = makeApp();
    const cookie = await sessionCookie(clinic.identityId, clinic.organizationId);
    const pages = await request(app).get("/app/settings/website/pages").set("Cookie", cookie);
    assert.equal(pages.status, 200, pages.text);
    assert.match(pages.text, /Pages Manager/);
    assert.match(pages.text, /Homepage/);

    const createPage = await request(app)
      .get("/app/settings/website/pages/new")
      .set("Cookie", cookie);
    assert.equal(createPage.status, 200);
    const csrf = extractCsrf(createPage);
    const cookies = cookieHeader(cookie, createPage);

    const reserved = await request(app)
      .post("/app/settings/website/pages")
      .set("Cookie", cookies)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, title: "About hijack", slug: "about", templateKey: "blank", inNav: "1" });
    assert.equal(reserved.status, 400);
    assert.match(reserved.text, /reserved/i);

    const created = await request(app)
      .post("/app/settings/website/pages")
      .set("Cookie", cookies)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        title: "Patient stories",
        slug: "patient-stories",
        templateKey: "blank",
        inNav: "1",
      });
    assert.equal(created.status, 303, created.text);
    const builderPath = created.headers.location;
    assert.match(String(builderPath), /\/builder$/);
    const pageIdMatch = String(builderPath).match(/pages\/([^/]+)\/builder/);
    assert.ok(pageIdMatch, builderPath);
    const pageId = pageIdMatch[1];

    const duplicate = await request(app)
      .post("/app/settings/website/pages")
      .set("Cookie", cookies)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        title: "Copy",
        slug: "patient-stories",
        templateKey: "blank",
      });
    assert.equal(duplicate.status, 400);
    assert.match(duplicate.text, /already used/i);

    const builder = await request(app).get(builderPath).set("Cookie", cookies);
    assert.equal(builder.status, 200);
    const builderCsrf = extractCsrf(builder);
    const builderCookies = cookieHeader(cookie, builder);
    const addBlock = await request(app)
      .post(`/app/settings/website/pages/${pageId}/blocks`)
      .set("Cookie", builderCookies)
      .type("form")
      .send({ [CSRF_FIELD]: builderCsrf, type: "heading" });
    assert.equal(addBlock.status, 303, addBlock.text);

    const sections = await request(app).get("/app/settings/website/sections").set("Cookie", cookie);
    assert.equal(sections.status, 200);
    assert.match(sections.text, /Homepage Sections/);
    const sectionCsrf = extractCsrf(sections);
    const sectionCookies = cookieHeader(cookie, sections);
    const addSection = await request(app)
      .post("/app/settings/website/sections")
      .set("Cookie", sectionCookies)
      .type("form")
      .send({ [CSRF_FIELD]: sectionCsrf, pageId: "tpl_home", type: "cta" });
    assert.equal(addSection.status, 303, addSection.text);

    const nav = await request(app).get("/app/settings/website/navigation").set("Cookie", cookies);
    assert.equal(nav.status, 200);
    assert.match(nav.text, /Navigation Manager/);
    const mediaPage = await request(app).get("/app/settings/website/media").set("Cookie", cookies);
    assert.equal(mediaPage.status, 200);
    assert.match(mediaPage.text, /Media Library/);
    const publishPage = await request(app).get("/app/settings/website/publish").set("Cookie", cookies);
    assert.equal(publishPage.status, 200);
    assert.match(publishPage.text, /Site Status/);

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: clinic.organizationId,
      productCode: "activeclinic",
    });
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: clinic.organizationId,
      instanceId: instance.id,
      expectedProductCode: "activeclinic",
      actorIdentityId: clinic.identityId,
      allowEmpty: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));

    const live = await request(app).get(`/clinics/${clinic.slug}/p/patient-stories`);
    assert.equal(live.status, 200, live.text);
    assert.match(live.text, /Patient stories|heading/i);

    const home = await request(app).get(`/clinics/${clinic.slug}`);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-home-section="hero"/);
    assert.match(home.text, /data-ac-home-section="introduction"|data-ac-page-section="tenant-intro"/);
  });

  it("keeps unpublished custom pages off the public website and isolates tenants", async () => {
    if (!requireDb()) return;
    const clinicA = await provisionClinic();
    const clinicB = await provisionClinic();
    const app = makeApp();
    const cookieA = await sessionCookie(clinicA.identityId, clinicA.organizationId);
    const cookieB = await sessionCookie(clinicB.identityId, clinicB.organizationId);

    const created = await cmsService.createPage(pool, {
      organizationId: clinicA.organizationId,
      clinicKey: clinicA.slug,
      actorIdentityId: clinicA.identityId,
      grantedPermissions: ["website.edit", "website.view", "website.media.upload", "website.publish"],
      title: "Draft only",
      slug: "draft-only",
      templateKey: "blank",
      inNav: false,
      status: "draft",
    });
    assert.equal(created.ok, true, JSON.stringify(created));

    const instanceA = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: clinicA.organizationId,
      productCode: "activeclinic",
    });
    const publishedA = await publicationService.publishWebsiteDraft(pool, {
      organizationId: clinicA.organizationId,
      instanceId: instanceA.id,
      expectedProductCode: "activeclinic",
      actorIdentityId: clinicA.identityId,
      allowEmpty: true,
    });
    assert.equal(publishedA.ok, true, JSON.stringify(publishedA));

    const publicDraft = await request(app).get(`/clinics/${clinicA.slug}/p/draft-only`);
    assert.equal(publicDraft.status, 404);

    const pagesB = await request(app).get("/app/settings/website/pages").set("Cookie", cookieB);
    assert.equal(pagesB.status, 200);
    assert.doesNotMatch(pagesB.text, /draft-only/);

    const hijack = await request(app)
      .post(`/app/settings/website/pages/${created.page.id}/delete`)
      .set("Cookie", cookieB)
      .type("form")
      .send({ [CSRF_FIELD]: issueCsrfToken(MINIMAL_AC) });
    assert.ok(hijack.status === 403 || hijack.status === 400);

    const stillThere = await cmsService.listPages(pool, {
      organizationId: clinicA.organizationId,
      clinicKey: clinicA.slug,
      grantedPermissions: ["website.view", "website.edit"],
    });
    assert.ok(stillThere.pages.some((page) => page.slug === "draft-only"));

    const mediaA = await request(app)
      .get(`/clinics/${clinicA.slug}/website/media`)
      .set("Cookie", cookieA);
    assert.equal(mediaA.status, 200);
    const mediaBtoA = await request(app)
      .get(`/clinics/${clinicA.slug}/website/media`)
      .set("Cookie", cookieB);
    assert.equal(mediaBtoA.status, 403);

    const anonPages = await request(app).get("/app/settings/website/pages");
    assert.ok(anonPages.status === 302 || anonPages.status === 303 || anonPages.status === 401);
  });

  it("refuses to overwrite reserved routes and records media ownership", async () => {
    if (!requireDb()) return;
    const clinic = await provisionClinic();
    const created = await cmsService.createPage(pool, {
      organizationId: clinic.organizationId,
      clinicKey: clinic.slug,
      actorIdentityId: clinic.identityId,
      grantedPermissions: ["website.edit", "website.view"],
      title: "Services hijack",
      slug: "services",
      templateKey: "blank",
    });
    assert.equal(created.ok, false);
    assert.equal(created.code, "reserved_slug");

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: clinic.organizationId,
      productCode: "activeclinic",
    });
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
      "hex"
    );
    const uploaded = await mediaService.registerWebsiteMedia(pool, {
      organizationId: clinic.organizationId,
      instanceId: instance.id,
      expectedProductCode: "activeclinic",
      actorIdentityId: clinic.identityId,
      mediaKind: "image",
      originalFilename: "one.png",
      mimeType: "image/png",
      sizeBytes: png.length,
      altText: "Clinic photo",
      buffer: png,
    });
    assert.equal(uploaded.ok, true, JSON.stringify(uploaded));
    const listed = await mediaService.listWebsiteMedia(pool, {
      organizationId: clinic.organizationId,
      instanceId: instance.id,
    });
    assert.equal(listed.media.length >= 1, true);
    assert.equal(listed.media[0].organizationId, clinic.organizationId);
  });
});
