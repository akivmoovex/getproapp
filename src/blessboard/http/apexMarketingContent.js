"use strict";

/**
 * Presentation content for apex marketing Batch 2b.
 * Pricing numbers/labels come from platformPricingContent (approved public catalogue).
 * Feature copy is Stitch-aligned but limited to V5-capable behavior (or clearly labeled).
 */

const {
  BLESSBOARD_PRICING_ONBOARDING_NOTE,
  buildPublicPricingPlans,
  buildPublicPricingComparisonRows,
  STAFF_BILLING_NOTE,
  THIRD_PARTY_COSTS_NOTE,
} = require("../../church/platformPricingContent");
const { PLATFORM_FAQ_ITEMS } = require("../../church/platformFaqContent");
const { publicBranchHomePath } = require("../urls/churchUrlHelper");

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
    label: plan.code === "foundation" ? "Foundation — Free" : plan.label,
    eyebrow: plan.code === "foundation" ? "Free" : plan.eyebrow,
    ctaLabel: "Register Your Church",
    ctaHref: `/register-church?plan=${encodeURIComponent(plan.code)}`,
    ctaVariant: plan.featured ? "primary" : "outline",
  }));
}

function buildApexPartnerPlan() {
  return null;
}

function buildApexPricingFaq() {
  return PLATFORM_FAQ_ITEMS.filter((item) => SAFE_FAQ_IDS.has(item.id));
}

function mapDirectoryVisitUrl(item) {
  if (!item || !item.slug) return null;
  const branchKey = item.preview_branch_slug || item.branch_slug;
  if (branchKey) {
    return publicBranchHomePath(item.slug, branchKey);
  }
  return publicBranchHomePath(item.slug, "hq");
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
