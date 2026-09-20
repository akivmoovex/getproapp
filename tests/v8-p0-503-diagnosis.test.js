"use strict";

/**
 * V8 P0 persistent 503 — classification + V8 boot readiness (no Hostinger API).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  classifyHostingerHttpResponse,
  isSharedV8DeploymentUnavailable,
} = require("../src/platform/ops/hostingerUpstreamProbe");
const {
  assertV8EnvironmentSafeOrError,
  isV8Deployment,
} = require("../src/platform/config/v8DeploymentIsolation");
const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
  getDeploymentProfile,
} = require("../src/platform/config/deploymentProfiles");
const {
  resolveCanonicalHost,
} = require("../src/platform/config/canonicalHostRegistry");
const {
  createMoovexPlatformRuntimeApp,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const request = require("supertest");

const STOCK_503 = `<!DOCTYPE html><html><head><title> 503 Service Unavailable
</title></head><body><h1>503</h1><h2>Service Unavailable</h2>
<p>The server is temporarily busy, try again later!</p></body></html>`;

const V8_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v8-p0-503-diag-session-secret-0123456789abcdef",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

describe("V8 P0 persistent 503 diagnosis", () => {
  it("classifies live Hostinger stock-503 fingerprint as edge/no-upstream (A/D class)", () => {
    const result = classifyHostingerHttpResponse({
      status: 503,
      headers: {
        platform: "hostinger",
        panel: "hpanel",
        server: "hcdn",
        "content-type": "text/html",
        "content-length": "807",
        // intentionally no x-hcdn-upstream-rt / x-request-id
      },
      body: STOCK_503,
    });
    assert.equal(result.layer, "hostinger_edge_no_upstream");
    assert.equal(result.code, "HOSTINGER_EDGE_NO_UPSTREAM");
    assert.ok(result.message.includes("Node.js application"));
  });

  it("treats both V8 hosts with edge 503 as shared deployment unavailable", () => {
    const edge = classifyHostingerHttpResponse({
      status: 503,
      headers: { platform: "hostinger", server: "hcdn", "content-type": "text/html" },
      body: STOCK_503,
    });
    assert.equal(isSharedV8DeploymentUnavailable(edge, edge), true);
  });

  it("does not blame application crash when upstream JSON health is present", () => {
    const app = classifyHostingerHttpResponse({
      status: 200,
      headers: {
        platform: "hostinger",
        server: "hcdn",
        "content-type": "application/json",
        "x-request-id": "abc",
        "x-hcdn-upstream-rt": "0.01",
      },
      body: JSON.stringify({ ok: true, deploymentCode: CODE_MOOVEX_PLATFORM_V8_TESTING }),
    });
    assert.equal(app.layer, "application");
    assert.notEqual(app.code, "HOSTINGER_EDGE_NO_UPSTREAM");
  });

  it("validates V8 env and profile accept both neuniversity hostnames", () => {
    assert.equal(assertV8EnvironmentSafeOrError(V8_ENV).ok, true);
    assert.equal(isV8Deployment(V8_ENV), true);
    const profile = getDeploymentProfile(V8_ENV);
    assert.equal(profile.deploymentCode, CODE_MOOVEX_PLATFORM_V8_TESTING);
    assert.ok(profile.apexDomains.includes("blessboard.neuniversity.org"));
    assert.ok(profile.apexDomains.includes("activeclinic.neuniversity.org"));
    assert.equal(resolveCanonicalHost("blessboard.neuniversity.org").site.productKey, "blessboard");
    assert.equal(resolveCanonicalHost("activeclinic.neuniversity.org").site.productKey, "activeclinic");
  });

  it("routes BB and AC homepages on V8 runtime when Node is running", async () => {
    const app = createMoovexPlatformRuntimeApp({
      env: V8_ENV,
      productApps: {
        blessboard: (req, res) =>
          res.status(200).type("html").send("<html><body>BlessBoard V8 Home</body></html>"),
        activeclinic: (req, res) =>
          res.status(200).type("html").send("<html><body>ActiveClinic V8 Home</body></html>"),
      },
      boot: { gitSha: "deadbeefcafe" },
    });

    const bb = await request(app).get("/").set("Host", "blessboard.neuniversity.org");
    assert.equal(bb.status, 200);
    assert.match(bb.text, /BlessBoard V8 Home/);

    const ac = await request(app).get("/").set("Host", "activeclinic.neuniversity.org");
    assert.equal(ac.status, 200);
    assert.match(ac.text, /ActiveClinic V8 Home/);

    const health = await request(app)
      .get("/healthz")
      .set("Host", "blessboard.neuniversity.org");
    assert.equal(health.status, 200);
    assert.equal(health.body.deploymentCode, CODE_MOOVEX_PLATFORM_V8_TESTING);
    assert.equal(health.body.platformLine, "v8");
    assert.equal(health.body.gitSha, "deadbeefcafe");
  });

  it("ships diagnose-hosted-503 operator script next to hosted-smoke", () => {
    const script = path.join(__dirname, "../scripts/v8/diagnose-hosted-503.js");
    assert.equal(fs.existsSync(script), true);
    const src = fs.readFileSync(script, "utf8");
    assert.match(src, /HOSTINGER_EDGE_NO_UPSTREAM/);
    assert.match(src, /classifyHostingerHttpResponse/);
  });
});
