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
  "pending_review",
  "changes_requested",
  "approved",
  "rejected",
  "published",
  "withdrawn",
]);

const STATUS_LABELS = Object.freeze({
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
});

/** Minimum valid transitions for HQ review (+ publish marker). */
const TRANSITIONS = Object.freeze({
  pending_review: new Set(["approved", "changes_requested", "rejected"]),
  changes_requested: new Set(["pending_review"]),
  approved: new Set(["published"]),
});

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
    const events = await repo.listEvents(db, organizationId, submissionId);
    const comparison = buildContentComparison(
      submission.currentContent,
      submission.proposedContent
    );
    const reviewable = submission.status === "pending_review";
    return {
      ok: true,
      status: STATUS.OK,
      submission,
      events,
      comparison,
      reviewable,
      /** Proposed content is not served by existing preview routes. */
      proposedPreviewSupported: false,
      /** Site publish is separate; no atomic apply+publish path. */
      approveAndPublishNowSupported: false,
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
      return { ok: true, status: STATUS.OK, submission: updated };
    });
  } catch {
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
  const feedback = requireText(opts.feedback, 2000);
  if (!feedback.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "feedback_required" };
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
  const reason = requireText(opts.rejectionReason, 2000);
  if (!reason.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "rejection_reason_required" };
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
  statusLabel,
  eventLabel,
  canTransition,
  buildContentComparison,
  loadSubmissionsList,
  loadSubmissionReview,
  approveSubmission,
  requestChanges,
  rejectSubmission,
  insertSubmission: repo.insertSubmission,
  appendEvent: repo.appendEvent,
};
