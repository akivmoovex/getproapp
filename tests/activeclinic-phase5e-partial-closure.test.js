"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("ActiveClinic V7 Phase 5E remaining partial closure", () => {
  it("wires P13 structural screens: invite, suspend, role detail, sessions", () => {
    const staffRoutes = read("src/activeclinic/http/activeClinicStaffRoutes.js");
    const accessRoutes = read("src/activeclinic/http/activeClinicAccessRoutes.js");
    const settingsRoutes = read("src/activeclinic/http/activeClinicSettingsRoutes.js");
    const accessLoader = read("src/activeclinic/services/loadActiveClinicAccessScreens.js");

    assert.match(staffRoutes, /\/app\/staff\/invite/);
    assert.match(staffRoutes, /\/app\/staff\/:staffId\/suspend/);
    assert.match(accessRoutes, /\/app\/access\/roles\/:roleKey/);
    assert.match(accessLoader, /loadActiveClinicRoleDetailScreen/);
    assert.match(settingsRoutes, /\/app\/settings\/account\/sessions/);
    assert.match(settingsRoutes, /\/app\/settings\/account\/sessions\/revoke-others/);
    assert.match(settingsRoutes, /hashSessionToken/);

    assert.match(read("views/activeclinic/app/staff-invite-content.ejs"), /staff-invite/);
    assert.match(read("views/activeclinic/app/staff-suspend-content.ejs"), /Confirm suspend/);
    assert.match(read("views/activeclinic/app/access-role-detail-content.ejs"), /access-role-detail/);
    assert.match(read("views/activeclinic/app/settings-account-sessions-content.ejs"), /Active sessions/);
    assert.match(read("views/activeclinic/app/settings-account-content.ejs"), /account\/sessions/);
    assert.match(read("views/activeclinic/app/staff-detail-content.ejs"), /data-ac-suspend-link/);
    assert.match(read("views/activeclinic/app/access-content.ejs"), /\/app\/access\/roles\//);
  });

  it("mapping has zero PARTIAL_IMPLEMENTATION after Phase 5E remap", () => {
    const map = JSON.parse(
      read("docs/activeclinic/stitch/ACTIVECLINIC_STITCH_TO_V7_MAPPING.json")
    );
    const partials = map.mappings.filter((r) => r.mapping_type === "PARTIAL_IMPLEMENTATION");
    assert.equal(
      partials.length,
      0,
      `Unexpected partials: ${partials.map((p) => p.stitch_screen_id).join(",")}`
    );
    assert.ok(map.phase5e_remap);
    assert.equal(map.phase5e_remap.remapped_former_partials, 27);
    assert.equal(map.counts.stitch_screen_coverage.partial, 0);
    assert.equal(map.counts.stitch_screen_coverage.missing, 0);
  });

  it("documents product decisions for matrix and mid-request conflict", () => {
    const map = JSON.parse(
      read("docs/activeclinic/stitch/ACTIVECLINIC_STITCH_TO_V7_MAPPING.json")
    );
    const matrix = map.mappings.find(
      (r) => r.stitch_screen_id === "6b9cfcd190e14155ac4390d66d0cff76"
    );
    const changed = map.mappings.find(
      (r) => r.stitch_screen_id === "ca7cdd02f84f4a13abb5b324f3fb453f"
    );
    assert.equal(matrix.mapping_type, "PRODUCT_DECISION_DIFFERENCE");
    assert.ok(matrix.product_difference);
    assert.equal(changed.mapping_type, "PRODUCT_DECISION_DIFFERENCE");
    assert.ok(changed.product_difference);
  });
});
