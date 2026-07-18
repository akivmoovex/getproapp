"use strict";

/**
 * Read-only BlessBoard plan catalogue for platform-admin.
 * Plans and features are data-driven — no prices, billing, or hardcoded tiers.
 */

const entitlementRepo = require("../repositories/entitlementRepository");
const { PRODUCT_KEY_DEFAULT } = require("./entitlementService");

const STATUS = Object.freeze({
  OK: "ok",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * @param {object} feature
 */
function presentFeature(feature) {
  if (!feature) return null;
  return {
    featureKey: String(feature.featureKey || ""),
    featureKind: String(feature.featureKind || ""),
    booleanValue: feature.booleanValue == null ? null : Boolean(feature.booleanValue),
    limitValue: feature.limitValue == null ? null : Number(feature.limitValue),
  };
}

/**
 * @param {object} plan
 * @param {object[]} features
 */
function presentPlan(plan, features) {
  if (!plan) return null;
  const status = String(plan.status || "").toLowerCase();
  const planKey = String(plan.planKey || "");
  const isActive = status === "active";
  const isLegacy = !isActive || planKey === "partner";
  return {
    planKey,
    displayName: String(plan.displayName || ""),
    description: plan.description != null ? String(plan.description) : null,
    productKey: plan.productKey != null ? String(plan.productKey) : PRODUCT_KEY_DEFAULT,
    sortOrder: Number(plan.sortOrder) || 0,
    status,
    isActive,
    isLegacy,
    features: (features || []).map(presentFeature).filter(Boolean),
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ productKey?: string, includeInactive?: boolean }} [input]
 */
async function listPlatformPlansCatalogue(db, input) {
  const productKey = String((input && input.productKey) || PRODUCT_KEY_DEFAULT)
    .trim()
    .toLowerCase();
  const includeInactive = Boolean(input && input.includeInactive);
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR, plans: [] };
  }
  try {
    const plans = includeInactive
      ? await entitlementRepo.listPlansForProduct(db, productKey)
      : await entitlementRepo.listActivePlans(db, productKey);
    const presented = [];
    for (const plan of plans) {
      const features = await entitlementRepo.listPlanFeatures(db, plan.id);
      presented.push(presentPlan(plan, features));
    }
    return { ok: true, status: STATUS.OK, plans: presented.filter(Boolean) };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, plans: [] };
  }
}

module.exports = {
  STATUS,
  presentFeature,
  presentPlan,
  listPlatformPlansCatalogue,
};
