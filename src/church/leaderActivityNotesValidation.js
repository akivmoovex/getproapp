"use strict";

function validateActivityNoteBody(body) {
  const form = body || {};
  const periodMonth = String(form.period_month || "").trim().slice(0, 7);
  const title = String(form.title || "").trim().slice(0, 200);
  const activitySummary = String(form.activity_summary || "").trim().slice(0, 5000);
  const challenges = String(form.challenges || "").trim().slice(0, 3000);
  const supportNeeded = String(form.support_needed || "").trim().slice(0, 3000);

  const normalizedForm = {
    period_month: periodMonth,
    title,
    activity_summary: activitySummary,
    challenges,
    support_needed: supportNeeded,
  };

  if (!/^\d{4}-\d{2}$/.test(periodMonth)) {
    return { ok: false, error: "Period month must be YYYY-MM.", form: normalizedForm };
  }
  if (!title) {
    return { ok: false, error: "Title is required.", form: normalizedForm };
  }

  return {
    ok: true,
    data: {
      period_month: periodMonth,
      title,
      activity_summary: activitySummary,
      challenges,
      support_needed: supportNeeded,
    },
    form: normalizedForm,
  };
}

function currentPeriodMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

module.exports = {
  validateActivityNoteBody,
  currentPeriodMonth,
};
