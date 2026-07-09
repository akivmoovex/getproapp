"use strict";

const NOTE_SELECT = `
  SELECT n.*,
         m.name AS ministry_name,
         l.full_name AS leader_name,
         ba.full_name AS reviewed_by_admin_name
  FROM public.church_ministry_activity_notes n
  LEFT JOIN public.church_ministries m ON m.id = n.ministry_id
  LEFT JOIN public.church_ministry_leaders l ON l.id = n.leader_id
  LEFT JOIN public.church_branch_admins ba ON ba.id = n.reviewed_by_admin_id
`;

function periodMonthFromYearMonth(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createOrUpdateActivityNote(pool, fields) {
  const reviewStatus = fields.status === "submitted" ? "submitted" : fields.review_status || "submitted";
  const r = await pool.query(
    `INSERT INTO public.church_ministry_activity_notes (
       organization_id, branch_id, ministry_id, department_id, leader_id,
       period_month, title, activity_summary, challenges, support_needed, status, review_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (leader_id, period_month) DO UPDATE SET
       title = EXCLUDED.title,
       activity_summary = EXCLUDED.activity_summary,
       challenges = EXCLUDED.challenges,
       support_needed = EXCLUDED.support_needed,
       status = EXCLUDED.status,
       review_status = CASE
         WHEN EXCLUDED.status = 'submitted' AND public.church_ministry_activity_notes.review_status = 'reviewed'
           THEN public.church_ministry_activity_notes.review_status
         WHEN EXCLUDED.status = 'submitted'
           THEN 'submitted'
         ELSE public.church_ministry_activity_notes.review_status
       END,
       updated_at = now()
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.ministry_id || null,
      fields.department_id || null,
      fields.leader_id,
      fields.period_month,
      fields.title,
      fields.activity_summary || "",
      fields.challenges || "",
      fields.support_needed || "",
      fields.status || "draft",
      fields.status === "submitted" ? "submitted" : reviewStatus,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leaderId
 * @returns {Promise<object[]>}
 */
async function listActivityNotesForLeader(pool, leaderId) {
  const r = await pool.query(
    `${NOTE_SELECT}
     WHERE n.leader_id = $1
     ORDER BY n.period_month DESC`,
    [leaderId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} noteId
 * @param {number} leaderId
 * @returns {Promise<object | null>}
 */
async function findActivityNoteByIdForLeader(pool, noteId, leaderId) {
  const r = await pool.query(
    `${NOTE_SELECT}
     WHERE n.id = $1 AND n.leader_id = $2
     LIMIT 1`,
    [noteId, leaderId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leaderId
 * @param {string} periodMonth
 * @returns {Promise<object | null>}
 */
async function findActivityNoteForLeaderPeriod(pool, leaderId, periodMonth) {
  const r = await pool.query(
    `${NOTE_SELECT}
     WHERE n.leader_id = $1 AND n.period_month = $2
     LIMIT 1`,
    [leaderId, periodMonth]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} noteId
 * @param {number} leaderId
 * @returns {Promise<object | null>}
 */
async function submitActivityNote(pool, noteId, leaderId) {
  const r = await pool.query(
    `UPDATE public.church_ministry_activity_notes
     SET status = 'submitted',
         review_status = 'submitted',
         updated_at = now()
     WHERE id = $1 AND leader_id = $2 AND status = 'draft'
     RETURNING id`,
    [noteId, leaderId]
  );
  if (!r.rows[0]) return null;
  return findActivityNoteByIdForLeader(pool, noteId, leaderId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ reviewStatus?: string, ministryId?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listActivityNotesForBranch(pool, branchId, opts = {}) {
  const params = [branchId];
  let where = "WHERE n.branch_id = $1 AND n.status = 'submitted'";

  const reviewStatus = String(opts.reviewStatus || "").trim();
  if (reviewStatus && reviewStatus !== "all") {
    params.push(reviewStatus);
    where += ` AND n.review_status = $${params.length}`;
  }

  if (opts.ministryId) {
    params.push(opts.ministryId);
    where += ` AND n.ministry_id = $${params.length}`;
  }

  const r = await pool.query(
    `${NOTE_SELECT}
     ${where}
     ORDER BY n.period_month DESC, n.updated_at DESC`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ reviewStatus?: string }} opts
 * @returns {Promise<object[]>}
 */
async function listSubmittedActivityNotesForBranch(pool, branchId, opts = {}) {
  return listActivityNotesForBranch(pool, branchId, opts);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {string} periodMonth
 * @returns {Promise<object[]>}
 */
async function listSubmittedActivityNotesForBranchPeriod(pool, branchId, periodMonth) {
  const r = await pool.query(
    `${NOTE_SELECT}
     WHERE n.branch_id = $1 AND n.status = 'submitted' AND n.period_month = $2
     ORDER BY m.name ASC, l.full_name ASC`,
    [branchId, periodMonth]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} noteId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findActivityNoteByIdForBranch(pool, noteId, branchId) {
  const r = await pool.query(
    `${NOTE_SELECT}
     WHERE n.id = $1 AND n.branch_id = $2
     LIMIT 1`,
    [noteId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} noteId
 * @param {number} branchId
 * @param {number} adminId
 * @param {string | null} adminComment
 * @returns {Promise<object | null>}
 */
async function markActivityNoteReviewedForBranch(pool, noteId, branchId, adminId, adminComment) {
  const r = await pool.query(
    `UPDATE public.church_ministry_activity_notes
     SET review_status = 'reviewed',
         reviewed_by_admin_id = $1,
         reviewed_at = now(),
         admin_comment = COALESCE($2, admin_comment),
         updated_at = now()
     WHERE id = $3 AND branch_id = $4 AND status = 'submitted'
     RETURNING id`,
    [adminId, adminComment, noteId, branchId]
  );
  if (!r.rows[0]) return null;
  return findActivityNoteByIdForBranch(pool, noteId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} noteId
 * @param {number} branchId
 * @param {number} adminId
 * @param {string} adminComment
 * @returns {Promise<object | null>}
 */
async function requestActivityNoteFollowUpForBranch(pool, noteId, branchId, adminId, adminComment) {
  const r = await pool.query(
    `UPDATE public.church_ministry_activity_notes
     SET review_status = 'follow_up_requested',
         reviewed_by_admin_id = $1,
         reviewed_at = now(),
         admin_comment = $2,
         updated_at = now()
     WHERE id = $3 AND branch_id = $4 AND status = 'submitted'
     RETURNING id`,
    [adminId, adminComment, noteId, branchId]
  );
  if (!r.rows[0]) return null;
  return findActivityNoteByIdForBranch(pool, noteId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<Record<string, number>>}
 */
async function countActivityNotesByReviewStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT review_status, COUNT(*)::int AS count
     FROM public.church_ministry_activity_notes
     WHERE branch_id = $1 AND status = 'submitted'
     GROUP BY review_status`,
    [branchId]
  );
  const out = { submitted: 0, reviewed: 0, follow_up_requested: 0 };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(out, row.review_status)) {
      out[row.review_status] = row.count;
    }
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<object>}
 */
async function getMinistryActivitySummaryForBranchPeriod(pool, branchId, year, month) {
  const periodMonth = periodMonthFromYearMonth(year, month);
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS notes_submitted,
       COUNT(DISTINCT ministry_id)::int AS ministries_with_notes,
       COUNT(*) FILTER (WHERE review_status = 'reviewed')::int AS notes_reviewed,
       COUNT(*) FILTER (WHERE review_status = 'follow_up_requested')::int AS follow_up_requested,
       COUNT(*) FILTER (WHERE review_status = 'submitted')::int AS notes_pending_review
     FROM public.church_ministry_activity_notes
     WHERE branch_id = $1 AND status = 'submitted' AND period_month = $2`,
    [branchId, periodMonth]
  );
  const row = r.rows[0] || {};
  return {
    period_month: periodMonth,
    notes_submitted: row.notes_submitted ?? 0,
    ministries_with_notes: row.ministries_with_notes ?? 0,
    notes_reviewed: row.notes_reviewed ?? 0,
    follow_up_requested: row.follow_up_requested ?? 0,
    notes_pending_review: row.notes_pending_review ?? 0,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} ministryId
 * @param {number} branchId
 * @param {{ limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listActivityNotesForMinistry(pool, ministryId, branchId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 10, 1), 50);
  const r = await pool.query(
    `${NOTE_SELECT}
     WHERE n.branch_id = $1 AND n.ministry_id = $2 AND n.status = 'submitted'
     ORDER BY n.period_month DESC
     LIMIT $3`,
    [branchId, ministryId, limit]
  );
  return r.rows;
}

module.exports = {
  createOrUpdateActivityNote,
  listActivityNotesForLeader,
  findActivityNoteByIdForLeader,
  findActivityNoteForLeaderPeriod,
  submitActivityNote,
  listActivityNotesForBranch,
  listSubmittedActivityNotesForBranch,
  listSubmittedActivityNotesForBranchPeriod,
  findActivityNoteByIdForBranch,
  markActivityNoteReviewedForBranch,
  requestActivityNoteFollowUpForBranch,
  countActivityNotesByReviewStatusForBranch,
  getMinistryActivitySummaryForBranchPeriod,
  listActivityNotesForMinistry,
  periodMonthFromYearMonth,
};
