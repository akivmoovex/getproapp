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
  return renderApexView("apex/register-church.ejs", {
    ...shellLocals(opts),
    pageTitle: "Register Your Church",
    activeNav: "register-church",
    csrfField: (opts && opts.csrfField) || "_csrf",
    submitted: Boolean(opts && opts.submitted),
    workspaceReady: Boolean(opts && opts.workspaceReady),
    loginFallback: Boolean(opts && opts.loginFallback),
    review: Boolean(opts && opts.review),
    organizationKeyPreview: (opts && opts.organizationKeyPreview) || "",
    formError: (opts && opts.formError) || null,
    fieldError: (opts && opts.fieldError) || null,
    form: (opts && opts.form) || {},
    selectedPlan: (opts && opts.selectedPlan) || null,
    showCsrfRetry: Boolean(opts && opts.showCsrfRetry),
    instantFreeEnabled: Boolean(opts && opts.instantFreeEnabled),
  });
}

module.exports = {
  renderFeaturesPage,
  renderForChurchesPage,
  renderPricingPage,
  renderDirectoryPage,
  renderRegisterChurchPage,
};
