"use strict";

/**
 * AC-V6-S01 — ActiveClinic authentication Stitch parity rendering + behavior.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { getPgPool, closePgPool } = require("../src/db/pg");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  renderLoginPage,
  renderOrgSelectPage,
  renderActivatePage,
  renderForgotPage,
  renderResetPage,
  renderChangePasswordPage,
  renderLifecycleState,
} = require("../src/activeclinic/http/renderActiveClinicAuth");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");

const MINIMAL_AC = {
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  PLATFORM_PRIMARY_PRODUCT: "activeclinic",
};

function extractCookie(res, name) {
  const raw = [].concat(res.headers["set-cookie"] || []);
  for (const line of raw) {
    const m = String(line).match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

describe("activeclinic-auth-stitch-parity (AC-V6-S01)", () => {
  it("login view model uses shared auth shell and phone-first labelling", () => {
    const html = renderLoginPage({
      csrfToken: "csrf-test",
      error: "Phone/email or password is incorrect.",
      identifier: "0971234567",
    });
    assert.match(html, /data-ac-shell="auth"/);
    assert.match(html, /data-ac-page="login"/);
    assert.match(html, /data-ac-auth-layout="1"/);
    assert.match(html, /data-ac-composition="p01-login-error"/);
    assert.match(html, /Authentication failed/);
    assert.match(html, /Email address or phone number/);
    assert.match(html, /Forgot password\?/);
    assert.match(html, /data-ac-toggle-password="password"/);
    assert.match(html, /aria-label="Show password"/);
    assert.match(html, /autocomplete="username"/);
    assert.match(html, /autocomplete="current-password"/);
    assert.match(html, /name="_csrf" value="csrf-test"/);
    assert.match(html, /role="alert"/);
    assert.match(html, /id="ac-auth-error-summary"/);
    assert.match(html, /data-ac-signing-in/);
    assert.match(html, /Signing you in/);
    assert.doesNotMatch(html, /BlessBoard|Sacred Modernity|church/i);
    assert.doesNotMatch(html, /Juflona|Demo Clinic/i);
    assert.doesNotMatch(html, /patient|prescription|revenue/i);
    assert.doesNotMatch(html, /type="password"[^>]*value=/);
    assert.doesNotMatch(html, /Remember this device/);
  });

  it("organization selection lists server-provided summaries only", () => {
    const html = renderOrgSelectPage({
      csrfToken: "csrf-org",
      organizations: [
        {
          organizationId: "11111111-1111-1111-1111-111111111111",
          healthcareOrganizationName: "Public Hospital",
          staffDisplayName: "Ada Clinic",
        },
      ],
    });
    assert.match(html, /data-ac-page="select-organization"/);
    assert.match(html, /Select Your Clinic/);
    assert.match(html, /Public Hospital/);
    assert.match(html, /Ada Clinic/);
    assert.match(html, /name="organization_id"/);
    assert.doesNotMatch(html, /platform\.identities|permission_key/i);
  });

  it("activation and terminal states render without token leakage beyond URL param usage", () => {
    const ok = renderActivatePage({
      csrfToken: "c",
      token: "raw-token-value",
      preview: {
        purpose: "Invitation",
        staffDisplayName: "Ada",
        healthcareOrganizationName: "HCO",
      },
    });
    assert.match(ok, /data-ac-page="activate"/);
    assert.match(ok, /action="\/activate\/raw-token-value"/);
    assert.match(ok, /Create password/);
    assert.match(ok, /Confirm password/);

    const bad = renderActivatePage({
      csrfToken: "c",
      preview: null,
      stateCode: "expired",
      error: "This link has expired. Ask your administrator for a new link.",
    });
    assert.match(bad, /data-ac-page="activate-invalid"/);
    assert.match(bad, /data-ac-lifecycle-state="expired"/);
    assert.doesNotMatch(bad, /raw-token-value/);
  });

  it("forgot / reset / change-password share auth shell markers", () => {
    const forgot = renderForgotPage({ csrfToken: "c", message: "Neutral." });
    assert.match(forgot, /data-ac-page="forgot-password"/);
    assert.match(forgot, /data-ac-composition="mf04-forgot"/);
    assert.match(forgot, /Send reset link/);
    assert.doesNotMatch(forgot, /Send Code|verification code|6-digit|Continue with Google|Sign in with Apple/i);

    assert.match(
      renderResetPage({ csrfToken: "c", token: "tok", valid: true }),
      /data-ac-page="reset-password"/
    );
    assert.match(
      renderResetPage({ csrfToken: "c", valid: false, stateCode: "consumed", error: "used" }),
      /data-ac-page="reset-invalid"/
    );
    const pw = renderChangePasswordPage({ csrfToken: "c" });
    assert.match(pw, /data-ac-page="change-password"/);
    assert.match(pw, /action="\/logout"/);
    assert.match(pw, /autocomplete="current-password"/);
    assert.match(pw, /autocomplete="new-password"/);
  });

  it("lifecycle state partial supports shared error tone", () => {
    const html = renderLifecycleState({
      pageId: "lifecycle-state",
      heading: "Access restricted",
      message: "You do not have access.",
      tone: "error",
      stateCode: "restricted",
    });
    assert.match(html, /data-ac-shell="auth"/);
    assert.match(html, /Access restricted/);
  });
});

describe("activeclinic-auth-stitch-parity HTTP", () => {
  let pool;
  let dbReady = false;

  before(async () => {
    try {
      pool = getPgPool();
      await pool.query("select 1");
      dbReady = true;
    } catch {
      dbReady = false;
    }
  });

  after(async () => {
    try {
      await closePgPool();
    } catch {
      /* ignore */
    }
  });

  function requireDb() {
    if (!dbReady) {
      // Skip soft: foundation tests cover DB paths; rendering covered above.
      return false;
    }
    return true;
  }

  it("GET /login serves canonical auth shell assets and markers", async () => {
    const app = createActiveClinicFoundationApp({
      getPool: () => pool || { query: async () => ({ rows: [] }) },
      env: MINIMAL_AC,
    });
    const res = await request(app).get("/login").set("Host", "activeclinic.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-ac-shell="auth"/);
    assert.match(res.text, /data-ac-page="login"/);
    assert.match(res.text, /data-ac-composition="p01-login"/);
    assert.match(res.text, /ac-auth-card--split/);
    assert.match(res.text, /ac-auth-brand-panel/);
    assert.match(res.text, /ac-auth\.css/);
    assert.match(res.text, /Email address or phone number/);
    assert.match(res.text, /ActiveClinic/);
    assert.match(res.text, /data-ac-signing-in/);
    assert.doesNotMatch(res.text, /BlessBoard/);
    assert.doesNotMatch(res.text, /Juflona|Demo Clinic/);
    assert.ok(extractCookie(res, CSRF_COOKIE_ACTIVECLINIC_ORG));
  });

  it("GET /forgot-password and invalid activate use auth shell", async () => {
    const app = createActiveClinicFoundationApp({
      getPool: () => pool || { query: async () => ({ rows: [] }) },
      env: MINIMAL_AC,
    });
    const forgot = await request(app).get("/forgot-password").set("Host", "activeclinic.org");
    assert.equal(forgot.status, 200);
    assert.match(forgot.text, /data-ac-page="forgot-password"/);
    assert.match(forgot.text, /data-ac-shell="auth"/);

    if (!requireDb()) return;
    const bad = await request(app)
      .get("/activate/not-a-real-token")
      .set("Host", "activeclinic.org");
    assert.equal(bad.status, 400);
    assert.match(bad.text, /data-ac-page="activate-invalid"/);
    assert.match(bad.text, /data-ac-shell="auth"/);
  });

  it("POST /login without CSRF is denied with auth shell", async () => {
    const app = createActiveClinicFoundationApp({
      getPool: () => pool || { query: async () => ({ rows: [] }) },
      env: MINIMAL_AC,
    });
    const res = await request(app)
      .post("/login")
      .set("Host", "activeclinic.org")
      .type("form")
      .send({ identifier: "x", password: "y", [CSRF_FIELD]: "bad" });
    assert.equal(res.status, 403);
    assert.match(res.text, /data-ac-page="login"/);
    assert.match(res.text, /session expired/i);
  });

  it("static auth assets are served", async () => {
    const app = createActiveClinicFoundationApp({
      getPool: () => pool || { query: async () => ({ rows: [] }) },
      env: MINIMAL_AC,
    });
    const css = await request(app).get("/activeclinic/ac-auth.css");
    assert.equal(css.status, 200);
    assert.match(css.text, /--ac-auth-primary/);
    assert.match(css.text, /ac-auth-signing-in/);
    const js = await request(app).get("/activeclinic/ac-auth.js");
    assert.equal(js.status, 200);
    assert.match(js.text, /data-ac-toggle-password/);
    assert.match(js.text, /data-ac-signing-in|showSigningIn/);
  });
});
