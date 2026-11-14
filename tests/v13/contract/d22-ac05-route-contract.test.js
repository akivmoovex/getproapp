"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");
const routes = fs.readFileSync(path.join(ROOT, "src/platform/http/platformAdminRoutes.js"), "utf8");
const assignment = fs.readFileSync(
  path.join(ROOT, "src/blessboard/services/assignBlessBoardRole.js"),
  "utf8"
);

describe("D22 AC-05 route contract", () => {
  it("protects the recorded admin and test-database routes with apex and platform administrator gates", () => {
    assert.match(routes, /router\.get\("\/admin", requireApex, requirePlatformAdmin/);
    assert.match(
      routes,
      /"\/admin\/settings\/test-database",\s*requireApex,\s*requirePlatformAdmin/
    );
    assert.match(
      routes,
      /"\/admin\/settings\/test-database\/preview",\s*requireApex,\s*requirePlatformAdmin/
    );
    assert.match(routes, /missing_platform_administrator_catalogue_role/);
    assert.match(routes, /You do not have access to platform administration/);
    assert.doesNotMatch(
      routes.slice(routes.indexOf('"/admin/settings/test-database"'), routes.indexOf('"/admin/roles"')),
      /facility_id/
    );
  });

  it("refuses a church-scoped administrator before treating it as a platform administrator", () => {
    assert.match(assignment, /church_hq_admin_scope/);
    assert.match(assignment, /platform_admin_scope/);
    assert.match(assignment, /if \(!validated\.ok\)/);
  });
});
