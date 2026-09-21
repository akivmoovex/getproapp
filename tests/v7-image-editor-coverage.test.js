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
  it("shared inline image dialog exposes Upload/Replace, Content Library, and Remove (no raw URL box)", () => {
    const js = read("public/platform/website-inline-edit.js");
    assert.match(js, /Upload from computer|Replace image/);
    assert.match(js, /Choose from Content Library/);
    assert.match(js, /data-website-library="1"/);
    assert.match(js, /data-website-remove-image="1"/);
    assert.match(js, /pendingRemove/);
    assert.doesNotMatch(js, /Image URL or media path|type="url"[^>]*data-website-image-url/);
  });

  it("shared platform media field exposes upload, library, replace, and remove actions", () => {
    const field = read("views/platform/website/partials/media-field.ejs");
    const picker = read("views/platform/website/partials/media-picker-dialog.ejs");
    const js = read("public/platform/website-media-field.js");
    assert.match(field, /Upload from computer/);
    assert.match(field, /Choose from Content Library/);
    assert.match(field, /Replace image/);
    assert.match(field, /Remove image/);
    assert.match(picker, /Upload from computer/);
    assert.match(picker, /Content Library/);
    assert.match(js, /data-gp-we-media-file/);
    assert.match(js, /uploadFile/);
    assert.match(js, /FormData/);
  });

  it("ActiveClinic CMS media field reuses the shared platform partial", () => {
    const acField = read("views/activeclinic/partials/website-cms-media-field.ejs");
    const acPicker = read("views/activeclinic/partials/website-cms-media-picker.ejs");
    assert.match(acField, /platform\/website\/partials\/media-field/);
    assert.match(acPicker, /platform\/website\/partials\/media-picker-dialog/);
  });

  it("BlessBoard structured image editor uses media picker without raw URL text field", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    assert.match(js, /type="hidden" name="/);
    assert.match(js, /data-bb-se-image-url="1"/);
    assert.match(js, /Upload from computer|Replace image/);
    assert.match(js, /Choose from Content Library|data-bb-se-library="1"/);
    assert.match(js, /data-bb-se-remove-media="1"/);
    assert.doesNotMatch(js, /Image URL or media path/);
    assert.doesNotMatch(js, /QR image URL \(optional\)/);
  });

  it("BlessBoard branch settings IMAGE_URL fields use shared media field", () => {
    const ejs = read("views/blessboard/v5/hq/branch-website-settings.ejs");
    assert.match(ejs, /field\.type === 'image_url'/);
    assert.match(ejs, /platform\/website\/partials\/media-field/);
    assert.match(ejs, /Upload from computer/);
    assert.doesNotMatch(ejs, /content-admin\/media-upload/);
  });

  it("BlessBoard content-admin entity images use shared media field without raw URL boxes", () => {
    const ejs = read("views/blessboard/v5/content-admin/entity-fields.ejs");
    assert.doesNotMatch(ejs, /Image URL \(HTTPS or uploaded\)/);
    assert.doesNotMatch(ejs, /QR image URL/);
    assert.match(ejs, /platform\/website\/partials\/media-field/);
    assert.match(ejs, /Upload from computer/);
    assert.match(ejs, /srcName:\s*'image_url'/);
    assert.match(ejs, /srcName:\s*'qr_image_url'/);
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

  it("BlessBoard home ministry cards expose Edit image with shared structured picker", () => {
    const card = read("views/blessboard/v5/public/partials/content-card.ejs");
    const home = read("views/blessboard/v5/public/home.ejs");
    const trigger = read("views/blessboard/v5/partials/entity-image-edit-trigger.ejs");
    assert.match(home, /cardMinistry:\s*m/);
    assert.match(card, /entity-image-edit-trigger/);
    assert.match(card, /editKind:\s*'ministry'/);
    assert.match(trigger, /editLabel:\s*'Edit image'/);
    assert.match(trigger, /editDialogTitle:\s*'Edit image'/);
  });

  it("BlessBoard home This Season event cards expose Edit image on event records", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    const events = read("views/blessboard/v5/public/events.ejs");
    assert.match(home, /data-bb-home-event-cards="1"/);
    assert.match(home, /entity-image-edit-trigger/);
    assert.match(home, /editKind:\s*'event'/);
    assert.match(home, /data-bb-event-image="1"/);
    assert.match(events, /entity-image-edit-trigger/);
    assert.match(events, /data-bb-event-image="1"/);
  });

  it("BlessBoard home and sermons pages expose Edit image on sermon thumbnails", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    const sermons = read("views/blessboard/v5/public/sermons.ejs");
    assert.match(home, /data-bb-home-sermons="1"/);
    assert.match(home, /editKind:\s*'sermon'/);
    assert.match(home, /entity-image-edit-trigger/);
    assert.match(sermons, /entity-image-edit-trigger/);
    assert.match(sermons, /data-bb-sermon-image="1"/);
  });

  it("BlessBoard giving QR uses shared Upload from computer controls without raw URL", () => {
    const js = read("public/blessboard/v5/website-structured-edit.js");
    const giving = read("views/blessboard/v5/public/giving.ejs");
    assert.match(js, /fieldName:\s*"qrImageUrl"/);
    assert.doesNotMatch(js, /QR image URL \(optional\)/);
    assert.match(giving, /entity-image-edit-trigger/);
    assert.match(giving, /data-bb-giving-qr/);
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
    assert.match(doctors, /\/app\/settings\/website\/catalogue\?tab=doctors/);
    assert.match(doctors, /Manage public doctors/);
    assert.match(doctors, /media picker|Content Library|Upload from computer/i);
    assert.match(doctors, /website-library-placements/);
    assert.match(doctors, /data-ac-edit-doctor="1"/);
    assert.match(services, /\/app\/settings\/website\/catalogue\?tab=services/);
    assert.match(services, /Manage public catalogue/);
    assert.match(services, /data-ac-edit-service="1"/);
    assert.match(services, /Edit service/);
  });
});
