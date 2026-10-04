"use strict";

/**
 * V2.05 — Release notes + About version contracts (BB + AC).
 * Focused: current version 2.05, history 2.03/2.04, product isolation, build identity.
 */

const path = require("path");
const express = require("express");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  getApplicationBuildInfo,
  VERSION_BASE_V8,
  PRODUCT_VERSION_V8,
} = require("../src/platform/build/applicationBuildInfo");
const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
} = require("../src/platform/config/deploymentProfiles");
const {
  VERSION_ORDER,
  getVersion,
  listVersions,
} = require("../src/platform/release-notes/releaseNotesService");
const {
  tryHandleReleaseNotesRequest,
} = require("../src/platform/release-notes/attachReleaseNotesRoutes");
const churchRoutes = require("../src/routes/church");

const V8_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  BASE_DOMAIN: "neuniversity.org",
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v205-release-notes-about-secret-0123456789ab",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
  GETPRO_GIT_SHA: "a1b2c3d4e5f678901234",
  GETPRO_GIT_BRANCH: "V5",
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

describe("V2.05 About + release notes", () => {
  it("shared V8 product version is 2.07 with separate build identity", () => {
    assert.equal(VERSION_BASE_V8, "2.07");
    assert.equal(PRODUCT_VERSION_V8, "2.07");
    const info = getApplicationBuildInfo({ env: V8_ENV });
    assert.equal(info.productVersion, "2.07");
    assert.equal(info.productVersionLabel, "Version 2.07");
    assert.equal(info.version, "2.07");
    assert.equal(info.build, "a1b2c3d4e5f6");
    assert.equal(info.version.includes(info.build), false);
    assert.equal(info.environment, "testing");
  });

  it("catalog preserves 2.03 and 2.04 and adds 2.07 as tip", () => {
    assert.deepEqual(
      VERSION_ORDER.slice(-3),
      ["2.04", "2.05", "2.07"]
    );
    assert.equal(listVersions().length, 11);
    assert.ok(getVersion("2.03"));
    assert.ok(getVersion("2.04"));
    const v207 = getVersion("2.07");
    assert.ok(v207);
    assert.ok(v207.productNarratives.BlessBoard);
    assert.ok(v207.productNarratives.ActiveClinic);
    assert.match(v207.deploymentStatus, /V7|release preparation/i);
    assert.ok(!/RELEASED TO PRODUCTION/i.test(v207.qaVerification));
  });

  it("BlessBoard About shows 2.07, build identity, and no stale 2.05 current label", async () => {
    const app = makeBlessBoardApexApp(V8_ENV);
    try {
      const res = await request(app).get("/about");
      assert.equal(res.status, 200);
      assert.match(res.text, /data-product="BlessBoard"/);
      assert.match(res.text, /Version 2\.07/);
      assert.match(res.text, /Release 2\.07/);
      assert.match(res.text, /a1b2c3d4e5f6/);
      assert.match(res.text, /unified Admin Console/i);
      assert.doesNotMatch(res.text, /Release 2\.05/);
      assert.doesNotMatch(res.text, /v2\.05 Ready/);
      assert.doesNotMatch(res.text, /Version 2\.05/);
    } finally {
      app.__restoreEnv();
    }
  });

  it("ActiveClinic About shows 2.07, build identity, and no stale 2.05 current label", async () => {
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
      env: V8_ENV,
    });
    const res = await request(app)
      .get("/about")
      .set("Host", "activeclinic.neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-product="ActiveClinic"/);
    assert.match(res.text, /Version 2\.07/);
    assert.match(res.text, /Enterprise v2\.07/);
    assert.match(res.text, /a1b2c3d4e5f6/);
    assert.match(res.text, /unified Admin Console/i);
    assert.doesNotMatch(res.text, /Enterprise v2\.05/);
    assert.doesNotMatch(res.text, /Version 2\.05/);
  });

  it("BlessBoard 2.05 release notes render What's new for BlessBoard", async () => {
    const app = express();
    app.use(async (req, res) => {
      await tryHandleReleaseNotesRequest(req, res, { env: V8_ENV });
    });
    const res = await request(app)
      .get("/release-notes/2.05")
      .set("Host", "blessboard.neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /What's new for BlessBoard/);
    assert.match(res.text, /New Admin Console/);
    assert.match(res.text, /Website Management/);
    assert.match(res.text, /Clarity/);
    assert.match(res.text, /Editorial/);
    assert.match(res.text, /Community/);
    assert.match(
      res.text,
      /YouTube embedding support is being completed across all public website presentation paths/
    );
    assert.doesNotMatch(res.text, /What's new for ActiveClinic/);
  });

  it("ActiveClinic 2.05 release notes render What's new for ActiveClinic", async () => {
    const app = express();
    app.use(async (req, res) => {
      await tryHandleReleaseNotesRequest(req, res, { env: V8_ENV });
    });
    const res = await request(app)
      .get("/release-notes/2.05")
      .set("Host", "activeclinic.neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /What's new for ActiveClinic/);
    assert.match(res.text, /Organization &amp; Location Management|Organization & Location Management/);
    assert.match(res.text, /clinic-location aware administration|Organization and clinic-location/);
    assert.doesNotMatch(res.text, /What's new for BlessBoard/);
    assert.doesNotMatch(res.text, /HQ and branch-aware administration/);
  });

  it("2.03 release notes still render", async () => {
    const app = express();
    app.use(async (req, res) => {
      await tryHandleReleaseNotesRequest(req, res, { env: V8_ENV });
    });
    const res = await request(app)
      .get("/release-notes/2.03")
      .set("Host", "blessboard.neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /Version 2\.03/);
    assert.match(res.text, /What's new for BlessBoard/);
    assert.match(res.text, /platform consolidation/i);
  });

  it("2.04 release notes still render", async () => {
    const app = express();
    app.use(async (req, res) => {
      await tryHandleReleaseNotesRequest(req, res, { env: V8_ENV });
    });
    const res = await request(app)
      .get("/release-notes/2.04")
      .set("Host", "blessboard.neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /Version 2\.04/);
    assert.match(res.text, /What's new for BlessBoard/);
    assert.match(res.text, /website management experience/i);
  });

  it("product-specific release notes do not cross-display on 2.04 AC host", async () => {
    const app = express();
    app.use(async (req, res) => {
      await tryHandleReleaseNotesRequest(req, res, { env: V8_ENV });
    });
    const res = await request(app)
      .get("/release-notes/2.04")
      .set("Host", "activeclinic.neuniversity.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /What's new for ActiveClinic/);
    assert.doesNotMatch(res.text, /What's new for BlessBoard/);
  });
});
