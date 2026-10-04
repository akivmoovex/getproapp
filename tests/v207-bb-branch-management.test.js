"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "src/blessboard/http/hqAdminRoutes.js"), "utf8");
const branchNew = fs.readFileSync(path.join(root, "views/blessboard/v5/hq/branch-new.ejs"), "utf8");
const locationField = fs.readFileSync(path.join(root, "views/platform/partials/gp-location-field.ejs"), "utf8");
const detail = fs.readFileSync(path.join(root, "views/blessboard/v5/hq/branch-detail.ejs"), "utf8");
const edit = fs.readFileSync(path.join(root, "views/blessboard/v5/hq/branch-edit.ejs"), "utf8");
const list = fs.readFileSync(path.join(root, "views/blessboard/v5/hq/branches.ejs"), "utf8");

describe("V2.07 BlessBoard branch management contracts", () => {
  it("exposes detail, edit, workspace, lifecycle and CSRF-protected actions", () => {
    assert.match(routes, /\/hq\/branches\/:branchKey\/edit/);
    assert.match(routes, /\/hq\/branches\/:branchKey\/workspace/);
    assert.match(routes, /\/hq\/branches\/:branchKey\/deactivate/);
    assert.match(routes, /\/hq\/branches\/:branchKey\/activate/);
    assert.match(routes, /validateCsrf\(req/);
  });

  it("preserves server tenant/church/branch scope and reactivation capacity", () => {
    assert.match(routes, /tenant\.church\.id/);
    assert.match(routes, /tenant\.organization\.id/);
    assert.match(routes, /listBlessBoardBranches\(getPool\(\), tenant\.church\.id/);
    assert.match(routes, /activateBlessBoardBranch/);
    assert.match(routes, /deactivateBlessBoardBranch/);
  });

  it("renders required detail/edit fields and links", () => {
    for (const field of ["displayName", "key", "branchType", "status", "isPrimary", "phone", "email", "timezone"]) {
      assert.match(detail, new RegExp(field));
    }
    assert.match(detail, /workspaceHref/);
    assert.match(detail, /publicHref/);
    for (const field of ["publicName", "phone", "email", "addressLine1", "city", "provinceState", "postalCode", "countryCode", "timezone"]) {
      assert.match(edit, new RegExp(`name="${field}"`));
    }
  });

  it("keeps inactive branches in the registry with status filtering", () => {
    assert.match(list, /statusOptions/);
    assert.match(list, /inactive/);
    assert.match(list, /branch\.status/);
  });

  it("keeps branch creation aligned with shared registration primitives", () => {
    assert.match(routes, /buildRegistrationCountryLocals\(PRODUCT_CODE\.BLESSBOARD/);
    assert.match(branchNew, /registrationCountries/);
    assert.match(branchNew, /autocomplete="country-name"/);
    assert.match(branchNew, /gp-location-field/);
    assert.match(locationField, /data-gp-location-clear-on-country="1"/);
    assert.match(branchNew, /showCountryName: true/);
    assert.match(branchNew, /autocomplete="email"/);
    assert.match(branchNew, /autocomplete="address-line1"/);
    assert.match(branchNew, /maxlength="200"/);
  });

  it("preserves key rules, CSRF, tenant scope, and submitted values", () => {
    assert.match(branchNew, /data-bb-branch-key-regen/);
    assert.match(branchNew, /data-bb-branch-key-manual/);
    assert.match(branchNew, /data-bb-branch-url-preview-path/);
    assert.match(routes, /validateCsrf\(req, submitted, env\)/);
    assert.match(routes, /churchId: tenant\.church\.id/);
    assert.match(routes, /organizationId: tenant\.organization\.id/);
    assert.doesNotMatch(routes, /churchId:\s*req\.body/);
    assert.doesNotMatch(routes, /organizationId:\s*req\.body/);
    assert.match(branchNew, /value="<%= fval\('displayName'\) %>"/);
    assert.match(branchNew, /value="<%= fval\('email'\) %>"/);
  });
});
