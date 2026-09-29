"use strict";

/**
 * V2.0 BUG 09 — ActiveClinic doctor public photograph upload workflow.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

describe("v2 activeclinic doctor profile image upload", () => {
  it("catalogue doctor form exposes Upload from computer and Content Library", () => {
    const form = read("views/activeclinic/app/website-cms-catalogue-doctor-form.ejs");
    const field = read("views/platform/website/partials/media-field.ejs");
    assert.match(form, /website-cms-media-field/);
    assert.match(form, /imageMediaId/);
    assert.match(form, /Upload from computer|Choose from Content Library|data-ac-doctor-photo-hint/);
    assert.match(form, /mediaListUrl:\s*cms\.mediaListUrl/);
    assert.match(field, /Upload from computer/);
    assert.match(field, /Choose from Content Library/);
    assert.match(field, /data-gp-we-media-remove/);
  });

  it("public doctors cards and profile link authorized editors to catalogue photo editor", () => {
    const doctors = read("views/activeclinic/tenant/doctors.ejs");
    const profile = read("views/activeclinic/tenant/doctor-profile.ejs");
    assert.match(doctors, /data-ac-edit-doctor="1"/);
    assert.match(doctors, /Edit doctor profile/);
    assert.match(doctors, /catalogue\/doctors\/.*\/edit/);
    assert.match(profile, /data-ac-edit-doctor="1"/);
    assert.match(profile, /Upload from computer|Choose from Content Library/);
  });

  it("empty submitted image fields clear overlays instead of preserving prior photo", () => {
    const catalogue = read("src/activeclinic/website/clinicWebsiteCatalogueService.js");
    const library = read("src/activeclinic/website/clinicWebsiteLibraryService.js");
    assert.match(catalogue, /next\.clearImage\s*=\s*true/);
    assert.match(catalogue, /hasImageKeys/);
    assert.match(library, /input\.clearImage === true/);
  });

  it("public staff profiles expose catalogue editHref", () => {
    const src = read("src/activeclinic/services/activeClinicPublicVisibilityService.js");
    assert.match(src, /editHref:\s*row\.id \? `\/app\/settings\/website\/catalogue\/doctors\/\$\{row\.id\}\/edit`/);
  });

  it("doctor update returns overlay image on the presented doctor", () => {
    const src = read("src/activeclinic/website/clinicWebsiteCatalogueService.js");
    assert.match(src, /presentDoctor\(row,\s*overlay\.item \|\| null\)/);
  });
});
