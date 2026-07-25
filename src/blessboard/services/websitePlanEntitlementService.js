"use strict";

/**
 * Phase4 Stages 6–7 — website plan capability map (capability checks, not a second billing system).
 * Plan keys normalize through websiteOverviewService.normalizePlanKey.
 */

const {
  GROWTH_MONTHLY_PER_BRANCH_CENTS,
  FOUNDATION_PACKAGE_CODE,
  GROWTH_PACKAGE_CODE,
  NETWORK_PACKAGE_CODE,
} = require("../../church/blessBoardBillingCatalogue");
const { formatUsdFromCents } = require("../../church/platformPricingContent");
const {
  evaluatePublishReadiness,
} = require("./churchWebsitePublishService");
const { normalizePlanKey } = require("./websiteOverviewService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
  NOT_ENTITLED: "not_entitled",
});

/** Capability → minimum plan (foundation < growth < network). */
const CAPABILITY_MIN_PLAN = Object.freeze({
  "website.basic_management": "foundation",
  "website.preview": "foundation",
  "website.publish": "foundation",
  "website.undo_last_publish": "foundation",
  "website.change_requests": "growth",
  "website.approval_workflow": "growth",
  "website.recent_changes": "growth",
  "website.restore_previous": "growth",
  "website.advanced_management": "network",
  "website.network_approval_settings": "network",
  "website.network_version_history": "network",
  "website.full_version_history": "network",
  "website.audit_log": "network",
});

const PLAN_RANK = Object.freeze({
  foundation: 1,
  growth: 2,
  network: 3,
  unknown: 0,
});

const PLAN_LABELS = Object.freeze({
  foundation: "Foundation",
  growth: "Growth",
  network: "Network",
});

/**
 * Human-readable website plan comparison (no internal entitlement keys in labels).
 * status: included | limited | not_included | custom | coming_later
 */
const PLAN_FEATURE_GROUPS = Object.freeze([
  {
    id: "basics",
    title: "Website basics",
    features: [
      {
        id: "public_site",
        label: "Public church website",
        foundation: "included",
        growth: "included",
        network: "included",
      },
      {
        id: "page_editing",
        label: "Page editing",
        foundation: "included",
        growth: "included",
        network: "included",
      },
      {
        id: "draft_preview",
        label: "Draft preview",
        foundation: "included",
        growth: "included",
        network: "included",
      },
      {
        id: "publish",
        label: "Website publishing",
        foundation: "included",
        growth: "included",
        network: "included",
      },
      {
        id: "undo",
        label: "Undo last publish",
        foundation: "included",
        growth: "included",
        network: "included",
      },
      {
        id: "backup",
        label: "Previous website backup",
        foundation: "limited",
        growth: "included",
        network: "included",
        foundationNote: "One previous backup",
        growthNote: "Five recent backups",
        networkNote: "Full publication history",
      },
    ],
  },
  {
    id: "advanced",
    title: "Advanced management",
    features: [
      {
        id: "change_requests",
        label: "Website change requests",
        foundation: "not_included",
        growth: "included",
        network: "included",
      },
      {
        id: "approval",
        label: "HQ approval workflow",
        foundation: "not_included",
        growth: "included",
        network: "included",
      },
      {
        id: "recent_changes",
        label: "Recent Website Changes",
        foundation: "not_included",
        growth: "included",
        network: "included",
      },
      {
        id: "restore",
        label: "Restore previous website as draft",
        foundation: "not_included",
        growth: "included",
        network: "included",
      },
      {
        id: "reviewer_notes",
        label: "Reviewer notes",
        foundation: "not_included",
        growth: "included",
        network: "included",
      },
    ],
  },
  {
    id: "network",
    title: "Network management",
    features: [
      {
        id: "advanced_hub",
        label: "Advanced Website Management",
        foundation: "not_included",
        growth: "not_included",
        network: "included",
      },
      {
        id: "network_approval",
        label: "Network approval settings",
        foundation: "not_included",
        growth: "not_included",
        network: "included",
      },
      {
        id: "network_history",
        label: "Network website version history",
        foundation: "not_included",
        growth: "not_included",
        network: "included",
      },
      {
        id: "compare",
        label: "Compare website versions",
        foundation: "not_included",
        growth: "not_included",
        network: "included",
      },
      {
        id: "audit",
        label: "Website audit log",
        foundation: "not_included",
        growth: "not_included",
        network: "included",
      },
      {
        id: "selective_restore",
        label: "Selective page restoration",
        foundation: "not_included",
        growth: "not_included",
        network: "coming_later",
      },
    ],
  },
]);

const STATUS_LABELS = Object.freeze({
  included: "Included",
  limited: "Limited",
  not_included: "Not included",
  custom: "Custom",
  coming_later: "Coming later",
});

/**
 * @param {string} planKey
 * @param {string} capability
 */
function planMeetsCapability(planKey, capability) {
  const plan = normalizePlanKey(planKey);
  const min = CAPABILITY_MIN_PLAN[capability];
  if (!min) return false;
  return (PLAN_RANK[plan] || 0) >= (PLAN_RANK[min] || 99);
}

/**
 * @param {import('pg').Pool} db
 * @param {{ organizationId: string, churchId: string, env?: object }} opts
 */
async function resolveWebsitePlanContext(db, opts) {
  const organizationId = opts && opts.organizationId;
  const churchId = opts && opts.churchId;
  if (!organizationId || !churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }
  try {
    const readiness = await evaluatePublishReadiness(db, {
      churchId,
      env: opts.env,
    });
    const planKey = normalizePlanKey(readiness && readiness.planKey);
    return {
      ok: true,
      status: STATUS.OK,
      planKey: planKey === "unknown" ? "foundation" : planKey,
      planLabel: PLAN_LABELS[planKey === "unknown" ? "foundation" : planKey],
      rawPlanKey: readiness && readiness.planKey,
      readiness,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "plan" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{ organizationId: string, churchId: string, capability: string, env?: object }} opts
 */
async function assertWebsiteCapability(db, opts) {
  const ctx = await resolveWebsitePlanContext(db, opts);
  if (!ctx.ok) return ctx;
  const capability = String(opts.capability || "");
  if (!planMeetsCapability(ctx.planKey, capability)) {
    const required = CAPABILITY_MIN_PLAN[capability] || "growth";
    return {
      ok: false,
      status: STATUS.NOT_ENTITLED,
      reason: "not_entitled",
      planKey: ctx.planKey,
      planLabel: ctx.planLabel,
      requiredPlanKey: required,
      requiredPlanLabel: PLAN_LABELS[required] || required,
      capability,
      lockKind: required === "network" ? "network" : "growth",
    };
  }
  return {
    ok: true,
    status: STATUS.OK,
    planKey: ctx.planKey,
    planLabel: ctx.planLabel,
    capability,
  };
}

/**
 * View-model for Website Plan Features (desktop + mobile).
 * @param {{ planKey: string }} opts
 */
function buildWebsitePlanFeaturesModel(opts) {
  const currentPlan = normalizePlanKey(opts && opts.planKey) || "foundation";
  const safePlan = currentPlan === "unknown" ? "foundation" : currentPlan;

  const growthPrice = `${formatUsdFromCents(GROWTH_MONTHLY_PER_BRANCH_CENTS)} per active branch / month`;

  const plans = [
    {
      key: "foundation",
      packageCode: FOUNDATION_PACKAGE_CODE,
      label: PLAN_LABELS.foundation,
      tierLabel: "Entry Tier",
      priceLabel: "Free",
      priceNote: "One HQ and one branch",
      isCurrent: safePlan === "foundation",
      ctaLabel: safePlan === "foundation" ? "Current plan" : "View Foundation",
      ctaHref: safePlan === "foundation" ? null : "/hq/website",
      ctaDisabled: safePlan === "foundation",
    },
    {
      key: "growth",
      packageCode: GROWTH_PACKAGE_CODE,
      label: PLAN_LABELS.growth,
      tierLabel: "Middle Tier",
      priceLabel: growthPrice,
      priceNote: null,
      isCurrent: safePlan === "growth",
      popular: true,
      ctaLabel:
        safePlan === "growth"
          ? "Current plan"
          : safePlan === "network"
            ? "View Growth features"
            : "Request Growth access",
      ctaHref:
        safePlan === "growth"
          ? null
          : safePlan === "network"
            ? "/hq/website/plan-features#growth"
            : "/hq/account#package",
      ctaDisabled: safePlan === "growth",
    },
    {
      key: "network",
      packageCode: NETWORK_PACKAGE_CODE,
      label: PLAN_LABELS.network,
      tierLabel: "Network",
      priceLabel: "Custom",
      priceNote: "Talk to BlessBoard",
      isCurrent: safePlan === "network",
      ctaLabel: safePlan === "network" ? "Current active plan" : "Discuss Network access",
      ctaHref: safePlan === "network" ? null : "/hq/account#package",
      ctaDisabled: safePlan === "network",
    },
  ];

  const groups = PLAN_FEATURE_GROUPS.map((g) => ({
    ...g,
    features: g.features.map((f) => ({
      id: f.id,
      label: f.label,
      cells: {
        foundation: {
          status: f.foundation,
          label: STATUS_LABELS[f.foundation],
          note: f.foundationNote || null,
        },
        growth: {
          status: f.growth,
          label: STATUS_LABELS[f.growth],
          note: f.growthNote || null,
        },
        network: {
          status: f.network,
          label: STATUS_LABELS[f.network],
          note: f.networkNote || null,
        },
      },
    })),
  }));

  return {
    currentPlanKey: safePlan,
    currentPlanLabel: PLAN_LABELS[safePlan],
    plans,
    groups,
    statusLabels: STATUS_LABELS,
    growthPriceLabel: growthPrice,
    networkPriceLabel: "Custom",
  };
}

/**
 * Locked-feature screen model.
 * @param {{
 *   lockKind: 'growth'|'network',
 *   featureTitle: string,
 *   featureDescription?: string,
 *   planKey: string,
 *   benefits?: string[],
 *   returnHref?: string,
 * }} opts
 */
function buildFeatureLockModel(opts) {
  const lockKind = opts.lockKind === "network" ? "network" : "growth";
  const planKey = normalizePlanKey(opts.planKey) || "foundation";
  const requiredPlanKey = lockKind === "network" ? "network" : "growth";

  const growthBenefits = [
    "Branch website submissions",
    "HQ review and approval workflow",
    "Five recent website backups and draft restoration",
    "Multi-branch workflow oversight",
  ];
  const networkBenefits = [
    "Compare website versions",
    "Restore previous websites with full history",
    "Review detailed publishing history",
    "Access website audit logs",
    "Configure advanced approval rules",
  ];

  return {
    lockKind,
    screenTitle:
      lockKind === "network"
        ? "Advanced Website Feature Locked"
        : "Growth Website Feature Locked",
    badgeLabel: lockKind === "network" ? "Network Feature" : "Growth Only",
    featureTitle: opts.featureTitle || (lockKind === "network"
      ? "Advanced Website Management"
      : "Growth Website Tools"),
    featureDescription:
      opts.featureDescription ||
      (lockKind === "network"
        ? "Scale your digital presence with enterprise-grade controls across your church network."
        : "Unlock collaborative workflows and resilience for your church website team."),
    currentPlanKey: planKey === "unknown" ? "foundation" : planKey,
    currentPlanLabel: PLAN_LABELS[planKey === "unknown" ? "foundation" : planKey],
    requiredPlanKey,
    requiredPlanLabel: PLAN_LABELS[requiredPlanKey],
    benefits: Array.isArray(opts.benefits)
      ? opts.benefits
      : lockKind === "network"
        ? networkBenefits
        : growthBenefits,
    primaryCtaLabel:
      lockKind === "network" ? "View Network Features" : "View Growth Features",
    primaryCtaHref: "/hq/website/plan-features",
    secondaryCtaLabel:
      lockKind === "network" ? "Discuss Network access" : "Request Growth access",
    secondaryCtaHref: "/hq/account#package",
    returnHref: opts.returnHref || "/hq/website",
    returnLabel: "Return to Website Overview",
  };
}

module.exports = {
  STATUS,
  CAPABILITY_MIN_PLAN,
  PLAN_LABELS,
  PLAN_FEATURE_GROUPS,
  STATUS_LABELS,
  normalizePlanKey,
  planMeetsCapability,
  resolveWebsitePlanContext,
  assertWebsiteCapability,
  buildWebsitePlanFeaturesModel,
  buildFeatureLockModel,
};
