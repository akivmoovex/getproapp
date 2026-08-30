"use strict";

/**
 * Phase4 Stage 1 website overview aggregation (Foundation / Growth / Branch).
 * Friendly language only — no technical version terminology in presenters.
 */

const submissionRepo = require("../repositories/websiteChangeSubmissionRepository");
const versionRepo = require("../repositories/websitePublicationVersionRepository");
const publicContentRepo = require("../repositories/publicContentRepository");
const {
  evaluatePublishReadiness,
} = require("./churchWebsitePublishService");
const { validateWebsitePublication } = require("./websitePublicationValidationService");
const {
  getOrganizationOnboardingSummary,
} = require("./organizationOnboardingSummaryService");
const {
  listBranchSubmissions,
  STATUS_LABELS: RAW_SUBMISSION_LABELS,
} = require("./websiteChangeSubmissionService");
const { PUBLIC_PAGE_KEYS } = require("./publicContentConstants");
const {
  publicChurchHomePath,
  hqPreviewPagePath,
  hqWebsitePublishReviewPath,
} = require("../urls/churchUrlHelper");
const {
  PRODUCT_CODE,
  buildPublicWebsiteEditPath,
} = require("../../platform/website/publicWebsiteUrl");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
});

function blessboardPublicEditPath(organizationKey, fallback) {
  return (
    buildPublicWebsiteEditPath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey,
    }) || fallback
  );
}

const FRIENDLY_SUBMISSION_LABELS = Object.freeze({
  draft: "Draft",
  pending_review: "Waiting for Review",
  changes_requested: "Changes Requested",
  approved: "Approved",
  published: "Published",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
});

const FRIENDLY_WEBSITE_STATUS = Object.freeze({
  published: "Published",
  unpublished_changes: "Unpublished Changes",
  not_published: "Not Published",
  needs_attention: "Needs Attention",
});

const CHECKLIST_STATE = Object.freeze({
  complete: "Complete",
  needs_attention: "Needs Attention",
  not_started: "Not Started",
});

/**
 * @param {unknown} planKey
 * @returns {'foundation'|'growth'|'network'|'unknown'}
 */
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

/**
 * @param {string} status
 */
function friendlySubmissionLabel(status) {
  return FRIENDLY_SUBMISSION_LABELS[status] || RAW_SUBMISSION_LABELS[status] || String(status || "—");
}

/**
 * @param {{ websiteStatus?: string, ready?: boolean, gaps?: string[], hasDraftPages?: boolean, hasPublishedPages?: boolean }} input
 */
function resolveFriendlyWebsiteStatus(input) {
  const raw = String((input && input.websiteStatus) || "draft").toLowerCase();
  if (raw === "suspended") return FRIENDLY_WEBSITE_STATUS.needs_attention;
  if (input && input.gaps && input.gaps.length && !input.hasPublishedPages) {
    return FRIENDLY_WEBSITE_STATUS.needs_attention;
  }
  if (input && input.hasPublishedPages && input.hasDraftPages) {
    return FRIENDLY_WEBSITE_STATUS.unpublished_changes;
  }
  if (raw === "published" || (input && input.hasPublishedPages && !input.hasDraftPages)) {
    return FRIENDLY_WEBSITE_STATUS.published;
  }
  if (!input || !input.hasPublishedPages) return FRIENDLY_WEBSITE_STATUS.not_published;
  return FRIENDLY_WEBSITE_STATUS.unpublished_changes;
}

/**
 * @param {import('pg').Pool} db
 * @param {string} churchId
 */
async function inspectDraftPages(db, churchId) {
  let draftCount = 0;
  let publishedCount = 0;
  let lastEditedAt = null;
  const themeKey = "default";
  for (const pageKey of PUBLIC_PAGE_KEYS) {
    const page = await publicContentRepo.findPageByScope(db, {
      churchId,
      branchId: null,
      pageKey,
    });
    if (!page) continue;
    if (page.status === "draft") draftCount += 1;
    if (page.status === "published") publishedCount += 1;
    if (!lastEditedAt || new Date(page.updatedAt) > new Date(lastEditedAt)) {
      lastEditedAt = page.updatedAt;
    }
  }
  return {
    draftCount,
    publishedCount,
    hasDraftPages: draftCount > 0,
    hasPublishedPages: publishedCount > 0,
    lastEditedAt,
    themeKey,
  };
}

/**
 * Map onboarding checklist to Foundation-friendly setup items (no percentages).
 * @param {object|null} summary
 */
function mapFoundationChecklist(summary) {
  const byKey = new Map(
    ((summary && summary.checklist) || []).map((item) => [item.key, item])
  );
  const defs = [
    { key: "organization_details", label: "Church details", fallbackHref: "/hq/settings" },
    { key: "logo", label: "Logo or church name", fallbackHref: "/hq/settings" },
    { key: "contact_details", label: "Contact information", fallbackHref: "/hq/settings" },
    { key: "service_times", label: "Service times", fallbackHref: "/hq/content" },
    { key: "preview", label: "Homepage content", fallbackHref: "/hq/content" },
    { key: "publish", label: "Website published", fallbackHref: "/hq/website/publish/review" },
  ];
  return defs.map((def) => {
    const src = byKey.get(def.key);
    let state = CHECKLIST_STATE.not_started;
    if (src && src.completed) state = CHECKLIST_STATE.complete;
    else if (
      src &&
      !src.completed &&
      summary &&
      (summary.onboardingStatus === "in_progress" || summary.status === "in_progress")
    ) {
      state = CHECKLIST_STATE.needs_attention;
    }
    return {
      key: def.key,
      label: def.label,
      state,
      complete: state === CHECKLIST_STATE.complete,
      actionHref: (src && src.actionUrl) || def.fallbackHref,
      actionLabel: (src && src.actionLabel) || "Open",
    };
  });
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   organizationKey?: string|null,
 *   env?: object,
 * }} opts
 */
async function loadFoundationWebsiteOverview(db, opts) {
  const organizationId = opts && opts.organizationId;
  const churchId = opts && opts.churchId;
  if (!versionRepo.isUuid(organizationId) || !versionRepo.isUuid(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }

  try {
    const [readiness, validation, draftPages, publishedVersions, onboarding] =
      await Promise.all([
        evaluatePublishReadiness(db, {
          churchId,
          deferServiceTimes: true,
          env: opts.env,
        }),
        validateWebsitePublication(db, {
          organizationId,
          churchId,
          deferServiceTimes: true,
          env: opts.env,
        }),
        inspectDraftPages(db, churchId),
        versionRepo.listVersions(db, {
          organizationId,
          limit: 3,
        }),
        getOrganizationOnboardingSummary(db, {
          organizationId,
          organizationKey: opts.organizationKey || null,
          linkContext: "hq",
        }),
      ]);

    const orgKey =
      (readiness && readiness.organizationKey) || opts.organizationKey || null;
    const publicPath =
      (readiness && readiness.publicPath) || publicChurchHomePath(orgKey);
    const hasPublished =
      draftPages.hasPublishedPages ||
      String((readiness && readiness.websiteStatus) || "") === "published" ||
      ((publishedVersions.items || []).length > 0);
    const friendlyStatus = resolveFriendlyWebsiteStatus({
      websiteStatus: readiness && readiness.websiteStatus,
      ready: readiness && readiness.ready,
      gaps: readiness && readiness.gaps,
      hasDraftPages: draftPages.hasDraftPages,
      hasPublishedPages: hasPublished,
    });

    const currentPub = (publishedVersions.items || [])[0] || null;
    const previousPub = (publishedVersions.items || [])[1] || null;
    const undoEligible = Boolean(currentPub && previousPub);

    const publishReady = Boolean(validation && validation.ok && validation.publishable);
    const hasDraft = Boolean(
      draftPages.hasDraftPages ||
        (readiness && readiness.websiteStatus === "draft" && hasPublished)
    );

    return {
      ok: true,
      status: STATUS.OK,
      planKey: "foundation",
      stitchScreen: "Phase4 - Foundation Website Overview",
      title: "Church Website",
      subtitle: "Edit and publish your church website",
      editPath: blessboardPublicEditPath(orgKey, "/hq/content"),
      previewPath: hqPreviewPagePath("home"),
      publicPath,
      inlineEditPath: blessboardPublicEditPath(orgKey, "/hq/content"),
      cmsPath: "/hq/content",
      organizationKey: orgKey,
      liveAvailable: hasPublished,
      websiteStatusLabel: friendlyStatus,
      websitePublished: hasPublished,
      unpublishedNotice: !hasPublished
        ? "Website not published yet. Preview your draft, then publish when ready."
        : null,
      lastPublishedAt: currentPub && currentPub.publishedAt,
      lastPublishedByName: currentPub && currentPub.publishedByName,
      publishedVersionNumber: currentPub && currentPub.versionNumber,
      currentPub,
      themeKey: draftPages.themeKey || "default",
      hasUnpublishedChanges: hasDraft,
      publishReady,
      canPublish: publishReady && hasDraft,
      showFixDetails: !publishReady,
      publishReviewPath: hqWebsitePublishReviewPath(null),
      fixDetailsPath: hqWebsitePublishReviewPath(null),
      checklist: mapFoundationChecklist(onboarding && onboarding.summary),
      undoLastPublish: {
        eligible: undoEligible,
        enabled: undoEligible,
        href: undoEligible
          ? `/hq/website/version-history/${previousPub.id}/restore`
          : null,
        explanation: undoEligible
          ? null
          : "A previous published backup is not available yet.",
      },
      isEmptyWebsite: !hasPublished && !hasDraft && !(draftPages.publishedCount || draftPages.draftCount),
      readiness,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "foundation_overview" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   organizationKey?: string|null,
 *   env?: object,
 * }} opts
 */
async function loadGrowthWebsiteOverview(db, opts) {
  const organizationId = opts && opts.organizationId;
  const churchId = opts && opts.churchId;
  if (!versionRepo.isUuid(organizationId) || !versionRepo.isUuid(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }

  try {
    const [
      summary,
      pending,
      changesRequested,
      approved,
      recentSubs,
      publications,
      readiness,
      validation,
      draftPages,
      hqDraftSubs,
    ] = await Promise.all([
      submissionRepo.countStatusSummary(db, organizationId),
      submissionRepo.listSubmissions(db, {
        organizationId,
        status: "pending_review",
        limit: 5,
      }),
      submissionRepo.listSubmissions(db, {
        organizationId,
        status: "changes_requested",
        limit: 5,
      }),
      submissionRepo.listSubmissions(db, {
        organizationId,
        status: "approved",
        limit: 5,
      }),
      submissionRepo.listSubmissions(db, {
        organizationId,
        limit: 5,
      }),
      versionRepo.listPublishingHistory(db, {
        organizationId,
        limit: 5,
      }),
      evaluatePublishReadiness(db, {
        churchId,
        deferServiceTimes: true,
        env: opts.env,
      }),
      validateWebsitePublication(db, {
        organizationId,
        churchId,
        deferServiceTimes: true,
        env: opts.env,
      }),
      inspectDraftPages(db, churchId),
      submissionRepo.listSubmissions(db, {
        organizationId,
        status: "draft",
        limit: 1,
      }),
    ]);

    const orgKey =
      (readiness && readiness.organizationKey) || opts.organizationKey || null;
    const publicPath =
      (readiness && readiness.publicPath) || publicChurchHomePath(orgKey);
    const hasPublished =
      draftPages.hasPublishedPages ||
      String((readiness && readiness.websiteStatus) || "") === "published";
    const publishReady = Boolean(validation && validation.ok && validation.publishable);
    const hasHqDraft = Boolean(draftPages.hasDraftPages);

    const needsAttention = [];
    for (const item of pending.items || []) {
      needsAttention.push({
        type: "waiting_for_review",
        label: item.title,
        meta: item.branchName || item.submittedByName || "",
        href: `/hq/website/change-submissions/${item.id}`,
        actionLabel: "Review",
      });
    }
    for (const item of changesRequested.items || []) {
      needsAttention.push({
        type: "changes_requested",
        label: item.title,
        meta: item.branchName || "",
        href: `/hq/website/change-submissions/${item.id}`,
        actionLabel: "Review",
      });
    }
    for (const item of approved.items || []) {
      needsAttention.push({
        type: "ready_to_publish",
        label: item.title,
        meta: item.branchName || "",
        href: `/hq/website/change-submissions/${item.id}`,
        actionLabel: "Publish",
      });
    }
    if (hasHqDraft) {
      needsAttention.push({
        type: "unpublished_hq",
        label: "Unpublished HQ website changes",
        meta: "",
        href: "/hq/content",
        actionLabel: "Continue Editing",
      });
    }
    if (readiness && readiness.ok && !readiness.ready) {
      needsAttention.push({
        type: "validation",
        label: "Missing required website information",
        meta: "",
        href: hqWebsitePublishReviewPath(null),
        actionLabel: "Fix Details",
      });
    }

    const recentPublications = (publications.items || []).slice(0, 5).map((v) => {
      const pages =
        (v.changeSummary &&
          (v.changeSummary.pagesChanged || v.changeSummary.pageKeys)) ||
        [];
      const summaryText =
        Array.isArray(pages) && pages.length
          ? `Updated ${pages.length} page${pages.length === 1 ? "" : "s"}`
          : "Website publication";
      return {
        id: v.id,
        publishedAt: v.publishedAt,
        publishedByName: v.publishedByName || null,
        summary: summaryText,
        pagesAffected: Array.isArray(pages) ? pages.slice(0, 8) : [],
        previewHref: `/hq/website/recent-changes/${v.id}/preview`,
        restoreHref: `/hq/website/recent-changes/${v.id}/restore`,
        restoreAvailable: true,
      };
    });

    const restoredDraft = await versionRepo.getLatestDraftRestoration(db, organizationId);

    return {
      ok: true,
      status: STATUS.OK,
      planKey: "growth",
      stitchScreen: "Phase4 - Growth Website Workflow Overview",
      title: "Website Overview",
      subtitle: "Manage website updates from your church and branches",
      editPath: blessboardPublicEditPath(orgKey, "/hq/content"),
      previewPath: hqPreviewPagePath("home"),
      publicPath,
      inlineEditPath: blessboardPublicEditPath(orgKey, "/hq/content"),
      cmsPath: "/hq/content",
      liveAvailable: hasPublished,
      recentChangesPath: "/hq/website/recent-changes",
      lastPublishedAt: recentPublications[0] && recentPublications[0].publishedAt,
      lastPublishedByName: recentPublications[0] && recentPublications[0].publishedByName,
      publishedVersionNumber:
        (publications.items || [])[0] && (publications.items || [])[0].versionNumber,
      hasUnpublishedChanges: hasHqDraft,
      restoredDraft: restoredDraft
        ? {
            id: restoredDraft.id,
            href: "/hq/website/restored-draft",
            previewHref: hqPreviewPagePath("home"),
            editHref: "/hq/content",
            label: "A restored website draft is ready for review.",
          }
        : null,
      counts: {
        draftChanges: Number(hqDraftSubs.total) || (hasHqDraft ? 1 : 0),
        waitingForReview: summary.pendingReview || 0,
        changesRequested: summary.changesRequested || 0,
        readyToPublish: Number(approved.total) || 0,
      },
      needsAttention: needsAttention.slice(0, 8),
      draftPanel: {
        hasDraft: hasHqDraft,
        lastEditedAt: draftPages.lastEditedAt,
        lastEditedBy: null,
        themeKey: draftPages.themeKey || "default",
        summary: hasHqDraft
          ? "Unpublished website changes are available."
          : "There are no unpublished website changes.",
      },
      recentSubmissions: (recentSubs.items || []).slice(0, 5).map((s) => ({
        id: s.id,
        title: s.title,
        branchName: s.branchName || null,
        status: s.status,
        statusLabel: friendlySubmissionLabel(s.status),
        submittedByName: s.submittedByName || null,
        submittedAt: s.submittedAt,
        href: `/hq/website/change-submissions/${s.id}`,
      })),
      recentWebsiteChanges: recentPublications,
      publishReady,
      workflowGuide: ["Edit", "Submit", "Review", "Publish"],
      readiness,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "growth_overview" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   branchId: string,
 *   organizationKey?: string|null,
 *   branchDisplayName?: string|null,
 *   env?: object,
 * }} opts
 */
async function loadBranchWebsiteOverview(db, opts) {
  const organizationId = opts && opts.organizationId;
  const churchId = opts && opts.churchId;
  const branchId = opts && opts.branchId;
  if (
    !versionRepo.isUuid(organizationId) ||
    !versionRepo.isUuid(churchId) ||
    !versionRepo.isUuid(branchId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }

  try {
    // Enforce branch belongs to church/org
    const branchRes = await db.query(
      `SELECT b.id, b.display_name, b.status, b.church_id, c.organization_id
         FROM blessboard.branches b
         INNER JOIN blessboard.churches c ON c.id = b.church_id
        WHERE b.id = $1`,
      [branchId]
    );
    const branch = branchRes.rows[0];
    if (!branch) return { ok: false, status: STATUS.NOT_FOUND, reason: "branch" };
    if (String(branch.church_id) !== String(churchId)) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "branch_church" };
    }
    if (String(branch.organization_id) !== String(organizationId)) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "branch_org" };
    }

    const listed = await listBranchSubmissions(db, {
      organizationId,
      branchId,
    });
    if (!listed.ok) {
      return { ok: false, status: listed.status || STATUS.LOOKUP_ERROR, reason: listed.reason };
    }

    const items = listed.items || [];
    const history = items.slice(0, 5).map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      statusLabel: friendlySubmissionLabel(s.status),
      submittedAt: s.submittedAt || s.createdAt,
      latestSharedResponse: s.reviewerComment || null,
      href: `/branch-admin/website/submissions/${s.id}`,
    }));

    const activeDraft =
      items.find((s) => s.status === "draft" || s.status === "changes_requested") || null;
    const waiting =
      items.find((s) => s.status === "pending_review") || null;
    const approved =
      items.find((s) => s.status === "approved") || null;
    const published =
      items.find((s) => s.status === "published") || null;

    let contactEmail = null;
    let contactPhone = null;
    try {
      const settingsRes = await db.query(
        `SELECT *
           FROM blessboard.branch_settings
          WHERE branch_id = $1
          LIMIT 1`,
        [branchId]
      );
      const row = settingsRes.rows[0];
      if (row) {
        contactEmail = row.email || null;
        contactPhone = row.phone || null;
      }
    } catch (_err) {
      // keep null when schema differs
    }

    const orgKey = opts.organizationKey || null;
    const publicPath = orgKey ? publicChurchHomePath(orgKey) : "/";
    const visualEditPath = blessboardPublicEditPath(orgKey, "/branch-admin/content");

    let primaryState = "none";
    if (activeDraft && activeDraft.status === "changes_requested") primaryState = "changes_requested";
    else if (waiting) primaryState = "waiting";
    else if (activeDraft) primaryState = "draft";
    else if (approved) primaryState = "approved";
    else if (published) primaryState = "published";

    let websiteInitialization = {
      status: "not_started",
      autonomous: false,
      initializedAt: null,
    };
    try {
      const govRes = await db.query(
        `SELECT website_initialization_status, initialized_at
           FROM blessboard.branch_website_governance
          WHERE branch_id = $1
          LIMIT 1`,
        [branchId]
      );
      const govRow = govRes.rows[0];
      if (govRow) {
        websiteInitialization = {
          status: govRow.website_initialization_status || "not_started",
          autonomous: govRow.website_initialization_status === "completed",
          initializedAt: govRow.initialized_at || null,
        };
      }
    } catch {
      /* governance / migration may be absent */
    }

    return {
      ok: true,
      status: STATUS.OK,
      stitchScreen: "Phase4 - Branch Website Overview",
      title: "Branch Website",
      branchName: branch.display_name || opts.branchDisplayName || "Branch",
      subtitle: "Update information shown for your branch",
      editPath: visualEditPath,
      previewPath: "/branch-admin/content/preview/home",
      websiteAutonomyMessage: websiteInitialization.autonomous
        ? "This branch website was initialized from the HQ website and is now independently editable."
        : null,
      websiteInitialization,
      submitPath: "/branch-admin/website/submit",
      overviewPath: "/branch-admin/website/overview",
      publicPath,
      branchPage: {
        statusLabel: branch.status === "active" ? "Active" : String(branch.status || "—"),
        publicUrl: publicPath,
        lastUpdated: activeDraft && activeDraft.updatedAt
          ? activeDraft.updatedAt
          : published && published.updatedAt
            ? published.updatedAt
            : null,
        contactEmail,
        contactPhone,
        serviceTimesHint: null,
      },
      draft: activeDraft
        ? {
            id: activeDraft.id,
            title: activeDraft.title,
            status: activeDraft.status,
            statusLabel: friendlySubmissionLabel(activeDraft.status),
            lastSavedAt: activeDraft.updatedAt || activeDraft.createdAt,
            lastSavedBy: activeDraft.submittedByName || null,
            pageKey: activeDraft.pageKey || null,
            href: `/branch-admin/website/submissions/${activeDraft.id}`,
            resubmitHref: `/branch-admin/website/submit?submission=${activeDraft.id}`,
            reviewerName: activeDraft.reviewedByName || null,
            reviewedAt: activeDraft.reviewedAt || null,
            reviewerComment: activeDraft.reviewerComment || null,
          }
        : null,
      primaryState,
      history,
      canApprove: false,
      canPublish: false,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "branch_overview" };
  }
}

/**
 * Resolve which HQ overview to render from effective plan.
 * @param {import('pg').Pool} db
 * @param {{ churchId: string, organizationId: string, organizationKey?: string|null, env?: object }} opts
 */
async function loadHqWebsiteOverview(db, opts) {
  const readiness = await evaluatePublishReadiness(db, {
    churchId: opts.churchId,
    deferServiceTimes: true,
    env: opts.env,
  });
  const plan = normalizePlanKey(readiness && readiness.planKey);
  if (plan === "growth") {
    return loadGrowthWebsiteOverview(db, opts);
  }
  if (plan === "network") {
    return {
      ok: true,
      status: STATUS.OK,
      planKey: "network",
      stitchScreen: null,
      useLegacyWebsiteScreen: true,
      readiness,
    };
  }
  // foundation + unknown → Foundation Stage 1 overview
  return loadFoundationWebsiteOverview(db, opts);
}

module.exports = {
  STATUS,
  FRIENDLY_SUBMISSION_LABELS,
  FRIENDLY_WEBSITE_STATUS,
  CHECKLIST_STATE,
  normalizePlanKey,
  friendlySubmissionLabel,
  loadFoundationWebsiteOverview,
  loadGrowthWebsiteOverview,
  loadBranchWebsiteOverview,
  loadHqWebsiteOverview,
};
