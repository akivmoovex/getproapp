"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  purgeActiveClinicTestingOrganization,
  STATUS,
  EXPECTED_IDENTITY_KEY,
} = require("../src/activeclinic/services/purgeActiveClinicTestingOrganization");
const {
  publicFixtureRecord,
  hostedQaEnv,
  TOOL,
} = require("../src/activeclinic/qa/activeClinicHostedAuthQaFixture");
const { RESERVED_ORGANIZATION_KEYS } = require("../src/activeclinic/repositories/activeClinicTestingPurgeRepository");
const { CODE_MOOVEX_PLATFORM_TESTING } = require("../src/platform/config/deploymentProfiles");

const TESTING_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  DATABASE_IDENTITY_EXPECTED: EXPECTED_IDENTITY_KEY,
});

describe("ActiveClinic hosted auth QA safety", () => {
  it("strips passwords from public fixture records", () => {
    const publicRecord = publicFixtureRecord({
      ok: true,
      organizationKey: "ac-hqa-example",
      clinicKey: "ac-hqa-example",
      adminEmail: "hosted-qa@example.invalid",
      password: "should-not-leak",
    });
    assert.equal(publicRecord.passwordSet, true);
    assert.equal(Object.prototype.hasOwnProperty.call(publicRecord, "password"), false);
    assert.equal(publicRecord.tool, TOOL);
  });

  it("hosted QA env forces testing deployment", () => {
    const env = hostedQaEnv({ DEPLOYMENT_ENV: "production", PLATFORM_DEPLOYMENT_CODE: "x" });
    assert.equal(env.DEPLOYMENT_ENV, "testing");
    assert.equal(env.DATABASE_IDENTITY_EXPECTED, EXPECTED_IDENTITY_KEY);
  });

  it("refuses production deployment environment", async () => {
    const result = await purgeActiveClinicTestingOrganization(
      { query: async () => ({ rows: [] }) },
      { organizationKey: "ac-hqa-example", dryRun: true },
      { ...TESTING_ENV, DEPLOYMENT_ENV: "production" }
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.FORBIDDEN);
    assert.equal(result.reason, "deployment_env_not_testing");
  });

  it("will not purge reserved demo tenants", () => {
    assert.ok(RESERVED_ORGANIZATION_KEYS.includes("activeclinic-demo"));
    assert.ok(RESERVED_ORGANIZATION_KEYS.includes("julflona-clinic"));
  });
});
