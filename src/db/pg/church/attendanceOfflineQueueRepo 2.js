"use strict";

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {object} fields
 */
async function insertQueueItem(db, fields) {
  const r = await db.query(
    `INSERT INTO public.church_attendance_offline_queue (
       organization_id, branch_id, platform_tenant_id, client_item_id,
       service_session_id, member_id, check_in_kind, visitor_name, visitor_phone,
       captured_at_client, capture_source, sync_status, payload_json
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
     ON CONFLICT (organization_id, branch_id, client_item_id) DO NOTHING
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.platform_tenant_id,
      fields.client_item_id,
      fields.service_session_id,
      fields.member_id ?? null,
      fields.check_in_kind || "member",
      fields.visitor_name ?? null,
      fields.visitor_phone ?? null,
      fields.captured_at_client,
      fields.capture_source || "",
      fields.sync_status || "pending",
      JSON.stringify(fields.payload_json || {}),
    ]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {number} branchId
 * @param {string} clientItemId
 */
async function findQueueItemByClientId(db, organizationId, branchId, clientItemId) {
  const r = await db.query(
    `SELECT * FROM public.church_attendance_offline_queue
     WHERE organization_id = $1 AND branch_id = $2 AND client_item_id = $3
     LIMIT 1`,
    [organizationId, branchId, clientItemId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} queueId
 * @param {number} branchId
 */
async function findQueueItemByIdForBranch(db, queueId, branchId) {
  const r = await db.query(
    `SELECT * FROM public.church_attendance_offline_queue
     WHERE id = $1 AND branch_id = $2
     LIMIT 1`,
    [queueId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} queueId
 * @param {object} fields
 */
async function updateQueueItemStatus(db, queueId, fields) {
  const r = await db.query(
    `UPDATE public.church_attendance_offline_queue
     SET sync_status = COALESCE($2, sync_status),
         synced_check_in_id = COALESCE($3, synced_check_in_id),
         conflict_reason = COALESCE($4, conflict_reason),
         last_error = COALESCE($5, last_error),
         retry_count = COALESCE($6, retry_count),
         synced_at = CASE WHEN $2 = 'synced' THEN now() ELSE synced_at END,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      queueId,
      fields.sync_status ?? null,
      fields.synced_check_in_id ?? null,
      fields.conflict_reason ?? null,
      fields.last_error ?? null,
      fields.retry_count ?? null,
    ]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ statuses?: string[], limit?: number }} [opts]
 */
async function listQueueItemsForBranch(pool, branchId, opts = {}) {
  const statuses = opts.statuses || ["pending", "failed"];
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const r = await pool.query(
    `SELECT *
     FROM public.church_attendance_offline_queue
     WHERE branch_id = $1 AND sync_status = ANY($2::text[])
     ORDER BY captured_at_client ASC, id ASC
     LIMIT $3`,
    [branchId, statuses, limit]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 */
async function countQueueByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT sync_status, COUNT(*)::int AS c
     FROM public.church_attendance_offline_queue
     WHERE branch_id = $1
     GROUP BY sync_status`,
    [branchId]
  );
  const out = { pending: 0, synced: 0, duplicate: 0, conflict: 0, failed: 0, review_required: 0 };
  for (const row of r.rows) {
    out[row.sync_status] = row.c;
  }
  return out;
}

module.exports = {
  insertQueueItem,
  findQueueItemByClientId,
  findQueueItemByIdForBranch,
  updateQueueItemStatus,
  listQueueItemsForBranch,
  countQueueByStatusForBranch,
};
