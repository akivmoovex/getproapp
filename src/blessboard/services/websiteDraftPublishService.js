"use strict";

/**
 * Phase 7 Stage 6 — publish / submit / discard orchestration over existing engines.
 */

const fieldDraftRepo = require("../repositories/websiteInlineFieldDraftRepository");
const structuredDraftRepo = require("../repositories/websiteStructuredDraftRepository");
const {
  applyWebsiteDraftsInTransaction,
} = require("./websiteDraftApplyService");
const {
  publishChurchWebsite,
} = require("./churchWebsitePublishService");
const {
  loadWebsiteDraftPublishReview,
  resolvePublishCapability,
} = require("./websiteDraftReviewService");
const approvalSettingsSvc = require("./websiteApprovalSettingsService");
const submissionSvc = require("./websiteChangeSubmissionService");
const auditSvc = require("./websiteAuditService");
const { PAGE_KEY_TITLES } = require("./publicContentConstants");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
  NOT_READY: "not_ready",
  NOT_FOUND: "not_found",
});

async function withTransaction(db, fn) {
  if (db && typeof db.query === "function" && typeof db.release === "function") {
    // Already a client — caller owns TX.
    return fn(db);
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Discard unpublished Phase 7 drafts only. Preserves published content + history.
 */
async function discardWebsiteDrafts(db, opts) {
  const organizationId = opts.organizationId;
  const churchId = opts.churchId;
  const branchId = opts.branchId === undefined ? null : opts.branchId;
  const actorUserId = opts.actorUserId;

  if (
    !fieldDraftRepo.isUuid(organizationId) ||
    !fieldDraftRepo.isUuid(churchId) ||
    !fieldDraftRepo.isUuid(actorUserId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  if (!(opts.confirmDiscard === true || opts.confirmDiscard === "1" || opts.confirmDiscard === "on")) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirm_discard" };
  }

  try {
    const orgCheck = await db.query(
      `SELECT organization_id FROM blessboard.churches WHERE id = $1 LIMIT 1`,
      [churchId]
    );
    if (
      !orgCheck.rows[0] ||
      String(orgCheck.rows[0].organization_id) !== String(organizationId)
    ) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "cross_org" };
    }

    return await withTransaction(db, async (client) => {
      const fieldN = await fieldDraftRepo.discardAllDrafts(client, {
        churchId,
        branchId,
        organizationId,
      });
      const structuredN = await structuredDraftRepo.discardAllStructuredDrafts(client, {
        churchId,
        branchId,
        organizationId,
      });
      await auditSvc.recordWebsiteAuditEventInTransaction(client, {
        organizationId,
        branchId: branchId || null,
        actorUserId,
        actorRole: opts.actorRole || null,
        actionType: "draft_discarded",
        entityType: "website_drafts",
        entityId: churchId,
        result: "success",
        metadata: {
          field_count: fieldN,
          structured_count: structuredN,
          scope: branchId ? "branch" : "organization",
        },
      });
      return {
        ok: true,
        status: STATUS.OK,
        discarded: fieldN + structuredN,
        fieldCount: fieldN,
        structuredCount: structuredN,
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "discard_failed" };
  }
}

/**
 * HQ / trusted-branch publish: apply drafts + existing publishChurchWebsite in one TX.
 */
async function publishWebsiteDrafts(db, opts) {
  const organizationId = opts.organizationId;
  const churchId = opts.churchId;
  const branchId = opts.branchId === undefined ? null : opts.branchId;
  const actorUserId = opts.actorUserId;

  if (
    !fieldDraftRepo.isUuid(organizationId) ||
    !fieldDraftRepo.isUuid(churchId) ||
    !fieldDraftRepo.isUuid(actorUserId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  if (!(opts.confirmPublish === true || opts.confirmPublish === "1" || opts.confirmPublish === "on")) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirm_publish" };
  }

  // Cross-org guard
  try {
    const orgCheck = await db.query(
      `SELECT organization_id FROM blessboard.churches WHERE id = $1 LIMIT 1`,
      [churchId]
    );
    if (
      !orgCheck.rows[0] ||
      String(orgCheck.rows[0].organization_id) !== String(organizationId)
    ) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "cross_org" };
    }
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup" };
  }

  const settingsLoad = await approvalSettingsSvc.loadEffectiveSettings(db, organizationId);
  const capability = resolvePublishCapability({
    actorRole: opts.actorRole,
    settings: settingsLoad.ok ? settingsLoad.settings : null,
  });
  if (capability.action === "submit_for_approval") {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "approval_required" };
  }
  if (capability.action !== "publish") {
    return {
      ok: false,
      status: STATUS.FORBIDDEN,
      reason: capability.reason || "forbidden",
    };
  }

  // Branch-scoped direct publish only when trusted is active (product-gated).
  if (opts.actorRole === "branch_admin" && !capability.reason) {
    /* HQ path */
  }

  const [fieldCount, structuredCount] = await Promise.all([
    fieldDraftRepo.countDrafts(db, { churchId, branchId }),
    structuredDraftRepo.countStructuredDrafts(db, { churchId, branchId }),
  ]);
  if (fieldCount + structuredCount === 0) {
    return { ok: false, status: STATUS.NOT_READY, reason: "no_changes" };
  }

  try {
    return await withTransaction(db, async (client) => {
      const applied = await applyWebsiteDraftsInTransaction(client, {
        organizationId,
        churchId,
        branchId,
      });

      // Existing site publish engine (joins this client TX — no nested BEGIN).
      const published = await publishChurchWebsite(client, {
        organizationId,
        churchId,
        branchId,
        actorUserId,
        confirmPublish: true,
        // Draft republish defaults to deferring service-times (first-publish gap).
        // Callers may still force false for full readiness checks.
        deferServiceTimes: opts.deferServiceTimes !== false,
        mobilePreviewConfirmed:
          Boolean(opts.mobilePreviewConfirmed) ||
          Boolean(opts.confirmPublish === true || opts.confirmPublish === "1"),
        relaxPreviewRequirement: true,
        publicationNote: opts.publicationNote || "Published from website draft review",
        sourceType: opts.sourceType || "hq_edit",
        forcePublishVersion: true,
        env: opts.env,
      });

      if (!published || !published.ok) {
        const err = new Error("publish_failed");
        err.code = "PUBLISH_FAILED";
        err.publishResult = published;
        throw err;
      }

      await auditSvc.recordWebsiteAuditEventInTransaction(client, {
        organizationId,
        branchId: branchId || null,
        actorUserId,
        actorRole: opts.actorRole || null,
        actionType: "drafts_published",
        entityType: "website",
        entityId: churchId,
        result: "success",
        metadata: {
          applied: applied.applied,
          field_count: applied.fieldCount,
          structured_count: applied.structuredCount,
          publication_version_id: published.publicationVersionId || null,
          publication_version_number: published.publicationVersionNumber || null,
        },
      });

      return {
        ok: true,
        status: STATUS.OK,
        applied,
        published,
        draftCleared: true,
      };
    });
  } catch (err) {
    if (err && err.code === "PUBLISH_FAILED") {
      return {
        ok: false,
        status: (err.publishResult && err.publishResult.status) || STATUS.NOT_READY,
        reason: (err.publishResult && err.publishResult.reason) || "publish_failed",
        gaps: err.publishResult && err.publishResult.gaps,
        publishResult: err.publishResult,
      };
    }
    if (err && (err.code === "CROSS_ORG" || err.code === "INVALID_SCOPE")) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "cross_org" };
    }
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: "publish_failed",
    };
  }
}

/**
 * Branch path: package Phase 7 drafts into existing change-submission workflow.
 * Does not apply drafts to the public CMS.
 */
async function submitWebsiteDraftsForApproval(db, opts) {
  const organizationId = opts.organizationId;
  const churchId = opts.churchId;
  const branchId = opts.branchId;
  const actorUserId = opts.actorUserId;

  if (
    !fieldDraftRepo.isUuid(organizationId) ||
    !fieldDraftRepo.isUuid(churchId) ||
    !fieldDraftRepo.isUuid(branchId) ||
    !fieldDraftRepo.isUuid(actorUserId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }

  const settingsLoad = await approvalSettingsSvc.loadEffectiveSettings(db, organizationId);
  const capability = resolvePublishCapability({
    actorRole: opts.actorRole || "branch_admin",
    settings: settingsLoad.ok ? settingsLoad.settings : null,
  });
  if (capability.action === "publish") {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "direct_publish_available" };
  }
  if (capability.action !== "submit_for_approval") {
    return {
      ok: false,
      status: STATUS.FORBIDDEN,
      reason: capability.reason || "forbidden",
    };
  }

  const review = await loadWebsiteDraftPublishReview(db, {
    organizationId,
    churchId,
    branchId,
    actorRole: opts.actorRole || "branch_admin",
    actorUserId,
  });
  if (!review.ok) {
    return { ok: false, status: review.status, reason: review.reason || "load" };
  }
  if (!review.hasChanges) {
    return { ok: false, status: STATUS.NOT_READY, reason: "no_changes" };
  }

  const fieldDrafts = await fieldDraftRepo.listDrafts(db, {
    churchId,
    branchId,
    status: "draft",
  });
  const structuredDrafts = await structuredDraftRepo.listStructuredDrafts(db, {
    churchId,
    branchId,
    status: "draft",
  });

  const pageKeys = new Set();
  for (const d of fieldDrafts) pageKeys.add(d.pageKey);
  for (const d of structuredDrafts) {
    pageKeys.add(d.pageKey || (d.draftKind === "service_times" ? "home" : "home"));
  }
  const primaryPageKey = [...pageKeys][0] || "home";

  const proposedContent = {
    source: "phase7_website_drafts",
    summary: {
      totalChanges: review.counts.totalChangedFields,
      pages: [...pageKeys],
      counts: review.counts,
    },
    fieldDrafts: fieldDrafts.map((d) => ({
      pageKey: d.pageKey,
      sectionKey: d.sectionKey,
      fieldKey: d.fieldKey,
      previousValue: d.previousValue,
      newValue: d.newValue,
    })),
    structuredDrafts: structuredDrafts.map((d) => ({
      draftKind: d.draftKind,
      pageKey: d.pageKey,
      sectionKey: d.sectionKey,
      entityKey: d.entityKey,
      op: d.op,
      payload: d.payload,
      previousPayload: d.previousPayload,
    })),
  };

  const title = `Website draft updates (${review.counts.totalChangedFields} change${
    review.counts.totalChangedFields === 1 ? "" : "s"
  })`;
  const reason =
    opts.reason ||
    `Branch website draft changes across ${pageKeys.size} page(s): ${[...pageKeys]
      .map((k) => PAGE_KEY_TITLES[k] || k)
      .join(", ")}.`;

  const saved = await submissionSvc.saveBranchSubmissionDraft(db, {
    organizationId,
    churchId,
    branchId,
    actorUserId,
    title,
    pageKey: primaryPageKey,
    sectionKey: null,
    reason,
    submitterNote: opts.submitterNote || null,
    priority: opts.priority || "normal",
    checklist: {
      contentReviewed: true,
      contactConfirmed: true,
      imagesApproved: true,
      branchAccurate: true,
      ...(opts.checklist && typeof opts.checklist === "object" ? opts.checklist : {}),
    },
    proposedContent,
    changeType: "Website Draft Update",
  });
  if (!saved.ok) {
    return {
      ok: false,
      status: saved.status || STATUS.LOOKUP_ERROR,
      reason: saved.reason || "save_submission",
    };
  }

  const submitted = await submissionSvc.submitBranchSubmission(db, {
    organizationId,
    churchId,
    branchId,
    actorUserId,
    submissionId: saved.submission && saved.submission.id,
  });
  if (!submitted.ok) {
    return {
      ok: false,
      status: submitted.status || STATUS.LOOKUP_ERROR,
      reason: submitted.reason || "submit_failed",
      submission: saved.submission,
    };
  }

  try {
    await auditSvc.recordWebsiteAuditEvent(db, {
      organizationId,
      branchId,
      actorUserId,
      actorRole: opts.actorRole || "branch_admin",
      actionType: "drafts_submitted_for_approval",
      entityType: "website_change_submission",
      entityId: submitted.submission && submitted.submission.id,
      result: "success",
      metadata: {
        total_changes: review.counts.totalChangedFields,
        pages: [...pageKeys],
      },
    });
  } catch {
    /* non-fatal */
  }

  return {
    ok: true,
    status: STATUS.OK,
    submission: submitted.submission,
    draftPreserved: true,
    message:
      "Changes were submitted for HQ approval. Public visitors will not see them until approved and published.",
  };
}

module.exports = {
  STATUS,
  discardWebsiteDrafts,
  publishWebsiteDrafts,
  submitWebsiteDraftsForApproval,
};
