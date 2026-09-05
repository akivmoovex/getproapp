"use strict";

/**
 * Shared website version history view model (Wave 4B-1).
 */

const VERSION_STATUS = Object.freeze({
  LIVE: "live",
  HISTORICAL: "historical",
  DRAFT: "draft",
});

const NOTICE_MESSAGES = Object.freeze({
  restored_draft:
    "Restored as a new draft. The published website is unchanged. Review the draft, then publish when you are ready.",
  published: "Website published.",
});

const ERROR_MESSAGES = Object.freeze({
  website_version_not_found: "That version is no longer available.",
  tenant_mismatch: "That version is not available for this website.",
  forbidden: "You do not have permission to restore versions.",
  restore_failed: "Restore failed. Try again.",
  csrf: "Your session expired. Refresh the page and try again.",
});

function formatWhen(value) {
  if (!value) return "";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return String(value).slice(0, 16).replace("T", " ");
  }
}

function noticeMessage(code) {
  const key = String(code || "").trim();
  return NOTICE_MESSAGES[key] || null;
}

function errorMessage(code) {
  const key = String(code || "").trim();
  return ERROR_MESSAGES[key] || (key ? key.replace(/_/g, " ") : null);
}

/**
 * @param {object} version
 * @returns {object}
 */
function mapVersionRow(version, input) {
  const row = version && typeof version === "object" ? version : {};
  const statusRaw = String(row.status || "").trim().toLowerCase();
  const isLive = statusRaw === "published";
  const versionNumber = Number(row.versionNumber) || 0;
  const id = String(row.id || "");
  const previewHref =
    typeof input.previewHrefFor === "function" ? input.previewHrefFor(id) : null;
  const restoreHref =
    typeof input.restoreHrefFor === "function" ? input.restoreHrefFor(id) : null;
  return {
    id,
    versionNumber,
    referenceLabel: versionNumber ? `v${versionNumber}` : "—",
    status: isLive ? VERSION_STATUS.LIVE : VERSION_STATUS.HISTORICAL,
    statusRaw,
    isLive,
    publishedAt: row.publishedAt || null,
    publishedAtLabel: formatWhen(row.publishedAt),
    moderationStatus: row.moderationStatus || row.status || "",
    changeCount: Number(row.changeCount) || 0,
    previewHref,
    restoreHref,
    canRestore: Boolean(input.canRestore && !isLive && restoreHref),
  };
}

/**
 * @param {{
 *   productCode?: string,
 *   siteLabel?: string,
 *   versions?: Array<object>,
 *   unpublishedCount?: number,
 *   canRestore?: boolean,
 *   backHref?: string|null,
 *   previewHrefFor?: (versionId: string) => string|null,
 *   restoreHrefFor?: (versionId: string) => string|null,
 *   notice?: string|null,
 *   error?: string|null,
 *   csrfField?: string|null,
 *   csrfToken?: string|null,
 * }} input
 */
function buildHistoryView(input) {
  const opts = input && typeof input === "object" ? input : {};
  const versions = Array.isArray(opts.versions) ? opts.versions.filter(Boolean) : [];
  const unpublishedCount = Number(opts.unpublishedCount) || 0;
  const publishedRows = versions
    .filter((v) => {
      const status = String(v.status || "").trim().toLowerCase();
      return status === "published" || status === "superseded";
    })
    .map((v) => mapVersionRow(v, opts));

  const draftRow =
    unpublishedCount > 0
      ? {
          status: VERSION_STATUS.DRAFT,
          referenceLabel: "Draft",
          publishedAtLabel: "Unpublished working copy",
          changeCount: unpublishedCount,
          isLive: false,
          canRestore: false,
        }
      : null;

  return {
    productCode: String(opts.productCode || ""),
    siteLabel: String(opts.siteLabel || "Website"),
    pageTitle: "Version history",
    backHref: opts.backHref ? String(opts.backHref) : null,
    backLabel: "Back to editor",
    notice: noticeMessage(opts.notice),
    error: errorMessage(opts.error),
    csrfField: opts.csrfField || "_csrf",
    csrfToken: opts.csrfToken || "",
    unpublishedCount,
    draftRow,
    versions: publishedRows,
    hasVersions: publishedRows.length > 0,
    emptyMessage: "No published versions yet. Publish the website to create version 1.",
    intro:
      "Public visitors see the current published version only. Restore copies a historical version into a new draft. The live website does not change until you publish.",
    restoreConfirmTitle: "Restore as new draft?",
    restoreConfirmBody:
      "This copies the selected version into your draft. The live published website stays unchanged until you publish.",
    restoreConfirmAction: "Restore as draft",
  };
}

module.exports = {
  VERSION_STATUS,
  NOTICE_MESSAGES,
  ERROR_MESSAGES,
  formatWhen,
  noticeMessage,
  errorMessage,
  buildHistoryView,
};
