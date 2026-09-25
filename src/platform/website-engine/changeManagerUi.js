"use strict";

/**
 * V2.01 Website Change Manager — toolbar + publishing reminder presentation helpers.
 * Pending counts are distinct draft-vs-published fields (never Save operations).
 * No organization switcher. Preview never auto-publishes.
 */

const REMINDER_THRESHOLD = 5;
const STITCH_PROJECT_ID = "12538817760086591589";
const STITCH_TOOLBAR_SCREEN = "863c719271a242e696406112b9f80ee9";
const STITCH_REMINDER_SCREEN = "d9f101c607e3469b84fdbcdcd6d0c062";
const STITCH_PANEL_SCREEN = "d205f226463c4e38b797b4757338404e";

const SAVE_STATUS = Object.freeze({
  IDLE: "idle",
  SAVING: "saving",
  UPLOADING: "uploading",
  SAVED: "saved",
  FAILED: "failed",
});

const SAVE_STATUS_LABELS = Object.freeze({
  [SAVE_STATUS.IDLE]: "",
  [SAVE_STATUS.SAVING]: "Saving…",
  [SAVE_STATUS.UPLOADING]: "Uploading…",
  [SAVE_STATUS.SAVED]: "Drafts saved",
  [SAVE_STATUS.FAILED]: "Save failed",
});

function normalizePendingCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function publishButtonLabel(unpublishedCount, baseLabel) {
  const n = normalizePendingCount(unpublishedCount);
  let base = String(baseLabel || "Publish").trim() || "Publish";
  // Idempotent when applyChangeManagerToolbar runs more than once.
  base = base.replace(/\s*\(\d+\)\s*$/, "").trim() || "Publish";
  if (n < 1) return base;
  return `${base} (${n})`;
}

function pendingChangesPillLabel(unpublishedCount) {
  const n = normalizePendingCount(unpublishedCount);
  if (n === 1) return "1 unpublished change";
  return `${n} unpublished changes`;
}

function reminderShouldOffer(unpublishedCount, opts) {
  const n = normalizePendingCount(unpublishedCount);
  if (n < REMINDER_THRESHOLD) return false;
  if (opts && opts.saving) return false;
  if (opts && opts.uploading) return false;
  if (opts && opts.dismissedForToday) return false;
  if (opts && opts.suppressedUntilCountChanges && opts.lastShownAtCount === n) {
    return false;
  }
  return true;
}

function reminderCopy(unpublishedCount) {
  const n = normalizePendingCount(unpublishedCount);
  return {
    title: "Your website is taking shape!",
    pendingBadge: `${n} pending edits`,
    pendingBadgeSuffix: "saved to draft",
    bodyLead: `You have ${n} saved change${n === 1 ? "" : "s"} waiting to go live.`,
    body:
      `You have ${n} saved change${n === 1 ? "" : "s"} waiting to go live. ` +
      "Your visitors are still seeing the previous version. Would you like to preview your updates?",
    peaceOfMind:
      "Your drafts are securely saved and won't go live until you publish them.",
    previewCta: "Preview Changes",
    keepEditingCta: "Keep Editing",
    dontShowToday: "Don't show this reminder again today",
    dismiss: "Dismiss",
    compactNav:
      `${n} unpublished changes — preview when you are ready. Publishing is never automatic.`,
    safeDraftBadge: "BlessBoard & ActiveClinic v2.01 • SafeDraft Protection",
  };
}

/**
 * localStorage key scoped to one website for "don't show again today".
 * @param {string} websiteScopeKey
 * @param {string|Date} [now]
 */
function reminderDismissTodayKey(websiteScopeKey, now) {
  const scope = String(websiteScopeKey || "website")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 120) || "website";
  const d = now instanceof Date ? now : now ? new Date(now) : new Date();
  const day = Number.isNaN(d.getTime())
    ? "unknown"
    : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate()
      ).padStart(2, "0")}`;
  return `gp_cm_reminder_hide_${scope}_${day}`;
}

function reminderSuppressKey(websiteScopeKey) {
  const scope = String(websiteScopeKey || "website")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 120) || "website";
  return `gp_cm_reminder_suppress_${scope}`;
}

/**
 * Whether the save-status UI may show the "Drafts saved" confirmation.
 * Never during pending or failed saves/uploads.
 */
function mayShowSavedStatus(status) {
  return String(status || "") === SAVE_STATUS.SAVED;
}

function saveStatusLabel(status) {
  const key = String(status || SAVE_STATUS.IDLE);
  return SAVE_STATUS_LABELS[key] != null ? SAVE_STATUS_LABELS[key] : "";
}

function websiteScopeKeyFor(productCode, organizationId, instanceId) {
  const product = String(productCode || "product")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40) || "product";
  const org = String(organizationId || "org")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64) || "org";
  const instance = String(instanceId || "website")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64) || "website";
  return `${product}:${org}:${instance}`;
}

/**
 * Attach Change Manager UI facts onto an editor shell model.
 * @param {object} shell
 * @param {object} [facts]
 */
function applyChangeManagerToolbar(shell, facts) {
  const base = shell && typeof shell === "object" ? { ...shell } : {};
  const unpublishedCount = normalizePendingCount(
    facts && facts.unpublishedCount != null ? facts.unpublishedCount : base.unpublishedCount
  );
  const canPublish = base.canPublish === true;
  const websiteScopeKey = String(
    (facts && facts.websiteScopeKey) ||
      base.websiteScopeKey ||
      websiteScopeKeyFor(
        base.productCode,
        (facts && facts.organizationId) || base.organizationId,
        (facts && facts.instanceId) || base.instanceId
      )
  );
  const copy = reminderCopy(unpublishedCount);
  base.unpublishedCount = unpublishedCount;
  base.websiteScopeKey = websiteScopeKey;
  base.instanceId = (facts && facts.instanceId) || base.instanceId || null;
  base.organizationId = (facts && facts.organizationId) || base.organizationId || null;
  base.changeManager = {
    stitchProjectId: STITCH_PROJECT_ID,
    stitchToolbarScreen: STITCH_TOOLBAR_SCREEN,
    stitchReminderScreen: STITCH_REMINDER_SCREEN,
    stitchPanelScreen: STITCH_PANEL_SCREEN,
    reminderThreshold: REMINDER_THRESHOLD,
    pendingPillLabel: pendingChangesPillLabel(unpublishedCount),
    publishLabel: canPublish
      ? publishButtonLabel(unpublishedCount, (base.labels && base.labels.publish) || "Publish")
      : null,
    showPendingPill: unpublishedCount > 0,
    showHistory: Boolean(base.historyHref),
    showPreview: Boolean(base.previewHref),
    showPublish: canPublish && Boolean(base.publishHref || base.publishPath),
    showUnpublishedPanel: true,
    unpublishedChangesUrl: base.unpublishedChangesUrl || null,
    reminder: {
      threshold: REMINDER_THRESHOLD,
      enabled: unpublishedCount >= REMINDER_THRESHOLD,
      websiteScopeKey,
      dismissTodayKey: reminderDismissTodayKey(websiteScopeKey),
      suppressKey: reminderSuppressKey(websiteScopeKey),
      copy,
      previewHref: base.previewHref || null,
      // Preview CTA must never submit publish.
      previewOnly: true,
    },
  };
  if (base.labels) {
    base.labels = {
      ...base.labels,
      publish: canPublish
        ? publishButtonLabel(unpublishedCount, base.labels.publish || "Publish")
        : base.labels.publish || "Publish",
    };
  }
  base.publishLabel = canPublish
    ? publishButtonLabel(unpublishedCount, base.publishLabel || "Publish")
    : base.publishLabel || "Publish";
  return base;
}

module.exports = {
  REMINDER_THRESHOLD,
  STITCH_PROJECT_ID,
  STITCH_TOOLBAR_SCREEN,
  STITCH_REMINDER_SCREEN,
  STITCH_PANEL_SCREEN,
  SAVE_STATUS,
  SAVE_STATUS_LABELS,
  normalizePendingCount,
  publishButtonLabel,
  pendingChangesPillLabel,
  reminderShouldOffer,
  reminderCopy,
  reminderDismissTodayKey,
  reminderSuppressKey,
  mayShowSavedStatus,
  saveStatusLabel,
  websiteScopeKeyFor,
  applyChangeManagerToolbar,
};
