"use strict";

/**
 * Append-only audit log for field agent submission moderation.
 * Inserts are fail-open (errors logged, never thrown) so moderation workflows are not blocked.
 */

/**
 * @param {import("pg").Pool} pool
 * @param {{
 *   tenantId: number,
 *   submissionId: number,
 *   adminUserId: number,
 *   actionType: 'approve'|'reject'|'info_needed'|'appeal',
 *   previousStatus: string,
 *   newStatus: string,
 *   metadata?: object | null,
 * }} row
 */
async function insertAuditRecord(pool, row) {
  const tid = Number(row.tenantId);
  const sid = Number(row.submissionId);
  const aid = Number(row.adminUserId);
  const prev = String(row.previousStatus || "").trim();
  const next = String(row.newStatus || "").trim();
  const action = String(row.actionType || "").trim();
  const allowed = ["approve", "reject", "info_needed", "appeal"];
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1 || !Number.isFinite(aid) || aid < 1) return;
  if (!allowed.includes(action) || !prev || !next) return;
  let meta = row.metadata;
  if (meta != null && typeof meta === "object" && !Array.isArray(meta) && Object.keys(meta).length === 0) {
    meta = null;
  }
  try {
    await pool.query(
      `
      INSERT INTO public.field_agent_submission_audit
        (tenant_id, submission_id, admin_user_id, action_type, previous_status, new_status, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [tid, sid, aid, action, prev, next, meta == null ? null : JSON.stringify(meta)]
    );
  } catch (err) {
    console.error(
      "[field_agent_submission_audit] insert failed:",
      err && err.message ? String(err.message).slice(0, 300) : err
    );
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} submissionId
 * @param {{ limit?: number }} [opts]
 */
async function listAuditBySubmission(pool, tenantId, submissionId, opts) {
  const tid = Number(tenantId);
  const sid = Number(submissionId);
  const limit = Math.min(Math.max(Number((opts && opts.limit) || 200), 1), 500);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1) return [];
  const r = await pool.query(
    `
    SELECT
      a.id,
      a.action_type,
      a.previous_status,
      a.new_status,
      a.metadata,
      a.created_at,
      a.admin_user_id,
      u.username AS admin_username,
      u.display_name AS admin_display_name
    FROM public.field_agent_submission_audit a
    LEFT JOIN public.admin_users u ON u.id = a.admin_user_id
    WHERE a.tenant_id = $1 AND a.submission_id = $2
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT $3
    `,
    [tid, sid, limit]
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    action_type: String(row.action_type || ""),
    previous_status: String(row.previous_status || ""),
    new_status: String(row.new_status || ""),
    metadata: row.metadata || null,
    created_at: row.created_at,
    admin_user_id: Number(row.admin_user_id),
    admin_username: row.admin_username != null ? String(row.admin_username) : "",
    admin_display_name: row.admin_display_name != null ? String(row.admin_display_name) : "",
  }));
}

module.exports = {
  insertAuditRecord,
  listAuditBySubmission,
};
