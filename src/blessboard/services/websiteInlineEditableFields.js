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

/** @type {EditableFieldDef[]} */
const EDITABLE_FIELDS = [
  {
    pageKey: "home",
    sectionKey: "hero",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
    minLength: 1,
    required: true,
    guidance: "Up to 120 characters",
  },
  {
    pageKey: "home",
    sectionKey: "hero",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 500,
    guidance: "Up to 500 characters",
  },
  {
    pageKey: "home",
    sectionKey: "hero",
    fieldKey: "buttonText",
    type: FIELD_TYPES.buttonText,
    maxLength: 48,
    guidance: "Short button label",
  },
  {
    pageKey: "home",
    sectionKey: "hero",
    fieldKey: "buttonUrl",
    type: FIELD_TYPES.buttonUrl,
    maxLength: 500,
    guidance: "Relative path or https URL",
  },
  {
    pageKey: "home",
    sectionKey: "welcome",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
    required: true,
  },
  {
    pageKey: "home",
    sectionKey: "welcome",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 2000,
  },
  {
    pageKey: "about",
    sectionKey: "hero",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
    required: true,
  },
  {
    pageKey: "about",
    sectionKey: "hero",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 500,
  },
  {
    pageKey: "about",
    sectionKey: "story",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
  },
  {
    pageKey: "about",
    sectionKey: "story",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 4000,
  },
  {
    pageKey: "about",
    sectionKey: "mission",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
  },
  {
    pageKey: "about",
    sectionKey: "mission",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 2000,
  },
  {
    pageKey: "about",
    sectionKey: "vision",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
  },
  {
    pageKey: "about",
    sectionKey: "vision",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 2000,
  },
  {
    pageKey: "leadership",
    sectionKey: "hero",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
    required: true,
  },
  {
    pageKey: "leadership",
    sectionKey: "hero",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 500,
  },
  {
    pageKey: "leadership",
    sectionKey: "hero",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
    required: true,
  },
  {
    pageKey: "leadership",
    sectionKey: "hero",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 500,
  },
  {
    pageKey: "ministries",
    sectionKey: "hero",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
    required: true,
  },
  {
    pageKey: "ministries",
    sectionKey: "hero",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 500,
  },
  {
    pageKey: "events",
    sectionKey: "hero",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
    required: true,
  },
  {
    pageKey: "events",
    sectionKey: "hero",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 500,
  },
  {
    pageKey: "sermons",
    sectionKey: "hero",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
    required: true,
  },
  {
    pageKey: "sermons",
    sectionKey: "hero",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 500,
  },
  {
    pageKey: "contact",
    sectionKey: "hero",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
    required: true,
  },
  {
    pageKey: "contact",
    sectionKey: "hero",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 500,
  },
  {
    pageKey: "contact",
    sectionKey: "details",
    fieldKey: "email",
    type: FIELD_TYPES.contactText,
    maxLength: 254,
    guidance: "Contact email",
  },
  {
    pageKey: "contact",
    sectionKey: "details",
    fieldKey: "phone",
    type: FIELD_TYPES.contactText,
    maxLength: 40,
    guidance: "Phone number",
  },
  {
    pageKey: "contact",
    sectionKey: "details",
    fieldKey: "address",
    type: FIELD_TYPES.contactText,
    maxLength: 300,
    guidance: "Street address",
  },
  {
    pageKey: "giving",
    sectionKey: "hero",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
    required: true,
  },
  {
    pageKey: "giving",
    sectionKey: "hero",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 500,
  },
  {
    pageKey: "giving",
    sectionKey: "cta",
    fieldKey: "heading",
    type: FIELD_TYPES.heading,
    maxLength: 120,
  },
  {
    pageKey: "giving",
    sectionKey: "cta",
    fieldKey: "bodyText",
    type: FIELD_TYPES.paragraph,
    maxLength: 800,
  },
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
