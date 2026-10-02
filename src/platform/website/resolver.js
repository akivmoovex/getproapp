"use strict";

const { unwrapValue } = require("./contentTypes");
const { getWebsiteTemplate, listTemplateKeys } = require("./templateRegistry");
const instanceRepo = require("./instanceRepository");
const contentService = require("./contentService");

const MODE = Object.freeze({
  LIVE: "live",
  DRAFT: "draft",
});

function defaultForKey(template, key) {
  if (!template) return null;
  if (template.defaults && Object.prototype.hasOwnProperty.call(template.defaults, key)) {
    return template.defaults[key];
  }
  return null;
}

function pickValue(mode, row, fallback) {
  if (!row) return fallback;
  if (mode === MODE.DRAFT) {
    if (row.draftValue != null) return row.draftValue;
    if (row.publishedValue != null) return row.publishedValue;
    return fallback;
  }
  if (row.publishedValue != null) return row.publishedValue;
  return fallback;
}

function pickVisibility(mode, row, fallback) {
  if (!row) return fallback || "visible";
  return row.visibility || fallback || "visible";
}

async function resolveWebsiteContent(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = input.instance
    ? input.instance
    : await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  if (!instance || instance.organizationId !== organizationId) {
    return { ok: false, code: "website_instance_not_found", values: {}, visibility: {}, changes: [] };
  }
  const mode = input.mode === MODE.DRAFT ? MODE.DRAFT : MODE.LIVE;
  const template = getWebsiteTemplate(instance.templateId, instance.templateVersion);
  const rows = await contentService.listWebsiteContent(db, instance, organizationId);
  const byKey = new Map(rows.map((r) => [r.contentKey, r]));
  const values = {};
  const visibility = {};
  const keys = listTemplateKeys(template);
  for (const key of keys) {
    const row = byKey.get(key) || null;
    values[key] = pickValue(
      mode,
      row,
      mode === MODE.DRAFT ? defaultForKey(template, key) : null
    );
    visibility[key] = pickVisibility(mode, row, "visible");
  }
  const changes = mode === MODE.DRAFT ? contentService.diffContentRows(rows) : [];
  return {
    ok: true,
    mode,
    instance,
    template,
    values,
    visibility,
    changes,
    unpublishedCount: changes.length,
  };
}

function groupChanges(changes, template) {
  const groups = new Map();
  for (const change of changes || []) {
    const key = String(change.contentKey || "");
    const parts = key.split(".");
    const groupKey = (template && template.keys && template.keys[key] && template.keys[key].group) || parts[0] || "other";
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { page: groupKey, section: parts[1] || groupKey, items: [] });
    }
    groups.get(groupKey).items.push(change);
  }
  return [...groups.values()];
}

function snapshotFromResolved(resolved) {
  return {
    templateId: resolved.template && resolved.template.templateId,
    templateVersion: resolved.template && resolved.template.version,
    values: { ...(resolved.values || {}) },
    visibility: { ...(resolved.visibility || {}) },
  };
}

function unwrapStoredMap(json) {
  if (!json || typeof json !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(json)) {
    out[k] = unwrapValue(v) == null && v && typeof v === "object" && "v" in v ? unwrapValue(v) : v;
  }
  return out;
}

module.exports = {
  MODE,
  resolveWebsiteContent,
  pickValue,
  groupChanges,
  snapshotFromResolved,
  unwrapStoredMap,
};
