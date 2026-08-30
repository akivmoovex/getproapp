"use strict";

/**
 * Apex marketing page renderers (Batch 2b). Presentation only.
 */

const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  BLESSBOARD_PRICING_ONBOARDING_NOTE,
  STAFF_BILLING_NOTE,
  THIRD_PARTY_COSTS_NOTE,
  buildApexPricingPlans,
  buildApexPartnerPlan,
  buildPublicPricingComparisonRows,
  buildApexPricingFaq,
  mapDirectoryItems,
} = require("./apexMarketingContent");
const {
  buildPlatformPhoneFieldLocals,
} = require("../../platform/services/platformPhoneFieldLocals");
const {
  PRODUCT_CODE,
  publicOriginForProduct,
  publicWebsitePathPrefix,
} = require("../../platform/website/publicWebsiteUrl");
const {
  resolvePhoneValidationMode,
  VALIDATION_MODES,
} = require("../../platform/services/phoneNumberService");
const {
  RESERVED_ORGANIZATION_KEYS,
  resolveBaseOrganizationKey,
} = require("../services/organizationKey");
const {
  buildRegistrationSuccessViewModel,
} = require("../../platform/registration/registrationSuccessPresentation");

function renderApexView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
}

function shellLocals(opts) {
  return {
    authenticated: Boolean(opts && opts.authenticated),
    csrfToken: (opts && opts.csrfToken) || "",
    activeNav: (opts && opts.activeNav) || "home",
  };
}

function renderFeaturesPage(opts) {
  return renderApexView("apex/features.ejs", {
    ...shellLocals(opts),
    pageTitle: "Features",
    activeNav: "features",
  });
}

function renderForChurchesPage(opts) {
  return renderApexView("apex/for-churches.ejs", {
    ...shellLocals(opts),
    pageTitle: "For Churches",
    activeNav: "for-churches",
  });
}

function renderPricingPage(opts) {
  return renderApexView("apex/pricing.ejs", {
    ...shellLocals(opts),
    pageTitle: "Pricing",
    activeNav: "pricing",
    pricingOnboardingNote: BLESSBOARD_PRICING_ONBOARDING_NOTE,
    pricingPlans: buildApexPricingPlans(),
    partnerPlan: buildApexPartnerPlan(),
    pricingComparisonRows: buildPublicPricingComparisonRows(),
    staffBillingNote: STAFF_BILLING_NOTE,
    thirdPartyCostsNote: THIRD_PARTY_COSTS_NOTE,
    faqItems: buildApexPricingFaq(),
  });
}

function renderDirectoryPage(opts) {
  const results = (opts && opts.results) || {
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
    q: "",
  };
  return renderApexView("apex/directory.ejs", {
    ...shellLocals(opts),
    pageTitle: "Church Directory",
    activeNav: "directory",
    q: results.q || "",
    items: mapDirectoryItems(results.items),
    total: Number(results.total) || 0,
    page: Number(results.page) || 1,
    totalPages: Number(results.totalPages) || 0,
    directoryUnavailable: Boolean(opts && opts.directoryUnavailable),
  });
}

function renderRegisterChurchPage(opts) {
  const form = (opts && opts.form) || {};
  const env = (opts && opts.env) || process.env;
  const phoneLocals = buildPlatformPhoneFieldLocals({
    env,
    selectedCountry: form.phone_country || null,
    nationalValue:
      form.phone_national ||
      (form.phone && !String(form.phone).trim().startsWith("+") ? form.phone : "") ||
      "",
    e164Value:
      !form.phone_national && form.phone && String(form.phone).trim().startsWith("+")
        ? form.phone
        : null,
  });
  const phoneMode = resolvePhoneValidationMode(env);
  const origin = publicOriginForProduct(PRODUCT_CODE.BLESSBOARD, env) || "https://blessboard.com";
  const churchPublicHost = String(origin).replace(/^https?:\/\//, "").replace(/\/$/, "");
  const churchPublicPathPrefix = publicWebsitePathPrefix(PRODUCT_CODE.BLESSBOARD) || "/c";
  const churchPublicUrlBase = `${churchPublicHost}${churchPublicPathPrefix}/`;
  const churchNameForPreview = form.church_name || (opts && opts.organizationKeyPreview) || "";
  const derivedPreview = resolveBaseOrganizationKey(churchNameForPreview).key || "";
  return renderApexView("apex/register-church.ejs", {
    ...shellLocals(opts),
    pageTitle: "Register Your Church",
    activeNav: "register-church",
    csrfField: (opts && opts.csrfField) || "_csrf",
    submitted: Boolean(opts && opts.submitted),
    submittedPlan: (opts && opts.submittedPlan) || null,
    networkSupportSuccess: Boolean(opts && opts.networkSupportSuccess),
    workspaceReady: Boolean(opts && opts.workspaceReady),
    loginFallback: Boolean(opts && opts.loginFallback),
    review: Boolean(opts && opts.review),
    organizationKeyPreview:
      (opts && opts.organizationKeyPreview) || derivedPreview || form.organization_key || "",
    churchPublicHost,
    churchPublicPathPrefix,
    churchPublicUrlBase,
    reservedOrganizationKeys: RESERVED_ORGANIZATION_KEYS,
    formError: (opts && opts.formError) || null,
    fieldError: (opts && opts.fieldError) || null,
    form,
    selectedPlan: (opts && opts.selectedPlan) || null,
    showCsrfRetry: Boolean(opts && opts.showCsrfRetry),
    instantFreeEnabled: Boolean(opts && opts.instantFreeEnabled),
    ...phoneLocals,
    phoneValidationRelaxed: phoneMode === VALIDATION_MODES.RELAXED,
    phoneValidationMode: phoneMode,
  });
}

function renderRegisterChurchSuccessPage(opts) {
  const registrationSuccess = buildRegistrationSuccessViewModel({
    productCode: PRODUCT_CODE.BLESSBOARD,
    reference: opts && opts.applicationReference,
    ready: opts && opts.ready,
    reviewRequired: false,
    authenticated: Boolean(opts && opts.authenticated),
  });
  return renderApexView("apex/register-church-success.ejs", {
    ...shellLocals(opts),
    pageTitle: "Church Registered Successfully",
    activeNav: "register-church-success",
    robotsNoIndex: true,
    csrfField: (opts && opts.csrfField) || "_csrf",
    registrationSuccess,
  });
}

/**
 * Public email-verification result (success / generic failure / rate limit).
 * Never includes application details or the raw token.
 * @param {{ authenticated?: boolean, csrfToken?: string|null, outcome?: string }} opts
 */
function renderEmailVerificationResultPage(opts) {
  const raw = opts && opts.outcome != null ? String(opts.outcome) : "invalid";
  const outcome =
    raw === "verified" || raw === "rate_limited" ? raw : "invalid";
  return renderApexView("apex/email-verification-result.ejs", {
    ...shellLocals(opts),
    pageTitle:
      outcome === "verified"
        ? "Email verified"
        : outcome === "rate_limited"
          ? "Too many requests"
          : "Verification unavailable",
    activeNav: "email-verification",
    outcome,
  });
}

module.exports = {
  renderFeaturesPage,
  renderForChurchesPage,
  renderPricingPage,
  renderDirectoryPage,
  renderRegisterChurchPage,
  renderRegisterChurchSuccessPage,
  renderEmailVerificationResultPage,
};
