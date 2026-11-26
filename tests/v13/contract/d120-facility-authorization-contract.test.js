"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");
const service = fs.readFileSync(
  path.join(root, "src/activeclinic/services/activeClinicAppointmentService.js"),
  "utf8"
);
const authorization = fs.readFileSync(
  path.join(root, "src/activeclinic/services/activeClinicAuthorizationService.js"),
  "utf8"
);
const routes = fs.readFileSync(
  path.join(root, "src/activeclinic/http/activeClinicAppointmentRoutes.js"),
  "utf8"
);

describe("D120 facility authorization contract", () => {
  it("keeps facility assignment authorization ahead of appointment persistence", () => {
    assert.match(authorization, /FACILITY_ASSIGNMENT_REQUIRED:\s*"facility_assignment_required"/);
    assert.match(service, /resolveFacilityScope/);
    assert.match(service, /if \(!scope\.orgWide && !\(scope\.facilityIds \|\| \[\]\)\.includes\(facilityId\)\)/);

    const createStart = service.indexOf("async function createAppointment(");
    const createBody = service.slice(
      createStart,
      service.indexOf("\nasync function listAppointments", createStart)
    );
    assert.ok(createStart >= 0);
    assert.ok(createBody.indexOf("resolveFacilityScope") < createBody.indexOf("repo.insertAppointment"));
    assert.ok(createBody.indexOf("repo.insertAppointment") >= 0);
  });

  it("does not expose submitted tenant or facility identifiers through the HTTP error mapping", () => {
    const mapperStart = routes.indexOf("function mapApptError");
    const mapperEnd = routes.indexOf(
      "function registerActiveClinicAppointmentRoutes",
      mapperStart
    );
    const mapper = routes.slice(mapperStart, mapperEnd);
    assert.ok(mapperStart >= 0 && mapperEnd > mapperStart);
    assert.doesNotMatch(mapper, /facility_assignment_required/);
    assert.doesNotMatch(mapper, /display_name|patient/);

    const createStart = routes.indexOf("const created = await createAppointment");
    const createCall = routes.slice(createStart, createStart + 900);
    assert.match(createCall, /organizationId:\s*auth\.organization\.id/);
    assert.match(createCall, /healthcareOrganizationId:\s*auth\.healthcareOrganization\.id/);
    assert.doesNotMatch(createCall, /organizationId:\s*values\.organizationId/);
  });
});
