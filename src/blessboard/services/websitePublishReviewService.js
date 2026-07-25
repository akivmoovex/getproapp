"use strict";

/**
 * Phase4 Stage 2A — friendly publish-review aggregation over existing validation.
 */

const {
  validateWebsitePublication,
} = require("./websitePublicationValidationService");
const {
  evaluatePublishReadiness,
} = require("./churchWebsitePublishService");
const { PAGE_KEY_TITLES } = require("./publicContentConstants");
const versionRepo = require("../repositories/websitePublicationVersionRepository");
const {
  publicChurchHomePath,
  hqPreviewPagePath,
} = require("../urls/churchUrlHelper");

function normalizePlanKey(planKey) {
  const key = String(planKey || "")
    .trim()
    .toLowerCase();
  if (key === "foundation" || key === "free" || key === "starter") return "foundation";
  if (key === "growth" || key === "pro" || key === "standard") return "growth";
  if (
    key === "network" ||
    key === "enterprise" ||
    key === "professional" ||
    key === "partner"
  ) {
    return "network";
  }
  return "unknown";
}

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
});

const CHECK_STATE = Object.freeze({
  READY: "Ready",
  NEEDS_ATTENTION: "Needs Attention",
  CONFIRMATION_NEEDED: "Confirmation Needed",
});

const FRIENDLY_ERROR_BY_CODE = Object.freeze({
  contact: "Required contact details are missing",
  service_times: "Service times are missing",
  images: "A required image is unavailable",
  branch_approval: "A branch update is not approved",
  pending_review: "A branch update is not approved",
  conflict: "Someone updated this content while you were editing",
  incomplete: "Website information is incomplete",
  org_inactive: "The organization is not active",
  permission: "Your publishing permission changed",
  draft: "The draft is no longer available",
  preview: "Website preview confirmation is required",
  mobile_preview: "Mobile preview confirmation is required",
  confirm: "Confirm publishing before continuing.",
  validation: "Website information needs attention before publishing",
  not_ready: "Website information is incomplete",
});

const GAP_TO_CODE = Object.freeze({
  contact_method: "contact",
  service_times: "service_times",
  required_pages: "incomplete",
  organization_name: "incomplete",
  first_branch: "incomplete",
  website_suspended: "org_inactive",
});

/**
 * @param {string} text
 * @returns {string|null}
 */
function classifyErrorCode(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return null;
  if (/preview confirmation|preview is required|reviewed the website preview/.test(t)) {
    return "preview";
  }
  if (/mobile preview/.test(t)) return "mobile_preview";
  if (/conflict/.test(t)) return "conflict";
  if (/pending review|not approved|awaiting approval/.test(t)) return "pending_review";
  if (/image|media/.test(t)) return "images";
  if (/contact/.test(t)) return "contact";
  if (/service.?time/.test(t)) return "service_times";
  if (/suspend|not active|inactive/.test(t)) return "org_inactive";
  if (/permission/.test(t)) return "permission";
  if (/draft/.test(t)) return "draft";
  if (/confirm.?publish|confirm publishing/.test(t)) return "confirm";
  if (/readiness gap:\s*(\w+)/.test(t)) {
    const gap = t.match(/readiness gap:\s*(\w+)/)[1];
    return GAP_TO_CODE[gap] || "incomplete";
  }
  if (/incomplete|required content|not ready/.test(t)) return "incomplete";
  return "validation";
}

/**
 * @param {string[]} codes
 * @returns {string[]}
 */
function messagesForCodes(codes) {
  const out = [];
  const seen = new Set();
  for (const code of codes || []) {
    const key = String(code || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(FRIENDLY_ERROR_BY_CODE[key] || FRIENDLY_ERROR_BY_CODE.validation);
  }
  return out;
}

/**
 * @param {{ errors?: string[], gaps?: string[], reason?: string }} input
 * @returns {string[]}
 */
function collectErrorCodes(input) {
  const codes = [];
  const seen = new Set();
  function push(code) {
    if (!code || seen.has(code)) return;
    seen.add(code);
    codes.push(code);
  }
  for (const gap of (input && input.gaps) || []) {
    push(GAP_TO_CODE[gap] || "incomplete");
  }
  for (const err of (input && input.errors) || []) {
    push(classifyErrorCode(err));
  }
  if (input && input.reason === "confirm_publish") push("confirm");
  if (input && input.reason === "not_ready") push("not_ready");
  if (!codes.length && input && (input.errors || []).length) push("validation");
  return codes;
}

/**
 * @param {object} validation
 * @returns {{ items: object[], fallbackMessage: string|null, pagesChanged: string[], sectionsChanged: number, imagesChanged: boolean, branchesAffected: string[] }}
 */
function buildChangeSummary(validation) {
  const summary = (validation && validation.summary) || {};
  const pageTitles = summary.pageTitles || PAGE_KEY_TITLES;
  const pagesChanged = Array.isArray(summary.pagesChanged) ? summary.pagesChanged : [];
  const sectionsChanged = Number(summary.sectionsChanged || 0) || 0;
  const approved = Array.isArray(summary.approvedSubmissions)
    ? summary.approvedSubmissions
    : [];
  const items = [];

  for (const pageKey of pagesChanged) {
    const title = pageTitles[pageKey] || pageKey;
    items.push({
      icon: pageKey === "home" ? "home" : "edit_note",
      title: `${title} updated`,
      detail: "Unpublished website content is ready for review.",
    });
  }

  for (const sub of approved.slice(0, 8)) {
    items.push({
      icon: "location_on",
      title: sub.title || "Approved branch update included",
      detail: sub.branchName
        ? `${sub.branchName} · approved branch update`
        : "Approved branch update included",
      branchName: sub.branchName || null,
    });
  }

  if (summary.themeChanges) {
    items.push({
      icon: "palette",
      title: "Theme updated",
      detail: "The selected website theme will be published.",
    });
  }
  if (summary.navigationChanges) {
    items.push({
      icon: "menu",
      title: "Navigation item changed",
      detail: "Website navigation updates are included.",
    });
  }

  const hasReliable =
    pagesChanged.length > 0 || approved.length > 0 || sectionsChanged > 0;
  return {
    items: hasReliable ? items : [],
    fallbackMessage: hasReliable
      ? null
      : "Your website has unpublished changes ready for review.",
    pagesChanged,
    sectionsChanged,
    imagesChanged: false,
    branchesAffected: Array.isArray(summary.branchesAffected)
      ? summary.branchesAffected
      : [],
    pageCount: pagesChanged.length,
  };
}

/**
 * @param {object} validation
 */
function buildReadinessChecks(validation) {
  const checks = Array.isArray(validation && validation.checks)
    ? validation.checks
    : [];
  const labelMap = {
    required_content: "Required website information is complete",
    contact: "Contact details are available",
    images: "Required image references are valid",
    conflicts: "No unresolved editing conflicts",
    approved_submissions: "Included branch changes are approved",
    unapproved_submissions: "Included branch changes are approved",
    draft_exists: "A draft exists",
    tenant_active: "Organization is active",
    permission: "You have permission to publish",
    preview: "Website preview reviewed",
    mobile_preview: "Mobile preview reviewed",
  };

  return checks.map((c) => {
    const key = c.key;
    let state = c.ok ? CHECK_STATE.READY : CHECK_STATE.NEEDS_ATTENTION;
    if (!c.ok && (key === "preview" || key === "mobile_preview")) {
      state = CHECK_STATE.CONFIRMATION_NEEDED;
    }
    if (key === "unapproved_submissions" && !c.ok) {
      state = CHECK_STATE.NEEDS_ATTENTION;
    }
    if (key === "conflicts" && c.ok) {
      return {
        key,
        label: labelMap[key] || c.label,
        state: "None",
        ok: true,
        displayState: "None",
      };
    }
    return {
      key,
      label: labelMap[key] || c.label,
      state,
      ok: Boolean(c.ok),
      displayState: state,
    };
  });
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   actorUserId?: string|null,
 *   deferServiceTimes?: boolean,
 *   mobilePreviewConfirmed?: boolean,
 *   organizationKey?: string|null,
 *   env?: object,
 * }} opts
 */
async function prepareWebsitePublishReview(db, opts) {
  const organizationId = opts && opts.organizationId;
  const churchId = opts && opts.churchId;
  if (!versionRepo.isUuid(organizationId) || !versionRepo.isUuid(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }

  try {
    const [validation, readiness] = await Promise.all([
      validateWebsitePublication(db, {
        organizationId,
        churchId,
        actorUserId: opts.actorUserId || null,
        deferServiceTimes: Boolean(opts.deferServiceTimes),
        mobilePreviewConfirmed: Boolean(opts.mobilePreviewConfirmed),
        env: opts.env,
      }),
      evaluatePublishReadiness(db, {
        churchId,
        deferServiceTimes: Boolean(opts.deferServiceTimes),
        env: opts.env,
      }),
    ]);

    if (!validation.ok && validation.status === "lookup_error") {
      return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "validation" };
    }

    const summary = (validation && validation.summary) || {};
    const approved = Array.isArray(summary.approvedSubmissions)
      ? summary.approvedSubmissions
      : [];
    const changeSummary = buildChangeSummary(validation);
    const readinessChecks = buildReadinessChecks(validation);
    const errorCodes = collectErrorCodes({
      errors: validation.errors || [],
      gaps: (readiness && readiness.gaps) || [],
    });
    const humanErrors = messagesForCodes(errorCodes);
    const current = summary.currentLiveVersion || null;
    const orgKey =
      (readiness && readiness.organizationKey) || opts.organizationKey || null;
    const settings = validation.settings || {};
    const requirePreview =
      settings && settings.updatedAt
        ? settings.requirePreviewBeforePublish !== false
        : false;
    const requireMobile = Boolean(
      settings && settings.updatedAt && settings.requireMobilePreviewConfirmation
    );
    const planKey = normalizePlanKey(readiness && readiness.planKey);

    const draftStatusLabel = validation.publishable
      ? "Ready to publish"
      : humanErrors.length
        ? "Needs attention"
        : "Draft changes";

    return {
      ok: true,
      status: STATUS.OK,
      stitchScreen: "Phase4 - Publish Website Review",
      title: "Publish Website Changes?",
      subtitle: "Review what will become visible on your public website",
      publishable: Boolean(validation.publishable),
      draftStatusLabel,
      changeSummary,
      readinessChecks,
      approvedSubmissions: approved.map((s) => ({
        id: s.id,
        title: s.title,
        branchName: s.branchName || s.branchKey || "Branch",
        approvedBy: s.reviewedByName || null,
        approvedAt: s.reviewedAt || s.updatedAt || null,
        areasAffected: s.pageKey ? [PAGE_KEY_TITLES[s.pageKey] || s.pageKey] : [],
        href: `/hq/website/change-submissions/${s.id}`,
      })),
      affectedBranches: changeSummary.branchesAffected,
      currentPublication: current
        ? {
            publishedAt: current.publishedAt,
            publishedByName: current.publishedByName || null,
          }
        : null,
      proposedPublication: {
        hasDraft: Boolean(changeSummary.pageCount || approved.length),
      },
      warnings: (validation.warnings || []).map((w) => {
        const code = classifyErrorCode(w);
        return FRIENDLY_ERROR_BY_CODE[code] || String(w);
      }),
      errors: humanErrors,
      errorCodes,
      previewAcknowledged: Boolean(readiness && readiness.previewAcknowledged),
      requirePreviewCheckbox: requirePreview,
      requireMobileCheckbox: requireMobile,
      previewPath: hqPreviewPagePath("home"),
      publicPath: publicChurchHomePath(orgKey),
      overviewPath: "/hq/website",
      editPath: "/hq/content",
      planKey,
      validation,
      readiness,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "review" };
  }
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   organizationId: string,
 *   versionId?: string|null,
 *   organizationKey?: string|null,
 *   planKey?: string|null,
 *   publishedByName?: string|null,
 * }} opts
 */
async function prepareWebsitePublishSuccess(db, opts) {
  const organizationId = opts && opts.organizationId;
  if (!versionRepo.isUuid(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT };
  }
  let version = null;
  const versionId = opts.versionId ? String(opts.versionId).trim() : "";
  if (versionId && versionRepo.isUuid(versionId)) {
    version = await versionRepo.getVersionByOrgAndId(db, organizationId, versionId);
  }
  if (!version) {
    version = await versionRepo.getCurrentPublishedVersion(db, organizationId);
  }
  const summary = (version && version.changeSummary) || {};
  const pageCount =
    (summary.pagesChanged && summary.pagesChanged.length) ||
    (summary.pageCount != null ? Number(summary.pageCount) : null);
  const branches =
    Array.isArray(summary.branchesAffected) && summary.branchesAffected.length
      ? summary.branchesAffected
      : Array.isArray(summary.publishedSubmissionIds) &&
          summary.publishedSubmissionIds.length
        ? ["Branch updates included"]
        : [];
  const planKey = normalizePlanKey(opts.planKey);
  const historyExists = Boolean(version);
  const orgKey = opts.organizationKey || null;

  return {
    ok: true,
    status: STATUS.OK,
    stitchScreen: "Phase4 - Website Published",
    title: "Your church website has been published.",
    publishedAt: version && version.publishedAt,
    publishedByName:
      (version && version.publishedByName) || opts.publishedByName || null,
    pagesUpdated: pageCount != null && Number.isFinite(pageCount) ? pageCount : null,
    branchesAffected: branches,
    publicationNote: summary.publicationNote || null,
    publicPath: publicChurchHomePath(orgKey),
    overviewPath: "/hq/website",
    editPath: "/hq/content",
    recentChangesPath:
      planKey === "growth" ? "/hq/website/recent-changes" : null,
    showGrowthRecoveryNote: planKey === "growth" && historyExists,
    showFoundationUndoNote: false,
    showUndoAction: false,
  };
}

/**
 * @param {{ codes?: string[], liveUnchanged?: boolean }} opts
 */
function prepareWebsitePublishError(opts) {
  const codes = Array.isArray(opts && opts.codes) ? opts.codes : [];
  const problems = messagesForCodes(codes.length ? codes : ["validation"]);
  const needsEdit = codes.some((c) =>
    ["contact", "service_times", "images", "incomplete", "draft", "conflict", "pending_review"].includes(
      c
    )
  );
  const retrySafe = codes.every((c) =>
    ["preview", "mobile_preview", "confirm"].includes(c)
  );
  return {
    ok: true,
    status: STATUS.OK,
    stitchScreen: "Phase4 - Publish Website Error",
    title: "Your website was not published.",
    subtitle: "The live website has not changed.",
    liveUnchanged: opts && opts.liveUnchanged !== false,
    problems,
    errorCodes: codes,
    showFixProblems: needsEdit || !retrySafe,
    showTryAgain: retrySafe,
    previewPath: hqPreviewPagePath("home"),
    overviewPath: "/hq/website",
    reviewPath: "/hq/website/publish/review",
    editPath: "/hq/content",
  };
}

module.exports = {
  STATUS,
  CHECK_STATE,
  FRIENDLY_ERROR_BY_CODE,
  prepareWebsitePublishReview,
  prepareWebsitePublishSuccess,
  prepareWebsitePublishError,
  collectErrorCodes,
  messagesForCodes,
  classifyErrorCode,
};
