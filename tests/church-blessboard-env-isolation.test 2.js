"use strict";

/**
 * BlessBoard.org (V5) environment isolation — canonical domain, URLs, cookies, uploads.
 * Defaults remain blessboard.com-compatible for V4.
 */

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  getBlessBoardCanonicalDomain,
  getChurchHostDomain,
  getBlessBoardPublicUrl,
  getBlessBoardAdminUrl,
  getBlessBoardApexDomainSet,
  getSessionCookieName,
  getUploadRoot,
  getChurchUploadRoot,
  getDeploymentEnv,
  DEFAULT_SESSION_COOKIE_NAME,
} = require("../src/church/blessBoardEnv");
const { blessboardCanonicalRedirect } = require("../src/church/blessboardCanonicalRedirect");
const { blessBoardAdminUrl } = require("../src/church/blessBoardApexHost");
const { churchPublicHost, churchPublicUrl } = require("../src/church/platformProvisioningValidation");
const { blessboardApexCanonicalUrl } = require("../src/church/platformPublicSeo");

const ENV_KEYS = [
  "BLESSBOARD_CANONICAL_DOMAIN",
  "CHURCH_HOST_DOMAIN",
  "BLESSBOARD_PUBLIC_URL",
  "BLESSBOARD_ADMIN_URL",
  "BLESSBOARD_APEX_DOMAINS",
  "BLESSBOARD_CANONICAL_REDIRECT",
  "SESSION_COOKIE_NAME",
  "UPLOAD_ROOT",
  "BLESSBOARD_JOBS_ENABLED",
  "DEPLOYMENT_ENV",
  "NODE_ENV",
];

function snapshotEnv() {
  const snap = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap) {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

function clearBlessBoardEnv() {
  for (const k of ENV_KEYS) {
    if (k === "NODE_ENV") continue;
    delete process.env[k];
  }
}

function applyOrgV5Env() {
  process.env.BLESSBOARD_CANONICAL_DOMAIN = "blessboard.org";
  process.env.CHURCH_HOST_DOMAIN = "blessboard.org";
  process.env.BLESSBOARD_PUBLIC_URL = "https://blessboard.org";
  process.env.BLESSBOARD_ADMIN_URL = "https://blessboard.org";
  process.env.BLESSBOARD_APEX_DOMAINS = "blessboard.org,www.blessboard.org";
  process.env.BLESSBOARD_CANONICAL_REDIRECT = "1";
  process.env.SESSION_COOKIE_NAME = "blessboard_org_sid";
  process.env.DEPLOYMENT_ENV = "v5-org";
  process.env.BLESSBOARD_JOBS_ENABLED = "0";
}

function makeRedirectApp() {
  const app = express();
  app.set("trust proxy", true);
  app.use(blessboardCanonicalRedirect);
  app.get("*path", (req, res) => {
    res.status(200).send(`ok:${req.headers.host}`);
  });
  return app;
}

test("V4 defaults: canonical .com, public URL, cookie, upload root", () => {
  const snap = snapshotEnv();
  clearBlessBoardEnv();
  try {
    assert.equal(getBlessBoardCanonicalDomain(), "blessboard.com");
    assert.equal(getChurchHostDomain(), "blessboard.com");
    assert.equal(getBlessBoardPublicUrl(), "https://blessboard.com");
    assert.equal(getBlessBoardAdminUrl(), "https://blessboard.com");
    assert.equal(getSessionCookieName(), DEFAULT_SESSION_COOKIE_NAME);
    assert.equal(getSessionCookieName(), "getpro_sid");
    assert.ok(getUploadRoot().endsWith(path.join("data", "uploads")));
    assert.equal(getChurchUploadRoot(), path.join(getUploadRoot(), "church"));
    const apex = getBlessBoardApexDomainSet();
    assert.equal(apex.has("blessboard.com"), true);
    assert.equal(apex.has("blessboard.org"), true);
  } finally {
    restoreEnv(snap);
  }
});

test("V5 org env: public, admin, and tenant URLs use blessboard.org", () => {
  const snap = snapshotEnv();
  clearBlessBoardEnv();
  applyOrgV5Env();
  try {
    assert.equal(getBlessBoardCanonicalDomain(), "blessboard.org");
    assert.equal(getChurchHostDomain(), "blessboard.org");
    assert.equal(getBlessBoardPublicUrl(), "https://blessboard.org");
    assert.equal(getBlessBoardAdminUrl(), "https://blessboard.org");
    assert.equal(blessBoardAdminUrl("/admin/login"), "https://blessboard.org/admin/login");
    assert.equal(blessboardApexCanonicalUrl("/pricing"), "https://blessboard.org/pricing");
    assert.equal(churchPublicHost("demo"), "demo.blessboard.org");
    assert.equal(churchPublicUrl("demo", "/login"), "https://demo.blessboard.org/login");
    assert.equal(getSessionCookieName(), "blessboard_org_sid");
    assert.equal(getDeploymentEnv(), "v5-org");
    assert.equal(require("../src/church/blessBoardEnv").areBlessBoardJobsEnabled(), false);
    const apex = getBlessBoardApexDomainSet();
    assert.equal(apex.has("blessboard.org"), true);
    assert.equal(apex.has("www.blessboard.org"), true);
    assert.equal(apex.has("blessboard.com"), false);
  } finally {
    restoreEnv(snap);
  }
});

test("blessboard.org apex does not redirect to .com when canonical is .org", async () => {
  const snap = snapshotEnv();
  clearBlessBoardEnv();
  applyOrgV5Env();
  try {
    const app = makeRedirectApp();
    const res = await request(app)
      .get("/features?ref=home")
      .set("Host", "blessboard.org")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 200);
    assert.match(res.text, /ok:blessboard\.org/);
    assert.equal(res.headers.location, undefined);
  } finally {
    restoreEnv(snap);
  }
});

test("www.blessboard.org redirects only to blessboard.org when canonical is .org", async () => {
  const snap = snapshotEnv();
  clearBlessBoardEnv();
  applyOrgV5Env();
  try {
    const app = makeRedirectApp();
    const res = await request(app)
      .get("/about?utm=1")
      .set("Host", "www.blessboard.org")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "https://blessboard.org/about?utm=1");
    assert.doesNotMatch(res.headers.location, /blessboard\.com/);
  } finally {
    restoreEnv(snap);
  }
});

test("no cross-TLD redirect: blessboard.com is not redirected to .org when not in apex set", async () => {
  const snap = snapshotEnv();
  clearBlessBoardEnv();
  applyOrgV5Env();
  try {
    const app = makeRedirectApp();
    const res = await request(app)
      .get("/")
      .set("Host", "blessboard.com")
      .set("X-Forwarded-Proto", "https");
    // Not a BlessBoard product host under org-only apex config → middleware passes through
    assert.equal(res.status, 200);
    assert.match(res.text, /ok:blessboard\.com/);
  } finally {
    restoreEnv(snap);
  }
});

test("V4 default: blessboard.org still redirects to blessboard.com", async () => {
  const snap = snapshotEnv();
  clearBlessBoardEnv();
  process.env.BLESSBOARD_CANONICAL_REDIRECT = "1";
  try {
    assert.equal(getBlessBoardCanonicalDomain(), "blessboard.com");
    const app = makeRedirectApp();
    const res = await request(app)
      .get("/pricing?ref=test")
      .set("Host", "blessboard.org")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "https://blessboard.com/pricing?ref=test");
  } finally {
    restoreEnv(snap);
  }
});

test("UPLOAD_ROOT env relocates church upload base", () => {
  const snap = snapshotEnv();
  clearBlessBoardEnv();
  const custom = path.join(path.sep, "tmp", "v5-uploads-test");
  process.env.UPLOAD_ROOT = custom;
  try {
    assert.equal(getUploadRoot(), path.resolve(custom));
    assert.equal(getChurchUploadRoot(), path.join(path.resolve(custom), "church"));
  } finally {
    restoreEnv(snap);
  }
});
