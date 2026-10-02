"use strict";

function parseDateTime(value) {
  if (value == null || value === "") return null;
  const d = new Date(String(value).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function validateFoundationEventSettings(body) {
  const b = body && typeof body === "object" ? body : {};
  let capacity = null;
  if (String(b.capacity || "").trim()) {
    capacity = Number(b.capacity);
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 100000) {
      return { ok: false, error: "Capacity must be 1–100000, or blank." };
    }
  }
  return {
    ok: true,
    data: {
      capacity,
      registration_enabled: String(b.registration_enabled || "") === "1",
      check_in_enabled: String(b.check_in_enabled || "") === "1",
    },
  };
}

function validateGrowthEventSettings(body) {
  const base = validateFoundationEventSettings(body);
  if (!base.ok) return base;
  const b = body && typeof body === "object" ? body : {};
  const opens = parseDateTime(b.registration_opens_at);
  const closes = parseDateTime(b.registration_closes_at);
  if (opens && closes && closes <= opens) {
    return { ok: false, error: "Registration close must be after open." };
  }
  const maxCompanions = Number(b.max_companions || 0);
  if (!Number.isFinite(maxCompanions) || maxCompanions < 0 || maxCompanions > 20) {
    return { ok: false, error: "Max companions must be 0–20." };
  }
  const formId = Number(b.registration_form_id);
  return {
    ok: true,
    data: {
      ...base.data,
      registration_opens_at: opens,
      registration_closes_at: closes,
      requires_approval: String(b.requires_approval || "") === "1",
      allow_companions: String(b.allow_companions || "") === "1",
      max_companions: Math.floor(maxCompanions),
      registration_form_id: Number.isFinite(formId) && formId > 0 ? formId : null,
      feedback_enabled: String(b.feedback_enabled || "") === "1",
    },
  };
}

function validateFormBody(body) {
  const title = String((body && body.title) || "").trim();
  if (!title || title.length > 200) return { ok: false, error: "Form title is required." };
  return {
    ok: true,
    data: {
      title,
      description: String((body && body.description) || "").trim().slice(0, 2000),
      consent_text: String((body && body.consent_text) || "").trim().slice(0, 4000),
    },
  };
}

function validateQuestionBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const prompt = String(b.prompt || "").trim();
  const key = String(b.question_key || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
  if (!prompt || !key) return { ok: false, error: "Question key and prompt are required." };
  const type = String(b.question_type || "text");
  if (!["text", "single_choice", "yes_no", "file_note"].includes(type)) {
    return { ok: false, error: "Invalid question type." };
  }
  let options = [];
  if (type === "single_choice") {
    options = String(b.options || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (options.length < 2) return { ok: false, error: "Choice questions need at least two options." };
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
      branch_parent_question_id: Number.isFinite(parentId) && parentId > 0 ? parentId : null,
      branch_equals_value: String(b.branch_equals_value || "").trim().slice(0, 200) || null,
    },
  };
}

function validateRegistrationBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const companions = [];
  const rawCompanions = b.companions;
  if (Array.isArray(rawCompanions)) {
    for (const c of rawCompanions.slice(0, 20)) {
      const name = String((c && c.full_name) || "").trim();
      if (name) {
        companions.push({
          full_name: name.slice(0, 200),
          relationship: String((c && c.relationship) || "").trim().slice(0, 100),
          age_group: String((c && c.age_group) || "").trim().slice(0, 100),
        });
      }
    }
  } else if (String(b.companion_names || "").trim()) {
    for (const name of String(b.companion_names).split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20)) {
      companions.push({ full_name: name.slice(0, 200), relationship: "", age_group: "" });
    }
  }
  const answers = {};
  if (b.answers && typeof b.answers === "object") {
    for (const [k, v] of Object.entries(b.answers)) {
      answers[k] = String(v || "").trim().slice(0, 4000);
    }
  }
  return {
    ok: true,
    data: {
      visitor_name: String(b.visitor_name || "").trim().slice(0, 200),
      visitor_email: String(b.visitor_email || "").trim().slice(0, 200),
      visitor_phone: String(b.visitor_phone || "").trim().slice(0, 40),
      consent_accepted: String(b.consent_accepted || "") === "1",
      companions,
      answers,
    },
  };
}

module.exports = {
  validateFoundationEventSettings,
  validateGrowthEventSettings,
  validateFormBody,
  validateQuestionBody,
  validateRegistrationBody,
};
