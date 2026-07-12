"use strict";

const {
  CHURCH_PLANS,
  PLAN_CODES,
  FEATURE_LABELS,
  formatLimitValue,
} = require("./churchPlans");
const { BLESSBOARD_ONBOARDING_POSITIONING } = require("./platformPublicContent");

/** Public marketing labels — avoid "Free" / "free plan" phrasing on apex pages. */
const PUBLIC_PLAN_LABELS = {
  free: "Starter",
  standard: "Standard",
  pro: "Pro",
};

/** Top feature bullets shown on each plan card. */
const PUBLIC_PLAN_HIGHLIGHTS = {
  free: ["public_website", "member_portal", "branch_admin", "giving_info", "monthly_reports"],
  standard: [
    "public_website",
    "member_portal",
    "branch_admin",
    "hq_broadcasts",
    "consolidated_analytics",
  ],
  pro: [
    "public_website",
    "member_portal",
    "branch_admin",
    "hq_broadcasts",
    "consolidated_analytics",
    "custom_domain",
  ],
};

const FEATURED_PLAN_CODE = "standard";

function formatBranchLimit(plan) {
  const value = plan.limits.max_branches;
  if (value >= 999) return "Unlimited branches";
  if (value === 1) return "1 branch";
  return `Up to ${value} branches`;
}

function formatMemberLimit(plan) {
  const value = plan.limits.max_members;
  if (value >= 99999) return "Unlimited verified members";
  return `Up to ${formatLimitValue(value)} verified members`;
}

function buildPublicPricingPlans() {
  return PLAN_CODES.map((code) => {
    const plan = CHURCH_PLANS[code];
    const highlights = PUBLIC_PLAN_HIGHLIGHTS[code]
      .map((key) => FEATURE_LABELS[key])
      .filter(Boolean);
    return {
      code,
      label: PUBLIC_PLAN_LABELS[code] || plan.label,
      description: plan.description,
      featured: code === FEATURED_PLAN_CODE,
      branchesLabel: formatBranchLimit(plan),
      membersLabel: formatMemberLimit(plan),
      highlights,
    };
  });
}

function buildPublicPricingComparisonRows() {
  return Object.keys(FEATURE_LABELS).map((key) => ({
    key,
    label: FEATURE_LABELS[key],
    plans: PLAN_CODES.reduce((acc, code) => {
      acc[code] = !!CHURCH_PLANS[code].features[key];
      return acc;
    }, {}),
  }));
}

module.exports = {
  BLESSBOARD_PRICING_ONBOARDING_NOTE: BLESSBOARD_ONBOARDING_POSITIONING,
  PUBLIC_PLAN_LABELS,
  FEATURED_PLAN_CODE,
  buildPublicPricingPlans,
  buildPublicPricingComparisonRows,
};
