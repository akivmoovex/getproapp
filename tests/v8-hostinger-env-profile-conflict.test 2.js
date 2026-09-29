"use strict";

/**
 * V8 Hostinger env profile conflict — stale moovex-platform-testing + BASE_DOMAIN=neuniversity.org.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  applyV8HostingerStaleDeploymentCodeCompat,
  evaluateV8HostingerStaleDeploymentCodeCompat,
  shouldPreferNeuniversityProductionEnvFiles,
  V8_CANONICAL_DOMAIN,
} = require("../src/platform/config/v8HostingerEnvCompat");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  CODE_MOOVEX_PLATFORM_PRODUCTION,
  MOOVEX_PLATFORM_IDENTITY_KEY,
  getDeploymentProfile,
  validateAuthoritativeProfileCompatibility,
} = require("../src/platform/config/deploymentProfiles");
const {
  resolveCanonicalHost,
} = require("../src/platform/config/canonicalHostRegistry");
const {
  resolvePlatformRequestContext,
} = require("../src/platform/http/platformRequestContext");
const {
  buildProductionFallbackCandidates,
} = require("../src/startup/bootstrap");

const SHARED_DB = Object.freeze({
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

function v8IntentStaleV7Code(extra) {
  return {
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "testing",
    PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
    BASE_DOMAIN: V8_CANONICAL_DOMAIN,
    DATABASE_URL: "postgres://unused/local",
    SESSION_SECRET: "v8-hostinger-compat-secret-0123456789abcdef",
    ...SHARED_DB,
    ...(extra || {}),
  };
}

describe("V8 Hostinger env profile conflict compat", () => {
  it("reproduces FATAL BASE_DOMAIN conflict before compat (regression)", () => {
    const env = v8IntentStaleV7Code();
    const before = validateAuthoritativeProfileCompatibility(env);
    assert.equal(before.ok, false);
    assert.equal(before.code, "base_domain_conflict");
    assert.match(String(before.message), /neuniversity\.org/);
    assert.match(String(before.message), /pronline\.org/);
  });

  it("remaps stale V7 testing code to V8 when BASE_DOMAIN=neuniversity.org", () => {
    const env = v8IntentStaleV7Code();
    const result = applyV8HostingerStaleDeploymentCodeCompat(env, { log: false });
    assert.equal(result.applied, true);
    assert.equal(env.PLATFORM_DEPLOYMENT_CODE, CODE_MOOVEX_PLATFORM_V8_TESTING);
    const after = validateAuthoritativeProfileCompatibility(env);
    assert.equal(after.ok, true, after.message);
    assert.equal(getDeploymentProfile(env).deploymentCode, CODE_MOOVEX_PLATFORM_V8_TESTING);
    assert.equal(getDeploymentProfile(env).canonicalDomain, "neuniversity.org");
  });

  it("correct V8 profile + neuniversity.org still PASSes without remap", () => {
    const env = v8IntentStaleV7Code({
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
    });
    const decision = evaluateV8HostingerStaleDeploymentCodeCompat(env);
    assert.equal(decision.eligible, false);
    assert.equal(decision.reason, "already_v8_testing");
    assert.equal(validateAuthoritativeProfileCompatibility(env).ok, true);
  });

  it("correct V7 profile + pronline.org PASSes and is not remapped", () => {
    const env = {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "testing",
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
      BASE_DOMAIN: "pronline.org",
      DATABASE_URL: "postgres://unused/local",
      SESSION_SECRET: "v7-hostinger-compat-secret-0123456789abcdef",
      ...SHARED_DB,
    };
    const result = applyV8HostingerStaleDeploymentCodeCompat(env, { log: false });
    assert.equal(result.applied, false);
    assert.equal(env.PLATFORM_DEPLOYMENT_CODE, CODE_MOOVEX_PLATFORM_TESTING);
    assert.equal(validateAuthoritativeProfileCompatibility(env).ok, true);
  });

  it("does not remap production deployment with neuniversity.org", () => {
    const env = v8IntentStaleV7Code({
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_PRODUCTION,
      DEPLOYMENT_ENV: "production",
      DATABASE_IDENTITY_ENV: "production",
    });
    const result = applyV8HostingerStaleDeploymentCodeCompat(env, { log: false });
    assert.equal(result.applied, false);
    assert.equal(result.reason, "not_stale_v7_testing_code");
  });

  it("rejects unknown deployment profile without remapping", () => {
    const env = v8IntentStaleV7Code({
      PLATFORM_DEPLOYMENT_CODE: "not-a-real-profile",
    });
    assert.equal(applyV8HostingerStaleDeploymentCodeCompat(env, { log: false }).applied, false);
    assert.equal(validateAuthoritativeProfileCompatibility(env).ok, false);
  });

  it("does not invent a deployment identity when PLATFORM_DEPLOYMENT_CODE is missing", () => {
    const env = v8IntentStaleV7Code({
      PLATFORM_DEPLOYMENT_CODE: "",
    });
    const result = applyV8HostingerStaleDeploymentCodeCompat(env, { log: false });
    assert.equal(result.applied, false);
    assert.equal(result.reason, "missing_deployment_code");
  });

  it("does not remap based on hostname spoofing alone (requires BASE_DOMAIN)", () => {
    const env = {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "testing",
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
      // BASE_DOMAIN intentionally absent / wrong
      BASE_DOMAIN: "evil.example.com",
      DATABASE_URL: "postgres://unused/local",
      SESSION_SECRET: "v8-hostinger-compat-secret-0123456789abcdef",
      ...SHARED_DB,
    };
    assert.equal(applyV8HostingerStaleDeploymentCodeCompat(env, { log: false }).applied, false);
    const ctx = resolvePlatformRequestContext({
      env,
      hostname: "blessboard.neuniversity.org",
    });
    // Spoofed Host is still rejected by deployment allowlist under V7 profile.
    assert.equal(ctx.ok, false);
  });

  it("rejects incorrect database identity and does not remap into production identity", () => {
    const env = v8IntentStaleV7Code({
      DATABASE_IDENTITY_EXPECTED: "some-other-identity",
    });
    assert.equal(applyV8HostingerStaleDeploymentCodeCompat(env, { log: false }).applied, false);

    const prodId = v8IntentStaleV7Code({
      DATABASE_IDENTITY_ENV: "production",
    });
    assert.equal(applyV8HostingerStaleDeploymentCodeCompat(prodId, { log: false }).applied, false);

    const weirdDep = v8IntentStaleV7Code({ DEPLOYMENT_ENV: "staging" });
    assert.equal(
      applyV8HostingerStaleDeploymentCodeCompat(weirdDep, { log: false }).reason,
      "deployment_env_not_testing"
    );

    const weirdId = v8IntentStaleV7Code({ DATABASE_IDENTITY_ENV: "staging" });
    assert.equal(
      applyV8HostingerStaleDeploymentCodeCompat(weirdId, { log: false }).reason,
      "identity_env_not_testing"
    );
  });

  it("logs a non-secret remap warning when applied", () => {
    const env = v8IntentStaleV7Code();
    const lines = [];
    const result = applyV8HostingerStaleDeploymentCodeCompat(env, {
      log: true,
      warnFn: (msg) => lines.push(String(msg)),
    });
    assert.equal(result.applied, true);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /v8HostingerEnvCompat/);
    assert.match(lines[0], /moovex-platform-v8-testing/);
    assert.doesNotMatch(lines[0], /postgres/i);
    assert.doesNotMatch(lines[0], /SESSION_SECRET/);
  });

  it("BlessBoard and ActiveClinic V8 hostnames resolve after compat remap", () => {
    const env = v8IntentStaleV7Code();
    applyV8HostingerStaleDeploymentCodeCompat(env, { log: false });
    assert.equal(resolveCanonicalHost("blessboard.neuniversity.org").site.productKey, "blessboard");
    assert.equal(resolveCanonicalHost("activeclinic.neuniversity.org").site.productKey, "activeclinic");
    const bb = resolvePlatformRequestContext({
      env,
      hostname: "blessboard.neuniversity.org",
    });
    const ac = resolvePlatformRequestContext({
      env,
      hostname: "activeclinic.neuniversity.org",
    });
    assert.equal(bb.ok, true);
    assert.equal(bb.platform.productKey, "blessboard");
    assert.equal(ac.ok, true);
    assert.equal(ac.platform.productKey, "activeclinic");
  });

  it("keeps shared database identity compatible with V7 after remap", () => {
    const env = v8IntentStaleV7Code();
    applyV8HostingerStaleDeploymentCodeCompat(env, { log: false });
    const profile = getDeploymentProfile(env);
    assert.equal(profile.expectedIdentityKey, MOOVEX_PLATFORM_IDENTITY_KEY);
    assert.equal(profile.expectedDatabaseEnvironment, "testing");
    assert.notEqual(profile.deploymentCode, CODE_MOOVEX_PLATFORM_TESTING);
  });

  it("skips pronline production env-file candidates when BASE_DOMAIN is neuniversity.org", () => {
    const prevBase = process.env.BASE_DOMAIN;
    const prevCode = process.env.PLATFORM_DEPLOYMENT_CODE;
    process.env.BASE_DOMAIN = "neuniversity.org";
    process.env.PLATFORM_DEPLOYMENT_CODE = CODE_MOOVEX_PLATFORM_TESTING;
    try {
      assert.equal(shouldPreferNeuniversityProductionEnvFiles(process.env, "/app"), true);
      const ordered = buildProductionFallbackCandidates("/app", "/app", "lsnode.js");
      assert.ok(ordered.some((p) => p.includes("neuniversity")));
      assert.equal(
        ordered.some((p) => p.includes("/pronline/") || p.endsWith(".env.production.pronline")),
        false
      );
    } finally {
      if (prevBase === undefined) delete process.env.BASE_DOMAIN;
      else process.env.BASE_DOMAIN = prevBase;
      if (prevCode === undefined) delete process.env.PLATFORM_DEPLOYMENT_CODE;
      else process.env.PLATFORM_DEPLOYMENT_CODE = prevCode;
    }
  });
});
