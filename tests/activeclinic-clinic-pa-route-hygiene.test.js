"use strict";

/**
 * Clinic PA route-location hygiene. No database.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("ActiveClinic clinic PA route hygiene", () => {
  it("keeps clinic-registration URLs out of website-admin routes", () => {
    const website = read("src/platform/http/platformWebsiteAdminRoutes.js");
    const clinic = read(
      "src/activeclinic/http/activeClinicPlatformAdminClinicRegistrationRoutes.js"
    );
    const admin = read("src/platform/http/platformAdminRoutes.js");
    assert.doesNotMatch(website, /\/admin\/clinic-registrations/);
    assert.match(website, /\/admin\/website-changes/);
    assert.match(clinic, /\/admin\/clinic-registrations/);
    assert.match(clinic, /\/admin\/clinic-registrations\/:applicationId\/approve/);
    assert.match(clinic, /\/admin\/clinic-registrations\/:applicationId\/request-information/);
    assert.match(clinic, /\/admin\/clinic-registrations\/:applicationId\/information-returned/);
    assert.match(clinic, /\/admin\/clinic-registrations\/:applicationId\/notes/);
    assert.match(clinic, /\/admin\/clinic-registrations\/:applicationId\/reject/);
    assert.match(admin, /registerActiveClinicPlatformAdminClinicRegistrationRoutes/);
    assert.match(admin, /registerPlatformWebsiteAdminRoutes/);
    const clinicRegistrations = admin.split("registerActiveClinicPlatformAdminClinicRegistrationRoutes");
    assert.equal(clinicRegistrations.length, 3);
    assert.doesNotMatch(clinic, /deploymentCode:\s*getPlatformDeploymentCode\(env\)/);
    assert.match(clinic, /resolveClinicRegistrationDeploymentCode/);
  });
});
