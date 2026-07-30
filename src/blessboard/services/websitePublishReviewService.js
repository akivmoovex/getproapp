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
  publicBranchHomePath,
  hqPreviewPagePath,
  hqContentPagePath,
  hqWebsitePublishReviewPath,
  hqWebsitePublishPath,
  hqWebsiteBranchDetailsPath,
  hqBranchPreviewPagePath,
  hqBranchContentPagePath,
  hqWebsiteBranchBasePath,
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
  NOT_FOUND: "not_found",
  EMPTY: "empty",
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
  schema_incomplete:
    "Website publication schema is incomplete. Apply pending migrations and retry.",
  lookup_error: "Publication review could not load website readiness. Try again shortly.",
});

const GAP_TO_CODE = Object.freeze({
  contact_method: "contact",
  service_times: "service_times",
  required_pages: "incomplete",
  organization_name: "incomplete",
  first_branch: "incomplete",
  website_suspended: "org_inactive",
  lookup_error: "lookup_error",
  public_hostname: "incomplete",
  custom_domain_entitlement: "incomplete",
});

const ISSUE_META = Object.freeze({
  contact: {
    title: "Missing contact details",
    explanation: "Add a public email or phone number so visitors can reach this church.",
    fieldKey: "contact",
    sectionKey: "details",
  },
  service_times: {
    title: "Missing service times",
    explanation: "Add at least one service time before publishing.",
    fieldKey: "service_times",
    sectionKey: "home",
    pageKey: "home",
  },
  images: {
    title: "Invalid image reference",
    explanation: "A required image is missing or empty.",
    fieldKey: "media",
    sectionKey: null,
  },
  incomplete: {
    title: "Incomplete website details",
    explanation: "Required website information is missing.",
    fieldKey: "details",
    sectionKey: null,
  },
  preview: {
    title: "Preview confirmation required",
    explanation: "Review the website preview, then confirm before publishing.",
    fieldKey: "preview",
    sectionKey: null,
  },
  mobile_preview: {
    title: "Mobile preview confirmation required",
    explanation: "Confirm you have checked the mobile preview.",
    fieldKey: "mobile_preview",
    sectionKey: null,
  },
  pending_review: {
    title: "Branch update awaiting approval",
    explanation: "A branch change must be approved before it can be published.",
    fieldKey: "approval",
    sectionKey: null,
  },
  conflict: {
    title: "Unresolved edit conflict",
    explanation: "Resolve conflicting drafts before publishing.",
    fieldKey: "conflict",
    sectionKey: null,
  },
  org_inactive: {
    title: "Organization not active",
    explanation: "This website cannot be published while the organization is suspended.",
    fieldKey: "status",
    sectionKey: null,
  },
  schema_incomplete: {
    title: "Publication schema incomplete",
    explanation:
      "Branch-scoped publication versions are not available. Apply pending BlessBoard migrations and retry.",
    fieldKey: "schema",
    sectionKey: null,
  },
  lookup_error: {
    title: "Readiness check unavailable",
    explanation: "Website readiness could not be evaluated. Try again shortly.",
    fieldKey: "readiness",
    sectionKey: null,
  },
  validation: {
    title: "Website details need attention",
    explanation: "Review the blocking issues below, then try publishing again.",
    fieldKey: "details",
    sectionKey: null,
  },
  not_ready: {
    title: "Website is not ready to publish",
    explanation: "Resolve the listed issues before publishing.",
    fieldKey: "details",
    sectionKey: null,
  },
  draft: {
    title: "Draft unavailable",
    explanation: "The draft to publish is no longer available.",
    fieldKey: "draft",
    sectionKey: null,
  },
  permission: {
    title: "Publishing permission changed",
    explanation: "You no longer have permission to publish this website.",
    fieldKey: "permission",
    sectionKey: null,
  },
  confirm: {
    title: "Confirmation required",
    explanation: "Confirm publishing before continuing.",
    fieldKey: "confirm",
    sectionKey: null,
  },
});

/**
 * @param {string} text
 * @returns {string|null}
 */
function classifyErrorCode(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return null;
  if (/schema is incomplete|branch-scoped publication|column .* does not exist/.test(t)) {
    return "schema_incomplete";
  }
  if (/publication review could not load|could not be evaluated|lookup/.test(t)) {
    return "lookup_error";
  }
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
    push(GAP_TO_CODE[gap] || (gap === "lookup_error" ? "lookup_error" : "incomplete"));
  }
  for (const err of (input && input.errors) || []) {
    push(classifyErrorCode(err));
  }
  if (input && input.reason === "confirm_publish") push("confirm");
  if (input && input.reason === "not_ready") push("not_ready");
  if (input && input.reason === "schema_incomplete") push("schema_incomplete");
  if (!codes.length && input && (input.errors || []).length) push("validation");
  return codes;
}

/**
 * @param {{
 *   code: string,
 *   message?: string|null,
 *   branchKey?: string|null,
 *   branchName?: string|null,
 *   pageKey?: string|null,
 *   sectionKey?: string|null,
 *   fieldKey?: string|null,
 *   severity?: string,
 * }} input
 */
function buildBlockingIssue(input) {
  const code = String((input && input.code) || "validation");
  const meta = ISSUE_META[code] || ISSUE_META.validation;
  const branchKey = input.branchKey || null;
  const pageKey = input.pageKey || meta.pageKey || null;
  const sectionKey =
    input.sectionKey != null ? input.sectionKey : meta.sectionKey;
  const fieldKey = input.fieldKey || meta.fieldKey || null;

  let editUrl = "/hq/settings";
  if (code === "service_times") {
    editUrl = branchKey
      ? `/hq/website/branches/${encodeURIComponent(branchKey)}/service-times`
      : hqContentPagePath("home");
  } else if (code === "contact" || code === "incomplete" || code === "not_ready") {
    editUrl = branchKey
      ? hqWebsiteBranchDetailsPath(branchKey) || hqContentPagePath("home")
      : "/hq/settings";
  } else if (code === "images" || code === "draft") {
    editUrl = branchKey
      ? hqBranchContentPagePath(branchKey, pageKey || "home") || hqContentPagePath("home")
      : hqContentPagePath(pageKey || "home");
  } else if (code === "preview" || code === "mobile_preview") {
    editUrl = branchKey
      ? hqBranchPreviewPagePath(branchKey, "home") || hqPreviewPagePath("home")
      : hqPreviewPagePath("home");
  } else if (code === "pending_review" || code === "conflict") {
    editUrl = "/hq/website/change-submissions";
  } else if (branchKey) {
    editUrl = hqWebsiteBranchDetailsPath(branchKey) || hqWebsiteBranchBasePath(branchKey);
  }

  return {
    code,
    severity: input.severity || "blocking",
    title: meta.title,
    explanation: input.message || meta.explanation,
    message: input.message || FRIENDLY_ERROR_BY_CODE[code] || meta.explanation,
    pageKey,
    pageTitle: pageKey ? PAGE_KEY_TITLES[pageKey] || pageKey : null,
    sectionKey,
    fieldKey,
    branchKey,
    branchName: input.branchName || null,
    editUrl,
    currentValue: null,
    missing: true,
  };
}

/**
 * Build actionable blocking issues from validation + readiness (single source of truth).
 * @param {{
 *   validation?: object|null,
 *   readiness?: object|null,
 *   branchKey?: string|null,
 *   branchName?: string|null,
 * }} opts
 */
function buildBlockingIssues(opts) {
  const validation = (opts && opts.validation) || {};
  const readiness = (opts && opts.readiness) || {};
  const branchKey = opts && opts.branchKey ? String(opts.branchKey) : null;
  const branchName = opts && opts.branchName ? String(opts.branchName) : null;
  const issues = [];
  const seen = new Set();

  function pushIssue(partial) {
    const code = String(partial.code || "validation");
    if (seen.has(code)) return;
    seen.add(code);
    issues.push(
      buildBlockingIssue({
        ...partial,
        code,
        branchKey,
        branchName,
      })
    );
  }

  if (validation.reason === "schema_incomplete") {
    pushIssue({
      code: "schema_incomplete",
      message: (validation.errors && validation.errors[0]) || null,
    });
  }

  const publishable = Boolean(validation.publishable);

  // Readiness gaps only block when publication itself is not publishable.
  // Warnings / deferred gaps must not invent blockers against a ready validator.
  if (!publishable || readiness.ready === false) {
    for (const gap of readiness.gaps || []) {
      const code = GAP_TO_CODE[gap] || (gap === "lookup_error" ? "lookup_error" : "incomplete");
      pushIssue({ code, message: FRIENDLY_ERROR_BY_CODE[code] || `Readiness gap: ${gap}` });
    }
  }

  for (const err of validation.errors || []) {
    pushIssue({
      code: classifyErrorCode(err) || "validation",
      message: String(err),
    });
  }

  // Failed checks that correspond to hard errors only (skip advisory image warnings).
  const blockingCheckKeys = new Set([
    "contact",
    "required_content",
    "preview",
    "mobile_preview",
    "conflicts",
    "unapproved_submissions",
    "tenant_active",
    "hq_direct_publish",
  ]);
  for (const check of validation.checks || []) {
    if (check && check.ok === false && check.key && blockingCheckKeys.has(check.key)) {
      const keyMap = {
        contact: "contact",
        required_content: "incomplete",
        preview: "preview",
        mobile_preview: "mobile_preview",
        conflicts: "conflict",
        unapproved_submissions: "pending_review",
        tenant_active: "org_inactive",
        hq_direct_publish: "permission",
      };
      const code = keyMap[check.key] || "validation";
      pushIssue({
        code,
        message: check.label || FRIENDLY_ERROR_BY_CODE[code],
      });
    }
  }

  if (!publishable && issues.length === 0) {
    pushIssue({
      code: "not_ready",
      message: "Website is not ready to publish. Review draft changes for blocking issues.",
    });
  }
  if (readiness.ok === false && issues.length === 0) {
    pushIssue({ code: "lookup_error" });
  }
  if (readiness.ready === false && issues.length === 0) {
    pushIssue({ code: "not_ready" });
  }

  return issues;
}

/**
 * @param {object} validation
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
 *   branchId?: string|null,
 *   branchKey?: string|null,
 *   branchName?: string|null,
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
  const branchId =
    opts && opts.branchId != null && String(opts.branchId).trim()
      ? String(opts.branchId).trim()
      : null;
  const branchKey =
    opts && opts.branchKey != null && String(opts.branchKey).trim()
      ? String(opts.branchKey).trim()
      : null;
  const branchName =
    opts && opts.branchName != null && String(opts.branchName).trim()
      ? String(opts.branchName).trim()
      : null;

  if (!versionRepo.isUuid(organizationId) || !versionRepo.isUuid(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }
  if (branchId && !versionRepo.isUuid(branchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "branch_id" };
  }

  const reviewPath = hqWebsitePublishReviewPath(branchKey);
  const publishPath = hqWebsitePublishPath(branchKey);
  const overviewPath = branchKey
    ? hqWebsiteBranchBasePath(branchKey) || "/hq/website"
    : "/hq/website";
  const editPath = branchKey
    ? hqWebsiteBranchDetailsPath(branchKey) || hqContentPagePath("home")
    : "/hq/content";
  const detailsPath = branchKey
    ? hqWebsiteBranchDetailsPath(branchKey) || editPath
    : "/hq/settings";
  const previewPath = branchKey
    ? hqBranchPreviewPagePath(branchKey, "home") || hqPreviewPagePath("home")
    : hqPreviewPagePath("home");

  try {
    // Sequential: avoid interleaved queries if a shared client is passed.
    const validation = await validateWebsitePublication(db, {
      organizationId,
      churchId,
      branchId,
      actorUserId: opts.actorUserId || null,
      deferServiceTimes: Boolean(opts.deferServiceTimes),
      mobilePreviewConfirmed: Boolean(opts.mobilePreviewConfirmed),
      env: opts.env,
    });
    const readiness = await evaluatePublishReadiness(db, {
      churchId,
      deferServiceTimes: Boolean(opts.deferServiceTimes),
      env: opts.env,
    });

    // Schema / infra failure: still render a review shell with actionable blockers
    // instead of an empty 503 page.
    if (!validation.ok && validation.status === "lookup_error") {
      const blockingIssues = buildBlockingIssues({
        validation: {
          ...validation,
          publishable: false,
          reason: validation.reason || "lookup_error",
        },
        readiness: { ok: false, ready: false, gaps: ["lookup_error"] },
        branchKey,
        branchName,
      });
      return {
        ok: true,
        status: STATUS.OK,
        stitchScreen: "Phase4 - Publish Website Review",
        title: branchKey ? "Publish Branch Website Changes?" : "Publish Website Changes?",
        subtitle: branchKey
          ? `Review what will become visible on ${branchName || "this branch"} website`
          : "Review what will become visible on your public website",
        publishable: false,
        draftStatusLabel: "Needs attention",
        changeSummary: {
          items: [],
          fallbackMessage: "Publication review could not finish loading.",
          pagesChanged: [],
          sectionsChanged: 0,
          imagesChanged: false,
          branchesAffected: branchName ? [branchName] : [],
          pageCount: 0,
        },
        readinessChecks: [],
        blockingIssues,
        approvedSubmissions: [],
        affectedBranches: branchName ? [branchName] : [],
        currentPublication: null,
        proposedPublication: { hasDraft: false },
        warnings: [],
        errors: blockingIssues.map((i) => i.message),
        errorCodes: blockingIssues.map((i) => i.code),
        previewAcknowledged: false,
        requirePreviewCheckbox: false,
        requireMobileCheckbox: false,
        previewPath,
        publicPath: branchKey
          ? publicBranchHomePath(opts.organizationKey, branchKey)
          : publicChurchHomePath(opts.organizationKey),
        overviewPath,
        editPath,
        detailsPath,
        reviewPath,
        publishPath,
        planKey: "unknown",
        scope: {
          organizationId,
          churchId,
          branchId,
          branchKey,
          branchName,
          scopeType: branchId ? "branch" : "church",
        },
        emptyState: null,
        validation,
        readiness,
      };
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
    const blockingIssues = buildBlockingIssues({
      validation,
      readiness,
      branchKey,
      branchName,
    });
    const humanErrors =
      blockingIssues.length > 0
        ? blockingIssues.map((i) => i.message)
        : messagesForCodes(errorCodes);
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

    const publishable = Boolean(validation.publishable);
    const draftStatusLabel = publishable
      ? "Ready to publish"
      : humanErrors.length
        ? "Needs attention"
        : "Draft changes";

    const hasDraftSignal = Boolean(
      changeSummary.pageCount ||
        approved.length ||
        (summary.proposedVersionNumber != null && summary.currentLiveVersion)
    );

    let emptyState = null;
    if (!hasDraftSignal && publishable) {
      emptyState = {
        type: "empty",
        heading: "No reviewable draft changes",
        body: branchKey
          ? "There is no unpublished branch website draft to review for this scope."
          : "There is no unpublished church website draft to review right now.",
        primaryHref: overviewPath,
        primaryLabel: "Return to Website",
      };
    }

    return {
      ok: true,
      status: STATUS.OK,
      stitchScreen: "Phase4 - Publish Website Review",
      title: branchKey ? "Publish Branch Website Changes?" : "Publish Website Changes?",
      subtitle: branchKey
        ? `Review what will become visible on ${branchName || "this branch"} website`
        : "Review what will become visible on your public website",
      publishable,
      draftStatusLabel,
      changeSummary,
      readinessChecks,
      blockingIssues,
      approvedSubmissions: approved.map((s) => ({
        id: s.id,
        title: s.title,
        branchName: s.branchName || s.branchKey || "Branch",
        approvedBy: s.reviewedByName || null,
        approvedAt: s.reviewedAt || s.updatedAt || null,
        areasAffected: s.pageKey ? [PAGE_KEY_TITLES[s.pageKey] || s.pageKey] : [],
        href: `/hq/website/change-submissions/${s.id}`,
      })),
      affectedBranches: changeSummary.branchesAffected.length
        ? changeSummary.branchesAffected
        : branchName
          ? [branchName]
          : [],
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
      errorCodes: blockingIssues.map((i) => i.code).length
        ? blockingIssues.map((i) => i.code)
        : errorCodes,
      previewAcknowledged: Boolean(readiness && readiness.previewAcknowledged),
      requirePreviewCheckbox: requirePreview,
      requireMobileCheckbox: requireMobile,
      previewPath,
      publicPath: branchKey
        ? publicBranchHomePath(orgKey, branchKey)
        : publicChurchHomePath(orgKey),
      overviewPath,
      editPath,
      detailsPath,
      reviewPath,
      publishPath,
      planKey,
      scope: {
        organizationId,
        churchId,
        branchId,
        branchKey,
        branchName,
        scopeType: branchId ? "branch" : "church",
      },
      emptyState,
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
 *   branchKey?: string|null,
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
    version = await versionRepo.getCurrentPublishedVersion(db, organizationId, null);
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
  const branchKey = opts.branchKey || null;

  return {
    ok: true,
    status: STATUS.OK,
    stitchScreen: "Phase4 - Website Published",
    title: branchKey
      ? "Your branch website has been published."
      : "Your church website has been published.",
    publishedAt: version && version.publishedAt,
    publishedByName:
      (version && version.publishedByName) || opts.publishedByName || null,
    pagesUpdated: pageCount != null && Number.isFinite(pageCount) ? pageCount : null,
    branchesAffected: branches,
    publicationNote: summary.publicationNote || null,
    publicPath: branchKey
      ? publicBranchHomePath(orgKey, branchKey)
      : publicChurchHomePath(orgKey),
    overviewPath: branchKey
      ? hqWebsiteBranchBasePath(branchKey) || "/hq/website"
      : "/hq/website",
    editPath: branchKey
      ? hqWebsiteBranchDetailsPath(branchKey) || "/hq/content"
      : "/hq/content",
    recentChangesPath:
      planKey === "growth" ? "/hq/website/recent-changes" : null,
    showGrowthRecoveryNote: planKey === "growth" && historyExists,
    showFoundationUndoNote: false,
    showUndoAction: false,
  };
}

/**
 * @param {{ codes?: string[], liveUnchanged?: boolean, branchKey?: string|null }} opts
 */
function prepareWebsitePublishError(opts) {
  const codes = Array.isArray(opts && opts.codes) ? opts.codes : [];
  const branchKey = opts && opts.branchKey ? String(opts.branchKey) : null;
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
    previewPath: branchKey
      ? hqBranchPreviewPagePath(branchKey, "home") || hqPreviewPagePath("home")
      : hqPreviewPagePath("home"),
    overviewPath: branchKey
      ? hqWebsiteBranchBasePath(branchKey) || "/hq/website"
      : "/hq/website",
    reviewPath: hqWebsitePublishReviewPath(branchKey),
    editPath: branchKey
      ? hqWebsiteBranchDetailsPath(branchKey) || "/hq/content"
      : "/hq/content",
    detailsPath: branchKey
      ? hqWebsiteBranchDetailsPath(branchKey)
      : "/hq/settings",
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
  buildBlockingIssues,
  buildBlockingIssue,
};
