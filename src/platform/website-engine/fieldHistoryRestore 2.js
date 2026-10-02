"use strict";

/**
 * V2.01 Field History and Restore presentation (Stitch Screen 4).
 * Choices are only offered when real history exists — never fabricated.
 * Previously-saved draft revisions are unavailable unless stored (they are not).
 */

const { CONTENT_TYPES } = require("../website/contentTypes");
const { presentValue } = require("../website/reviewDiff");
const contentService = require("../website/contentService");
const { getContentKeyDef } = require("../website/templateRegistry");

const STITCH_PROJECT_ID = "12538817760086591589";
const STITCH_HISTORY_SCREEN = "06f6fb0423eb47808b0227564ae48458";

const CHOICE = Object.freeze({
  UNDO_CURRENT_EDIT: "undo_current_edit",
  PREVIOUSLY_SAVED: "previously_saved",
  CURRENTLY_PUBLISHED: "currently_published",
  EARLIER_PUBLISHED: "earlier_published",
  CURRENT_DRAFT: "current_draft",
});

function formatPublishedAt(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function humanizeContentKey(contentKey) {
  const parts = String(contentKey || "")
    .split(".")
    .filter(Boolean);
  const raw = parts.slice(2).join(".") || parts[parts.length - 1] || contentKey || "Field";
  return String(raw)
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Prefer template description/label; never surface raw dotted keys in the sheet title.
 */
function resolveFieldLabel(input, contentKey) {
  const explicit = input && input.fieldLabel != null ? String(input.fieldLabel).trim() : "";
  if (explicit && explicit !== contentKey) return explicit;
  const template = input && input.template;
  if (template && contentKey) {
    const def = getContentKeyDef(template, contentKey);
    if (def && (def.description || def.label)) {
      return String(def.description || def.label).trim();
    }
  }
  return humanizeContentKey(contentKey);
}

function previewQuote(preview) {
  if (!preview) return "";
  if (preview.isMedia) {
    if (preview.src) return "Image attached";
    if (preview.text) return String(preview.text).slice(0, 120);
    return preview.empty ? "(empty)" : "";
  }
  const text = String(preview.text || "").trim();
  if (!text) return preview.empty ? "(empty)" : "";
  return text.length > 140 ? text.slice(0, 137) + "…" : text;
}

function previewFor(value, contentType) {
  const presented = presentValue(value, contentType || CONTENT_TYPES.SHORT_TEXT);
  const isMedia =
    contentType === CONTENT_TYPES.IMAGE || contentType === CONTENT_TYPES.VIDEO_URL;
  return {
    presented,
    isMedia,
    text:
      presented.kind === "text" ||
      presented.kind === "boolean" ||
      presented.kind === "structured"
        ? String(presented.text || "").slice(0, 240)
        : presented.url || presented.alt || "",
    src: presented.src || presented.url || null,
    empty: Boolean(presented.empty),
  };
}

/**
 * Build restore choices from authorized field history + live content row.
 * @param {object} input
 * @param {object} input.history — listFieldHistory result
 * @param {object|null} input.row — website_content row
 * @param {boolean} [input.canEdit]
 * @param {object} [input.mediaAvailability] map choiceId → { ok, code }
 */
function presentFieldHistoryRestore(input) {
  const history = (input && input.history) || {};
  const row = (input && input.row) || null;
  const canEdit = input && input.canEdit === true;
  const contentKey = String(history.contentKey || (row && row.contentKey) || "").trim();
  const fieldLabel = resolveFieldLabel(input, contentKey);
  const contentType =
    history.contentType || (row && row.contentType) || CONTENT_TYPES.SHORT_TEXT;
  const supports = history.supportsFieldHistory !== false;
  const mediaAvailability = (input && input.mediaAvailability) || {};

  const draftValue = row ? row.draftValue : null;
  const publishedValue = row ? row.publishedValue : null;
  const hasPending =
    row != null && !contentService.valuesEqual(draftValue, publishedValue);
  const draftUpdatedAt = row && row.updatedAt ? row.updatedAt : null;

  const draftPreview = previewFor(draftValue, contentType);
  const publishedPreview = previewFor(publishedValue, contentType);

  const publishedEntries = (history.entries || []).filter(
    (e) => e && e.kind === "published_version"
  );
  const earlierPublished = publishedEntries
    .slice()
    .sort((a, b) => Number(a.versionNumber) - Number(b.versionNumber))
    .slice(0, -1)
    .reverse();

  const choices = [];

  // Current draft (active, not a restore target).
  if (hasPending) {
    choices.push({
      id: CHOICE.CURRENT_DRAFT,
      choice: CHOICE.CURRENT_DRAFT,
      label: "Current Draft (Unpublished)",
      subtitle: "Current Working Draft",
      detail: "Currently active on your editor canvas",
      previewQuote: previewQuote(draftPreview),
      available: true,
      restorable: false,
      active: true,
      value: draftValue,
      preview: draftPreview,
      updatedAt: draftUpdatedAt,
    });
  }

  choices.push({
    id: CHOICE.UNDO_CURRENT_EDIT,
    choice: CHOICE.UNDO_CURRENT_EDIT,
    label: "Undo current edit",
    subtitle: "Restore the live published value to draft",
    detail: hasPending
      ? "Discards the unpublished draft for this field only"
      : "No unpublished edit to undo",
    previewQuote: hasPending ? previewQuote(publishedPreview) : "",
    available: hasPending && supports,
    restorable: hasPending && supports && canEdit,
    unavailableReason: hasPending
      ? supports
        ? null
        : "Field history is not supported for this content type"
      : "No unpublished edit to undo",
    value: publishedValue,
    preview: publishedPreview,
  });

  choices.push({
    id: CHOICE.PREVIOUSLY_SAVED,
    choice: CHOICE.PREVIOUSLY_SAVED,
    label: "Previously saved",
    subtitle: "Prior draft revision",
    detail: "Prior draft history is not available for this field",
    previewQuote: "",
    available: false,
    restorable: false,
    unavailableReason:
      "Prior draft history is not stored for this field. Only published versions and the current draft are available.",
    value: null,
    preview: null,
  });

  choices.push({
    id: CHOICE.CURRENTLY_PUBLISHED,
    choice: CHOICE.CURRENTLY_PUBLISHED,
    label: "Currently published",
    subtitle: "Live on website",
    detail: publishedValue == null && !hasPending
      ? "No published value yet"
      : "Published value visitors see now",
    previewQuote: previewQuote(publishedPreview),
    available: supports && (publishedValue != null || hasPending || row != null),
    restorable: canEdit && supports,
    unavailableReason: supports
      ? null
      : "Field history is not supported for this content type",
    value: publishedValue,
    preview: publishedPreview,
    publishedAt: null,
  });

  for (const entry of earlierPublished) {
    const choiceId = `${CHOICE.EARLIER_PUBLISHED}:${entry.versionId}`;
    const preview = previewFor(entry.newValue, entry.contentType || contentType);
    const media = mediaAvailability[choiceId];
    const mediaOk = !media || media.ok !== false;
    choices.push({
      id: choiceId,
      choice: CHOICE.EARLIER_PUBLISHED,
      versionId: entry.versionId,
      versionNumber: entry.versionNumber,
      label: "Earlier published version",
      subtitle: entry.versionNumber != null ? `Version ${entry.versionNumber}` : "Earlier publish",
      detail: formatPublishedAt(entry.publishedAt) || "Earlier published snapshot",
      previewQuote: previewQuote(preview),
      available: supports && mediaOk,
      restorable: canEdit && supports && mediaOk,
      unavailableReason: !supports
        ? "Field history is not supported for this content type"
        : !mediaOk
          ? "Historical media is unavailable or no longer owned by this website"
          : null,
      value: entry.newValue,
      preview,
      publishedAt: entry.publishedAt,
      immutable: true,
    });
  }

  const restorableChoices = choices.filter((c) => c.restorable);
  return {
    stitchProjectId: STITCH_PROJECT_ID,
    stitchScreenId: STITCH_HISTORY_SCREEN,
    contentKey,
    fieldLabel,
    title: fieldLabel ? `Field History: ${fieldLabel}` : "Field History",
    contentType,
    supportsFieldHistory: supports,
    canEdit,
    expectedUpdatedAt: draftUpdatedAt,
    hasPendingChanges: hasPending,
    draftPreview,
    publishedPreview,
    compareLabel: "Draft vs Live",
    reassurance:
      "Select a version to compare. Restoring replaces your draft — it will not auto-publish to your live website until you choose to publish.",
    draftSafeNotice: "Draft safe & ready to compare. All changes are non-destructive.",
    confirmLabel: "Restore This Version to Draft (Does Not Publish)",
    confirmHint: 'Your live website remains untouched until you click "Publish".',
    choices,
    restorableCount: restorableChoices.length,
    emptyHistory: !hasPending && earlierPublished.length === 0 && publishedValue == null,
    emptyHistoryMessage:
      "No field history is available yet. Publish at least once or save a draft change to compare versions.",
  };
}

module.exports = {
  STITCH_PROJECT_ID,
  STITCH_HISTORY_SCREEN,
  CHOICE,
  presentFieldHistoryRestore,
  previewFor,
  previewQuote,
  formatPublishedAt,
  humanizeContentKey,
  resolveFieldLabel,
};
