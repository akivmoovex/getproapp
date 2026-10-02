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

  it("cleanup refuses demo tenants and any key outside the hosted QA prefix", async () => {
    const { cleanupHostedAuthQaClinic, isHostedQaOrganizationKey } = require("../src/activeclinic/qa/activeClinicHostedAuthQaFixture");
    assert.equal(isHostedQaOrganizationKey("ac-hqa-example"), true);
    assert.equal(isHostedQaOrganizationKey("hosted-qa-example"), true);
    assert.equal(isHostedQaOrganizationKey("activeclinic-demo"), false);
    const demo = await cleanupHostedAuthQaClinic(
      { query: async () => ({ rows: [] }) },
      "activeclinic-demo",
      TESTING_ENV
    );
    assert.equal(demo.ok, false);
    assert.equal(demo.reason, "organization_key_not_hosted_qa_prefix");
    const other = await cleanupHostedAuthQaClinic(
      { query: async () => ({ rows: [] }) },
      "qa-purge-example",
      TESTING_ENV
    );
    assert.equal(other.ok, false);
    assert.equal(other.reason, "organization_key_not_hosted_qa_prefix");
    assert.ok(RESERVED_ORGANIZATION_KEYS.includes("activeclinic-demo"));
    assert.ok(RESERVED_ORGANIZATION_KEYS.includes("julflona-clinic"));
  });

  it("website publish helper refuses demo and unrelated tenants", async () => {
    const { publishHostedAuthQaWebsite } = require("../src/activeclinic/qa/activeClinicHostedAuthQaFixture");
    const demo = await publishHostedAuthQaWebsite(
      { query: async () => ({ rows: [{ organization_key: "activeclinic-demo" }] }) },
      { organizationId: "00000000-0000-4000-8000-000000000001", organizationKey: "activeclinic-demo" },
      TESTING_ENV
    );
    assert.equal(demo.ok, false);
    assert.equal(demo.reason, "organization_key_not_hosted_qa_prefix");
    const mismatch = await publishHostedAuthQaWebsite(
      { query: async () => ({ rows: [{ organization_key: "ac-hqa-other" }] }) },
      { organizationId: "00000000-0000-4000-8000-000000000001", organizationKey: "ac-hqa-example" },
      TESTING_ENV
    );
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.reason, "organization_key_mismatch");
  });

  it("refuses unexpected database identity expectation", async () => {
    const result = await purgeActiveClinicTestingOrganization(
      { query: async () => ({ rows: [] }) },
      { organizationKey: "ac-hqa-example", dryRun: true },
      { ...TESTING_ENV, DATABASE_IDENTITY_EXPECTED: "moovex-platform-production" }
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.IDENTITY_BLOCKED);
  });
});

describe("ActiveClinic hosted auth QA client", () => {
  it("treats testing platform sid/csrf cookies as the session pair", () => {
    const { CookieJar } = require("../src/activeclinic/qa/activeClinicHostedAuthQaClient");
    const jar = new CookieJar();
    jar.absorb([
      "moovex_platform_testing_sid=placeholder; Path=/; HttpOnly; Secure; SameSite=Lax",
      "moovex_platform_testing_csrf=placeholder; Path=/; Secure; SameSite=Lax",
    ]);
    assert.equal(jar.sessionPresent(), true);
    assert.equal(jar.csrf(), "placeholder");
    assert.equal(jar.names().includes("blessboard_org_csrf"), false);
  });

  it("last Set-Cookie for a name wins within one absorb", () => {
    const { CookieJar } = require("../src/activeclinic/qa/activeClinicHostedAuthQaClient");
    const expireThenSet = new CookieJar();
    expireThenSet.absorb([
      "moovex_platform_testing_sid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
      "moovex_platform_testing_sid=token; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
    assert.equal(expireThenSet.sessionPresent(), true);
    const setThenExpire = new CookieJar();
    setThenExpire.absorb([
      "moovex_platform_testing_sid=token; Path=/; HttpOnly; Secure; SameSite=Lax",
      "moovex_platform_testing_sid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    ]);
    assert.equal(setThenExpire.sessionPresent(), false);
  });

  it("classifies staff session probe with no login redirects as not reproduced", () => {
    const { classifySessionFlake } = require("../src/activeclinic/qa/activeClinicHostedAuthQaReleaseFlows");
    const result = classifySessionFlake([
      {
        loginRedirect: false,
        sessionAfterLogin: true,
        sessionAfterOnboarding: true,
      },
    ]);
    assert.equal(result.classification, "NOT_REPRODUCED");
    assert.equal(result.reproduced, false);
  });

  it("classifies /app login redirect with live /app/onboarding session as hosting race", () => {
    const { classifySessionFlake } = require("../src/activeclinic/qa/activeClinicHostedAuthQaReleaseFlows");
    const result = classifySessionFlake([
      {
        loginRedirect: true,
        sessionAfterLogin: true,
        sessionAfterOnboarding: true,
        appStatus: 303,
        appLocation: "/login",
        onboardingStatus: 200,
      },
    ]);
    assert.equal(result.classification, "HOSTING_RACE");
    assert.match(result.reason, /app_login_redirect/);
  });

  it("classifies login redirects on both /app and /app/onboarding as a real session defect", () => {
    const { classifySessionFlake } = require("../src/activeclinic/qa/activeClinicHostedAuthQaReleaseFlows");
    const result = classifySessionFlake([
      {
        loginRedirect: true,
        sessionAfterLogin: true,
        sessionAfterOnboarding: true,
        appStatus: 303,
        appLocation: "/login",
        onboardingStatus: 303,
        onboardingLocation: "/login",
      },
    ]);
    assert.equal(result.classification, "REAL_SESSION_DEFECT");
  });

  it("wrong-clinic patient 403 does not clear the clinic A session cookie", () => {
    const {
      createRequireActiveClinicPatientAuth,
    } = require("../src/activeclinic/http/loadActiveClinicPatientAuth");
    const mw = createRequireActiveClinicPatientAuth({
      loginPath: "/login",
      isProduction: false,
      env: { PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing" },
    });
    const cleared = [];
    const req = {
      activeClinicPatientAuth: {
        authenticated: false,
        reason: "wrong_clinic_context",
        clinicKey: "clinic-a",
      },
      params: { clinicKey: "clinic-b" },
      accepts() {
        return true;
      },
    };
    const res = {
      statusCode: 0,
      headers: {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      type() {
        return this;
      },
      send() {
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      getHeader(name) {
        return this.headers[name];
      },
      clearCookie(name) {
        cleared.push(name);
      },
    };
    mw(req, res, () => {
      throw new Error("should not next");
    });
    assert.equal(res.statusCode, 403);
    assert.equal(cleared.length, 0);
    assert.match(String(res.headers["Cache-Control"] || ""), /no-store/);
  });
});
