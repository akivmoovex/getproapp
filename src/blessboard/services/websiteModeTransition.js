"use strict";

/**
 * Website-mode transitions when active branch count crosses the single/multi boundary.
 *
 * Policy (smallest safe behavior — no conversion wizard, no bulk copy, no CMS merge):
 *
 *   single_site → multi_site (active count 0|1 → 2+)
 *     - Church-wide CMS remains the HQ website (unchanged).
 *     - Existing branch-scoped rows stay untouched.
 *     - New/activated branches use existing provisioning only (no HQ content copy).
 *     - Do not auto-publish branch websites.
 *
 *   multi_site → single_site (active count 2+ → 0|1)
 *     - Church-wide CMS remains the only public website.
 *     - Branch-scoped content, drafts, submissions, versions, governance, and audit
 *       are preserved (status change only).
 *     - Public branch URLs for the remaining active branch redirect church-wide
 *       (existing single-site routing).
 *     - Do not merge branch content into HQ.
 *
 * Active count must always come from server-trusted church scope.
 */

const { WEBSITE_MODE } = require("./resolveWebsiteMode");

const TRANSITION = Object.freeze({
  NONE: "none",
  TO_MULTI_SITE: "to_multi_site",
  TO_SINGLE_SITE: "to_single_site",
});

/** Query-param codes for concise HQ notices (authorized HQ surfaces only). */
const NOTICE = Object.freeze({
  BRANCH_WEBSITES_AVAILABLE: "branch_websites_available",
  SINGLE_SITE_RESTORED: "single_site_restored",
});

const NOTICE_MESSAGES = Object.freeze({
  [NOTICE.BRANCH_WEBSITES_AVAILABLE]:
    "Independent branch websites are now available. Your church-wide site remains the HQ website — existing HQ content was not copied. Open Branch Websites from the Website menu to manage each campus.",
  [NOTICE.SINGLE_SITE_RESTORED]:
    "Your public website is again a single church-wide site. Existing branch website content was preserved and is not shown publicly.",
});

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeActiveCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * @param {number} activeCount
 */
function modeForActiveCount(activeCount) {
  return activeCount >= 2 ? WEBSITE_MODE.MULTI_SITE : WEBSITE_MODE.SINGLE_SITE;
}

/**
 * Pure transition detection from trusted previous/next active counts.
 *
 * @param {{
 *   previousActiveCount?: number|null,
 *   nextActiveCount?: number|null,
 * }} input
 */
function detectWebsiteModeTransition(input) {
  const previousActiveCount = normalizeActiveCount(
    input && input.previousActiveCount
  );
  const nextActiveCount = normalizeActiveCount(input && input.nextActiveCount);
  const fromMode = modeForActiveCount(previousActiveCount);
  const toMode = modeForActiveCount(nextActiveCount);

  let kind = TRANSITION.NONE;
  let noticeCode = null;
  if (fromMode === WEBSITE_MODE.SINGLE_SITE && toMode === WEBSITE_MODE.MULTI_SITE) {
    kind = TRANSITION.TO_MULTI_SITE;
    noticeCode = NOTICE.BRANCH_WEBSITES_AVAILABLE;
  } else if (
    fromMode === WEBSITE_MODE.MULTI_SITE &&
    toMode === WEBSITE_MODE.SINGLE_SITE
  ) {
    kind = TRANSITION.TO_SINGLE_SITE;
    noticeCode = NOTICE.SINGLE_SITE_RESTORED;
  }

  return {
    crossed: kind !== TRANSITION.NONE,
    kind,
    fromMode,
    toMode,
    previousActiveCount,
    nextActiveCount,
    noticeCode,
    /** Explicit policy flags for callers/tests — never imply CMS mutation. */
    policy: {
      copyHqContentToBranch: false,
      mergeBranchContentIntoHq: false,
      deleteBranchScopedContent: false,
      autoPublishBranchWebsite: false,
      preserveBranchScopedContent: true,
      churchWideRemainsHqOrPublicSite: true,
    },
  };
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
function parseWebsiteModeNoticeCode(raw) {
  const code = String(raw || "").trim();
  if (code === NOTICE.BRANCH_WEBSITES_AVAILABLE || code === NOTICE.SINGLE_SITE_RESTORED) {
    return code;
  }
  return null;
}

/**
 * @param {string|null|undefined} noticeCode
 * @returns {string|null}
 */
function websiteModeNoticeMessage(noticeCode) {
  if (!noticeCode) return null;
  return NOTICE_MESSAGES[noticeCode] || null;
}

/**
 * Append notice query param when a transition crossed the boundary.
 * @param {string} basePath
 * @param {ReturnType<typeof detectWebsiteModeTransition>|null|undefined} transition
 */
function appendWebsiteModeNoticeQuery(basePath, transition) {
  const base = String(basePath || "/hq/branches");
  if (!transition || !transition.crossed || !transition.noticeCode) {
    return base;
  }
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}website_mode_notice=${encodeURIComponent(transition.noticeCode)}`;
}

module.exports = {
  TRANSITION,
  NOTICE,
  NOTICE_MESSAGES,
  normalizeActiveCount,
  modeForActiveCount,
  detectWebsiteModeTransition,
  parseWebsiteModeNoticeCode,
  websiteModeNoticeMessage,
  appendWebsiteModeNoticeQuery,
};
