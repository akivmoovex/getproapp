"use strict";

/**
 * Shared public registration-success presentation.
 * Product adapters supply copy, paths, and CSS class names.
 * Query `ref` is a public reference only — never a database id.
 */

const crypto = require("crypto");
const { PRODUCT } = require("./constants");

const PREFIX = Object.freeze({
  [PRODUCT.ACTIVECLINIC]: "AC",
  [PRODUCT.BLESSBOARD]: "BB",
});

function productPrefix(productCode) {
  return PREFIX[String(productCode || "")] || null;
}

function generatePublicRegistrationReference(prefix) {
  const code = String(prefix || "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 4);
  const safe = code || "GP";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${safe}-${timestamp}-${random}`;
}

function sanitizePublicRegistrationReference(raw, expectedPrefix) {
  const value = String(raw || "").trim().slice(0, 64);
  if (!value) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }
  const prefix = String(expectedPrefix || "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  if (!prefix) return null;
  const re = new RegExp(`^${prefix}-[A-Za-z0-9](?:[A-Za-z0-9-]{0,60})$`);
  if (!re.test(value)) return null;
  return value;
}

const ACTIVECLINIC_COPY = Object.freeze({
  productCode: PRODUCT.ACTIVECLINIC,
  referencePrefix: "AC",
  successPath: "/register-clinic/success",
  noun: "clinic",
  title: "Clinic Registered Successfully",
  description:
    "Your clinic is ready. We have set up your organisation, clinic, and administrator account.",
  accountsTitle: "Accounts created",
  accountsText: "Your primary clinic and administrator accounts are configured and ready to use.",
  websiteTitle: "Website foundation",
  websiteText: "Your clinic website foundation is built and currently in an unpublished state.",
  nextTitle: "What happens next",
  nextSteps: [
    "Sign in with the email or phone and password you just set.",
    "Open Website Management to customize your clinic website.",
    "The website stays unpublished until you choose to publish it. No Platform Admin approval is required for a normal registration.",
  ],
  signInLabel: "Sign in",
  signInHref: "/login",
  continueLabel: "Continue to dashboard",
  dashboardPath: "/app",
  dashboardLoginPath: "/login?next=/app",
  sessionAwareDashboard: false,
  homeLabel: "Return home",
  homeHref: "/",
  reviewKicker: "Registration received",
  reviewTitle: "Review required",
  reviewDescription:
    "Your clinic registration needs a short review before it can be activated. This is uncommon and does not mean your details were rejected.",
  reviewNextSteps: [
    "Platform Admin will review this exceptional registration.",
    "Your clinic is not active yet and you cannot sign in until review completes.",
    "Keep your reference number if you need to check status later.",
  ],
  reviewPrimaryLabel: "Check registration status",
  reviewPrimaryHref: "/register-clinic/status",
  classes: Object.freeze({
    card: "acw-register__card acw-register__success-card ac-success-panel",
    icon: "acw-register__success-icon",
    kicker: "acw-kicker",
    lede: "acw-register__lede",
    grid: "acw-register-success-grid",
    tile: "acw-register-success-tile",
    note: "ac-public-note acw-register__note",
    subtitle: "ac-success-panel__subtitle",
    list: "ac-public-list",
    actions: "acw-register__actions acw-register__actions--center",
    btnPrimary: "ac-btn ac-btn--primary",
    btnSecondary: "ac-btn ac-btn--secondary",
  }),
  attrs: Object.freeze({
    outcome: "data-ac-registration-outcome",
    reference: "data-ac-application-ref",
    signIn: "data-ac-sign-in",
    continue: "data-ac-continue-onboarding",
    statusLookup: "data-ac-status-lookup-link",
  }),
});

const BLESSBOARD_COPY = Object.freeze({
  productCode: PRODUCT.BLESSBOARD,
  referencePrefix: "BB",
  successPath: "/register-church/success",
  noun: "church",
  layout: "bbr08",
  title: "Church Registered Successfully",
  mobileTitle: "Registration Successful!",
  description: "Your BlessBoard church workspace is ready.",
  descriptionDetail:
    "Your organisation, administrator account, and church website foundation have been created successfully.",
  mobileDescription:
    "Welcome to BlessBoard. Your church account has been successfully created and is ready to use.",
  referenceLabel: "Registration Reference",
  mobileReferenceLabel: "Church ID",
  referenceHint: "Keep this reference if you need help with your registration.",
  mobileConfirmTitle: "Confirmation Sent",
  mobileConfirmText:
    "Your church registration is confirmed. Keep this page if you need help with your account.",
  mobileNextTitle: "Next Steps",
  mobileNextText:
    "Complete your church profile and invite your first team members from the dashboard.",
  accountsTitle: "Accounts created",
  accountsText:
    "Your church workspace and administrator account are ready. You can now manage your church, branches, members, and settings.",
  websiteTitle: "Website foundation",
  websiteText:
    "Your church website has been created as a draft. It will remain unpublished until you choose to publish it.",
  websiteBadge: "Unpublished",
  nextTitle: "What happens next",
  nextSteps: [
    "Open your dashboard — Log in to view your administrative tools.",
    "Complete your profile — Add details, logos, and contact information.",
    "Customize website — Design your public-facing church presence.",
    "Publish when ready — Make your site live to your community.",
  ],
  nextStepItems: Object.freeze([
    Object.freeze({
      title: "Open your dashboard",
      text: "Log in to view your administrative tools.",
    }),
    Object.freeze({
      title: "Complete your profile",
      text: "Add details, logos, and contact information.",
    }),
    Object.freeze({
      title: "Customize website",
      text: "Design your public-facing church presence.",
    }),
    Object.freeze({
      title: "Publish when ready",
      text: "Make your site live to your community.",
    }),
  ]),
  signInLabel: "Sign in",
  signInHref: "/login",
  continueLabel: "Continue to dashboard",
  mobileContinueLabel: "Continue to Dashboard",
  mobileReceiptLabel: "View Registration Receipt",
  dashboardPath: "/hq",
  dashboardLoginPath: "/login?next=/hq",
  sessionAwareDashboard: true,
  homeLabel: "Return home",
  homeHref: "/",
  reviewKicker: "",
  reviewTitle: "",
  reviewDescription: "",
  reviewNextSteps: [],
  reviewPrimaryLabel: "",
  reviewPrimaryHref: "/",
  classes: Object.freeze({
    card: "bb-apex-register__card bb-rs-card",
    icon: "bb-rs-icon",
    kicker: "bb-rs-kicker",
    lede: "bb-rs-lede",
    grid: "bb-rs-grid",
    tile: "bb-rs-tile",
    note: "bb-rs-note",
    subtitle: "bb-rs-subtitle",
    list: "bb-rs-list",
    actions: "bb-rs-actions",
    btnPrimary: "bb-apex-btn bb-apex-btn--primary",
    btnSecondary: "bb-apex-btn bb-apex-btn--secondary",
  }),
  attrs: Object.freeze({
    outcome: "data-bb-registration-outcome",
    reference: "data-bb-application-ref",
    signIn: "data-bb-sign-in",
    continue: "data-bb-continue-dashboard",
    statusLookup: "data-bb-status-lookup-link",
  }),
});

function copyFor(productCode) {
  if (String(productCode || "") === PRODUCT.BLESSBOARD) return BLESSBOARD_COPY;
  return ACTIVECLINIC_COPY;
}

function buildRegistrationSuccessRedirect(input) {
  const copy = copyFor(input && input.productCode);
  const params = new URLSearchParams();
  const reference = sanitizePublicRegistrationReference(
    (input && input.reference) || "",
    copy.referencePrefix
  );
  if (reference) params.set("ref", reference);
  if (input && input.review) params.set("review", "1");
  else if (input && input.ready) params.set("ready", "1");
  const qs = params.toString();
  return qs ? `${copy.successPath}?${qs}` : copy.successPath;
}

function buildRegistrationSuccessViewModel(input) {
  const copy = copyFor(input && input.productCode);
  const reviewRequired = Boolean(input && input.reviewRequired);
  const ready = Boolean(input && input.ready) && !reviewRequired;
  const authenticated = Boolean(input && input.authenticated);
  const reference = sanitizePublicRegistrationReference(
    (input && (input.reference || input.applicationReference)) || "",
    copy.referencePrefix
  );
  const dashboardHref = !ready
    ? null
    : copy.sessionAwareDashboard && !authenticated
      ? copy.dashboardLoginPath
      : copy.dashboardPath;
  const reviewPrimaryHref = copy.reviewPrimaryHref
    ? reference
      ? `${copy.reviewPrimaryHref}?ref=${encodeURIComponent(reference)}`
      : copy.reviewPrimaryHref
    : null;
  const outcome = reviewRequired ? "review_required" : ready ? "ready" : "recorded";
  return {
    ...copy,
    reviewRequired,
    ready,
    authenticated,
    reference,
    dashboardHref,
    showContinue: Boolean(ready && dashboardHref),
    reviewPrimaryHref,
    outcome,
    stateKey: reviewRequired ? "review_required" : ready ? "ready" : "success_terminal",
  };
}

module.exports = {
  PREFIX,
  generatePublicRegistrationReference,
  sanitizePublicRegistrationReference,
  productPrefix,
  buildRegistrationSuccessRedirect,
  buildRegistrationSuccessViewModel,
  copyFor,
};
