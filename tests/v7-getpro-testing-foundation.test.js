"use strict";

/**
 * GetPro testing foundation at getproapp.pronline.org (Netraz-style under-construction page).
 */

const assert = require("node:assert/strict");
const { describe, it, beforeEach } = require("node:test");
const request = require("supertest");
const express = require("express");

const {
  resolveCanonicalHost,
  CANONICAL_HOST_REGISTRY,
} = require("../src/platform/config/canonicalHostRegistry");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_PRODUCTION,
} = require("../src/platform/config/canonicalDeploymentProfiles");
const {
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  createMoovexPlatformRuntimeApp,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const {
  createGetProFoundationApp,
} = require("../src/getpro/http/getproFoundationServer");
const {
  createNgoFoundationApp,
} = require("../src/ngo/http/ngoFoundationServer");
const {
  resolvePlatformRequestContext,
} = require("../src/platform/http/platformRequestContext");

const PLATFORM_TESTING_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
  DATABASE_IDENTITY_ENV: "testing",
  DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/moovex_testing",
  SESSION_SECRET: "t".repeat(40),
});

function withEnv(overrides, fn) {
  const keys = [
    "NODE_ENV",
    "DEPLOYMENT_ENV",
    "PLATFORM_DEPLOYMENT_CODE",
    "DATABASE_IDENTITY_EXPECTED",
    "DATABASE_IDENTITY_ENV",
    "DATABASE_URL",
    "SESSION_SECRET",
    ...Object.keys(overrides),
  ];
  const prev = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of keys) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
    });
}

function stubProductApp(label) {
  const app = express();
  app.get("/probe", (req, res) => {
    res.json({
      ok: true,
      product: label,
      platformProduct: req.platform && req.platform.productKey,
    });
  });
  app.use((req, res) => {
    res.status(404).json({ ok: false, code: "product_route_isolated", product: label });
  });
  return app;
}

describe("GetPro testing foundation (getproapp.pronline.org)", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("canonical host resolves productKey=getpro / brand=GetPro / testing", () => {
    const r = resolveCanonicalHost("getproapp.pronline.org");
    assert.equal(r.ok, true);
    assert.equal(r.site.productKey, "getpro");
    assert.equal(r.site.brand, "GetPro");
    assert.equal(r.site.environment, "testing");
    assert.equal(r.site.siteType, "product");
    assert.equal(r.site.status, "canonical");
    assert.equal(r.site.redirectTargetOrigin, null);
  });

  it("getpro.pronline.org is a compatibility alias redirect", () => {
    const r = resolveCanonicalHost("getpro.pronline.org");
    assert.equal(r.ok, true);
    assert.equal(r.site.productKey, "getpro");
    assert.equal(r.site.status, "legacy");
    assert.equal(r.site.redirectTargetOrigin, "https://getproapp.pronline.org");
  });

  it("unknown GetPro-like hosts fail closed", () => {
    assert.equal(resolveCanonicalHost("getpro.example.com").ok, false);
    assert.equal(resolveCanonicalHost("www.getpro.pronline.org").ok, false);
    assert.equal(resolveCanonicalHost("getproapp.evil.com").ok, false);
    assert.equal(CANONICAL_HOST_REGISTRY["getpro.example.com"], undefined);
  });

  it("root renders GetPro foundation branding without Netraz/BlessBoard/ActiveClinic nav", async () => {
    await withEnv(
      {
        PLATFORM_DEPLOYMENT_CODE: "getpro-pronline-testing",
        DEPLOYMENT_ENV: "testing",
        NODE_ENV: "test",
        DATABASE_URL: "postgres://x",
        SESSION_SECRET: "s".repeat(40),
      },
      async () => {
        const app = createGetProFoundationApp({ env: process.env });
        const res = await request(app).get("/");
        assert.equal(res.status, 200);
        assert.match(res.text, /<title>GetPro<\/title>/);
        assert.match(res.text, /data-product="getpro"/);
        assert.match(res.text, /data-brand="getpro"/);
        assert.match(res.text, /Under construction \/ Product foundation/);
        assert.match(res.text, /Service marketplace and operations platform for pronline\.org/);
        assert.match(res.text, /https:\/\/pronline\.org/);
        assert.match(res.text, /\/healthz/);
        assert.doesNotMatch(res.text, /Netraz/i);
        assert.doesNotMatch(res.text, /BlessBoard/i);
        assert.doesNotMatch(res.text, /ActiveClinic/i);
        assert.doesNotMatch(res.text, /data-product="ngo"/);
        assert.doesNotMatch(res.text, /\/hq/);
        assert.doesNotMatch(res.text, /\/patients/);
      }
    );
  });

  it("does not expose unfinished GetPro operational routes", async () => {
    await withEnv(
      {
        PLATFORM_DEPLOYMENT_CODE: "getpro-pronline-testing",
        DEPLOYMENT_ENV: "testing",
        NODE_ENV: "test",
        DATABASE_URL: "postgres://x",
        SESSION_SECRET: "s".repeat(40),
      },
      async () => {
        const app = createGetProFoundationApp({ env: process.env });
        for (const path of ["/leads", "/crm", "/providers", "/hq", "/patients", "/programs"]) {
          const res = await request(app).get(path);
          assert.equal(res.status, 404, path);
          assert.ok(
            res.body.code === "product_route_isolated" || res.body.code === "getpro_foundation_only",
            path
          );
        }
      }
    );
  });

  it("platform runtime serves GetPro foundation on getproapp.pronline.org", async () => {
    await withEnv(PLATFORM_TESTING_ENV, async () => {
      const app = createMoovexPlatformRuntimeApp({
        env: process.env,
        productApps: {
          blessboard: stubProductApp("blessboard"),
          activeclinic: stubProductApp("activeclinic"),
          getpro: createGetProFoundationApp({
            env: process.env,
            allowPlatformRuntimeChild: true,
          }),
          ngo: createNgoFoundationApp({
            env: process.env,
            allowPlatformRuntimeChild: true,
          }),
        },
      });

      const res = await request(app).get("/").set("Host", "getproapp.pronline.org");
      assert.equal(res.status, 200);
      assert.match(res.text, /GetPro/);
      assert.match(res.text, /data-product="getpro"/);
      assert.doesNotMatch(res.text, /Netraz/i);

      const netraz = await request(app).get("/").set("Host", "netraz.pronline.org");
      assert.equal(netraz.status, 200);
      assert.match(netraz.text, /Netraz/);
      assert.doesNotMatch(netraz.text, /data-product="getpro"/);

      const alias = await request(app).get("/hello").set("Host", "getpro.pronline.org");
      assert.equal(alias.status, 301);
      assert.match(String(alias.headers.location || ""), /getproapp\.pronline\.org/);

      const unknown = await request(app).get("/").set("Host", "getpro.example.com");
      assert.equal(unknown.status, 404);
      assert.equal(unknown.body.code, "UNKNOWN_PLATFORM_HOST");
    });
  });

  it("production/testing hostname isolation remains intact", async () => {
    await withEnv(PLATFORM_TESTING_ENV, async () => {
      const mismatch = resolvePlatformRequestContext({
        env: process.env,
        hostname: "getproapp.org",
      });
      assert.equal(mismatch.ok, false);
      assert.equal(mismatch.code, "PLATFORM_ENVIRONMENT_HOST_MISMATCH");

      const ok = resolvePlatformRequestContext({
        env: process.env,
        hostname: "getproapp.pronline.org",
      });
      assert.equal(ok.ok, true);
      assert.equal(ok.platform.productKey, "getpro");
    });

    await withEnv(
      {
        ...PLATFORM_TESTING_ENV,
        DEPLOYMENT_ENV: "production",
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_PRODUCTION,
        DATABASE_IDENTITY_ENV: "production",
      },
      async () => {
        const mismatch = resolvePlatformRequestContext({
          env: process.env,
          hostname: "getproapp.pronline.org",
        });
        assert.equal(mismatch.ok, false);
        assert.equal(mismatch.code, "PLATFORM_ENVIRONMENT_HOST_MISMATCH");
      }
    );
  });
});
