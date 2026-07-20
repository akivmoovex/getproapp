"use strict";

/**
 * Presentation-only apex auth error state mapping (no HTTP / DB).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  renderLoginPage,
  renderAuthErrorPage,
  renderAccountPage,
  classifyAuthErrorState,
} = require("../src/blessboard/http/renderTenantLandingPage");

describe("blessboard apex auth gui states", () => {
  it("maps invalid credentials, throttled, expired, and generic login errors", () => {
    const credentials = renderLoginPage({
      csrfToken: "tok",
      error: "Invalid email or password.",
    });
    assert.match(credentials, /data-bb-auth-error="credentials"/);
    assert.match(credentials, /bb-auth-error-summary/);
    assert.match(credentials, /href="#email"/);
    assert.match(credentials, /id="email-error"/);

    const throttled = renderLoginPage({
      csrfToken: "tok",
      error: "Too many sign-in attempts. Please wait a few minutes and try again.",
    });
    assert.match(throttled, /data-bb-auth-error="throttled"/);
    assert.match(throttled, /Too many sign-in attempts/);

    const expiredLogin = renderLoginPage({
      csrfToken: "tok",
      error: "Your session has expired. Please sign in again.",
    });
    assert.match(expiredLogin, /data-bb-auth-error="expired"/);

    const generic = renderLoginPage({
      csrfToken: "tok",
      error: "Sign-in is temporarily unavailable.",
    });
    assert.match(generic, /data-bb-auth-error="generic"/);
  });

  it("never embeds raw transfer tokens in login HTML", () => {
    const secret = "raw-transfer-token-SECRET-value";
    const html = renderLoginPage({
      csrfToken: "tok",
      transferToken: secret,
      transferHostname: "church.blessboard.org",
    });
    assert.match(html, /data-bb-auth-transfer="1"/);
    assert.match(html, /data-bb-auth-transfer-status="continue"/);
    assert.match(html, /bb-auth-login--transfer/);
    assert.match(html, /bb-auth-card--transfer/);
    assert.match(html, /church\.blessboard\.org/);
    assert.match(html, /Member Access/);
    assert.match(html, /Welcome back to your church family/);
    assert.match(html, /bb-auth-transfer-status/);
    assert.match(html, /Continue sign-in for your church site/);
    assert.doesNotMatch(html, /raw-transfer-token-SECRET-value/);
    assert.doesNotMatch(html, /name="tr"/);
    assert.doesNotMatch(html, /name="next"|name="return_to"|name="redirect"/i);
    assert.doesNotMatch(html, /Forgot password/i);
    assert.doesNotMatch(html, /Register as Member/i);
    assert.doesNotMatch(html, /Continue with (Google|Facebook)|Sign in with (Google|Facebook)|social.?login/i);
    assert.match(html, /name="email"/);
    assert.match(html, /name="password"/);
    assert.match(html, /name="_csrf"/);
    assert.match(html, /name="referrer" content="no-referrer"/);
    assert.match(html, /tenant-auth\.css\?v=13/);
    assert.match(html, /apex-auth\.css\?v=6/);
  });

  it("auth error page classifies expired, consumed, and unauthorized messages", () => {
    assert.equal(classifyAuthErrorState("This sign-in link has already been used."), "consumed");
    assert.equal(classifyAuthErrorState("You do not have access to that church site."), "unauthorized");

    const expired = renderAuthErrorPage("This sign-in link is invalid or has expired.");
    assert.match(expired, /data-bb-auth-error="expired"/);
    assert.match(expired, /data-bb-auth-error-card="expired"/);
    assert.match(expired, /Sign-in link expired/);
    assert.match(expired, /Link expired/);
    assert.match(expired, /href="\/login"/);
    assert.match(expired, /name="referrer" content="no-referrer"/);
    assert.doesNotMatch(expired, /name="next"|name="return_to"|tr=/i);
    assert.doesNotMatch(expired, /raw-transfer|transfer_token|session_token|SECRET|stack trace|internal error/i);

    const consumed = renderAuthErrorPage("This sign-in link has already been used.");
    assert.match(consumed, /data-bb-auth-error="consumed"/);
    assert.match(consumed, /already used/i);
    assert.match(consumed, /bb-auth-panel/);
    assert.match(consumed, /bb-auth-card--error-consumed/);

    const unauthorized = renderAuthErrorPage("You do not have access to that church site.");
    assert.match(unauthorized, /data-bb-auth-error="unauthorized"/);
    assert.match(unauthorized, /Access not available/);
    assert.match(unauthorized, /Access unavailable/);

    const generic = renderAuthErrorPage("Sign-in is temporarily unavailable.");
    assert.match(generic, /data-bb-auth-error="generic"/);
    assert.match(generic, /bb-auth-card--error/);
    assert.match(generic, /Try again/);
  });

  it("account page shows display name and POST logout without UUIDs or session details", () => {
    const html = renderAccountPage({
      displayName: "Administrator",
      userId: "11111111-1111-4111-8111-111111111111",
      deploymentCode: "blessboard-org-v5",
      organizationId: "22222222-2222-4222-8222-222222222222",
      roles: ["church_hq_admin"],
      csrfToken: "csrf-token",
      hostKind: "apex",
    });
    assert.match(html, /Administrator/);
    assert.match(html, /Church HQ admin/);
    assert.match(html, /bb-ds-badge/);
    assert.match(html, /method="post" action="\/logout"/);
    assert.match(html, /data-bb-auth-logout="1"/);
    assert.match(html, /name="_csrf" value="csrf-token"/);
    assert.doesNotMatch(html, /11111111-1111-4111-8111-111111111111/);
    assert.doesNotMatch(html, /22222222-2222-4222-8222-222222222222/);
    assert.doesNotMatch(html, /blessboard-org-v5|session_token|password_hash/);
    assert.doesNotMatch(html, /Forgot password|Change password|Billing|Notification/i);
    assert.doesNotMatch(html, /data-bb-platform-admin-link|Open Platform Admin/);
  });

  it("account page shows Open Platform Admin only when showPlatformAdminLink is set", () => {
    const withLink = renderAccountPage({
      displayName: "Platform Admin",
      roles: ["platform_admin"],
      csrfToken: "csrf-token",
      hostKind: "apex",
      showPlatformAdminLink: true,
    });
    assert.match(withLink, /data-bb-platform-admin-link="1"/);
    assert.match(withLink, /href="\/admin"/);
    assert.match(withLink, /Open Platform Admin/);
    assert.match(withLink, /Tenant administration requires signing in on the church hostname/);

    const withoutFlag = renderAccountPage({
      displayName: "Platform Admin",
      roles: ["platform_admin"],
      csrfToken: "csrf-token",
      hostKind: "apex",
      showPlatformAdminLink: false,
    });
    assert.doesNotMatch(withoutFlag, /data-bb-platform-admin-link|Open Platform Admin/);
  });
});
