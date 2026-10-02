"use strict";

/**
 * V2.05 / V5 — Admin Console Media smoke (AC + BB).
 *
 * Authorized admin opens Media → upload valid image → appears in tenant
 * library → metadata persists → website media flow can select it → tenant
 * isolation → invalid file rejected cleanly.
 *
 * Reuses platform mediaService + existing AC/BB website media HTTP; no new APIs.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { expectIsolationDenied } = require("./helpers/authzNegativeHelpers");
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
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const mediaService = require("../src/platform/website/mediaService");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { createV5Session } = require("../src/platform/session/createV5Session");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  PRODUCT_CODE,
  buildPublicWebsiteMediaLibraryPath,
} = require("../src/platform/website/publicWebsiteUrl");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");

const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "AcMediaSmoke-Pass-12!";
const BB_PASSWORD = "BbMediaSmoke-Pass-12!";
const AC_HOST = "activeclinic.org";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "a".repeat(48),
});

const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
  BLESSBOARD_MEDIA_FORCE_LOCAL: "1",
  BLESSBOARD_MEDIA_UPLOADS_ENABLED: "1",
  [ENV_KEY]: "1",
});

let pool;
let databaseUrl;
let skipReason = null;
let acCases = 0;
let bbCases = 0;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}${crypto.randomBytes(3).toString("hex")}`.slice(0, 24);
}

function escapeRe(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCsrf(res) {
  const html = String((res && res.text) || "");
  const meta = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const field = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
  if (field) return field[1];
  return null;
}

function cookieHeader(base, res) {
  const jar = new Map();
  for (const part of String(base || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0) jar.set(part.slice(0, i), part.slice(i + 1));
  }
  const raw = res && res.headers && res.headers["set-cookie"];
  for (const line of Array.isArray(raw) ? raw : raw ? [raw] : []) {
    const pair = String(line).split(";")[0];
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function assertNoServerError(res, label) {
  assert.ok(
    ![500, 503].includes(Number(res.status)),
    `${label} must not 500/503 (got ${res.status})`
  );
}

describe("V2.05 Admin Console Media smoke (AC + BB)", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("AC: Media open → upload → library → website select → isolation → invalid", async () => {
    requireDb();
    const stamp = uniq("acm");
    const provisioned = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Media Clinic ${stamp}`,
      contactName: "Media Admin",
      contactEmail: `${stamp}@acmedia.smoke`,
      contactPhone: `+2609${String(Date.now()).slice(-8)}`,
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Media Avenue",
      countryCode: "ZM",
      password: AC_PASSWORD,
      passwordConfirm: AC_PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: MINIMAL_AC,
    });
    assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
    const slug = provisioned.slug;
    const organizationId = provisioned.organizationId;
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId,
      productCode: PRODUCT_CODE.ACTIVECLINIC,
    });
    assert.ok(instance && instance.id, "AC website instance");
    await setClinicWebsiteAvailability(pool, {
      organizationKey: slug,
      public: true,
      overrideReadiness: true,
      reason: "v205_media_smoke",
    });

    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: provisioned.identityId,
      organizationId,
    });
    assert.equal(session.ok, true, JSON.stringify(session));
    const cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      log: () => {},
    });

    // 1) Open Media (Admin Console)
    const mediaPage = await request(app)
      .get("/app/settings/website/media")
      .set("Host", AC_HOST)
      .set("Cookie", cookie);
    assertNoServerError(mediaPage, "AC GET media");
    assert.equal(mediaPage.status, 200);
    assert.match(
      mediaPage.text,
      /data-ac-page-section="website-media"|data-ac-mw-screen="media"|data-gp-website-media-page|Media/i
    );
    acCases += 1;

    // 2) Upload valid image via supported platform media upload action
    let cookies = cookieHeader(cookie, mediaPage);
    const csrf = extractCsrf(mediaPage) || issueCsrfToken(MINIMAL_AC);
    const uploaded = await request(app)
      .post(`/clinics/${slug}/website/media`)
      .set("Host", AC_HOST)
      .set("Cookie", cookies)
      .field(CSRF_FIELD, csrf)
      .field("altText", `AC smoke alt ${stamp}`)
      .attach("file", TINY_PNG, { filename: `ac-smoke-${stamp}.png`, contentType: "image/png" });
    assertNoServerError(uploaded, "AC POST media upload");
    assert.equal(uploaded.status, 200, uploaded.text);
    const body = JSON.parse(uploaded.text);
    assert.equal(body.ok, true, uploaded.text);
    assert.ok(body.media && body.media.id, "media id");
    const mediaId = body.media.id;
    acCases += 1;

    // 3) Appears in tenant library / list
    const listed = await request(app)
      .get("/app/settings/website/media")
      .set("Host", AC_HOST)
      .set("Cookie", cookie);
    assertNoServerError(listed, "AC media list reload");
    assert.equal(listed.status, 200);
    assert.match(listed.text, new RegExp(escapeRe(mediaId)));
    const serviceList = await mediaService.listWebsiteMedia(pool, {
      organizationId,
      instanceId: instance.id,
    });
    assert.ok(
      (serviceList.media || []).some((m) => m.id === mediaId),
      "AC mediaService list contains upload"
    );
    acCases += 1;

    // 4) Metadata / reference persists
    const got = await mediaService.getWebsiteMedia(pool, {
      mediaId,
      organizationId,
    });
    assert.equal(got.ok, true, JSON.stringify(got));
    assert.equal(got.media.id, mediaId);
    assert.match(String(got.media.originalFilename || ""), /ac-smoke/);
    assert.match(String(got.media.mimeType || ""), /image\/png/);
    acCases += 1;

    // 5) Website media flow can select the asset (draft bind)
    const selected = await contentService.saveWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
      expectedProductCode: PRODUCT_CODE.ACTIVECLINIC,
      contentKey: "home.logo",
      value: {
        alt: `AC smoke alt ${stamp}`,
        mediaId,
        src: `/clinics/${slug}/website/media/${mediaId}`,
      },
      actorIdentityId: provisioned.identityId,
      grantedPermissions: ["website.edit"],
    });
    assert.equal(selected.ok, true, JSON.stringify(selected));
    // Branding page accepts mediaId reference (supported website flow)
    const brandingGet = await request(app)
      .get("/app/settings/website/branding")
      .set("Host", AC_HOST)
      .set("Cookie", cookie);
    assertNoServerError(brandingGet, "AC branding");
    cookies = cookieHeader(cookie, brandingGet);
    const brandingCsrf = extractCsrf(brandingGet) || csrf;
    const brandingSave = await request(app)
      .post("/app/settings/website/branding")
      .set("Host", AC_HOST)
      .set("Cookie", cookies)
      .type("form")
      .send({
        [CSRF_FIELD]: brandingCsrf,
        primaryColor: "#0d9488",
        accentColor: "#0f766e",
        logoSrc: `/clinics/${slug}/website/media/${mediaId}`,
        logoAlt: `AC smoke alt ${stamp}`,
        logoMediaId: mediaId,
      });
    assertNoServerError(brandingSave, "AC branding save");
    assert.ok([200, 303].includes(brandingSave.status), `branding ${brandingSave.status}`);
    acCases += 1;

    // 6) Tenant B cannot list/use tenant A media
    const otherStamp = uniq("aco");
    const other = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Other Clinic ${otherStamp}`,
      contactName: "Other Admin",
      contactEmail: `${otherStamp}@acmedia.smoke`,
      contactPhone: `+2609${String(Date.now() + 1).slice(-8)}`,
      province: "Lusaka",
      city: "Ndola",
      address: "2 Other Avenue",
      countryCode: "ZM",
      password: AC_PASSWORD,
      passwordConfirm: AC_PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: MINIMAL_AC,
    });
    assert.equal(other.ok, true, JSON.stringify(other));
    const otherSession = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: other.identityId,
      organizationId: other.organizationId,
    });
    const otherCookie = `${COOKIE_ACTIVECLINIC_ORG}=${otherSession.rawToken}`;
    const otherMedia = await request(app)
      .get("/app/settings/website/media")
      .set("Host", AC_HOST)
      .set("Cookie", otherCookie);
    assertNoServerError(otherMedia, "AC other media list");
    assert.equal(otherMedia.status, 200);
    assert.doesNotMatch(otherMedia.text, new RegExp(escapeRe(mediaId)));
    const steal = await request(app)
      .get(`/clinics/${slug}/website/media/${mediaId}`)
      .set("Host", AC_HOST)
      .set("Cookie", otherCookie);
    assertNoServerError(steal, "AC cross-tenant media fetch");
    expectIsolationDenied(steal, "AC cross-tenant media fetch");
    const crossSave = await contentService.saveWebsiteDraft(pool, {
      organizationId: other.organizationId,
      instanceId: (
        await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
          organizationId: other.organizationId,
          productCode: PRODUCT_CODE.ACTIVECLINIC,
        })
      ).id,
      expectedProductCode: PRODUCT_CODE.ACTIVECLINIC,
      contentKey: "home.logo",
      value: {
        alt: "stolen",
        mediaId,
        src: `/clinics/${slug}/website/media/${mediaId}`,
      },
      actorIdentityId: other.identityId,
      grantedPermissions: ["website.edit"],
    });
    assert.equal(crossSave.ok, false);
    assert.ok(
      ["media_not_found", "tenant_mismatch"].includes(crossSave.code),
      JSON.stringify(crossSave)
    );
    acCases += 1;

    // 7) Invalid file rejected cleanly
    const invalid = await request(app)
      .post(`/clinics/${slug}/website/media`)
      .set("Host", AC_HOST)
      .set("Cookie", cookies)
      .field(CSRF_FIELD, brandingCsrf)
      .attach("file", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), {
        filename: "x.svg",
        contentType: "image/svg+xml",
      });
    assertNoServerError(invalid, "AC invalid upload");
    assert.equal(invalid.status, 400);
    const invalidBody = JSON.parse(invalid.text);
    assert.equal(invalidBody.ok, false);
    assert.ok(invalidBody.code, JSON.stringify(invalidBody));
    acCases += 1;
  });

  it("BB: Media library open → upload → list → website select → isolation → invalid", async () => {
    requireDb();
    const stamp = uniq("bbm");
    const row = await appRepo.createApplication(pool, {
      church_name: `Media Church ${stamp}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "HQ Admin",
      contact_email: `${stamp}@bbmedia.smoke`,
      contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      selected_plan: "foundation",
      consent_terms: true,
      branch_name: "Main Campus",
    });
    const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: row.id,
      administratorPassword: BB_PASSWORD,
      requestId: `req-${stamp}`,
      actorContext: {
        type: "test",
        source: "v205_media_smoke",
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-staging",
      },
    });
    const orgKey = provisioned.records.organizationKey;
    const organizationId = provisioned.records.organizationId;
    const userId = provisioned.records.administratorUserId;
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId,
      productCode: PRODUCT_CODE.BLESSBOARD,
    });
    assert.ok(instance && instance.id, "BB website instance");
    await publicationService.publishWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
      expectedProductCode: PRODUCT_CODE.BLESSBOARD,
      actorIdentityId: userId,
      allowEmpty: true,
    });

    const session = await createV5Session(pool, {
      userId,
      deploymentCode: "blessboard-org-staging",
      organizationId,
    });
    assert.equal(session.ok, true, session.code || JSON.stringify(session));
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    const app = createV5FoundationApp({
      env: MINIMAL_BB,
      getPool: () => pool,
    });
    const mediaLibraryPath = buildPublicWebsiteMediaLibraryPath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey: orgKey,
    });

    // 1) Open Media library (supported Admin Console / website assets surface)
    const mediaPage = await request(app)
      .get(mediaLibraryPath)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assertNoServerError(mediaPage, "BB GET media-library");
    assert.equal(mediaPage.status, 200);
    assert.match(mediaPage.text, /data-gp-website-media-page|data-gp-library|Media/i);
    bbCases += 1;

    // 2) Upload valid image
    const edit = await request(app)
      .get(`/c/${orgKey}?website_edit=1&website_mode=draft`)
      .redirects(5)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assertNoServerError(edit, "BB editor");
    assert.equal(edit.status, 200, edit.text.slice(0, 200));
    const csrf = extractCsrf(edit);
    assert.ok(csrf, "BB editor CSRF");
    const cookies = cookieHeader(cookie, edit);
    const uploaded = await request(app)
      .post(`/c/${orgKey}/website/media`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookies)
      .field(CSRF_FIELD, csrf)
      .field("altText", `BB smoke alt ${stamp}`)
      .attach("file", TINY_PNG, { filename: `bb-smoke-${stamp}.png`, contentType: "image/png" });
    assertNoServerError(uploaded, "BB POST media upload");
    assert.equal(uploaded.status, 200, uploaded.text);
    assert.equal(uploaded.body.ok, true);
    assert.ok(uploaded.body.media && uploaded.body.media.id);
    const mediaId = uploaded.body.media.id;
    bbCases += 1;

    // 3) Appears in tenant library/list
    const listJson = await request(app)
      .get(`/c/${orgKey}/website/media`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie)
      .set("Accept", "application/json");
    assertNoServerError(listJson, "BB media JSON list");
    assert.equal(listJson.status, 200);
    assert.ok(
      (listJson.body.media || []).some((item) => item.id === mediaId),
      "BB JSON list contains upload"
    );
    const libraryReload = await request(app)
      .get(mediaLibraryPath)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(libraryReload.status, 200);
    assert.match(libraryReload.text, new RegExp(escapeRe(mediaId)));
    bbCases += 1;

    // 4) Metadata persists
    const got = await mediaService.getWebsiteMedia(pool, {
      mediaId,
      organizationId,
    });
    assert.equal(got.ok, true, JSON.stringify(got));
    assert.match(String(got.media.originalFilename || ""), /bb-smoke/);
    assert.match(String(got.media.mimeType || ""), /image\/png/);
    bbCases += 1;

    // 5) Website media flow can select the asset
    const selected = await contentService.saveWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
      expectedProductCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.hero.image",
      value: {
        alt: `BB smoke alt ${stamp}`,
        mediaId,
        src: uploaded.body.media.publicSrc || `/c/${orgKey}/website/media/${mediaId}`,
      },
      actorIdentityId: userId,
      grantedPermissions: ["website.edit"],
    });
    assert.equal(selected.ok, true, JSON.stringify(selected));
    bbCases += 1;

    // 6) Tenant B cannot list/use tenant A media
    const otherStamp = uniq("bbx");
    const otherRow = await appRepo.createApplication(pool, {
      church_name: `Other Church ${otherStamp}`,
      country: "Zambia",
      city: "Ndola",
      contact_name: "Other HQ",
      contact_email: `${otherStamp}@bbmedia.smoke`,
      contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      selected_plan: "foundation",
      consent_terms: true,
      branch_name: "Campus B",
    });
    const otherProv = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: otherRow.id,
      administratorPassword: BB_PASSWORD,
      requestId: `req-${otherStamp}`,
      actorContext: {
        type: "test",
        source: "v205_media_smoke_other",
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-staging",
      },
    });
    const otherSession = await createV5Session(pool, {
      userId: otherProv.records.administratorUserId,
      deploymentCode: "blessboard-org-staging",
      organizationId: otherProv.records.organizationId,
    });
    const otherCookie = `${DEFAULT_V5_COOKIE}=${otherSession.rawToken}`;
    const otherList = await request(app)
      .get(
        buildPublicWebsiteMediaLibraryPath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey: otherProv.records.organizationKey,
        })
      )
      .set("Host", "blessboard.org")
      .set("Cookie", otherCookie);
    assertNoServerError(otherList, "BB other media library");
    assert.equal(otherList.status, 200);
    assert.doesNotMatch(otherList.text, new RegExp(escapeRe(mediaId)));
    const steal = await request(app)
      .get(`/c/${orgKey}/website/media/${mediaId}`)
      .set("Host", "blessboard.org")
      .set("Cookie", otherCookie);
    assertNoServerError(steal, "BB cross-tenant media fetch");
    expectIsolationDenied(steal, "BB cross-tenant media fetch");
    bbCases += 1;

    // 7) Invalid file rejected cleanly
    const invalid = await request(app)
      .post(`/c/${orgKey}/website/media`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookies)
      .field(CSRF_FIELD, csrf)
      .attach("file", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), {
        filename: "x.svg",
        contentType: "image/svg+xml",
      });
    assertNoServerError(invalid, "BB invalid upload");
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.ok, false);
    assert.ok(invalid.body.code, JSON.stringify(invalid.body));
    bbCases += 1;
  });

  it("reports case counts for FINALs", () => {
    if (skipReason) return;
    assert.ok(acCases >= 6, `AC_CASES=${acCases}`);
    assert.ok(bbCases >= 6, `BB_CASES=${bbCases}`);
    // eslint-disable-next-line no-console
    console.log(
      `ADMIN_CONSOLE_MEDIA_SMOKE AC_CASES=${acCases} BB_CASES=${bbCases} PASS=${acCases + bbCases} FAIL=0`
    );
  });
});
