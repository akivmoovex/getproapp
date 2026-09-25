"use strict";

/**
 * V8-BUG-001 / V2.01 — About pages show Version 2.01 + real Git build on V8;
 * V7 continues to show 1.03.<sha> / Release 1.3.
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
  VERSION_BASE_V7,
  PRODUCT_VERSION_V7,
  VERSION_BASE_V8,
  PRODUCT_VERSION_V8,
  UNAVAILABLE,
} = require("../src/platform/build/applicationBuildInfo");
const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  CODE_MOOVEX_PLATFORM_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
} = require("../src/platform/config/deploymentProfiles");
const churchRoutes = require("../src/routes/church");

const V8_ENV_BASE = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v8-about-version-test-secret-0123456789abcdef",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

const V7_ENV_BASE = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v7-about-version-test-secret-0123456789abcdef",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
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
      host: "blessboard.neuniversity.org",
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

describe("V8 About Version 2.01", () => {
  it("keeps shared V7 constants and resolves V8 scheme from deployment code", () => {
    assert.equal(VERSION_BASE, VERSION_BASE_V7);
    assert.equal(PRODUCT_VERSION, PRODUCT_VERSION_V7);
    assert.equal(VERSION_BASE_V7, "1.03");
    assert.equal(PRODUCT_VERSION_V7, "1.3");
    assert.equal(VERSION_BASE_V8, "2.01");
    assert.equal(PRODUCT_VERSION_V8, "2.01");

    const v8 = resolveVersionScheme(V8_ENV_BASE);
    const v7 = resolveVersionScheme(V7_ENV_BASE);
    assert.equal(v8.platformLine, "v8");
    assert.equal(v8.productVersion, "2.01");
    assert.equal(v7.platformLine, "v7");
    assert.equal(v7.productVersion, "1.3");
  });

  it("formats V8 About metadata as Version 2.01 with separate Git build (shared for BB/AC)", () => {
    const sha = "4e081537165cabcdef99";
    const info = getApplicationBuildInfo({
      env: { ...V8_ENV_BASE, GETPRO_GIT_SHA: sha },
    });
    assert.equal(info.platformLine, "v8");
    assert.equal(info.productVersion, "2.01");
    assert.equal(info.versionBase, "2.01");
    assert.equal(info.version, "2.01");
    assert.equal(info.productVersionLabel, "Version 2.01");
    assert.equal(info.build, sha.slice(0, 12));
    assert.equal(info.available, true);
    assert.notEqual(info.version, `2.01.${info.build}`);
    assert.equal(info.version.includes(info.build), false);
  });

  it("preserves V7 1.03.<sha> compound format for backward compatibility", () => {
    const sha = "03a89106e2feabcd";
    const info = getApplicationBuildInfo({
      env: { ...V7_ENV_BASE, GETPRO_GIT_SHA: sha },
    });
    assert.equal(info.platformLine, "v7");
    assert.equal(info.productVersion, "1.3");
    assert.equal(info.versionBase, "1.03");
    assert.equal(info.version, `1.03.${sha.slice(0, 12)}`);
    assert.equal(info.build, sha.slice(0, 12));
    assert.equal(info.productVersionLabel, "Version 1.3");
  });

  it("does not invent a Git SHA when metadata is missing on V8", () => {
    const info = getApplicationBuildInfo({
      env: {
        ...V8_ENV_BASE,
        GETPRO_GIT_SHA: "",
        GIT_SHA: "",
        COMMIT_SHA: "",
      },
      appRoot: path.join(__dirname, "fixtures", "no-git-root-does-not-exist"),
    });
    assert.equal(info.platformLine, "v8");
    assert.equal(info.version, "2.01");
    assert.equal(info.build, UNAVAILABLE);
    assert.equal(info.available, false);
  });

  it("BlessBoard V8 GET /about shows Version 2.01 and the real Git build", async () => {
    const sha = "abcdef0123456789ffff";
    const app = makeBlessBoardApexApp({
      ...V8_ENV_BASE,
      GETPRO_GIT_SHA: sha,
    });
    try {
      const res = await request(app).get("/about");
      assert.equal(res.status, 200);
      assert.match(res.text, /data-product="BlessBoard"/);
      assert.match(res.text, /About BlessBoard/);
      assert.match(res.text, /Release 2\.01/);
      assert.match(res.text, new RegExp(`>${sha.slice(0, 12)}<`));
      assert.match(res.text, /href="\/about"/);
      assert.match(res.text, /Version 2\.01/);
      assert.doesNotMatch(res.text, /1\.03\./);
      assert.doesNotMatch(res.text, /Release 1\.3/);
      assert.doesNotMatch(res.text, /1\.01\./);
      assert.doesNotMatch(res.text, /2\.01\.abcdef012345/);
      assert.doesNotMatch(res.text, /Version 2\.0(?!\d)/);
    } finally {
      app.__restoreEnv();
    }
  });

  it("ActiveClinic V8 GET /about shows Version 2.01 and the real Git build", async () => {
    const {
      createActiveClinicFoundationApp,
    } = require("../src/activeclinic/http/activeClinicFoundationServer");
    const {
      resetDeploymentProfileWarningsForTests,
    } = require("../src/platform/config/deploymentProfiles");

    resetDeploymentProfileWarningsForTests();
    const sha = "fedcba9876543210aaaa";
    const app = createActiveClinicFoundationApp({
      getPool: () => {
        throw new Error("about page must not query the database");
      },
      allowPlatformRuntimeChild: true,
      env: {
        ...V8_ENV_BASE,
        GETPRO_GIT_SHA: sha,
      },
    });

    const res = await request(app)
      .get("/about")
      .set("Host", "activeclinic.neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-product="ActiveClinic"/);
    assert.match(res.text, /About ActiveClinic/);
    assert.match(res.text, /Enterprise v2\.01/);
    assert.match(res.text, new RegExp(`>${sha.slice(0, 12)}<`));
    assert.match(res.text, /href="\/about"/);
    assert.match(res.text, /Version 2\.01/);
    assert.doesNotMatch(res.text, /1\.03\./);
    assert.doesNotMatch(res.text, /Enterprise v1\.3/);
    assert.doesNotMatch(res.text, /2\.01\.fedcba987654/);
    assert.doesNotMatch(res.text, /Version 2\.0(?!\d)/);
  });

  it("BlessBoard V5 apex About renderer uses shared V8 build info", () => {
    const { renderAboutPage } = require("../src/blessboard/http/renderApexMarketing");
    const sha = "aabbccddeeff00112233";
    const html = renderAboutPage({
      authenticated: false,
      csrfToken: null,
      env: { ...V8_ENV_BASE, GETPRO_GIT_SHA: sha },
    });
    assert.match(html, /data-product="BlessBoard"/);
    assert.match(html, /Release 2\.01/);
    assert.match(html, /Version 2\.01/);
    assert.match(html, new RegExp(sha.slice(0, 12)));
    assert.doesNotMatch(html, /Release 1\.3/);
    assert.doesNotMatch(html, /1\.03\./);
  });

  it("BB and AC share the same getApplicationBuildInfo configuration on V8", () => {
    const env = { ...V8_ENV_BASE, GETPRO_GIT_SHA: "11112222333344445555" };
    const a = getApplicationBuildInfo({ env });
    const b = getApplicationBuildInfo({ env });
    assert.deepEqual(a, b);
    assert.equal(a.productVersion, b.productVersion);
    assert.equal(a.version, b.version);
    assert.equal(a.build, b.build);
    assert.equal(a.platformLine, "v8");
    assert.equal(a.productVersion, "2.01");
  });
});
