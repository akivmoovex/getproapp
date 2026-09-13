"use strict";

/**
 * Shared website-editor persistence — six QA flows as one bug family.
 *
 * 1. BlessBoard hero draft save/reload
 * 2. BlessBoard contact details draft save
 * 3. BlessBoard leader/pastor image via shared media → structured draft
 * 4. ActiveClinic catalogue service create + website visibility
 * 5. ActiveClinic doctor website visibility
 * 6. ActiveClinic location draft save on non-home page (engine action URL)
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const crypto = require("crypto");

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
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const { createV5Session } = require("../src/platform/session/createV5Session");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_FIELD, CSRF_COOKIE, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  createPageSection,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const catalogueService = require("../src/activeclinic/website/clinicWebsiteCatalogueService");
const contentService = require("../src/platform/website/contentService");
const mediaService = require("../src/platform/website/mediaService");
const instanceRepo = require("../src/platform/website/instanceRepository");
const publicationService = require("../src/platform/website/publicationService");
const {
  PRODUCT_CODE,
  buildPublicWebsiteDraftsPath,
  buildPublicWebsiteMediaPath,
  buildPublicWebsitePublishPath,
  buildPublicOrganizationWebsitePath,
} = require("../src/platform/website/publicWebsiteUrl");
const {
  validateImageUrl,
  parseWebsiteEngineMediaId,
} = require("../src/blessboard/services/websiteStructuredDraftValidation");
const {
  saveStructuredDraft,
} = require("../src/blessboard/services/websiteStructuredDraftService");

const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "persist-ac-pass-12";
const BB_PASSWORD = "persist-bb-pass-12";
const HOST = "persist-bb.blessboard.org";

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});
const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
});

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 760000000;

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

function png1x1() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
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

describe("shared website editor persistence (six QA flows)", () => {
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

  it("engine action URLs omit pageKey (shared URL layer)", () => {
    const base = {
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "demo-clinic",
      pageKey: "location",
    };
    assert.equal(buildPublicWebsiteDraftsPath(base), "/clinics/demo-clinic/website/drafts");
    assert.equal(buildPublicWebsiteMediaPath(base), "/clinics/demo-clinic/website/media");
    assert.equal(buildPublicWebsitePublishPath(base), "/clinics/demo-clinic/website/publish");
    assert.equal(
      buildPublicOrganizationWebsitePath({ ...base, suffix: "website/drafts" }),
      "/clinics/demo-clinic/location/website/drafts",
      "legacy suffix+pageKey composition remains unsafe — callers must use drafts/media helpers"
    );
    assert.equal(
      buildPublicWebsiteDraftsPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "demo-church",
        pageKey: "contact",
        scope: { kind: "branch", branchKey: "hq" },
      }),
      "/c/demo-church/hq/website/drafts"
    );
  });

  it("structured image validation accepts shared website-engine media delivery paths", () => {
    const bb = "/c/demo-church/website/media/3f552f41-a262-4cbb-bc2e-ae49b069d218";
    const ac = "/clinics/demo-clinic/website/media/3f552f41-a262-4cbb-bc2e-ae49b069d218";
    assert.equal(validateImageUrl(bb).ok, true);
    assert.equal(validateImageUrl(ac).ok, true);
    assert.equal(parseWebsiteEngineMediaId(bb), "3f552f41-a262-4cbb-bc2e-ae49b069d218");
    assert.equal(validateImageUrl("/etc/passwd").ok, false);
    assert.equal(validateImageUrl("/church/images/leadership/pastor-desktop.jpg").ok, true);
  });

  async function seedAcClinic() {
    stamp += 1;
    const result = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Persist Clinic ${stamp}`,
      contactName: "Website Admin",
      contactEmail: `persist-ac-${stamp}@example.invalid`,
      contactPhone: nextPhone(),
      province: "Lusaka",
      city: "Lusaka",
      address: `${stamp} Persist Avenue`,
      countryCode: "ZM",
      notes: "persistence",
      password: AC_PASSWORD,
      passwordConfirm: AC_PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.identityId, "identityId");
    const hcoId =
      (result.healthcareOrganization &&
        (result.healthcareOrganization.id || result.healthcareOrganization.healthcareOrganizationId)) ||
      null;
    assert.ok(hcoId, "healthcareOrganization id");
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    assert.ok(instance);
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      allowEmpty: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const availability = await setClinicWebsiteAvailability(pool, {
      organizationKey: result.slug,
      public: true,
      overrideReadiness: true,
      reason: "persist_qa",
      actorIdentityId: result.identityId,
    });
    assert.equal(availability.ok, true, JSON.stringify(availability));
    return { result, instance, healthcareOrganizationId: hcoId };
  }

  async function acSessionCookie(result) {
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: result.identityId,
      organizationId: result.organizationId,
    });
    assert.equal(session.ok, true, JSON.stringify(session));
    return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
  }

  it("AC: location/services/doctors chrome save URL + location draft/publish", async () => {
    if (!requireDb()) return;
    const { result } = await seedAcClinic();
    const cookie = await acSessionCookie(result);
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const slug = result.slug;

    for (const page of ["location", "services", "doctors", "contact"]) {
      const edit = await request(app)
        .get(`/clinics/${slug}/${page}?website_edit=1&website_mode=draft`)
        .set("Cookie", cookie);
      assert.equal(edit.status, 200, page);
      assert.match(
        edit.text,
        new RegExp(`data-website-save-url="/clinics/${slug}/website/drafts"`),
        `${page} must not embed page segment in save URL`
      );
      assert.doesNotMatch(edit.text, new RegExp(`/clinics/${slug}/${page}/website/drafts`));
    }

    const locPage = await request(app)
      .get(`/clinics/${slug}/location?website_edit=1&website_mode=draft`)
      .set("Cookie", cookie);
    const csrf = extractCsrf(locPage);
    const marker = `QA Location ${stamp}`;
    const cookies = cookieHeader(cookie, locPage);
    const saved = await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Cookie", cookies)
      .set("X-CSRF-Token", csrf)
      .send({ [CSRF_FIELD]: csrf, contentKey: "location.address", value: marker });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.ok, true);
    assert.equal(saved.body.published, false);

    const reload = await request(app)
      .get(`/clinics/${slug}/location?website_edit=1&website_mode=draft`)
      .set("Cookie", cookie);
    assert.match(reload.text, new RegExp(marker));

    const published = await request(app)
      .post(`/clinics/${slug}/website/publish`)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({ [CSRF_FIELD]: csrf, makePublic: "1" });
    assert.ok([200, 303].includes(published.status), `publish status ${published.status}`);

    const live = await request(app).get(`/clinics/${slug}/location`);
    assert.equal(live.status, 200);
    assert.match(live.text, new RegExp(marker));
  });

  it("AC: services + doctors catalogue save and website visibility", async () => {
    if (!requireDb()) return;
    const { result, healthcareOrganizationId } = await seedAcClinic();
    const granted = ["website.view", "website.edit", "website.publish"];
    const created = await catalogueService.createCatalogueService(pool, {
      organizationId: result.organizationId,
      healthcareOrganizationId,
      actorIdentityId: result.identityId,
      grantedPermissions: granted,
      displayName: `Persist Service ${stamp}`,
      publicSummary: "QA summary",
      publicWebsiteVisible: true,
      publicBookable: false,
      defaultDurationMinutes: 30,
    });
    assert.equal(created.ok, true, JSON.stringify(created));

    const cookie = await acSessionCookie(result);
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });

    const catalogue = await request(app)
      .get("/app/settings/website/catalogue?tab=services")
      .set("Cookie", cookie);
    assert.equal(catalogue.status, 200);
    assert.match(catalogue.text, new RegExp(`Persist Service ${stamp}`));
    assert.match(catalogue.text, /catalogue_action/);

    const docsPage = await request(app)
      .get("/app/settings/website/catalogue?tab=doctors")
      .set("Cookie", cookie);
    assert.equal(docsPage.status, 200);
    const staffMatch = docsPage.text.match(
      /action="\/app\/settings\/website\/catalogue\/doctors\/([0-9a-f-]{36})"/i
    );
    assert.ok(staffMatch, "expected a doctor catalogue form");
    const staffId = staffMatch[1];
    const csrf = extractCsrf(docsPage);
    const shown = await request(app)
      .post(`/app/settings/website/catalogue/doctors/${staffId}`)
      .set("Cookie", cookieHeader(cookie, docsPage))
      .type("form")
      .send({ [CSRF_FIELD]: csrf, catalogue_action: "show" });
    assert.ok([200, 303].includes(shown.status), `doctor show ${shown.status}`);
    if (shown.status === 303) {
      assert.match(String(shown.headers.location || ""), /catalogue\?tab=doctors/);
      assert.doesNotMatch(String(shown.headers.location || ""), /error=1/);
    }

    const visibility = await catalogueService.setDoctorWebsiteVisibility(pool, {
      organizationId: result.organizationId,
      healthcareOrganizationId,
      actorIdentityId: result.identityId,
      grantedPermissions: granted,
      staffId,
      visible: true,
    });
    assert.equal(visibility.ok, true, JSON.stringify(visibility));
  });

  it("BB: hero + contact draft save, leader image via engine media", async () => {
    if (!requireDb()) return;
    stamp += 1;
    const orgKey = `persist-bb-${stamp}`;
    const org = await provisionPlatformTenant(pool, {
      organizationKey: orgKey,
      displayName: `Persist BB ${stamp}`,
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: orgKey,
      hostname: `${orgKey}.blessboard.org`,
      domainType: "canonical",
      deploymentCode: "blessboard-org-staging",
      isPrimary: true,
    });
    assert.equal(org.ok, true, org.message);
    const organizationId = org.records.organization.id;
    const church = await provisionBlessBoardChurch(pool, {
      organizationKey: orgKey,
      churchKey: orgKey,
      displayName: `Persist Church ${stamp}`,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
    });
    assert.equal(church.ok, true, church.message);
    const churchId = church.records.church.id;
    await ensureChurchSettingsInitialized(pool, churchId);
    await updateChurchSettings(pool, churchId, {
      websiteStatus: "published",
      publicName: `Persist Church ${stamp}`,
      primaryEmail: `hq-${stamp}@example.test`,
      primaryPhone: "+260971000099",
    });
    await provisionEmptyPublicPages(pool, { churchId, branchId: null });
    const home = await pool.query(
      `SELECT id FROM blessboard.public_pages
        WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
      [churchId]
    );
    await updatePublicPage(pool, home.rows[0].id, { status: "published" });
    await createPageSection(pool, {
      pageId: home.rows[0].id,
      sectionKey: "hero",
      sectionType: "hero",
      heading: "Original Hero",
      bodyText: "Original body",
      status: "published",
      sortOrder: 0,
    });

    const user = await createBlessBoardUser(pool, {
      email: `persist-hq-${stamp}@example.test`,
      displayName: "Persist HQ",
      password: BB_PASSWORD,
    });
    assert.equal(user.ok, true, user.message);
    assert.equal(
      (
        await assignBlessBoardRole(pool, {
          email: user.user.email,
          roleKey: "church_hq_admin",
          organizationKey: orgKey,
          churchKey: orgKey,
        })
      ).ok,
      true
    );
    const session = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: user.user.id,
      organizationId,
      churchId,
      branchId: church.records.hqBranch.id,
    });
    assert.equal(session.ok, true, session.message || session.code);

    const app = createV5FoundationApp({
      getPool: () => pool,
      env: MINIMAL_BB,
    });
    const sessionCookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    const host = `${orgKey}.blessboard.org`;
    const edit = await request(app)
      .get(`/c/${orgKey}/hq?website_edit=1&website_mode=draft`)
      .set("Host", host)
      .set("Cookie", sessionCookie);
    assert.equal(edit.status, 200, edit.text && edit.text.slice(0, 400));
    const csrf = extractCsrf(edit);
    assert.ok(csrf, "csrf from edit page");
    const cookie = cookieHeader(sessionCookie, edit);

    const heroMarker = `QA Hero ${stamp}`;
    const heroSave = await request(app)
      .post(`/c/${orgKey}/hq/website/drafts`)
      .set("Host", host)
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.heading", value: heroMarker });
    assert.equal(heroSave.status, 200, JSON.stringify(heroSave.body));
    assert.equal(heroSave.body.ok, true);
    assert.equal(heroSave.body.content.draftValue, heroMarker);

    const contactSave = await request(app)
      .post(`/c/${orgKey}/hq/website/drafts`)
      .set("Host", host)
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "contact.details.phone",
        value: "+260955500011",
      });
    assert.equal(contactSave.status, 200, JSON.stringify(contactSave.body));
    assert.equal(contactSave.body.ok, true);

    const { resolveEngineInstance } = require("../src/blessboard/website/blessboardEngineContentService");
    const resolved = await resolveEngineInstance(pool, {
      organizationId,
      slug: orgKey,
      branchId: null,
      actorIdentityId: user.user.id,
    });
    assert.equal(resolved.ok, true, JSON.stringify(resolved));
    const instance = resolved.instance;

    const uploaded = await mediaService.registerWebsiteMedia(pool, {
      organizationId,
      instanceId: instance.id,
      actorIdentityId: user.user.id,
      mediaKind: "image",
      mimeType: "image/png",
      originalFilename: "leader.png",
      buffer: png1x1(),
    });
    assert.equal(uploaded.ok, true, JSON.stringify(uploaded));
    const presented = mediaService.presentWebsiteMediaForClient(instance, uploaded.media);
    assert.match(presented.publicSrc, new RegExp(`^/c/${orgKey}/website/media/`));

    const heroImage = await contentService.saveWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
      expectedProductCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.hero.image",
      value: { src: presented.publicSrc, alt: "Hero", mediaId: uploaded.media.id },
      actorIdentityId: user.user.id,
      grantedPermissions: ["website.edit"],
    });
    assert.equal(heroImage.ok, true, JSON.stringify(heroImage));

    const leaderDraft = await saveStructuredDraft(pool, {
      organizationId,
      churchId,
      branchId: null,
      editorUserId: user.user.id,
      actorRole: "church_hq_admin",
      draftKind: "leader",
      pageKey: "leadership",
      sectionKey: null,
      entityKey: `new-leader-${stamp}`,
      op: "upsert",
      payload: {
        displayName: `Pastor Persist ${stamp}`,
        roleTitle: "Senior Pastor",
        biography: "QA pastor biography",
        imageUrl: presented.publicSrc,
        visible: true,
        sortOrder: 10,
      },
    });
    assert.equal(leaderDraft.saved, true);
    assert.equal(leaderDraft.published, false);
    assert.equal(leaderDraft.payload.imageUrl, presented.publicSrc);

    const imageSection = await saveStructuredDraft(pool, {
      organizationId,
      churchId,
      branchId: null,
      editorUserId: user.user.id,
      actorRole: "church_hq_admin",
      draftKind: "image",
      pageKey: "home",
      sectionKey: "hero",
      entityKey: "home-hero-image",
      op: "upsert",
      payload: {
        imageUrl: presented.publicSrc,
        altText: "Home hero",
        focal: "center",
      },
    });
    assert.equal(imageSection.saved, true);
    assert.equal(imageSection.payload.imageUrl, presented.publicSrc);
  });
});
