"use strict";

/**
 * ActiveClinic authentication view rendering (AC-V6-S01).
 * View models only — no identity/staff DB rows passed to public templates.
 */

const {
  renderActiveClinicView,
} = require("./renderActiveClinicView");
const { CSRF_FIELD } = require("../../platform/http/v5Csrf");
const {
  PASSWORD_MIN,
} = require("../../platform/services/platformIdentityCredentialService");
const {
  buildPhoneFieldLocals,
} = require("../services/activeClinicPhoneFieldLocals");

const ASSET_VERSION = "v7-acw-10";

const DEFAULT_BRANDING = Object.freeze({
  productName: "ActiveClinic",
  supportingName: "ActiveClinic",
  tagline: "Clinic operations, connected.",
  taglineMobile: "Clinical Precision with Human Warmth.",
  taglineLong: "Secure access to your medical ecosystem.",
});

function baseLocals(overrides) {
  const phoneLocals = buildPhoneFieldLocals({
    clinicDefaultCountry: overrides && overrides.clinicDefaultCountry,
    selectedCountry: overrides && overrides.phoneCountry,
  });
  return {
    csrfField: CSRF_FIELD,
    assetVersion: ASSET_VERSION,
    productName: DEFAULT_BRANDING.productName,
    supportingName: DEFAULT_BRANDING.supportingName,
    tagline: DEFAULT_BRANDING.tagline,
    taglineMobile: DEFAULT_BRANDING.taglineMobile,
    taglineLong: DEFAULT_BRANDING.taglineLong,
    passwordMin: PASSWORD_MIN,
    composition: "split",
    ...phoneLocals,
    ...overrides,
  };
}

function renderAuthShell(pageId, pageTitle, bodyHtml, extras) {
  return renderActiveClinicView("layouts/auth-shell.ejs", {
    pageId,
    pageTitle,
    bodyHtml,
    assetVersion: ASSET_VERSION,
    composition: (extras && extras.composition) || "split",
  });
}

function renderAuthContent(relativePath, locals) {
  return renderActiveClinicView(relativePath, locals);
}

function renderLoginPage(input) {
  const locals = baseLocals({
    pageTitle: "Sign in",
    notice: (input && input.notice) || null,
    error: (input && input.error) || null,
    identifier: String((input && input.identifier) || ""),
    phoneCountry: String((input && input.phoneCountry) || "ZM").toUpperCase(),
    nextPath: (input && input.nextPath) || null,
    csrfToken: input && input.csrfToken,
    composition: (input && input.error) ? "acw08-error" : "acw08-login",
  });
  const bodyHtml = renderAuthContent("auth/login.ejs", locals);
  return renderAuthShell("login", locals.pageTitle, bodyHtml, {
    composition: locals.composition,
  });
}

function renderOrgSelectPage(input) {
  const orgs = Array.isArray(input && input.organizations)
    ? input.organizations.map((o) => ({
        organizationId: String(o.organizationId || (o.organization && o.organization.id) || ""),
        displayName: o.displayName || (o.organization && o.organization.displayName) || "",
        healthcareOrganizationName:
          o.healthcareOrganizationName ||
          (o.healthcareOrganization && o.healthcareOrganization.publicName) ||
          (o.healthcareOrganization && o.healthcareOrganization.legalName) ||
          o.displayName ||
          "",
        staffDisplayName:
          o.staffDisplayName || (o.staffMember && o.staffMember.displayName) || "",
        roleLabel: o.roleLabel || "",
        locationLabel: o.locationLabel || "",
        statusLabel: o.statusLabel || "Active",
      }))
    : [];
  const locals = baseLocals({
    pageTitle: "Choose a clinic",
    error: (input && input.error) || null,
    organizations: orgs,
    csrfToken: input && input.csrfToken,
    composition: "single",
  });
  const bodyHtml = renderAuthContent("auth/select-organization.ejs", locals);
  return renderAuthShell("select-organization", locals.pageTitle, bodyHtml, {
    composition: "single",
  });
}

function renderChangePasswordPage(input) {
  const locals = baseLocals({
    pageTitle: "Change password",
    error: (input && input.error) || null,
    csrfToken: input && input.csrfToken,
    composition: "single",
  });
  const bodyHtml = renderAuthContent("auth/change-password.ejs", locals);
  return renderAuthShell("change-password", locals.pageTitle, bodyHtml, {
    composition: "single",
  });
}

function renderActivatePage(input) {
  const preview = input && input.preview;
  if (!preview) {
    return renderLifecycleState({
      pageId: "activate-invalid",
      pageTitle: "Invitation",
      stateCode: (input && input.stateCode) || "invalid",
      heading: "Invitation unavailable",
      message: (input && input.error) || "This link is not valid.",
      tone: "error",
      primaryHref: "/login",
      primaryLabel: "Return to sign in",
    });
  }
  const locals = baseLocals({
    pageTitle: "Activate account",
    csrfToken: input.csrfToken,
    token: input.token,
    purpose: preview.purpose || "Activate your staff account",
    staffDisplayName: preview.staffDisplayName || "Staff member",
    organizationName:
      preview.healthcareOrganizationName || preview.organizationName || "",
    error: input.error || null,
    composition: "single",
  });
  const bodyHtml = renderAuthContent("auth/activate.ejs", locals);
  return renderAuthShell("activate", locals.pageTitle, bodyHtml, {
    composition: "single",
  });
}

function renderForgotPage(input) {
  const locals = baseLocals({
    pageTitle: "Forgot password",
    csrfToken: input && input.csrfToken,
    message: (input && input.message) || null,
    error: (input && input.error) || null,
    identifier: String((input && input.identifier) || ""),
    phoneCountry: String((input && input.phoneCountry) || "ZM").toUpperCase(),
    composition: "single",
  });
  const bodyHtml = renderAuthContent("auth/forgot-password.ejs", locals);
  return renderAuthShell("forgot-password", locals.pageTitle, bodyHtml, {
    composition: "single",
  });
}

function renderForgotCheckPage(input) {
  const locals = baseLocals({
    pageTitle: "Check for reset instructions",
    message:
      (input && input.message) ||
      "If an eligible ActiveClinic account exists for that phone or email, reset instructions are available to authorized administrators when delivery is configured.",
    composition: "single",
  });
  const bodyHtml = renderAuthContent("auth/forgot-password-check.ejs", locals);
  return renderAuthShell("forgot-password-check", locals.pageTitle, bodyHtml, {
    composition: "single",
  });
}

function renderResetSuccessPage() {
  const locals = baseLocals({
    pageTitle: "Password updated",
    composition: "single",
  });
  const bodyHtml = renderAuthContent("auth/reset-password-success.ejs", locals);
  return renderAuthShell("reset-password-success", locals.pageTitle, bodyHtml, {
    composition: "single",
  });
}

function renderResetPage(input) {
  if (!(input && input.valid)) {
    return renderLifecycleState({
      pageId: "reset-invalid",
      pageTitle: "Reset password",
      stateCode: (input && input.stateCode) || "invalid",
      heading: "Reset link unavailable",
      message: (input && input.error) || "This link is not valid.",
      tone: "error",
      primaryHref: "/forgot-password",
      primaryLabel: "Request a new reset",
      secondaryHref: "/login",
      secondaryLabel: "Sign in",
    });
  }
  const locals = baseLocals({
    pageTitle: "Reset password",
    csrfToken: input.csrfToken,
    token: input.token,
    error: input.error || null,
    composition: "single",
  });
  const bodyHtml = renderAuthContent("auth/reset-password.ejs", locals);
  return renderAuthShell("reset-password", locals.pageTitle, bodyHtml, {
    composition: "single",
  });
}

function renderLifecycleState(input) {
  const locals = baseLocals({
    pageTitle: (input && input.pageTitle) || "ActiveClinic",
    stateCode: (input && input.stateCode) || "invalid",
    heading: (input && input.heading) || "Something went wrong",
    message: (input && input.message) || "Please try again.",
    tone: (input && input.tone) || "error",
    primaryHref: (input && input.primaryHref) || "/login",
    primaryLabel: (input && input.primaryLabel) || "Return to sign in",
    secondaryHref: (input && input.secondaryHref) || null,
    secondaryLabel: (input && input.secondaryLabel) || null,
    composition: "single",
  });
  const bodyHtml = renderAuthContent("auth/lifecycle-state.ejs", locals);
  return renderAuthShell(
    (input && input.pageId) || "lifecycle-state",
    locals.pageTitle,
    bodyHtml,
    { composition: "single" }
  );
}

function renderAccessUnavailablePage() {
  return renderLifecycleState({
    pageId: "access-unavailable",
    pageTitle: "Access unavailable",
    stateCode: "no_eligible_clinic",
    heading: "No clinic access",
    message:
      "This account signed in successfully, but it does not currently have an eligible ActiveClinic workspace.",
    tone: "error",
    primaryHref: "/login",
    primaryLabel: "Return to sign in",
    secondaryHref: "/contact",
    secondaryLabel: "Contact support",
  });
}

function renderPlatformAdminLanding() {
  return renderLifecycleState({
    pageId: "platform-admin",
    pageTitle: "Platform administration",
    stateCode: "platform_admin",
    heading: "Platform administration",
    message:
      "This identity is a platform administrator and does not have an eligible clinic workspace on ActiveClinic. Platform operations continue in the existing platform environment.",
    tone: "success",
    primaryHref: "/login",
    primaryLabel: "Return to sign in",
    secondaryHref: "/logout",
    secondaryLabel: "Sign out",
  });
}

module.exports = {
  ASSET_VERSION,
  DEFAULT_BRANDING,
  PASSWORD_MIN,
  renderLoginPage,
  renderOrgSelectPage,
  renderChangePasswordPage,
  renderActivatePage,
  renderForgotPage,
  renderForgotCheckPage,
  renderResetPage,
  renderResetSuccessPage,
  renderLifecycleState,
  renderAccessUnavailablePage,
  renderPlatformAdminLanding,
};
