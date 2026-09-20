"use strict";

/**
 * V8 shared media resolution — read existing V7 testing/ objects, write testing-v8/,
 * correct CDN host for neuniversity, marketing soft-fill keys.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const express = require("express");
const request = require("supertest");

const {
  resolveCdnPublicBaseUrl,
  presentCdnUrl,
  presentRuntimeImageSrc,
  cdnMarketingAsset,
  V7_TESTING_CDN_PUBLIC_BASE_FALLBACK,
  V8_TESTING_CDN_PUBLIC_BASE_FALLBACK,
} = require("../src/platform/media/cdnMediaPresentation");
const {
  storageKeyForPublicPath,
} = require("../src/platform/media/platformMarketingAssets");
const {
  resolveHostingerMediaConfig,
  resolveMediaEnvironment,
  assertStorageKeyWritable,
  assertStorageKeyReadable,
  PROVIDER_HOSTINGER,
} = require("../src/platform/media/hostingerMediaConfig");
const {
  createHostingerMediaStorage,
} = require("../src/platform/media/hostingerMediaStorage");
const {
  mountHostingerMediaStatic,
} = require("../src/platform/http/mountHostingerMediaStatic");
const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  CODE_MOOVEX_PLATFORM_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
} = require("../src/platform/config/deploymentProfiles");

const V8_ENV_BASE = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  BASE_DOMAIN: "neuniversity.org",
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v8-media-resolution-session-secret-0123456789ab",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
  MEDIA_PUBLIC_BASE_URL: "/media",
  MEDIA_PUBLIC_MOUNT_PATH: "/media",
});

const V7_ENV_BASE = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  BASE_DOMAIN: "pronline.org",
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v7-media-resolution-session-secret-0123456789ab",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
  MEDIA_PUBLIC_BASE_URL: "/media",
  MEDIA_PUBLIC_MOUNT_PATH: "/media",
});

describe("V8 shared media resolution and image delivery", () => {
  it("1. Existing V7 media resolves correctly on V8 (marketing soft-fill)", () => {
    const publicPath = "/church/images/brand/blessboard-small-church-logo.png";
    const key = storageKeyForPublicPath(publicPath, V8_ENV_BASE);
    assert.equal(
      key,
      "testing/platform/blessboard/brand/blessboard-small-church-logo.png"
    );
    const url = cdnMarketingAsset(publicPath, V8_ENV_BASE);
    assert.equal(
      url,
      `${V8_TESTING_CDN_PUBLIC_BASE_FALLBACK}/testing/platform/blessboard/brand/blessboard-small-church-logo.png`
    );
    assert.doesNotMatch(url, /testing-v8/);
    assert.doesNotMatch(url, /pronline\.org/);
  });

  it("2. New V8 media uses testing-v8 for writes", () => {
    assert.equal(resolveMediaEnvironment(V8_ENV_BASE), "testing-v8");
    const writeKey = storageKeyForPublicPath(
      "/church/images/homepage/desktop-hero-auditorium.jpg",
      V8_ENV_BASE,
      { forWrite: true }
    );
    assert.equal(
      writeKey,
      "testing-v8/platform/blessboard/homepage/desktop-hero-auditorium.jpg"
    );
    assert.doesNotThrow(() =>
      assertStorageKeyWritable("testing-v8", writeKey)
    );
    assert.throws(
      () => assertStorageKeyWritable("testing", writeKey),
      (err) =>
        err &&
        (err.code === "REFUSED_V8_MEDIA_NAMESPACE" ||
          /refused_v8_media_namespace/i.test(String(err.message || "")))
    );
  });

  it("3. Existing V7 media remains readable from V8 runtime", () => {
    const v7Key =
      "testing/blessboard/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg";
    assert.doesNotThrow(() => assertStorageKeyReadable("testing-v8", v7Key));
    assert.throws(() => assertStorageKeyReadable("testing", "testing-v8/x/y/z.jpg"));
    const presented = presentCdnUrl(v7Key, V8_ENV_BASE);
    assert.equal(presented, `${V8_TESTING_CDN_PUBLIC_BASE_FALLBACK}/${v7Key}`);
  });

  it("4. Correct physical storage root selection", () => {
    const root = path.join(os.tmpdir(), `v8-media-root-${Date.now()}`);
    fs.mkdirSync(root, { recursive: true });
    const cfg = resolveHostingerMediaConfig({
      ...V8_ENV_BASE,
      MEDIA_STORAGE_ROOT: root,
    });
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.storageRoot, path.resolve(root));
    assert.equal(cfg.environment, "testing-v8");
    assert.equal(cfg.publicMountPath, "/media");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("5. Correct public URL generation (V8 vs V7 CDN host)", () => {
    assert.equal(
      resolveCdnPublicBaseUrl(V8_ENV_BASE),
      V8_TESTING_CDN_PUBLIC_BASE_FALLBACK
    );
    assert.equal(
      resolveCdnPublicBaseUrl(V7_ENV_BASE),
      V7_TESTING_CDN_PUBLIC_BASE_FALLBACK
    );
    assert.equal(
      resolveCdnPublicBaseUrl({
        ...V8_ENV_BASE,
        MEDIA_PUBLIC_BASE_URL: "https://cdn.custom.example/media",
      }),
      "https://cdn.custom.example/media"
    );
  });

  it("6. Correct media mount routing serves testing/ files", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "v8-media-mount-"));
    const key =
      "testing/platform/blessboard/brand/blessboard-small-church-logo.png";
    const abs = path.join(root, ...key.split("/"));
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    const app = express();
    const mounted = mountHostingerMediaStatic(app, {
      ...V8_ENV_BASE,
      MEDIA_STORAGE_ROOT: root,
    });
    assert.equal(mounted, true);
    app.use((req, res) => res.status(404).type("text").send("Not found"));

    const ok = await request(app).get(`/media/${key}`);
    assert.equal(ok.status, 200);
    assert.match(ok.headers["content-type"] || "", /image|octet|png/i);

    const missing = await request(app).get(
      "/media/testing-v8/platform/blessboard/brand/blessboard-small-church-logo.png"
    );
    assert.equal(missing.status, 404);

    await fsp.rm(root, { recursive: true, force: true });
  });

  it("7. BB logo and hero images map to testing/platform on V8", () => {
    const logo = cdnMarketingAsset(
      "/church/images/brand/blessboard-small-church-logo.png",
      V8_ENV_BASE
    );
    const hero = cdnMarketingAsset(
      "/church/images/homepage/desktop-hero-auditorium.jpg",
      V8_ENV_BASE
    );
    assert.match(logo, /\/media\/testing\/platform\/blessboard\/brand\//);
    assert.match(hero, /\/media\/testing\/platform\/blessboard\/homepage\//);
    assert.match(logo, /blessboard\.neuniversity\.org/);
  });

  it("8. AC logo/hero stitch images map to testing/platform on V8", () => {
    const hero = cdnMarketingAsset(
      "/activeclinic/assets/stitch/ACW01-01-ActiveClinic-Home-Desktop-1.jpg",
      V8_ENV_BASE
    );
    const clinic = cdnMarketingAsset(
      "/activeclinic/assets/clinic/julflona-hero.jpg",
      V8_ENV_BASE
    );
    assert.match(hero, /\/media\/testing\/platform\/activeclinic\/stitch\//);
    assert.match(clinic, /\/media\/testing\/platform\/activeclinic\/clinic\//);
    assert.doesNotMatch(hero, /testing-v8/);
  });

  it("9. Miniwebsite image presentation rewrites mistaken testing-v8/platform keys", () => {
    const stale =
      "https://blessboard.pronline.org/media/testing-v8/platform/activeclinic/clinic/julflona-hero.jpg";
    const fixed = presentRuntimeImageSrc(stale, V8_ENV_BASE);
    assert.equal(
      fixed,
      `${V8_TESTING_CDN_PUBLIC_BASE_FALLBACK}/testing/platform/activeclinic/clinic/julflona-hero.jpg`
    );
  });

  it("10. Media ID hydration keeps Hostinger storage_key and CDN URL", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "v8-media-hydrate-"));
    const env = {
      ...V8_ENV_BASE,
      MEDIA_STORAGE_ROOT: root,
      MEDIA_PUBLIC_BASE_URL: V8_TESTING_CDN_PUBLIC_BASE_FALLBACK,
    };
    const storage = createHostingerMediaStorage(env);
    const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const mediaId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const written = await storage.storeMedia({
      productCode: "blessboard",
      organizationId: orgId,
      mediaId,
      mimeType: "image/jpeg",
      buffer: bytes,
    });
    assert.match(written.storageKey, /^testing-v8\/blessboard\//);
    assert.equal(written.storageProvider, PROVIDER_HOSTINGER);
    const presented = presentCdnUrl(written.storageKey, env);
    assert.equal(presented, `${V8_TESTING_CDN_PUBLIC_BASE_FALLBACK}/${written.storageKey}`);
    await fsp.rm(root, { recursive: true, force: true });
  });

  it("11. Draft/save/publish image persistence keeps V7 testing keys intact", () => {
    const draftSrc =
      "https://blessboard.pronline.org/media/testing/blessboard/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg";
    const presented = presentRuntimeImageSrc(draftSrc, V8_ENV_BASE);
    assert.match(presented, /\/media\/testing\/blessboard\//);
    assert.doesNotMatch(presented, /testing-v8\/blessboard/);
  });

  it("12. Missing-file and invalid-path handling", () => {
    assert.equal(presentCdnUrl("../etc/passwd", V8_ENV_BASE), null);
    assert.equal(presentCdnUrl("testing/../../x", V8_ENV_BASE), null);
    assert.equal(presentRuntimeImageSrc("data:image/png;base64,aaa", V8_ENV_BASE), null);
    assert.equal(presentRuntimeImageSrc("/church/images/not-mapped.jpg", V8_ENV_BASE), null);
  });

  it("13. Tenant ownership write namespace stays isolated", () => {
    const v8Tenant =
      "testing-v8/activeclinic/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg";
    assert.doesNotThrow(() => assertStorageKeyWritable("testing-v8", v8Tenant));
    assert.throws(() => assertStorageKeyWritable("testing", v8Tenant));
    assert.doesNotThrow(() => assertStorageKeyReadable("testing-v8", v8Tenant));
    assert.throws(() => assertStorageKeyReadable("testing", v8Tenant));
  });

  it("14. Existing V7 media presentation unchanged on V7 profile", () => {
    const publicPath = "/church/images/brand/blessboard-small-church-logo.png";
    const key = storageKeyForPublicPath(publicPath, V7_ENV_BASE);
    assert.equal(
      key,
      "testing/platform/blessboard/brand/blessboard-small-church-logo.png"
    );
    const url = cdnMarketingAsset(publicPath, V7_ENV_BASE);
    assert.equal(
      url,
      `${V7_TESTING_CDN_PUBLIC_BASE_FALLBACK}/testing/platform/blessboard/brand/blessboard-small-church-logo.png`
    );
    assert.match(url, /blessboard\.pronline\.org/);
  });
});
