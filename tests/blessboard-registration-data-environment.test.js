"use strict";

/**
 * Registration data_environment must follow authoritative deployment mode.
 * Production runtimes must never silently default new orgs to testing.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveRegistrationDataEnvironment,
} = require("../src/church/orgDataEnvironment");

describe("resolveRegistrationDataEnvironment", () => {
  it("uses production for moovex-platform-production without PLATFORM_DATA_ENVIRONMENT", () => {
    const env = {
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
      DEPLOYMENT_ENV: "production",
    };
    assert.equal(resolveRegistrationDataEnvironment(env), "production");
  });

  it("uses testing for moovex-platform-testing", () => {
    const env = {
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
      DEPLOYMENT_ENV: "testing",
    };
    assert.equal(resolveRegistrationDataEnvironment(env), "testing");
  });

  it("ignores contradictory PLATFORM_DATA_ENVIRONMENT=testing on production runtime", () => {
    const env = {
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
      DEPLOYMENT_ENV: "production",
      PLATFORM_DATA_ENVIRONMENT: "testing",
    };
    assert.equal(resolveRegistrationDataEnvironment(env), "production");
  });

  it("allows pilot override", () => {
    const env = {
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
      DEPLOYMENT_ENV: "production",
      PLATFORM_DATA_ENVIRONMENT: "pilot",
    };
    assert.equal(resolveRegistrationDataEnvironment(env), "pilot");
  });

  it("falls back from deploymentCode when env profile absent", () => {
    assert.equal(
      resolveRegistrationDataEnvironment({}, { deploymentCode: "moovex-platform-production" }),
      "production"
    );
    assert.equal(
      resolveRegistrationDataEnvironment({}, { deploymentCode: "blessboard-pronline-testing" }),
      "testing"
    );
  });

  it("does not default bare env to testing", () => {
    // getDeploymentEnvMode safe fallback is production when DEPLOYMENT_ENV unset
    assert.equal(resolveRegistrationDataEnvironment({}), "production");
  });
});

describe("apexMarketingRoutes dataEnvironment wiring", () => {
  it("createApexMarketingRouter no longer hardcodes testing fallback string", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.join(__dirname, "../src/blessboard/http/apexMarketingRoutes.js"),
      "utf8"
    );
    assert.doesNotMatch(
      src,
      /PLATFORM_DATA_ENVIRONMENT\s*\|\|\s*env\.DATA_ENVIRONMENT\s*\|\|\s*"testing"/
    );
    assert.match(src, /resolveRegistrationDataEnvironment/);
  });
});
