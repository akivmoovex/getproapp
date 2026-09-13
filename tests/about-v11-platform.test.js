"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  getApplicationBuildInfo,
  VERSION_BASE,
} = require("../src/platform/build/applicationBuildInfo");
const { readGitShaShort } = require("../src/startup/startupProcessMarker");
const churchRoutes = require("../src/routes/church");

const SENSITIVE_PATTERNS = [
  /DATABASE_URL/i,
  /SUPABASE/i,
  /API[_-]?KEY/i,
  /SESSION_SECRET/i,
  /postgresql:\/\//i,
  /aws-0-eu-central-1\.pooler/i,
];

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
      host: "blessboard.pronline.org",
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

test("getApplicationBuildInfo uses healthz SHA source and 1.01 version base", () => {
  const sha = "408d0589ab1234567890";
  const info = getApplicationBuildInfo({
    env: { DEPLOYMENT_ENV: "testing", GETPRO_GIT_SHA: sha },
  });
  assert.equal(info.versionBase, VERSION_BASE);
  assert.equal(info.versionBase, "1.01");
  assert.equal(info.build, sha.slice(0, 12));
  assert.equal(info.version, `1.01.${sha.slice(0, 12)}`);
  assert.equal(info.environment, "testing");
  assert.equal(info.environmentLabel, "Testing");

  const prev = process.env.GETPRO_GIT_SHA;
  process.env.GETPRO_GIT_SHA = sha;
  try {
    assert.equal(info.build, readGitShaShort());
  } finally {
    if (prev === undefined) delete process.env.GETPRO_GIT_SHA;
    else process.env.GETPRO_GIT_SHA = prev;
  }
});

test("getApplicationBuildInfo does not hard-code Testing for production mode", () => {
  const info = getApplicationBuildInfo({
    env: { DEPLOYMENT_ENV: "production", GETPRO_GIT_SHA: "deadbeefcafebabe" },
  });
  assert.equal(info.environment, "production");
  assert.equal(info.environmentLabel, "Production");
  assert.equal(info.version, "1.01.deadbeefcafe");
});

test("BlessBoard GET /about renders V1.1 About without auth and without secrets", async () => {
  const app = makeBlessBoardApexApp({
    DEPLOYMENT_ENV: "testing",
    GETPRO_GIT_SHA: "abcdef0123456789ffff",
  });
  try {
    const res = await request(app).get("/about");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-product="BlessBoard"/);
    assert.match(res.text, /About BlessBoard/);
    assert.match(res.text, /1\.01\.abcdef012345/);
    assert.match(res.text, />abcdef012345</);
    assert.match(res.text, /Testing/);
    assert.match(res.text, /href="\/about"/);
    assert.match(res.text, /href="\/privacy"/);
    assert.match(res.text, /href="\/terms"/);
    assert.match(res.text, /church-footer--apex/);
    assert.doesNotMatch(res.text, /data-product="ActiveClinic"/);
    assert.doesNotMatch(res.text, /Clinical Build Diagnostics/);
    for (const pattern of SENSITIVE_PATTERNS) {
      assert.doesNotMatch(res.text, pattern);
    }
  } finally {
    app.__restoreEnv();
  }
});

test("ActiveClinic GET /about renders V1.1 About without auth and without secrets", async () => {
  const {
    createActiveClinicFoundationApp,
  } = require("../src/activeclinic/http/activeClinicFoundationServer");
  const {
    CODE_ACTIVECLINIC_ORG_V6,
    resetDeploymentProfileWarningsForTests,
  } = require("../src/platform/config/deploymentProfiles");

  resetDeploymentProfileWarningsForTests();
  const app = createActiveClinicFoundationApp({
    getPool: () => {
      throw new Error("about page must not query the database");
    },
    env: {
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "testing",
      PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
      SESSION_SECRET: "a".repeat(48),
      GETPRO_GIT_SHA: "fedcba9876543210aaaa",
    },
  });

  const res = await request(app).get("/about");
  assert.equal(res.status, 200);
  assert.match(res.text, /data-product="ActiveClinic"/);
  assert.match(res.text, /data-ac-acw-screen="ACW06"/);
  assert.match(res.text, /About ActiveClinic/);
  assert.match(res.text, /1\.01\.fedcba987654/);
  assert.match(res.text, />fedcba987654</);
  assert.match(res.text, /Testing/);
  assert.match(res.text, /href="\/about"/);
  assert.match(res.text, /href="\/contact"/);
  assert.match(res.text, /href="\/privacy"/);
  assert.match(res.text, /href="\/terms"/);
  assert.doesNotMatch(res.text, /data-product="BlessBoard"/);
  assert.doesNotMatch(res.text, /Empowering Ministry Across Generations/);
  for (const pattern of SENSITIVE_PATTERNS) {
    assert.doesNotMatch(res.text, pattern);
  }
});
