"use strict";

/**
 * V2.04 Overnight Step 4 — shared website media + image editor consolidation.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const folders = require("../src/platform/website/mediaFoldersService");
const mediaService = require("../src/platform/website/mediaService");
const {
  parseFormImagePlacement,
  IMAGE_SLOT_REGISTRY,
} = require("../src/platform/website/imagePlacement");
const contract = require("../src/platform/website/websiteMediaEditingContract");
const {
  CLASS,
  MOUNT,
  slotsByClass,
} = require("./helpers/v2-02-universal-image-editor-coverage-matrix");

describe("V2.04 shared website media hardening", () => {
  it("records Step 4 consolidation gates", () => {
    assert.equal(contract.STEP.id, "v2_04_overnight_step_4");
    assert.equal(contract.STEP.sharedMediaEngine, "PASS");
    assert.equal(contract.STEP.sharedImageEditor, "PASS");
    assert.equal(contract.SHARED_UPLOAD_ENGINE_COUNT, 1);
    assert.equal(contract.SHARED_IMAGE_EDITOR_ENGINE_COUNT, 1);
    assert.equal(contract.STEP.bbDuplicateWebsiteUploadEngine, 0);
    assert.equal(contract.STEP.acDuplicateWebsiteUploadEngine, 0);
    assert.ok(contract.PRODUCT_SPECIFIC_REMAINING.length >= 3);
  });

  it("website folder surface maps BB and AC to platform.website_media", () => {
    assert.equal(
      folders.sourceFor("activeclinic", folders.MEDIA_SURFACE.WEBSITE).table,
      "platform.website_media"
    );
    assert.equal(
      folders.sourceFor("blessboard", folders.MEDIA_SURFACE.WEBSITE).table,
      "platform.website_media"
    );
    assert.equal(
      folders.sourceFor("blessboard", folders.MEDIA_SURFACE.OPERATIONAL).table,
      "blessboard.media_assets"
    );
  });

  it("BB website media-library and AC CMS both load website-surface folders", () => {
    const bb = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    const ac = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    assert.match(bb, /MEDIA_SURFACE\.WEBSITE/);
    assert.match(bb, /\/website\/media\/folders/);
    assert.match(bb, /\/website\/media\/move/);
    assert.match(bb, /foldersEnabled:\s*true/);
    assert.match(ac, /MEDIA_SURFACE\.WEBSITE/);
    assert.match(ac, /\/app\/settings\/website\/media\/folders/);
  });

  it("BB operational content-admin keeps media_assets surface", () => {
    const ops = read("src/blessboard/http/contentAdminRoutes.js");
    assert.match(ops, /MEDIA_SURFACE\.OPERATIONAL/);
  });

  it("shared media-field exposes upload library replace remove alt and Adjust Picture", () => {
    const field = read("views/platform/website/partials/media-field.ejs");
    const js = read("public/platform/website-media-field.js");
    const inline = read("public/platform/website-inline-edit.js");
    assert.match(field, /data-gp-we-media-adjust/);
    assert.match(field, /Adjust Picture/);
    assert.match(field, /data-gp-we-media-placement/);
    assert.match(field, /data-gp-we-media-alt/);
    assert.match(field, /data-gp-we-media-remove/);
    assert.match(field, /Choose from Content Library/);
    assert.match(field, /Upload from computer/);
    assert.match(js, /openFraming/);
    assert.match(js, /GpUniversalImageEditor/);
    assert.match(inline, /GpUniversalImageEditor/);
    assert.match(inline, /openFraming/);
  });

  it("CMS image slots are registered for separate framing", () => {
    assert.equal(IMAGE_SLOT_REGISTRY["cms.block.image"].supportsSeparateFraming, true);
    assert.equal(IMAGE_SLOT_REGISTRY["cms.library.image"].supportsSeparateFraming, true);
    assert.equal(IMAGE_SLOT_REGISTRY["cms.section.image"].supportsSeparateFraming, true);
  });

  it("parseFormImagePlacement validates CMS form payloads", () => {
    const empty = parseFormImagePlacement("");
    assert.equal(empty.ok, true);
    assert.equal(empty.value, null);

    const good = parseFormImagePlacement(
      JSON.stringify({ v: 1, x: 40, y: 55, zoom: 1.2, fit: "cover" }),
      { contentKey: "cms.library.image" }
    );
    assert.equal(good.ok, true);
    assert.equal(good.value.x, 40);

    const bad = parseFormImagePlacement("{not-json", { contentKey: "home.logo" });
    assert.equal(bad.ok, false);
  });

  it("AC branding/library persist placement; catalogue/SEO stay replace-only by design", () => {
    const branding = read("views/activeclinic/app/website-cms-branding.ejs");
    const library = read("views/activeclinic/app/website-cms-library-edit.ejs");
    const seo = read("views/activeclinic/app/website-cms-seo.ejs");
    const doctor = read("views/activeclinic/app/website-cms-catalogue-doctor-form.ejs");
    const service = read("views/activeclinic/app/website-cms-catalogue-service-form.ejs");
    const routes = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");

    assert.match(branding, /logoPlacementJson/);
    assert.match(branding, /heroPlacementJson/);
    assert.match(library, /imagePlacementJson/);
    assert.match(routes, /parseFormImagePlacement/);
    assert.match(seo, /framingEnabled:\s*false/);
    assert.match(doctor, /framingEnabled:\s*false/);
    assert.match(service, /framingEnabled:\s*false/);
  });

  it("both products upload website media through platform mediaService only", () => {
    const bb = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    const ac = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    assert.match(bb, /mediaService\.registerWebsiteMedia/);
    assert.match(ac, /mediaService\.registerWebsiteMedia/);
    assert.doesNotMatch(bb, /blessboard\.media_assets/);
    assert.ok(!fs.existsSync(path.join(ROOT, "src/blessboard/website/websiteMediaUpload.js")));
    assert.ok(!fs.existsSync(path.join(ROOT, "src/activeclinic/website/websiteMediaUpload.js")));
  });

  it("preserves usages alt Hostinger CDN and legacy image hydration APIs", () => {
    assert.equal(typeof mediaService.registerWebsiteMedia, "function");
    assert.equal(typeof mediaService.updateWebsiteMediaMeta, "function");
    assert.equal(typeof mediaService.hydrateWebsiteImageValue, "function");
    assert.equal(typeof mediaService.listWebsiteMedia, "function");
    assert.ok(mediaService.PROVIDER_HOSTINGER);
    const src = read("src/platform/website/mediaService.js");
    assert.match(src, /website_media_usages/);
    assert.match(src, /PROVIDER_HOSTINGER/);
    assert.match(src, /alt_text|altText/);
    assert.match(src, /legacy/i);
  });

  it("Category-A website slots no longer leave Adjust Picture as expected-only", () => {
    const categoryA = slotsByClass(CLASS.A);
    assert.ok(categoryA.length >= 8);
    for (const slot of categoryA) {
      assert.notEqual(slot.adjustPicture, "expected", slot.id);
      assert.equal(slot.adjustPicture, true, slot.id);
    }
    const structuredA = categoryA.filter((s) => s.mount === MOUNT.STRUCTURED);
    assert.ok(structuredA.length >= 8);
    const cmsA = categoryA.filter((s) => s.mount === MOUNT.CMS_MEDIA_FIELD);
    assert.ok(cmsA.length >= 2);
  });

  it("documents product-specific remaining media gaps without counting them as website upload duplicates", () => {
    const ids = contract.PRODUCT_SPECIFIC_REMAINING.map((row) => row.id);
    assert.ok(ids.includes("bb.operational.media_assets"));
    assert.ok(ids.includes("ac.catalogue.doctor_photo"));
    assert.ok(ids.includes("ac.catalogue.service_image"));
    assert.ok(ids.includes("ac.seo.image"));
    assert.equal(contract.STEP.bbDuplicateWebsiteUploadEngine, 0);
    assert.equal(contract.STEP.acDuplicateWebsiteUploadEngine, 0);
  });
});
