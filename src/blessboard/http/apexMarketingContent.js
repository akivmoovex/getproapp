"use strict";

/**
 * Presentation content for apex marketing Batch 2b.
 * Pricing numbers/labels come from platformPricingContent (approved public catalogue).
 * Feature copy is Stitch-aligned but limited to V5-capable behavior (or clearly labeled).
 */

const {
  BLESSBOARD_PRICING_ONBOARDING_NOTE,
  buildPublicPricingPlans,
  buildPartnerPlan,
  buildPublicPricingComparisonRows,
  STAFF_BILLING_NOTE,
  THIRD_PARTY_COSTS_NOTE,
} = require("../../church/platformPricingContent");
const { PLATFORM_FAQ_ITEMS } = require("../../church/platformFaqContent");
const { churchPublicUrl } = require("../../church/platformProvisioningValidation");

const SAFE_FAQ_IDS = new Set([
  "what-is-blessboard",
  "who-can-use",
  "own-website",
  "multiple-branches",
  "mobile-members",
  "requires-app",
  "member-approval",
  "publish-content",
  "custom-domain",
  "pricing",
  "who-can-view",
]);

function buildApexPricingPlans() {
  return buildPublicPricingPlans().map((plan) => ({
    ...plan,
    ctaLabel: "Register Your Church",
    ctaHref: "/register-church",
    ctaVariant: plan.featured ? "primary" : "outline",
  }));
}

function buildApexPartnerPlan() {
  const partner = buildPartnerPlan();
  return {
    ...partner,
    ctaLabel: "Register Your Church",
    ctaHref: "/register-church",
  };
}

function buildApexPricingFaq() {
  return PLATFORM_FAQ_ITEMS.filter((item) => SAFE_FAQ_IDS.has(item.id));
}

function mapDirectoryVisitUrl(item) {
  if (!item || !item.is_single_branch || !item.branch_slug) {
    return null;
  }
  return churchPublicUrl(item.branch_slug) || null;
}

function mapDirectoryItems(items) {
  return (items || []).map((item) => {
    const visitUrl = mapDirectoryVisitUrl(item);
    return {
      ...item,
      visit_href: visitUrl,
      visit_label: visitUrl ? "Visit Church" : null,
    };
  });
}

module.exports = {
  BLESSBOARD_PRICING_ONBOARDING_NOTE,
  STAFF_BILLING_NOTE,
  THIRD_PARTY_COSTS_NOTE,
  buildApexPricingPlans,
  buildApexPartnerPlan,
  buildPublicPricingComparisonRows,
  buildApexPricingFaq,
  mapDirectoryItems,
  mapDirectoryVisitUrl,
};
