"use strict";

/**
 * Clinic PA approval must pass a deployment-code string, never the resolver object.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resolveClinicRegistrationDeploymentCode,
} = require("../src/activeclinic/http/activeClinicPlatformAdminClinicRegistrationRoutes");
const {
  requirePlatformDeploymentCode,
} = require("../src/platform/config/platformDeploymentCode");
const { CODE_MOOVEX_PLATFORM_TESTING } = require("../src/platform/config/deploymentProfiles");

describe("clinic registration deployment-code unwrap", () => {
  it("passes the string code from a successful resolver", () => {
    const resolved = resolveClinicRegistrationDeploymentCode({
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.code, "moovex-platform-testing");
    assert.equal(typeof resolved.code, "string");
  });

  it("fails closed when the resolver is unsuccessful", () => {
    const missing = resolveClinicRegistrationDeploymentCode({});
    assert.equal(missing.ok, false);
    assert.equal(missing.error, "deployment_unavailable");
    assert.equal(missing.code, undefined);

    const invalid = resolveClinicRegistrationDeploymentCode({
      PLATFORM_DEPLOYMENT_CODE: "Bad_Code!",
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error, "deployment_unavailable");
    assert.equal(invalid.code, undefined);
  });

  it("never treats the resolver object as a deployment code", () => {
    const resolved = resolveClinicRegistrationDeploymentCode({
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    });
    assert.equal(resolved.ok, true);
    assert.equal(typeof resolved.code, "string");
    assert.equal(resolved.code.includes("[object"), false);
    assert.doesNotMatch(resolved.code, /ok|status/);
  });

  it("does not pass getPlatformDeploymentCode(env) through as deploymentCode", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/activeclinic/http/activeClinicPlatformAdminClinicRegistrationRoutes.js"),
      "utf8"
    );
    assert.doesNotMatch(src, /deploymentCode:\s*getPlatformDeploymentCode\(env\)/);
    assert.match(src, /deploymentCode:\s*deployment\.code/);
    assert.match(src, /requirePlatformDeploymentCode/);
  });

  it("shares requirePlatformDeploymentCode for the testing profile", () => {
    const required = requirePlatformDeploymentCode({
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
    });
    const resolved = resolveClinicRegistrationDeploymentCode({
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(required.ok, true);
    assert.equal(resolved.ok, true);
    assert.equal(required.code, resolved.code);
    assert.equal(required.code, "moovex-platform-testing");
  });
});
