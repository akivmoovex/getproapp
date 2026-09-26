"use strict";

/**
 * V2.01 Unpublished Changes Panel presentation (Stitch Screen 3).
 * Groups pending draft-vs-published fields by website page.
 * Safe field revert is available via discardWebsiteDraft / revertFieldToPublished.
 */

const { CONTENT_TYPES } = require("../website/contentTypes");
const { getWebsiteTemplate, getContentKeyDef } = require("../website/templateRegistry");
const PAGE_ICONS = Object.freeze({
  home: "home",
  about: "info",
  leadership: "groups",
  ministries: "volunteer_activism",
  events: "event",
  sermons: "library_music",
  giving: "favorite",
  contact: "mail",
  services: "medical_services",
  doctors: "stethoscope",
  pricing: "payments",
  location: "location_on",
  book: "calendar_month",
});
const { presentValue, escapeHtml } = require("../website/reviewDiff");

const STITCH_PANEL_SCREEN = "d205f226463c4e38b797b4757338404e";
const STITCH_PROJECT_ID = "12538817760086591589";

const TYPE_LABELS = Object.freeze({
  [CONTENT_TYPES.SHORT_TEXT]: "Text",
  [CONTENT_TYPES.LONG_TEXT]: "Text",
  [CONTENT_TYPES.RICH_TEXT]: "Text",
  [CONTENT_TYPES.IMAGE]: "Media",
  [CONTENT_TYPES.VIDEO_URL]: "Media",
  [CONTENT_TYPES.URL]: "Link",
  [CONTENT_TYPES.EMAIL]: "Text",
  [CONTENT_TYPES.PHONE]: "Text",
  [CONTENT_TYPES.BOOLEAN]: "Toggle",
  [CONTENT_TYPES.ENUM]: "Choice",
  [CONTENT_TYPES.STRUCTURED]: "Structured",
});

function splitContentKey(contentKey) {
  const parts = String(contentKey || "")
    .split(".")
    .filter(Boolean);
  return {
    pageKey: parts[0] || "other",
    sectionKey: parts[1] || parts[0] || "other",
    fieldKey: parts.slice(2).join(".") || parts[1] || parts[0] || contentKey,
  };
}

function pageLabelFor(template, pageKey) {
  const pages = (template && template.pages) || [];
  const found = pages.find((p) => p && (p.key === pageKey || p.pageKey === pageKey));
  if (found && (found.label || found.title)) return found.label || found.title;
  const pretty = String(pageKey || "other")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return pretty === "Other" ? "Other" : `${pretty} Page`;
}

function fieldLabelFor(template, contentKey) {
  const def = getContentKeyDef(template, contentKey);
  if (def && (def.description || def.label)) return def.description || def.label;
  const parts = splitContentKey(contentKey);
  const raw = parts.fieldKey || contentKey;
  return String(raw)
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function typeLabelFor(contentType) {
  return TYPE_LABELS[contentType] || "Field";
}

function relativeSavedLabel(updatedAt, now) {
  if (!updatedAt) return "Saved to draft";
  const then = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(then.getTime())) return "Saved to draft";
  const current = now instanceof Date ? now : now ? new Date(now) : new Date();
  const diffMs = Math.max(0, current.getTime() - then.getTime());
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Saved just now";
  if (mins < 60) return `Saved ${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Saved ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Saved yesterday";
  if (days < 7) return `Saved ${days} days ago`;
  return "Saved earlier";
}

function textPreview(presented) {
  if (!presented) return "";
  if (presented.kind === "text" || presented.kind === "boolean" || presented.kind === "structured") {
    const t = String(presented.text || "");
    return t.length > 180 ? `${t.slice(0, 177)}…` : t;
  }
  if (presented.kind === "url" || presented.kind === "video") {
    return presented.url || "";
  }
  if (presented.kind === "image") {
    return presented.alt || (presented.empty ? "(no image)" : "Image");
  }
  return "";
}

/**
 * Build page-grouped unpublished changes panel model from authorized diffs.
 *
 * @param {object} input
 * @param {object[]} input.changes
 * @param {object} [input.template]
 * @param {boolean} [input.canPublish]
 * @param {boolean} [input.canEdit]
 * @param {boolean} [input.canRevert] — true when safe field discard exists
 * @param {string|null} [input.previewHref]
 * @param {string|null} [input.publishPath]
 * @param {string|null} [input.discardPath]
 * @param {object[]} [input.pages] — editor pages with editHref
 * @param {Date|string} [input.now]
 */
function presentUnpublishedChangesPanel(input) {
  const changes = Array.isArray(input && input.changes) ? input.changes : [];
  const template =
    (input && input.template) ||
    (input && input.templateId
      ? getWebsiteTemplate(input.templateId, input.templateVersion)
      : null);
  const canPublish = input && input.canPublish === true;
  const canEdit = input && input.canEdit !== false;
  // Safe field revert is available via contentService.discardWebsiteDraft.
  const canRevert = canEdit && input && input.canRevert !== false && Boolean(input.discardPath);
  const pagesByKey = new Map();
  for (const page of (input && input.pages) || []) {
    if (page && page.key) pagesByKey.set(String(page.key), page);
  }
  const now = (input && input.now) || new Date();

  const items = changes
    .map((change) => {
      const contentKey = String((change && change.contentKey) || "").trim();
      if (!contentKey) return null;
      const def = getContentKeyDef(template, contentKey);
      const parts = splitContentKey(contentKey);
      const pageKey = (def && def.group) || parts.pageKey;
      const contentType = (change && change.contentType) || (def && def.type) || CONTENT_TYPES.SHORT_TEXT;
      const live = presentValue(change.oldValue, contentType);
      const draft = presentValue(change.proposedValue, contentType);
      const isMedia = contentType === CONTENT_TYPES.IMAGE || contentType === CONTENT_TYPES.VIDEO_URL;
      const page = pagesByKey.get(pageKey);
      return {
        contentKey,
        pageKey,
        pageLabel: pageLabelFor(template, pageKey),
        pageIcon: (page && page.icon) || PAGE_ICONS[pageKey] || "description",
        sectionKey: parts.sectionKey,
        fieldKey: parts.fieldKey,
        fieldLabel: fieldLabelFor(template, contentKey),
        contentType,
        typeLabel: typeLabelFor(contentType),
        changeType: (change && change.changeType) || "changed",
        saveStatusLabel: relativeSavedLabel(change && change.updatedAt, now),
        updatedAt: (change && change.updatedAt) || null,
        live,
        draft,
        liveText: textPreview(live),
        draftText: textPreview(draft),
        isMedia,
        editHref: (page && page.editHref) || null,
        canOpenEditor: true,
        canRevert,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const page = String(a.pageLabel).localeCompare(String(b.pageLabel));
      if (page) return page;
      return String(a.contentKey).localeCompare(String(b.contentKey));
    });

  const groupMap = new Map();
  for (const item of items) {
    if (!groupMap.has(item.pageKey)) {
      groupMap.set(item.pageKey, {
        pageKey: item.pageKey,
        pageLabel: item.pageLabel,
        pageIcon: item.pageIcon,
        editHref: item.editHref,
        items: [],
      });
    }
    groupMap.get(item.pageKey).items.push(item);
  }
  const groups = [...groupMap.values()].map((g) => ({
    ...g,
    changeCount: g.items.length,
    changeCountLabel: g.items.length === 1 ? "1 change" : `${g.items.length} changes`,
  }));

  const pendingChangeCount = items.length;
  const empty = pendingChangeCount < 1;

  return {
    stitchProjectId: STITCH_PROJECT_ID,
    stitchScreenId: STITCH_PANEL_SCREEN,
    pendingChangeCount,
    title: empty
      ? "Unpublished Changes"
      : `Unpublished Changes (${pendingChangeCount})`,
    empty,
    emptyTitle: "No unpublished changes",
    emptyBody:
      "Your draft matches the live website. Edit a field to see it listed here before publishing.",
    draftSafeBadge: "Draft Safe",
    visitorsLine: "Visitors see live version",
    reassurance:
      "Edits remain completely private to your admin team. Nothing on your live website updates until you confirm publishing.",
    statusReadyLabel: "Ready for public visitors",
    statusPendingLabel: empty
      ? "0 pending edits"
      : pendingChangeCount === 1
        ? "1 pending edit verified"
        : `${pendingChangeCount} pending edits verified`,
    groups,
    items,
    canPublish,
    canEdit,
    canRevert,
    // Never show a destructive Revert UI when field restore is unavailable.
    showRevert: canRevert,
    previewHref: (input && input.previewHref) || null,
    publishPath: canPublish ? (input && input.publishPath) || null : null,
    discardPath: canRevert ? (input && input.discardPath) || null : null,
    previewLabel: "Preview",
    publishLabel:
      canPublish && pendingChangeCount > 0
        ? `Publish All (${pendingChangeCount}) Changes`
        : canPublish
          ? "Publish All Changes"
          : null,
    showPreview: Boolean(input && input.previewHref),
    showPublish: canPublish && Boolean(input && input.publishPath),
  };
}

function escapeAttr(value) {
  return escapeHtml(String(value == null ? "" : value));
}

module.exports = {
  STITCH_PANEL_SCREEN,
  STITCH_PROJECT_ID,
  TYPE_LABELS,
  splitContentKey,
  pageLabelFor,
  fieldLabelFor,
  typeLabelFor,
  relativeSavedLabel,
  presentUnpublishedChangesPanel,
  escapeAttr,
};
