"use strict";

/**
 * V11 navigation / route-debt QA — BlessBoard /churches, editor Exit, AC /book.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  createV5FoundationApp,
  isUnavailableAppPath,
} = require("../src/platform/http/v5FoundationServer");
const {
  createMoovexPlatformRuntimeApp,
  buildDefaultProductApps,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const ROOT = path.join(__dirname, "..");
const IDENTITY_KEY = "moovex-platform-v7";
const BB_HOST = "blessboard.pronline.org";
const AC_HOST = "activeclinic.pronline.org";

const UNIFIED_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
});

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v7 navigation route debt — static contracts", () => {
  it("isUnavailableAppPath treats /church/* as unavailable but not /churches", () => {
    assert.equal(isUnavailableAppPath("/church"), true);
    assert.equal(isUnavailableAppPath("/church/foo"), true);
    assert.equal(isUnavailableAppPath("/churches"), false);
    assert.equal(isUnavailableAppPath("/churches/demo"), false);
    assert.equal(isUnavailableAppPath("/directory"), false);
  });

  it("shared editor chrome exposes Exit editing on desktop and mobile", () => {
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    assert.match(chrome, /data-website-exit-href/);
    assert.match(chrome, /gp-website-editor__exit--desktop/);
    assert.match(chrome, /gp-website-editor__exit--mobile/);
    assert.match(chrome, /data-website-engine-exit="1"/);
    assert.match(chrome, /data-bb-exit-editing="1"/);
    assert.match(chrome, /Exit editing/);
  });

  it("website lifecycle reuses Exit editing for browser Back", () => {
    const js = read("public/platform/website-lifecycle.js");
    assert.match(js, /armEditorBackExit|gpWebsiteEditorArmed/);
    assert.match(js, /exitEditingViaGuard/);
    assert.match(js, /resolveExitHref/);
    assert.match(js, /data-website-engine-exit/);
    assert.match(js, /popstate/);
  });
});

describe("v7 navigation route debt — HTTP", () => {
  let pool;
  let skipReason = null;
  let bbApp;
  let runtimeApp;

  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const reset = await resetFoundationDatabase();
      pool = createFoundationPool(reset.connectionString);
      await migrate({
        connectionString: reset.connectionString,
        modules: ["platform", "blessboard", "activeclinic"],
        direction: "up",
      });
      await ensureDatabaseIdentity(pool, {
        expectedKey: IDENTITY_KEY,
        expectedEnvironment: "testing",
        allowCreate: true,
      });
      bbApp = createV5FoundationApp({
        getPool: () => pool,
        env: {
          ...UNIFIED_ENV,
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        },
      });
      runtimeApp = createMoovexPlatformRuntimeApp({
        env: UNIFIED_ENV,
        getPool: () => pool,
        productApps: buildDefaultProductApps({
          env: UNIFIED_ENV,
          getPool: () => pool,
        }),
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 200) : "db unavailable";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("BlessBoard /churches redirects to /directory (not 503)", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const res = await request(bbApp).get("/churches").set("Host", "blessboard.org");
    assert.equal(res.status, 302, res.text && res.text.slice(0, 200));
    assert.equal(res.headers.location, "/directory");
    assert.doesNotMatch(String(res.text || ""), /not yet available/i);
  });

  it("BlessBoard /churches?q= preserves search on /directory", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const res = await request(bbApp)
      .get("/churches?q=kafue")
      .set("Host", "blessboard.org");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/directory?q=kafue");
  });

  it("BlessBoard /churches/:slug redirects to /c/:slug", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const res = await request(bbApp)
      .get("/churches/demo-church")
      .set("Host", "blessboard.org");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/c/demo-church");
  });

  it("ActiveClinic apex /book stays 404 (clinic-scoped booking only)", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const res = await request(runtimeApp).get("/book").set("Host", AC_HOST);
    assert.equal(res.status, 404, `expected 404 got ${res.status}`);
    assert.equal(res.headers.location, undefined);
  });

  it("ActiveClinic clinic-scoped /clinics/:key/book remains the booking entry", async (t) => {
    if (skipReason) return t.skip(skipReason);
    // Unknown clinic still must not collide with apex /book — path exists on AC router.
    const res = await request(runtimeApp)
      .get("/clinics/nonexistent-clinic-xyz/book")
      .set("Host", AC_HOST);
    assert.notEqual(res.status, 503);
    assert.ok([200, 302, 303, 404].includes(res.status), `status ${res.status}`);
  });

  it("BlessBoard /church/* remains controlled unavailable", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const res = await request(bbApp)
      .get("/church/legacy")
      .set("Host", "blessboard.org")
      .set("Accept", "text/plain");
    assert.equal(res.status, 503);
    assert.match(res.text, /not yet available/i);
  });
});
