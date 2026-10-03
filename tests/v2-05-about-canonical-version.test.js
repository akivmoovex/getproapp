"use strict";

/**
 * V2.06 — Canonical About version source for BlessBoard + ActiveClinic.
 * Proves production and testing both resolve Version 2.06 from shared
 * applicationBuildInfo (not legacy 1.03 / per-product constants).
 */

const path = require("path");
const express = require("express");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  getApplicationBuildInfo,
  resolveVersionScheme,
  VERSION_BASE,
  PRODUCT_VERSION,
  VERSION_BASE_V8,
  PRODUCT_VERSION_V8,
} = require("../src/platform/build/applicationBuildInfo");
const {
  CODE_MOOVEX_PLATFORM_PRODUCTION,
  CODE_ACTIVECLINIC_ORG_PRODUCTION,
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
} = require("../src/platform/config/deploymentProfiles");
const churchRoutes = require("../src/routes/church");

const PRODUCTION_BB_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "production",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_PRODUCTION,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v205-about-canonical-bb-secret-0123456789ab",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "production",
  GETPRO_GIT_SHA: "c3deececc57d9a0e326c",
});

const PRODUCTION_AC_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "production",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_PRODUCTION,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v205-about-canonical-ac-secret-0123456789ab",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "production",
  GETPRO_GIT_SHA: "c3deececc57d9a0e326c",
});

function makeBlessBoardApexApp(envOverrides) {
  const prev = {};
  const keys = Object.keys(envOverrides || {});
  for (const key of keys) {
    prev[key] = process.env[key];
    process.env[key] = envOverrides[key];
  }
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "vertical-apex",
      host: "blessboard.com",
      organization: null,
      branch: null,
    };
    next();
  });
  app.use(churchRoutes());
  app.__restoreEnv = () => {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  };
  return app;
}

describe("V2.06 canonical About version", () => {
  it("shared version source is canonical 2.06 (not legacy 1.03 aliases)", () => {
    assert.equal(VERSION_BASE, "2.06");
    assert.equal(PRODUCT_VERSION, "2.06");
    assert.equal(VERSION_BASE, VERSION_BASE_V8);
    assert.equal(PRODUCT_VERSION, PRODUCT_VERSION_V8);

    for (const env of [
      PRODUCTION_BB_ENV,
      PRODUCTION_AC_ENV,
      {
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "testing",
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
      },
    ]) {
      const scheme = resolveVersionScheme(env);
      assert.equal(scheme.productVersion, "2.06");
      assert.equal(scheme.versionBase, "2.06");
      assert.equal(scheme.platformLine, "v8");

      const info = getApplicationBuildInfo({
        env: { ...env, GETPRO_GIT_SHA: "c3deececc57d9a0e326c" },
      });
      assert.equal(info.version, "2.06");
      assert.equal(info.productVersion, "2.06");
      assert.equal(info.productVersionLabel, "Version 2.06");
      assert.equal(info.build, "c3deececc57d");
      assert.doesNotMatch(info.version, /1\.03/);
      assert.equal(info.version.includes(info.build), false);
    }
  });

  it("BlessBoard About displays 2.06 under production deployment profile", async () => {
    const app = makeBlessBoardApexApp(PRODUCTION_BB_ENV);
    try {
      const res = await request(app).get("/about");
      assert.equal(res.status, 200);
      assert.match(res.text, /data-product="BlessBoard"/);
      assert.match(res.text, /Version 2\.06/);
      assert.match(res.text, /Release 2\.06/);
      assert.match(res.text, />c3deececc57d</);
      assert.doesNotMatch(res.text, /1\.03\./);
      assert.doesNotMatch(res.text, /Release 1\.3/);
    } finally {
      app.__restoreEnv();
    }
  });

  it("ActiveClinic About displays 2.06 under production deployment profile", async () => {
    const {
      createActiveClinicFoundationApp,
    } = require("../src/activeclinic/http/activeClinicFoundationServer");
    const {
      resetDeploymentProfileWarningsForTests,
    } = require("../src/platform/config/deploymentProfiles");

    resetDeploymentProfileWarningsForTests();
    const app = createActiveClinicFoundationApp({
      getPool: () => {
        throw new Error("about page must not query the database");
      },
      allowPlatformRuntimeChild: true,
      env: PRODUCTION_AC_ENV,
    });

    const res = await request(app)
      .get("/about")
      .set("Host", "activeclinic.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-product="ActiveClinic"/);
    assert.match(res.text, /Version 2\.06/);
    assert.match(res.text, /Enterprise v2\.06/);
    assert.match(res.text, />c3deececc57d</);
    assert.doesNotMatch(res.text, /1\.03\./);
    assert.doesNotMatch(res.text, /Enterprise v1\.3/);
  });
});
