"use strict";

/**
 * Immutable website submission review diff.
 * Reads only the submission snapshot captured at submit time — never the live draft.
 */

const { safeExternalUrl, escapeHtml } = require("./safeValues");
const { CONTENT_TYPES } = require("./contentTypes");

const CHANGE_TYPES = Object.freeze(["added", "changed", "removed", "visibility", "reorder"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isEmptyValue(value) {
  if (value == null) return true;
  if (value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object") {
    const src = value.src || value.url || null;
    const mediaId = value.mediaId || value.media_id || null;
    if ("src" in value || "mediaId" in value || "media_id" in value) {
      return !src && !mediaId;
    }
  }
  return false;
}

function valuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function classifyChange(change) {
  const oldValue = change && change.oldValue;
  const proposed = change && change.proposedValue;
  const oldVis = change && change.oldVisibility ? String(change.oldVisibility) : null;
  const newVis = change && change.visibility ? String(change.visibility) : null;
  const visChanged = Boolean(oldVis && newVis && oldVis !== newVis);
  const oldSort = Number(change && change.oldSortOrder);
  const newSort = Number(change && change.sortOrder);
  const sortChanged =
    Number.isFinite(oldSort) && Number.isFinite(newSort) && oldSort !== newSort;
  const valueChanged = !valuesEqual(oldValue, proposed);

  if (visChanged && !valueChanged) return "visibility";
  if (sortChanged && !valueChanged && !visChanged) return "reorder";
  if (isEmptyValue(oldValue) && !isEmptyValue(proposed)) return "added";
  if (!isEmptyValue(oldValue) && isEmptyValue(proposed)) return "removed";
  return "changed";
}

function pageLabel(template, pageKey) {
  const pages = (template && template.pages) || [];
  const found = pages.find((p) => p && p.key === pageKey);
  return (found && found.label) || pageKey || "Other";
}

function splitKey(contentKey) {
  const parts = String(contentKey || "")
    .split(".")
    .filter(Boolean);
  return {
    pageKey: parts[0] || "other",
    sectionKey: parts[1] || parts[0] || "other",
    fieldKey: parts.slice(2).join(".") || parts[1] || parts[0] || contentKey,
  };
}

function safeMediaPreviewPath(mediaId) {
  const id = String(mediaId || "").trim();
  if (!UUID_RE.test(id)) return null;
  return `/admin/website-media/${id}`;
}

function safePublicSrc(raw) {
  if (raw == null || raw === "") return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (text.startsWith("/activeclinic/assets/") && !text.includes("..")) {
    return text.split("?")[0];
  }
  const clinicMedia = text.match(
    /^\/clinics\/([a-z0-9][a-z0-9_-]{0,63})\/website\/media\/([0-9a-f-]{36})$/i
  );
  if (clinicMedia) {
    return `/clinics/${clinicMedia[1]}/website/media/${clinicMedia[2]}`;
  }
  const adminMedia = text.match(/^\/admin\/website-media\/([0-9a-f-]{36})$/i);
  if (adminMedia) return `/admin/website-media/${adminMedia[1]}`;
  const external = safeExternalUrl(text);
  if (external && /^https:\/\//i.test(external)) return external;
  return null;
}

function presentMedia(value) {
  if (value == null) {
    return { kind: "image", src: null, alt: null, mediaId: null, empty: true };
  }
  if (typeof value === "string") {
    return {
      kind: "image",
      src: safePublicSrc(value),
      alt: null,
      mediaId: null,
      empty: !safePublicSrc(value),
    };
  }
  if (typeof value === "object") {
    const mediaId = value.mediaId || value.media_id || null;
    const src = safePublicSrc(value.src || value.url) || safeMediaPreviewPath(mediaId);
    const alt = value.alt != null ? String(value.alt).slice(0, 240) : null;
    return {
      kind: "image",
      src,
      alt,
      mediaId: mediaId && UUID_RE.test(String(mediaId)) ? String(mediaId) : null,
      empty: !src && !mediaId,
    };
  }
  return { kind: "image", src: null, alt: null, mediaId: null, empty: true };
}

function presentText(value) {
  if (value == null) return { kind: "text", text: "", long: false, empty: true };
  if (typeof value === "boolean") {
    return { kind: "boolean", text: value ? "Yes" : "No", long: false, empty: false };
  }
  if (typeof value === "object") {
    const text = JSON.stringify(value, null, 2);
    return { kind: "structured", text, long: text.length > 160, empty: false };
  }
  const text = String(value);
  return { kind: "text", text, long: text.length > 160, empty: text.trim() === "" };
}

function presentVideo(value) {
  const raw =
    value && typeof value === "object" ? value.src || value.url || value.v : value;
  const url = safePublicSrc(raw) || (typeof raw === "string" ? safeExternalUrl(raw) : null);
  return { kind: "video", url: url && /^https:\/\//i.test(url) ? url : null, empty: !url };
}

function presentValue(value, contentType) {
  if (contentType === CONTENT_TYPES.IMAGE) return presentMedia(value);
  if (contentType === CONTENT_TYPES.VIDEO_URL) return presentVideo(value);
  if (contentType === CONTENT_TYPES.URL) {
    const url = safePublicSrc(value) || safeExternalUrl(value);
    return { kind: "url", url, empty: !url };
  }
  return presentText(value);
}

function changesFromSnapshot(snapshot) {
  if (snapshot && Array.isArray(snapshot.changes) && snapshot.changes.length) {
    return snapshot.changes;
  }
  const keys = Array.isArray(snapshot && snapshot.changedKeys) ? snapshot.changedKeys : [];
  const values = (snapshot && snapshot.values) || {};
  return keys.map((contentKey) => ({
    contentKey,
    contentType: "short_text",
    oldValue: null,
    proposedValue: values[contentKey],
    visibility: (snapshot.visibility && snapshot.visibility[contentKey]) || "visible",
  }));
}

/**
 * @param {object} input
 * @param {object} input.snapshot immutable submission snapshot
 * @param {object} [input.template]
 * @param {string[]} [input.changedKeys]
 * @returns {{ items: object[], count: number, source: string }}
 */
function buildWebsiteReviewDiff(input) {
  const snapshot = (input && input.snapshot) || {};
  const template = (input && input.template) || null;
  const listed = changesFromSnapshot({
    ...snapshot,
    changedKeys: (input && input.changedKeys) || snapshot.changedKeys,
  });
  const items = [];
  for (const raw of listed) {
    const contentKey = String((raw && raw.contentKey) || "").trim();
    if (!contentKey) continue;
    const def = template && template.keys ? template.keys[contentKey] : null;
    const parts = splitKey(contentKey);
    const pageKey = (def && def.group) || parts.pageKey;
    const contentType = (raw && raw.contentType) || (def && def.type) || "short_text";
    const changeType = CHANGE_TYPES.includes(raw && raw.changeType)
      ? raw.changeType
      : classifyChange(raw);
    const oldPresented = presentValue(raw.oldValue, contentType);
    const newPresented = presentValue(raw.proposedValue, contentType);
    items.push({
      contentKey,
      pageKey,
      pageLabel: pageLabel(template, pageKey),
      sectionKey: parts.sectionKey,
      fieldKey: parts.fieldKey,
      fieldLabel: (def && def.description) || contentKey,
      contentType,
      changeType,
      visibility: raw.visibility || "visible",
      oldVisibility: raw.oldVisibility || null,
      old: oldPresented,
      proposed: newPresented,
    });
  }
  items.sort((a, b) => {
    const page = String(a.pageLabel).localeCompare(String(b.pageLabel));
    if (page) return page;
    return String(a.contentKey).localeCompare(String(b.contentKey));
  });
  return {
    items,
    count: items.length,
    source: "submission_snapshot",
  };
}

function buildVersionDiff(input) {
  const current = (input && input.snapshot) || {};
  const previous = (input && input.previousSnapshot) || {};
  const currentValues = current.values || {};
  const previousValues = previous.values || {};
  const currentVis = current.visibility || {};
  const previousVis = previous.visibility || {};
  const listedKeys = Array.isArray(input && input.changedKeys) ? input.changedKeys.filter(Boolean) : [];
  const keys =
    listedKeys.length > 0
      ? listedKeys
      : [...new Set([...Object.keys(previousValues), ...Object.keys(currentValues)])];
  const changes = keys.map((contentKey) => ({
    contentKey,
    oldValue: previousValues[contentKey],
    proposedValue: currentValues[contentKey],
    oldVisibility: previousVis[contentKey] || null,
    visibility: currentVis[contentKey] || "visible",
  }));
  const diff = buildWebsiteReviewDiff({
    snapshot: { ...current, changes, changedKeys: keys },
    template: input && input.template,
    changedKeys: keys,
  });
  return { ...diff, source: "version_snapshot" };
}

module.exports = {
  CHANGE_TYPES,
  classifyChange,
  buildWebsiteReviewDiff,
  buildVersionDiff,
  presentValue,
  safePublicSrc,
  escapeHtml,
};
