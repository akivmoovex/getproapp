"use strict";

/**
 * V2.0 BUG 08 — ActiveClinic service cards must expose Edit service → catalogue editor.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

describe("v2 activeclinic service card editing", () => {
  it("services page shows per-card Edit service in website edit mode", () => {
    const page = read("views/activeclinic/tenant/services.ejs");
    assert.match(page, /data-ac-edit-service="1"/);
    assert.match(page, /Edit service/);
    assert.match(page, /catalogue\/services\/.*\/edit/);
    assert.match(page, /returnTo/);
    assert.match(page, /editingServices/);
    assert.match(page, /Manage public catalogue/);
  });

  it("service detail exposes Edit service in website edit mode", () => {
    const page = read("views/activeclinic/tenant/service-detail.ejs");
    assert.match(page, /data-ac-edit-service="1"/);
    assert.match(page, /Edit service/);
    assert.match(page, /catalogue\/services\//);
  });

  it("public service rows include catalogue editHref", () => {
    const src = read("src/activeclinic/services/activeClinicPublicVisibilityService.js");
    assert.match(src, /editHref:\s*row\.id/);
    assert.match(src, /catalogue\/services\/\$\{row\.id\}\/edit/);
  });

  it("catalogue service form preserves returnTo and shared media picker", () => {
    const form = read("views/activeclinic/app/website-cms-catalogue-service-form.ejs");
    const routes = read("src/activeclinic/http/activeClinicWebsiteCmsRoutes.js");
    assert.match(form, /name="returnTo"/);
    assert.match(form, /website-cms-media-field/);
    assert.match(form, /name="imageMediaId"|idName:\s*"imageMediaId"/);
    assert.match(form, /name="displayName"/);
    assert.match(form, /name="category"/);
    assert.match(form, /name="description"/);
    assert.match(form, /name="defaultDurationMinutes"/);
    assert.match(form, /name="publicWebsiteVisible"/);
    assert.match(routes, /sanitizeCatalogueReturnTo/);
    assert.match(routes, /returnTo \|\| `\/app\/settings\/website\/catalogue\?tab=services&saved=1`/);
  });

  it("does not invent a competing website-only service model on the services page", () => {
    const page = read("views/activeclinic/tenant/services.ejs");
    assert.doesNotMatch(page, /editKind:\s*'service'/);
    assert.match(page, /\/app\/settings\/website\/catalogue/);
  });
});
