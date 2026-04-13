"use strict";

/**
 * Statement disputes (tenant-scoped; no changes to pay-run snapshot rows).
 */

/**
 * @param {import("pg").Pool} pool
 * @param {{
 *   tenantId: number,
 *   payRunId: number,
 *   payRunItemId: number,
 *   fieldAgentId: number,
 *   disputeReason: string,
 *   disputeNotes: string | null,
 * }} p
 */
async function createDispute(pool, { tenantId, payRunId, payRunItemId, fieldAgentId, disputeReason, disputeNotes }) {
  const tid = Number(tenantId);
  const prid = Number(payRunId);
  const iid = Number(payRunItemId);
  const fid = Number(fieldAgentId);
  const reason = String(disputeReason || "").trim().slice(0, 4000);
  const notes = disputeNotes != null ? String(disputeNotes).trim().slice(0, 8000) : null;
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(prid) || prid < 1 || !Number.isFinite(iid) || iid < 1 || !Number.isFinite(fid) || fid < 1) {
    return { dispute: null, error: "INVALID" };
  }
  if (!reason) return { dispute: null, error: "REASON_REQUIRED" };
  const r = await pool.query(
    `
    INSERT INTO public.field_agent_pay_run_disputes (
      tenant_id, pay_run_id, pay_run_item_id, field_agent_id,
      status, dispute_reason, dispute_notes, updated_at
    ) VALUES ($1, $2, $3, $4, 'open', $5, $6, now())
    RETURNING *
    `,
    [tid, prid, iid, fid, reason, notes]
  );
  return { dispute: r.rows[0], error: null };
}

async function getActiveDisputeForPayRunItem(pool, tenantId, payRunItemId) {
  const tid = Number(tenantId);
  const iid = Number(payRunItemId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(iid) || iid < 1) return null;
  const r = await pool.query(
    `
    SELECT * FROM public.field_agent_pay_run_disputes
    WHERE tenant_id = $1 AND pay_run_item_id = $2 AND status IN ('open', 'under_review')
    LIMIT 1
    `,
    [tid, iid]
  );
  return r.rows[0] ?? null;
}

async function listDisputesForFieldAgent(pool, tenantId, fieldAgentId, limit = 50) {
  const tid = Number(tenantId);
  const fid = Number(fieldAgentId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(fid) || fid < 1) return [];
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const r = await pool.query(
    `
    SELECT d.*,
           pr.period_start, pr.period_end, pr.status AS pay_run_status
    FROM public.field_agent_pay_run_disputes d
    INNER JOIN public.field_agent_pay_runs pr ON pr.id = d.pay_run_id AND pr.tenant_id = d.tenant_id
    WHERE d.tenant_id = $1 AND d.field_agent_id = $2
    ORDER BY d.created_at DESC
    LIMIT $3
    `,
    [tid, fid, lim]
  );
  return r.rows;
}

async function listDisputesForAdmin(pool, tenantId, filters = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const status = filters.status != null && String(filters.status).trim() !== "" ? String(filters.status).trim() : null;
  const lim = Math.min(Math.max(Number(filters.limit) || 100, 1), 500);
  const params = [tid];
  let where = "d.tenant_id = $1";
  if (status && ["open", "under_review", "resolved", "rejected"].includes(status)) {
    params.push(status);
    where += ` AND d.status = $${params.length}`;
  }
  params.push(lim);
  const r = await pool.query(
    `
    SELECT d.*,
           pr.period_start, pr.period_end, pr.status AS pay_run_status,
           i.field_agent_label_snapshot
    FROM public.field_agent_pay_run_disputes d
    INNER JOIN public.field_agent_pay_runs pr ON pr.id = d.pay_run_id AND pr.tenant_id = d.tenant_id
    INNER JOIN public.field_agent_pay_run_items i ON i.id = d.pay_run_item_id AND i.tenant_id = d.tenant_id
    WHERE ${where}
    ORDER BY d.created_at DESC
    LIMIT $${params.length}
    `,
    params
  );
  return r.rows;
}

async function getDisputeById(pool, disputeId) {
  const id = Number(disputeId);
  if (!Number.isFinite(id) || id < 1) return null;
  const r = await pool.query(`SELECT * FROM public.field_agent_pay_run_disputes WHERE id = $1 LIMIT 1`, [id]);
  return r.rows[0] ?? null;
}

async function getDisputeByIdForTenant(pool, disputeId, tenantId) {
  const id = Number(disputeId);
  const tid = Number(tenantId);
  if (!Number.isFinite(id) || id < 1 || !Number.isFinite(tid) || tid < 1) return null;
  const r = await pool.query(
    `SELECT * FROM public.field_agent_pay_run_disputes WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [id, tid]
  );
  return r.rows[0] ?? null;
}

async function getDisputeByIdForFieldAgent(pool, disputeId, tenantId, fieldAgentId) {
  const d = await getDisputeByIdForTenant(pool, disputeId, tenantId);
  if (!d) return null;
  if (Number(d.field_agent_id) !== Number(fieldAgentId)) return null;
  return d;
}

/**
 * @returns {{ dispute: object | null, error: 'NOT_FOUND' | 'INVALID_TRANSITION' | 'FINAL' | null }}
 */
async function updateDisputeStatus(pool, disputeId, tenantId, newStatus, adminUserId, adminNotes) {
  const id = Number(disputeId);
  const tid = Number(tenantId);
  const aid = adminUserId != null && Number.isFinite(Number(adminUserId)) && Number(adminUserId) > 0 ? Number(adminUserId) : null;
  if (!Number.isFinite(id) || id < 1 || !Number.isFinite(tid) || tid < 1) {
    return { dispute: null, error: "NOT_FOUND" };
  }
  const cur = await getDisputeByIdForTenant(pool, id, tid);
  if (!cur) return { dispute: null, error: "NOT_FOUND" };
  const st = String(cur.status);
  if (st === "resolved" || st === "rejected") return { dispute: null, error: "FINAL" };

  const next = String(newStatus || "").trim();
  const transitionOk =
    (st === "open" && next === "under_review") ||
    (st === "under_review" && (next === "resolved" || next === "rejected"));
  if (!transitionOk) {
    return { dispute: null, error: "INVALID_TRANSITION" };
  }

  const notes = adminNotes != null ? String(adminNotes).trim().slice(0, 8000) : null;

  if (next === "under_review") {
    const r = await pool.query(
      `
      UPDATE public.field_agent_pay_run_disputes
      SET status = 'under_review',
          admin_notes = CASE WHEN $2::text IS NOT NULL AND length(trim($2::text)) > 0 THEN trim($2::text) ELSE admin_notes END,
          updated_at = now()
      WHERE id = $1 AND tenant_id = $3 AND status = 'open'
      RETURNING *
      `,
      [id, notes, tid]
    );
    if (!r.rows.length) return { dispute: null, error: "NOT_FOUND" };
    return { dispute: r.rows[0], error: null };
  }

  if (next === "resolved" || next === "rejected") {
    const r = await pool.query(
      `
      UPDATE public.field_agent_pay_run_disputes
      SET status = $2::text,
          admin_notes = CASE WHEN $3::text IS NOT NULL AND length(trim($3::text)) > 0 THEN trim($3::text) ELSE admin_notes END,
          resolved_at = now(),
          resolved_by_admin_user_id = $4,
          updated_at = now()
      WHERE id = $1 AND tenant_id = $5 AND status = 'under_review'
      RETURNING *
      `,
      [id, next, notes, aid, tid]
    );
    if (!r.rows.length) return { dispute: null, error: "NOT_FOUND" };
    return { dispute: r.rows[0], error: null };
  }

  return { dispute: null, error: "INVALID_TRANSITION" };
}

module.exports = {
  createDispute,
  getActiveDisputeForPayRunItem,
  listDisputesForFieldAgent,
  listDisputesForAdmin,
  getDisputeById,
  getDisputeByIdForTenant,
  getDisputeByIdForFieldAgent,
  updateDisputeStatus,
};
