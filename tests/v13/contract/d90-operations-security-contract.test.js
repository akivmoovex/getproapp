"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("D90 operational contracts", () => {
  it("keeps the test-database routes behind apex and platform administrator", () => {
    const routes = read("src/platform/http/platformAdminRoutes.js");
    const roles = read("src/blessboard/services/assignBlessBoardRole.js");
    assert.match(routes, /router\.get\("\/admin", requireApex, requirePlatformAdmin/);
    assert.match(routes, /"\/admin\/settings\/test-database",\s*requireApex,\s*requirePlatformAdmin/);
    assert.match(roles, /platform_admin_scope/);
    assert.equal(roles.includes("activeclinic.pharmacy.dispense"), false);
  });

  it("keeps offline, signing, restore, and versioned clinical routes closed", () => {
    const app = read("src/activeclinic/http/activeClinicAppRoutes.js");
    const start = app.indexOf('app.get("/app/offline"');
    const offline = app.slice(start, start + 700);
    const demo = read("src/activeclinic/services/activeClinicDemoClinicSpec.js");
    assert.match(offline, /status\(503\)/);
    assert.equal(/INSERT|BEGIN/.test(offline), false);
    assert.equal(demo.includes("signingEnabled"), false);
    assert.equal(fs.existsSync(path.join(root, "src/platform/ops/restoreTenant.js")), false);
    assert.equal(app.includes("/api/v1"), false);
  });
});
