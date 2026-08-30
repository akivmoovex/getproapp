"use strict";

/**
 * V7 website image management: draft-only replace, tenant ownership,
 * type/size validation, unused-upload listing, and edit-mode pencils.
 * Reuses platform.website_media (ActiveClinic) and blessboard.media_assets
 * (BlessBoard). Does not introduce a second storage mechanism.
 */

const { describe, it, before, after } = require("node:test");
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
const resolver = require("../src/platform/website/resolver");
const mediaService = require("../src/platform/website/mediaService");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
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
  saveStructuredDraft,
} = require("../src/blessboard/services/websiteStructuredDraftService");
const mediaAssetsRepo = require("../src/blessboard/media/mediaAssetsRepository");
const { PUBLIC_MEDIA_PATH_PREFIX } = require("../src/blessboard/media/mediaConstants");
const { validateMediaFile } = require("../src/blessboard/media/validateMediaFile");

const ROOT = path.join(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "clinic-admin-pass-12";
const BB_PASSWORD = "correct-horse-battery-staple";
const HOST_A = "img-a.blessboard.org";
const HOST_B = "img-b.blessboard.org";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
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

describe("v7 website image management — source contract", () => {
  it("pencils and file inputs exist only in edit-mode branches", () => {
    const acImage = read("views/activeclinic/partials/website-editable-image.ejs");
    assert.match(acImage, /var canEdit = typeof websiteEdit !== 'undefined' && websiteEdit/);
    assert.match(acImage, /data-website-file="1"/);
    assert.match(acImage, /data-website-alt="1"/);
    assert.match(acImage, /data-website-save="1"/);
    assert.match(acImage, /data-website-cancel="1"/);
    assert.match(acImage, /capture="environment"/);
    const afterElse = acImage.slice(acImage.indexOf("<% } else { %>"));
    assert.doesNotMatch(afterElse, /data-website-file/);
    assert.doesNotMatch(afterElse, /data-website-start/);

    const bbBrand = read("views/blessboard/v5/public/partials/shell-brand.ejs");
    assert.match(bbBrand, /contentKey:\s*'home\.logo'/);
    assert.match(bbBrand, /_editing/);
    const bbImage = read("views/blessboard/v5/partials/editable-image.ejs");
    assert.match(bbImage, /data-website-file="1"/);
    assert.match(bbImage, /data-website-alt="1"/);
    const bbAfterElse = bbImage.slice(bbImage.indexOf("<% } else if (_src) { %>"));
    assert.doesNotMatch(bbAfterElse, /data-website-file/);

    const trigger = read("views/blessboard/v5/partials/structured-edit-trigger.ejs");
    assert.match(trigger, /_wa && _wa\.editingMode/);
    assert.match(trigger, /data-bb-structured-open="1"/);
    assert.doesNotMatch(trigger.slice(trigger.lastIndexOf("<% } %>")), /data-bb-structured-open/);
  });

  it("ActiveClinic client validates type/size, previews locally, restores on failure, and never publishes", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /function validateImageFile/);
    assert.match(js, /image\/jpeg/);
    assert.match(js, /5 \* 1024 \* 1024|data-website-max-bytes/);
    assert.match(js, /createObjectURL/);
    assert.match(js, /Preview only/);
    assert.match(js, /restore\(\)/);
    assert.match(js, /published === true/);
    assert.doesNotMatch(js, /website_mode=live.*POST|published:\s*true/);
    const chrome = read("views/activeclinic/partials/website-editor-chrome.ejs");
    assert.match(chrome, /data-website-max-bytes="5242880"/);
    assert.equal(mediaService.MAX_BYTES, 5242880);
  });

  it("BlessBoard client validates type/size, keeps previous image on failure, and saves drafts only", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(js, /function validateImageFile/);
    assert.match(js, /Previous image kept/);
    assert.match(js, /capture="environment"/);
    assert.match(js, /result\.data\.published/);
    const host = read("views/blessboard/v5/partials/structured-editor-host.ejs");
    assert.match(host, /data-bb-max-image-bytes="5242880"/);
    assert.match(host, /wa\.editingMode/);
    assert.match(host, /Save draft/);
  });
});

describe("v7 website image management — ActiveClinic", () => {
  let pool;
  let skipReason = null;
  let stamp = 0;
  let phoneSeq = 861000000;

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

  function requireDb() {
    if (skipReason) {
      // eslint-disable-next-line no-console
      console.log("skip:", skipReason);
      return false;
    }
    return true;
  }

  function clinicPayload() {
    stamp += 1;
    phoneSeq += 1;
    return {
      clinicName: `Img Clinic ${stamp}`,
      contactName: "Website Admin",
      contactEmail: `img-${stamp}@example.invalid`,
      contactPhone: `+2609${String(phoneSeq).slice(-8)}`,
      province: "Lusaka Province",
      city: "Lusaka",
      address: "1 Independence Avenue",
      countryCode: "ZM",
      notes: "image management",
      password: AC_PASSWORD,
      passwordConfirm: AC_PASSWORD,
      acceptTerms: "on",
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

  function makeApp() {
    return createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
  }

  async function seedLiveClinic() {
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    assert.equal(result.ok, true, JSON.stringify(result));
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
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
      reason: "image_mgmt_test",
    });
    assert.equal(availability.ok, true, JSON.stringify(availability));
    return { result, instance };
  }

  it("pencil and file input appear only in edit mode", async () => {
    if (!requireDb()) return;
    const { result } = await seedLiveClinic();
    const app = makeApp();
    const live = await request(app).get(`/clinics/${result.slug}`);
    assert.equal(live.status, 200);
    assert.doesNotMatch(live.text, /data-website-file="1"/);
    assert.doesNotMatch(live.text, /data-website-start="1"/);
    assert.doesNotMatch(live.text, /ac-website-editable__pencil/);

    const adminCookie = await sessionCookie(result.identityId, result.organizationId);
    const edit = await request(app)
      .get(`/clinics/${result.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", adminCookie);
    assert.equal(edit.status, 200);
    assert.match(edit.text, /data-website-key="home.hero.image"/);
    assert.match(edit.text, /data-website-file="1"/);
    assert.match(edit.text, /data-website-alt="1"/);
    assert.match(edit.text, /capture="environment"/);
    assert.match(edit.text, /data-website-key="home.logo"/);
  });

  it("upload + draft save is unpublished; live keeps the previous image", async () => {
    if (!requireDb()) return;
    const { result, instance } = await seedLiveClinic();
    const liveBefore = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    const liveHero = liveBefore.values["home.hero.image"];
    const liveSrc = liveHero && typeof liveHero === "object" ? liveHero.src : liveHero;

    const app = makeApp();
    const adminCookie = await sessionCookie(result.identityId, result.organizationId);
    const editPage = await request(app)
      .get(`/clinics/${result.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", adminCookie);
    const csrf = extractCsrf(editPage);
    const cookies = cookieHeader(adminCookie, editPage);

    const uploaded = await request(app)
      .post(`/clinics/${result.slug}/website/media`)
      .set("Cookie", cookies)
      .field(CSRF_FIELD, csrf)
      .field("altText", "Draft hero alt")
      .attach("file", jpegBuffer(64), { filename: "hero.jpg", contentType: "image/jpeg" });
    assert.equal(uploaded.status, 200, uploaded.text);
    const uploadedJson = JSON.parse(uploaded.text);
    assert.equal(uploadedJson.ok, true);
    assert.equal(uploadedJson.published, false);
    const mediaId = uploadedJson.media.id;

    const imageSave = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookies)
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.image",
        value: {
          alt: "Draft hero alt",
          mediaId,
          src: `/clinics/${result.slug}/website/media/${mediaId}`,
        },
      });
    assert.equal(imageSave.status, 200, imageSave.text);
    const saveBody = JSON.parse(imageSave.text);
    assert.equal(saveBody.ok, true);
    assert.equal(saveBody.published, false);

    const live = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    const afterHero = live.values["home.hero.image"];
    const afterSrc = afterHero && typeof afterHero === "object" ? afterHero.src : afterHero;
    const afterMediaId = afterHero && typeof afterHero === "object" ? afterHero.mediaId : null;
    assert.equal(afterSrc, liveSrc);
    assert.notEqual(afterMediaId, mediaId);

    const draft = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(draft.values["home.hero.image"].mediaId, mediaId);
    assert.equal(draft.values["home.hero.image"].alt, "Draft hero alt");
    assert.equal(
      draft.values["home.hero.image"].src,
      `/clinics/${result.slug}/website/media/${mediaId}`
    );

    const anonPage = await request(app).get(`/clinics/${result.slug}`);
    assert.equal(anonPage.status, 200);
    assert.doesNotMatch(anonPage.text, new RegExp(mediaId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const anonMedia = await request(app).get(`/clinics/${result.slug}/website/media/${mediaId}`);
    assert.equal(anonMedia.status, 404);

    const editorMedia = await request(app)
      .get(`/clinics/${result.slug}/website/media/${mediaId}`)
      .set("Cookie", cookies);
    assert.equal(editorMedia.status, 200);
  });

  it("logo edit saves draft only, publish updates public, restore brings the previous logo", async () => {
    if (!requireDb()) return;
    const { result, instance } = await seedLiveClinic();
    const app = makeApp();
    const adminCookie = await sessionCookie(result.identityId, result.organizationId);
    const editPage = await request(app)
      .get(`/clinics/${result.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", adminCookie);
    assert.match(editPage.text, /data-website-key="home.logo"/);
    const csrf = extractCsrf(editPage);
    const cookies = cookieHeader(adminCookie, editPage);

    const liveBefore = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    const liveLogoBefore = liveBefore.values["home.logo"];

    const uploaded = await request(app)
      .post(`/clinics/${result.slug}/website/media`)
      .set("Cookie", cookies)
      .field(CSRF_FIELD, csrf)
      .field("altText", "Draft clinic logo")
      .attach("file", jpegBuffer(48), { filename: "logo.jpg", contentType: "image/jpeg" });
    assert.equal(uploaded.status, 200, uploaded.text);
    const mediaId = JSON.parse(uploaded.text).media.id;

    const saved = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookies)
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.logo",
        value: {
          alt: "Draft clinic logo",
          mediaId,
          src: `/clinics/${result.slug}/website/media/${mediaId}`,
        },
      });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(JSON.parse(saved.text).published, false);

    const liveDraftOnly = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.deepEqual(liveDraftOnly.values["home.logo"], liveLogoBefore);

    const draft = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(draft.values["home.logo"].mediaId, mediaId);

    const preview = await request(app)
      .get(`/clinics/${result.slug}?website_mode=draft`)
      .set("Cookie", adminCookie);
    assert.equal(preview.status, 200);
    assert.match(preview.text, new RegExp(mediaId));

    const publicBefore = await request(app).get(`/clinics/${result.slug}`);
    assert.doesNotMatch(publicBefore.text, new RegExp(mediaId));

    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      actorIdentityId: result.identityId,
    });
    assert.equal(published.ok, true, JSON.stringify(published));

    const liveAfter = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveAfter.values["home.logo"].mediaId, mediaId);

    const publicAfter = await request(app).get(`/clinics/${result.slug}`);
    assert.match(publicAfter.text, new RegExp(mediaId));

    const afterFirst = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: result.organizationId,
    });
    const firstPublished = (afterFirst.versions || [])
      .slice()
      .sort((a, b) => Number(b.versionNumber) - Number(a.versionNumber))[0];
    assert.ok(firstPublished);

    const uploaded2 = await request(app)
      .post(`/clinics/${result.slug}/website/media`)
      .set("Cookie", cookies)
      .field(CSRF_FIELD, csrf)
      .field("altText", "Second clinic logo")
      .attach("file", jpegBuffer(52), { filename: "logo2.jpg", contentType: "image/jpeg" });
    const mediaId2 = JSON.parse(uploaded2.text).media.id;
    await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookies)
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.logo",
        value: { alt: "Second clinic logo", mediaId: mediaId2, src: `/clinics/${result.slug}/website/media/${mediaId2}` },
      });
    const published2 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      actorIdentityId: result.identityId,
    });
    assert.equal(published2.ok, true, JSON.stringify(published2));

    const restored = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      versionId: firstPublished.id,
      grantedPermissions: ["website.rollback", "website.restore"],
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    const liveRestored = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    const restoredLogo = liveRestored.values["home.logo"];
    assert.ok(restoredLogo);
    if (restoredLogo && restoredLogo.mediaId) {
      assert.notEqual(restoredLogo.mediaId, mediaId2);
    }
  });

  it("rejects unsafe types, oversized files, MIME lies, and cross-tenant media", async () => {
    if (!requireDb()) return;
    const a = await seedLiveClinic();
    const b = await seedLiveClinic();
    const jpeg = await mediaService.registerWebsiteMedia(pool, {
      organizationId: a.result.organizationId,
      instanceId: a.instance.id,
      mediaKind: "image",
      originalFilename: "hero.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer(48),
      altText: "Owned",
    });
    assert.equal(jpeg.ok, true, JSON.stringify(jpeg));

    const svg = await mediaService.registerWebsiteMedia(pool, {
      organizationId: a.result.organizationId,
      instanceId: a.instance.id,
      mediaKind: "image",
      originalFilename: "x.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
    });
    assert.equal(svg.ok, false);
    assert.equal(svg.code, "unsafe_media_type");

    const html = await mediaService.registerWebsiteMedia(pool, {
      organizationId: a.result.organizationId,
      instanceId: a.instance.id,
      mediaKind: "image",
      originalFilename: "x.html",
      mimeType: "text/html",
      buffer: Buffer.from("<html><body>nope</body></html>"),
    });
    assert.equal(html.ok, false);

    const huge = await mediaService.registerWebsiteMedia(pool, {
      organizationId: a.result.organizationId,
      instanceId: a.instance.id,
      mediaKind: "image",
      originalFilename: "big.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer(mediaService.MAX_BYTES + 20),
    });
    assert.equal(huge.ok, false);
    assert.equal(huge.code, "media_too_large");

    const lie = await mediaService.registerWebsiteMedia(pool, {
      organizationId: a.result.organizationId,
      instanceId: a.instance.id,
      mediaKind: "image",
      originalFilename: "not.png",
      mimeType: "image/png",
      buffer: jpegBuffer(40),
    });
    assert.equal(lie.ok, false);

    const crossGet = await mediaService.getWebsiteMedia(pool, {
      organizationId: b.result.organizationId,
      mediaId: jpeg.media.id,
    });
    assert.equal(crossGet.ok, false);

    const crossSave = await contentService.saveWebsiteDraft(pool, {
      organizationId: b.result.organizationId,
      instanceId: b.instance.id,
      contentKey: "home.hero.image",
      value: {
        alt: "stolen",
        mediaId: jpeg.media.id,
        src: `/clinics/${a.result.slug}/website/media/${jpeg.media.id}`,
      },
    });
    assert.equal(crossSave.ok, false);
    assert.ok(crossSave.code === "media_not_found" || crossSave.code === "tenant_mismatch");

    const app = makeApp();
    const bCookie = await sessionCookie(b.result.identityId, b.result.organizationId);
    const bEdit = await request(app)
      .get(`/clinics/${b.result.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", bCookie);
    const csrf = extractCsrf(bEdit);
    const cookies = cookieHeader(bCookie, bEdit);

    const crossHttp = await request(app)
      .post(`/clinics/${b.result.slug}/website/drafts`)
      .set("Cookie", cookies)
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.image",
        value: {
          alt: "stolen",
          mediaId: jpeg.media.id,
          src: `/clinics/${a.result.slug}/website/media/${jpeg.media.id}`,
        },
      });
    assert.equal(crossHttp.status, 404);

    const crossFetch = await request(app)
      .get(`/clinics/${b.result.slug}/website/media/${jpeg.media.id}`)
      .set("Cookie", cookies);
    assert.equal(crossFetch.status, 404);

    const aPathFromB = await request(app)
      .get(`/clinics/${a.result.slug}/website/media/${jpeg.media.id}`)
      .set("Cookie", cookies);
    assert.equal(aPathFromB.status, 404);

    const svgUpload = await request(app)
      .post(`/clinics/${b.result.slug}/website/media`)
      .set("Cookie", cookies)
      .field(CSRF_FIELD, csrf)
      .attach("file", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), {
        filename: "x.svg",
        contentType: "image/svg+xml",
      });
    assert.equal(svgUpload.status, 400);
    assert.equal(JSON.parse(svgUpload.text).code, "unsafe_media_type");
  });

  it("lists unused uploads for manual review and blocks archive of published-in-use media", async () => {
    if (!requireDb()) return;
    const { result, instance } = await seedLiveClinic();
    const unused = await mediaService.registerWebsiteMedia(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      mediaKind: "image",
      originalFilename: "orphan.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer(32),
    });
    assert.equal(unused.ok, true, JSON.stringify(unused));
    const orphans = await mediaService.listOrphanCandidates(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
    });
    assert.equal(orphans.autoDelete, false);
    assert.equal(orphans.strategy, "manual_review");
    assert.ok(orphans.media.some((row) => row.id === unused.media.id));

    const archived = await mediaService.archiveWebsiteMedia(pool, {
      organizationId: result.organizationId,
      mediaId: unused.media.id,
    });
    assert.equal(archived.ok, true);

    const used = await mediaService.registerWebsiteMedia(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      mediaKind: "image",
      originalFilename: "live.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer(36),
    });
    assert.equal(used.ok, true);
    const saved = await contentService.saveWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      contentKey: "home.hero.image",
      value: {
        alt: "Published later",
        mediaId: used.media.id,
      },
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      allowEmpty: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const blocked = await mediaService.archiveWebsiteMedia(pool, {
      organizationId: result.organizationId,
      mediaId: used.media.id,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "media_in_use_published");
  });
});

describe("v7 website image management — BlessBoard", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let users = {};
  let app;

  function baseEnv(overrides) {
    return {
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
      SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
      SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
      BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
      BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
      BLESSBOARD_MEDIA_FORCE_LOCAL: "1",
      BLESSBOARD_MEDIA_UPLOADS_ENABLED: "1",
      ...overrides,
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

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "img-a",
        displayName: "Img A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "img-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "img-a",
        churchKey: "img-a",
        displayName: "Img Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "img-b",
        displayName: "Img B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "img-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "img-b",
        churchKey: "img-b",
        displayName: "Img Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        websiteStatus: "published",
        publicName: "Img Church A",
      });
      await provisionEmptyPublicPages(pool, { churchId: churchA.id, branchId: null });
      const home = await pool.query(
        `SELECT id FROM blessboard.public_pages
          WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
        [churchA.id]
      );
      await updatePublicPage(pool, home.rows[0].id, { status: "published" });
      await createPageSection(pool, {
        pageId: home.rows[0].id,
        sectionKey: "hero",
        sectionType: "hero",
        heading: "Published Welcome",
        bodyText: "Published body",
        status: "published",
        sortOrder: 0,
      });

      async function makeUser(email, displayName, role, organizationId) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: BB_PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        if (role) assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser(
        "img-hq-a@example.test",
        "HQ A",
        {
          email: "img-hq-a@example.test",
          organizationKey: "img-a",
          roleKey: "church_hq_admin",
          churchKey: "img-a",
        },
        orgA.records.organization.id
      );
      users.hqB = await makeUser(
        "img-hq-b@example.test",
        "HQ B",
        {
          email: "img-hq-b@example.test",
          organizationKey: "img-b",
          roleKey: "church_hq_admin",
          churchKey: "img-b",
        },
        orgB.records.organization.id
      );

      app = createV5FoundationApp({ getPool: () => pool, env: baseEnv() });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded() {
    if (skipSuite) {
      // eslint-disable-next-line no-console
      console.log(`skip: ${skipReason}`);
      return true;
    }
    return false;
  }

  it("structured image save is draft-only; live visitors keep the published image", async () => {
    if (skipIfNeeded()) return;
    const saved = await saveStructuredDraft(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      branchId: null,
      editorUserId: users.hqA.user.id,
      draftKind: "image",
      pageKey: "home",
      sectionKey: "hero",
      entityKey: "home-hero-img-mgmt",
      payload: {
        imageUrl: "/church/images/tenant-public/home-desktop-hero.jpg",
        altText: "Draft only hero alt",
      },
    });
    assert.equal(saved.published, false);
    assert.equal(saved.saved, true);

    const publicRes = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(publicRes.text, /data-bb-structured-open/);
    assert.doesNotMatch(publicRes.text, /Draft only hero alt/);

    const editRes = await request(app)
      .get("/?website_edit=1")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`)
      .expect(200);
    assert.match(editRes.text, /data-bb-structured-open/);
    assert.match(editRes.text, /data-bb-kind="image"/);
  });

  it("rejects cross-tenant media paths without leaking ownership", async () => {
    if (skipIfNeeded()) return;
    const assetA = await mediaAssetsRepo.insertMediaAsset(pool, {
      churchId: churchA.id,
      uploadedByUserId: users.hqA.user.id,
      storageBucket: "blessboard-public",
      storageKey: `img-mgmt/${crypto.randomUUID()}.png`,
      originalFilename: "hero.png",
      mimeType: "image/png",
      sizeBytes: 12,
      sha256: crypto.createHash("sha256").update("img-mgmt-a").digest("hex"),
      visibility: "public",
    });
    const pathA = `${PUBLIC_MEDIA_PATH_PREFIX}${assetA.id}`;

    const okA = await saveStructuredDraft(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      editorUserId: users.hqA.user.id,
      draftKind: "image",
      pageKey: "home",
      sectionKey: "hero",
      entityKey: "owned-media",
      payload: { imageUrl: pathA, altText: "Owned hero" },
    });
    assert.equal(okA.published, false);

    await assert.rejects(
      () =>
        saveStructuredDraft(pool, {
          organizationId: orgB.records.organization.id,
          churchId: churchB.id,
          editorUserId: users.hqB.user.id,
          draftKind: "image",
          pageKey: "home",
          sectionKey: "hero",
          entityKey: "stolen-media",
          payload: { imageUrl: pathA, altText: "Stolen hero" },
        }),
      (err) => err && err.status === 404 && err.code === "NOT_FOUND"
    );

    const csrf = issueCsrfToken(baseEnv());
    const stolenHttp = await request(app)
      .post("/hq/content/api/structured-draft")
      .set("Host", HOST_B)
      .set(
        "Cookie",
        cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqB.rawToken}`, `${CSRF_COOKIE}=${csrf}`)
      )
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        draftKind: "image",
        pageKey: "home",
        sectionKey: "hero",
        entityKey: "stolen-http",
        payload: { imageUrl: pathA, altText: "Stolen hero" },
      });
    assert.ok(stolenHttp.status === 404 || stolenHttp.status === 403, stolenHttp.text);
    assert.equal(stolenHttp.body.ok, false);
  });

  it("rejects invalid file types and oversized images at the existing media validator", () => {
    if (skipIfNeeded()) return;
    const svg = validateMediaFile({
      buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
      originalFilename: "x.svg",
      claimedMime: "image/svg+xml",
    });
    assert.equal(svg.ok, false);
    const huge = validateMediaFile({
      buffer: jpegBuffer(5 * 1024 * 1024 + 40),
      originalFilename: "big.jpg",
      claimedMime: "image/jpeg",
    });
    assert.equal(huge.ok, false);
  });
});
