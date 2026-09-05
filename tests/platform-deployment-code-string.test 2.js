"use strict";

/**
 * String-only deployment-code access. Never treats the resolver object as a code.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getPlatformDeploymentCode,
  requirePlatformDeploymentCode,
} = require("../src/platform/config/platformDeploymentCode");
const { CODE_MOOVEX_PLATFORM_TESTING } = require("../src/platform/config/deploymentProfiles");

const OPERATIONAL_ROUTE_FILES = [
  "src/activeclinic/http/activeClinicAppointmentRoutes.js",
  "src/activeclinic/http/activeClinicBookingLinkageRoutes.js",
  "src/activeclinic/http/activeClinicDiagnosticsRoutes.js",
  "src/activeclinic/http/activeClinicReceptionRoutes.js",
  "src/activeclinic/http/activeClinicClinicalRoutes.js",
];

describe("requirePlatformDeploymentCode", () => {
  it("returns only the string code from a successful resolver", () => {
    const env = { PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING };
    const full = getPlatformDeploymentCode(env);
    const required = requirePlatformDeploymentCode(env);
    assert.equal(full.ok, true);
    assert.equal(typeof full, "object");
    assert.equal(required.ok, true);
    assert.equal(required.code, "moovex-platform-testing");
    assert.equal(typeof required.code, "string");
    assert.notEqual(required.code, full);
  });

  it("fails closed without a fallback code", () => {
    const missing = requirePlatformDeploymentCode({});
    assert.equal(missing.ok, false);
    assert.equal(missing.code, null);
    assert.equal(missing.status, "unavailable");

    const invalid = requirePlatformDeploymentCode({ PLATFORM_DEPLOYMENT_CODE: "Bad_Code!" });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, null);
    assert.equal(invalid.status, "invalid");
  });

  it("never stringifies the resolver object", () => {
    const required = requirePlatformDeploymentCode({
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    });
    assert.equal(String(required.code).includes("[object"), false);
  });
});

describe("ActiveClinic operational deployment-code call sites", () => {
  it("does not use the truthy-object fallback to v6", () => {
    for (const rel of OPERATIONAL_ROUTE_FILES) {
      const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
      assert.doesNotMatch(
        src,
        /getPlatformDeploymentCode\(env\)\s*\|\|/,
        rel
      );
      assert.match(src, /requirePlatformDeploymentCode\(env\)\.code/, rel);
      assert.doesNotMatch(src, /deploymentCode:\s*getPlatformDeploymentCode\(env\)/, rel);
    }
  });
});
