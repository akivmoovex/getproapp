"use strict";

/**
 * Phase A — MF01 / MF02 / MF04 staff identity chrome (no OTP, no second auth).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { createActiveClinicFoundationApp } = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  renderLoginPage,
  renderOrgSelectPage,
  renderForgotPage,
  renderForgotCheckPage,
  renderResetPage,
  renderResetSuccessPage,
  renderAccessUnavailablePage,
  renderAccessDisabledPage,
} = require("../src/activeclinic/http/renderActiveClinicAuth");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../src/platform/config/deploymentProfiles");

const MINIMAL_AC = {
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  PLATFORM_PRIMARY_PRODUCT: "activeclinic",
};

function noThirdParty(html) {
  assert.doesNotMatch(html, /Continue with Google|Sign in with Google|Sign in with Apple|Send Code|verification code|6-digit/i);
}

describe("ActiveClinic MF staff identity chrome", () => {
  it("MF01 login preserves identifier contract and one login route", () => {
    const html = renderLoginPage({ csrfToken: "csrf-mf" });
    assert.match(html, /data-ac-composition="mf01-login"/);
    assert.match(html, /data-ac-mf-family="MF01"/);
    assert.match(html, /<h1[^>]*>Sign In<\/h1>/);
    assert.match(html, /Email address or phone number/);
    assert.match(html, /action="\/login"/);
    assert.match(html, /href="\/forgot-password"/);
    assert.match(html, /href="\/register-clinic"/);
    assert.match(html, /data-ac-signing-in/);
    assert.match(html, /Secure Connection/);
    noThirdParty(html);
  });

  it("MF01 error state does not enumerate accounts or restore passwords", () => {
    const html = renderLoginPage({
      csrfToken: "csrf-mf",
      error: "We could not sign you in with those details. Check your phone number, email, or password and try again.",
      identifier: "0971234567",
    });
    assert.match(html, /data-ac-auth-screen="login-error"/);
    assert.match(html, /Authentication failed/);
    assert.match(html, /role="alert"/);
    assert.doesNotMatch(html, /Account found|No account exists|Email does not exist/i);
    assert.doesNotMatch(html, /type="password"[^>]*value=/);
    noThirdParty(html);
  });

  it("MF02 selector lists only provided clinics", () => {
    const html = renderOrgSelectPage({
      csrfToken: "csrf-org",
      organizations: [
        {
          organizationId: "11111111-1111-1111-1111-111111111111",
          healthcareOrganizationName: "Lusaka Care",
          locationLabel: "Lusaka",
          roleLabel: "Administrator",
        },
      ],
    });
    assert.match(html, /Select Your Clinic/);
    assert.match(html, /Lusaka Care/);
    assert.match(html, /Administrator/);
    assert.match(html, /href="\/logout"/);
    assert.doesNotMatch(html, /City Health Clinic|Juflona/);
  });

  it("MF02 no-access and disabled states stay distinct", () => {
    const none = renderAccessUnavailablePage();
    assert.match(none, /No Clinic Access/);
    assert.match(none, /data-ac-auth-screen="no-access"/);
    assert.match(none, /href="\/register-clinic"/);
    assert.match(none, /href="\/contact"/);

    const disabled = renderAccessDisabledPage();
    assert.match(disabled, /Access Disabled/);
    assert.match(disabled, /data-ac-auth-screen="access-disabled"/);
    assert.doesNotMatch(disabled, /No Clinic Access/);
    assert.doesNotMatch(disabled, /could not sign you in with those details/i);
  });

  it("MF04 recovery uses token-link copy, not OTP", () => {
    const forgot = renderForgotPage({ csrfToken: "c" });
    assert.match(forgot, /Send reset link/);
    assert.match(forgot, /reset link will be sent/);
    assert.doesNotMatch(forgot, /Send Code/);
    noThirdParty(forgot);

    const check = renderForgotCheckPage({ message: "Neutral confirmation." });
    assert.match(check, /Neutral confirmation/);
    assert.doesNotMatch(check, /Account found|No account exists/i);
    noThirdParty(check);

    const reset = renderResetPage({ csrfToken: "c", token: "tok", valid: true });
    assert.match(reset, /Reset Password/);
    assert.match(reset, /at least 10 characters/);
    assert.doesNotMatch(reset, /12 characters/);

    const success = renderResetSuccessPage();
    assert.match(success, /Password Reset Successful/);
    assert.match(success, /href="\/login"/);
    assert.doesNotMatch(success, /href="\/app"/);
  });

  it("HTTP: /login, /app anonymous, and CSRF rejection keep one identity system", async () => {
    const app = createActiveClinicFoundationApp({
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      env: MINIMAL_AC,
    });
    const home = await request(app).get("/").set("Host", "activeclinic.org");
    assert.ok([200, 303].includes(home.status));

    const login = await request(app).get("/login").set("Host", "activeclinic.org");
    assert.equal(login.status, 200);
    assert.match(login.text, /data-ac-composition="mf01-login"/);

    const appAnon = await request(app).get("/app").set("Host", "activeclinic.org");
    assert.equal(appAnon.status, 303);
    assert.equal(appAnon.headers.location, "/login");

    const denied = await request(app)
      .post("/login")
      .set("Host", "activeclinic.org")
      .type("form")
      .send({ identifier: "x", password: "y", [CSRF_FIELD]: "bad" });
    assert.equal(denied.status, 403);
    assert.match(denied.text, /data-ac-page="login"/);
  });
});
