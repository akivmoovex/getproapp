"use strict";

/**
 * Allowlisted editable website fields for Phase 7 Stage 4 inline text editing.
 * Keys are stable product identifiers — never expose raw DB column paths to clients.
 * The shared schema in src/platform/website/editableFieldSchema.js is the mutation gate.
 */

const { CONTENT_TYPES } = require("../../platform/website/contentTypes");
const { PERMISSIONS } = require("../../platform/website/permissions");
const {
  PRODUCT_CODE,
  STORAGE_KIND,
  VALIDATION_MODE,
  registerProductEditableFields,
  resolveEditableField: resolveSchemaField,
  assertEditableMutation,
  stableKeyFromLocator,
} = require("../../platform/website/editableFieldSchema");

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

/** Standard hero chrome: eyebrow + primary/secondary CTA label+URL */
function heroChromeFields(pageKey) {
  return fieldsFor(pageKey, "hero", [
    ["eyebrow", FIELD_TYPES.label, 80, { guidance: "Short eyebrow label" }],
    ["buttonText", FIELD_TYPES.buttonText, 48, { guidance: "Primary button label" }],
    ["buttonUrl", FIELD_TYPES.buttonUrl, 500, { guidance: "Primary button link" }],
    ["secondaryButtonText", FIELD_TYPES.buttonText, 48, { guidance: "Secondary button label" }],
    ["secondaryButtonUrl", FIELD_TYPES.buttonUrl, 500, { guidance: "Secondary button link" }],
  ]);
}

/** @type {EditableFieldDef[]} */
const EDITABLE_FIELDS = [
  ...fieldsFor("home", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true, guidance: "Up to 120 characters" }],
    ["bodyText", FIELD_TYPES.paragraph, 500, { guidance: "Up to 500 characters" }],
  ]),
  ...heroChromeFields("home"),
  ...fieldsFor("home", "welcome", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 2000],
    ["buttonText", FIELD_TYPES.buttonText, 48],
    ["buttonUrl", FIELD_TYPES.buttonUrl, 500],
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
    ["buttonUrl", FIELD_TYPES.buttonUrl, 500],
    ["secondaryButtonText", FIELD_TYPES.buttonText, 48],
    ["secondaryButtonUrl", FIELD_TYPES.buttonUrl, 500],
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
  ...heroChromeFields("about"),
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
    ["buttonUrl", FIELD_TYPES.buttonUrl, 500],
    ["secondaryButtonText", FIELD_TYPES.buttonText, 48],
    ["secondaryButtonUrl", FIELD_TYPES.buttonUrl, 500],
  ]),

  ...fieldsFor("leadership", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...heroChromeFields("leadership"),
  ...fieldsFor("ministries", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...heroChromeFields("ministries"),
  ...fieldsFor("events", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...heroChromeFields("events"),
  ...fieldsFor("sermons", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...heroChromeFields("sermons"),

  ...fieldsFor("contact", "hero", [
    ["heading", FIELD_TYPES.heading, 120, { required: true }],
    ["bodyText", FIELD_TYPES.paragraph, 500],
  ]),
  ...heroChromeFields("contact"),
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
  ...heroChromeFields("giving"),
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
    ["buttonUrl", FIELD_TYPES.buttonUrl, 500],
    ["secondaryButtonText", FIELD_TYPES.buttonText, 48],
    ["secondaryButtonUrl", FIELD_TYPES.buttonUrl, 500],
  ]),
  ...fieldsFor("giving", "cta", [
    ["heading", FIELD_TYPES.heading, 120],
    ["bodyText", FIELD_TYPES.paragraph, 800],
  ]),
];

const FIELD_INDEX = new Map(
  EDITABLE_FIELDS.map((f) => [`${f.pageKey}::${f.sectionKey}::${f.fieldKey}`, f])
);

function mapBlessboardType(field) {
  if (field.type === FIELD_TYPES.buttonUrl) return CONTENT_TYPES.URL;
  if (field.type === FIELD_TYPES.paragraph) return CONTENT_TYPES.LONG_TEXT;
  if (field.type === FIELD_TYPES.contactText && field.fieldKey === "email") return CONTENT_TYPES.EMAIL;
  if (field.type === FIELD_TYPES.contactText && field.fieldKey === "phone") return CONTENT_TYPES.PHONE;
  return CONTENT_TYPES.SHORT_TEXT;
}

function registerBlessBoardEditableFields() {
  const defs = EDITABLE_FIELDS.map((field) => ({
    key: stableKeyFromLocator(field.pageKey, field.sectionKey, field.fieldKey),
    productCode: PRODUCT_CODE.BLESSBOARD,
    templateId: "blessboard_church",
    templateVersion: 1,
    type: mapBlessboardType(field),
    productType: field.type,
    maxLen: field.maxLength,
    minLength: field.minLength,
    required: field.required === true,
    permission: PERMISSIONS.EDIT,
    validationMode: VALIDATION_MODE.BLESSBOARD_INLINE,
    allowRelativeUrl: field.type === FIELD_TYPES.buttonUrl,
    inline: true,
    group: field.pageKey,
    description: field.guidance || `${field.pageKey}.${field.sectionKey}.${field.fieldKey}`,
    storage: {
      kind: STORAGE_KIND.BLESSBOARD_INLINE,
      pageKey: field.pageKey,
      sectionKey: field.sectionKey,
      fieldKey: field.fieldKey,
    },
  }));
  registerProductEditableFields(PRODUCT_CODE.BLESSBOARD, defs);
}

registerBlessBoardEditableFields();

/**
 * @param {string} pageKey
 * @param {string} sectionKey
 * @param {string} fieldKey
 * @returns {EditableFieldDef|null}
 */
function resolveEditableField(pageKey, sectionKey, fieldKey) {
  const resolved = resolveSchemaField({
    productCode: PRODUCT_CODE.BLESSBOARD,
    pageKey,
    sectionKey,
    fieldKey,
  });
  if (!resolved.ok) return null;
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
  if (!field) return { ok: false, error: "That field cannot be edited." };
  const asserted = assertEditableMutation({
    productCode: PRODUCT_CODE.BLESSBOARD,
    pageKey: field.pageKey,
    sectionKey: field.sectionKey,
    fieldKey: field.fieldKey,
    value: raw,
  });
  if (!asserted.ok) {
    return { ok: false, error: asserted.message || "That field cannot be edited." };
  }
  return { ok: true, value: asserted.value };
}

module.exports = {
  FIELD_TYPES,
  EDITABLE_FIELDS,
  resolveEditableField,
  listEditableFieldsForPage,
  validateFieldValue,
  validateSafeUrl,
  registerBlessBoardEditableFields,
};
