"use strict";

const { BLESSBOARD_ONBOARDING_POSITIONING } = require("./platformPublicContent");

const FEATURED_PLAN_CODE = "growth";
const TIER_PLAN_CODES = ["free", "growth", "professional"];
const ALL_PLAN_CODES = [...TIER_PLAN_CODES, "partner"];

const STAFF_BILLING_NOTE =
  "Ordinary church-member accounts are not billed as staff or administrator accounts.";

const THIRD_PARTY_COSTS_NOTE =
  "Third-party costs such as custom domain registration, professional mailbox hosting, and payment processing remain separately quoted where applicable.";

function buildTierPlans() {
  return [
    {
      code: "free",
      label: "Free",
      eyebrow: null,
      priceAmount: "USD 0",
      priceSuffix: "/month",
      description: "Ideal for small congregations or new church plants.",
      featured: false,
      badge: null,
      ctaLabel: "Register Your Church",
      ctaHref: "/register-church",
      ctaVariant: "outline",
      features: [
        "Up to 10 total users",
        "1 HQ and 1 branch",
        "Public church website",
        "Member portal",
        "Basic reporting",
      ],
    },
    {
      code: "growth",
      label: "Growth",
      eyebrow: null,
      priceAmount: "USD 4.90",
      priceSuffix: "/active staff/mo",
      description: "Scale your operations across multiple branches and roles.",
      featured: true,
      badge: "Most Popular",
      ctaLabel: "Register Your Church",
      ctaHref: "/register-church",
      ctaVariant: "primary",
      features: [
        "Everything in Free",
        "1 HQ and up to 10 branches",
        "Standard multi-branch reporting",
        "Multiple staff and administrator roles",
        "Ordinary members are not billed as staff accounts",
      ],
    },
    {
      code: "professional",
      label: "Professional",
      eyebrow: "Best for established churches",
      priceAmount: "USD 8.90",
      priceSuffix: "/active staff/mo",
      description: "Premium branding and high-capacity church management.",
      featured: false,
      badge: null,
      ctaLabel: "Contact BlessBoard",
      ctaHref: "/contact",
      ctaVariant: "outline",
      features: [
        "Everything in Growth",
        "No minimum commitment",
        "1 HQ and up to 50 branches",
        "Up to 50 staff/admin accounts",
        "Custom domain",
        "One professional mailbox",
        "Advanced reporting",
      ],
    },
  ];
}

function buildPartnerPlan() {
  return {
    code: "partner",
    label: "Partner",
    eyebrow: "Enterprise & Services",
    priceDisplay: "Custom quotation",
    description:
      "Bespoke capacity, dedicated stewardship, and managed digital services for large networks or denominations.",
    ctaLabel: "Request a Quotation",
    ctaHref: "/contact",
    features: [
      "Everything in Professional",
      "Contract-defined capacity",
      "Call-center services",
      "Digital marketing",
      "Outdoor events",
      "Custom managed reporting",
      "Custom domain",
    ],
  };
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
        free: "USD 0/month",
        growth: "USD 4.90 per active staff",
        professional: "USD 8.90 per active staff",
        partner: "Custom quotation",
      },
    },
    {
      key: "users",
      label: "Total users",
      type: "text",
      values: {
        free: "Up to 10",
        growth: "Unlimited members",
        professional: "Unlimited members",
        partner: "Contract-defined",
      },
    },
    {
      key: "hq_branches",
      label: "HQ & branches",
      type: "text",
      values: {
        free: "1 HQ, 1 branch",
        growth: "1 HQ, up to 10 branches",
        professional: "1 HQ, up to 50 branches",
        partner: "Contract-defined",
      },
    },
    {
      key: "staff_accounts",
      label: "Staff/admin accounts",
      type: "text",
      values: {
        free: "Included in user limit",
        growth: "Billed per active staff",
        professional: "Up to 50",
        partner: "Contract-defined",
      },
    },
    {
      key: "reporting",
      label: "Reporting",
      type: "text",
      values: {
        free: "Basic",
        growth: "Standard multi-branch",
        professional: "Advanced",
        partner: "Custom managed",
      },
    },
    {
      key: "custom_domain",
      label: "Custom domain",
      type: "bool",
      values: {
        free: false,
        growth: false,
        professional: true,
        partner: true,
      },
    },
    {
      key: "professional_mailbox",
      label: "Professional mailbox",
      type: "bool",
      values: {
        free: false,
        growth: false,
        professional: true,
        partner: true,
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
  buildTierPlans,
  buildPartnerPlan,
  buildPublicPricingPlans,
  buildPublicPricingComparisonRows,
};
