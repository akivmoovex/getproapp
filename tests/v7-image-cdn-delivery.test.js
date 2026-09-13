"use strict";

/**
 * V7 CDN-only website image delivery — presentation, isolation, forbidden srcs.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const {
  presentCdnUrl,
  presentRuntimeImageSrc,
  presentImageValue,
  resolveCdnPublicBaseUrl,
  isForbiddenRuntimeImageSrc,
  cdnMarketingAsset,
} = require("../src/platform/media/cdnMediaPresentation");
const {
  storageKeyForPublicPath,
} = require("../src/platform/media/platformMarketingAssets");
const mediaService = require("../src/platform/website/mediaService");
const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionWebsiteInstance } = require("../src/platform/website/provisionService");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const {
  registerBlessBoardWebsiteTemplate,
  BLESSBOARD_TEMPLATE_ID,
  BLESSBOARD_TEMPLATE_VERSION,
} = require("../src/blessboard/website/blessboardChurchTemplate");
const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const { PROVIDER_HOSTINGER } = require("../src/platform/media/hostingerMediaConfig");
const contentService = require("../src/platform/website/contentService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../src/platform/config/deploymentProfiles");

const CDN_BASE = "https://cdn.test.invalid/media";

function jpegBuffer(size) {
  const buf = Buffer.alloc(Math.max(size, 16));
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xd9;
  return buf;
}

function mediaEnv(root) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    MEDIA_STORAGE_ROOT: root,
    MEDIA_PUBLIC_BASE_URL: CDN_BASE,
    MEDIA_PUBLIC_MOUNT_PATH: "/media",
  };
}

function assertNoForbiddenWebsiteSrc(src) {
  if (src == null || src === "") return;
  const text = String(src);
  assert.doesNotMatch(text, /^\/media\//);
  assert.doesNotMatch(text, /\/church\/images\//);
  assert.doesNotMatch(text, /\/activeclinic\/assets\//);
  assert.doesNotMatch(text, /^data:image/i);
}

describe("v7 image CDN delivery presentation", () => {
  it("resolves absolute CDN base and storage keys", () => {
    const env = { MEDIA_PUBLIC_BASE_URL: CDN_BASE, DEPLOYMENT_ENV: "testing" };
    assert.equal(resolveCdnPublicBaseUrl(env), CDN_BASE);
    const key = "testing/blessboard/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg";
    assert.equal(presentCdnUrl(key, env), `${CDN_BASE}/${key}`);
  });

  it("falls back to documented testing CDN base on moovex-platform-testing", () => {
    const env = {
      DEPLOYMENT_ENV: "testing",
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    };
    assert.equal(resolveCdnPublicBaseUrl(env), "https://blessboard.pronline.org/media");
  });

  it("does not invent a CDN base outside testing Hostinger profile", () => {
    assert.equal(resolveCdnPublicBaseUrl({ DEPLOYMENT_ENV: "production" }), null);
    assert.equal(resolveCdnPublicBaseUrl({ DEPLOYMENT_ENV: "testing" }), null);
  });

  it("presentImageTree tolerates circular object graphs", () => {
    const env = { MEDIA_PUBLIC_BASE_URL: CDN_BASE, DEPLOYMENT_ENV: "testing" };
    const { presentImageTree } = require("../src/platform/media/cdnMediaPresentation");
    const circular = { home: { hero: { image: { src: "/media/testing/x.jpg", alt: "a" } } } };
    circular.self = circular;
    const out = presentImageTree(circular, env);
    assert.equal(out.self, null);
    assert.match(out.home.hero.image.src, /^https:\/\/cdn\.test\.invalid\/media\//);
  });

  it("rewrites legacy /media keys and drops forbidden tenant locals", () => {
    const env = { MEDIA_PUBLIC_BASE_URL: CDN_BASE, DEPLOYMENT_ENV: "testing" };
    const key = "testing/activeclinic/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp";
    assert.equal(
      presentRuntimeImageSrc(`/media/${key}`, env),
      `${CDN_BASE}/${key}`
    );
    assert.equal(
      presentRuntimeImageSrc(`https://other.example/media/${key}`, env),
      `${CDN_BASE}/${key}`
    );
    assert.match(
      presentRuntimeImageSrc("/church/images/tenant-public/home-desktop-hero.jpg", env),
      /^https:\/\/cdn\.test\.invalid\/media\/testing\/platform\/blessboard\/demo\//
    );
    assert.equal(presentRuntimeImageSrc("/church/images/member/avatar-member.jpg", env), null);
    assert.equal(presentRuntimeImageSrc("/activeclinic/assets/not-a-mapped-asset.jpg", env), null);
    assert.equal(presentRuntimeImageSrc("data:image/png;base64,aaa", env), null);
    assert.equal(isForbiddenRuntimeImageSrc("/media/testing/x/y.jpg"), true);
  });

  it("maps platform marketing assets to CDN keys", () => {
    const env = { MEDIA_PUBLIC_BASE_URL: CDN_BASE, DEPLOYMENT_ENV: "testing" };
    const publicPath = "/church/images/homepage/desktop-hero-auditorium.jpg";
    const key = storageKeyForPublicPath(publicPath, env);
    assert.match(key, /^testing\/platform\/blessboard\/homepage\//);
    const url = cdnMarketingAsset(publicPath, env);
    assert.equal(url, `${CDN_BASE}/${key}`);
    assertNoForbiddenWebsiteSrc(url);
  });
});

describe("v7 image CDN delivery upload + isolation", () => {
  let pool;
  let mediaRoot;
  let skipReason = "";

  async function seedBlessBoard(stamp) {
    registerBlessBoardWebsiteTemplate();
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `bbcdn_${stamp}`,
      displayName: "BB CDN Org",
      productKey: "blessboard",
      productTenantKey: `bbcdn-${stamp}`,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const provisioned = await provisionWebsiteInstance(pool, {
      organizationId: org.records.organization.id,
      templateId: BLESSBOARD_TEMPLATE_ID,
      templateVersion: BLESSBOARD_TEMPLATE_VERSION,
      slug: `bbcdn-${stamp}`,
      status: "coming_soon",
    });
    assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
    return { organizationId: org.records.organization.id, instance: provisioned.instance };
  }

  async function seedActiveClinic(stamp) {
    registerActiveClinicWebsiteTemplate();
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `accdn_${stamp}`,
      displayName: "AC CDN Clinic",
      productKey: "activeclinic",
      productTenantKey: `accdn-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const provisioned = await provisionWebsiteInstance(pool, {
      organizationId: org.records.organization.id,
      templateId: ACTIVECLINIC_TEMPLATE_ID,
      templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
      slug: `accdn-${stamp}`,
      status: "coming_soon",
    });
    assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
    return { organizationId: org.records.organization.id, instance: provisioned.instance };
  }

  before(async () => {
    mediaRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "gp-cdn-media-"));
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 200) : "db unavailable";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
    if (mediaRoot) await fsp.rm(mediaRoot, { recursive: true, force: true }).catch(() => {});
  });

  it("BlessBoard + ActiveClinic uploads present CDN URLs and stay isolated", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const env = mediaEnv(mediaRoot);
    const stamp = Date.now().toString(36);
    const bb = await seedBlessBoard(stamp);
    const ac = await seedActiveClinic(`${stamp}a`);

    const bbUpload = await mediaService.registerWebsiteMedia(pool, {
      organizationId: bb.organizationId,
      instanceId: bb.instance.id,
      expectedProductCode: PRODUCT_CODE.BLESSBOARD,
      mediaKind: "image",
      originalFilename: "hero.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer(1200),
      env,
    });
    assert.equal(bbUpload.ok, true, JSON.stringify(bbUpload));
    assert.equal(bbUpload.media.storageProvider, PROVIDER_HOSTINGER);
    const bbPresented = mediaService.presentWebsiteMediaForClient(bb.instance, bbUpload.media, env);
    assert.match(bbPresented.publicSrc, new RegExp(`^${CDN_BASE}/testing/blessboard/`));
    assertNoForbiddenWebsiteSrc(bbPresented.publicSrc);
    assert.equal(fs.existsSync(path.join(mediaRoot, ...bbUpload.media.storageKey.split("/"))), true);

    const acUpload = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ac.organizationId,
      instanceId: ac.instance.id,
      expectedProductCode: PRODUCT_CODE.ACTIVECLINIC,
      mediaKind: "image",
      originalFilename: "clinic.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer(900),
      env,
    });
    assert.equal(acUpload.ok, true, JSON.stringify(acUpload));
    const acPresented = mediaService.presentWebsiteMediaForClient(ac.instance, acUpload.media, env);
    assert.match(acPresented.publicSrc, new RegExp(`^${CDN_BASE}/testing/activeclinic/`));
    assertNoForbiddenWebsiteSrc(acPresented.publicSrc);

    const cross = await mediaService.assertOwnedWebsiteImageValue(pool, {
      organizationId: ac.organizationId,
      instance: ac.instance,
      env,
      value: {
        mediaId: bbUpload.media.id,
        src: bbPresented.publicSrc,
        alt: "x",
      },
    });
    assert.equal(cross.ok, false);
    assert.ok(cross.code === "tenant_mismatch" || cross.code === "media_not_found");

    const owned = await mediaService.assertOwnedWebsiteImageValue(pool, {
      organizationId: bb.organizationId,
      instance: bb.instance,
      env,
      value: { mediaId: bbUpload.media.id, alt: "Hero" },
    });
    assert.equal(owned.ok, true, JSON.stringify(owned));
    assert.match(owned.value.src, new RegExp(`^${CDN_BASE}/`));
    assertNoForbiddenWebsiteSrc(owned.value.src);

    const saved = await contentService.saveWebsiteDraft(pool, {
      organizationId: bb.organizationId,
      instanceId: bb.instance.id,
      contentKey: "home.hero.image",
      value: owned.value,
      grantedPermissions: ["website.edit"],
      actorIdentityId: null,
      env,
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    const presentedValue = presentImageValue(owned.value, env);
    assert.match(presentedValue.src, new RegExp(`^${CDN_BASE}/`));
    assertNoForbiddenWebsiteSrc(presentedValue.src);
  });
});
