"use strict";

/**
 * V8 deployment / domain isolation — hostname routing, cookies, env guards, health.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

const {
  DEPLOYMENT_PROFILES,
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  CODE_MOOVEX_PLATFORM_PRODUCTION,
  MOOVEX_PLATFORM_IDENTITY_KEY,
  getDeploymentProfile,
  resolveDeploymentConfiguration,
  validateAuthoritativeProfileCompatibility,
} = require("../src/platform/config/deploymentProfiles");
const {
  resolveCanonicalHost,
  CANONICAL_HOST_REGISTRY,
} = require("../src/platform/config/canonicalHostRegistry");
const {
  resolvePlatformRequestContext,
  assertHostnameAllowedForDeployment,
} = require("../src/platform/http/platformRequestContext");
const {
  V8_HOSTS,
  V7_TESTING_HOSTS,
  isV8Deployment,
  areOutboundSideEffectsAllowed,
  buildHostOnlyCookieOptions,
  assertV8EnvironmentSafeOrError,
  resolveIsolationTempDir,
} = require("../src/platform/config/v8DeploymentIsolation");
const {
  buildHostingerStorageKey,
  assertStorageKeyWritable,
  resolveMediaEnvironment,
} = require("../src/platform/media/hostingerMediaConfig");
const {
  createMoovexPlatformRuntimeApp,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const { setV5SessionCookie } = require("../src/platform/session/v5SessionCookie");
const { DOMAIN_MATRIX, V8_TESTING_NAMESPACE } = require("../src/platform/config/domainMatrix");

const ROOT = path.resolve(__dirname, "..");

const V8_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v8-test-session-secret-do-not-use-in-prod-0123456789",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

const V7_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v7-test-session-secret-do-not-use-in-prod-0123456789",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

describe("V8 environment isolation", () => {
  it("registers V8 profile without altering V7 testing apex domains", () => {
    const v7 = getDeploymentProfile({
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
      DEPLOYMENT_ENV: "testing",
    });
    const v8 = getDeploymentProfile({
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
      DEPLOYMENT_ENV: "testing",
    });
    assert.ok(v7);
    assert.ok(v8);
    assert.equal(v7.platformLine, "v8");
    assert.equal(v8.platformLine, "v8");
    assert.ok(v7.apexDomains.includes("blessboard.pronline.org"));
    assert.ok(v7.apexDomains.includes("activeclinic.pronline.org"));
    assert.equal(v7.apexDomains.includes("blessboard.neuniversity.org"), false);
    assert.ok(v8.apexDomains.includes("blessboard.neuniversity.org"));
    assert.ok(v8.apexDomains.includes("activeclinic.neuniversity.org"));
    assert.equal(v8.apexDomains.includes("blessboard.pronline.org"), false);
    assert.equal(v8.sessionCookieName, "moovex_platform_v8_testing_sid");
    assert.notEqual(v8.sessionCookieName, v7.sessionCookieName);
    assert.equal(v8.jobsEnabled, false);
    assert.equal(v8.mediaWriteNamespace, "testing-v8");
    assert.equal(v7.mediaWriteNamespace, "testing");
    assert.equal(v8.expectedIdentityKey, MOOVEX_PLATFORM_IDENTITY_KEY);
    assert.ok(DEPLOYMENT_PROFILES[CODE_MOOVEX_PLATFORM_V8_TESTING]);
    assert.ok(DEPLOYMENT_PROFILES[CODE_MOOVEX_PLATFORM_PRODUCTION]);
  });

  it("maps V8 hosts to BB/AC products and keeps V7 hosts unchanged", () => {
    const bb8 = resolveCanonicalHost("blessboard.neuniversity.org");
    const ac8 = resolveCanonicalHost("activeclinic.neuniversity.org");
    const bb7 = resolveCanonicalHost("blessboard.pronline.org");
    const ac7 = resolveCanonicalHost("activeclinic.pronline.org");
    assert.equal(bb8.ok, true);
    assert.equal(bb8.site.productKey, "blessboard");
    assert.equal(bb8.site.platformLine, "v8");
    assert.equal(ac8.site.productKey, "activeclinic");
    assert.equal(ac8.site.platformLine, "v8");
    assert.equal(bb7.site.productKey, "blessboard");
    assert.equal(bb7.site.platformLine, "v8");
    assert.equal(ac7.site.productKey, "activeclinic");
    assert.equal(ac7.site.platformLine, "v8");
    for (const h of V8_HOSTS) {
      assert.ok(CANONICAL_HOST_REGISTRY[h], h);
    }
    for (const h of V7_TESTING_HOSTS) {
      assert.equal(CANONICAL_HOST_REGISTRY[h].platformLine, "v8");
    }
  });

  it("resolves product routing on V8 hosts and rejects V7 hosts on V8 deployment", () => {
    const okBb = resolvePlatformRequestContext({
      env: V8_ENV,
      hostname: "blessboard.neuniversity.org",
    });
    assert.equal(okBb.ok, true);
    assert.equal(okBb.platform.productKey, "blessboard");
    assert.equal(okBb.platform.platformLine, "v8");
    assert.equal(okBb.platform.sessionCookieName, "moovex_platform_v8_testing_sid");

    const okAc = resolvePlatformRequestContext({
      env: V8_ENV,
      hostname: "activeclinic.neuniversity.org",
    });
    assert.equal(okAc.ok, true);
    assert.equal(okAc.platform.productKey, "activeclinic");

    const wrong = resolvePlatformRequestContext({
      env: V8_ENV,
      hostname: "blessboard.pronline.org",
    });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.code, "PLATFORM_HOST_NOT_IN_DEPLOYMENT");

    const v7RejectsV8 = resolvePlatformRequestContext({
      env: V7_ENV,
      hostname: "blessboard.neuniversity.org",
    });
    assert.equal(v7RejectsV8.ok, false);
    assert.equal(v7RejectsV8.code, "PLATFORM_HOST_NOT_IN_DEPLOYMENT");
  });

  it("rejects unknown hosts and platform-line mismatches", () => {
    const unknown = resolvePlatformRequestContext({
      env: V8_ENV,
      hostname: "evil.example.com",
    });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.code, "UNKNOWN_PLATFORM_HOST");

    const profile = getDeploymentProfile(V8_ENV);
    const mismatch = assertHostnameAllowedForDeployment(profile, {
      hostname: "blessboard.pronline.org",
      platformLine: "v7",
    });
    assert.equal(mismatch.ok, false);
  });

  it("isolates cookies as host-only with distinct V7/V8 names", () => {
    const opts = buildHostOnlyCookieOptions(V8_ENV);
    assert.equal(opts.httpOnly, true);
    assert.equal(opts.sameSite, "lax");
    assert.equal(opts.path, "/");
    assert.equal(Object.prototype.hasOwnProperty.call(opts, "domain"), false);

    const v7 = resolveDeploymentConfiguration(V7_ENV);
    const v8 = resolveDeploymentConfiguration(V8_ENV);
    assert.notEqual(v7.sessionCookieName, v8.sessionCookieName);
    assert.notEqual(v7.csrfCookieName, v8.csrfCookieName);

    const headers = [];
    const res = {
      cookie(name, value, options) {
        headers.push({ name, value, options });
      },
    };
    setV5SessionCookie(res, "token-value", {
      env: V8_ENV,
      req: { platform: { sessionCookieName: v8.sessionCookieName } },
      secure: true,
    });
    assert.equal(headers.length, 1);
    assert.equal(headers[0].name, "moovex_platform_v8_testing_sid");
    assert.equal(Object.prototype.hasOwnProperty.call(headers[0].options, "domain"), false);
  });

  it("fails closed on missing or production-targeted V8 configuration", () => {
    const missing = assertV8EnvironmentSafeOrError({
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
      DEPLOYMENT_ENV: "testing",
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "v8_env_missing");

    const prodEnv = validateAuthoritativeProfileCompatibility({
      ...V8_ENV,
      DEPLOYMENT_ENV: "production",
    });
    assert.equal(prodEnv.ok, false);

    const prodId = validateAuthoritativeProfileCompatibility({
      ...V8_ENV,
      DATABASE_IDENTITY_ENV: "production",
    });
    assert.equal(prodId.ok, false);

    const ok = assertV8EnvironmentSafeOrError(V8_ENV);
    assert.equal(ok.ok, true);
    assert.equal(isV8Deployment(V8_ENV), true);
    assert.equal(areOutboundSideEffectsAllowed(V8_ENV), false);
    assert.equal(areOutboundSideEffectsAllowed(V7_ENV), false);
  });

  it("uses testing-v8 media write namespace while refusing V7→V8 writes", () => {
    assert.equal(resolveMediaEnvironment(V8_ENV), "testing-v8");
    assert.equal(resolveMediaEnvironment(V7_ENV), "testing");
    const orgId = "11111111-1111-4111-8111-111111111111";
    const mediaId = "22222222-2222-4222-8222-222222222222";
    const key = buildHostingerStorageKey({
      environment: "testing-v8",
      productCode: "blessboard",
      organizationId: orgId,
      mediaId,
      mimeType: "image/webp",
    });
    assert.match(key, /^testing-v8\/blessboard\//);
    assert.doesNotThrow(() => assertStorageKeyWritable("testing-v8", key));
    assert.throws(
      () => assertStorageKeyWritable("testing", key),
      (err) => err && err.code === "REFUSED_V8_MEDIA_NAMESPACE"
    );
    assert.throws(
      () => assertStorageKeyWritable("testing-v8", `production/blessboard/${orgId}/${mediaId}.webp`),
      (err) => err && err.code === "REFUSED_PRODUCTION_MEDIA_NAMESPACE"
    );
  });

  it("exposes platformLine and isolation fields on /healthz", async () => {
    const app = createMoovexPlatformRuntimeApp({
      env: V8_ENV,
      productApps: {
        blessboard: (req, res) => res.status(200).json({ ok: true, product: "blessboard" }),
        activeclinic: (req, res) => res.status(200).json({ ok: true, product: "activeclinic" }),
      },
      boot: { gitSha: "abcd1234dead" },
    });
    const health = await request(app).get("/healthz").set("Host", "blessboard.neuniversity.org");
    assert.equal(health.status, 200);
    assert.equal(health.body.deploymentCode, CODE_MOOVEX_PLATFORM_V8_TESTING);
    assert.equal(health.body.platformLine, "v8");
    assert.equal(health.body.sessionCookieName, "moovex_platform_v8_testing_sid");
    assert.equal(health.body.mediaWriteNamespace, "testing-v8");
    assert.equal(health.body.jobsEnabled, false);
    assert.equal(health.body.gitSha, "abcd1234dead");
    assert.ok(health.body.apexDomains.includes("blessboard.neuniversity.org"));

    const routed = await request(app)
      .get("/healthz")
      .set("Host", "activeclinic.neuniversity.org");
    assert.equal(routed.status, 200);

    const wrongHost = await request(app)
      .get("/")
      .set("Host", "blessboard.pronline.org");
    assert.equal(wrongHost.status, 421);
    assert.equal(wrongHost.body.code, "PLATFORM_HOST_NOT_IN_DEPLOYMENT");
  });

  it("keeps V7 domain matrix entries and documents V8 hosts", () => {
    assert.equal(V8_TESTING_NAMESPACE, "neuniversity.org");
    const v7Bb = DOMAIN_MATRIX.find((r) => r.domain === "blessboard.pronline.org");
    const v8Bb = DOMAIN_MATRIX.find((r) => r.domain === "blessboard.neuniversity.org");
    assert.ok(v7Bb);
    assert.ok(v8Bb);
    assert.equal(v8Bb.platformLine, "v8");
    const doc = fs.readFileSync(
      path.join(ROOT, "docs/platform/V8_HOSTINGER_TESTING_ENV.md"),
      "utf8"
    );
    assert.match(doc, /moovex-platform-v8-testing/);
    assert.match(doc, /blessboard\.neuniversity\.org/);
    assert.match(doc, /activeclinic\.neuniversity\.org/);
    assert.match(doc, /distinct.*SESSION_SECRET/i);
    assert.match(doc, /pronline\.org/);
  });

  it("isolates temp directories by platform line", () => {
    const v8Dir = resolveIsolationTempDir(V8_ENV, "queues");
    const v7Dir = resolveIsolationTempDir(V7_ENV, "queues");
    assert.match(v8Dir, /v8-testing/);
    assert.match(v7Dir, /v7-testing/);
    assert.notEqual(v8Dir, v7Dir);
  });
});
