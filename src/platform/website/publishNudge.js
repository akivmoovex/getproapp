"use strict";

/**
 * V2.05 Task 5 — PublishNudge
 * Shared non-blocking publish reminder driven by Change Manager unpublished counts.
 * Count = distinct draft-vs-published content keys (meaningful saved mutations).
 * Keystrokes never increment. Publishing is never forced.
 */

const {
  REMINDER_THRESHOLD,
  normalizePendingCount,
  pendingChangesPillLabel,
  reminderShouldOffer,
  reminderSuppressKey,
  reminderDismissTodayKey,
  websiteScopeKeyFor,
} = require("../website-engine/changeManagerUi");

const PUBLISH_NUDGE = Object.freeze({
  pattern: "PublishNudge",
  threshold: REMINDER_THRESHOLD,
  countsKeystrokes: false,
  countsMeaningfulSavesOnly: true,
  source: "change_manager_draft_vs_published",
  forcesPublish: false,
  blocking: false,
  surfaces: Object.freeze(["admin_console_website", "website_editor"]),
});

/**
 * Session-scoped dismiss key (sessionStorage). Once dismissed, the nudge stays
 * hidden for the rest of the browser session even if more edits land.
 * @param {string} websiteScopeKey
 */
function publishNudgeSessionDismissKey(websiteScopeKey) {
  const scope = String(websiteScopeKey || "website")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 120) || "website";
  return `gp_cm_publish_nudge_session_${scope}`;
}

function publishNudgeTitle(unpublishedCount) {
  const n = normalizePendingCount(unpublishedCount);
  return `You have ${n} unpublished change${n === 1 ? "" : "s"}.`;
}

function publishNudgeCopy(unpublishedCount) {
  const n = normalizePendingCount(unpublishedCount);
  return {
    title: publishNudgeTitle(n),
    body:
      "Review and publish when you are ready. Your visitors still see the live site until you publish.",
    peaceOfMind:
      "Your drafts are securely saved and won't go live until you publish them.",
    reviewChangesCta: "Review Changes",
    previewCta: "Preview",
    publishCta: "Publish",
    dismissCta: "Dismiss",
    keepEditingCta: "Keep Editing",
    dontShowToday: "Don't show this reminder again today",
    pendingBadge: pendingChangesPillLabel(n),
    pendingBadgeSuffix: "waiting to go live",
    compactNav: `${n} unpublished changes — preview when you are ready. Publishing is never automatic.`,
    safeDraftBadge: "BlessBoard & ActiveClinic • SafeDraft Protection",
  };
}

/**
 * Whether PublishNudge should surface for this count + dismissal state.
 * @param {number} unpublishedCount
 * @param {object} [opts]
 */
function shouldShowPublishNudge(unpublishedCount, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  if (o.sessionDismissed === true) return false;
  return reminderShouldOffer(unpublishedCount, o);
}

/**
 * Build shared PublishNudge presentation from Change Manager pending count.
 * @param {object} input
 */
function buildPublishNudge(input) {
  const opts = input && typeof input === "object" ? input : {};
  const unpublishedChangeCount = normalizePendingCount(
    opts.unpublishedChangeCount != null
      ? opts.unpublishedChangeCount
      : opts.unpublishedCount != null
        ? opts.unpublishedCount
        : opts.draftChangesCount
  );
  const productCode = opts.productCode || null;
  const websiteScopeKey = String(
    opts.websiteScopeKey ||
      websiteScopeKeyFor(productCode, opts.organizationId, opts.instanceId)
  );
  const canPublish = opts.canPublish === true;
  const previewHref = opts.previewHref || null;
  const publishHref = canPublish ? opts.publishHref || opts.publishPath || null : null;
  const reviewHref = opts.reviewHref || opts.changeManagerHref || null;
  const copy = publishNudgeCopy(unpublishedChangeCount);
  const atOrAboveThreshold = unpublishedChangeCount >= REMINDER_THRESHOLD;

  return {
    pattern: PUBLISH_NUDGE.pattern,
    threshold: REMINDER_THRESHOLD,
    unpublishedChangeCount,
    continuousCountLabel: pendingChangesPillLabel(unpublishedChangeCount),
    visible: atOrAboveThreshold,
    enabled: atOrAboveThreshold,
    forcesPublish: false,
    countsKeystrokes: false,
    countsMeaningfulSavesOnly: true,
    source: PUBLISH_NUDGE.source,
    websiteScopeKey,
    sessionDismissKey: publishNudgeSessionDismissKey(websiteScopeKey),
    dismissTodayKey: reminderDismissTodayKey(websiteScopeKey),
    suppressKey: reminderSuppressKey(websiteScopeKey),
    copy,
    title: copy.title,
    actions: {
      reviewChanges: {
        label: copy.reviewChangesCta,
        href: reviewHref,
        opensPanel: !reviewHref,
      },
      preview: {
        label: copy.previewCta,
        href: previewHref,
        publishes: false,
      },
      publish: {
        label: copy.publishCta,
        href: publishHref,
        forcesPublish: false,
        available: Boolean(publishHref),
      },
      dismiss: {
        label: copy.dismissCta,
        sessionOnly: true,
      },
    },
  };
}

/**
 * Attach PublishNudge onto a WebsiteManagementHub model (shared continuous count).
 * @param {object} hub
 * @param {object} [opts]
 */
function attachPublishNudgeToHub(hub, opts) {
  const base = hub && typeof hub === "object" ? { ...hub } : {};
  const status = base.status && typeof base.status === "object" ? { ...base.status } : {};
  const modules = Array.isArray(base.modules) ? base.modules : [];
  const changeManagerMod = modules.find((m) => m && m.key === "changeManager");
  const previewMod = modules.find((m) => m && m.key === "preview");
  const publishMod = modules.find((m) => m && m.key === "publish");
  const o = opts && typeof opts === "object" ? opts : {};
  const count = normalizePendingCount(
    o.unpublishedChangeCount != null
      ? o.unpublishedChangeCount
      : status.draftChangesCount
  );
  const nudge = buildPublishNudge({
    productCode: base.productCode || o.productCode,
    organizationId: o.organizationId,
    instanceId: o.instanceId,
    websiteScopeKey: o.websiteScopeKey,
    unpublishedChangeCount: count,
    // Explicit canPublish=false must win — do not infer publish from a leftover module href.
    canPublish:
      o.canPublish === true
        ? true
        : o.canPublish === false
          ? false
          : Boolean(publishMod && publishMod.href),
    previewHref: o.previewHref || (previewMod && previewMod.href) || null,
    publishHref:
      o.canPublish === false
        ? null
        : o.publishHref || (publishMod && publishMod.href) || null,
    reviewHref:
      o.reviewHref || (changeManagerMod && changeManagerMod.href) || null,
  });
  status.draftChangesCount = count;
  status.unpublishedChangeCount = count;
  status.continuousUnpublishedCount = count;
  base.status = status;
  base.publishNudge = nudge;
  return base;
}

module.exports = {
  PUBLISH_NUDGE,
  REMINDER_THRESHOLD,
  normalizePendingCount,
  publishNudgeSessionDismissKey,
  publishNudgeTitle,
  publishNudgeCopy,
  shouldShowPublishNudge,
  buildPublishNudge,
  attachPublishNudgeToHub,
};
