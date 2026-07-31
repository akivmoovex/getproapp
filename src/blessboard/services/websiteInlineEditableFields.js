"use strict";

/**
 * Allowlisted editable website fields for Phase 7 Stage 4 inline text editing.
 * Keys are stable product identifiers — never expose raw DB column paths to clients.
 */

const FIELD_TYPES = Object.freeze({
  heading: "heading",
  paragraph: "paragraph",
  label: "label",
  buttonText: "buttonText",
  buttonUrl: "buttonUrl",
  contactText: "contactText",
});

/**
 * @typedef {{
 *   pageKey: string,
 *   sectionKey: string,
 *   fieldKey: string,
 *   type: string,
 *   maxLength: number,
 *   minLength?: number,
 *   required?: boolean,
 *   guidance?: string,
 * }} EditableFieldDef
 */

/**
 * @param {string} pageKey
 * @param {string} sectionKey
 * @param {Array<[string, string, number, object?]>} specs fieldKey, type, maxLength, extras
 * @returns {EditableFieldDef[]}
 */
function fieldsFor(pageKey, sectionKey, specs) {
  return specs.map(([fieldKey, type, maxLength, extras]) => ({
    pageKey,
    sectionKey,
    fieldKey,
    type,
    maxLength,
    ...(extras || {}),
  }));
}

/** @type {EditableFieldDef[]} */
const EDITABLE_FIELDS = [
  ...fieldsFor("home", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true, guidance: "Up to 120 characters" }],
    ["bodyText", FIELD_TYPES.paragraph, 500, { guidance: "Up to 500 characters" }],
    ["buttonText", FIELD_TYPES.buttonText, 48, { guidance: "Short button label" }],
    ["buttonUrl", FIELD_TYPES.buttonUrl, 500, { guidance: "Relative path or https URL" }],
  ]),
  ...fieldsFor("home", "welcome", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 2000],
  ]),
  ...fieldsFor("home", "ministries_intro", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 1000],
    ["buttonText", FIELD_TYPES.buttonText, 48],
  ]),
  ...fieldsFor("home", "events_intro", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 1000],
    ["buttonText", FIELD_TYPES.buttonText, 48],
  ]),
  ...fieldsFor("home", "sermons_intro", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 1000],
    ["buttonText", FIELD_TYPES.buttonText, 48],
  ]),
  ...fieldsFor("home", "leadership_intro", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 1000],
    ["buttonText", FIELD_TYPES.buttonText, 48],
  ]),
  ...fieldsFor("home", "giving_cta", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 800],
    ["buttonText", FIELD_TYPES.buttonText, 48],
  ]),
  ...fieldsFor("home", "contact_intro", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 1000],
    ["buttonText", FIELD_TYPES.buttonText, 48],
  ]),
  ...fieldsFor("home", "footer", [
    ["tagline", FIELD_TYPES.paragraph, 200, { guidance: "Footer tagline (up to 200 characters)" }],
  ]),

  ...fieldsFor("about", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...fieldsFor("about", "story", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 4000],
  ]),
  ...fieldsFor("about", "mission", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 2000],
  ]),
  ...fieldsFor("about", "vision", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 2000],
  ]),
  ...fieldsFor("about", "values", [
    ["heading", FIELD_TYPES.heading, 120],
  ]),
  ...fieldsFor("about", "value_presence", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 1000],
  ]),
  ...fieldsFor("about", "value_integrity", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 1000],
  ]),
  ...fieldsFor("about", "value_compassion", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 1000],
  ]),
  ...fieldsFor("about", "value_discipleship", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 1000],
  ]),
  ...fieldsFor("about", "beliefs", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 4000],
  ]),
  ...fieldsFor("about", "community", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 2000],
  ]),
  ...fieldsFor("about", "gallery", [
    ["heading", FIELD_TYPES.heading, 120],
  ]),
  ...fieldsFor("about", "gallery_1", [["heading", FIELD_TYPES.label, 120]]),
  ...fieldsFor("about", "gallery_2", [["heading", FIELD_TYPES.label, 120]]),
  ...fieldsFor("about", "gallery_3", [["heading", FIELD_TYPES.label, 120]]),
  ...fieldsFor("about", "visitor_cta", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 800],
    ["buttonText", FIELD_TYPES.buttonText, 48],
  ]),

  ...fieldsFor("leadership", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...fieldsFor("ministries", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...fieldsFor("events", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...fieldsFor("sermons", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),

  ...fieldsFor("contact", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...fieldsFor("contact", "details", [
    ["email", FIELD_TYPES.contactText, 254, { guidance: "Contact email" }],
    ["phone", FIELD_TYPES.contactText, 40, { guidance: "Phone number" }],
    ["address", FIELD_TYPES.contactText, 300, { guidance: "Street address" }],
  ]),
  ...fieldsFor("contact", "visitor_guidance", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 2000],
  ]),
  ...fieldsFor("contact", "directions", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 1000],
  ]),
  ...fieldsFor("contact", "service_reminder", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 1000],
  ]),
  ...fieldsFor("contact", "office_hours", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...fieldsFor("contact", "message", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 1000],
  ]),

  ...fieldsFor("giving", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...fieldsFor("giving", "why", [
    ["heading", FIELD_TYPES.heading, 120],
  ]),
  ...fieldsFor("giving", "why_impact", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...fieldsFor("giving", "why_stewardship", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...fieldsFor("giving", "why_accountability", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...fieldsFor("giving", "ways", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 800],
  ]),
  ...fieldsFor("giving", "accountability", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 2000],
  ]),
  ...fieldsFor("giving", "stewardship", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 2000],
  ]),
  ...fieldsFor("giving", "assistance", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 800],
    ["buttonText", FIELD_TYPES.buttonText, 48],
  ]),
  ...fieldsFor("giving", "cta", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 800],
  ]),
];

const FIELD_INDEX = new Map(
  EDITABLE_FIELDS.map((f) => [`${f.pageKey}::${f.sectionKey}::${f.fieldKey}`, f])
);

/**
 * @param {string} pageKey
 * @param {string} sectionKey
 * @param {string} fieldKey
 * @returns {EditableFieldDef|null}
 */
function resolveEditableField(pageKey, sectionKey, fieldKey) {
  return FIELD_INDEX.get(`${pageKey}::${sectionKey}::${fieldKey}`) || null;
}

/**
 * @param {string} pageKey
 * @returns {EditableFieldDef[]}
 */
function listEditableFieldsForPage(pageKey) {
  return EDITABLE_FIELDS.filter((f) => f.pageKey === pageKey);
}

/**
 * Safe relative or https URL for button links.
 * @param {string} raw
 * @returns {{ ok: true, value: string }|{ ok: false, error: string }}
 */
function validateSafeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return { ok: true, value: "" };
  }
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    if (value.length > 500) return { ok: false, error: "Link is too long." };
    if (/[\s<>"']/.test(value)) return { ok: false, error: "Link contains invalid characters." };
    return { ok: true, value };
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "Enter a relative path or https link." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Only http or https links are allowed." };
  }
  if (value.length > 500) return { ok: false, error: "Link is too long." };
  return { ok: true, value };
}

/**
 * @param {EditableFieldDef} field
 * @param {string} raw
 * @returns {{ ok: true, value: string }|{ ok: false, error: string }}
 */
function validateFieldValue(field, raw) {
  const value = String(raw ?? "");
  if (field.type === FIELD_TYPES.buttonUrl) {
    return validateSafeUrl(value);
  }
  const trimmed = value.trim();
  if (field.required && !trimmed) {
    return { ok: false, error: "This field is required." };
  }
  if (field.minLength != null && trimmed.length < field.minLength) {
    return { ok: false, error: `Enter at least ${field.minLength} characters.` };
  }
  if (trimmed.length > field.maxLength) {
    return { ok: false, error: `Keep this under ${field.maxLength} characters.` };
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    return { ok: false, error: "Text contains invalid characters." };
  }
  return { ok: true, value: trimmed };
}

module.exports = {
  FIELD_TYPES,
  EDITABLE_FIELDS,
  resolveEditableField,
  listEditableFieldsForPage,
  validateFieldValue,
  validateSafeUrl,
};
