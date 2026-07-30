"use strict";

/**
 * Phase3 HQ website change submission review service.
 */

const repo = require("../repositories/websiteChangeSubmissionRepository");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
});

const SUBMISSION_STATUSES = Object.freeze([
  "draft",
  "pending_review",
  "changes_requested",
  "approved",
  "rejected",
  "published",
  "withdrawn",
]);

const STATUS_LABELS = Object.freeze({
  draft: "Draft",
  pending_review: "Pending review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
  withdrawn: "Withdrawn",
});

const EVENT_LABELS = Object.freeze({
  created: "Created",
  submitted: "Submitted",
  reviewed: "Reviewed",
  changes_requested: "Changes requested",
  resubmitted: "Resubmitted",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
  withdrawn: "Withdrawn",
  comment: "Comment",
});

/** Valid transitions for HQ review and branch submit/withdraw. */
const TRANSITIONS = Object.freeze({
  draft: new Set(["pending_review", "withdrawn"]),
  pending_review: new Set(["approved", "changes_requested", "rejected", "withdrawn"]),
  changes_requested: new Set(["pending_review", "withdrawn"]),
  approved: new Set(["published"]),
});

const PRIORITIES = Object.freeze(["normal", "important", "urgent"]);
const PAGE_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const SECTION_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;

const COMPARISON_FIELDS = Object.freeze([
  { key: "heading", label: "Heading" },
  { key: "bodyText", label: "Body text" },
  { key: "mediaUrl", label: "Image / media" },
  { key: "buttonText", label: "Button text" },
  { key: "buttonUrl", label: "Button destination" },
  { key: "serviceTimes", label: "Service times" },
  { key: "contactDetails", label: "Contact details" },
  { key: "sectionVisible", label: "Section visibility" },
  { key: "sortOrder", label: "Section order" },
]);

function withClient(db, fn) {
  return (async () => {
    let client = null;
    let owned = false;
    try {
      if (db && typeof db.query === "function" && typeof db.release === "function") {
        return await fn(db);
      }
      if (db && typeof db.connect === "function") {
        client = await db.connect();
        owned = true;
      } else {
        client = db;
      }
      return await fn(client);
    } finally {
      if (owned && client && typeof client.release === "function") client.release();
    }
  })();
}

async function withTransaction(db, fn) {
  return withClient(db, async (client) => {
    const ownsTx =
      typeof client.release === "function" || (db && typeof db.connect === "function");
    if (ownsTx) await client.query("BEGIN");
    try {
      const result = await fn(client);
      if (ownsTx) await client.query("COMMIT");
      return result;
    } catch (err) {
      if (ownsTx) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
      }
      throw err;
    }
  });
}

function statusLabel(status) {
  return STATUS_LABELS[status] || String(status || "—");
}

function eventLabel(eventType) {
  return EVENT_LABELS[eventType] || String(eventType || "—");
}

function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  return Boolean(allowed && allowed.has(to));
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function displayValue(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "boolean") return raw ? "Visible" : "Hidden";
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
  return String(raw);
}

/**
 * Minimal typed field-by-field comparison for known content keys.
 * @param {object|null|undefined} current
 * @param {object|null|undefined} proposed
 */
function buildContentComparison(current, proposed) {
  const cur = asObject(current);
  const prop = asObject(proposed);
  const keys = new Set([
    ...COMPARISON_FIELDS.map((f) => f.key),
    ...Object.keys(cur),
    ...Object.keys(prop),
  ]);
  const labelByKey = Object.fromEntries(COMPARISON_FIELDS.map((f) => [f.key, f.label]));
  const fields = [];

  for (const key of COMPARISON_FIELDS.map((f) => f.key)) {
    keys.delete(key);
    const currentRaw = Object.prototype.hasOwnProperty.call(cur, key) ? cur[key] : undefined;
    const proposedRaw = Object.prototype.hasOwnProperty.call(prop, key)
      ? prop[key]
      : undefined;
    const currentDisplay = displayValue(currentRaw);
    const proposedDisplay = displayValue(proposedRaw);
    const present =
      Object.prototype.hasOwnProperty.call(cur, key) ||
      Object.prototype.hasOwnProperty.call(prop, key);
    if (!present) continue;
    const changed =
      displayValue(currentRaw) !== displayValue(proposedRaw) ||
      Object.prototype.hasOwnProperty.call(cur, key) !==
        Object.prototype.hasOwnProperty.call(prop, key);
    fields.push({
      key,
      label: labelByKey[key] || key,
      current: currentDisplay,
      proposed: proposedDisplay,
      changed,
      unavailableCurrent: !Object.prototype.hasOwnProperty.call(cur, key),
      unavailableProposed: !Object.prototype.hasOwnProperty.call(prop, key),
    });
  }

  // Ignore unknown keys in the presenter (do not dump raw JSON).
  return { fields, changedCount: fields.filter((f) => f.changed).length };
}

function parseDateOnly(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   q?: string,
 *   status?: string,
 *   branchId?: string,
 *   pageKey?: string,
 *   submittedBy?: string,
 *   submittedFrom?: string,
 *   submittedTo?: string,
 * }} opts
 */
async function loadSubmissionsList(db, opts) {
  const organizationId = opts && opts.organizationId;
  if (!repo.isUuid(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }

  const statusFilter =
    opts.status && SUBMISSION_STATUSES.includes(String(opts.status))
      ? String(opts.status)
      : null;
  const branchId = repo.isUuid(opts.branchId) ? opts.branchId : null;
  const submittedBy = repo.isUuid(opts.submittedBy) ? opts.submittedBy : null;
  const submittedFrom = parseDateOnly(opts.submittedFrom);
  const submittedTo = parseDateOnly(opts.submittedTo);

  try {
    const [list, summary, pageKeys, submitters, branches] = await Promise.all([
      repo.listSubmissions(db, {
        organizationId,
        q: opts.q,
        status: statusFilter,
        branchId,
        pageKey: opts.pageKey,
        submittedBy,
        submittedFrom,
        submittedTo,
      }),
      repo.countStatusSummary(db, organizationId),
      repo.listDistinctPageKeys(db, organizationId),
      repo.listSubmitters(db, organizationId),
      repo.listBranchesForOrganization(db, organizationId),
    ]);

    return {
      ok: true,
      status: STATUS.OK,
      items: list.items,
      total: list.total,
      summary,
      pageKeys,
      submitters,
      branches,
      filters: {
        q: opts.q ? String(opts.q).trim().slice(0, 100) : "",
        status: statusFilter || "",
        branchId: branchId || "",
        pageKey: opts.pageKey ? String(opts.pageKey).trim().slice(0, 64) : "",
        submittedBy: submittedBy || "",
        submittedFrom: submittedFrom || "",
        submittedTo: submittedTo || "",
      },
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "list" };
  }
}

/**
 * Org-scoped existence check for HQ submission routes.
 * Always filters by organization_id in the repository query — never load by id alone.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ organizationId: string, submissionId: string }} opts
 */
async function assertSubmissionInOrganization(db, opts) {
  const organizationId = opts && opts.organizationId;
  const submissionId = opts && opts.submissionId;
  if (!repo.isUuid(organizationId) || !repo.isUuid(submissionId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    const submission = await repo.getSubmissionByOrgAndId(db, organizationId, submissionId);
    if (!submission) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };
    }
    return { ok: true, status: STATUS.OK, submission };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "assert" };
  }
}

/**
 * Branch-scoped existence check (organization_id + branch_id + id).
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ organizationId: string, branchId: string, submissionId: string }} opts
 */
async function assertSubmissionInOrganizationBranch(db, opts) {
  const organizationId = opts && opts.organizationId;
  const branchId = opts && opts.branchId;
  const submissionId = opts && opts.submissionId;
  if (!repo.isUuid(organizationId) || !repo.isUuid(branchId) || !repo.isUuid(submissionId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    const submission = await repo.getSubmissionByOrgBranchAndId(
      db,
      organizationId,
      branchId,
      submissionId
    );
    if (!submission) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };
    }
    return { ok: true, status: STATUS.OK, submission };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "assert_branch" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{ organizationId: string, submissionId: string }} opts
 */
async function loadSubmissionReview(db, opts) {
  const organizationId = opts && opts.organizationId;
  const submissionId = opts && opts.submissionId;
  if (!repo.isUuid(organizationId) || !repo.isUuid(submissionId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }

  try {
    const submission = await repo.getSubmissionByOrgAndId(db, organizationId, submissionId);
    if (!submission) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };
    }
    const events = await repo.listEvents(db, organizationId, submissionId, {
      includeInternal: true,
    });
    const comparison = buildContentComparison(
      submission.currentContent,
      submission.proposedContent
    );
    const reviewable = submission.status === "pending_review";
    const proposed =
      submission.proposedContent && typeof submission.proposedContent === "object"
        ? submission.proposedContent
        : {};
    return {
      ok: true,
      status: STATUS.OK,
      submission,
      events,
      comparison,
      reviewable,
      /** Proposed content is not served by existing preview routes. */
      proposedPreviewSupported: false,
      /** Phase 7 branch drafts are applied and published on approve. */
      approveAndPublishNowSupported: proposed.source === "phase7_website_drafts",
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "review" };
  }
}

function requireText(value, max) {
  const text = value == null ? "" : String(value).trim();
  if (!text) return { ok: false, value: null };
  if (text.length > max) return { ok: false, value: null };
  return { ok: true, value: text };
}

function optionalText(value, max) {
  if (value == null || String(value).trim() === "") return { ok: true, value: null };
  return requireText(value, max);
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   submissionId: string,
 *   reviewerUserId: string,
 *   reviewerComment?: string,
 * }} opts
 */
async function approveSubmission(db, opts) {
  const organizationId = opts && opts.organizationId;
  const submissionId = opts && opts.submissionId;
  const reviewerUserId = opts && opts.reviewerUserId;
  if (
    !repo.isUuid(organizationId) ||
    !repo.isUuid(submissionId) ||
    !repo.isUuid(reviewerUserId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  const comment = optionalText(opts.reviewerComment, 2000);
  if (!comment.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "reviewer_comment" };
  }

  try {
    return await withTransaction(db, async (client) => {
      const existing = await repo.getSubmissionByOrgAndId(
        client,
        organizationId,
        submissionId
      );
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };
      if (!canTransition(existing.status, "approved")) {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          reason: "invalid_transition",
          from: existing.status,
        };
      }
      const approvalSettingsSvc = require("./websiteApprovalSettingsService");
      const settingsLoad = await approvalSettingsSvc.loadEffectiveSettings(
        client,
        organizationId
      );
      if (
        settingsLoad.ok &&
        settingsLoad.settings.preventSelfApproval &&
        existing.submittedBy &&
        String(existing.submittedBy) === String(reviewerUserId)
      ) {
        return {
          ok: false,
          status: STATUS.FORBIDDEN,
          reason: "self_approval_blocked",
        };
      }
      const updated = await repo.applyReviewDecision(client, {
        organizationId,
        submissionId,
        expectedStatus: existing.status,
        nextStatus: "approved",
        reviewedBy: reviewerUserId,
        reviewerComment: comment.value,
        rejectionReason: null,
      });
      if (!updated) {
        return { ok: false, status: STATUS.CONFLICT, reason: "stale" };
      }
      await repo.appendEvent(client, {
        submissionId,
        organizationId,
        actorUserId: reviewerUserId,
        eventType: "approved",
        comment: comment.value,
      });
      const auditSvc = require("./websiteAuditService");
      await auditSvc.recordWebsiteAuditEventInTransaction(client, {
        organizationId,
        branchId: updated.branchId,
        actorUserId: reviewerUserId,
        actorRole: "church_hq_admin",
        actionType: "changes_approved",
        pageKey: updated.pageKey,
        sectionKey: updated.sectionKey,
        entityType: "website_change_submission",
        entityId: submissionId,
        result: "success",
      });

      const proposed =
        updated.proposedContent && typeof updated.proposedContent === "object"
          ? updated.proposedContent
          : {};
      let applied = null;
      let published = null;
      if (proposed.source === "phase7_website_drafts") {
        const {
          applyWebsiteDraftsInTransaction,
          applyProposedPhase7DraftsInTransaction,
        } = require("./websiteDraftApplyService");
        const { publishChurchWebsite } = require("./churchWebsitePublishService");

        let churchId = updated.churchId;
        if (!churchId && updated.branchId) {
          const churchRes = await client.query(
            `SELECT church_id FROM blessboard.branches WHERE id = $1 LIMIT 1`,
            [updated.branchId]
          );
          churchId = churchRes.rows[0] ? churchRes.rows[0].church_id : null;
        }
        if (!repo.isUuid(churchId)) {
          const err = new Error("approve_missing_church");
          err.code = "INVALID_SCOPE";
          throw err;
        }

        applied = await applyWebsiteDraftsInTransaction(client, {
          organizationId,
          churchId,
          branchId: updated.branchId,
        });
        if (!applied.applied) {
          applied = await applyProposedPhase7DraftsInTransaction(client, {
            organizationId,
            churchId,
            branchId: updated.branchId,
            proposedContent: proposed,
          });
        }
        if (!applied.applied) {
          const err = new Error("approve_apply_empty");
          err.code = "APPROVE_APPLY_EMPTY";
          throw err;
        }

        published = await publishChurchWebsite(client, {
          organizationId,
          churchId,
          branchId: updated.branchId,
          actorUserId: reviewerUserId,
          confirmPublish: true,
          deferServiceTimes: true,
          relaxPreviewRequirement: true,
          forcePublishVersion: true,
          sourceType: "branch_submission",
          sourceSubmissionId: submissionId,
          publicationNote: "Published from approved branch website draft submission",
          env: opts.env,
        });
        if (!published || !published.ok) {
          const err = new Error("approve_publish_failed");
          err.code = "APPROVE_PUBLISH_FAILED";
          err.publishResult = published;
          throw err;
        }

        await auditSvc.recordWebsiteAuditEventInTransaction(client, {
          organizationId,
          branchId: updated.branchId,
          actorUserId: reviewerUserId,
          actorRole: "church_hq_admin",
          actionType: "approved_drafts_published",
          entityType: "website_change_submission",
          entityId: submissionId,
          result: "success",
          metadata: {
            applied: applied.applied,
            publication_version_id: published.publicationVersionId || null,
            publication_version_number: published.publicationVersionNumber || null,
          },
        });
      }

      return {
        ok: true,
        status: STATUS.OK,
        submission: updated,
        applied,
        published,
        message: published
          ? "Submission approved and applied to the branch website."
          : "Submission approved.",
      };
    });
  } catch (err) {
    if (err && err.code === "APPROVE_PUBLISH_FAILED") {
      return {
        ok: false,
        status: STATUS.LOOKUP_ERROR,
        reason: "approve_publish_failed",
        publishResult: err.publishResult || null,
        message: "Approval could not publish the approved branch drafts.",
      };
    }
    if (err && err.code === "APPROVE_APPLY_EMPTY") {
      return {
        ok: false,
        status: STATUS.CONFLICT,
        reason: "approve_apply_empty",
        message: "Approved submission had no draft content to apply.",
      };
    }
    if (err && (err.code === "CROSS_ORG" || err.code === "INVALID_SCOPE")) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "cross_org" };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "approve" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   submissionId: string,
 *   reviewerUserId: string,
 *   feedback: string,
 * }} opts
 */
async function requestChanges(db, opts) {
  const organizationId = opts && opts.organizationId;
  const submissionId = opts && opts.submissionId;
  const reviewerUserId = opts && opts.reviewerUserId;
  if (
    !repo.isUuid(organizationId) ||
    !repo.isUuid(submissionId) ||
    !repo.isUuid(reviewerUserId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }

  const approvalSettingsSvc = require("./websiteApprovalSettingsService");
  const settingsLoad = await approvalSettingsSvc.loadEffectiveSettings(
    db,
    organizationId
  );
  const requireComment =
    !settingsLoad.ok || settingsLoad.settings.requireRequestChangesComment !== false;
  const feedback = requireComment
    ? requireText(opts.feedback, 2000)
    : optionalText(opts.feedback, 2000);
  if (!feedback.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: requireComment ? "feedback_required" : "feedback",
    };
  }

  try {
    return await withTransaction(db, async (client) => {
      const existing = await repo.getSubmissionByOrgAndId(
        client,
        organizationId,
        submissionId
      );
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };
      if (!canTransition(existing.status, "changes_requested")) {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          reason: "invalid_transition",
          from: existing.status,
        };
      }
      const updated = await repo.applyReviewDecision(client, {
        organizationId,
        submissionId,
        expectedStatus: existing.status,
        nextStatus: "changes_requested",
        reviewedBy: reviewerUserId,
        reviewerComment: feedback.value,
        rejectionReason: null,
      });
      if (!updated) {
        return { ok: false, status: STATUS.CONFLICT, reason: "stale" };
      }
      await repo.appendEvent(client, {
        submissionId,
        organizationId,
        actorUserId: reviewerUserId,
        eventType: "changes_requested",
        comment: feedback.value,
      });
      const auditSvc = require("./websiteAuditService");
      await auditSvc.recordWebsiteAuditEventInTransaction(client, {
        organizationId,
        branchId: updated.branchId,
        actorUserId: reviewerUserId,
        actorRole: "church_hq_admin",
        actionType: "changes_requested",
        pageKey: updated.pageKey,
        sectionKey: updated.sectionKey,
        entityType: "website_change_submission",
        entityId: submissionId,
        result: "success",
      });
      return { ok: true, status: STATUS.OK, submission: updated };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "request_changes" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   submissionId: string,
 *   reviewerUserId: string,
 *   rejectionReason: string,
 * }} opts
 */
async function rejectSubmission(db, opts) {
  const organizationId = opts && opts.organizationId;
  const submissionId = opts && opts.submissionId;
  const reviewerUserId = opts && opts.reviewerUserId;
  if (
    !repo.isUuid(organizationId) ||
    !repo.isUuid(submissionId) ||
    !repo.isUuid(reviewerUserId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }

  const approvalSettingsSvc = require("./websiteApprovalSettingsService");
  const settingsLoad = await approvalSettingsSvc.loadEffectiveSettings(
    db,
    organizationId
  );
  const requireReason =
    !settingsLoad.ok || settingsLoad.settings.requireRejectionReason !== false;
  const reason = requireReason
    ? requireText(opts.rejectionReason, 2000)
    : optionalText(opts.rejectionReason, 2000);
  if (!reason.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: requireReason ? "rejection_reason_required" : "rejection_reason",
    };
  }

  try {
    return await withTransaction(db, async (client) => {
      const existing = await repo.getSubmissionByOrgAndId(
        client,
        organizationId,
        submissionId
      );
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };
      if (!canTransition(existing.status, "rejected")) {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          reason: "invalid_transition",
          from: existing.status,
        };
      }
      const updated = await repo.applyReviewDecision(client, {
        organizationId,
        submissionId,
        expectedStatus: existing.status,
        nextStatus: "rejected",
        reviewedBy: reviewerUserId,
        reviewerComment: null,
        rejectionReason: reason.value,
      });
      if (!updated) {
        return { ok: false, status: STATUS.CONFLICT, reason: "stale" };
      }
      await repo.appendEvent(client, {
        submissionId,
        organizationId,
        actorUserId: reviewerUserId,
        eventType: "rejected",
        comment: reason.value,
      });
      const auditSvc = require("./websiteAuditService");
      await auditSvc.recordWebsiteAuditEventInTransaction(client, {
        organizationId,
        branchId: updated.branchId,
        actorUserId: reviewerUserId,
        actorRole: "church_hq_admin",
        actionType: "submission_rejected",
        pageKey: updated.pageKey,
        sectionKey: updated.sectionKey,
        entityType: "website_change_submission",
        entityId: submissionId,
        result: "success",
      });
      return { ok: true, status: STATUS.OK, submission: updated };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "reject" };
  }
}

module.exports = {
  STATUS,
  SUBMISSION_STATUSES,
  STATUS_LABELS,
  EVENT_LABELS,
  COMPARISON_FIELDS,
  PRIORITIES,
  statusLabel,
  eventLabel,
  canTransition,
  buildContentComparison,
  loadSubmissionsList,
  assertSubmissionInOrganization,
  assertSubmissionInOrganizationBranch,
  loadSubmissionReview,
  approveSubmission,
  requestChanges,
  rejectSubmission,
  listBranchSubmissions,
  loadBranchSubmission,
  saveBranchSubmissionDraft,
  submitBranchSubmission,
  withdrawBranchSubmission,
  duplicateBranchSubmissionDraft,
  buildBranchSubmissionFormModel,
  parseChecklist,
  buildProposedFromBody,
  listSubmissionConversation,
  addSubmissionComment,
  insertSubmission: repo.insertSubmission,
  appendEvent: repo.appendEvent,
};

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   branchId: string,
 *   q?: string,
 *   status?: string,
 *   pageKey?: string,
 * }} opts
 */
async function listBranchSubmissions(db, opts) {
  const organizationId = opts && opts.organizationId;
  const branchId = opts && opts.branchId;
  if (!repo.isUuid(organizationId) || !repo.isUuid(branchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }
  const statusFilter =
    opts.status && SUBMISSION_STATUSES.includes(String(opts.status))
      ? String(opts.status)
      : null;
  try {
    const [list, summary, pageKeys] = await Promise.all([
      repo.listSubmissions(db, {
        organizationId,
        branchId,
        q: opts.q,
        status: statusFilter,
        pageKey: opts.pageKey,
      }),
      repo.countBranchStatusSummary(db, organizationId, branchId),
      repo.listDistinctPageKeys(db, organizationId),
    ]);
    return {
      ok: true,
      status: STATUS.OK,
      items: list.items,
      total: list.total,
      summary,
      pageKeys,
      filters: {
        q: opts.q ? String(opts.q).trim().slice(0, 100) : "",
        status: statusFilter || "",
        pageKey: opts.pageKey ? String(opts.pageKey).trim().slice(0, 64) : "",
      },
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "list" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{ organizationId: string, branchId: string, submissionId: string }} opts
 */
async function loadBranchSubmission(db, opts) {
  const organizationId = opts && opts.organizationId;
  const branchId = opts && opts.branchId;
  const submissionId = opts && opts.submissionId;
  if (!repo.isUuid(organizationId) || !repo.isUuid(branchId) || !repo.isUuid(submissionId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    const submission = await repo.getSubmissionByOrgBranchAndId(
      db,
      organizationId,
      branchId,
      submissionId
    );
    if (!submission) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };
    }
    const events = await repo.listEvents(db, organizationId, submissionId, {
      includeInternal: false,
    });
    const comparison = buildContentComparison(
      submission.currentContent,
      submission.proposedContent
    );
    const st = submission.status;
    return {
      ok: true,
      status: STATUS.OK,
      submission,
      events,
      comparison,
      actions: {
        canEdit: st === "draft" || st === "changes_requested",
        canSubmit: st === "draft" || st === "changes_requested",
        canWithdraw: st === "draft" || st === "pending_review" || st === "changes_requested",
        canDuplicate: st === "rejected",
        canViewOnly: st === "approved" || st === "published" || st === "withdrawn",
      },
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "detail" };
  }
}

function normalizePriority(value) {
  const p = String(value || "normal").trim().toLowerCase();
  return PRIORITIES.includes(p) ? p : null;
}

function parseChecklist(body) {
  return {
    contentReviewed: Boolean(body && (body.checklist_content === "1" || body.checklist_content === "on")),
    contactConfirmed: Boolean(body && (body.checklist_contact === "1" || body.checklist_contact === "on")),
    imagesApproved: Boolean(body && (body.checklist_images === "1" || body.checklist_images === "on")),
    branchAccurate: Boolean(body && (body.checklist_branch === "1" || body.checklist_branch === "on")),
  };
}

function checklistComplete(checklist) {
  return Boolean(
    checklist &&
      checklist.contentReviewed &&
      checklist.contactConfirmed &&
      checklist.imagesApproved &&
      checklist.branchAccurate
  );
}

function buildProposedFromBody(body) {
  const proposed = {};
  const keys = [
    "heading",
    "bodyText",
    "mediaUrl",
    "buttonText",
    "buttonUrl",
    "serviceTimes",
    "contactDetails",
  ];
  for (const key of keys) {
    const formKey = key === "bodyText" ? "body_text" : key === "mediaUrl" ? "media_url" : key === "buttonText" ? "button_text" : key === "buttonUrl" ? "button_url" : key === "serviceTimes" ? "service_times" : key === "contactDetails" ? "contact_details" : key;
    if (body && body[formKey] != null && String(body[formKey]).trim() !== "") {
      proposed[key] = String(body[formKey]).trim().slice(0, key === "bodyText" ? 20000 : 2000);
    }
  }
  if (body && (body.section_visible === "1" || body.section_visible === "0")) {
    proposed.sectionVisible = body.section_visible === "1";
  }
  if (body && body.sort_order != null && String(body.sort_order).trim() !== "") {
    const n = Number(body.sort_order);
    if (Number.isFinite(n)) proposed.sortOrder = n;
  }
  return proposed;
}

/**
 * Load editable current content from branch-scoped page sections when available.
 * Falls back to empty object / church-wide page if branch page missing.
 */
async function loadCurrentContentSnapshot(db, churchId, branchId, pageKey, sectionKey) {
  const publicContentRepo = require("../repositories/publicContentRepository");
  const page =
    (await publicContentRepo.findPageByScope(db, {
      churchId,
      branchId,
      pageKey,
    })) ||
    (await publicContentRepo.findPageByScope(db, {
      churchId,
      branchId: null,
      pageKey,
    }));
  if (!page) {
    return { currentContent: {}, changeType: "Content Update", sectionLabel: null };
  }
  const sections = await publicContentRepo.listSectionsForPage(db, page.id, {});
  let section = null;
  if (sectionKey) {
    section = (sections || []).find((s) => s.sectionKey === sectionKey) || null;
  }
  if (!section && sections && sections.length) {
    section = sections[0];
  }
  if (!section) {
    return {
      currentContent: { heading: page.title || "" },
      changeType: "Page update",
      sectionLabel: null,
      resolvedSectionKey: null,
    };
  }
  return {
    currentContent: {
      heading: section.heading || "",
      bodyText: section.bodyText || "",
      mediaUrl: section.mediaUrl || "",
      sortOrder: section.sortOrder,
      sectionVisible: section.status !== "archived",
    },
    changeType: "Content Update",
    sectionLabel: section.sectionKey,
    resolvedSectionKey: section.sectionKey,
  };
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   branchId: string,
 *   submissionId?: string|null,
 *   pageKey?: string,
 *   sectionKey?: string,
 * }} opts
 */
async function buildBranchSubmissionFormModel(db, opts) {
  const organizationId = opts.organizationId;
  const churchId = opts.churchId;
  const branchId = opts.branchId;
  if (!repo.isUuid(organizationId) || !repo.isUuid(churchId) || !repo.isUuid(branchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }

  let submission = null;
  if (opts.submissionId) {
    if (!repo.isUuid(opts.submissionId)) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "submission_id" };
    }
    submission = await repo.getSubmissionByOrgBranchAndId(
      db,
      organizationId,
      branchId,
      opts.submissionId
    );
    if (!submission) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };
    }
    if (submission.status !== "draft" && submission.status !== "changes_requested") {
      return { ok: false, status: STATUS.CONFLICT, reason: "not_editable" };
    }
  }

  const pageKey =
    (submission && submission.pageKey) ||
    (opts.pageKey && PAGE_KEY_RE.test(opts.pageKey) ? opts.pageKey : "home");
  const sectionKey =
    (submission && submission.sectionKey) ||
    (opts.sectionKey && SECTION_KEY_RE.test(opts.sectionKey) ? opts.sectionKey : null);

  const snap = await loadCurrentContentSnapshot(db, churchId, branchId, pageKey, sectionKey);
  const currentContent = submission ? submission.currentContent : snap.currentContent;
  const proposedContent = submission ? submission.proposedContent : { ...snap.currentContent };
  const comparison = buildContentComparison(currentContent, proposedContent);

  return {
    ok: true,
    status: STATUS.OK,
    submission,
    pageKey,
    sectionKey: submission
      ? submission.sectionKey
      : snap.resolvedSectionKey || sectionKey,
    currentContent,
    proposedContent,
    comparison,
    changeSummary: {
      pagesChanged: [pageKey],
      sectionsChanged: submission && submission.sectionKey ? [submission.sectionKey] : snap.resolvedSectionKey ? [snap.resolvedSectionKey] : [],
      imagesReplaced: comparison.fields.some(
        (f) => f.key === "mediaUrl" && f.changed
      )
        ? 1
        : 0,
      serviceTimesUpdated: comparison.fields.some(
        (f) => f.key === "serviceTimes" && f.changed
      ),
      contactDetailsUpdated: comparison.fields.some(
        (f) => f.key === "contactDetails" && f.changed
      ),
    },
  };
}

/**
 * @param {import('pg').Pool} db
 * @param {object} opts
 */
async function saveBranchSubmissionDraft(db, opts) {
  const organizationId = opts.organizationId;
  const churchId = opts.churchId;
  const branchId = opts.branchId;
  const actorUserId = opts.actorUserId;
  if (
    !repo.isUuid(organizationId) ||
    !repo.isUuid(churchId) ||
    !repo.isUuid(branchId) ||
    !repo.isUuid(actorUserId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }

  const title = requireText(opts.title, 200);
  if (!title.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: "title_required" };
  const pageKey = String(opts.pageKey || "").trim();
  if (!PAGE_KEY_RE.test(pageKey)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "page_key" };
  }
  const sectionKeyRaw = opts.sectionKey != null ? String(opts.sectionKey).trim() : "";
  const sectionKey =
    sectionKeyRaw && SECTION_KEY_RE.test(sectionKeyRaw) ? sectionKeyRaw : null;
  const reason = optionalText(opts.reason, 2000);
  if (!reason.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: "reason" };
  const submitterNote = optionalText(opts.submitterNote, 2000);
  if (!submitterNote.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "submitter_note" };
  }
  const priority = normalizePriority(opts.priority);
  if (!priority) return { ok: false, status: STATUS.INVALID_INPUT, reason: "priority" };
  const requestedPublicationDate = parseDateOnly(opts.requestedPublicationDate);
  const checklist = opts.checklist && typeof opts.checklist === "object" ? opts.checklist : {};
  const proposedContent =
    opts.proposedContent && typeof opts.proposedContent === "object"
      ? opts.proposedContent
      : {};

  try {
    return await withTransaction(db, async (client) => {
      const snap = await loadCurrentContentSnapshot(
        client,
        churchId,
        branchId,
        pageKey,
        sectionKey
      );
      const currentContent =
        opts.currentContent && typeof opts.currentContent === "object"
          ? opts.currentContent
          : snap.currentContent;
      const changeType = String(opts.changeType || snap.changeType || "Content Update").slice(
        0,
        80
      );

      if (opts.submissionId) {
        if (!repo.isUuid(opts.submissionId)) {
          return { ok: false, status: STATUS.INVALID_INPUT, reason: "submission_id" };
        }
        const existing = await repo.getSubmissionByOrgBranchAndId(
          client,
          organizationId,
          branchId,
          opts.submissionId
        );
        if (!existing) return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };
        if (existing.status !== "draft" && existing.status !== "changes_requested") {
          return { ok: false, status: STATUS.CONFLICT, reason: "invalid_transition" };
        }
        const updated = await repo.updateDraftSubmission(client, {
          organizationId,
          branchId,
          submissionId: opts.submissionId,
          expectedStatuses: ["draft", "changes_requested"],
          title: title.value,
          pageKey,
          sectionKey: sectionKey || snap.resolvedSectionKey,
          changeType,
          currentContent,
          proposedContent,
          reason: reason.value,
          submitterNote: submitterNote.value,
          priority,
          requestedPublicationDate,
          checklist,
        });
        if (!updated) return { ok: false, status: STATUS.CONFLICT, reason: "stale" };
        return { ok: true, status: STATUS.OK, submission: updated, created: false };
      }

      const created = await repo.insertSubmission(client, {
        organizationId,
        branchId,
        title: title.value,
        pageKey,
        sectionKey: sectionKey || snap.resolvedSectionKey,
        changeType,
        currentContent,
        proposedContent,
        reason: reason.value,
        submitterNote: submitterNote.value,
        priority,
        requestedPublicationDate,
        checklist,
        status: "draft",
        submittedBy: actorUserId,
      });
      await repo.appendEvent(client, {
        submissionId: created.id,
        organizationId,
        actorUserId,
        eventType: "created",
        comment: "Draft saved",
      });
      const auditSvc = require("./websiteAuditService");
      await auditSvc.recordWebsiteAuditEventInTransaction(client, {
        organizationId,
        branchId,
        actorUserId,
        actorRole: "branch_admin",
        actionType: "submission_created",
        pageKey,
        sectionKey: sectionKey || snap.resolvedSectionKey,
        entityType: "website_change_submission",
        entityId: created.id,
        result: "success",
      });
      return { ok: true, status: STATUS.OK, submission: created, created: true };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "save" };
  }
}

/**
 * Submit draft or resubmit changes_requested → pending_review.
 * @param {import('pg').Pool} db
 * @param {object} opts
 */
async function submitBranchSubmission(db, opts) {
  const organizationId = opts.organizationId;
  const churchId = opts.churchId;
  const branchId = opts.branchId;
  const actorUserId = opts.actorUserId;
  let resolvedId = opts.submissionId || (opts.submission && opts.submission.id) || null;

  if (opts.saveFirst) {
    const saved = await saveBranchSubmissionDraft(db, {
      ...opts,
      submissionId: resolvedId,
    });
    if (!saved.ok) return saved;
    resolvedId = saved.submission && saved.submission.id;
  }

  if (
    !repo.isUuid(organizationId) ||
    !repo.isUuid(branchId) ||
    !repo.isUuid(actorUserId) ||
    !repo.isUuid(resolvedId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }

  const id = resolvedId;

  try {
    const approvalSettingsSvc = require("./websiteApprovalSettingsService");
    const settingsLoad = await approvalSettingsSvc.loadEffectiveSettings(db, organizationId);
    if (settingsLoad.ok && settingsLoad.settings) {
      const resolved = approvalSettingsSvc.resolveBranchEditMode(settingsLoad.settings);
      if (resolved.mode === "draft_only") {
        return { ok: false, status: STATUS.FORBIDDEN, reason: "draft_only" };
      }
    }
  } catch {
    /* continue */
  }

  try {
    return await withTransaction(db, async (client) => {
      const existing = await repo.getSubmissionByOrgBranchAndId(
        client,
        organizationId,
        branchId,
        id
      );
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };
      if (!canTransition(existing.status, "pending_review")) {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          reason: "invalid_transition",
          from: existing.status,
        };
      }
      if (!requireText(existing.title, 200).ok) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "title_required" };
      }
      if (!requireText(existing.reason, 2000).ok) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "reason_required" };
      }
      if (!checklistComplete(existing.checklist)) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "checklist_required" };
      }

      const wasResubmit = existing.status === "changes_requested";
      const updated = await repo.transitionBranchSubmission(client, {
        organizationId,
        branchId,
        submissionId: id,
        expectedStatus: existing.status,
        nextStatus: "pending_review",
        clearReviewFields: wasResubmit,
      });
      if (!updated) return { ok: false, status: STATUS.CONFLICT, reason: "stale" };

      await repo.appendEvent(client, {
        submissionId: id,
        organizationId,
        actorUserId,
        eventType: wasResubmit ? "resubmitted" : "submitted",
        comment: existing.submitterNote || null,
      });
      const auditSvc = require("./websiteAuditService");
      await auditSvc.recordWebsiteAuditEventInTransaction(client, {
        organizationId,
        branchId,
        actorUserId,
        actorRole: "branch_admin",
        actionType: wasResubmit ? "submission_resubmitted" : "submission_submitted",
        pageKey: updated.pageKey,
        sectionKey: updated.sectionKey,
        entityType: "website_change_submission",
        entityId: id,
        result: "success",
      });
      return { ok: true, status: STATUS.OK, submission: updated, resubmitted: wasResubmit };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "submit" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   branchId: string,
 *   submissionId: string,
 *   actorUserId: string,
 * }} opts
 */
async function withdrawBranchSubmission(db, opts) {
  const organizationId = opts.organizationId;
  const branchId = opts.branchId;
  const submissionId = opts.submissionId;
  const actorUserId = opts.actorUserId;
  if (
    !repo.isUuid(organizationId) ||
    !repo.isUuid(branchId) ||
    !repo.isUuid(submissionId) ||
    !repo.isUuid(actorUserId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }

  try {
    return await withTransaction(db, async (client) => {
      const existing = await repo.getSubmissionByOrgBranchAndId(
        client,
        organizationId,
        branchId,
        submissionId
      );
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };
      if (!canTransition(existing.status, "withdrawn")) {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          reason: "invalid_transition",
          from: existing.status,
        };
      }
      const updated = await repo.transitionBranchSubmission(client, {
        organizationId,
        branchId,
        submissionId,
        expectedStatus: existing.status,
        nextStatus: "withdrawn",
        clearReviewFields: false,
      });
      if (!updated) return { ok: false, status: STATUS.CONFLICT, reason: "stale" };
      await repo.appendEvent(client, {
        submissionId,
        organizationId,
        actorUserId,
        eventType: "withdrawn",
        comment: "Withdrawn by branch administrator",
      });
      const auditSvc = require("./websiteAuditService");
      await auditSvc.recordWebsiteAuditEventInTransaction(client, {
        organizationId,
        branchId,
        actorUserId,
        actorRole: "branch_admin",
        actionType: "submission_withdrawn",
        pageKey: updated.pageKey,
        sectionKey: updated.sectionKey,
        entityType: "website_change_submission",
        entityId: submissionId,
        result: "success",
      });
      return { ok: true, status: STATUS.OK, submission: updated };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "withdraw" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   branchId: string,
 *   submissionId: string,
 *   actorUserId: string,
 * }} opts
 */
async function duplicateBranchSubmissionDraft(db, opts) {
  if (
    !repo.isUuid(opts.organizationId) ||
    !repo.isUuid(opts.branchId) ||
    !repo.isUuid(opts.submissionId) ||
    !repo.isUuid(opts.actorUserId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    return await withTransaction(db, async (client) => {
      const existing = await repo.getSubmissionByOrgBranchAndId(
        client,
        opts.organizationId,
        opts.branchId,
        opts.submissionId
      );
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };
      if (existing.status !== "rejected") {
        return { ok: false, status: STATUS.CONFLICT, reason: "invalid_transition" };
      }
      const created = await repo.duplicateAsDraft(client, {
        organizationId: opts.organizationId,
        branchId: opts.branchId,
        sourceId: opts.submissionId,
        submittedBy: opts.actorUserId,
      });
      if (!created) return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "duplicate" };
      await repo.appendEvent(client, {
        submissionId: created.id,
        organizationId: opts.organizationId,
        actorUserId: opts.actorUserId,
        eventType: "created",
        comment: "Duplicated from rejected submission",
        metadata: { sourceSubmissionId: opts.submissionId },
      });
      return { ok: true, status: STATUS.OK, submission: created };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "duplicate" };
  }
}

/**
 * Conversation timeline (status events + comments) with visibility filtering.
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   submissionId: string,
 *   branchId?: string|null,
 *   includeInternal?: boolean,
 * }} opts
 */
async function listSubmissionConversation(db, opts) {
  const organizationId = opts && opts.organizationId;
  const submissionId = opts && opts.submissionId;
  if (!repo.isUuid(organizationId) || !repo.isUuid(submissionId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    let submission;
    if (opts.branchId) {
      if (!repo.isUuid(opts.branchId)) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "branch" };
      }
      submission = await repo.getSubmissionByOrgBranchAndId(
        db,
        organizationId,
        opts.branchId,
        submissionId
      );
    } else {
      submission = await repo.getSubmissionByOrgAndId(db, organizationId, submissionId);
    }
    if (!submission) return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };

    const includeInternal = Boolean(opts.includeInternal);
    const events = await repo.listEvents(db, organizationId, submissionId, {
      includeInternal,
    });
    return {
      ok: true,
      status: STATUS.OK,
      submission,
      events,
      eventLabels: {
        ...EVENT_LABELS,
        comment: "Comment",
      },
      includeInternal,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "conversation" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   submissionId: string,
 *   actorUserId: string,
 *   actorRole?: string|null,
 *   branchId?: string|null,
 *   comment: string,
 *   visibility?: string,
 *   pageKey?: string|null,
 *   sectionKey?: string|null,
 *   allowInternal?: boolean,
 * }} opts
 */
async function addSubmissionComment(db, opts) {
  const organizationId = opts && opts.organizationId;
  const submissionId = opts && opts.submissionId;
  const actorUserId = opts && opts.actorUserId;
  if (
    !repo.isUuid(organizationId) ||
    !repo.isUuid(submissionId) ||
    !repo.isUuid(actorUserId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  const text = requireText(opts.comment, 2000);
  if (!text.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "comment_required" };
  }

  let visibility = String(opts.visibility || "shared").toLowerCase();
  if (visibility !== "shared" && visibility !== "hq_internal") {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "visibility" };
  }
  if (visibility === "hq_internal" && !opts.allowInternal) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "internal_not_allowed" };
  }

  const pageKey =
    opts.pageKey && PAGE_KEY_RE.test(String(opts.pageKey))
      ? String(opts.pageKey)
      : null;
  const sectionKey =
    opts.sectionKey && SECTION_KEY_RE.test(String(opts.sectionKey))
      ? String(opts.sectionKey)
      : null;

  try {
    return await withTransaction(db, async (client) => {
      let submission;
      if (opts.branchId) {
        submission = await repo.getSubmissionByOrgBranchAndId(
          client,
          organizationId,
          opts.branchId,
          submissionId
        );
      } else {
        submission = await repo.getSubmissionByOrgAndId(
          client,
          organizationId,
          submissionId
        );
      }
      if (!submission) return { ok: false, status: STATUS.NOT_FOUND, reason: "submission" };

      const event = await repo.appendEvent(client, {
        submissionId,
        organizationId,
        actorUserId,
        eventType: "comment",
        comment: text.value,
        visibility,
        pageKey: pageKey || submission.pageKey || null,
        sectionKey: sectionKey || submission.sectionKey || null,
      });

      return {
        ok: true,
        status: STATUS.OK,
        event,
        submission,
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "comment" };
  }
}
