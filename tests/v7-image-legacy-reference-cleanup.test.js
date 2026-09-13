"use strict";

/**
 * V7 legacy image reference cleanup — demo/default content must present CDN URLs.
 * Public-path aliases may remain as storage keys in source maps; runtime HTML must not.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  presentRuntimeImageSrc,
  cdnMarketingAsset,
} = require("../src/platform/media/cdnMediaPresentation");
const {
  listMarketingPublicPaths,
  isPlatformMarketingPublicPath,
} = require("../src/platform/media/platformMarketingAssets");
const publicDemo = require("../src/blessboard/services/tenantPublicDemoContent");
const { listDemoImages, validateImageUrl } = require("../src/blessboard/services/websiteStructuredDraftValidation");
const { buildActiveClinicWebsiteTemplateContent } = require("../src/activeclinic/website/activeClinicWebsiteTemplateContent");
const {
  DEMO_DOCTOR_PHOTOS,
  DEMO_CLINIC_HEROES,
  resolveDoctorPhoto,
  resolveClinicHero,
} = require("../src/activeclinic/services/activeClinicPublicMediaService");

const ROOT = path.join(__dirname, "..");
const ENV = Object.freeze({
  ...process.env,
  MEDIA_PUBLIC_BASE_URL: "https://blessboard.pronline.org/media",
  DEPLOYMENT_ENV: "testing",
});

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v7 legacy image reference cleanup", () => {
  it("maps every BlessBoard soft-fill MEDIA key to a CDN URL", () => {
    for (const [key, publicPath] of Object.entries(publicDemo.MEDIA)) {
      assert.ok(isPlatformMarketingPublicPath(publicPath), `${key} unmapped: ${publicPath}`);
      const cdn = presentRuntimeImageSrc(publicPath, ENV, { allowMarketing: true });
      assert.ok(cdn && cdn.startsWith("https://blessboard.pronline.org/media/testing/platform/"), key);
      assert.doesNotMatch(cdn, /\/church\/images\//);
    }
  });

  it("mediaOrFallback never returns local filesystem paths", () => {
    const url = publicDemo.mediaOrFallback(publicDemo.MEDIA.homeHero, null, ENV);
    assert.match(url, /^https:\/\/blessboard\.pronline\.org\/media\//);
    assert.equal(publicDemo.mediaOrFallback("/church/images/not-in-map.jpg", null, ENV), null);
    assert.equal(publicDemo.mediaOrFallback("data:image/png;base64,xxx", null, ENV), null);
  });

  it("structured demo image list exposes CDN URLs only", () => {
    const prev = process.env.MEDIA_PUBLIC_BASE_URL;
    process.env.MEDIA_PUBLIC_BASE_URL = ENV.MEDIA_PUBLIC_BASE_URL;
    process.env.DEPLOYMENT_ENV = "testing";
    try {
      const list = listDemoImages();
      assert.ok(list.length > 5);
      for (const item of list) {
        assert.match(item.url, /^https:\/\//);
        assert.doesNotMatch(item.url, /\/church\/images\//);
      }
      const validated = validateImageUrl(publicDemo.MEDIA.pastor);
      assert.equal(validated.ok, true);
      assert.match(validated.value, /^https:\/\//);
    } finally {
      if (prev == null) delete process.env.MEDIA_PUBLIC_BASE_URL;
      else process.env.MEDIA_PUBLIC_BASE_URL = prev;
    }
  });

  it("ActiveClinic new-tenant template defaults do not embed local hero paths", () => {
    const content = buildActiveClinicWebsiteTemplateContent({ publicName: "Test Clinic" });
    const hero = content["home.hero.image"];
    assert.ok(hero);
    assert.equal(hero.src, null);
  });

  it("ActiveClinic demo doctor/clinic heroes present as CDN", () => {
    for (const [key, entry] of Object.entries(DEMO_DOCTOR_PHOTOS)) {
      if (!entry || !entry.path) continue;
      assert.ok(isPlatformMarketingPublicPath(entry.path), entry.path);
      const photo = resolveDoctorPhoto(key, ENV);
      assert.ok(photo.src, key);
      assert.match(photo.src, /^https:\/\//, key);
      assert.doesNotMatch(photo.src, /\/activeclinic\/assets\//, key);
    }
    for (const [key, entry] of Object.entries(DEMO_CLINIC_HEROES)) {
      assert.ok(entry && entry.path, key);
      const hero = resolveClinicHero({ clinicKey: key }, ENV);
      assert.ok(hero.src, key);
      assert.match(hero.src, /^https:\/\//, key);
      assert.doesNotMatch(hero.src, /\/activeclinic\/assets\//, key);
    }
  });

  it("marketing public paths all resolve to CDN keys", () => {
    const paths = listMarketingPublicPaths();
    assert.ok(paths.length >= 40);
    for (const publicPath of paths) {
      const cdn = cdnMarketingAsset(publicPath, ENV);
      assert.ok(cdn && /^https:\/\//.test(cdn), publicPath);
    }
  });

  it("auth-error brand mark uses cdnAsset helper", () => {
    const ejs = read("views/blessboard/v5/apex/auth-error.ejs");
    assert.match(ejs, /cdnAsset\('\/church\/images\/brand\/blessboard-small-church-logo\.png'\)/);
    assert.doesNotMatch(ejs, /src="\/church\/images\//);
  });
});
