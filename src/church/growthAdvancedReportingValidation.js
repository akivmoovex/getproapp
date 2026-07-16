"use strict";

/**
 * @param {object} body
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
function validateSavedFilterBody(body = {}) {
  const name = String(body.name || "").trim();
  if (!name || name.length > 120) {
    return { ok: false, error: "Filter name is required (max 120 characters)." };
  }
  const surface = String(body.surface || "cross_branch").trim();
  if (!["cross_branch", "scheduled_report", "branch_basic"].includes(surface)) {
    return { ok: false, error: "Invalid report surface." };
  }
  const filters = {};
  if (body.date_from || body.dateFrom) filters.date_from = String(body.date_from || body.dateFrom).trim();
  if (body.date_to || body.dateTo) filters.date_to = String(body.date_to || body.dateTo).trim();
  if (body.branch_id || body.branchId) filters.branch_id = String(body.branch_id || body.branchId).trim();
  if (body.ministry_id || body.ministryId) filters.ministry_id = String(body.ministry_id || body.ministryId).trim();
  if (body.department_id || body.departmentId) {
    filters.department_id = String(body.department_id || body.departmentId).trim();
  }
  if (body.group_id || body.groupId) filters.group_id = String(body.group_id || body.groupId).trim();
  if (body.service || body.attendance_type) {
    filters.service = String(body.service || body.attendance_type).trim().slice(0, 80);
  }
  if (body.period_month) filters.period_month = String(body.period_month).trim();
  if (String(body.include_inactive || "") === "1") filters.include_inactive = "1";

  return {
    ok: true,
    data: {
      name,
      surface,
      filters_json: filters,
    },
  };
}

module.exports = {
  validateSavedFilterBody,
};
