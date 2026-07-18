"use strict";

/**
 * Controlled BlessBoard form schema validation.
 * Allowlisted field types only — no executable / HTML / script schemas.
 */

const ALLOWED_FIELD_TYPES = Object.freeze([
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "select",
  "checkbox",
  "date",
]);

const FORBIDDEN_SCHEMA_KEYS = Object.freeze([
  "__proto__",
  "constructor",
  "prototype",
  "script",
  "onclick",
  "onerror",
  "javascript",
]);

const LIMITS = Object.freeze({
  maxFields: 40,
  maxKeyLen: 40,
  maxLabelLen: 120,
  maxHelpLen: 500,
  maxOptions: 30,
  maxOptionLen: 80,
  maxSchemaBytes: 32768,
  maxAnswersBytes: 65536,
  maxAnswerTextLen: 2000,
});

const HTML_HINT = /<\/?[a-z][\s\S]*>/i;
const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s.]{7,32}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function hasForbiddenKey(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_SCHEMA_KEYS.includes(key.toLowerCase())) return true;
    if (typeof obj[key] === "object" && obj[key] !== null && hasForbiddenKey(obj[key])) {
      return true;
    }
  }
  return false;
}

function plainLabel(value, field, max) {
  if (value == null || value === "") return { ok: false, reason: field };
  const s = String(value).trim();
  if (!s || HTML_HINT.test(s) || s.length > max) {
    return { ok: false, reason: `${field}_invalid` };
  }
  return { ok: true, value: s };
}

/**
 * Validate and normalize a form schema definition.
 * @param {unknown} raw
 * @returns {{ ok: true, schema: object } | { ok: false, reason: string }}
 */
function validateFormSchema(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "schema_json_invalid" };
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "schema_not_object" };
  }
  if (hasForbiddenKey(parsed)) {
    return { ok: false, reason: "schema_forbidden_key" };
  }
  const size = Buffer.byteLength(JSON.stringify(parsed), "utf8");
  if (size > LIMITS.maxSchemaBytes) {
    return { ok: false, reason: "schema_too_large" };
  }
  const version = Number(parsed.version);
  if (version !== 1) {
    return { ok: false, reason: "schema_version" };
  }
  if (!Array.isArray(parsed.fields)) {
    return { ok: false, reason: "schema_fields" };
  }
  if (parsed.fields.length > LIMITS.maxFields) {
    return { ok: false, reason: "schema_too_many_fields" };
  }

  const keys = new Set();
  const fields = [];
  for (const field of parsed.fields) {
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      return { ok: false, reason: "field_invalid" };
    }
    if (hasForbiddenKey(field)) {
      return { ok: false, reason: "field_forbidden_key" };
    }
    const key = String(field.key || "").trim().toLowerCase();
    if (!FIELD_KEY_RE.test(key) || keys.has(key)) {
      return { ok: false, reason: "field_key" };
    }
    keys.add(key);
    const type = String(field.type || "").trim().toLowerCase();
    if (!ALLOWED_FIELD_TYPES.includes(type)) {
      return { ok: false, reason: "field_type_not_allowed" };
    }
    // Explicit reject of executable / HTML field types
    if (["html", "script", "code", "javascript", "file", "json"].includes(type)) {
      return { ok: false, reason: "field_type_not_allowed" };
    }
    const label = plainLabel(field.label, "label", LIMITS.maxLabelLen);
    if (!label.ok) return { ok: false, reason: label.reason };
    let help = null;
    if (field.help != null && field.help !== "") {
      const h = plainLabel(field.help, "help", LIMITS.maxHelpLen);
      if (!h.ok) return { ok: false, reason: h.reason };
      help = h.value;
    }
    const required = field.required === true;
    const normalized = { key, type, label: label.value, required };
    if (help) normalized.help = help;

    if (type === "text" || type === "textarea") {
      const maxLength = Number(field.maxLength);
      if (Number.isInteger(maxLength) && maxLength >= 1 && maxLength <= LIMITS.maxAnswerTextLen) {
        normalized.maxLength = maxLength;
      } else {
        normalized.maxLength = type === "textarea" ? 2000 : 200;
      }
    }
    if (type === "select") {
      if (!Array.isArray(field.options) || !field.options.length || field.options.length > LIMITS.maxOptions) {
        return { ok: false, reason: "field_options" };
      }
      const options = [];
      for (const opt of field.options) {
        const o = plainLabel(opt, "option", LIMITS.maxOptionLen);
        if (!o.ok) return { ok: false, reason: "field_option" };
        options.push(o.value);
      }
      normalized.options = options;
    }
    if (type === "number") {
      if (field.min != null && field.min !== "") {
        const min = Number(field.min);
        if (!Number.isFinite(min)) return { ok: false, reason: "field_min" };
        normalized.min = min;
      }
      if (field.max != null && field.max !== "") {
        const max = Number(field.max);
        if (!Number.isFinite(max)) return { ok: false, reason: "field_max" };
        normalized.max = max;
      }
    }
    fields.push(normalized);
  }

  return { ok: true, schema: { version: 1, fields } };
}

/**
 * Validate submission answers against a normalized schema.
 * @param {object} schema
 * @param {unknown} rawAnswers
 */
function validateFormAnswers(schema, rawAnswers) {
  let answers = rawAnswers;
  if (typeof rawAnswers === "string") {
    try {
      answers = JSON.parse(rawAnswers);
    } catch {
      return { ok: false, reason: "answers_json_invalid" };
    }
  }
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { ok: false, reason: "answers_not_object" };
  }
  if (hasForbiddenKey(answers)) {
    return { ok: false, reason: "answers_forbidden_key" };
  }
  const size = Buffer.byteLength(JSON.stringify(answers), "utf8");
  if (size > LIMITS.maxAnswersBytes) {
    return { ok: false, reason: "answers_too_large" };
  }

  const allowedKeys = new Set((schema.fields || []).map((f) => f.key));
  for (const key of Object.keys(answers)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, reason: "answers_unknown_field" };
    }
  }

  const out = {};
  for (const field of schema.fields || []) {
    const raw = answers[field.key];
    const missing = raw == null || raw === "";
    if (missing) {
      if (field.required) return { ok: false, reason: `required_${field.key}` };
      continue;
    }
    if (field.type === "checkbox") {
      out[field.key] = raw === true || raw === "true" || raw === "1" || raw === "on";
      continue;
    }
    if (field.type === "number") {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) return { ok: false, reason: `number_${field.key}` };
      if (field.min != null && n < field.min) return { ok: false, reason: `min_${field.key}` };
      if (field.max != null && n > field.max) return { ok: false, reason: `max_${field.key}` };
      out[field.key] = n;
      continue;
    }
    const s = String(raw).trim();
    if (HTML_HINT.test(s)) return { ok: false, reason: `html_not_allowed_${field.key}` };
    if (field.type === "email") {
      if (!EMAIL_RE.test(s) || s.length > 254) return { ok: false, reason: `email_${field.key}` };
      out[field.key] = s.toLowerCase();
      continue;
    }
    if (field.type === "phone") {
      if (!PHONE_RE.test(s)) return { ok: false, reason: `phone_${field.key}` };
      out[field.key] = s;
      continue;
    }
    if (field.type === "date") {
      if (!DATE_RE.test(s)) return { ok: false, reason: `date_${field.key}` };
      out[field.key] = s;
      continue;
    }
    if (field.type === "select") {
      if (!field.options.includes(s)) return { ok: false, reason: `select_${field.key}` };
      out[field.key] = s;
      continue;
    }
    // text / textarea
    const maxLen = field.maxLength || LIMITS.maxAnswerTextLen;
    if (s.length < 1 || s.length > maxLen) return { ok: false, reason: `length_${field.key}` };
    out[field.key] = s;
  }
  return { ok: true, answers: out };
}

module.exports = {
  ALLOWED_FIELD_TYPES,
  LIMITS,
  validateFormSchema,
  validateFormAnswers,
};
