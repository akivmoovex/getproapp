"use strict";

/**
 * V7 image editor coverage — every registered tenant/system image surface is
 * classified EDITABLE | SYSTEM_ONLY | NOT_APPLICABLE with zero unexplained gaps.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  CLASSIFICATION: BB_C,
  COVERAGE: BB_COVERAGE,
  unexplainedGaps: bbGaps,
  rowsByClassification: bbByClass,
} = require("../src/blessboard/website/blessboardImageEditorCoverage");
const {
  CLASSIFICATION: AC_C,
  COVERAGE: AC_COVERAGE,
  unexplainedGaps: acGaps,
  rowsByClassification: acByClass,
} = require("../src/activeclinic/website/activeClinicImageEditorCoverage");
const { CONTENT_TYPES } = require("../src/platform/website/contentTypes");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_WEBSITE_KEYS,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const { VALUE_TYPES, KEY_DEFS } = require("../src/blessboard/services/websiteSettingKeyRegistry");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v7 image editor coverage — classification matrices", () => {
  it("BlessBoard catalogue has zero unexplained gaps", () => {
    assert.deepEqual(bbGaps(), []);
    assert.ok(BB_COVERAGE.length >= 15);
    assert.ok(bbByClass(BB_C.EDITABLE).length >= 10);
    assert.ok(bbByClass(BB_C.SYSTEM_ONLY).some((r) => r.id === "bb.apex.marketing"));
  });

  it("ActiveClinic catalogue has zero unexplained gaps", () => {
    assert.deepEqual(acGaps(), []);
    assert.ok(AC_COVERAGE.length >= 10);
    assert.ok(acByClass(AC_C.EDITABLE).some((r) => r.id === "ac.home.logo"));
    assert.ok(acByClass(AC_C.EDITABLE).some((r) => r.id === "ac.doctor.photo"));
    assert.ok(acByClass(AC_C.SYSTEM_ONLY).some((r) => r.id === "ac.platform.marketing"));
    assert.ok(acByClass(AC_C.NOT_APPLICABLE).some((r) => r.id === "ac.departments"));
  });

  it("every ActiveClinic template IMAGE key is classified EDITABLE", () => {
    registerActiveClinicWebsiteTemplate();
    const imageKeys = Object.entries(ACTIVECLINIC_WEBSITE_KEYS)
      .filter(([, def]) => def.type === CONTENT_TYPES.IMAGE)
      .map(([key]) => key);
    assert.ok(imageKeys.includes("home.logo"));
    assert.ok(imageKeys.includes("home.hero.image"));
    assert.ok(imageKeys.includes("about.story.image"));
    assert.ok(imageKeys.includes("seo.image"));
    for (const key of imageKeys) {
      const hit = AC_COVERAGE.find((row) => Array.isArray(row.keys) && row.keys.includes(key));
      assert.ok(hit, `AC image key ${key} missing from coverage`);
      assert.equal(hit.classification, AC_C.EDITABLE, key);
    }
  });

  it("every BlessBoard IMAGE_URL setting key is classified EDITABLE", () => {
    const imageKeys = Object.entries(KEY_DEFS)
      .filter(([, def]) => def.type === VALUE_TYPES.IMAGE_URL)
      .map(([key]) => key);
    assert.ok(imageKeys.includes("identity.hero_image_url"));
    assert.ok(imageKeys.includes("seo.og_image_url"));
    for (const key of imageKeys) {
      const hit = BB_COVERAGE.find((row) => Array.isArray(row.keys) && row.keys.includes(key));
      assert.ok(hit, `BB image setting ${key} missing from coverage`);
      assert.equal(hit.classification, BB_C.EDITABLE, key);
    }
  });
});

describe("v7 image editor coverage — editor wiring contract", () => {
  it("shared inline image dialog exposes Add/Replace, library, and Remove (no raw URL box)", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /Replace image|Add image/);
    assert.match(js, /data-website-library="1"/);
    assert.match(js, /data-website-remove-image="1"/);
    assert.match(js, /pendingRemove/);
    assert.doesNotMatch(js, /Image URL or media path|type="url"[^>]*data-website-image-url/);
  });

  it("BlessBoard structured image editor uses media picker without raw URL text field", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(js, /type="hidden" name="imageUrl"/);
    assert.match(js, /Add image|Replace image/);
    assert.match(js, /data-bb-se-library="1"/);
    assert.match(js, /data-bb-se-remove-media="1"/);
    assert.doesNotMatch(js, /Image URL or media path/);
  });

  it("BlessBoard branch settings IMAGE_URL fields use shared media picker", () => {
    const ejs = read("views/blessboard/v5/hq/branch-website-settings.ejs");
    assert.match(ejs, /field\.type === 'image_url'/);
    assert.match(ejs, /media-upload/);
    assert.match(ejs, /type="hidden"/);
    assert.doesNotMatch(ejs, /image_url \? 'url'/);
  });

  it("BlessBoard content-admin entity images hide raw URL text boxes", () => {
    const ejs = read("views/blessboard/v5/content-admin/entity-fields.ejs");
    assert.doesNotMatch(ejs, /Image URL \(HTTPS or uploaded\)/);
    assert.doesNotMatch(ejs, /QR image URL/);
    assert.match(ejs, /media-upload/);
    assert.match(ejs, /name="image_url" type="hidden"/);
  });

  it("BlessBoard content blocks expose structured image edit triggers", () => {
    const partial = read("views/blessboard/v5/public/partials/content-block-media.ejs");
    assert.match(partial, /editKind: 'image'/);
    assert.match(partial, /Add section image|Replace section image/);
    for (const page of ["leadership", "ministries", "events", "sermons", "giving", "contact"]) {
      const src = read(`views/blessboard/v5/public/${page}.ejs`);
      assert.match(src, /content-block-media/, page);
    }
  });

  it("ActiveClinic library placements render images and edit affordances", () => {
    const ejs = read("views/activeclinic/partials/website-library-placements.ejs");
    assert.match(ejs, /item\.image/);
    assert.match(ejs, /Replace image|Add image/);
    assert.match(ejs, /\/app\/settings\/website\/library\//);
  });

  it("ActiveClinic doctor/service pages point website editors at catalogue and Content Library media", () => {
    const doctors = read("views/activeclinic/tenant/doctors.ejs");
    const services = read("views/activeclinic/tenant/services.ejs");
    // Doctors: visibility is catalogue-managed; photos are noted as Content Library.
    assert.match(doctors, /\/app\/settings\/website\/catalogue\?tab=doctors/);
    assert.match(doctors, /Manage public doctors/);
    assert.match(doctors, /Content Library/);
    assert.match(doctors, /website-library-placements/);
    // Services: image affordance opens the Content Library media picker.
    assert.match(services, /\/app\/settings\/website\/library/);
    assert.match(services, /Edit service website images/);
  });
});
