"use strict";

/**
 * Read-only platform-admin subscription directory.
 * Uses live organization_subscriptions only — no billing, invoices, or payments.
 */

const repo = require("../repositories/platformAdminRepository");
const { PRODUCT_KEY_DEFAULT } = require("./entitlementService");
const {
  mapDirectoryPlanFilterToDbPlanKey,
  dbPlanDisplayLabel,
  ALLOWED_DIRECTORY_PLAN_FILTERS,
} = require("../../blessboard/services/registrationPlanMapping");
const { presentSubscriptionTiming } = require("./presentSubscriptionTiming");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
});

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ALLOWED_LIMITS = Object.freeze([10, 25, 50, 100]);
const ORG_KEY_PREFIX_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const ALLOWED_STATUSES = Object.freeze([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
  "inactive",
]);
/** UI plan filters (public Network branding + DB aliases). */
const ALLOWED_PLAN_FILTERS = Object.freeze(["free", "growth", "network", "professional"]);

/**
 * @param {object} row
 */
function mapRow(row) {
  if (!row) return null;
  const planKey = String(row.plan_key || "");
  const subscriptionStatus = String(row.subscription_status || "");
  const timing = presentSubscriptionTiming({
    status: subscriptionStatus,
    planKey,
    endsAt: row.ends_at,
    startsAt: row.starts_at,
  });
  return {
    organizationKey: String(row.organization_key || ""),
    organizationDisplayName: String(row.organization_display_name || ""),
    organizationStatus: String(row.organization_status || ""),
    productKey: String(row.product_key || ""),
    subscriptionStatus,
    subscriptionStatusLabel: timing.statusLabel,
    startsAt: timing.startsAt,
    endsAt: timing.endsAt,
    remainingDays: timing.remainingDays,
    graceDeadline: timing.timingKind === "grace" ? timing.timingEndsAt : null,
    trialEndsAt: timing.timingKind === "trial" ? timing.timingEndsAt : null,
    timingKind: timing.timingKind,
    timingLabel: timing.timingLabel,
    entitlementState: timing.entitlementState,
    trialSource: row.trial_source ? String(row.trial_source) : null,
    billingPaymentStatus: row.billing_payment_status
      ? String(row.billing_payment_status)
      : null,
    notes: null, // never surface free-form notes in directory HTML
    planKey,
    planLabel: dbPlanDisplayLabel(planKey) || String(row.plan_display_name || planKey || ""),
    planDisplayName: dbPlanDisplayLabel(planKey) || String(row.plan_display_name || ""),
    planStatus: String(row.plan_status || ""),
  };
}

/**
 * @param {object} input
 */
function normalizeListInput(input) {
  const raw = input && typeof input === "object" ? input : {};
  let page = Number.parseInt(String(raw.page != null ? raw.page : "1"), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > 10000) page = 10000;

  let limit = Number.parseInt(String(raw.limit != null ? raw.limit : String(DEFAULT_LIMIT)), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  } else if (!ALLOWED_LIMITS.includes(limit)) {
    let best = ALLOWED_LIMITS[0];
    let bestDist = Math.abs(limit - best);
    for (const allowed of ALLOWED_LIMITS) {
      const dist = Math.abs(limit - allowed);
      if (dist < bestDist) {
        best = allowed;
        bestDist = dist;
      }
    }
    limit = best;
  }

  let keyPrefix = null;
  if (raw.q != null && String(raw.q).trim() !== "") {
    const q = String(raw.q).trim().toLowerCase();
    if (!ORG_KEY_PREFIX_RE.test(q)) {
      return { ok: false, reason: "q" };
    }
    keyPrefix = q;
  }

  let status = null;
  const statusRaw = String(raw.status || "")
    .trim()
    .toLowerCase();
  if (statusRaw) {
    if (statusRaw === "grace") {
      status = "past_due";
    } else if (!ALLOWED_STATUSES.includes(statusRaw)) {
      return { ok: false, reason: "status" };
    } else {
      status = statusRaw;
    }
  }

  let planKey = null;
  let planFilter = null;
  const planRaw = String(raw.plan || "")
    .trim()
    .toLowerCase();
  if (planRaw) {
    if (!ALLOWED_PLAN_FILTERS.includes(planRaw) && !ALLOWED_DIRECTORY_PLAN_FILTERS.includes(planRaw)) {
      return { ok: false, reason: "plan" };
    }
    planKey = mapDirectoryPlanFilterToDbPlanKey(planRaw);
    if (!planKey) {
      return { ok: false, reason: "plan" };
    }
    planFilter = planRaw === "professional" ? "network" : planRaw === "foundation" ? "free" : planRaw;
    if (planFilter === "professional") planFilter = "network";
  }

  let endingSoon = false;
  const endingRaw = String(raw.ending_soon || raw.endingSoon || "")
    .trim()
    .toLowerCase();
  if (endingRaw) {
    if (endingRaw === "1" || endingRaw === "true" || endingRaw === "yes") {
      endingSoon = true;
    } else if (endingRaw === "0" || endingRaw === "false" || endingRaw === "no") {
      endingSoon = false;
    } else {
      return { ok: false, reason: "ending_soon" };
    }
  }

  let trialSource = null;
  const trialSourceRaw = String(raw.trial_source || raw.trialSource || "")
    .trim()
    .toLowerCase();
  if (trialSourceRaw) {
    if (
      trialSourceRaw !== "direct_growth_registration" &&
      trialSourceRaw !== "foundation_trial_offer"
    ) {
      return { ok: false, reason: "trial_source" };
    }
    trialSource = trialSourceRaw;
  }

  return {
    ok: true,
    value: {
      page,
      limit,
      keyPrefix,
      status,
      planKey,
      planFilter,
      endingSoon,
      trialSource,
      productKey: PRODUCT_KEY_DEFAULT,
    },
  };
}

/**
 * @param {{ query: Function }} db
 * @param {object} [input]
 */
async function listPlatformSubscriptions(db, input) {
  const normalized = normalizeListInput(input);
  if (!normalized.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      subscriptions: [],
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
      keyPrefix: "",
      statusFilter: "",
      planFilter: "",
      endingSoon: false,
      reason: normalized.reason,
    };
  }
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      subscriptions: [],
      page: normalized.value.page,
      limit: normalized.value.limit,
      total: 0,
      totalPages: 0,
      keyPrefix: normalized.value.keyPrefix || "",
      statusFilter: normalized.value.status || "",
      planFilter: normalized.value.planFilter || "",
      endingSoon: normalized.value.endingSoon,
    };
  }

  const {
    page,
    limit,
    keyPrefix,
    status,
    planKey,
    planFilter,
    endingSoon,
    trialSource,
    productKey,
  } = normalized.value;
  const offset = (page - 1) * limit;
  try {
    const listOpts = {
      limit,
      offset,
      keyPrefix,
      status,
      productKey,
      planKey,
      endingSoon,
      trialSource,
    };
    const [rows, total] = await Promise.all([
      repo.listSubscriptionsDirectoryPage(db, listOpts),
      repo.countSubscriptionsDirectory(db, listOpts),
    ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return {
      ok: true,
      status: STATUS.OK,
      subscriptions: (rows || []).map(mapRow).filter(Boolean),
      page,
      limit,
      total,
      totalPages,
      keyPrefix: keyPrefix || "",
      statusFilter: status || "",
      planFilter: planFilter || "",
      endingSoon: Boolean(endingSoon),
      trialSourceFilter: trialSource || "",
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      subscriptions: [],
      page,
      limit,
      total: 0,
      totalPages: 0,
      keyPrefix: keyPrefix || "",
      statusFilter: status || "",
      planFilter: planFilter || "",
      endingSoon: Boolean(endingSoon),
      trialSourceFilter: trialSource || "",
    };
  }
}

module.exports = {
  STATUS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ALLOWED_LIMITS,
  ALLOWED_STATUSES,
  ALLOWED_PLAN_FILTERS,
  normalizeListInput,
  mapRow,
  listPlatformSubscriptions,
};
