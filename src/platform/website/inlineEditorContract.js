"use strict";

/**
 * Shared inline-editor contract for ActiveClinic and BlessBoard.
 * Field allowlists live in editableFieldSchema — products must not invent
 * independent mutation paths.
 */

const { CONTENT_TYPES } = require("./contentTypes");
const {
  assertEditableMutation,
  resolveEditableField,
  ensureProductFieldsRegistered,
  PRODUCT_CODE,
} = require("./editableFieldSchema");
const { getWebsiteTemplate, isKnownContentKey } = require("./templateRegistry");

const INLINE_SAVE_PUBLISHES = false;

const MULTILINE_TYPES = new Set([
  CONTENT_TYPES.LONG_TEXT,
  CONTENT_TYPES.RICH_TEXT,
  "paragraph",
  "textarea",
  "long_text",
]);

function isMultilineFieldType(type) {
  return MULTILINE_TYPES.has(String(type || "").trim().toLowerCase());
}

/**
 * @param {{
 *   productCode?: string,
 *   template?: object,
 *   templateId?: string,
 *   templateVersion?: number,
 *   contentKey?: string,
 *   key?: string,
 *   pageKey?: string,
 *   sectionKey?: string,
 *   fieldKey?: string,
 * }} input
 */
function assertAllowlistedContentKey(input) {
  const productCode = String((input && input.productCode) || "").trim();
  if (productCode) {
    ensureProductFieldsRegistered(productCode);
    const resolved = resolveEditableField(input);
    if (!resolved.ok) return { ok: false, code: resolved.code || "unknown_content_key" };
    return { ok: true, code: "ok", contentKey: resolved.field.key, field: resolved.field };
  }
  const contentKey = String((input && (input.contentKey || input.key)) || "").trim();
  const template =
    (input && input.template) ||
    (input && input.templateId
      ? getWebsiteTemplate(input.templateId, input.templateVersion)
      : null);
  if (!template || !contentKey) {
    return { ok: false, code: "unknown_content_key" };
  }
  if (!isKnownContentKey(template, contentKey)) {
    return { ok: false, code: "unknown_content_key" };
  }
  return { ok: true, code: "ok", contentKey };
}

module.exports = {
  INLINE_SAVE_PUBLISHES,
  isMultilineFieldType,
  assertAllowlistedContentKey,
  assertEditableMutation,
  PRODUCT_CODE,
};
