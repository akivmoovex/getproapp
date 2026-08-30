"use strict";

/**
 * Centralized website-diff classification for post-publication review.
 * Prefer explicit registry metadata (governanceCategory, group, type).
 * Unknown keys stay visible as "other" — never dropped.
 */

const { CONTENT_TYPES } = require("./contentTypes");
const { resolveEditableField } = require("./editableFieldSchema");

const GOVERNANCE_CATEGORIES = Object.freeze([
  "text",
  "image",
  "section",
  "navigation",
  "seo",
  "other",
]);

const CATEGORY_SET = new Set(GOVERNANCE_CATEGORIES);

const TEXT_TYPES = new Set([
  CONTENT_TYPES.SHORT_TEXT,
  CONTENT_TYPES.LONG_TEXT,
  CONTENT_TYPES.EMAIL,
  CONTENT_TYPES.PHONE,
  CONTENT_TYPES.URL,
  CONTENT_TYPES.BOOLEAN,
  CONTENT_TYPES.ENUM,
  CONTENT_TYPES.VIDEO_URL,
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "boolean",
  "enum",
  "video_url",
]);

function asCategory(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  return CATEGORY_SET.has(key) ? key : null;
}

function categoryFromGroup(group) {
  const value = String(group || "")
    .trim()
    .toLowerCase();
  if (value === "seo") return "seo";
  if (value === "nav" || value === "navigation") return "navigation";
  return null;
}

function categoryFromType(contentType, changeType) {
  const type = String(contentType || "");
  if (type === CONTENT_TYPES.IMAGE || type === "image") return "image";
  if (
    type === CONTENT_TYPES.STRUCTURED ||
    type === "structured" ||
    changeType === "reorder" ||
    changeType === "visibility"
  ) {
    return "section";
  }
  if (TEXT_TYPES.has(type)) return "text";
  return null;
}

function templateKeyDef(template, contentKey) {
  if (!template || !template.keys || !contentKey) return null;
  return template.keys[contentKey] || null;
}

function fieldRegistryDef(productCode, contentKey) {
  if (!productCode || !contentKey) return null;
  try {
    const resolved = resolveEditableField({ productCode, key: contentKey });
    return resolved.ok ? resolved.field : null;
  } catch {
    return null;
  }
}

/**
 * Classify a diff item using registry metadata, then type, then "other".
 * @param {object} item
 * @param {object} [template]
 * @returns {string}
 */
function classifyGovernanceCategory(item, template) {
  const contentKey = String((item && item.contentKey) || "");
  const def = templateKeyDef(template, contentKey);
  const field = fieldRegistryDef(
    (template && template.productCode) || (item && item.productCode) || "",
    contentKey
  );

  const explicit =
    asCategory(item && item.governanceCategory) ||
    asCategory(def && def.governanceCategory) ||
    asCategory(field && field.governanceCategory);
  if (explicit) return explicit;

  const fromGroup =
    categoryFromGroup(def && def.group) ||
    categoryFromGroup(field && field.group) ||
    categoryFromGroup(item && item.group);
  if (fromGroup) return fromGroup;

  const fromType = categoryFromType(
    (item && item.contentType) || (def && def.type) || (field && field.type),
    item && item.changeType
  );
  const registered = Boolean(def || field || explicit || fromGroup);
  if (fromType === "image" || fromType === "section") return fromType;
  if (registered && fromType) return fromType;
  if (fromType === "text" && item && item.contentType) return "text";
  return "other";
}

function categorizeDiffItem(item, template) {
  return classifyGovernanceCategory(item, template);
}

module.exports = {
  GOVERNANCE_CATEGORIES,
  classifyGovernanceCategory,
  categorizeDiffItem,
  categoryFromGroup,
};
