"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "src/activeclinic/http/activeClinicFacilityRoutes.js"), "utf8");
const service = fs.readFileSync(path.join(root, "src/activeclinic/services/facilityService.js"), "utf8");
const screens = fs.readFileSync(path.join(root, "src/activeclinic/services/loadActiveClinicFacilityScreens.js"), "utf8");
const detail = fs.readFileSync(path.join(root, "views/activeclinic/app/facility-detail-content.ejs"), "utf8");

describe("V2.07 ActiveClinic facility lifecycle contracts", () => {
  it("covers explicit edit and lifecycle actions", () => {
    assert.match(routes, /\/app\/facilities\/:facilityKey/);
    assert.match(routes, /\/app\/facilities\/:facilityKey\/status/);
    assert.match(routes, /"active"/);
    assert.match(routes, /"inactive"/);
    assert.match(routes, /"suspended"/);
    assert.match(routes, /confirm_archive/);
    assert.match(routes, /replacementFacilityId/);
  });

  it("protects primary and archived facilities", () => {
    assert.match(service, /isPrimary/);
    assert.match(service, /PRIMARY_CONFLICT/);
    assert.match(service, /existing\.facility\.status === "archived"/);
    assert.match(service, /setPrimaryFacility/);
  });

  it("keeps lifecycle operations organization-scoped", () => {
    assert.match(routes, /req\.activeClinicAuth\.organization\.id/);
    assert.match(service, /getFacilityByIdAndOrganization/);
    assert.match(service, /organizationId/);
  });

  it("covers assignment/view-all visibility and impact counts", () => {
    assert.match(screens, /listFacilitiesForStaff/);
    assert.match(screens, /facility\.view_all/);
    assert.match(screens, /activeStaff/);
    assert.match(screens, /activeDepartments/);
    assert.match(screens, /rooms/);
    assert.match(detail, /Operational impact/);
  });
});
