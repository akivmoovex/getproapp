"use strict";

/**
 * Phase3 website change submission persistence (HQ review workflow).
 * Callers own transactions for review decisions.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function mapSubmission(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    churchId: row.church_id || row.branch_church_id || null,
    branchId: row.branch_id,
    branchName: row.branch_display_name || null,
    branchKey: row.branch_key || null,
    title: row.title,
    pageKey: row.page_key,
    sectionKey: row.section_key,
    changeType: row.change_type,
    currentContent: row.current_content_json || {},
    proposedContent: row.proposed_content_json || {},
    reason: row.reason,
    submitterNote: row.submitter_note,
    status: row.status,
    submittedBy: row.submitted_by,
    submittedByName: row.submitter_display_name || null,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewedByName: row.reviewer_display_name || null,
    reviewedAt: row.reviewed_at,
    reviewerComment: row.reviewer_comment,
    rejectionReason: row.rejection_reason,
    priority: row.priority || "normal",
    requestedPublicationDate: row.requested_publication_date || null,
    checklist: row.checklist_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    submissionId: row.submission_id,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_display_name || null,
    eventType: row.event_type,
    comment: row.comment,
    visibility: row.visibility || "shared",
    pageKey: row.page_key || null,
    sectionKey: row.section_key || null,
    metadata: row.metadata_json || {},
    createdAt: row.created_at,
  };
}

const LIST_SELECT = `
  SELECT
    s.*,
    b.church_id AS church_id,
    b.display_name AS branch_display_name,
    b.branch_key,
    su.display_name AS submitter_display_name,
    ru.display_name AS reviewer_display_name
  FROM blessboard.website_change_submissions s
  INNER JOIN blessboard.branches b ON b.id = s.branch_id
  INNER JOIN blessboard.users su ON su.id = s.submitted_by
  LEFT JOIN blessboard.users ru ON ru.id = s.reviewed_by
`;

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   organizationId: string,
 *   q?: string|null,
 *   status?: string|null,
 *   branchId?: string|null,
 *   pageKey?: string|null,
 *   submittedBy?: string|null,
 *   submittedFrom?: string|Date|null,
 *   submittedTo?: string|Date|null,
 *   limit?: number,
 *   offset?: number,
 * }} filters
 */
async function listSubmissions(db, filters) {
  const organizationId = filters && filters.organizationId;
  if (!isUuid(organizationId)) return { items: [], total: 0 };

  const where = ["s.organization_id = $1"];
  const params = [organizationId];
  let i = 2;

  const q = filters.q != null ? String(filters.q).trim().slice(0, 100) : "";
  if (q) {
    where.push(
      `(s.title ILIKE $${i} OR b.display_name ILIKE $${i} OR su.display_name ILIKE $${i} OR s.page_key ILIKE $${i})`
    );
    params.push(`%${q}%`);
    i += 1;
  }

  if (filters.status && String(filters.status).trim()) {
    where.push(`s.status = $${i}`);
    params.push(String(filters.status).trim());
    i += 1;
  }

  if (Object.prototype.hasOwnProperty.call(filters, "branchId")) {
    if (filters.branchId && isUuid(filters.branchId)) {
      where.push(`s.branch_id = $${i}`);
      params.push(filters.branchId);
      i += 1;
    } else {
      where.push(`s.branch_id IS NULL`);
    }
  }

  if (filters.pageKey && String(filters.pageKey).trim()) {
    where.push(`s.page_key = $${i}`);
    params.push(String(filters.pageKey).trim().slice(0, 64));
    i += 1;
  }

  if (filters.submittedBy && isUuid(filters.submittedBy)) {
    where.push(`s.submitted_by = $${i}`);
    params.push(filters.submittedBy);
    i += 1;
  }

  if (filters.submittedFrom) {
    where.push(`s.submitted_at >= $${i}::timestamptz`);
    params.push(filters.submittedFrom);
    i += 1;
  }

  if (filters.submittedTo) {
    where.push(`s.submitted_at < ($${i}::date + INTERVAL '1 day')`);
    params.push(filters.submittedTo);
    i += 1;
  }

  const whereSql = where.join(" AND ");
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.website_change_submissions s
       INNER JOIN blessboard.branches b ON b.id = s.branch_id
       INNER JOIN blessboard.users su ON su.id = s.submitted_by
      WHERE ${whereSql}`,
    params
  );

  const listParams = params.concat([limit, offset]);
  const listRes = await db.query(
    `${LIST_SELECT}
      WHERE ${whereSql}
      ORDER BY s.submitted_at DESC, s.id DESC
      LIMIT $${i} OFFSET $${i + 1}`,
    listParams
  );

  return {
    items: (listRes.rows || []).map(mapSubmission),
    total: countRes.rows[0] ? Number(countRes.rows[0].n) : 0,
  };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {string} submissionId
 */
async function getSubmissionByOrgAndId(db, organizationId, submissionId) {
  if (!isUuid(organizationId) || !isUuid(submissionId)) return null;
  const res = await db.query(
    `${LIST_SELECT}
      WHERE s.organization_id = $1 AND s.id = $2
      LIMIT 1`,
    [organizationId, submissionId]
  );
  return mapSubmission(res.rows[0] || null);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 */
async function countStatusSummary(db, organizationId) {
  const empty = {
    pendingReview: 0,
    changesRequested: 0,
    approvedToday: 0,
    recentlyPublished: 0,
  };
  if (!isUuid(organizationId)) return empty;

  const res = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending_review,
       COUNT(*) FILTER (WHERE status = 'changes_requested')::int AS changes_requested,
       COUNT(*) FILTER (
         WHERE status = 'approved'
           AND reviewed_at IS NOT NULL
           AND reviewed_at >= date_trunc('day', now())
       )::int AS approved_today,
       COUNT(*) FILTER (
         WHERE status = 'published'
           AND updated_at >= (now() - INTERVAL '7 days')
       )::int AS recently_published
     FROM blessboard.website_change_submissions
     WHERE organization_id = $1`,
    [organizationId]
  );
  const row = res.rows[0] || {};
  return {
    pendingReview: Number(row.pending_review) || 0,
    changesRequested: Number(row.changes_requested) || 0,
    approvedToday: Number(row.approved_today) || 0,
    recentlyPublished: Number(row.recently_published) || 0,
  };
}

/**
 * Active branches for an organization (filter dropdowns).
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 */
async function listBranchesForOrganization(db, organizationId) {
  if (!isUuid(organizationId)) return [];
  const res = await db.query(
    `SELECT b.id, b.branch_key, b.display_name
       FROM blessboard.branches b
       INNER JOIN blessboard.churches c ON c.id = b.church_id
      WHERE c.organization_id = $1
        AND b.status = 'active'
      ORDER BY b.is_primary DESC, b.display_name ASC`,
    [organizationId]
  );
  return (res.rows || []).map((r) => ({
    id: r.id,
    key: r.branch_key,
    displayName: r.display_name,
  }));
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 */
async function listDistinctPageKeys(db, organizationId) {
  if (!isUuid(organizationId)) return [];
  const res = await db.query(
    `SELECT DISTINCT page_key
       FROM blessboard.website_change_submissions
      WHERE organization_id = $1
      ORDER BY page_key ASC`,
    [organizationId]
  );
  return (res.rows || []).map((r) => r.page_key);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 */
async function listSubmitters(db, organizationId) {
  if (!isUuid(organizationId)) return [];
  const res = await db.query(
    `SELECT DISTINCT u.id, u.display_name
       FROM blessboard.website_change_submissions s
       INNER JOIN blessboard.users u ON u.id = s.submitted_by
      WHERE s.organization_id = $1
      ORDER BY u.display_name ASC`,
    [organizationId]
  );
  return (res.rows || []).map((r) => ({ id: r.id, displayName: r.display_name }));
}

/**
 * Insert a submission (test fixtures / future branch UI).
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} input
 */
async function insertSubmission(db, input) {
  const status = input.status || "draft";
  const submittedAt =
    input.submittedAt != null
      ? input.submittedAt
      : status === "draft"
        ? null
        : new Date().toISOString();
  const res = await db.query(
    `INSERT INTO blessboard.website_change_submissions (
       organization_id, branch_id, title, page_key, section_key, change_type,
       current_content_json, proposed_content_json, reason, submitter_note,
       status, submitted_by, submitted_at, priority, requested_publication_date,
       checklist_json
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7::jsonb, $8::jsonb, $9, $10,
       $11, $12, $13::timestamptz, COALESCE($14, 'normal'), $15::date,
       $16::jsonb
     )
     RETURNING *`,
    [
      input.organizationId,
      input.branchId,
      input.title,
      input.pageKey,
      input.sectionKey || null,
      input.changeType,
      JSON.stringify(input.currentContent || {}),
      JSON.stringify(input.proposedContent || {}),
      input.reason || null,
      input.submitterNote || null,
      status,
      input.submittedBy,
      submittedAt,
      input.priority || "normal",
      input.requestedPublicationDate || null,
      JSON.stringify(input.checklist || {}),
    ]
  );
  return mapSubmission(res.rows[0]);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {string} branchId
 * @param {string} submissionId
 */
async function getSubmissionByOrgBranchAndId(db, organizationId, branchId, submissionId) {
  if (!isUuid(organizationId) || !isUuid(branchId) || !isUuid(submissionId)) return null;
  const res = await db.query(
    `${LIST_SELECT}
      WHERE s.organization_id = $1 AND s.branch_id = $2 AND s.id = $3
      LIMIT 1`,
    [organizationId, branchId, submissionId]
  );
  return mapSubmission(res.rows[0] || null);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {string} branchId
 */
async function countBranchStatusSummary(db, organizationId, branchId) {
  const empty = {
    draft: 0,
    pendingReview: 0,
    changesRequested: 0,
    approved: 0,
  };
  if (!isUuid(organizationId) || !isUuid(branchId)) return empty;
  const res = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'draft')::int AS draft,
       COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending_review,
       COUNT(*) FILTER (WHERE status = 'changes_requested')::int AS changes_requested,
       COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
     FROM blessboard.website_change_submissions
     WHERE organization_id = $1 AND branch_id = $2`,
    [organizationId, branchId]
  );
  const row = res.rows[0] || {};
  return {
    draft: Number(row.draft) || 0,
    pendingReview: Number(row.pending_review) || 0,
    changesRequested: Number(row.changes_requested) || 0,
    approved: Number(row.approved) || 0,
  };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   organizationId: string,
 *   branchId: string,
 *   submissionId: string,
 *   expectedStatuses: string[],
 *   title: string,
 *   pageKey: string,
 *   sectionKey?: string|null,
 *   changeType: string,
 *   currentContent?: object,
 *   proposedContent?: object,
 *   reason?: string|null,
 *   submitterNote?: string|null,
 *   priority?: string,
 *   requestedPublicationDate?: string|null,
 *   checklist?: object,
 * }} input
 */
async function updateDraftSubmission(db, input) {
  const statuses = Array.isArray(input.expectedStatuses)
    ? input.expectedStatuses
    : ["draft", "changes_requested"];
  const res = await db.query(
    `UPDATE blessboard.website_change_submissions
        SET title = $4,
            page_key = $5,
            section_key = $6,
            change_type = $7,
            current_content_json = $8::jsonb,
            proposed_content_json = $9::jsonb,
            reason = $10,
            submitter_note = $11,
            priority = COALESCE($12, priority),
            requested_publication_date = $13::date,
            checklist_json = COALESCE($14::jsonb, checklist_json),
            updated_at = now()
      WHERE organization_id = $1
        AND branch_id = $2
        AND id = $3
        AND status = ANY($15::text[])
      RETURNING *`,
    [
      input.organizationId,
      input.branchId,
      input.submissionId,
      input.title,
      input.pageKey,
      input.sectionKey || null,
      input.changeType,
      JSON.stringify(input.currentContent || {}),
      JSON.stringify(input.proposedContent || {}),
      input.reason || null,
      input.submitterNote || null,
      input.priority || null,
      input.requestedPublicationDate || null,
      input.checklist ? JSON.stringify(input.checklist) : null,
      statuses,
    ]
  );
  return mapSubmission(res.rows[0] || null);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   organizationId: string,
 *   branchId: string,
 *   submissionId: string,
 *   expectedStatus: string,
 *   nextStatus: string,
 *   clearReviewFields?: boolean,
 * }} input
 */
async function transitionBranchSubmission(db, input) {
  const clear = Boolean(input.clearReviewFields);
  const res = await db.query(
    `UPDATE blessboard.website_change_submissions
        SET status = $5,
            submitted_at = CASE
              WHEN $5 IN ('pending_review') THEN COALESCE(submitted_at, now())
              ELSE submitted_at
            END,
            reviewer_comment = CASE WHEN $6::boolean THEN NULL ELSE reviewer_comment END,
            rejection_reason = CASE WHEN $6::boolean THEN NULL ELSE rejection_reason END,
            reviewed_by = CASE WHEN $6::boolean THEN NULL ELSE reviewed_by END,
            reviewed_at = CASE WHEN $6::boolean THEN NULL ELSE reviewed_at END,
            updated_at = now()
      WHERE organization_id = $1
        AND branch_id = $2
        AND id = $3
        AND status = $4
      RETURNING *`,
    [
      input.organizationId,
      input.branchId,
      input.submissionId,
      input.expectedStatus,
      input.nextStatus,
      clear,
    ]
  );
  return mapSubmission(res.rows[0] || null);
}

/**
 * Lightweight duplicate as draft (rejected → new draft).
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   organizationId: string,
 *   branchId: string,
 *   sourceId: string,
 *   submittedBy: string,
 * }} input
 */
async function duplicateAsDraft(db, input) {
  const source = await getSubmissionByOrgBranchAndId(
    db,
    input.organizationId,
    input.branchId,
    input.sourceId
  );
  if (!source) return null;
  return insertSubmission(db, {
    organizationId: input.organizationId,
    branchId: input.branchId,
    title: source.title,
    pageKey: source.pageKey,
    sectionKey: source.sectionKey,
    changeType: source.changeType,
    currentContent: source.currentContent,
    proposedContent: source.proposedContent,
    reason: source.reason,
    submitterNote: source.submitterNote,
    priority: source.priority,
    checklist: source.checklist,
    status: "draft",
    submittedBy: input.submittedBy,
  });
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   organizationId: string,
 *   submissionId: string,
 *   expectedStatus: string,
 *   nextStatus: string,
 *   reviewedBy: string,
 *   reviewerComment?: string|null,
 *   rejectionReason?: string|null,
 * }} decision
 */
async function applyReviewDecision(db, decision) {
  const res = await db.query(
    `UPDATE blessboard.website_change_submissions
        SET status = $4,
            reviewed_by = $5,
            reviewed_at = now(),
            reviewer_comment = $6,
            rejection_reason = $7,
            updated_at = now()
      WHERE organization_id = $1
        AND id = $2
        AND status = $3
      RETURNING *`,
    [
      decision.organizationId,
      decision.submissionId,
      decision.expectedStatus,
      decision.nextStatus,
      decision.reviewedBy,
      decision.reviewerComment || null,
      decision.rejectionReason || null,
    ]
  );
  return mapSubmission(res.rows[0] || null);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   submissionId: string,
 *   organizationId: string,
 *   actorUserId?: string|null,
 *   eventType: string,
 *   comment?: string|null,
 *   metadata?: object,
 * }} event
 */
async function appendEvent(db, event) {
  const res = await db.query(
    `INSERT INTO blessboard.website_change_submission_events (
       submission_id, organization_id, actor_user_id, event_type, comment,
       visibility, page_key, section_key, metadata_json
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING *`,
    [
      event.submissionId,
      event.organizationId,
      event.actorUserId || null,
      event.eventType,
      event.comment || null,
      event.visibility || "shared",
      event.pageKey || null,
      event.sectionKey || null,
      JSON.stringify(event.metadata || {}),
    ]
  );
  return mapEvent(res.rows[0]);
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {string} submissionId
 * @param {{ includeInternal?: boolean }} [opts]
 */
async function listEvents(db, organizationId, submissionId, opts) {
  if (!isUuid(organizationId) || !isUuid(submissionId)) return [];
  const includeInternal = Boolean(opts && opts.includeInternal);
  const res = await db.query(
    `SELECT e.*, u.display_name AS actor_display_name
       FROM blessboard.website_change_submission_events e
       LEFT JOIN blessboard.users u ON u.id = e.actor_user_id
      WHERE e.organization_id = $1
        AND e.submission_id = $2
        AND ($3::boolean OR e.visibility = 'shared')
      ORDER BY e.created_at ASC, e.id ASC`,
    [organizationId, submissionId, includeInternal]
  );
  return (res.rows || []).map(mapEvent);
}

/**
 * Mark approved submissions published for one website scope (called inside publish TX).
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string} organizationId
 * @param {string|null} actorUserId
 * @param {string|null|undefined} [branchId]
 *   - set: mark approved submissions for that branch only
 *   - null/omitted: church-wide publish includes all approved org submissions
 *     (HQ + approved branch updates shown on the publish review)
 */
async function markApprovedSubmissionsPublished(db, organizationId, actorUserId, branchId) {
  if (!isUuid(organizationId)) return [];
  const scopedBranchId =
    branchId != null && String(branchId).trim() ? String(branchId).trim() : null;
  const res = scopedBranchId
    ? await db.query(
        `UPDATE blessboard.website_change_submissions
            SET status = 'published',
                updated_at = now()
          WHERE organization_id = $1
            AND status = 'approved'
            AND branch_id = $2
          RETURNING id`,
        [organizationId, scopedBranchId]
      )
    : await db.query(
        `UPDATE blessboard.website_change_submissions
            SET status = 'published',
                updated_at = now()
          WHERE organization_id = $1
            AND status = 'approved'
          RETURNING id`,
        [organizationId]
      );
  const rows = res.rows || [];
  for (const row of rows) {
    await appendEvent(db, {
      submissionId: row.id,
      organizationId,
      actorUserId: actorUserId || null,
      eventType: "published",
      comment: "Included in website publication",
    });
  }
  return rows.map((r) => r.id);
}

module.exports = {
  isUuid,
  listSubmissions,
  getSubmissionByOrgAndId,
  getSubmissionByOrgBranchAndId,
  countStatusSummary,
  countBranchStatusSummary,
  listBranchesForOrganization,
  listDistinctPageKeys,
  listSubmitters,
  insertSubmission,
  updateDraftSubmission,
  transitionBranchSubmission,
  duplicateAsDraft,
  applyReviewDecision,
  appendEvent,
  listEvents,
  markApprovedSubmissionsPublished,
};
