"use strict";

/**
 * Hostinger public website media storage — namespace, upload, URL, fallback, guards.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const request = require("supertest");

const {
  buildHostingerStorageKey,
  assertStorageKeyWritable,
  resolveHostingerMediaConfig,
  buildPublicMediaUrl,
  PROVIDER_HOSTINGER,
  PROVIDER_DATABASE,
} = require("../src/platform/media/hostingerMediaConfig");
const { createHostingerMediaStorage } = require("../src/platform/media/hostingerMediaStorage");
const mediaService = require("../src/platform/website/mediaService");
const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionWebsiteInstance } = require("../src/platform/website/provisionService");
const {
  createV5FoundationApp,
} = require("../src/platform/http/v5FoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../src/platform/config/deploymentProfiles");
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

function jpegBuffer(size) {
  const buf = Buffer.alloc(Math.max(size, 16));
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xd9;
  return buf;
}

function pngBuffer() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

describe("v7 hostinger media storage — config guards", () => {
  it("builds testing namespace keys with immutable media ids", () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const mediaId = "22222222-2222-4222-8222-222222222222";
    const key = buildHostingerStorageKey({
      environment: "testing",
      productCode: "blessboard",
      organizationId: orgId,
      mediaId,
      mimeType: "image/webp",
    });
    assert.equal(key, `testing/blessboard/${orgId}/${mediaId}.webp`);
    assert.doesNotMatch(key, /hero|user|upload/i);
  });

  it("testing runtime refuses production/ writes", () => {
    assert.throws(
      () => assertStorageKeyWritable("testing", "production/blessboard/x/y.jpg"),
      (err) => err && err.code === "REFUSED_PRODUCTION_MEDIA_NAMESPACE"
    );
  });

  it("builds public URLs without exposing filesystem roots", () => {
    const cfg = {
      publicBaseUrl: "https://blessboard.pronline.org/media",
      publicMountPath: "/media",
    };
    const url = buildPublicMediaUrl(
      "testing/activeclinic/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg",
      cfg
    );
    assert.equal(
      url,
      "https://blessboard.pronline.org/media/testing/activeclinic/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg"
    );
    assert.doesNotMatch(url, /\/home\/|MEDIA_STORAGE_ROOT|\\\\/);
  });

  it("storeMedia refuses production namespace under testing env", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "gp-media-"));
    const storage = createHostingerMediaStorage({
      DEPLOYMENT_ENV: "testing",
      MEDIA_STORAGE_ROOT: root,
      MEDIA_PUBLIC_BASE_URL: "https://cdn.test.invalid/media",
    });
    await assert.rejects(
      () =>
        storage.storeMedia({
          productCode: "blessboard",
          organizationId: "11111111-1111-4111-8111-111111111111",
          mediaId: "22222222-2222-4222-8222-222222222222",
          mimeType: "image/jpeg",
          buffer: jpegBuffer(32),
          storageKey:
            "production/blessboard/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg",
        }),
      (err) => err && err.code === "REFUSED_PRODUCTION_MEDIA_NAMESPACE"
    );
    await fsp.rm(root, { recursive: true, force: true });
  });
});

describe("v7 hostinger media storage — HTTP + metadata", () => {
  let pool;
  let skipReason = null;
  let mediaRoot;
  let bbApp;

  const mediaEnv = () => ({
    DEPLOYMENT_ENV: "testing",
    MEDIA_STORAGE_ROOT: mediaRoot,
    MEDIA_PUBLIC_BASE_URL: "https://cdn.test.invalid/media",
  });

  async function seedBlessBoard(stamp) {
    registerBlessBoardWebsiteTemplate();
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `bbmed_${stamp}`,
      displayName: "BB Media Org",
      productKey: "blessboard",
      productTenantKey: `bbmed-${stamp}`,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const provisioned = await provisionWebsiteInstance(pool, {
      organizationId: org.records.organization.id,
      templateId: BLESSBOARD_TEMPLATE_ID,
      templateVersion: BLESSBOARD_TEMPLATE_VERSION,
      slug: `bbmed-${stamp}`,
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
      organizationKey: `acmed_${stamp}`,
      displayName: "AC Media Clinic",
      productKey: "activeclinic",
      productTenantKey: `acmed-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const provisioned = await provisionWebsiteInstance(pool, {
      organizationId: org.records.organization.id,
      templateId: ACTIVECLINIC_TEMPLATE_ID,
      templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
      slug: `acmed-${stamp}`,
      status: "coming_soon",
    });
    assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
    return { organizationId: org.records.organization.id, instance: provisioned.instance };
  }

  before(async () => {
    mediaRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "gp-media-http-"));
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      bbApp = createV5FoundationApp({
        getPool: () => pool,
        env: {
          NODE_ENV: "test",
          DEPLOYMENT_ENV: "testing",
          MEDIA_STORAGE_ROOT: mediaRoot,
          MEDIA_PUBLIC_BASE_URL: "https://cdn.test.invalid/media",
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        },
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 200) : "db unavailable";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
    if (mediaRoot) await fsp.rm(mediaRoot, { recursive: true, force: true }).catch(() => {});
  });

  it("BlessBoard upload stores Hostinger file + metadata without payload_bytes", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const ctx = await seedBlessBoard(Date.now().toString(36));
    const uploaded = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      expectedProductCode: PRODUCT_CODE.BLESSBOARD,
      mediaKind: "image",
      originalFilename: "Pastor Photo.JPG",
      mimeType: "image/jpeg",
      buffer: jpegBuffer(2400),
      env: mediaEnv(),
    });
    assert.equal(uploaded.ok, true, JSON.stringify(uploaded));
    assert.equal(uploaded.media.storageProvider, PROVIDER_HOSTINGER);
    assert.match(uploaded.media.storageKey, /^testing\/blessboard\//);
    assert.match(uploaded.media.storageKey, /\.jpg$/);
    assert.doesNotMatch(uploaded.media.storageKey, /Pastor/i);
    const presented = mediaService.presentWebsiteMediaForClient(
      ctx.instance,
      uploaded.media,
      mediaEnv()
    );
    assert.match(presented.publicSrc, /^https:\/\/cdn\.test\.invalid\/media\/testing\/blessboard\//);
    assert.equal(presented.previewUrl, presented.publicSrc);
    const abs = path.join(mediaRoot, ...uploaded.media.storageKey.split("/"));
    assert.equal(fs.existsSync(abs), true);
    const row = await pool.query(
      `SELECT storage_provider, payload_bytes IS NOT NULL AS has_payload
         FROM platform.website_media WHERE id = $1`,
      [uploaded.media.id]
    );
    assert.equal(row.rows[0].storage_provider, PROVIDER_HOSTINGER);
    assert.equal(row.rows[0].has_payload, false);
    const staticRes = await request(bbApp).get(`/media/${uploaded.media.storageKey}`);
    assert.equal(staticRes.status, 200);
    assert.match(String(staticRes.headers["content-type"] || ""), /image\/jpeg/);
  });

  it("ActiveClinic upload uses testing/activeclinic namespace", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const ctx = await seedActiveClinic(Date.now().toString(36));
    const uploaded = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      expectedProductCode: PRODUCT_CODE.ACTIVECLINIC,
      mediaKind: "image",
      originalFilename: "doctor.png",
      mimeType: "image/png",
      buffer: pngBuffer(),
      env: mediaEnv(),
    });
    assert.equal(uploaded.ok, true, JSON.stringify(uploaded));
    assert.equal(uploaded.media.storageProvider, PROVIDER_HOSTINGER);
    assert.match(uploaded.media.storageKey, /^testing\/activeclinic\//);
    assert.match(uploaded.media.storageKey, /\.png$/);
  });

  it("rejects invalid MIME and keeps old database media deliverable", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const ctx = await seedBlessBoard(`lg${Date.now().toString(36)}`);

    const bad = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      mediaKind: "image",
      originalFilename: "x.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg></svg>"),
      env: mediaEnv(),
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "unsafe_media_type");

    const legacy = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      mediaKind: "image",
      originalFilename: "legacy.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer(800),
      env: { DEPLOYMENT_ENV: "testing" },
    });
    assert.equal(legacy.ok, true, JSON.stringify(legacy));
    assert.equal(legacy.media.storageProvider, PROVIDER_DATABASE);
    const payload = await mediaService.getWebsiteMediaPayload(pool, {
      mediaId: legacy.media.id,
      organizationId: ctx.organizationId,
    });
    assert.equal(payload.ok, true);
    assert.ok(payload.buffer && payload.buffer.length > 0);
    const presented = mediaService.presentWebsiteMediaForClient(ctx.instance, legacy.media);
    // Legacy database-payload media has no CDN object — keep the tenant app
    // delivery path so draft save / editor preview / published HTML still work.
    assert.match(
      String(presented.publicSrc || ""),
      new RegExp(`^/c/${ctx.instance.slug}/website/media/${legacy.media.id}$`)
    );
  });

  it("testing + explicit MEDIA_STORAGE_ROOT: env wins over account-home fallback", () => {
    const cfg = resolveHostingerMediaConfig(
      {
        PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
        DEPLOYMENT_ENV: "testing",
        MEDIA_STORAGE_ROOT: mediaRoot,
      },
      { homedir: () => "/home/other-user" }
    );
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.storageRoot, path.resolve(mediaRoot));
    assert.equal(cfg.mediaStorageRootSource, "env");
    assert.equal(cfg.mediaStorageRootConfigured, true);
  });

  it("testing + no env: prefers /home/<user>/moovex-media from cwd over os.homedir domain path", async () => {
    const home = await fsp.mkdtemp(path.join(os.tmpdir(), "gp-media-home-"));
    // Simulate Hostinger: cwd under /home/<user>/domains/... while os.homedir is domain dir.
    // Use real /home-style path only when available; otherwise verify cwd-home join via opts.
    const fakeUserHome = path.join(home, "homeuser");
    await fsp.mkdir(path.join(fakeUserHome, "domains", "pronline.org", "hbuilds", "versions", "rel1", "nodejs"), {
      recursive: true,
    });
    const cfg = resolveHostingerMediaConfig(
      {
        PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
        DEPLOYMENT_ENV: "testing",
      },
      {
        cwd: path.join(fakeUserHome, "domains", "pronline.org", "hbuilds", "versions", "rel1", "nodejs"),
        // Would wrongly point at domain home if used alone:
        homedir: () => path.join(fakeUserHome, "domains", "pronline.org"),
      }
    );
    // When cwd is not under /home/<user>, regex won't match — fall back to homedir.
    // Force /home/ style by stubbing cwd match: use a path that starts with /home/
    const cfg2 = resolveHostingerMediaConfig(
      {
        PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
        DEPLOYMENT_ENV: "testing",
      },
      {
        cwd: "/home/u549637099/domains/pronline.org/hbuilds/versions/rel1/nodejs",
        homedir: () => "/home/u549637099/domains/pronline.org",
        ensureWritable: (abs) => abs === "/home/u549637099/moovex-media",
      }
    );
    assert.equal(cfg2.enabled, true);
    assert.equal(cfg2.storageRoot, "/home/u549637099/moovex-media");
    assert.equal(cfg2.mediaStorageRootSource, "testing_account_home_fallback");
    assert.equal(cfg2.mediaStorageRootConfigured, false);
    await fsp.rm(home, { recursive: true, force: true });
    void cfg;
  });

  it("rejects derived root under hbuilds/versions", () => {
    const cfg = resolveHostingerMediaConfig(
      {
        PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
        DEPLOYMENT_ENV: "testing",
      },
      {
        // No /home/<user> prefix → fall back to os.homedir() which points into release tree.
        cwd: "/var/app/nodejs",
        homedir: () => "/home/u549637099/hbuilds/versions/abc/nodejs",
        ensureWritable: () => true,
      }
    );
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.rejectionCode, "MEDIA_STORAGE_ROOT_NOT_PERSISTENT");
    assert.equal(cfg.mediaStorageRootSource, "disabled");
  });

  it("unwritable derived root falls back to database provider", () => {
    const cfg = resolveHostingerMediaConfig(
      {
        PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
        DEPLOYMENT_ENV: "testing",
      },
      {
        cwd: "/home/u549637099/hbuilds/versions/abc/nodejs",
        homedir: () => "/home/u549637099",
        ensureWritable: () => false,
      }
    );
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.provider, PROVIDER_DATABASE);
    assert.equal(cfg.rejectionCode, "MEDIA_STORAGE_ROOT_NOT_WRITABLE");
    assert.equal(cfg.mediaStorageRootSource, "disabled");
    assert.equal(cfg.mediaStorageRootConfigured, false);
  });

  it("production + no env does not auto-enable filesystem media", () => {
    const cfg = resolveHostingerMediaConfig(
      {
        PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
        DEPLOYMENT_ENV: "production",
      },
      { homedir: () => "/home/u549637099", ensureWritable: () => true }
    );
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.storageRoot, null);
    assert.equal(cfg.mediaStorageRootSource, "disabled");
    assert.equal(cfg.rejectionCode, "MEDIA_STORAGE_ROOT_UNSET");
  });

  it("rejects MEDIA_STORAGE_ROOT inside hbuilds/versions", () => {
    const ephemeral = "/home/u549637099/hbuilds/versions/abc123/nodejs/media";
    const cfg = resolveHostingerMediaConfig({
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
      DEPLOYMENT_ENV: "testing",
      MEDIA_STORAGE_ROOT: ephemeral,
    });
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.rejectionCode, "MEDIA_STORAGE_ROOT_NOT_PERSISTENT");
    assert.equal(cfg.rejectionReason, "hbuilds_versions");
  });

  it("production namespace guard remains active under testing", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "gp-media-"));
    const storage = createHostingerMediaStorage({
      DEPLOYMENT_ENV: "testing",
      MEDIA_STORAGE_ROOT: root,
      MEDIA_PUBLIC_BASE_URL: "https://cdn.test.invalid/media",
    });
    await assert.rejects(
      () =>
        storage.storeMedia({
          productCode: "blessboard",
          organizationId: "11111111-1111-4111-8111-111111111111",
          mediaId: "22222222-2222-4222-8222-222222222222",
          mimeType: "image/jpeg",
          buffer: jpegBuffer(32),
          storageKey:
            "production/blessboard/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg",
        }),
      (err) => err && err.code === "REFUSED_PRODUCTION_MEDIA_NAMESPACE"
    );
    await fsp.rm(root, { recursive: true, force: true });
  });
});
