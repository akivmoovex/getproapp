"use strict";

/**
 * Phase3 HQ website workflow dashboard aggregation.
 */

const submissionRepo = require("../repositories/websiteChangeSubmissionRepository");
const versionRepo = require("../repositories/websitePublicationVersionRepository");
const {
  evaluatePublishReadiness,
} = require("./churchWebsitePublishService");
const { validateWebsitePublication } = require("./websitePublicationValidationService");
const publicContentRepo = require("../repositories/publicContentRepository");
const { PUBLIC_PAGE_KEYS } = require("./publicContentConstants");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * @param {import('pg').Pool} db
 * @param {{ organizationId: string, churchId: string, env?: object }} opts
 */
async function loadWebsiteWorkflowDashboard(db, opts) {
  const organizationId = opts && opts.organizationId;
  const churchId = opts && opts.churchId;
  if (!versionRepo.isUuid(organizationId) || !versionRepo.isUuid(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }

  try {
    const [summary, pending, approved, recentSubs, publications, readiness, validation] =
      await Promise.all([
        submissionRepo.countStatusSummary(db, organizationId),
        submissionRepo.listSubmissions(db, {
          organizationId,
          status: "pending_review",
          limit: 8,
        }),
        submissionRepo.listSubmissions(db, {
          organizationId,
          status: "approved",
          limit: 8,
        }),
        submissionRepo.listSubmissions(db, {
          organizationId,
          limit: 8,
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
      ]);

    const draftCountRes = await db.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.website_change_submissions
        WHERE organization_id = $1
          AND status = 'draft'`,
      [organizationId]
    );
    const draftChanges = draftCountRes.rows[0] ? Number(draftCountRes.rows[0].n) : 0;

    // Draft website panel summary from latest edited page.
    let draftSummary = {
      lastEditedBy: null,
      lastEditedAt: null,
      unpublishedChanges: false,
      themeKey: "default",
    };
    let latestUpdated = null;
    for (const pageKey of PUBLIC_PAGE_KEYS) {
      const page = await publicContentRepo.findPageByScope(db, {
        churchId,
        branchId: null,
        pageKey,
      });
      if (!page) continue;
      if (!latestUpdated || new Date(page.updatedAt) > new Date(latestUpdated.updatedAt)) {
        latestUpdated = page;
      }
      if (page.status === "draft") draftSummary.unpublishedChanges = true;
    }
    if (latestUpdated) {
      draftSummary.lastEditedAt = latestUpdated.updatedAt;
    }
    if (readiness && readiness.websiteStatus === "draft") {
      draftSummary.unpublishedChanges = true;
    }

    const needsAttention = [];
    for (const item of pending.items || []) {
      needsAttention.push({
        type: "pending_submission",
        label: `Pending review: ${item.title}`,
        href: `/hq/website/change-submissions/${item.id}`,
        meta: item.branchName || item.submittedByName || "",
      });
    }
    for (const item of approved.items || []) {
      needsAttention.push({
        type: "approved_unpublished",
        label: `Approved, not yet published: ${item.title}`,
        href: `/hq/website/change-submissions/${item.id}`,
        meta: item.branchName || "",
      });
    }
    if (readiness && readiness.ok && !readiness.ready) {
      needsAttention.push({
        type: "missing_required",
        label: "Missing required website content for publication",
        href: "/hq/website/publish/review",
        meta: (readiness.gaps || []).join(", "),
      });
    }

    const publishReady = Boolean(validation && validation.ok && validation.publishable);

    return {
      ok: true,
      status: STATUS.OK,
      counts: {
        draftChanges,
        pendingSubmissions: summary.pendingReview,
        changesRequested: summary.changesRequested,
        approvedReady: (approved.items || []).length,
        publishedRecently: summary.recentlyPublished,
      },
      needsAttention,
      recentSubmissions: recentSubs.items || [],
      draftSummary,
      recentPublications: (publications.items || []).map((v, idx) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        publishedAt: v.publishedAt,
        publishedByName: v.publishedByName || null,
        status: v.status,
        pagesAffected:
          (v.changeSummary &&
            (v.changeSummary.pagesChanged || v.changeSummary.pageKeys)) ||
          (v.snapshot && v.snapshot.pageKeys) ||
          [],
        isCurrent: Boolean(v.status === "published" && idx === 0),
      })),
      readiness,
      publishReady,
      validation,
      statusLabels: require("./websiteChangeSubmissionService").STATUS_LABELS,
      workflowGuide: ["Edit", "Submit", "Review", "Approve", "Publish"],
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "dashboard" };
  }
}

module.exports = {
  STATUS,
  loadWebsiteWorkflowDashboard,
};
