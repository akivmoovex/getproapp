"use strict";

function validateAutomationSettingsBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const thresholdRaw = String(b.missed_service_threshold_weeks || "").trim();
  let missed_service_threshold_weeks = null;
  if (thresholdRaw) {
    const n = Number(thresholdRaw);
    if (!Number.isFinite(n) || n < 1 || n > 52) {
      return { ok: false, error: "Missed-service threshold must be 1–52 weeks, or blank." };
    }
    missed_service_threshold_weeks = Math.floor(n);
  }
  const firstHours = Number(b.first_response_target_hours || 48);
  const followDays = Number(b.follow_up_target_days || 7);
  if (!Number.isFinite(firstHours) || firstHours < 1 || firstHours > 720) {
    return { ok: false, error: "First-response target must be 1–720 hours." };
  }
  if (!Number.isFinite(followDays) || followDays < 1 || followDays > 90) {
    return { ok: false, error: "Follow-up target must be 1–90 days." };
  }
  return {
    ok: true,
    data: {
      enabled: String(b.enabled || "") === "1",
      missed_service_threshold_weeks,
      first_response_target_hours: Math.floor(firstHours),
      follow_up_target_days: Math.floor(followDays),
      auto_create_cases: String(b.auto_create_cases || "") !== "0",
    },
  };
}

function validateReassignBody(body) {
  const assigneeId = Number(body && body.assigned_admin_id);
  if (!Number.isFinite(assigneeId) || assigneeId <= 0) {
    return { ok: false, error: "Select an assignee." };
  }
  return { ok: true, assigneeId };
}

function validatePauseBody(body) {
  return { ok: true, reason: String((body && body.pause_reason) || "").trim().slice(0, 2000) };
}

module.exports = {
  validateAutomationSettingsBody,
  validateReassignBody,
  validatePauseBody,
};
