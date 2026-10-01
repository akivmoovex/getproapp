"use strict";

/**
 * V2.04 IMAGE EDITOR + MEDIA BUG FIX PACK (MEDIA-01…05)
 * Focused coverage A–J. Prefer shared PLATFORM media/editor — no AC/BB upload forks.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const {
  resolveClinicHero,
  resolveClinicAboutImage,
  CLINIC_DEFAULT,
} = require("../src/activeclinic/services/activeClinicPublicMediaService");
const {
  buildActiveClinicWebsiteTemplateContent,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplateContent");
const {
  adaptActiveClinicHero,
  adaptActiveClinicAbout,
} = require("../src/activeclinic/website/activeClinicWebsitePresentationAdapter");
const {
  mergeClinicPresentation,
} = require("../src/activeclinic/website/activeClinicWebsiteResolver");

describe("V2.04 media editor bug pack (MEDIA-01…05)", () => {
  it("A: AC new site soft-fills template/default hero + about images", () => {
    const clinic = { clinicKey: "new-clinic-a", publicName: "New Clinic A" };
    const hero = resolveClinicHero(clinic);
    const about = resolveClinicAboutImage(clinic);
    assert.match(String(hero.src || ""), /clinic-hero-default\.jpg/);
    assert.ok(about.src);
    assert.match(String(CLINIC_DEFAULT || ""), /clinic-hero-default\.jpg/);

    const adaptedHero = adaptActiveClinicHero({ clinic, content: {} });
    assert.equal(adaptedHero.ok, true);
    assert.ok(adaptedHero.value.image && adaptedHero.value.image.src);
    assert.match(String(adaptedHero.value.image.src), /clinic-hero-default\.jpg/);

    const adaptedAbout = adaptActiveClinicAbout({ clinic, content: {} });
    assert.equal(adaptedAbout.ok, true);
    assert.ok(adaptedAbout.value.image && adaptedAbout.value.image.src);
  });

  it("B: seed/template soft-fill does not create false unpublished draft images", () => {
    const content = buildActiveClinicWebsiteTemplateContent({ publicName: "Seed Clinic" });
    const hero = content["home.hero.image"];
    assert.ok(hero && typeof hero === "object");
    assert.equal(hero.src, null);
    assert.equal(content["about.story.image"], undefined);

    const presented = mergeClinicPresentation(
      { clinicKey: "seed-clinic", publicName: "Seed Clinic", organizationId: "org" },
      { values: content, visibility: {}, unpublishedCount: 0, mode: "draft" },
      { clinic_name: "Seed Clinic" }
    );
    assert.ok(presented.websiteHeroUrl, "presentation soft-fill visible");
    assert.equal(presented.websiteUnpublishedCount, 0);
    assert.equal(presented.websiteContent["home.hero.image"].src, null);
  });

  it("C: BB exposes Upload from computer via shared media field primitives", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(js, /Upload from computer/);
    assert.match(js, /data-bb-upload-from-computer="1"/);
    assert.match(js, /gp-we-media-field__btn--primary/);
    assert.match(js, /data-bb-se-upload="1"/);
    assert.doesNotMatch(js, /capture="environment"/);
    const shell = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    assert.match(shell, /website-media-field\.css/);
  });

  it("D: BB uploaded image uses shared upload URL + durable publicSrc path", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(js, /data-bb-media-upload/);
    assert.match(js, /media\.publicSrc/);
    assert.match(js, /applySelectedMedia/);
    assert.match(js, /Save draft|save draft/i);
    const host = read("views/blessboard/v5/partials/structured-editor-host.ejs");
    assert.match(host, /data-bb-media-upload/);
    assert.match(host, /data-bb-media-list/);
  });

  it("E: AC upload persists once (eager shared upload; save does not re-upload when mediaId set)", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /Eager shared upload|Uploaded to Image Library/);
    assert.match(js, /state\.pendingFile = null/);
    assert.match(js, /state\.pendingMediaId = media\.id/);
    // saveImage still uploads only when pendingFile remains (retry path).
    assert.match(js, /var chain = state\.pendingFile/);
    const cms = read("public/activeclinic/website-cms.js");
    assert.match(cms, /Avoid full-page reload|insertBefore/);
    assert.match(cms, /data-gp-library-grid/);
  });

  it("F: uploaded AC image appears in Image Library contract", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /Choose from Image Library/);
    assert.match(js, /No images in the Image Library yet/);
    assert.match(js, /out\.media/);
    assert.match(js, /item\.previewUrl \|\| item\.publicSrc/);
    assert.match(js, /Uploaded to Image Library/);
  });

  it("G: clinic A cannot see clinic B media (tenant-scoped list query)", () => {
    const mediaService = read("src/platform/website/mediaService.js");
    assert.match(mediaService, /organization_id = \$1 AND instance_id = \$2/);
    assert.match(mediaService, /async function listWebsiteMedia/);
    const routes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    assert.match(routes, /organizationId: clinic\.organizationId/);
    assert.match(routes, /instanceId: attached\.instance\.id/);
  });

  it("H: selected library image renders into editor preview", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /state\.pendingMediaId = item\.id/);
    assert.match(js, /showNewPreview\(item\.previewUrl \|\| item\.publicSrc/);
    assert.match(js, /updateCanvasImage/);
  });

  it("I: AC+BB editor uses canonical shared button class/tokens", () => {
    const css = read("public/platform/website-inline-edit.css");
    assert.match(css, /\.gp-website-field-editor__file--primary \{[\s\S]*border-radius: 8px;/);
    assert.match(css, /\.gp-website-field-editor__link-btn \{[\s\S]*border-radius: 8px;/);
    assert.match(css, /min-height: var\(--gp-website-touch, 44px\)/);
    const fieldCss = read("public/platform/website-media-field.css");
    assert.match(fieldCss, /\.gp-we-media-field__btn \{[\s\S]*border-radius: 8px;/);
    assert.match(fieldCss, /\.gp-we-media-field__btn--primary/);
    const bb = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(bb, /gp-we-media-field__btn--primary/);
    assert.match(bb, /gp-we-media-field__btn--ghost/);
  });

  it("J: desktop/mobile crop controls retained", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /data-website-frame-mode="desktop"/);
    assert.match(js, /data-website-frame-mode="mobile"/);
    assert.match(js, /Adjust Picture/);
    assert.match(js, /slotAllowsSeparateFraming/);
    const bb = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(bb, /data-bb-se-adjust="1"/);
    assert.match(bb, /Adjust Picture/);
  });
});
