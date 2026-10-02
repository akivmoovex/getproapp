"use strict";

/**
 * V8 QA homepage — Version 2.0 only (neuniversity.org hub).
 * V7 pronline.org hub behavior must remain unchanged.
 */

const express = require("express");
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  CODE_MOOVEX_PLATFORM_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
  getDeploymentProfile,
  validateAuthoritativeProfileCompatibility,
  resolveDeploymentConfiguration,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  resolveCanonicalHost,
} = require("../src/platform/config/canonicalHostRegistry");
const {
  resolvePlatformRequestContext,
} = require("../src/platform/http/platformRequestContext");
const {
  createMoovexPlatformRuntimeApp,
  resolveQaProductLinks,
  QA_PRODUCT_LINKS_V7,
} = require("../src/platform/http/moovexPlatformRuntimeServer");

const V8_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  BASE_DOMAIN: "neuniversity.org",
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v8-qa-homepage-session-secret-0123456789abcdef",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

const V7_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  BASE_DOMAIN: "pronline.org",
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v7-qa-homepage-session-secret-0123456789abcdef",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

function withEnv(overrides, fn) {
  const keys = new Set([
    "NODE_ENV",
    "DEPLOYMENT_ENV",
    "PLATFORM_DEPLOYMENT_CODE",
    "DATABASE_IDENTITY_EXPECTED",
    "DATABASE_IDENTITY_ENV",
    "DATABASE_URL",
    "SESSION_SECRET",
    "BASE_DOMAIN",
    ...Object.keys(overrides),
  ]);
  const prev = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  const restore = () => {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") return result.finally(restore);
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

function stubProductApp(product) {
  const app = express();
  app.get("/probe", (req, res) => {
    res.status(200).json({
      product,
      platformProduct: req.platform && req.platform.productKey,
    });
  });
  app.get("/", (req, res) => {
    res
      .status(200)
      .type("html")
      .send(`<!DOCTYPE html><html><body data-product="${product}"><h1>${product}</h1></body></html>`);
  });
  return app;
}

describe("V8 QA homepage Version 2.0 only", () => {
  beforeEach(() => resetDeploymentProfileWarningsForTests());

  it("1. V8 homepage returns HTTP 200", async () => {
    await withEnv(V8_ENV, async () => {
      const app = createMoovexPlatformRuntimeApp({
        env: process.env,
        productApps: {
          blessboard: stubProductApp("blessboard"),
          activeclinic: stubProductApp("activeclinic"),
        },
      });
      const home = await request(app).get("/").set("Host", "neuniversity.org");
      assert.equal(home.status, 200);
      assert.match(home.headers["content-type"] || "", /html/i);
    });
  });

  it("2. Homepage displays Version 2.0 and Moovex Platform V8 QA", async () => {
    await withEnv(V8_ENV, async () => {
      const app = createMoovexPlatformRuntimeApp({
        env: process.env,
        productApps: {
          blessboard: stubProductApp("blessboard"),
          activeclinic: stubProductApp("activeclinic"),
        },
      });
      const home = await request(app).get("/").set("Host", "neuniversity.org");
      assert.match(home.text, /Moovex Platform V8 QA/);
      assert.match(home.text, /Version 2\.0 Development and Testing/);
      assert.match(home.text, /data-platform-line="v8"/);
      assert.match(home.text, /Platform health check/);
      assert.match(home.text, /href="\/healthz"/);
    });
  });

  it("3. BlessBoard V8 link is correct", async () => {
    await withEnv(V8_ENV, async () => {
      const app = createMoovexPlatformRuntimeApp({
        env: process.env,
        productApps: {
          blessboard: stubProductApp("blessboard"),
          activeclinic: stubProductApp("activeclinic"),
        },
      });
      const home = await request(app).get("/").set("Host", "neuniversity.org");
      assert.match(home.text, /BlessBoard V2\.0/);
      assert.match(home.text, /href="https:\/\/blessboard\.neuniversity\.org\/"/);
    });
  });

  it("4. ActiveClinic V8 link is correct", async () => {
    await withEnv(V8_ENV, async () => {
      const app = createMoovexPlatformRuntimeApp({
        env: process.env,
        productApps: {
          blessboard: stubProductApp("blessboard"),
          activeclinic: stubProductApp("activeclinic"),
        },
      });
      const home = await request(app).get("/").set("Host", "neuniversity.org");
      assert.match(home.text, /ActiveClinic V2\.0/);
      assert.match(home.text, /href="https:\/\/activeclinic\.neuniversity\.org\/"/);
    });
  });

  it("5–7. No V7 app links, no pronline.org app links, no Version 1.x labels", async () => {
    await withEnv(V8_ENV, async () => {
      const app = createMoovexPlatformRuntimeApp({
        env: process.env,
        productApps: {
          blessboard: stubProductApp("blessboard"),
          activeclinic: stubProductApp("activeclinic"),
        },
      });
      const home = await request(app).get("/").set("Host", "neuniversity.org");
      assert.doesNotMatch(home.text, /pronline\.org/);
      assert.doesNotMatch(home.text, /BlessBoard \(V7\)/);
      assert.doesNotMatch(home.text, /ActiveClinic \(V7\)/);
      assert.doesNotMatch(home.text, /GetPro/);
      assert.doesNotMatch(home.text, /Netraz/);
      assert.doesNotMatch(home.text, /Version 1\./);
      assert.doesNotMatch(home.text, /1\.x/i);
      assert.doesNotMatch(home.text, /legacy/i);
    });
  });

  it("8. Correct product selection by hostname on V8", async () => {
    await withEnv(V8_ENV, async () => {
      const app = createMoovexPlatformRuntimeApp({
        env: process.env,
        productApps: {
          blessboard: stubProductApp("blessboard"),
          activeclinic: stubProductApp("activeclinic"),
        },
      });

      const bb = resolvePlatformRequestContext({
        env: process.env,
        hostname: "blessboard.neuniversity.org",
      });
      assert.equal(bb.ok, true);
      assert.equal(bb.platform.productKey, "blessboard");
      assert.equal(bb.platform.platformLine, "v8");

      const ac = resolvePlatformRequestContext({
        env: process.env,
        hostname: "activeclinic.neuniversity.org",
      });
      assert.equal(ac.ok, true);
      assert.equal(ac.platform.productKey, "activeclinic");

      const hub = resolvePlatformRequestContext({
        env: process.env,
        hostname: "neuniversity.org",
      });
      assert.equal(hub.ok, true);
      assert.equal(hub.platform.siteType, "platform");
      assert.equal(hub.platform.productKey, null);

      const bbRes = await request(app)
        .get("/probe")
        .set("Host", "blessboard.neuniversity.org");
      assert.equal(bbRes.status, 200);
      assert.equal(bbRes.body.product, "blessboard");

      const acRes = await request(app)
        .get("/probe")
        .set("Host", "activeclinic.neuniversity.org");
      assert.equal(acRes.status, 200);
      assert.equal(acRes.body.product, "activeclinic");
    });
  });

  it("9. V8 deployment-profile configuration remains valid", () => {
    const profile = getDeploymentProfile(V8_ENV);
    assert.equal(profile.deploymentCode, CODE_MOOVEX_PLATFORM_V8_TESTING);
    assert.equal(profile.canonicalDomain, "neuniversity.org");
    assert.equal(profile.platformLine, "v8");
    assert.equal(profile.expectedIdentityKey, MOOVEX_PLATFORM_IDENTITY_KEY);
    assert.equal(profile.expectedDatabaseEnvironment, "testing");

    const compat = validateAuthoritativeProfileCompatibility(V8_ENV);
    assert.equal(compat.ok, true, compat.message);

    const cfg = resolveDeploymentConfiguration(V8_ENV);
    const links = resolveQaProductLinks(cfg);
    assert.equal(links.length, 2);
    assert.equal(links[0].label, "BlessBoard V2.0");
    assert.equal(links[0].href, "https://blessboard.neuniversity.org/");
    assert.equal(links[1].label, "ActiveClinic V2.0");
    assert.equal(links[1].href, "https://activeclinic.neuniversity.org/");

    assert.equal(resolveCanonicalHost("neuniversity.org").site.brand, "Moovex Platform V8 QA");
  });

  it("10. Existing V7 homepage behavior remains unchanged", async () => {
    await withEnv(V7_ENV, async () => {
      const app = createMoovexPlatformRuntimeApp({
        env: process.env,
        productApps: {
          blessboard: stubProductApp("blessboard"),
          activeclinic: stubProductApp("activeclinic"),
          getpro: stubProductApp("getpro"),
          ngo: stubProductApp("ngo"),
        },
      });

      const home = await request(app).get("/").set("Host", "pronline.org");
      assert.equal(home.status, 200);
      assert.match(home.text, /Moovex Platform QA/);
      assert.doesNotMatch(home.text, /Moovex Platform V8 QA/);
      assert.match(home.text, /pronline\.org/);
      assert.match(home.text, /blessboard\.pronline\.org/);
      assert.match(home.text, /activeclinic\.pronline\.org/);
      assert.match(home.text, /getproapp\.pronline\.org/);
      assert.match(home.text, /netraz\.pronline\.org/);
      assert.doesNotMatch(home.text, /Version 2\.0 Development and Testing/);

      const links = resolveQaProductLinks(resolveDeploymentConfiguration(V7_ENV));
      assert.deepEqual(links, QA_PRODUCT_LINKS_V7);

      const patients = await request(app).get("/patients").set("Host", "pronline.org");
      assert.equal(patients.status, 404);
      assert.equal(patients.body.code, "platform_qa_hub_only");

      const www = await request(app).get("/docs").set("Host", "www.pronline.org");
      assert.equal(www.status, 301);
      assert.equal(www.headers.location, "https://pronline.org/docs");
    });
  });

  it("www.neuniversity.org redirects to apex hub", async () => {
    await withEnv(V8_ENV, async () => {
      const app = createMoovexPlatformRuntimeApp({
        env: process.env,
        productApps: {
          blessboard: stubProductApp("blessboard"),
          activeclinic: stubProductApp("activeclinic"),
        },
      });
      const www = await request(app).get("/").set("Host", "www.neuniversity.org");
      assert.equal(www.status, 301);
      assert.equal(www.headers.location, "https://neuniversity.org/");
    });
  });
});
