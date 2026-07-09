"use strict";

const { PLAN_CODES, normalizePlanCode } = require("./churchPlans");

const PLAN_STATUSES = ["active", "inactive"];

function validatePlanUpdateBody(body) {
  const rawPlan = String(body.plan_code || "free").trim().toLowerCase();
  if (!PLAN_CODES.includes(rawPlan)) {
    return { ok: false, error: "Invalid plan code." };
  }
  const planCode = normalizePlanCode(rawPlan);
  const planStatusRaw = String(body.plan_status || "active").trim().toLowerCase();
  const planStatus = PLAN_STATUSES.includes(planStatusRaw) ? planStatusRaw : "active";
  const planNotes = String(body.plan_notes || "").trim().slice(0, 2000);
  return {
    ok: true,
    data: {
      plan_code: planCode,
      plan_status: planStatus,
      plan_notes: planNotes || null,
    },
  };
}

module.exports = {
  PLAN_STATUSES,
  validatePlanUpdateBody,
};
