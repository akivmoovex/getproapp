"use strict";

function validateSurveyBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const title = String(b.title || "").trim();
  if (!title || title.length > 200) {
    return { ok: false, error: "Survey title is required (max 200 characters)." };
  }
  const consent = String(b.consent_text || "").trim();
  if (!consent || consent.length > 4000) {
    return { ok: false, error: "Consent text is required (max 4000 characters)." };
  }
  const isRecurring = String(b.is_recurring || "") === "1";
  let recurrenceDays = null;
  if (isRecurring) {
    recurrenceDays = Number(b.recurrence_interval_days || 0);
    if (!Number.isFinite(recurrenceDays) || recurrenceDays < 1 || recurrenceDays > 365) {
      return { ok: false, error: "Recurrence interval must be 1–365 days." };
    }
  }
  const sensitivity = String(b.sensitivity || "standard");
  if (!["standard", "sensitive"].includes(sensitivity)) {
    return { ok: false, error: "Invalid sensitivity." };
  }
  const audience = String(b.authorised_audience || "branch_admin");
  if (!["branch_admin", "pastoral", "supervisor"].includes(audience)) {
    return { ok: false, error: "Invalid authorised audience." };
  }
  const route = String(b.route_on_submit || "none");
  if (!["none", "prayer_request", "care_case", "appointment_request"].includes(route)) {
    return { ok: false, error: "Invalid response routing." };
  }
  return {
    ok: true,
    data: {
      title,
      description: String(b.description || "").trim().slice(0, 2000),
      consent_text: consent,
      is_recurring: isRecurring,
      recurrence_interval_days: recurrenceDays,
      next_run_at: isRecurring ? new Date() : null,
      sensitivity,
      authorised_audience: audience,
      route_on_submit: route,
      status: String(b.status || "draft") === "active" ? "active" : "draft",
      is_template: String(b.is_template || "") === "1",
    },
  };
}

function validateQuestionBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const prompt = String(b.prompt || "").trim();
  const key = String(b.question_key || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!prompt || prompt.length > 1000) {
    return { ok: false, error: "Question prompt is required." };
  }
  if (!key || key.length > 80) {
    return { ok: false, error: "Question key is required." };
  }
  const type = String(b.question_type || "text");
  if (!["text", "single_choice", "multi_choice", "yes_no"].includes(type)) {
    return { ok: false, error: "Invalid question type." };
  }
  let options = [];
  if (type === "single_choice" || type === "multi_choice") {
    options = String(b.options || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (options.length < 2) {
      return { ok: false, error: "Choice questions need at least two options." };
    }
  }
  if (type === "yes_no") options = ["yes", "no"];
  const parentId = Number(b.branch_parent_question_id);
  return {
    ok: true,
    data: {
      prompt,
      question_key: key,
      question_type: type,
      options,
      is_required: String(b.is_required || "1") !== "0",
      sort_order: Number.isFinite(Number(b.sort_order)) ? Math.floor(Number(b.sort_order)) : 0,
      branch_parent_question_id:
        Number.isFinite(parentId) && parentId > 0 ? parentId : null,
      branch_equals_value: String(b.branch_equals_value || "").trim().slice(0, 200) || null,
    },
  };
}

function validateAnswerBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const questionId = Number(b.question_id);
  if (!Number.isFinite(questionId) || questionId <= 0) {
    return { ok: false, error: "Question is required." };
  }
  const answerText = String(b.answer_text || "").trim().slice(0, 4000);
  return {
    ok: true,
    data: {
      question_id: questionId,
      answer_text: answerText,
      answer_json: { value: answerText },
    },
  };
}

module.exports = {
  validateSurveyBody,
  validateQuestionBody,
  validateAnswerBody,
};
