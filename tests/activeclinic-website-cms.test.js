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
const { createStaffMember } = require("../src/activeclinic/services/activeClinicStaffService");

// Ephemeral local foundation-test stamp only. Hosted V7 testing uses moovex-platform-v7.
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

function clinicHcoId(clinic) {
  const hco = clinic.healthcareOrganization || {};
  return hco.id || null;
}

async function resolveClinicHcoId(clinic) {
  const existing = clinicHcoId(clinic);
  if (existing) return existing;
  const row = await pool.query(
    `SELECT id FROM activeclinic.healthcare_organizations WHERE organization_id = $1 LIMIT 1`,
    [clinic.organizationId]
  );
  assert.ok(row.rows[0], "missing healthcare organization");
  return row.rows[0].id;
}

async function insertPublicDoctor(clinic, spec) {
  const created = await createStaffMember(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: await resolveClinicHcoId(clinic),
    firstName: spec.firstName,
    lastName: spec.lastName,
    displayName: spec.displayName,
    employmentType: "permanent",
    status: "active",
    phone: nextPhone(),
    email: spec.email,
    jobTitle: spec.title,
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  await pool.query(
    `UPDATE activeclinic.staff_members
        SET public_profile_enabled = true,
            public_profile_key = $2,
            public_display_name = $3,
            public_title = $4,
            public_bio = $5,
            updated_at = now()
      WHERE id = $1`,
    [created.staffMember.id, spec.staffKey, spec.displayName, spec.title, spec.bio]
  );
  return created.staffMember;
}

async function insertPublicService(clinic, spec) {
  await pool.query(
    `INSERT INTO activeclinic.appointment_service_types (
       organization_id, healthcare_organization_id, service_key,
       display_name, public_bookable, public_summary, status
     ) VALUES ($1, $2, $3, $4, true, $5, 'active')`,
    [clinic.organizationId, await resolveClinicHcoId(clinic), spec.serviceKey, spec.displayName, spec.summary]
  );
}

async function publishClinicWebsite(clinic) {
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
  return instance;
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

  it("renders the website management hub as a simple control center", async () => {
    if (!requireDb()) return;
    const clinic = await provisionClinic();
    const app = makeApp();
    const cookie = await sessionCookie(clinic.identityId, clinic.organizationId);
    const hub = await request(app).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(hub.status, 200, hub.text);
    assert.match(hub.text, /data-ac-mw-screen="MW10-01"/);
    assert.match(hub.text, /data-ac-mw-screen-mobile="MW10-02"/);
    assert.match(hub.text, /Website Management Hub/);
    assert.match(hub.text, /data-ac-website-action="pages"/);
    assert.match(hub.text, />Page Builder</);
    assert.match(hub.text, /SEO &amp; Social/);
    assert.match(hub.text, /data-ac-website-action="library"/);
    assert.match(hub.text, /Content Library/);
    assert.match(hub.text, /data-ac-website-action="preview"/);
    assert.match(hub.text, /data-ac-website-action="edit"/);
    assert.match(hub.text, /data-ac-website-action="publish"/);
    assert.match(hub.text, /Hidden pages/);
    assert.match(hub.text, /Missing content/);
    assert.match(hub.text, /Last updated/);
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

  it("normalizes branding colours without a database", () => {
    assert.equal(cmsService.normalizeHexColor("").ok, true);
    assert.equal(cmsService.normalizeHexColor("").value, null);
    assert.equal(cmsService.normalizeHexColor("#0D9488").value, "#0d9488");
    assert.equal(cmsService.normalizeHexColor("not-a-colour").ok, false);
  });

  it("lets clinic admins save website branding settings as drafts", async () => {
    if (!requireDb()) return;
    const clinic = await provisionClinic();
    const other = await provisionClinic();
    const app = makeApp();
    const cookie = await sessionCookie(clinic.identityId, clinic.organizationId);
    const cookieB = await sessionCookie(other.identityId, other.organizationId);
    const overlayName = `Draft Overlay ${stamp}`;

    const settings = await request(app).get("/app/settings/website/settings").set("Cookie", cookie);
    assert.equal(settings.status, 200, settings.text);
    assert.match(settings.text, /Website Settings/);
    assert.match(settings.text, /data-ac-mw-screen="MW08-01"/);
    assert.match(settings.text, /Public URL/);
    assert.doesNotMatch(settings.text, /nameserver|dns record/i);

    const branding = await request(app).get("/app/settings/website/branding").set("Cookie", cookie);
    assert.equal(branding.status, 200);
    assert.match(branding.text, /Branding Settings/);
    assert.match(branding.text, /data-ac-mw-screen="MW08-02"/);
    assert.match(branding.text, /data-ac-mw-brand-preview/);

    const chrome = await request(app).get("/app/settings/website/chrome").set("Cookie", cookie);
    assert.equal(chrome.status, 200);
    assert.match(chrome.text, /Header &amp; Footer Settings|Header & Footer Settings/);
    assert.match(chrome.text, /data-ac-mw-screen="MW08-03"/);

    const seo = await request(app).get("/app/settings/website/seo").set("Cookie", cookie);
    assert.equal(seo.status, 200);
    assert.match(seo.text, /SEO &amp; Social Settings|SEO & Social Settings/);
    assert.match(seo.text, /data-ac-mw-screen="MW08-04"/);

    const csrf = extractCsrf(settings);
    const cookies = cookieHeader(cookie, settings);
    const savedSettings = await request(app)
      .post("/app/settings/website/settings")
      .set("Cookie", cookies)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        siteName: overlayName,
        phone: "+260955000111",
        email: "front-desk@example.invalid",
        hours: "Mon–Fri 08:00–17:00",
      });
    assert.equal(savedSettings.status, 303, savedSettings.text);

    const draftPage = await request(app).get("/app/settings/website/settings").set("Cookie", cookie);
    assert.match(draftPage.text, new RegExp(overlayName));

    const liveBefore = await request(app).get(`/clinics/${clinic.slug}`);
    assert.equal(liveBefore.status, 200);
    assert.doesNotMatch(liveBefore.text, new RegExp(overlayName));
    assert.doesNotMatch(liveBefore.text, /--acp-primary:#112233/);

    const brandCsrfPage = await request(app).get("/app/settings/website/branding").set("Cookie", cookie);
    const badColor = await request(app)
      .post("/app/settings/website/branding")
      .set("Cookie", cookieHeader(cookie, brandCsrfPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(brandCsrfPage),
        primaryColor: "not-a-colour",
        accentColor: "#0f766e",
      });
    assert.equal(badColor.status, 200);
    assert.match(badColor.text, /6-digit colour/);

    const goodColor = await request(app)
      .post("/app/settings/website/branding")
      .set("Cookie", cookieHeader(cookie, brandCsrfPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(brandCsrfPage),
        primaryColor: "#112233",
        accentColor: "#445566",
      });
    assert.equal(goodColor.status, 303, goodColor.text);

    const chromeCsrfPage = await request(app).get("/app/settings/website/chrome").set("Cookie", cookie);
    const chromeSave = await request(app)
      .post("/app/settings/website/chrome")
      .set("Cookie", cookieHeader(cookie, chromeCsrfPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(chromeCsrfPage),
        showLogo: "1",
        showNav: "1",
        showPhone: "1",
        showContact: "1",
        tagline: "Visit our clinic",
        facebookUrl: "https://facebook.com/example-clinic",
      });
    assert.equal(chromeSave.status, 303, chromeSave.text);

    const seoCsrfPage = await request(app).get("/app/settings/website/seo").set("Cookie", cookie);
    const seoSave = await request(app)
      .post("/app/settings/website/seo")
      .set("Cookie", cookieHeader(cookie, seoCsrfPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(seoCsrfPage),
        seoTitle: "Care close to home",
        seoDescription: "Book visits and read clinic information.",
      });
    assert.equal(seoSave.status, 303, seoSave.text);

    const otherSettings = await request(app).get("/app/settings/website/settings").set("Cookie", cookieB);
    assert.equal(otherSettings.status, 200);
    assert.doesNotMatch(otherSettings.text, new RegExp(overlayName));

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

    const liveAfter = await request(app).get(`/clinics/${clinic.slug}`);
    assert.equal(liveAfter.status, 200, liveAfter.text);
    assert.match(liveAfter.text, new RegExp(overlayName));
    assert.match(liveAfter.text, /--acp-primary:#112233/);
    assert.match(liveAfter.text, /Care close to home/);
    assert.match(liveAfter.text, /Book visits and read clinic information/);
    assert.match(liveAfter.text, /Visit our clinic/);
    assert.match(liveAfter.text, /facebook\.com\/example-clinic/);
  });

  it("reuses website-only items without creating clinic records", async () => {
    if (!requireDb()) return;
    const clinic = await provisionClinic();
    const other = await provisionClinic();
    const app = makeApp();
    const cookie = await sessionCookie(clinic.identityId, clinic.organizationId);
    const cookieB = await sessionCookie(other.identityId, other.organizationId);
    const uniqueFaq = `Parking for ${stamp} visits`;
    const uniqueAnswer = `Use the side lot for ${stamp}.`;

    const beforeServices = await pool.query(
      "SELECT count(*)::int AS n FROM activeclinic.appointment_service_types WHERE organization_id = $1",
      [clinic.organizationId]
    );
    const beforeStaff = await pool.query(
      "SELECT count(*)::int AS n FROM activeclinic.staff_members WHERE organization_id = $1",
      [clinic.organizationId]
    );

    const library = await request(app).get("/app/settings/website/library").set("Cookie", cookie);
    assert.equal(library.status, 200, library.text);
    assert.match(library.text, /Content Library/);
    assert.match(library.text, /data-ac-mw-screen="MW09-01"/);
    assert.match(library.text, /ActiveClinic record|Website only/);

    const addPage = await request(app).get("/app/settings/website/library/new").set("Cookie", cookie);
    assert.equal(addPage.status, 200, addPage.text);
    assert.match(addPage.text, /Add Content Item/);
    assert.match(addPage.text, /data-ac-mw-screen="MW09-02"/);

    const created = await request(app)
      .post("/app/settings/website/library")
      .set("Cookie", cookieHeader(cookie, addPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(addPage),
        type: "faq",
        question: uniqueFaq,
        answer: uniqueAnswer,
        visible: "1",
      });
    assert.equal(created.status, 303, created.text);
    const itemPath = String(created.headers.location || "");
    assert.match(itemPath, /\/app\/settings\/website\/library\/[^/]+/);
    const itemId = itemPath.split("/").pop().split("?")[0];

    const listed = await request(app).get("/app/settings/website/library").set("Cookie", cookie);
    assert.match(listed.text, new RegExp(uniqueFaq));
    assert.match(listed.text, /Website only/);

    const editPage = await request(app).get(`/app/settings/website/library/${itemId}`).set("Cookie", cookie);
    assert.equal(editPage.status, 200, editPage.text);
    assert.match(editPage.text, /Edit Content Item/);
    assert.match(editPage.text, /data-ac-mw-screen="MW09-03"/);
    assert.match(editPage.text, /Currently used on/);

    const liveBefore = await request(app).get(`/clinics/${clinic.slug}`);
    assert.equal(liveBefore.status, 200);
    assert.doesNotMatch(liveBefore.text, new RegExp(uniqueFaq));

    const createPage = await request(app).get("/app/settings/website/pages/new").set("Cookie", cookie);
    const pageRes = await request(app)
      .post("/app/settings/website/pages")
      .set("Cookie", cookieHeader(cookie, createPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(createPage),
        title: "Visit notes",
        slug: "visit-notes",
        templateKey: "blank",
        inNav: "0",
      });
    assert.equal(pageRes.status, 303, pageRes.text);
    const pageIdMatch = String(pageRes.headers.location || "").match(/pages\/([^/]+)\/builder/);
    assert.ok(pageIdMatch, pageRes.headers.location);
    const pageId = pageIdMatch[1];

    const usePage = await request(app).get(`/app/settings/website/library/${itemId}/use`).set("Cookie", cookie);
    assert.equal(usePage.status, 200, usePage.text);
    assert.match(usePage.text, /Use Content on Page/);
    assert.match(usePage.text, /data-ac-mw-screen="MW09-04"/);

    const used = await request(app)
      .post(`/app/settings/website/library/${itemId}/use`)
      .set("Cookie", cookieHeader(cookie, usePage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(usePage),
        pageId,
      });
    assert.equal(used.status, 303, used.text);

    const editAfterUse = await request(app).get(`/app/settings/website/library/${itemId}`).set("Cookie", cookie);
    assert.match(editAfterUse.text, /Visit notes/);
    assert.match(editAfterUse.text, /Featured/);

    const highlight = await request(app)
      .post("/app/settings/website/library")
      .set("Cookie", cookieHeader(cookie, addPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(addPage),
        type: "service",
        websiteOnly: "1",
        title: `Evening clinic ${stamp}`,
        summary: "Website highlight only",
        visible: "1",
      });
    assert.equal(highlight.status, 303, highlight.text);

    const afterServices = await pool.query(
      "SELECT count(*)::int AS n FROM activeclinic.appointment_service_types WHERE organization_id = $1",
      [clinic.organizationId]
    );
    const afterStaff = await pool.query(
      "SELECT count(*)::int AS n FROM activeclinic.staff_members WHERE organization_id = $1",
      [clinic.organizationId]
    );
    assert.equal(afterServices.rows[0].n, beforeServices.rows[0].n);
    assert.equal(afterStaff.rows[0].n, beforeStaff.rows[0].n);

    const otherLibrary = await request(app).get("/app/settings/website/library").set("Cookie", cookieB);
    assert.equal(otherLibrary.status, 200);
    assert.doesNotMatch(otherLibrary.text, new RegExp(uniqueFaq));

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

    const liveHome = await request(app).get(`/clinics/${clinic.slug}`);
    assert.equal(liveHome.status, 200, liveHome.text);
    assert.match(liveHome.text, new RegExp(uniqueFaq));

    const liveCustom = await request(app).get(`/clinics/${clinic.slug}/p/visit-notes`);
    assert.equal(liveCustom.status, 200, liveCustom.text);
    assert.match(liveCustom.text, new RegExp(uniqueFaq));

    const hidePage = await request(app).get(`/app/settings/website/library/${itemId}`).set("Cookie", cookie);
    const hidden = await request(app)
      .post(`/app/settings/website/library/${itemId}`)
      .set("Cookie", cookieHeader(cookie, hidePage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(hidePage),
        title: uniqueFaq,
        body: uniqueAnswer,
      });
    assert.equal(hidden.status, 303, hidden.text);

    const republished = await publicationService.publishWebsiteDraft(pool, {
      organizationId: clinic.organizationId,
      instanceId: instance.id,
      expectedProductCode: "activeclinic",
      actorIdentityId: clinic.identityId,
      allowEmpty: true,
    });
    assert.equal(republished.ok, true, JSON.stringify(republished));

    const liveHiddenHome = await request(app).get(`/clinics/${clinic.slug}`);
    assert.equal(liveHiddenHome.status, 200, liveHiddenHome.text);
    assert.doesNotMatch(liveHiddenHome.text, new RegExp(uniqueFaq));

    const liveHiddenCustom = await request(app).get(`/clinics/${clinic.slug}/p/visit-notes`);
    assert.equal(liveHiddenCustom.status, 200, liveHiddenCustom.text);
    assert.doesNotMatch(liveHiddenCustom.text, new RegExp(uniqueFaq));
  });

  it("shows visible canonical doctors and services and hides unpublished overlays", async () => {
    if (!requireDb()) return;
    const clinic = await provisionClinic();
    const other = await provisionClinic();
    const app = makeApp();
    const cookie = await sessionCookie(clinic.identityId, clinic.organizationId);
    const cookieB = await sessionCookie(other.identityId, other.organizationId);
    const visibleDoctorName = `Dr Visible ${stamp}`;
    const hiddenDoctorName = `Dr Hidden ${stamp}`;
    const visibleServiceName = `Visible consult ${stamp}`;
    const hiddenServiceName = `Hidden consult ${stamp}`;
    const visibleDoctorKey = `dr-vis-${stamp}`;
    const hiddenDoctorKey = `dr-hid-${stamp}`;
    const visibleServiceKey = `svc-vis-${stamp}`;
    const hiddenServiceKey = `svc-hid-${stamp}`;

    await insertPublicDoctor(clinic, {
      staffKey: visibleDoctorKey,
      firstName: "Visible",
      lastName: `Clinician${stamp}`,
      displayName: visibleDoctorName,
      title: "Physician",
      bio: "Public clinician",
      email: `visible-doc-${stamp}@example.invalid`,
    });
    const hiddenDoctor = await insertPublicDoctor(clinic, {
      staffKey: hiddenDoctorKey,
      firstName: "Hidden",
      lastName: `Clinician${stamp}`,
      displayName: hiddenDoctorName,
      title: "Surgeon",
      bio: "Hidden clinician",
      email: `hidden-doc-${stamp}@example.invalid`,
    });
    await insertPublicService(clinic, {
      serviceKey: visibleServiceKey,
      displayName: visibleServiceName,
      summary: "Visible public consultation",
    });
    await insertPublicService(clinic, {
      serviceKey: hiddenServiceKey,
      displayName: hiddenServiceName,
      summary: "Hidden public consultation",
    });
    await insertPublicDoctor(other, {
      staffKey: `dr-other-${stamp}`,
      firstName: "Other",
      lastName: `Clinician${stamp}`,
      displayName: `Dr Other ${stamp}`,
      title: "GP",
      bio: "Other clinic clinician",
      email: `other-doc-${stamp}@example.invalid`,
    });
    await insertPublicService(other, {
      serviceKey: `svc-other-${stamp}`,
      displayName: `Other consult ${stamp}`,
      summary: "Other clinic consultation",
    });

    const doctorsBefore = await request(app).get(`/clinics/${clinic.slug}/doctors`);
    assert.equal(doctorsBefore.status, 200, doctorsBefore.text);
    assert.match(doctorsBefore.text, new RegExp(visibleDoctorName));
    assert.match(doctorsBefore.text, new RegExp(hiddenDoctorName));
    const visibleDoctorDetail = await request(app).get(
      `/clinics/${clinic.slug}/doctors/${visibleDoctorKey}`
    );
    assert.equal(visibleDoctorDetail.status, 200, visibleDoctorDetail.text);

    const servicesBefore = await request(app).get(`/clinics/${clinic.slug}/services`);
    assert.equal(servicesBefore.status, 200, servicesBefore.text);
    assert.match(servicesBefore.text, new RegExp(visibleServiceName));
    assert.match(servicesBefore.text, new RegExp(hiddenServiceName));
    const visibleServiceDetail = await request(app).get(
      `/clinics/${clinic.slug}/services/${visibleServiceKey}`
    );
    assert.equal(visibleServiceDetail.status, 200, visibleServiceDetail.text);

    const addPage = await request(app).get("/app/settings/website/library/new").set("Cookie", cookie);
    assert.match(addPage.text, new RegExp(hiddenDoctorName));
    assert.match(addPage.text, new RegExp(hiddenServiceName));

    const hideDoctor = await request(app)
      .post("/app/settings/website/library")
      .set("Cookie", cookieHeader(cookie, addPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(addPage),
        type: "doctor",
        doctorKey: hiddenDoctorKey,
      });
    assert.equal(hideDoctor.status, 303, hideDoctor.text);
    const hiddenDoctorItemId = String(hideDoctor.headers.location || "").split("/").pop().split("?")[0];

    const hideService = await request(app)
      .post("/app/settings/website/library")
      .set("Cookie", cookieHeader(cookie, addPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(addPage),
        type: "service",
        serviceKey: hiddenServiceKey,
      });
    assert.equal(hideService.status, 303, hideService.text);

    const liveDraftDoctors = await request(app).get(`/clinics/${clinic.slug}/doctors`);
    assert.match(liveDraftDoctors.text, new RegExp(hiddenDoctorName));
    const liveDraftServices = await request(app).get(`/clinics/${clinic.slug}/services`);
    assert.match(liveDraftServices.text, new RegExp(hiddenServiceName));

    await publishClinicWebsite(clinic);

    const liveDoctors = await request(app).get(`/clinics/${clinic.slug}/doctors`);
    assert.equal(liveDoctors.status, 200, liveDoctors.text);
    assert.match(liveDoctors.text, new RegExp(visibleDoctorName));
    assert.doesNotMatch(liveDoctors.text, new RegExp(hiddenDoctorName));
    const hiddenDoctorDetail = await request(app).get(
      `/clinics/${clinic.slug}/doctors/${hiddenDoctorKey}`
    );
    assert.equal(hiddenDoctorDetail.status, 404);

    const liveServices = await request(app).get(`/clinics/${clinic.slug}/services`);
    assert.equal(liveServices.status, 200, liveServices.text);
    assert.match(liveServices.text, new RegExp(visibleServiceName));
    assert.doesNotMatch(liveServices.text, new RegExp(hiddenServiceName));
    const hiddenServiceDetail = await request(app).get(
      `/clinics/${clinic.slug}/services/${hiddenServiceKey}`
    );
    assert.equal(hiddenServiceDetail.status, 404);

    const otherAdd = await request(app).get("/app/settings/website/library/new").set("Cookie", cookieB);
    const crossDoctor = await request(app)
      .post("/app/settings/website/library")
      .set("Cookie", cookieHeader(cookieB, otherAdd))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(otherAdd),
        type: "doctor",
        doctorKey: visibleDoctorKey,
      });
    assert.equal(crossDoctor.status, 400, crossDoctor.text);
    assert.match(crossDoctor.text, /clinic record was not found/i);

    const crossService = await request(app)
      .post("/app/settings/website/library")
      .set("Cookie", cookieHeader(cookieB, otherAdd))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(otherAdd),
        type: "service",
        serviceKey: visibleServiceKey,
      });
    assert.equal(crossService.status, 400, crossService.text);
    assert.match(crossService.text, /clinic record was not found/i);

    const otherItem = await request(app)
      .get(`/app/settings/website/library/${hiddenDoctorItemId}`)
      .set("Cookie", cookieB);
    assert.equal(otherItem.status, 404);

    const createPage = await request(app).get("/app/settings/website/pages/new").set("Cookie", cookie);
    const pageRes = await request(app)
      .post("/app/settings/website/pages")
      .set("Cookie", cookieHeader(cookie, createPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(createPage),
        title: "Care team",
        slug: "care-team",
        templateKey: "blank",
        inNav: "0",
      });
    assert.equal(pageRes.status, 303, pageRes.text);
    const pageIdMatch = String(pageRes.headers.location || "").match(/pages\/([^/]+)\/builder/);
    assert.ok(pageIdMatch, pageRes.headers.location);
    const pageId = pageIdMatch[1];

    const visibleDoctorItem = await request(app)
      .post("/app/settings/website/library")
      .set("Cookie", cookieHeader(cookie, addPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(addPage),
        type: "doctor",
        doctorKey: visibleDoctorKey,
        visible: "1",
      });
    assert.equal(visibleDoctorItem.status, 303, visibleDoctorItem.text);
    const visibleItemId = String(visibleDoctorItem.headers.location || "").split("/").pop().split("?")[0];

    const staffBeforePlacement = await pool.query(
      "SELECT count(*)::int AS n FROM activeclinic.staff_members WHERE organization_id = $1 AND id = $2",
      [clinic.organizationId, hiddenDoctor.id]
    );
    const visibleStaffBefore = await pool.query(
      "SELECT count(*)::int AS n FROM activeclinic.staff_members WHERE organization_id = $1 AND public_profile_key = $2",
      [clinic.organizationId, visibleDoctorKey]
    );
    const servicesBeforePlacement = await pool.query(
      "SELECT count(*)::int AS n FROM activeclinic.appointment_service_types WHERE organization_id = $1 AND service_key = $2",
      [clinic.organizationId, visibleServiceKey]
    );

    const usePage = await request(app)
      .get(`/app/settings/website/library/${visibleItemId}/use`)
      .set("Cookie", cookie);
    const used = await request(app)
      .post(`/app/settings/website/library/${visibleItemId}/use`)
      .set("Cookie", cookieHeader(cookie, usePage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(usePage),
        pageId,
      });
    assert.equal(used.status, 303, used.text);

    const otherUse = await request(app)
      .post(`/app/settings/website/library/${visibleItemId}/use`)
      .set("Cookie", cookieHeader(cookieB, otherAdd))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(otherAdd),
        pageId,
      });
    assert.ok([303, 400, 403, 404].includes(otherUse.status), String(otherUse.status));
    if (otherUse.status === 303) {
      assert.match(String(otherUse.headers.location || ""), /error=1/);
    }

    const useAfter = await request(app)
      .get(`/app/settings/website/library/${visibleItemId}/use`)
      .set("Cookie", cookie);
    const placementMatch = useAfter.text.match(
      new RegExp(`/app/settings/website/library/${visibleItemId}/placements/([^/"']+)/delete`)
    );
    assert.ok(placementMatch, useAfter.text);
    const placementId = placementMatch[1];
    const removed = await request(app)
      .post(`/app/settings/website/library/${visibleItemId}/placements/${placementId}/delete`)
      .set("Cookie", cookieHeader(cookie, useAfter))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(useAfter),
      });
    assert.equal(removed.status, 303, removed.text);

    const staffAfterPlacement = await pool.query(
      "SELECT count(*)::int AS n FROM activeclinic.staff_members WHERE organization_id = $1 AND id = $2",
      [clinic.organizationId, hiddenDoctor.id]
    );
    const visibleStaffAfter = await pool.query(
      "SELECT count(*)::int AS n FROM activeclinic.staff_members WHERE organization_id = $1 AND public_profile_key = $2",
      [clinic.organizationId, visibleDoctorKey]
    );
    const servicesAfterPlacement = await pool.query(
      "SELECT count(*)::int AS n FROM activeclinic.appointment_service_types WHERE organization_id = $1 AND service_key = $2",
      [clinic.organizationId, visibleServiceKey]
    );
    assert.equal(staffAfterPlacement.rows[0].n, staffBeforePlacement.rows[0].n);
    assert.equal(visibleStaffAfter.rows[0].n, visibleStaffBefore.rows[0].n);
    assert.equal(visibleStaffAfter.rows[0].n, 1);
    assert.equal(servicesAfterPlacement.rows[0].n, servicesBeforePlacement.rows[0].n);
    assert.equal(servicesAfterPlacement.rows[0].n, 1);

    const stillInLibrary = await request(app)
      .get(`/app/settings/website/library/${visibleItemId}`)
      .set("Cookie", cookie);
    assert.equal(stillInLibrary.status, 200, stillInLibrary.text);
    assert.match(stillInLibrary.text, new RegExp(visibleDoctorName));
  });
});

