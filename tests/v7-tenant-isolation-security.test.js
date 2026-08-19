"use strict";

/**
 * V7 tenant isolation security pass.
 * Proves organization A cannot view/edit/publish/restore/configure organization B
 * via UI paths or direct HTTP, including guessed IDs, org-key substitution,
 * foreign version IDs, and ActiveClinic ↔ BlessBoard product swaps.
 * Hidden buttons are not treated as authorization.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
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
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, CSRF_COOKIE, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const versionService = require("../src/platform/website/versionService");
const mediaService = require("../src/platform/website/mediaService");
const resolver = require("../src/platform/website/resolver");
const { assertWebsiteInstanceScope } = require("../src/platform/website/authorizeWebsite");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const {
  updateHealthcareOrganizationSettings,
} = require("../src/activeclinic/services/loadActiveClinicSettingsScreens");
const { updateFacility, createFacility } = require("../src/activeclinic/services/facilityService");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  ensureBlessBoardWebsiteInstance,
} = require("../src/blessboard/website/blessboardWebsiteAdapter");
const {
  restoreAndPublishCurrentVersion,
} = require("../src/blessboard/services/websitePublicationVersionService");
const {
  PRODUCT_CODE,
  publicWebsitePathPrefix,
} = require("../src/platform/website/publicWebsiteUrl");

const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "clinic-admin-pass-12";
const BB_PASSWORD = "correct-horse-battery-staple";
const HOST_A = "iso-a.blessboard.org";
const HOST_B = "iso-b.blessboard.org";
const DRAFT_B = "ORG_B_DRAFT_SECRET_TOKEN_v7iso";
const LIVE_B = "Clinic Bravo Live Public Title";
const LIVE_A = "Clinic Alpha Live Public Title";
const NAME_B = "Isolation Clinic Bravo SECRET_B_NAME";
const GUESSED_UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

function bbEnv() {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
  };
}

function jpegBuffer(size) {
  const buf = Buffer.alloc(Math.max(size, 12), 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

function cookieHeader(...parts) {
  const tokens = [];
  for (const part of parts) {
    if (!part) continue;
    if (typeof part === "string") tokens.push(part);
    else if (part.headers && part.headers["set-cookie"]) {
      const raw = part.headers["set-cookie"];
      const list = Array.isArray(raw) ? raw : [raw];
      tokens.push(...list.map((line) => String(line).split(";")[0]));
    }
  }
  return tokens.filter(Boolean).join("; ");
}

function extractCsrf(res, env) {
  const html = String(res.text || "");
  const meta = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const field = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
  if (field) return field[1];
  return issueCsrfToken(env || MINIMAL_AC);
}

function isolationDenied(res, label) {
  const status = res.status;
  const location = String((res.headers && res.headers.location) || "");
  const loginRedirect =
    [301, 302, 303].includes(status) && /login|sign-in/i.test(location);
  assert.ok(
    [401, 403, 404].includes(status) || loginRedirect,
    `${label || "request"} expected 401/403/404 or login redirect, got ${status} ${location}`
  );
  return String(res.text || "");
}

describe("v7 tenant isolation — contract", () => {
  it("binds website instances to organization and expected product", () => {
    const instance = {
      id: "inst-a",
      organizationId: "org-a",
      productCode: "activeclinic",
    };
    assert.equal(assertWebsiteInstanceScope(null, { organizationId: "org-a" }).ok, false);
    assert.equal(
      assertWebsiteInstanceScope(instance, { organizationId: "org-b" }).code,
      "tenant_mismatch"
    );
    assert.equal(
      assertWebsiteInstanceScope(instance, {
        organizationId: "org-a",
        expectedProductCode: "blessboard",
      }).code,
      "tenant_mismatch"
    );
    assert.equal(
      assertWebsiteInstanceScope(instance, {
        organizationId: "org-a",
        expectedProductCode: "activeclinic",
      }).ok,
      true
    );
    assert.equal(publicWebsitePathPrefix(PRODUCT_CODE.ACTIVECLINIC), "/clinics");
    assert.equal(publicWebsitePathPrefix(PRODUCT_CODE.BLESSBOARD), "/c");
  });
});

describe("v7 tenant isolation — ActiveClinic HTTP and services", () => {
  let pool;
  let skipReason = null;
  let stamp = 0;
  let phoneSeq = 770000000;
  let clinicA;
  let clinicB;
  let acApp;
  let cookieA;
  let csrfA;
  let cookieJarA;

  function requireDb() {
    if (skipReason) {
      // eslint-disable-next-line no-console
      console.log("skip:", skipReason);
      return false;
    }
    return true;
  }

  function clinicPayload(name, note) {
    stamp += 1;
    phoneSeq += 1;
    return {
      clinicName: name,
      contactName: "Isolation Admin",
      contactEmail: `iso-${stamp}@example.invalid`,
      contactPhone: `+2609${String(phoneSeq).slice(-8)}`,
      province: "Lusaka Province",
      city: "Lusaka",
      address: "1 Independence Avenue",
      countryCode: "ZM",
      notes: note,
      password: AC_PASSWORD,
      passwordConfirm: AC_PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
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

  async function seedClinic(name, liveTitle, draftTitle) {
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload(name, "isolation"));
    assert.equal(result.ok, true, JSON.stringify(result));
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    assert.ok(instance);
    const liveSave = await contentService.saveWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      contentKey: "home.hero.title",
      value: liveTitle,
    });
    assert.equal(liveSave.ok, true, JSON.stringify(liveSave));
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      allowEmpty: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    if (draftTitle) {
      const draftSave = await contentService.saveWebsiteDraft(pool, {
        organizationId: result.organizationId,
        instanceId: instance.id,
        contentKey: "home.hero.title",
        value: draftTitle,
      });
      assert.equal(draftSave.ok, true, JSON.stringify(draftSave));
    }
    const availability = await setClinicWebsiteAvailability(pool, {
      organizationKey: result.slug,
      public: true,
      overrideReadiness: true,
      reason: "isolation_security",
    });
    assert.equal(availability.ok, true, JSON.stringify(availability));
    const facility = await pool.query(
      `SELECT id, facility_key, display_name
         FROM activeclinic.facilities
        WHERE organization_id = $1 AND is_primary = true
        LIMIT 1`,
      [result.organizationId]
    );
    const versions = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: result.organizationId,
    });
    let facilityRow = facility.rows[0];
    if (draftTitle === DRAFT_B && facilityRow) {
      phoneSeq += 1;
      const annex = await createFacility(pool, {
        organizationId: result.organizationId,
        healthcareOrganizationId:
          (result.healthcareOrganization && result.healthcareOrganization.id) ||
          (
            await pool.query(
              `SELECT id FROM activeclinic.healthcare_organizations WHERE organization_id = $1 LIMIT 1`,
              [result.organizationId]
            )
          ).rows[0].id,
        displayName: "Bravo Annex SECRET_B_FACILITY",
        facilityKey: "bravo_annex",
        facilityType: "clinic",
        status: "active",
        isPrimary: false,
        countryCode: "ZM",
        timezone: "Africa/Lusaka",
        phone: `+2609${String(phoneSeq).slice(-8)}`,
      });
      assert.equal(annex.ok, true, JSON.stringify(annex));
      facilityRow = {
        id: annex.facility.id,
        facility_key: annex.facility.facilityKey,
        display_name: annex.facility.displayName,
      };
    }
    return {
      result,
      instance,
      facility: facilityRow,
      version: (versions.versions || [])[0] || null,
    };
  }

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
      clinicA = await seedClinic("Isolation Clinic Alpha", LIVE_A, "ORG_A_DRAFT_ONLY");
      clinicB = await seedClinic(NAME_B, LIVE_B, DRAFT_B);
      acApp = createActiveClinicFoundationApp({
        getPool: () => pool,
        env: MINIMAL_AC,
        log: () => {},
      });
      cookieA = await sessionCookie(clinicA.result.identityId, clinicA.result.organizationId);
      const editPage = await request(acApp)
        .get(`/clinics/${clinicA.result.slug}?website_edit=1&website_mode=draft`)
        .set("Cookie", cookieA);
      csrfA = extractCsrf(editPage);
      cookieJarA = cookieHeader(cookieA, editPage);
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("findWebsiteInstanceById requires an organization id", async () => {
    if (!requireDb()) return;
    const leaked = await instanceRepo.findWebsiteInstanceById(pool, clinicB.instance.id, null);
    assert.equal(leaked, null);
    const owned = await instanceRepo.findWebsiteInstanceById(
      pool,
      clinicB.instance.id,
      clinicB.result.organizationId
    );
    assert.ok(owned);
    const crossed = await instanceRepo.findWebsiteInstanceById(
      pool,
      clinicB.instance.id,
      clinicA.result.organizationId
    );
    assert.equal(crossed, null);
  });

  it("service: org A cannot draft, publish, restore, or attach media on org B", async () => {
    if (!requireDb()) return;
    const draft = await contentService.saveWebsiteDraft(pool, {
      organizationId: clinicA.result.organizationId,
      instanceId: clinicB.instance.id,
      contentKey: "home.hero.title",
      value: "Hijack B draft",
    });
    assert.equal(draft.ok, false);

    const publish = await publicationService.publishWebsiteDraft(pool, {
      organizationId: clinicA.result.organizationId,
      instanceId: clinicB.instance.id,
    });
    assert.equal(publish.ok, false);

    const restore = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId: clinicA.result.organizationId,
      instanceId: clinicA.instance.id,
      versionId: clinicB.version.id,
    });
    assert.equal(restore.ok, false);

    const media = await mediaService.registerWebsiteMedia(pool, {
      organizationId: clinicA.result.organizationId,
      instanceId: clinicB.instance.id,
      mediaKind: "image",
      originalFilename: "steal.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer(48),
    });
    assert.equal(media.ok, false);

    const productSwap = await contentService.saveWebsiteDraft(pool, {
      organizationId: clinicA.result.organizationId,
      instanceId: clinicA.instance.id,
      expectedProductCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.hero.title",
      value: "product swap",
    });
    assert.equal(productSwap.ok, false);
    assert.equal(productSwap.code, "tenant_mismatch");

    const liveB = await resolver.resolveWebsiteContent(pool, {
      organizationId: clinicB.result.organizationId,
      instance: clinicB.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveB.values["home.hero.title"], LIVE_B);
    const draftB = await resolver.resolveWebsiteContent(pool, {
      organizationId: clinicB.result.organizationId,
      instance: clinicB.instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(draftB.values["home.hero.title"], DRAFT_B);
  });

  it("HTTP: user A cannot view org B draft via website_mode or edit chrome", async () => {
    if (!requireDb()) return;
    const asA = await request(acApp)
      .get(`/clinics/${clinicB.result.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", cookieA);
    assert.equal(asA.status, 200);
    assert.doesNotMatch(asA.text, new RegExp(DRAFT_B));
    assert.match(asA.text, new RegExp(LIVE_B));
    assert.doesNotMatch(asA.text, /data-website-chrome/);
    assert.doesNotMatch(asA.text, /data-website-start="1"/);

    const history = await request(acApp)
      .get(`/clinics/${clinicB.result.slug}/website/history`)
      .set("Cookie", cookieA);
    isolationDenied(history, "history");
    assert.doesNotMatch(String(history.text || ""), new RegExp(DRAFT_B));

    const versions = await request(acApp)
      .get(`/clinics/${clinicB.result.slug}/website/versions`)
      .set("Cookie", cookieA);
    isolationDenied(versions, "versions list");

    const version = await request(acApp)
      .get(`/clinics/${clinicB.result.slug}/website/versions/${clinicB.version.id}`)
      .set("Cookie", cookieA);
    isolationDenied(version, "version detail");
    assert.doesNotMatch(String(version.text || ""), new RegExp(DRAFT_B));
  });

  it("HTTP: user A cannot edit, upload, publish, or restore org B", async () => {
    if (!requireDb()) return;
    const edit = await request(acApp)
      .post(`/clinics/${clinicB.result.slug}/website/drafts`)
      .set("Cookie", cookieJarA)
      .send({ [CSRF_FIELD]: csrfA, contentKey: "home.hero.title", value: "HTTP hijack B" });
    isolationDenied(edit, "draft POST");

    const upload = await request(acApp)
      .post(`/clinics/${clinicB.result.slug}/website/media`)
      .set("Cookie", cookieJarA)
      .field(CSRF_FIELD, csrfA)
      .attach("file", jpegBuffer(40), { filename: "x.jpg", contentType: "image/jpeg" });
    isolationDenied(upload, "media POST");

    const publish = await request(acApp)
      .post(`/clinics/${clinicB.result.slug}/website/publish`)
      .set("Cookie", cookieJarA)
      .send({ [CSRF_FIELD]: csrfA, makePublic: "1" });
    isolationDenied(publish, "publish POST");

    const restore = await request(acApp)
      .post(`/clinics/${clinicB.result.slug}/website/versions/${clinicB.version.id}/restore`)
      .set("Cookie", cookieJarA)
      .send({ [CSRF_FIELD]: csrfA });
    isolationDenied(restore, "restore POST");

    const liveB = await resolver.resolveWebsiteContent(pool, {
      organizationId: clinicB.result.organizationId,
      instance: clinicB.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveB.values["home.hero.title"], LIVE_B);
    const draftB = await resolver.resolveWebsiteContent(pool, {
      organizationId: clinicB.result.organizationId,
      instance: clinicB.instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(draftB.values["home.hero.title"], DRAFT_B);
  });

  it("HTTP: substituting org keys, instance IDs, version IDs, and product params is denied", async () => {
    if (!requireDb()) return;
    const swappedKey = await request(acApp)
      .post(`/clinics/${clinicB.result.slug}/website/drafts`)
      .set("Cookie", cookieJarA)
      .send({
        [CSRF_FIELD]: csrfA,
        contentKey: "home.hero.title",
        value: "key swap",
        organizationId: clinicB.result.organizationId,
        instanceId: clinicB.instance.id,
        product: "blessboard",
      });
    isolationDenied(swappedKey, "org/instance/product body");

    const foreignVersionOnA = await request(acApp)
      .post(`/clinics/${clinicA.result.slug}/website/versions/${clinicB.version.id}/restore`)
      .set("Cookie", cookieJarA)
      .send({ [CSRF_FIELD]: csrfA });
    assert.ok(foreignVersionOnA.status !== 200, String(foreignVersionOnA.status));
    if (foreignVersionOnA.status === 200) {
      assert.equal(JSON.parse(foreignVersionOnA.text).ok, false);
    }

    const foreignVersionGet = await request(acApp)
      .get(`/clinics/${clinicA.result.slug}/website/versions/${clinicB.version.id}`)
      .set("Cookie", cookieA);
    isolationDenied(foreignVersionGet, "foreign version GET on A");

    const guessedRestore = await request(acApp)
      .post(`/clinics/${clinicA.result.slug}/website/versions/${GUESSED_UUID}/restore`)
      .set("Cookie", cookieJarA)
      .send({ [CSRF_FIELD]: csrfA });
    assert.ok(guessedRestore.status !== 200 || JSON.parse(guessedRestore.text).ok !== true);

    const guessedMedia = await request(acApp)
      .get(`/clinics/${clinicB.result.slug}/website/media/${GUESSED_UUID}`)
      .set("Cookie", cookieA);
    isolationDenied(guessedMedia, "guessed media");
    assert.doesNotMatch(String(guessedMedia.text || ""), /bravo|SECRET_B_NAME/i);

    const liveA = await resolver.resolveWebsiteContent(pool, {
      organizationId: clinicA.result.organizationId,
      instance: clinicA.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveA.values["home.hero.title"], LIVE_A);
  });

  it("HTTP: user A cannot access or alter org B settings or facilities", async () => {
    if (!requireDb()) return;
    const settings = await request(acApp).get("/app/settings").set("Cookie", cookieA);
    assert.equal(settings.status, 200);
    assert.doesNotMatch(settings.text, /SECRET_B_NAME/);

    const websiteSettings = await request(acApp).get("/app/settings/website").set("Cookie", cookieA);
    assert.equal(websiteSettings.status, 200);
    assert.doesNotMatch(websiteSettings.text, /SECRET_B_NAME/);
    assert.doesNotMatch(websiteSettings.text, new RegExp(DRAFT_B));

    const orgForm = await request(acApp).get("/app/settings/organization/edit").set("Cookie", cookieA);
    const orgCsrf = extractCsrf(orgForm);
    const orgCookies = cookieHeader(cookieA, orgForm);
    const swappedOrg = await request(acApp)
      .post("/app/settings/organization")
      .set("Cookie", orgCookies)
      .type("form")
      .send({
        [CSRF_FIELD]: orgCsrf,
        organization_id: clinicB.result.organizationId,
        legal_name: "Hijacked Bravo Legal",
        public_name: "Hijacked Bravo Public",
        organization_type: "independent_facility",
        country_code: "ZM",
        registration_number: "HIJACK",
        timezone: "Africa/Lusaka",
      });
    assert.ok(
      [303, 400, 403].includes(swappedOrg.status),
      `unexpected settings status ${swappedOrg.status}`
    );

    const bName = await pool.query(
      `SELECT public_name FROM activeclinic.healthcare_organizations WHERE organization_id = $1`,
      [clinicB.result.organizationId]
    );
    assert.doesNotMatch(String(bName.rows[0].public_name || ""), /Hijacked Bravo/);

    const facilityGet = await request(acApp)
      .get(`/app/facilities/${encodeURIComponent(clinicB.facility.facility_key)}`)
      .set("Cookie", cookieA);
    isolationDenied(facilityGet, "facility GET");
    assert.doesNotMatch(String(facilityGet.text || ""), /SECRET_B_NAME|SECRET_B_FACILITY/);

    const facilityPost = await request(acApp)
      .post(`/app/facilities/${encodeURIComponent(clinicB.facility.facility_key)}`)
      .set("Cookie", orgCookies)
      .send({
        [CSRF_FIELD]: orgCsrf,
        organization_id: clinicB.result.organizationId,
        display_name: "Hijacked Facility",
      });
    isolationDenied(facilityPost, "facility POST");

    const facilitySvc = await updateFacility(pool, {
      id: clinicB.facility.id,
      organizationId: clinicA.result.organizationId,
      patch: { displayName: "Stolen facility" },
    });
    assert.equal(facilitySvc.ok, false);

    const settingsSvc = await updateHealthcareOrganizationSettings(pool, {
      auth: {
        permissions: ["activeclinic.organization.manage"],
        organization: { id: clinicA.result.organizationId },
      },
      organizationId: clinicB.result.organizationId,
      legalName: "Ignored",
      publicName: "Ignored",
      organizationType: "independent_facility",
      countryCode: "ZM",
      registrationNumber: "X",
      timezone: "Africa/Lusaka",
    });
    assert.ok(settingsSvc.ok, JSON.stringify(settingsSvc));
    const stillB = await pool.query(
      `SELECT public_name FROM activeclinic.healthcare_organizations WHERE organization_id = $1`,
      [clinicB.result.organizationId]
    );
    assert.match(String(stillB.rows[0].public_name || ""), /Bravo|SECRET_B_NAME|Isolation/);
    assert.doesNotMatch(String(stillB.rows[0].public_name || ""), /Ignored/);
  });

  it("product swap: AC paths do not operate BlessBoard tenants or instances", async () => {
    if (!requireDb()) return;
    const alias = await request(acApp).get(`/c/${clinicA.result.slug}`);
    assert.equal(alias.status, 301);
    assert.match(String(alias.headers.location || ""), /^\/clinics\//);

    const bbOnAc = await request(acApp).get("/clinics/iso-church-a");
    isolationDenied(bbOnAc, "church slug on /clinics");

    const bbInstance = await ensureBlessBoardWebsiteInstance(pool, {
      organizationId: clinicA.result.organizationId,
      slug: `bb-shadow-${clinicA.result.slug}`,
    });
    assert.equal(bbInstance.ok, true, JSON.stringify(bbInstance));
    const publishedBb = await publicationService.publishWebsiteDraft(pool, {
      organizationId: clinicA.result.organizationId,
      instanceId: bbInstance.instance.id,
      allowEmpty: true,
      forceTenantPublish: true,
    });
    assert.equal(publishedBb.ok, true, JSON.stringify(publishedBb));
    const bbVersions = await versionService.listWebsiteVersions(pool, {
      instanceId: bbInstance.instance.id,
      organizationId: clinicA.result.organizationId,
    });
    const bbVersion = (bbVersions.versions || [])[0];
    assert.ok(bbVersion);

    const leak = await request(acApp)
      .get(`/clinics/${clinicA.result.slug}/website/versions/${bbVersion.id}`)
      .set("Cookie", cookieA);
    isolationDenied(leak, "BlessBoard version via AC path");

    const restoreBb = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId: clinicA.result.organizationId,
      instanceId: clinicA.instance.id,
      expectedProductCode: PRODUCT_CODE.ACTIVECLINIC,
      versionId: bbVersion.id,
    });
    assert.equal(restoreBb.ok, false);
  });
});

describe("v7 tenant isolation — BlessBoard HQ and product swap", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let acApp;
  let bbApp;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let users = {};
  let clinic;

  function skipIfNeeded() {
    if (!skipSuite) return false;
    assert.fail(`BlessBoard isolation setup failed: ${skipReason}`);
    return true;
  }

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

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "iso-church-a",
        displayName: "Isolation Church A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "iso-church-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "iso-church-a",
        churchKey: "iso-church-a",
        displayName: "Isolation Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "iso-church-b",
        displayName: "Isolation Church B SECRET_BB_B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "iso-church-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "iso-church-b",
        churchKey: "iso-church-b",
        displayName: "Isolation Church B SECRET_BB_B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      async function makeUser(email, displayName, role, organizationId) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: BB_PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        if (role) {
          assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        }
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser(
        "iso-hq-a@example.test",
        "HQ A",
        {
          email: "iso-hq-a@example.test",
          organizationKey: "iso-church-a",
          roleKey: "church_hq_admin",
          churchKey: "iso-church-a",
        },
        orgA.records.organization.id
      );
      users.hqB = await makeUser(
        "iso-hq-b@example.test",
        "HQ B",
        {
          email: "iso-hq-b@example.test",
          organizationKey: "iso-church-b",
          roleKey: "church_hq_admin",
          churchKey: "iso-church-b",
        },
        orgB.records.organization.id
      );

      clinic = await submitAndProvisionClinicRegistration(pool, {
        clinicName: "Isolation AC for product swap",
        contactName: "AC Admin",
        contactEmail: "iso-ac-swap@example.invalid",
        contactPhone: "+260977000111",
        province: "Lusaka Province",
        city: "Lusaka",
        address: "1 Independence Avenue",
        countryCode: "ZM",
        notes: "product swap",
        password: AC_PASSWORD,
        passwordConfirm: AC_PASSWORD,
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        dataEnvironment: "testing",
        env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
      });
      assert.equal(clinic.ok, true, JSON.stringify(clinic));

      acApp = createActiveClinicFoundationApp({
        getPool: () => pool,
        env: MINIMAL_AC,
        log: () => {},
      });
      bbApp = createV5FoundationApp({
        env: bbEnv(),
        getPool: () => pool,
        log: () => {},
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "setup failed";
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("church A cannot view, edit, publish, restore, or change HQ/settings of church B", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(bbEnv());
    const cookiesA = cookieHeader(
      `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`,
      `${CSRF_COOKIE}=${csrf}`
    );

    const overviewB = await request(bbApp)
      .get("/hq/website")
      .set("Host", HOST_B)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`);
    isolationDenied(overviewB, "HQ website on host B");
    assert.doesNotMatch(String(overviewB.text || ""), /SECRET_BB_B/);

    const settingsB = await request(bbApp)
      .get("/hq/settings")
      .set("Host", HOST_B)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`);
    isolationDenied(settingsB, "HQ settings on host B");

    const inlineB = await request(bbApp)
      .post("/hq/content/api/inline-field")
      .set("Host", HOST_B)
      .set("Cookie", cookiesA)
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Cross HQ hijack",
        organizationId: orgB.records.organization.id,
        churchId: churchB.id,
      });
    isolationDenied(inlineB, "inline field on host B");

    const publishB = await request(bbApp)
      .post("/hq/website/publish")
      .set("Host", HOST_B)
      .set("Cookie", cookiesA)
      .send({
        [CSRF_FIELD]: csrf,
        confirm_publish: "1",
        organizationId: orgB.records.organization.id,
        churchId: churchB.id,
      });
    isolationDenied(publishB, "publish church B");

    const settingsPost = await request(bbApp)
      .post("/hq/settings")
      .set("Host", HOST_A)
      .set("Cookie", cookiesA)
      .send({
        [CSRF_FIELD]: csrf,
        organizationId: orgB.records.organization.id,
        churchId: churchB.id,
        publicName: "Hijacked Church B",
      });
    isolationDenied(settingsPost, "settings org substitution");

    const restored = await restoreAndPublishCurrentVersion(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      versionId: GUESSED_UUID,
    });
    assert.equal(restored.ok, false);
  });

  it("ActiveClinic cookie cannot use BlessBoard HQ; BlessBoard cookie cannot use AC settings", async () => {
    if (skipIfNeeded()) return;
    const acSession = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: clinic.identityId,
      organizationId: clinic.organizationId,
    });
    assert.equal(acSession.ok, true, JSON.stringify(acSession));
    const acCookie = `${COOKIE_ACTIVECLINIC_ORG}=${acSession.rawToken}`;

    const acOnBb = await request(bbApp)
      .get("/hq/website")
      .set("Host", HOST_A)
      .set("Cookie", acCookie);
    isolationDenied(acOnBb, "AC cookie on BlessBoard HQ");

    const bbOnAcSettings = await request(acApp)
      .get("/app/settings")
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`);
    isolationDenied(bbOnAcSettings, "BB cookie on AC settings");

    const acSlugOnBb = await request(bbApp).get(`/c/${clinic.slug}`).set("Host", HOST_A);
    isolationDenied(acSlugOnBb, "AC slug on BlessBoard /c");

    const churchOnAc = await request(acApp).get("/clinics/iso-church-b");
    isolationDenied(churchOnAc, "church slug on AC /clinics");

    const acDraftOnChurchPath = await request(acApp)
      .post("/clinics/iso-church-b/website/drafts")
      .set("Cookie", acCookie)
      .send({
        [CSRF_FIELD]: issueCsrfToken(MINIMAL_AC),
        contentKey: "home.hero.title",
        value: "product path hijack",
        product: "blessboard",
      });
    isolationDenied(acDraftOnChurchPath, "AC drafts on church key");
  });
});
