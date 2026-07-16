"use strict";

const {
  PLAN_CODES: ASSIGNABLE_PLAN_CODES,
  DEFAULT_PROVISIONING_PLAN_CODE,
  LEGACY_PLAN_CODES,
  assertCanonicalProvisioningPlanCode,
} = require("./platformProvisioningValidation");

const PLAN_STATUSES = ["active", "inactive"];

/**
 * Validates plan/package updates for Admin Console paths that still use plan_code.
 * New assignments accept foundation/growth only — legacy free/standard/pro are rejected
 * (not silently remapped). Existing legacy rows are left untouched by other read paths.
 */
function validatePlanUpdateBody(body) {
  const rawPlan = String(body.plan_code || DEFAULT_PROVISIONING_PLAN_CODE)
    .trim()
    .toLowerCase();
  const check = assertCanonicalProvisioningPlanCode(rawPlan);
  if (!check.ok) {
    return { ok: false, error: check.error };
  }
  const planStatusRaw = String(body.plan_status || "active").trim().toLowerCase();
  const planStatus = PLAN_STATUSES.includes(planStatusRaw) ? planStatusRaw : "active";
  const planNotes = String(body.plan_notes || "").trim().slice(0, 2000);
  return {
    ok: true,
    data: {
      plan_code: check.value,
      plan_status: planStatus,
      plan_notes: planNotes || null,
    },
  };
}

module.exports = {
  PLAN_STATUSES,
  ASSIGNABLE_PLAN_CODES,
  LEGACY_PLAN_CODES,
  validatePlanUpdateBody,
};
