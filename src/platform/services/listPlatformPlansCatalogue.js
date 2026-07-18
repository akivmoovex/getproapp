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
  return {
    planKey: String(plan.planKey || ""),
    displayName: String(plan.displayName || ""),
    description: plan.description != null ? String(plan.description) : null,
    sortOrder: Number(plan.sortOrder) || 0,
    status: String(plan.status || ""),
    features: (features || []).map(presentFeature).filter(Boolean),
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ productKey?: string }} [input]
 */
async function listPlatformPlansCatalogue(db, input) {
  const productKey = String((input && input.productKey) || PRODUCT_KEY_DEFAULT)
    .trim()
    .toLowerCase();
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR, plans: [] };
  }
  try {
    const plans = await entitlementRepo.listActivePlans(db, productKey);
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
