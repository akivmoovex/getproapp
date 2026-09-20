"use strict";

/**
 * V8 deployment-profile verification — BASE_DOMAIN, hosts, DB identity vs V7.
 * Application deployment identity ≠ database identity.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  CODE_MOOVEX_PLATFORM_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
  getDeploymentProfile,
  validateAuthoritativeProfileCompatibility,
  resolveDeploymentConfiguration,
  DEPLOYMENT_PROFILES,
} = require("../src/platform/config/deploymentProfiles");
const {
  resolveCanonicalHost,
} = require("../src/platform/config/canonicalHostRegistry");
const {
  resolvePlatformRequestContext,
} = require("../src/platform/http/platformRequestContext");
const {
  assertV8EnvironmentSafeOrError,
  isV8Deployment,
} = require("../src/platform/config/v8DeploymentIsolation");

const V8_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  BASE_DOMAIN: "neuniversity.org",
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v8-profile-verify-session-secret-0123456789abcdef",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

const V7_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  BASE_DOMAIN: "pronline.org",
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v7-profile-verify-session-secret-0123456789abcdef",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

describe("V8 deployment profile", () => {
  it("registers moovex-platform-v8-testing with BASE_DOMAIN=neuniversity.org", () => {
    assert.ok(DEPLOYMENT_PROFILES[CODE_MOOVEX_PLATFORM_V8_TESTING]);
    const profile = getDeploymentProfile(V8_ENV);
    assert.equal(profile.deploymentCode, CODE_MOOVEX_PLATFORM_V8_TESTING);
    assert.equal(profile.canonicalDomain, "neuniversity.org");
    assert.equal(profile.deploymentEnvironment, "testing");
    assert.equal(profile.platformLine, "v8");
    assert.equal(profile.productSelection, "hostname");
    assert.equal(profile.expectedIdentityKey, MOOVEX_PLATFORM_IDENTITY_KEY);
    assert.equal(profile.expectedDatabaseEnvironment, "testing");

    const compat = validateAuthoritativeProfileCompatibility(V8_ENV);
    assert.equal(compat.ok, true, compat.message);

    const cfg = resolveDeploymentConfiguration(V8_ENV);
    assert.equal(cfg.canonicalDomain, "neuniversity.org");
    assert.equal(cfg.platformLine, "v8");
    assert.equal(assertV8EnvironmentSafeOrError(V8_ENV).ok, true);
    assert.equal(isV8Deployment(V8_ENV), true);
  });

  it("accepts BASE_DOMAIN=neuniversity.org and rejects pronline.org on V8", () => {
    const ok = validateAuthoritativeProfileCompatibility({
      ...V8_ENV,
      BASE_DOMAIN: "neuniversity.org",
    });
    assert.equal(ok.ok, true);

    const missingOk = validateAuthoritativeProfileCompatibility({
      ...V8_ENV,
      BASE_DOMAIN: undefined,
    });
    assert.equal(missingOk.ok, true);

    const reject = validateAuthoritativeProfileCompatibility({
      ...V8_ENV,
      BASE_DOMAIN: "pronline.org",
    });
    assert.equal(reject.ok, false);
    assert.equal(reject.code, "base_domain_conflict");
    assert.match(String(reject.message), /neuniversity\.org/);
  });

  it("V7 profile accepts BASE_DOMAIN=pronline.org and is unchanged", () => {
    const profile = getDeploymentProfile(V7_ENV);
    assert.equal(profile.deploymentCode, CODE_MOOVEX_PLATFORM_TESTING);
    assert.equal(profile.canonicalDomain, "pronline.org");
    assert.equal(profile.platformLine, "v7");
    assert.equal(profile.mediaWriteNamespace, "testing");
    assert.equal(profile.sessionCookieName, "moovex_platform_testing_sid");
    assert.ok(profile.apexDomains.includes("blessboard.pronline.org"));
    assert.ok(profile.apexDomains.includes("activeclinic.pronline.org"));
    assert.equal(profile.apexDomains.includes("blessboard.neuniversity.org"), false);

    const compat = validateAuthoritativeProfileCompatibility(V7_ENV);
    assert.equal(compat.ok, true, compat.message);

    const rejectV8Base = validateAuthoritativeProfileCompatibility({
      ...V7_ENV,
      BASE_DOMAIN: "neuniversity.org",
    });
    assert.equal(rejectV8Base.ok, false);
    assert.equal(rejectV8Base.code, "base_domain_conflict");
  });

  it("V7 profile rejects V8 hosts; V8 profile rejects V7 hosts", () => {
    const v8OnPronline = resolvePlatformRequestContext({
      env: V8_ENV,
      hostname: "blessboard.pronline.org",
    });
    assert.equal(v8OnPronline.ok, false);
    assert.equal(v8OnPronline.code, "PLATFORM_HOST_NOT_IN_DEPLOYMENT");

    const v7OnNeuni = resolvePlatformRequestContext({
      env: V7_ENV,
      hostname: "blessboard.neuniversity.org",
    });
    assert.equal(v7OnNeuni.ok, false);
    assert.equal(v7OnNeuni.code, "PLATFORM_HOST_NOT_IN_DEPLOYMENT");
  });

  it("BlessBoard V8 hostname resolves to blessboard product", () => {
    const host = resolveCanonicalHost("blessboard.neuniversity.org");
    assert.equal(host.ok, true);
    assert.equal(host.site.productKey, "blessboard");
    assert.equal(host.site.platformLine, "v8");

    const ctx = resolvePlatformRequestContext({
      env: V8_ENV,
      hostname: "blessboard.neuniversity.org",
    });
    assert.equal(ctx.ok, true);
    assert.equal(ctx.platform.productKey, "blessboard");
    assert.equal(ctx.platform.platformLine, "v8");
    assert.equal(ctx.platform.sessionCookieName, "moovex_platform_v8_testing_sid");
  });

  it("ActiveClinic V8 hostname resolves to activeclinic product", () => {
    const host = resolveCanonicalHost("activeclinic.neuniversity.org");
    assert.equal(host.ok, true);
    assert.equal(host.site.productKey, "activeclinic");
    assert.equal(host.site.platformLine, "v8");

    const ctx = resolvePlatformRequestContext({
      env: V8_ENV,
      hostname: "activeclinic.neuniversity.org",
    });
    assert.equal(ctx.ok, true);
    assert.equal(ctx.platform.productKey, "activeclinic");
    assert.equal(ctx.platform.platformLine, "v8");
  });

  it("keeps shared database identity compatible with V7 (deployment ≠ DB identity)", () => {
    const v8 = getDeploymentProfile(V8_ENV);
    const v7 = getDeploymentProfile(V7_ENV);
    assert.equal(v8.expectedIdentityKey, MOOVEX_PLATFORM_IDENTITY_KEY);
    assert.equal(v7.expectedIdentityKey, MOOVEX_PLATFORM_IDENTITY_KEY);
    assert.equal(v8.expectedIdentityKey, v7.expectedIdentityKey);
    assert.equal(v8.expectedDatabaseEnvironment, "testing");
    assert.equal(v7.expectedDatabaseEnvironment, "testing");
    // Deployment codes differ while DB identity stays shared.
    assert.notEqual(v8.deploymentCode, v7.deploymentCode);
    assert.equal(v8.deploymentCode, CODE_MOOVEX_PLATFORM_V8_TESTING);
    assert.equal(v7.deploymentCode, CODE_MOOVEX_PLATFORM_TESTING);
  });
});
