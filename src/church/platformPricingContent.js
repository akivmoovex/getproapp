"use strict";

/**
 * Approved public BlessBoard pricing presentation (Foundation / Growth / Network).
 * Amounts and capacity must stay aligned with blessBoardPackageCatalogue +
 * blessBoardBillingCatalogue — do not restate cents elsewhere.
 */

const { BLESSBOARD_ONBOARDING_POSITIONING } = require("./platformPublicContent");
const {
  FOUNDATION_ACTIVE_BRANCHES,
  FOUNDATION_ACTIVE_MEMBERS,
  FOUNDATION_ADMIN_ACCOUNTS,
  NETWORK_MAILBOXES_PER_BRANCH,
} = require("./blessBoardPackageCatalogue");
const {
  GROWTH_MONTHLY_PER_BRANCH_CENTS,
  NETWORK_MONTHLY_PER_BRANCH_CENTS,
} = require("./blessBoardBillingCatalogue");

const FEATURED_PLAN_CODE = "growth";
const TIER_PLAN_CODES = ["foundation", "growth", "network"];
const ALL_PLAN_CODES = [...TIER_PLAN_CODES];

const STAFF_BILLING_NOTE =
  "Church members are not billed individually. Paid packages are billed per active branch; HQ is not billed as a branch.";

const THIRD_PARTY_COSTS_NOTE =
  "Third-party costs such as custom domain registrar fees and payment processing remain separately quoted where applicable. Hosted mailbox capacity is included on Network; registrar and DNS work are assisted during onboarding. Scheduled message delivery, automated report email, surveys, appointments, and volunteer scheduling are not available in the current product.";

function formatUsdFromCents(cents) {
  const n = Number(cents) || 0;
  return `USD ${(n / 100).toFixed(2)}`;
}

function buildTierPlans() {
  return [
    {
      code: "foundation",
      label: "Foundation",
      eyebrow: null,
      priceAmount: "USD 0",
      priceSuffix: "/month",
      description: "Ideal for small congregations or new church plants with a single active branch.",
      featured: false,
      badge: null,
      ctaLabel: "Register Your Church",
      ctaHref: "/register-church",
      ctaVariant: "outline",
      features: [
        "1 HQ and maximum 1 active branch",
        `Up to ${FOUNDATION_ACTIVE_MEMBERS} active members`,
        `Up to ${FOUNDATION_ADMIN_ACCOUNTS} administrator / leadership accounts`,
        "Public church website and member portal",
        "Basic reporting",
      ],
    },
    {
      code: "growth",
      label: "Growth",
      eyebrow: null,
      priceAmount: formatUsdFromCents(GROWTH_MONTHLY_PER_BRANCH_CENTS),
      priceSuffix: "/active branch/mo",
      description:
        "Scale across unlimited branches with cross-branch HQ administration and advanced attendance and giving reports.",
      featured: true,
      badge: "Most Popular",
      ctaLabel: "Register Your Church",
      ctaHref: "/register-church",
      ctaVariant: "primary",
      features: [
        "Everything in Foundation",
        "1 HQ and unlimited active branches",
        "Unlimited members subject to fair use",
        "Advanced attendance and giving reports",
        "Cross-branch HQ administration",
        "HQ is not billed as a branch",
      ],
    },
    {
      code: "network",
      label: "Network",
      eyebrow: "Infrastructure & governance",
      priceAmount: formatUsdFromCents(NETWORK_MONTHLY_PER_BRANCH_CENTS),
      priceSuffix: "/active branch/mo",
      description:
        "Custom organization domain, hosted mailboxes, integrations, and priority support for multi-site networks (assisted onboarding).",
      featured: false,
      badge: null,
      ctaLabel: "Register Your Church",
      ctaHref: "/register-church",
      ctaVariant: "outline",
      features: [
        "Everything in Growth",
        "Custom organization domain (assisted onboarding — not self-service DNS today)",
        `Up to ${NETWORK_MAILBOXES_PER_BRANCH} hosted mailboxes per active branch`,
        "Advanced roles (assisted / by arrangement)",
        "API, webhooks, and integrations (availability by arrangement)",
        "Priority support and assisted onboarding",
      ],
    },
  ];
}

/**
 * @deprecated Partner tier retired — use Network. Kept returning null for callers that still expect the export.
 */
function buildPartnerPlan() {
  return null;
}

function buildPublicPricingPlans() {
  return buildTierPlans();
}

function buildPublicPricingComparisonRows() {
  return [
    {
      key: "monthly_fee",
      label: "Monthly platform fee",
      type: "text",
      values: {
        foundation: "USD 0/month",
        growth: `${formatUsdFromCents(GROWTH_MONTHLY_PER_BRANCH_CENTS)} per active branch`,
        network: `${formatUsdFromCents(NETWORK_MONTHLY_PER_BRANCH_CENTS)} per active branch`,
      },
    },
    {
      key: "hq_branches",
      label: "HQ & active branches",
      type: "text",
      values: {
        foundation: `1 HQ, max ${FOUNDATION_ACTIVE_BRANCHES} active branch`,
        growth: "1 HQ, unlimited active branches",
        network: "1 HQ, unlimited active branches",
      },
    },
    {
      key: "members",
      label: "Members",
      type: "text",
      values: {
        foundation: `Up to ${FOUNDATION_ACTIVE_MEMBERS} active`,
        growth: "Unlimited (fair use)",
        network: "Unlimited (fair use)",
      },
    },
    {
      key: "admins",
      label: "Administrator / leadership accounts",
      type: "text",
      values: {
        foundation: `Up to ${FOUNDATION_ADMIN_ACCOUNTS}`,
        growth: "Fair use",
        network: "Fair use + advanced roles",
      },
    },
    {
      key: "reporting",
      label: "Reporting",
      type: "text",
      values: {
        foundation: "Basic HQ aggregates",
        growth: "Advanced attendance & giving + cross-branch",
        network: "Growth reporting + executive exports (by arrangement)",
      },
    },
    {
      key: "cross_branch_hq",
      label: "Cross-branch HQ administration",
      type: "bool",
      values: {
        foundation: false,
        growth: true,
        network: true,
      },
    },
    {
      key: "custom_domain",
      label: "Custom organization domain",
      type: "bool",
      values: {
        foundation: false,
        growth: false,
        network: true,
      },
    },
    {
      key: "hosted_mailboxes",
      label: "Hosted mailboxes per active branch",
      type: "text",
      values: {
        foundation: "None",
        growth: "None",
        network: `Up to ${NETWORK_MAILBOXES_PER_BRANCH}`,
      },
    },
  ];
}

module.exports = {
  BLESSBOARD_PRICING_ONBOARDING_NOTE: BLESSBOARD_ONBOARDING_POSITIONING,
  FEATURED_PLAN_CODE,
  TIER_PLAN_CODES,
  ALL_PLAN_CODES,
  STAFF_BILLING_NOTE,
  THIRD_PARTY_COSTS_NOTE,
  formatUsdFromCents,
  buildTierPlans,
  buildPartnerPlan,
  buildPublicPricingPlans,
  buildPublicPricingComparisonRows,
};
