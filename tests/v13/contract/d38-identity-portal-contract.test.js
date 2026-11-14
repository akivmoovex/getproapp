"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("D38 identity contract", () => {
  it("keeps AC-05 on the test-database routes", () => {
    const routes = read("src/platform/http/platformAdminRoutes.js");
    assert.match(routes, /router\.get\("\/admin", requireApex, requirePlatformAdmin/);
    for (const route of [
      '"/admin/settings/test-database"',
      '"/admin/settings/test-database/preview"',
    ]) {
      const at = routes.indexOf(route);
      assert.ok(at > 0, route);
      const slice = routes.slice(Math.max(0, at - 80), at + 220);
      assert.match(slice, /requireApex/);
      assert.match(slice, /requirePlatformAdmin/);
    }
    assert.match(
      read("src/platform/rbac/platformAdminAuthorization.js"),
      /platform_administrator/
    );
  });

  it("binds guest registration to the clinic organization and claims a booking once", () => {
    const service = read("src/activeclinic/services/activeClinicPatientPortalRegistrationService.js");
    const routes = read("src/activeclinic/http/activeClinicPatientPortalRoutes.js");
    const registerStart = routes.indexOf('app.post(\n    "/clinics/:clinicKey/patient/register"');
    const registerEnd = routes.indexOf('app.get("/clinics/:clinicKey/patient/forgot-password"');
    const handler = routes.slice(registerStart, registerEnd);
    assert.match(handler, /organizationId: clinic\.organizationId/);
    assert.match(handler, /validateCsrf/);
    assert.doesNotMatch(handler, /issueAuthenticatedSessionCookie/);
    assert.match(service, /FOR UPDATE/);
    assert.match(service, /portal_platform_identity_id IS NULL/);
    assert.match(service, /platform_identity_id IS NULL/);
    assert.doesNotMatch(
      read("src/activeclinic/services/activeClinicPublicBookingLookupService.js"),
      /revoked_at = now\(\)/
    );
  });

  it("does not grant a clinical role or open a migration", () => {
    const service = read("src/activeclinic/services/activeClinicPatientPortalRegistrationService.js");
    assert.doesNotMatch(service, /activeclinic_organization_admin/);
    assert.doesNotMatch(service, /CREATE TABLE/i);
    assert.equal(
      fs.existsSync(path.join(root, "db/migrations/platform/048_otp_challenges.sql")),
      false
    );
  });
});
