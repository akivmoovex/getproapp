"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");

describe("D31 package A contract", () => {
  it("keeps the platform administrator gates on the AC-05 routes", () => {
    const routes = fs.readFileSync(path.join(ROOT, "src/platform/http/platformAdminRoutes.js"), "utf8");
    assert.match(routes, /router\.get\("\/admin", requireApex, requirePlatformAdmin/);
    assert.match(routes, /requirePlatformAdmin/);
    assert.match(routes, /platform_administrator/);
    assert.doesNotMatch(routes, /requirePlatformAdmin\s*=\s*false/);
  });

  it("checks staff overlap only when an appointment has an assigned staff member", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/activeclinic/services/activeClinicAppointmentService.js"),
      "utf8"
    );
    const guard = source.indexOf("if (assignedStaffId)");
    const collision = source.indexOf("repo.findStaffCollision", guard);
    assert.ok(guard > 0);
    assert.ok(collision > guard);
    assert.equal(source.includes("slot_capacity"), false);
    assert.equal(source.includes("FOR UPDATE"), false);
  });

  it("does not issue a portal session from registration", () => {
    const routes = fs.readFileSync(
      path.join(ROOT, "src/activeclinic/http/activeClinicPatientPortalRoutes.js"),
      "utf8"
    );
    const registerStart = routes.indexOf('app.post(\n    "/clinics/:clinicKey/patient/register"');
    const registerEnd = routes.indexOf('app.get("/clinics/:clinicKey/patient/forgot-password"');
    const registerHandler = routes.slice(registerStart, registerEnd);
    assert.ok(registerStart > 0 && registerEnd > registerStart);
    assert.match(registerHandler, /validateCsrf/);
    assert.doesNotMatch(registerHandler, /issueAuthenticatedSessionCookie/);
  });
});
