"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  getApplicationBuildInfo,
  VERSION_BASE,
  PRODUCT_VERSION,
  UNAVAILABLE,
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

test("shared version formatting uses 1.03 base and product 1.3 with healthz SHA source", () => {
  const sha = "408d0589ab1234567890";
  const info = getApplicationBuildInfo({
    env: { DEPLOYMENT_ENV: "testing", GETPRO_GIT_SHA: sha },
  });
  assert.equal(VERSION_BASE, "1.03");
  assert.equal(PRODUCT_VERSION, "1.3");
  assert.equal(info.versionBase, VERSION_BASE);
  assert.equal(info.productVersion, PRODUCT_VERSION);
  assert.equal(info.build, sha.slice(0, 12));
  assert.equal(info.version, `1.03.${sha.slice(0, 12)}`);
  assert.equal(info.available, true);
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
  assert.equal(info.version, "1.03.deadbeefcafe");
  assert.equal(info.available, true);
});

test("missing deployment metadata yields explicit unavailable state (no fabricated SHA)", () => {
  const info = getApplicationBuildInfo({
    env: {
      DEPLOYMENT_ENV: "testing",
      GETPRO_GIT_SHA: "",
      GIT_SHA: "",
      COMMIT_SHA: "",
    },
    appRoot: path.join(__dirname, "fixtures", "no-git-root-does-not-exist"),
  });
  assert.equal(info.available, false);
  assert.equal(info.build, UNAVAILABLE);
  assert.equal(info.version, `1.03.${UNAVAILABLE}`);
  assert.doesNotMatch(info.build, /^[a-f0-9]{7,}$/i);
});

test("subsequent builds automatically display their new SHA", () => {
  const first = getApplicationBuildInfo({
    env: { DEPLOYMENT_ENV: "testing", GETPRO_GIT_SHA: "aaaaaaaaaaaaaaaa" },
  });
  const second = getApplicationBuildInfo({
    env: { DEPLOYMENT_ENV: "testing", GETPRO_GIT_SHA: "bbbbbbbbbbbbbbbb" },
  });
  assert.equal(first.version, "1.03.aaaaaaaaaaaa");
  assert.equal(second.version, "1.03.bbbbbbbbbbbb");
  assert.notEqual(first.build, second.build);
});

test("BlessBoard GET /about renders V1.3 About without auth and without secrets", async () => {
  const app = makeBlessBoardApexApp({
    DEPLOYMENT_ENV: "testing",
    GETPRO_GIT_SHA: "abcdef0123456789ffff",
  });
  try {
    const res = await request(app).get("/about");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-product="BlessBoard"/);
    assert.match(res.text, /About BlessBoard/);
    assert.match(res.text, /1\.03\.abcdef012345/);
    assert.match(res.text, />abcdef012345</);
    assert.match(res.text, /Release 1\.3/);
    assert.match(res.text, /Testing/);
    assert.match(res.text, /href="\/about"/);
    assert.match(res.text, /href="\/privacy"/);
    assert.match(res.text, /href="\/terms"/);
    assert.match(res.text, /church-footer--apex/);
    assert.doesNotMatch(res.text, /1\.01\./);
    assert.doesNotMatch(res.text, /data-product="ActiveClinic"/);
    assert.doesNotMatch(res.text, /Clinical Build Diagnostics/);
    for (const pattern of SENSITIVE_PATTERNS) {
      assert.doesNotMatch(res.text, pattern);
    }
  } finally {
    app.__restoreEnv();
  }
});

test("ActiveClinic GET /about renders V1.3 About without auth and without secrets", async () => {
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
  assert.match(res.text, /Enterprise v1\.3/);
  assert.match(res.text, /1\.03\.fedcba987654/);
  assert.match(res.text, />fedcba987654</);
  assert.match(res.text, /Testing/);
  assert.match(res.text, /href="\/about"/);
  assert.match(res.text, /href="\/contact"/);
  assert.match(res.text, /href="\/privacy"/);
  assert.match(res.text, /href="\/terms"/);
  assert.doesNotMatch(res.text, /1\.01\./);
  assert.doesNotMatch(res.text, /Enterprise v1\.0/);
  assert.doesNotMatch(res.text, /data-product="BlessBoard"/);
  assert.doesNotMatch(res.text, /Empowering Ministry Across Generations/);
  for (const pattern of SENSITIVE_PATTERNS) {
    assert.doesNotMatch(res.text, pattern);
  }
});

test("BlessBoard V5 apex About renderer exposes 1.03 build metadata", () => {
  const { renderAboutPage } = require("../src/blessboard/http/renderApexMarketing");
  const html = renderAboutPage({
    authenticated: false,
    csrfToken: null,
    env: { DEPLOYMENT_ENV: "testing", GETPRO_GIT_SHA: "aabbccddeeff0011" },
  });
  assert.match(html, /data-bb-shell="apex"/);
  assert.match(html, /data-product="BlessBoard"/);
  assert.match(html, /1\.03\.aabbccddeeff/);
  assert.match(html, /Release 1\.3/);
  assert.match(html, /Testing/);
  assert.match(html, /href="\/about"/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /href="\/terms"/);
  assert.doesNotMatch(html, /1\.01\./);
  assert.doesNotMatch(html, /data-product="ActiveClinic"/);
  for (const pattern of SENSITIVE_PATTERNS) {
    assert.doesNotMatch(html, pattern);
  }
});

test("About version build matches simulated /healthz short SHA", () => {
  const full = "e273c3e4b4297e057153cff1aed62e3c1060a307";
  const short = full.slice(0, 12);
  const info = getApplicationBuildInfo({
    env: { DEPLOYMENT_ENV: "testing", GETPRO_GIT_SHA: full },
  });
  // healthz uses the same readGitShaShort / GETPRO_GIT_SHA slice
  assert.equal(info.build, short);
  assert.equal(info.version, `1.03.${short}`);
});
