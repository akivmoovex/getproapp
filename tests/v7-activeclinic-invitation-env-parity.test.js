"use strict";

/**
 * ActiveClinic invitation / reset URL env parity.
 * Simulation only — no production HTTP requests or writes.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  resolvePublicOrigin,
  buildActivationUrl,
  buildResetPasswordUrl,
} = require("../src/activeclinic/services/activeClinicShareLinks");

const TESTING_ORIGIN = "https://activeclinic.pronline.org";
const PRODUCTION_ORIGIN = "https://activeclinic.org";

describe("ActiveClinic invitation env parity (simulation)", () => {
  it("moovex-platform-testing → ActiveClinic testing host (not pronline.org apex)", () => {
    const env = {
      DEPLOYMENT_ENV: "testing",
      NODE_ENV: "production",
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
      DATABASE_IDENTITY_ENV: "testing",
    };
    const origin = resolvePublicOrigin(env, "moovex-platform-testing");
    assert.equal(origin, TESTING_ORIGIN);
    assert.equal(
      buildActivationUrl({ env, deploymentCode: "moovex-platform-testing", rawToken: "tok-qa" }),
      `${TESTING_ORIGIN}/activate/tok-qa`
    );
    assert.equal(
      buildResetPasswordUrl({
        env,
        deploymentCode: "moovex-platform-testing",
        rawToken: "rst-qa",
      }),
      `${TESTING_ORIGIN}/reset-password/rst-qa`
    );
  });

  it("activeclinic-pronline-testing → ActiveClinic testing host", () => {
    const env = {
      DEPLOYMENT_ENV: "testing",
      NODE_ENV: "production",
      PLATFORM_DEPLOYMENT_CODE: "activeclinic-pronline-testing",
    };
    assert.equal(
      resolvePublicOrigin(env, "activeclinic-pronline-testing"),
      TESTING_ORIGIN
    );
  });

  it("production profile host activeclinic.org (simulation only)", () => {
    const env = {
      DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
      PLATFORM_DEPLOYMENT_CODE: "activeclinic-org-production",
      DATABASE_IDENTITY_ENV: "production",
    };
    const origin = resolvePublicOrigin(env, "activeclinic-org-production");
    assert.equal(origin, PRODUCTION_ORIGIN);
    assert.equal(
      buildActivationUrl({
        env,
        deploymentCode: "activeclinic-org-production",
        rawToken: "tok-prod-sim",
      }),
      `${PRODUCTION_ORIGIN}/activate/tok-prod-sim`
    );
    assert.equal(
      buildResetPasswordUrl({
        env,
        deploymentCode: "activeclinic-org-production",
        rawToken: "rst-prod-sim",
      }),
      `${PRODUCTION_ORIGIN}/reset-password/rst-prod-sim`
    );
  });

  it("moovex-platform-production → ActiveClinic production host (not moovex.org)", () => {
    const env = {
      DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
    };
    assert.equal(
      resolvePublicOrigin(env, "moovex-platform-production"),
      PRODUCTION_ORIGIN
    );
  });

  it("legacy activeclinic-org-v6 under testing env does not emit production host", () => {
    const env = {
      DEPLOYMENT_ENV: "testing",
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: "activeclinic-org-v6",
    };
    assert.equal(resolvePublicOrigin(env, "activeclinic-org-v6"), TESTING_ORIGIN);
  });

  it("ACTIVECLINIC_PUBLIC_ORIGIN override wins", () => {
    const env = {
      DEPLOYMENT_ENV: "testing",
      NODE_ENV: "production",
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
      ACTIVECLINIC_PUBLIC_ORIGIN: "https://activeclinic.pronline.org",
    };
    assert.equal(resolvePublicOrigin(env, "moovex-platform-testing"), TESTING_ORIGIN);
  });

  it("explicit publicOrigin on builders wins over env", () => {
    assert.equal(
      buildActivationUrl({
        publicOrigin: "https://activeclinic.org",
        env: { DEPLOYMENT_ENV: "testing" },
        deploymentCode: "moovex-platform-testing",
        rawToken: "x",
      }),
      "https://activeclinic.org/activate/x"
    );
  });
});
