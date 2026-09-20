"use strict";

/**
 * Regression for V8-BUG-002 Hostinger edge 503 classification.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyHostingerHttpResponse,
  isSharedV8DeploymentUnavailable,
} = require("../src/platform/ops/hostingerUpstreamProbe");
const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  CODE_MOOVEX_PLATFORM_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
  getDeploymentProfile,
} = require("../src/platform/config/deploymentProfiles");
const {
  resolveCanonicalHost,
} = require("../src/platform/config/canonicalHostRegistry");
const {
  resolvePlatformRequestContext,
} = require("../src/platform/http/platformRequestContext");
const {
  assertV8EnvironmentSafeOrError,
} = require("../src/platform/config/v8DeploymentIsolation");

const HOSTINGER_STOCK_503_BODY = `<!DOCTYPE html>
<html><head><title> 503 Service Unavailable
</title></head><body>
<h1>503</h1>
<h2>Service Unavailable</h2>
<p>The server is temporarily busy, try again later!</p>
</body></html>`;

const V8_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v8-bug002-session-secret-do-not-use-0123456789",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

describe("V8-BUG-002 Hostinger shared deployment 503", () => {
  it("classifies Hostinger stock 503 HTML as edge/no-upstream (not app crash)", () => {
    const result = classifyHostingerHttpResponse({
      status: 503,
      headers: {
        platform: "hostinger",
        panel: "hpanel",
        server: "hcdn",
        "content-type": "text/html",
        "content-length": "807",
      },
      body: HOSTINGER_STOCK_503_BODY,
    });
    assert.equal(result.layer, "hostinger_edge_no_upstream");
    assert.equal(result.code, "HOSTINGER_EDGE_NO_UPSTREAM");
    assert.ok(result.evidence.includes("body:hostinger-stock-503-html"));
    assert.ok(result.evidence.includes("missing:application-upstream-markers"));
  });

  it("classifies healthy V7-style healthz as application layer", () => {
    const result = classifyHostingerHttpResponse({
      status: 200,
      headers: {
        platform: "hostinger",
        panel: "hpanel",
        server: "hcdn",
        "content-type": "application/json; charset=utf-8",
        "x-request-id": "abc123",
        "x-hcdn-upstream-rt": "0.005",
      },
      body: JSON.stringify({
        ok: true,
        deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
        platformLine: "v7",
      }),
    });
    assert.equal(result.layer, "application");
    assert.equal(result.code, "APPLICATION_HTTP_OK");
  });

  it("does not treat application JSON 500 as Hostinger edge 503", () => {
    const result = classifyHostingerHttpResponse({
      status: 500,
      headers: {
        platform: "hostinger",
        server: "hcdn",
        "content-type": "application/json; charset=utf-8",
        "x-request-id": "req-1",
        "x-hcdn-upstream-rt": "0.012",
      },
      body: JSON.stringify({ ok: false, code: "boot_failed" }),
    });
    assert.equal(result.layer, "application");
    assert.equal(result.code, "APPLICATION_HTTP_ERROR");
  });

  it("flags shared V8 deployment unavailable when both hosts are edge 503", () => {
    const bb = classifyHostingerHttpResponse({
      status: 503,
      headers: {
        platform: "hostinger",
        server: "hcdn",
        "content-type": "text/html",
      },
      body: HOSTINGER_STOCK_503_BODY,
    });
    const ac = classifyHostingerHttpResponse({
      status: 503,
      headers: {
        platform: "hostinger",
        server: "hcdn",
        "content-type": "text/html",
      },
      body: HOSTINGER_STOCK_503_BODY,
    });
    assert.equal(isSharedV8DeploymentUnavailable(bb, ac), true);
  });

  it("keeps V8 BB/AC host resolution and env validation ready for Hostinger bind", () => {
    assert.equal(resolveCanonicalHost("blessboard.neuniversity.org").site.productKey, "blessboard");
    assert.equal(resolveCanonicalHost("activeclinic.neuniversity.org").site.productKey, "activeclinic");

    const profile = getDeploymentProfile(V8_ENV);
    assert.equal(profile.deploymentCode, CODE_MOOVEX_PLATFORM_V8_TESTING);
    assert.equal(profile.platformLine, "v8");
    assert.equal(profile.expectedIdentityKey, MOOVEX_PLATFORM_IDENTITY_KEY);
    assert.equal(profile.expectedDatabaseEnvironment, "testing");

    const bb = resolvePlatformRequestContext({
      env: V8_ENV,
      hostname: "blessboard.neuniversity.org",
    });
    const ac = resolvePlatformRequestContext({
      env: V8_ENV,
      hostname: "activeclinic.neuniversity.org",
    });
    assert.equal(bb.ok, true);
    assert.equal(ac.ok, true);
    assert.equal(assertV8EnvironmentSafeOrError(V8_ENV).ok, true);
  });
});
