"use strict";

/**
 * V2.06 P1 — Content Library end-to-end verify (BB + AC).
 *
 * Library list → select image (same draft payload as shared picker) → save →
 * reopen draft → publish → public page. Asserts asset id/URL persistence,
 * tenant isolation, no fallback to prior image, desktop/mobile framing contract.
 *
 * Verification-only: product code is not modified by this file.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
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
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
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

const ROOT = path.join(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "AcLibE2E-Pass-12!";
const BB_PASSWORD = "BbLibE2E-Pass-12!";
const AC_HOST = "activeclinic.org";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const TINY_PNG_B = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8CAwAJ/AL+XciqYwAAAABJRU5ErkJggg==",
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

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}${crypto.randomBytes(3).toString("hex")}`.slice(0, 24);
}

function escapeRe(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
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
    `${label} must not 500/503 (got ${res.status}): ${String(res.text || "").slice(0, 240)}`
  );
}

function draftImageValue(mediaId, src, alt) {
  return {
    alt: alt || "",
    mediaId,
    src,
  };
}

function contentRowValue(rows, key) {
  const row = (rows || []).find((r) => r && r.contentKey === key);
  return row || null;
}

describe("V2.06 Content Library shared picker contract", () => {
  it("shared editor loads library JSON and persists mediaId on save", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /Choose from Image Library/);
    assert.match(js, /data-website-library="1"/);
    assert.match(js, /fetch\(mediaUrl/);
    assert.match(js, /out\.media/);
    assert.match(js, /state\.pendingMediaId = item\.id/);
    assert.match(js, /mediaId:\s*[\s\S]*pendingMediaId/);
    assert.match(js, /data-website-frame-mode="desktop"/);
    assert.match(js, /data-website-frame-mode="mobile"/);
  });
});

describe("V2.06 Content Library E2E (BB + AC)", () => {
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

  it("BB: library select → save → reopen draft → publish → public (no prior fallback)", async () => {
    requireDb();
    const stamp = uniq("bbl");
    const row = await appRepo.createApplication(pool, {
      church_name: `Lib Church ${stamp}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "HQ Admin",
      contact_email: `${stamp}@bblib.example.test`,
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
        source: "v206_content_library_e2e",
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-staging",
      },
    });
    assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
    const orgKey = provisioned.records.organizationKey;
    const organizationId = provisioned.records.organizationId;
    const userId = provisioned.records.administratorUserId;
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId,
      productCode: PRODUCT_CODE.BLESSBOARD,
    });
    assert.ok(instance && instance.id, "BB website instance");

    const session = await createV5Session(pool, {
      userId,
      deploymentCode: "blessboard-org-staging",
      organizationId,
    });
    assert.equal(session.ok, true, session.code || JSON.stringify(session));
    let cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    const app = createV5FoundationApp({
      env: MINIMAL_BB,
      getPool: () => pool,
    });

    const mediaLibraryPath = buildPublicWebsiteMediaLibraryPath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey: orgKey,
    });
    const libraryPage = await request(app)
      .get(mediaLibraryPath)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assertNoServerError(libraryPage, "BB Content Library");
    assert.equal(libraryPage.status, 200);

    const edit = await request(app)
      .get(`/c/${orgKey}?website_edit=1&website_mode=draft`)
      .redirects(5)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assertNoServerError(edit, "BB editor");
    assert.equal(edit.status, 200);
    let csrf = extractCsrf(edit);
    assert.ok(csrf, "BB CSRF");
    cookie = cookieHeader(cookie, edit);

    // Baseline (prior) image — publish first so public must not fall back to it later.
    const oldUpload = await request(app)
      .post(`/c/${orgKey}/website/media`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie)
      .field(CSRF_FIELD, csrf)
      .field("altText", `BB old ${stamp}`)
      .attach("file", TINY_PNG, {
        filename: `bb-old-${stamp}.png`,
        contentType: "image/png",
      });
    assert.equal(oldUpload.status, 200, oldUpload.text);
    const oldId = oldUpload.body.media.id;
    const oldSrc =
      oldUpload.body.media.publicSrc || `/c/${orgKey}/website/media/${oldId}`;
    assert.equal(
      (
        await contentService.saveWebsiteDraft(pool, {
          organizationId,
          instanceId: instance.id,
          expectedProductCode: PRODUCT_CODE.BLESSBOARD,
          contentKey: "home.hero.image",
          value: draftImageValue(oldId, oldSrc, `BB old ${stamp}`),
          actorIdentityId: userId,
          grantedPermissions: ["website.edit"],
        })
      ).ok,
      true
    );
    const oldPublish = await publicationService.publishWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
      expectedProductCode: PRODUCT_CODE.BLESSBOARD,
      actorIdentityId: userId,
      grantedPermissions: ["website.publish"],
    });
    assert.equal(oldPublish.ok, true, JSON.stringify(oldPublish));

    // New library image (the one we select).
    const newUpload = await request(app)
      .post(`/c/${orgKey}/website/media`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie)
      .field(CSRF_FIELD, csrf)
      .field("altText", `BB new ${stamp}`)
      .attach("file", TINY_PNG_B, {
        filename: `bb-new-${stamp}.png`,
        contentType: "image/png",
      });
    assert.equal(newUpload.status, 200, newUpload.text);
    const newId = newUpload.body.media.id;
    const newSrc =
      newUpload.body.media.publicSrc || `/c/${orgKey}/website/media/${newId}`;
    assert.notEqual(newId, oldId);

    const listJson = await request(app)
      .get(`/c/${orgKey}/website/media`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie)
      .set("Accept", "application/json");
    assert.equal(listJson.status, 200);
    assert.ok(
      (listJson.body.media || []).some((m) => m.id === newId),
      "library JSON includes selected asset"
    );

    // Select + save (same payload shared Image Library picker posts).
    const draftSave = await request(app)
      .post(`/c/${orgKey}/website/drafts`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie)
      .set("Content-Type", "application/json")
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.image",
        value: draftImageValue(newId, newSrc, `BB new ${stamp}`),
      });
    assertNoServerError(draftSave, "BB drafts save");
    assert.equal(draftSave.status, 200, draftSave.text);
    assert.equal(draftSave.body.ok, true, draftSave.text);

    const rows = await contentService.listWebsiteContent(pool, instance, organizationId);
    const heroRow = contentRowValue(rows, "home.hero.image");
    assert.ok(heroRow, "hero content row");
    const draftVal = heroRow.draftValue || {};
    assert.equal(String(draftVal.mediaId || ""), newId, "draft mediaId persisted");
    assert.match(String(draftVal.src || ""), new RegExp(escapeRe(newId)));

    // Reopen draft editor — selected asset must still be bound.
    const reopen = await request(app)
      .get(`/c/${orgKey}?website_edit=1&website_mode=draft`)
      .redirects(5)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(reopen.status, 200);
    assert.match(reopen.text, new RegExp(escapeRe(newId)));
    assert.match(
      reopen.text,
      new RegExp(`data-website-media-id="${escapeRe(newId)}"|${escapeRe(newSrc)}`)
    );
    csrf = extractCsrf(reopen) || csrf;
    cookie = cookieHeader(cookie, reopen);

    // Publish via public editor endpoint (same chrome path as Content Library flow).
    const published = await request(app)
      .post(`/c/${orgKey}/website/publish`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie)
      .set("Content-Type", "application/x-www-form-urlencoded")
      .set("X-CSRF-Token", csrf)
      .send(`${CSRF_FIELD}=${encodeURIComponent(csrf)}`);
    assertNoServerError(published, "BB publish");
    assert.ok([200, 303].includes(published.status), `publish ${published.status} ${published.text}`);
    if (published.status === 200 && published.body && typeof published.body.ok === "boolean") {
      assert.equal(published.body.ok, true, published.text);
    }

    const liveRows = await contentService.listWebsiteContent(pool, instance, organizationId);
    const liveHero = contentRowValue(liveRows, "home.hero.image");
    const liveVal = liveHero && liveHero.publishedValue ? liveHero.publishedValue : {};
    assert.equal(String(liveVal.mediaId || ""), newId, "published mediaId");
    assert.notEqual(String(liveVal.mediaId || ""), oldId);

    // Public page — desktop UA
    const publicDesktop = await request(app)
      .get(`/c/${orgKey}`)
      .set("Host", "blessboard.org")
      .set(
        "User-Agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
      );
    assert.equal(publicDesktop.status, 200);
    assert.match(publicDesktop.text, new RegExp(escapeRe(newId)));
    assert.doesNotMatch(
      publicDesktop.text,
      new RegExp(`website/media/${escapeRe(oldId)}`)
    );

    // Public page — mobile UA (same asset must render)
    const publicMobile = await request(app)
      .get(`/c/${orgKey}`)
      .set("Host", "blessboard.org")
      .set(
        "User-Agent",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
      );
    assert.equal(publicMobile.status, 200);
    assert.match(publicMobile.text, new RegExp(escapeRe(newId)));
    assert.doesNotMatch(
      publicMobile.text,
      new RegExp(`website/media/${escapeRe(oldId)}`)
    );

    // Tenant isolation: other org must not list or draft-bind this asset.
    // Published bytes on the owning public media URL may 200 (visitor delivery).
    const otherStamp = uniq("bbx");
    const otherRow = await appRepo.createApplication(pool, {
      church_name: `Other Lib ${otherStamp}`,
      country: "Zambia",
      city: "Ndola",
      contact_name: "Other HQ",
      contact_email: `${otherStamp}@bblib.example.test`,
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
        source: "v206_content_library_e2e_other",
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-staging",
      },
    });
    assert.equal(otherProv.ok, true, JSON.stringify(otherProv));
    const otherOrgId = otherProv.records.organizationId;
    const otherInstance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: otherOrgId,
      productCode: PRODUCT_CODE.BLESSBOARD,
    });
    const otherSession = await createV5Session(pool, {
      userId: otherProv.records.administratorUserId,
      deploymentCode: "blessboard-org-staging",
      organizationId: otherOrgId,
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
    assert.equal(otherList.status, 200);
    assert.doesNotMatch(otherList.text, new RegExp(escapeRe(newId)));
    const crossDraft = await contentService.saveWebsiteDraft(pool, {
      organizationId: otherOrgId,
      instanceId: otherInstance.id,
      expectedProductCode: PRODUCT_CODE.BLESSBOARD,
      contentKey: "home.hero.image",
      value: draftImageValue(newId, newSrc, "stolen"),
      actorIdentityId: otherProv.records.administratorUserId,
      grantedPermissions: ["website.edit"],
    });
    assert.equal(crossDraft.ok, false, JSON.stringify(crossDraft));
    assert.ok(
      ["media_not_found", "tenant_mismatch", "forbidden"].includes(crossDraft.code),
      JSON.stringify(crossDraft)
    );
  });

  it("AC: library select → save → reopen draft → publish → public (no prior fallback)", async () => {
    requireDb();
    const stamp = uniq("acl");
    const provisioned = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Lib Clinic ${stamp}`,
      contactName: "Lib Admin",
      contactEmail: `${stamp}@aclib.example.test`,
      contactPhone: `+2609${String(Date.now()).slice(-8)}`,
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Library Avenue",
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
      reason: "v206_content_library_e2e",
    });

    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: provisioned.identityId,
      organizationId,
    });
    assert.equal(session.ok, true, JSON.stringify(session));
    let cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      log: () => {},
    });

    const mediaPage = await request(app)
      .get("/app/settings/website/media")
      .set("Host", AC_HOST)
      .set("Cookie", cookie);
    assertNoServerError(mediaPage, "AC Content Library / media");
    assert.equal(mediaPage.status, 200);
    cookie = cookieHeader(cookie, mediaPage);
    let csrf = extractCsrf(mediaPage);
    assert.ok(csrf, "AC CSRF");

    const oldUpload = await request(app)
      .post(`/clinics/${slug}/website/media`)
      .set("Host", AC_HOST)
      .set("Cookie", cookie)
      .field(CSRF_FIELD, csrf)
      .field("altText", `AC old ${stamp}`)
      .attach("file", TINY_PNG, {
        filename: `ac-old-${stamp}.png`,
        contentType: "image/png",
      });
    assert.equal(oldUpload.status, 200, oldUpload.text);
    const oldBody = JSON.parse(oldUpload.text);
    const oldId = oldBody.media.id;
    const oldSrc = `/clinics/${slug}/website/media/${oldId}`;
    assert.equal(
      (
        await contentService.saveWebsiteDraft(pool, {
          organizationId,
          instanceId: instance.id,
          expectedProductCode: PRODUCT_CODE.ACTIVECLINIC,
          contentKey: "home.logo",
          value: draftImageValue(oldId, oldSrc, `AC old ${stamp}`),
          actorIdentityId: provisioned.identityId,
          grantedPermissions: ["website.edit"],
        })
      ).ok,
      true
    );
    assert.equal(
      (
        await publicationService.publishWebsiteDraft(pool, {
          organizationId,
          instanceId: instance.id,
          expectedProductCode: PRODUCT_CODE.ACTIVECLINIC,
          actorIdentityId: provisioned.identityId,
          grantedPermissions: ["website.publish"],
        })
      ).ok,
      true
    );

    const newUpload = await request(app)
      .post(`/clinics/${slug}/website/media`)
      .set("Host", AC_HOST)
      .set("Cookie", cookie)
      .field(CSRF_FIELD, csrf)
      .field("altText", `AC new ${stamp}`)
      .attach("file", TINY_PNG_B, {
        filename: `ac-new-${stamp}.png`,
        contentType: "image/png",
      });
    assert.equal(newUpload.status, 200, newUpload.text);
    const newBody = JSON.parse(newUpload.text);
    const newId = newBody.media.id;
    const newSrc = `/clinics/${slug}/website/media/${newId}`;
    assert.notEqual(newId, oldId);

    const listJson = await request(app)
      .get(`/clinics/${slug}/website/media`)
      .set("Host", AC_HOST)
      .set("Cookie", cookie)
      .set("Accept", "application/json");
    assert.equal(listJson.status, 200);
    const listBody = typeof listJson.body === "object" && listJson.body.media
      ? listJson.body
      : JSON.parse(listJson.text);
    assert.ok(
      (listBody.media || []).some((m) => m.id === newId),
      "AC library JSON includes selected asset"
    );

    const draftSave = await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Host", AC_HOST)
      .set("Cookie", cookie)
      .set("Content-Type", "application/json")
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.logo",
        value: draftImageValue(newId, newSrc, `AC new ${stamp}`),
      });
    assertNoServerError(draftSave, "AC drafts save");
    assert.equal(draftSave.status, 200, draftSave.text);
    const draftBody = typeof draftSave.body === "object" && draftSave.body.ok != null
      ? draftSave.body
      : JSON.parse(draftSave.text);
    assert.equal(draftBody.ok, true, draftSave.text);

    const rows = await contentService.listWebsiteContent(pool, instance, organizationId);
    const logoRow = contentRowValue(rows, "home.logo");
    assert.equal(String((logoRow.draftValue || {}).mediaId || ""), newId);

    // Reopen public editor draft surface (clinic public shell with edit).
    const reopen = await request(app)
      .get(`/clinics/${slug}?website_edit=1&website_mode=draft`)
      .redirects(5)
      .set("Host", AC_HOST)
      .set("Cookie", cookie);
    assertNoServerError(reopen, "AC reopen draft");
    assert.equal(reopen.status, 200);
    assert.match(reopen.text, new RegExp(escapeRe(newId)));
    csrf = extractCsrf(reopen) || csrf;
    cookie = cookieHeader(cookie, reopen);

    const published = await request(app)
      .post(`/clinics/${slug}/website/publish`)
      .set("Host", AC_HOST)
      .set("Cookie", cookie)
      .set("Content-Type", "application/x-www-form-urlencoded")
      .set("X-CSRF-Token", csrf)
      .send(`${CSRF_FIELD}=${encodeURIComponent(csrf)}`);
    assertNoServerError(published, "AC publish");
    assert.ok([200, 303].includes(published.status), `AC publish ${published.status}`);
    if (published.status === 200) {
      const pubBody =
        typeof published.body === "object" && published.body.ok != null
          ? published.body
          : JSON.parse(published.text || "{}");
      if (pubBody && typeof pubBody.ok === "boolean") {
        assert.equal(pubBody.ok, true, published.text);
      }
    }

    const liveRows = await contentService.listWebsiteContent(pool, instance, organizationId);
    const liveLogo = contentRowValue(liveRows, "home.logo");
    assert.equal(String((liveLogo.publishedValue || {}).mediaId || ""), newId);
    assert.notEqual(String((liveLogo.publishedValue || {}).mediaId || ""), oldId);

    const publicDesktop = await request(app)
      .get(`/clinics/${slug}`)
      .set("Host", AC_HOST)
      .set(
        "User-Agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
      );
    assert.equal(publicDesktop.status, 200);
    assert.match(publicDesktop.text, new RegExp(escapeRe(newId)));
    assert.doesNotMatch(
      publicDesktop.text,
      new RegExp(`website/media/${escapeRe(oldId)}`)
    );

    const publicMobile = await request(app)
      .get(`/clinics/${slug}`)
      .set("Host", AC_HOST)
      .set(
        "User-Agent",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"
      );
    assert.equal(publicMobile.status, 200);
    assert.match(publicMobile.text, new RegExp(escapeRe(newId)));

    const other = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `Other Lib ${stamp}`,
      contactName: "Other Admin",
      contactEmail: `${uniq("aco")}@aclib.example.test`,
      contactPhone: `+2609${String(Date.now() + 3).slice(-8)}`,
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
    const otherInstance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: other.organizationId,
      productCode: PRODUCT_CODE.ACTIVECLINIC,
    });
    const otherMedia = await request(app)
      .get("/app/settings/website/media")
      .set("Host", AC_HOST)
      .set(
        "Cookie",
        `${COOKIE_ACTIVECLINIC_ORG}=${
          (
            await createPlatformIdentitySession(pool, {
              deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
              platformIdentityId: other.identityId,
              organizationId: other.organizationId,
            })
          ).rawToken
        }`
      );
    assert.equal(otherMedia.status, 200);
    assert.doesNotMatch(otherMedia.text, new RegExp(escapeRe(newId)));
    const crossDraft = await contentService.saveWebsiteDraft(pool, {
      organizationId: other.organizationId,
      instanceId: otherInstance.id,
      expectedProductCode: PRODUCT_CODE.ACTIVECLINIC,
      contentKey: "home.logo",
      value: draftImageValue(newId, newSrc, "stolen"),
      actorIdentityId: other.identityId,
      grantedPermissions: ["website.edit"],
    });
    assert.equal(crossDraft.ok, false, JSON.stringify(crossDraft));
    assert.ok(
      ["media_not_found", "tenant_mismatch", "forbidden"].includes(crossDraft.code),
      JSON.stringify(crossDraft)
    );
  });
});
