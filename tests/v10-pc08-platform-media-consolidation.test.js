"use strict";

/**
 * PC08 — platform media consolidation architecture guard.
 * Website engine storage/persistence/CDN must be platform-owned.
 * No bulk media migration; no production changes.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function walkJs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.includes(" 2.")) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJs(abs, out);
    else if (ent.name.endsWith(".js")) out.push(abs);
  }
  return out;
}

describe("PC08 platform media consolidation", () => {
  it("platform media barrel and Hostinger/CDN modules exist", () => {
    const barrel = require("../src/platform/media");
    assert.equal(typeof barrel.createHostingerMediaStorage, "function");
    assert.equal(typeof barrel.resolveHostingerMediaConfig, "function");
    assert.equal(typeof barrel.presentRuntimeImageSrc, "function");
    assert.equal(typeof barrel.buildPublicMediaUrl, "function");
    assert.ok(fs.existsSync(path.join(ROOT, "src/platform/website/mediaService.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "docs/platform/PLATFORM_MEDIA_OWNERSHIP.md")));
  });

  it("website mediaService is the sole Hostinger persistence entry for website media", () => {
    const mediaService = read("src/platform/website/mediaService.js");
    assert.match(mediaService, /createHostingerMediaStorage/);
    assert.match(mediaService, /registerWebsiteMedia/);
    assert.match(mediaService, /hydrateWebsiteImageValue/);
    assert.match(mediaService, /resolveWebsiteMediaPublicSrc/);

    for (const productDir of ["src/blessboard", "src/activeclinic"]) {
      for (const file of walkJs(path.join(ROOT, productDir))) {
        const src = fs.readFileSync(file, "utf8");
        assert.doesNotMatch(
          src,
          /require\(["'].*platform\/media\/hostingerMediaStorage["']\)/,
          `${path.relative(ROOT, file)} must not invent Hostinger storage; use mediaService`
        );
      }
    }
  });

  it("BB and AC website editor/CMS routes use platform mediaService", () => {
    const bb = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    const ac = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    const cms = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    assert.match(bb, /platform\/website\/mediaService/);
    assert.match(ac, /platform\/website\/mediaService/);
    assert.match(cms, /platform\/website\/mediaService/);
    assert.match(bb, /registerWebsiteMedia|listWebsiteMedia|getWebsiteMedia/);
    assert.match(ac, /registerWebsiteMedia|listWebsiteMedia|getWebsiteMedia/);
  });

  it("shared picker chrome is platform-owned; products do not ship parallel CDN hosts", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "public/platform/website-media-field.js")));
    assert.ok(
      fs.existsSync(path.join(ROOT, "views/platform/website/partials/media-picker-dialog.ejs"))
    );
    const picker = read("public/platform/website-media-field.js");
    assert.doesNotMatch(picker, /unsplash|pexels|cloudinary|s3\.amazonaws/i);
  });

  it("library model documents platform website_media ownership (not product stores)", () => {
    const lib = read("src/platform/website/libraryModel.js");
    assert.match(lib, /platform-owned/);
    assert.match(lib, /platform\.website_media/);
    assert.doesNotMatch(
      lib,
      /Storage stays product-owned:\s*ActiveClinic reads platform\.website_media and\s*BlessBoard reads blessboard\.media_assets/
    );
  });

  it("BB operational media package remains product-domain (compatibility retained)", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "src/blessboard/media/mediaUploadService.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "src/blessboard/media/storage/createMediaStorage.js")));
    const upload = read("src/blessboard/media/mediaUploadService.js");
    assert.doesNotMatch(upload, /platform\.website_media/);
    assert.match(upload, /mediaAssetsRepository/);
    assert.match(upload, /insertMediaAsset/);
  });

  it("platform testing reset uses registry for BB operational media (no hard require)", () => {
    const reset = read("src/platform/services/testingDataResetService.js");
    assert.match(reset, /createBlessBoardOperationalMediaStorage/);
    assert.doesNotMatch(reset, /blessboard\/media\/storage\/createMediaStorage/);
  });

  it("AC public media service is catalogue presentation only (CDN via platform)", () => {
    const ac = read("src/activeclinic/services/activeClinicPublicMediaService.js");
    assert.match(ac, /cdnMediaPresentation/);
    assert.doesNotMatch(ac, /createHostingerMediaStorage/);
    assert.doesNotMatch(ac, /registerWebsiteMedia/);
  });
});
