"use strict";

const { CONTENT_TYPE_SET } = require("./contentTypes");

/** @type {Map<string, object>} */
const TEMPLATES = new Map();

function templateCacheKey(templateId, version) {
  return `${String(templateId || "").trim()}@${Number(version) || 1}`;
}

function assertKeyDef(templateId, key, def) {
  if (!def || !CONTENT_TYPE_SET.has(def.type)) {
    throw new Error(`website template ${templateId}: invalid type for ${key}`);
  }
}

function registerWebsiteTemplate(def) {
  const templateId = String((def && def.templateId) || "").trim();
  const productCode = String((def && def.productCode) || "").trim();
  const version = Number(def && def.version) || 1;
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(templateId)) {
    throw new Error("invalid website template id");
  }
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(productCode)) {
    throw new Error("invalid website template product code");
  }
  const keys = { ...((def && def.keys) || {}) };
  for (const [key, keyDef] of Object.entries(keys)) {
    assertKeyDef(templateId, key, keyDef);
  }
  const record = Object.freeze({
    templateId,
    productCode,
    version,
    label: String((def && def.label) || templateId),
    pages: Object.freeze([].concat((def && def.pages) || [])),
    keys: Object.freeze(keys),
    requiredPublishKeys: Object.freeze([].concat((def && def.requiredPublishKeys) || [])),
    mandatoryPages: Object.freeze([].concat((def && def.mandatoryPages) || [])),
    operationalBindings: Object.freeze({ ...((def && def.operationalBindings) || {}) }),
    defaults: Object.freeze({ ...((def && def.defaults) || {}) }),
    checklistItems: def && def.checklistItems ? Object.freeze(def.checklistItems) : undefined,
  });
  TEMPLATES.set(templateCacheKey(templateId, version), record);
  return record;
}

function getWebsiteTemplate(templateId, version) {
  return TEMPLATES.get(templateCacheKey(templateId, version)) || null;
}

function listWebsiteTemplates(productCode) {
  const wanted = productCode ? String(productCode) : null;
  return [...TEMPLATES.values()].filter((t) => !wanted || t.productCode === wanted);
}

function getContentKeyDef(template, contentKey) {
  if (!template || !template.keys) return null;
  return template.keys[contentKey] || null;
}

function isKnownContentKey(template, contentKey) {
  return Boolean(getContentKeyDef(template, contentKey));
}

function listTemplateKeys(template) {
  return template && template.keys ? Object.keys(template.keys) : [];
}

module.exports = {
  registerWebsiteTemplate,
  getWebsiteTemplate,
  listWebsiteTemplates,
  getContentKeyDef,
  isKnownContentKey,
  listTemplateKeys,
};
