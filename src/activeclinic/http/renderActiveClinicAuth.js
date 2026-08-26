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

const ASSET_VERSION = "v7-v1-login-1";

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
    composition: (input && input.error) ? "p01-login-error" : "p01-login",
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
    pageTitle: "Select your clinic",
    error: (input && input.error) || null,
    organizations: orgs,
    csrfToken: input && input.csrfToken,
    composition: "mf02-selector",
    selectorState:
      (input && input.selectorState) ||
      (orgs.length === 0 ? "expired" : "ready"),
  });
  const bodyHtml = renderAuthContent("auth/select-organization.ejs", locals);
  return renderAuthShell("select-organization", locals.pageTitle, bodyHtml, {
    composition: "mf02-selector",
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
    composition: "mf04-forgot",
  });
  const bodyHtml = renderAuthContent("auth/forgot-password.ejs", locals);
  return renderAuthShell("forgot-password", locals.pageTitle, bodyHtml, {
    composition: "mf04-forgot",
  });
}

function renderForgotCheckPage(input) {
  const locals = baseLocals({
    pageTitle: "Check for reset instructions",
    message:
      (input && input.message) ||
      "If an eligible ActiveClinic account exists for that phone or email, reset instructions are available to authorized administrators when delivery is configured.",
    composition: "mf04-check",
  });
  const bodyHtml = renderAuthContent("auth/forgot-password-check.ejs", locals);
  return renderAuthShell("forgot-password-check", locals.pageTitle, bodyHtml, {
    composition: "mf04-check",
  });
}

function renderResetSuccessPage() {
  const locals = baseLocals({
    pageTitle: "Password updated",
    composition: "mf04-success",
  });
  const bodyHtml = renderAuthContent("auth/reset-password-success.ejs", locals);
  return renderAuthShell("reset-password-success", locals.pageTitle, bodyHtml, {
    composition: "mf04-success",
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
    composition: "mf04-reset",
  });
  const bodyHtml = renderAuthContent("auth/reset-password.ejs", locals);
  return renderAuthShell("reset-password", locals.pageTitle, bodyHtml, {
    composition: "mf04-reset",
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
    tertiaryHref: (input && input.tertiaryHref) || null,
    tertiaryLabel: (input && input.tertiaryLabel) || null,
    variant: (input && input.variant) || "lifecycle",
    composition: (input && input.composition) || "single",
  });
  const bodyHtml = renderAuthContent("auth/lifecycle-state.ejs", locals);
  return renderAuthShell(
    (input && input.pageId) || "lifecycle-state",
    locals.pageTitle,
    bodyHtml,
    { composition: locals.composition }
  );
}

function renderAccessUnavailablePage() {
  return renderLifecycleState({
    pageId: "access-unavailable",
    pageTitle: "No clinic access",
    stateCode: "no_eligible_clinic",
    heading: "No Clinic Access",
    message:
      "Your account is active, but you are not assigned to any clinic workspaces yet. Register your clinic or contact support for help.",
    tone: "error",
    primaryHref: "/register-clinic",
    primaryLabel: "Register your clinic",
    secondaryHref: "/contact",
    secondaryLabel: "Contact support",
    tertiaryHref: "/login",
    tertiaryLabel: "Return to sign in",
    variant: "no-access",
    composition: "mf02-no-access",
  });
}

function renderAccessDisabledPage() {
  return renderLifecycleState({
    pageId: "access-disabled",
    pageTitle: "Access disabled",
    stateCode: "access_disabled",
    heading: "Access Disabled",
    message:
      "Access to this clinic workspace has been disabled. If you believe this is an error, contact the clinic administrator or ActiveClinic support.",
    tone: "error",
    primaryHref: "/login",
    primaryLabel: "Sign in as a different user",
    secondaryHref: "/contact",
    secondaryLabel: "Contact support",
    variant: "access-disabled",
    composition: "mf02-disabled",
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
  renderAccessDisabledPage,
  renderPlatformAdminLanding,
};
