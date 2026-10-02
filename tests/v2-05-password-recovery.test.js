"use strict";

/**
 * V2.05 — Staff password recovery (BlessBoard apex + ActiveClinic) regression.
 * Covers phone-first UI honesty, enumeration-safe responses, product routing,
 * and reset → login handoff. Deep token security remains in
 * tests/v8-shared-auth-password-security.test.js.
 */

const path = require("path");
const fs = require("fs");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  createV5FoundationApp,
} = require("../src/platform/http/v5FoundationServer");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  NEUTRAL_MESSAGE: BB_NEUTRAL,
} = require("../src/blessboard/services/passwordResetService");
const {
  NEUTRAL_MESSAGE: AC_NEUTRAL,
} = require("../src/activeclinic/services/activeClinicPasswordRecoveryService");
const {
  renderForgotPage,
  renderResetSuccessPage,
} = require("../src/activeclinic/http/renderActiveClinicAuth");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");

const ROOT = path.join(__dirname, "..");

const BB_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "v205-bb-recovery-session-secret-0123456789ab",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
  BLESSBOARD_APEX_ORIGIN: "https://blessboard.org",
});

const AC_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "v205-ac-recovery-session-secret-0123456789ab",
});

let pool;
let skipReason = null;

function requireDb() {
  if (skipReason) {
    assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }
}

function extractCsrf(html) {
  const m = String(html || "").match(
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || "";
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0];
    }
  }
  return null;
}

describe("V2.05 staff password recovery", () => {
  before(async () => {
    try {
      const url = await resetFoundationDatabase();
      pool = createFoundationPool(url);
      await migrate({ pool });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no db";
      pool = null;
    }
  });

  after(async () => {
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
  });

  it("BB apex forgot-password UI is phone-first and does not claim SMS/OTP", () => {
    const html = fs.readFileSync(
      path.join(ROOT, "views/blessboard/v5/apex/forgot-password.ejs"),
      "utf8"
    );
    assert.match(html, /data-bb-page="forgot-password"/);
    assert.match(html, /data-bb-auth-recovery="phone-or-email"/);
    assert.match(html, /Mobile phone number/);
    assert.match(html, /Email address, optional/);
    assert.doesNotMatch(
      html,
      /SMS recovery|6-digit code|Check your phone for a code|Send Code|verification code/i
    );
    assert.match(html, /reset link by email/i);
  });

  it("AC forgot-password UI stays phone/email without OTP claims", () => {
    const html = renderForgotPage({
      csrfToken: "csrf-test",
      message: null,
      error: null,
    });
    assert.match(html, /data-ac-auth-screen="forgot-password"/);
    assert.match(html, /Send reset link/);
    assert.doesNotMatch(
      html,
      /Send Code|verification code|6-digit|Continue with Google|Sign in with Apple/i
    );
  });

  it("AC reset success returns to product login with reset flag", () => {
    const html = renderResetSuccessPage();
    assert.match(html, /href="\/login\?reset=1"/);
    assert.doesNotMatch(html, /blessboard|BlessBoard/);
  });

  it("BB GET/POST /forgot-password stays enumeration-safe on apex host", async () => {
    requireDb();
    const app = createV5FoundationApp({
      getPool: () => pool,
      env: BB_ENV,
    });
    const getRes = await request(app)
      .get("/forgot-password")
      .set("Host", "blessboard.org");
    assert.equal(getRes.status, 200);
    assert.match(getRes.text, /data-bb-page="forgot-password"/);
    assert.doesNotMatch(getRes.text, /SMS recovery|6-digit code/i);

    const csrf = extractCsrf(getRes.text);
    assert.ok(csrf);
    const cookie = extractCookie(getRes, CSRF_COOKIE);
    const postRes = await request(app)
      .post("/forgot-password")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie || "")
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        email: `nobody_${Date.now()}@example.test`,
      });
    assert.equal(postRes.status, 200);
    assert.match(postRes.text, new RegExp(BB_NEUTRAL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(postRes.text, /token=|reset-password\?/);
  });

  it("AC GET/POST /forgot-password stays enumeration-safe", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: AC_ENV,
      allowPlatformRuntimeChild: true,
    });
    const getRes = await request(app)
      .get("/forgot-password")
      .set("Host", "activeclinic.test");
    assert.equal(getRes.status, 200);
    assert.match(getRes.text, /Forgot Password/);

    const csrf = extractCsrf(getRes.text);
    assert.ok(csrf);
    const cookies = []
      .concat(getRes.headers["set-cookie"] || [])
      .map((c) => String(c).split(";")[0])
      .join("; ");
    const postRes = await request(app)
      .post("/forgot-password")
      .set("Host", "activeclinic.test")
      .set("Cookie", cookies)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        identifier: `nobody_${Date.now()}@example.test`,
      });
    assert.equal(postRes.status, 303);
    assert.equal(postRes.headers.location, "/forgot-password/check");

    const check = await request(app)
      .get("/forgot-password/check")
      .set("Host", "activeclinic.test");
    assert.equal(check.status, 200);
    assert.match(
      check.text,
      new RegExp(AC_NEUTRAL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
    assert.doesNotMatch(check.text, /token=|reset-password\//);
  });

  it("product recovery routes do not cross-serve (BB apex vs AC host)", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const bbApp = createV5FoundationApp({ getPool: () => pool, env: BB_ENV });
    const acApp = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: AC_ENV,
      allowPlatformRuntimeChild: true,
    });

    const bbOnAcHost = await request(bbApp)
      .get("/forgot-password")
      .set("Host", "activeclinic.test");
    // BB router requires apex host; non-apex yields 404
    assert.equal(bbOnAcHost.status, 404);

    const bbOk = await request(bbApp)
      .get("/forgot-password")
      .set("Host", "blessboard.org");
    assert.equal(bbOk.status, 200);
    assert.match(bbOk.text, /BlessBoard/);

    const ac = await request(acApp)
      .get("/forgot-password")
      .set("Host", "activeclinic.neuniversity.org");
    assert.equal(ac.status, 200);
    assert.match(ac.text, /ActiveClinic/);
    assert.doesNotMatch(ac.text, /data-bb-page="forgot-password"/);
  });
});
