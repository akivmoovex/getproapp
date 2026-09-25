"use strict";

/**
 * Shared V7 website editable-field schema.
 * Product templates register fields here; they must not invent independent
 * mutation allowlists. The browser may only submit a registered key (or a
 * BlessBoard page/section/field locator that maps to one).
 *
 * Stable keys are lowercase dotted identifiers. They follow repository truth:
 *   ActiveClinic  home.hero.title, about.story.body, contact.phone, location.address
 *   BlessBoard    home.hero.heading, about.story.body_text, contact.details.phone
 * Do not add aliases such as about.introduction unless a product already stores them.
 */

const { PERMISSIONS, hasWebsitePermission } = require("./permissions");
const {
  CONTENT_TYPES,
  CONTENT_TYPE_SET,
  normalizeContentKey,
  validateContentValue,
} = require("./contentTypes");

const PRODUCT_CODE = Object.freeze({
  ACTIVECLINIC: "activeclinic",
  BLESSBOARD: "blessboard",
});

const VALIDATION_MODE = Object.freeze({
  CONTENT_TYPES: "content_types",
  BLESSBOARD_INLINE: "blessboard_inline",
});

const STORAGE_KIND = Object.freeze({
  PLATFORM_CONTENT_KEY: "platform_content_key",
  BLESSBOARD_INLINE: "blessboard_inline",
});

/** @type {Map<string, object>} productCode::stableKey → field */
const BY_KEY = new Map();
/** @type {Map<string, object>} productCode::page::section::fieldKey → field */
const BY_LOCATOR = new Map();

function productIndexKey(productCode, stableKey) {
  return `${String(productCode || "").trim()}::${String(stableKey || "").trim()}`;
}

function locatorIndexKey(productCode, pageKey, sectionKey, fieldKey) {
  return `${String(productCode || "").trim()}::${String(pageKey || "")}::${String(sectionKey || "")}::${String(fieldKey || "")}`;
}

function camelToSnake(value) {
  return String(value || "")
    .replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`)
    .replace(/^_/, "");
}

function stableKeyFromLocator(pageKey, sectionKey, fieldKey) {
  return `${String(pageKey || "").trim()}.${String(sectionKey || "").trim()}.${camelToSnake(fieldKey)}`;
}

/**
 * Allowlist dynamically added BlessBoard text/cta sections for heading/body edits.
 */
function blessboardAddedSectionField(input) {
  const pageKey = String((input && input.pageKey) || "").trim();
  const sectionKey = String((input && input.sectionKey) || "").trim();
  const fieldKey = String((input && input.fieldKey) || "").trim();
  if (!pageKey || !sectionKey || !fieldKey) return null;
  if (!/^(text|cta)_[a-z0-9]+$/i.test(sectionKey)) return null;
  if (fieldKey !== "heading" && fieldKey !== "bodyText" && fieldKey !== "body_text") return null;
  const normalizedField = fieldKey === "body_text" ? "bodyText" : fieldKey;
  const maxLen = normalizedField === "heading" ? 200 : 4000;
  return {
    productCode: PRODUCT_CODE.BLESSBOARD,
    key: stableKeyFromLocator(pageKey, sectionKey, normalizedField),
    type: normalizedField === "heading" ? CONTENT_TYPES.SHORT_TEXT : CONTENT_TYPES.LONG_TEXT,
    maxLen,
    permission: PERMISSIONS.EDIT,
    validationMode: VALIDATION_MODE.BLESSBOARD_INLINE,
    inline: true,
    storage: {
      kind: STORAGE_KIND.BLESSBOARD_INLINE,
      pageKey,
      sectionKey,
      fieldKey: normalizedField,
    },
  };
}

function contentDefFromField(field) {
  return {
    key: field.key || field.contentKey || null,
    type: field.type,
    maxLen: field.maxLen,
    maxBytes: field.maxBytes,
    enumValues: field.enumValues,
    itemSchema: field.itemSchema,
    acceptObject: field.acceptObject === true,
  };
}

function validateBlessboardInline(field, raw) {
  // Email/phone are registered with CONTENT_TYPES.EMAIL|PHONE but historically used the
  // BlessBoard inline text path, which skipped format checks (BB-04).
  if (field.type === CONTENT_TYPES.EMAIL || field.type === CONTENT_TYPES.PHONE) {
    const validated = validateContentValue(contentDefFromField(field), raw);
    if (!validated.ok) {
      return {
        ok: false,
        code: "validation_failed",
        reason: validated.code,
        message:
          field.type === CONTENT_TYPES.EMAIL
            ? "Enter a valid email address."
            : "Enter a valid phone number.",
      };
    }
    return { ok: true, value: validated.value };
  }
  const value = String(raw ?? "");
  if (field.type === CONTENT_TYPES.URL || field.allowRelativeUrl === true) {
    const trimmed = value.trim();
    if (!trimmed) {
      if (field.required) return { ok: false, code: "validation_failed", reason: "required", message: "This field is required." };
      return { ok: true, value: "" };
    }
    if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\")) {
      if (trimmed.length > (field.maxLen || 500)) {
        return { ok: false, code: "validation_failed", reason: "too_long", message: `Keep this under ${field.maxLen} characters.` };
      }
      if (/[\s<>"']/.test(trimmed)) {
        return { ok: false, code: "validation_failed", reason: "invalid_url", message: "Link contains invalid characters." };
      }
      return { ok: true, value: trimmed };
    }
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { ok: false, code: "validation_failed", reason: "invalid_url", message: "Enter a relative path or https link." };
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, code: "validation_failed", reason: "invalid_url", message: "Only http or https links are allowed." };
    }
    if (trimmed.length > (field.maxLen || 500)) {
      return { ok: false, code: "validation_failed", reason: "too_long", message: `Keep this under ${field.maxLen} characters.` };
    }
    return { ok: true, value: trimmed };
  }
  const { normalizePlainTextEntities } = require("./plainTextEntities");
  // Persist plain text only — never store HTML-escaped entities (EJS escapes at render).
  const trimmed = normalizePlainTextEntities(value).trim();
  if (field.required && !trimmed) {
    return { ok: false, code: "validation_failed", reason: "required", message: "This field is required." };
  }
  if (field.minLength != null && trimmed.length < field.minLength) {
    return {
      ok: false,
      code: "validation_failed",
      reason: "too_short",
      message: `Enter at least ${field.minLength} characters.`,
    };
  }
  if (trimmed.length > (field.maxLen || 500)) {
    return {
      ok: false,
      code: "validation_failed",
      reason: "too_long",
      message: `Keep this under ${field.maxLen} characters.`,
    };
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(trimmed)) {
    return { ok: false, code: "validation_failed", reason: "unsafe_content", message: "Text contains invalid characters." };
  }
  return { ok: true, value: trimmed };
}

function validateEditableValue(field, candidate) {
  if (!field) return { ok: false, code: "unknown_content_key" };
  if (field.validationMode === VALIDATION_MODE.BLESSBOARD_INLINE) {
    return validateBlessboardInline(field, candidate);
  }
  const validated = validateContentValue(contentDefFromField(field), candidate);
  if (!validated.ok) {
    let message = validated.code;
    if (validated.code === "invalid_email") message = "Enter a valid email address.";
    if (validated.code === "invalid_phone") message = "Enter a valid phone number.";
    return { ok: false, code: "validation_failed", reason: validated.code, message };
  }
  if (field.required && (validated.value == null || validated.value === "")) {
    return { ok: false, code: "validation_failed", reason: "required", message: "This field is required." };
  }
  return { ok: true, value: validated.value };
}

/**
 * Read a submitted editor `value` without coercing media objects to "[object Object]".
 * Shared WE01 clients send IMAGE as `{ mediaId, src, alt, placement? }` (or a string URL).
 * Ownership / URL safety still run in contentTypes + mediaService.
 *
 * @param {object|null|undefined} body
 * @returns {*|string}
 */
function readSubmittedEditableValue(body) {
  if (!body || typeof body !== "object" || !Object.prototype.hasOwnProperty.call(body, "value")) {
    return "";
  }
  const value = body.value;
  if (value == null) return "";
  if (typeof value === "object" && !Array.isArray(value)) return value;
  return String(value);
}

/**
 * Compare draft values across text and structured image payloads.
 * @param {*} left
 * @param {*} right
 * @returns {boolean}
 */
function editableValuesEqual(left, right) {
  if (left === right) return true;
  if ((left == null || left === "") && (right == null || right === "")) return true;
  if (
    (left != null && typeof left === "object") ||
    (right != null && typeof right === "object")
  ) {
    try {
      return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
    } catch {
      return false;
    }
  }
  return String(left) === String(right);
}

/**
 * Persist overlay draft rows as text while keeping objects round-trippable.
 * @param {*} value
 * @returns {string}
 */
function serializeOverlayDraftValue(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

/**
 * @param {object} def
 * @returns {object}
 */
function normalizeFieldDef(def) {
  const productCode = String((def && def.productCode) || "").trim();
  const keyNorm = normalizeContentKey(def && def.key);
  if (!productCode || !keyNorm.ok) {
    throw new Error("editable field requires productCode and a valid stable key");
  }
  const type = String((def && def.type) || "").trim();
  if (!CONTENT_TYPE_SET.has(type)) {
    throw new Error(`editable field ${keyNorm.key}: unknown type ${type}`);
  }
  const storage = def.storage && typeof def.storage === "object"
    ? def.storage
    : { kind: STORAGE_KIND.PLATFORM_CONTENT_KEY, contentKey: keyNorm.key };
  return Object.freeze({
    key: keyNorm.key,
    productCode,
    templateId: def.templateId ? String(def.templateId) : null,
    templateVersion: Number.isFinite(Number(def.templateVersion)) ? Number(def.templateVersion) : null,
    type,
    productType: def.productType ? String(def.productType) : type,
    permission: def.permission || PERMISSIONS.EDIT,
    validationMode: def.validationMode || VALIDATION_MODE.CONTENT_TYPES,
    maxLen: Number.isFinite(Number(def.maxLen)) ? Number(def.maxLen) : undefined,
    minLength: Number.isFinite(Number(def.minLength)) ? Number(def.minLength) : undefined,
    required: def.required === true,
    hideable: def.hideable === true,
    allowRelativeUrl: def.allowRelativeUrl === true,
    inline: def.inline !== false,
    group: def.group ? String(def.group) : null,
    governanceCategory: def.governanceCategory ? String(def.governanceCategory) : null,
    displayLabel: def.displayLabel ? String(def.displayLabel) : null,
    description: def.description ? String(def.description) : "",
    enumValues: Array.isArray(def.enumValues) ? Object.freeze([...def.enumValues]) : null,
    itemSchema: def.itemSchema ? Object.freeze({ ...def.itemSchema }) : null,
    acceptObject: def.acceptObject === true,
    maxBytes: Number.isFinite(Number(def.maxBytes)) ? Number(def.maxBytes) : undefined,
    storage: Object.freeze({
      kind: storage.kind || STORAGE_KIND.PLATFORM_CONTENT_KEY,
      contentKey: storage.contentKey || keyNorm.key,
      pageKey: storage.pageKey || null,
      sectionKey: storage.sectionKey || null,
      fieldKey: storage.fieldKey || null,
    }),
  });
}

function registerEditableField(def) {
  const field = normalizeFieldDef(def);
  BY_KEY.set(productIndexKey(field.productCode, field.key), field);
  if (field.storage.pageKey && field.storage.sectionKey && field.storage.fieldKey) {
    BY_LOCATOR.set(
      locatorIndexKey(
        field.productCode,
        field.storage.pageKey,
        field.storage.sectionKey,
        field.storage.fieldKey
      ),
      field
    );
  }
  return field;
}

function registerProductEditableFields(productCode, defs) {
  const code = String(productCode || "").trim();
  for (const key of [...BY_KEY.keys()]) {
    if (key.startsWith(`${code}::`)) BY_KEY.delete(key);
  }
  for (const key of [...BY_LOCATOR.keys()]) {
    if (key.startsWith(`${code}::`)) BY_LOCATOR.delete(key);
  }
  const registered = [];
  for (const def of defs || []) {
    registered.push(registerEditableField({ ...def, productCode: code }));
  }
  return registered;
}

function resolveEditableField(input) {
  const productCode = String((input && input.productCode) || "").trim();
  if (!productCode) return { ok: false, code: "unknown_content_key" };
  let field = null;
  if (input.pageKey && input.sectionKey && input.fieldKey) {
    field = BY_LOCATOR.get(
      locatorIndexKey(productCode, input.pageKey, input.sectionKey, input.fieldKey)
    ) || null;
  }
  if (!field) {
    const rawKey = input.key || input.contentKey || "";
    if (rawKey) {
      const keyNorm = normalizeContentKey(rawKey);
      if (!keyNorm.ok) {
        return { ok: false, code: "invalid_content_key" };
      }
      field = BY_KEY.get(productIndexKey(productCode, keyNorm.key)) || null;
      if (!field && productCode === PRODUCT_CODE.ACTIVECLINIC) {
        const {
          cmsSectionEditableField,
        } = require("../website-engine/sectionLifecycle");
        field = cmsSectionEditableField(keyNorm.key);
      }
      if (!field && productCode === PRODUCT_CODE.BLESSBOARD) {
        const parts = keyNorm.key.split(".");
        if (parts.length === 3) {
          field = blessboardAddedSectionField({
            pageKey: parts[0],
            sectionKey: parts[1],
            fieldKey: parts[2] === "body_text" ? "bodyText" : parts[2],
          });
        }
      }
    }
  }
  if (
    !field &&
    productCode === PRODUCT_CODE.BLESSBOARD &&
    input.pageKey &&
    input.sectionKey &&
    input.fieldKey
  ) {
    field = blessboardAddedSectionField(input);
  }
  if (!field) return { ok: false, code: "unknown_content_key" };
  if (input.templateId && field.templateId && String(input.templateId) !== field.templateId) {
    return { ok: false, code: "unknown_content_key" };
  }
  return { ok: true, field };
}

/**
 * Validate a field mutation against the shared schema.
 * Tenant isolation stays in the product save path (instance/org or church scope).
 *
 * @param {{
 *   productCode: string,
 *   key?: string,
 *   contentKey?: string,
 *   pageKey?: string,
 *   sectionKey?: string,
 *   fieldKey?: string,
 *   value?: *,
 *   grantedPermissions?: string[],
 *   requirePermission?: boolean,
 * }} input
 */
function assertEditableMutation(input) {
  const resolved = resolveEditableField(input);
  if (!resolved.ok) return resolved;
  const field = resolved.field;
  const granted = input && input.grantedPermissions;
  const mustCheck = input && input.requirePermission === true ? true : Array.isArray(granted);
  if (mustCheck && !hasWebsitePermission(granted || [], field.permission)) {
    return { ok: false, code: "forbidden", field };
  }
  const validated = validateEditableValue(field, input && input.value);
  if (!validated.ok) return { ...validated, field };
  return { ok: true, field, value: validated.value };
}

function listEditableFields(productCode) {
  const code = productCode ? String(productCode).trim() : "";
  return [...BY_KEY.values()]
    .filter((field) => !code || field.productCode === code)
    .sort((a, b) => a.key.localeCompare(b.key) || a.productCode.localeCompare(b.productCode));
}

function hasEditableField(productCode, key) {
  return BY_KEY.has(productIndexKey(productCode, key));
}

function ensureProductFieldsRegistered(productCode) {
  const code = String(productCode || "").trim();
  if (code === PRODUCT_CODE.ACTIVECLINIC) {
    require("../../activeclinic/website/activeClinicWebsiteTemplate").registerActiveClinicWebsiteTemplate();
  } else if (code === PRODUCT_CODE.BLESSBOARD) {
    require("../../blessboard/services/websiteInlineEditableFields");
    require("../../blessboard/website/blessboardChurchTemplate").registerBlessBoardWebsiteTemplate();
  }
}

module.exports = {
  PRODUCT_CODE,
  VALIDATION_MODE,
  STORAGE_KIND,
  registerEditableField,
  registerProductEditableFields,
  resolveEditableField,
  assertEditableMutation,
  validateEditableValue,
  readSubmittedEditableValue,
  editableValuesEqual,
  serializeOverlayDraftValue,
  listEditableFields,
  hasEditableField,
  stableKeyFromLocator,
  camelToSnake,
  ensureProductFieldsRegistered,
};
