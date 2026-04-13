"use strict";

/**
 * Ledger-style pay-run adjustments (no mutation of frozen snapshot rows).
 */

const ADJUSTMENT_TYPES = new Set(["sp", "ec", "recruitment", "manual"]);

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} payRunItemId
 * @returns {Promise<{ item: object, payRunStatus: string } | null>}
 */
async function getPayRunItemWithStatusForTenant(pool, tenantId, payRunItemId) {
  const tid = Number(tenantId);
  const iid = Number(payRunItemId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(iid) || iid < 1) return null;
  const r = await pool.query(
    `
    SELECT i.*, pr.status AS pay_run_status
    FROM public.field_agent_pay_run_items i
    INNER JOIN public.field_agent_pay_runs pr ON pr.id = i.pay_run_id AND pr.tenant_id = i.tenant_id
    WHERE i.id = $1 AND i.tenant_id = $2
    LIMIT 1
    `,
    [iid, tid]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{
 *   tenantId: number,
 *   originalPayRunItemId: number,
 *   adjustmentAmount: number,
 *   adjustmentType?: string,
 *   reason: string,
 *   adminNotes: string | null,
 *   createdByAdminUserId: number,
 *   disputeId: number | null,
 * }} p
 * @returns {Promise<{ adjustment: object | null, error: string | null }>}
 */
async function createAdjustment(pool, p) {
  const tid = Number(p.tenantId);
  const itemId = Number(p.originalPayRunItemId);
  const adminId = Number(p.createdByAdminUserId);
  const reason = String(p.reason || "").trim().slice(0, 4000);
  const notes = p.adminNotes != null ? String(p.adminNotes).trim().slice(0, 8000) : null;
  const amtRaw = p.adjustmentAmount;
  const amt = typeof amtRaw === "number" ? amtRaw : Number(amtRaw);
  const adjType = p.adjustmentType != null && String(p.adjustmentType).trim() !== "" ? String(p.adjustmentType).trim() : "manual";

  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(itemId) || itemId < 1) {
    return { adjustment: null, error: "INVALID" };
  }
  if (!Number.isFinite(adminId) || adminId < 1) {
    return { adjustment: null, error: "INVALID_ADMIN" };
  }
  if (!reason) return { adjustment: null, error: "REASON_REQUIRED" };
  if (!Number.isFinite(amt) || amt === 0) return { adjustment: null, error: "AMOUNT_NONZERO" };
  if (!ADJUSTMENT_TYPES.has(adjType)) return { adjustment: null, error: "INVALID_TYPE" };

  const row = await getPayRunItemWithStatusForTenant(pool, tid, itemId);
  if (!row) return { adjustment: null, error: "ITEM_NOT_FOUND" };
  const st = String(row.pay_run_status || "");
  if (st !== "approved" && st !== "paid") {
    return { adjustment: null, error: "PAY_RUN_NOT_APPROVED" };
  }

  const originalPayRunId = Number(row.pay_run_id);
  const fieldAgentId = Number(row.field_agent_id);

  let disputeId = p.disputeId != null && p.disputeId !== "" ? Number(p.disputeId) : null;
  if (disputeId != null && (!Number.isFinite(disputeId) || disputeId < 1)) disputeId = null;

  if (disputeId != null) {
    const dr = await pool.query(
      `
      SELECT id FROM public.field_agent_pay_run_disputes
      WHERE id = $1 AND tenant_id = $2 AND pay_run_item_id = $3 AND field_agent_id = $4
      LIMIT 1
      `,
      [disputeId, tid, itemId, fieldAgentId]
    );
    if (!dr.rows[0]) return { adjustment: null, error: "DISPUTE_MISMATCH" };
  }

  const ins = await pool.query(
    `
    INSERT INTO public.field_agent_pay_run_adjustments (
      tenant_id, original_pay_run_id, original_pay_run_item_id, field_agent_id,
      adjustment_amount, adjustment_type, reason, admin_notes,
      created_by_admin_user_id, dispute_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
    `,
    [tid, originalPayRunId, itemId, fieldAgentId, amt, adjType, reason, notes, adminId, disputeId]
  );
  return { adjustment: ins.rows[0], error: null };
}

async function listAdjustmentsForFieldAgent(pool, tenantId, fieldAgentId, limit = 100) {
  const tid = Number(tenantId);
  const fid = Number(fieldAgentId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(fid) || fid < 1) return [];
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const r = await pool.query(
    `
    SELECT a.*,
           pr.period_start AS original_period_start,
           pr.period_end AS original_period_end
    FROM public.field_agent_pay_run_adjustments a
    INNER JOIN public.field_agent_pay_runs pr ON pr.id = a.original_pay_run_id AND pr.tenant_id = a.tenant_id
    WHERE a.tenant_id = $1 AND a.field_agent_id = $2
    ORDER BY a.created_at DESC
    LIMIT $3
    `,
    [tid, fid, lim]
  );
  return r.rows;
}

async function listAdjustmentsForAdmin(pool, tenantId, filters = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const lim = Math.min(Math.max(Number(filters.limit) || 200, 1), 500);
  const params = [tid];
  let where = "a.tenant_id = $1";
  if (filters.fieldAgentId != null && String(filters.fieldAgentId).trim() !== "") {
    const fa = Number(filters.fieldAgentId);
    if (Number.isFinite(fa) && fa > 0) {
      params.push(fa);
      where += ` AND a.field_agent_id = $${params.length}`;
    }
  }
  if (filters.originalPayRunId != null && String(filters.originalPayRunId).trim() !== "") {
    const prid = Number(filters.originalPayRunId);
    if (Number.isFinite(prid) && prid > 0) {
      params.push(prid);
      where += ` AND a.original_pay_run_id = $${params.length}`;
    }
  }
  if (filters.disputeId != null && String(filters.disputeId).trim() !== "") {
    const did = Number(filters.disputeId);
    if (Number.isFinite(did) && did > 0) {
      params.push(did);
      where += ` AND a.dispute_id = $${params.length}`;
    }
  }
  params.push(lim);
  const r = await pool.query(
    `
    SELECT a.*,
           pr.period_start AS original_period_start,
           pr.period_end AS original_period_end,
           i.field_agent_label_snapshot
    FROM public.field_agent_pay_run_adjustments a
    INNER JOIN public.field_agent_pay_runs pr ON pr.id = a.original_pay_run_id AND pr.tenant_id = a.tenant_id
    INNER JOIN public.field_agent_pay_run_items i ON i.id = a.original_pay_run_item_id AND i.tenant_id = a.tenant_id
    WHERE ${where}
    ORDER BY a.created_at DESC
    LIMIT $${params.length}
    `,
    params
  );
  return r.rows;
}

async function listAdjustmentsAppliedInPayRun(pool, tenantId, payRunId) {
  const tid = Number(tenantId);
  const rid = Number(payRunId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(rid) || rid < 1) return [];
  const r = await pool.query(
    `
    SELECT * FROM public.field_agent_pay_run_adjustments
    WHERE tenant_id = $1 AND applied_in_pay_run_id = $2
    ORDER BY field_agent_id, id
    `,
    [tid, rid]
  );
  return r.rows;
}

async function listAdjustmentsForOriginalPayRun(pool, tenantId, originalPayRunId) {
  const tid = Number(tenantId);
  const rid = Number(originalPayRunId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(rid) || rid < 1) return [];
  const r = await pool.query(
    `
    SELECT * FROM public.field_agent_pay_run_adjustments
    WHERE tenant_id = $1 AND original_pay_run_id = $2
    ORDER BY original_pay_run_item_id, created_at
    `,
    [tid, rid]
  );
  return r.rows;
}

async function getAdjustmentsForPayRunItem(pool, tenantId, payRunItemId) {
  const tid = Number(tenantId);
  const iid = Number(payRunItemId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(iid) || iid < 1) return [];
  const r = await pool.query(
    `
    SELECT a.*,
           apr.period_start AS applied_period_start,
           apr.period_end AS applied_period_end
    FROM public.field_agent_pay_run_adjustments a
    LEFT JOIN public.field_agent_pay_runs apr ON apr.id = a.applied_in_pay_run_id AND apr.tenant_id = a.tenant_id
    WHERE a.tenant_id = $1 AND a.original_pay_run_item_id = $2
    ORDER BY a.created_at ASC
    `,
    [tid, iid]
  );
  return r.rows;
}

/**
 * @returns {{ adjustment: object | null, error: string | null }}
 */
async function linkAdjustmentToPayRun(pool, adjustmentId, tenantId, payRunId) {
  const aid = Number(adjustmentId);
  const tid = Number(tenantId);
  const prid = Number(payRunId);
  if (!Number.isFinite(aid) || aid < 1 || !Number.isFinite(tid) || tid < 1 || !Number.isFinite(prid) || prid < 1) {
    return { adjustment: null, error: "INVALID" };
  }
  const pr = await pool.query(
    `SELECT id FROM public.field_agent_pay_runs WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [prid, tid]
  );
  if (!pr.rows[0]) return { adjustment: null, error: "PAY_RUN_NOT_FOUND" };

  const u = await pool.query(
    `
    UPDATE public.field_agent_pay_run_adjustments
    SET applied_in_pay_run_id = $2
    WHERE id = $1 AND tenant_id = $3
    RETURNING *
    `,
    [aid, prid, tid]
  );
  if (!u.rows.length) return { adjustment: null, error: "ADJUSTMENT_NOT_FOUND" };
  return { adjustment: u.rows[0], error: null };
}

/**
 * Create adjustment and resolve dispute in one transaction.
 * @returns {{ adjustment: object | null, dispute: object | null, error: string | null }}
 */
async function createAdjustmentAndResolveDispute(pool, params) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await createAdjustment(client, params);
    if (created.error || !created.adjustment) {
      await client.query("ROLLBACK");
      return { adjustment: null, dispute: null, error: created.error || "CREATE_FAILED" };
    }
    const disputeId = Number(params.disputeId);
    const tid = Number(params.tenantId);
    const adminId = Number(params.createdByAdminUserId);
    if (!Number.isFinite(disputeId) || disputeId < 1) {
      await client.query("ROLLBACK");
      return { adjustment: null, dispute: null, error: "DISPUTE_REQUIRED" };
    }
    const notes = params.adminNotes != null ? String(params.adminNotes).trim().slice(0, 8000) : null;
    const up = await client.query(
      `
      UPDATE public.field_agent_pay_run_disputes
      SET status = 'resolved',
          admin_notes = CASE WHEN $2::text IS NOT NULL AND length(trim($2::text)) > 0 THEN trim($2::text) ELSE admin_notes END,
          resolved_at = now(),
          resolved_by_admin_user_id = $3,
          updated_at = now()
      WHERE id = $1 AND tenant_id = $4 AND status = 'under_review'
      RETURNING *
      `,
      [disputeId, notes, adminId, tid]
    );
    if (!up.rows.length) {
      await client.query("ROLLBACK");
      return { adjustment: null, dispute: null, error: "DISPUTE_NOT_RESOLVABLE" };
    }
    await client.query("COMMIT");
    return { adjustment: created.adjustment, dispute: up.rows[0], error: null };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Lock all unapplied adjustments for tenant (draft creation). Group by field agent.
 * @returns {Map<number, { ids: number[], sum: number }>}
 */
async function fetchUnappliedAdjustmentsByFieldAgentForUpdate(client, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return new Map();
  const r = await client.query(
    `
    SELECT id, field_agent_id, adjustment_amount
    FROM public.field_agent_pay_run_adjustments
    WHERE tenant_id = $1 AND applied_in_pay_run_id IS NULL
    FOR UPDATE
    `,
    [tid]
  );
  const byFa = new Map();
  for (const row of r.rows) {
    const fid = Number(row.field_agent_id);
    if (!byFa.has(fid)) byFa.set(fid, { ids: [], sum: 0 });
    const g = byFa.get(fid);
    g.ids.push(Number(row.id));
    g.sum += Number(row.adjustment_amount);
  }
  return byFa;
}

/**
 * Read-only aggregates for pay-run preview (no locks).
 * @returns {Map<number, { sum: number, count: number }>}
 */
async function sumUnappliedAdjustmentsByFieldAgentForPreview(pool, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return new Map();
  const r = await pool.query(
    `
    SELECT field_agent_id,
           COALESCE(SUM(adjustment_amount), 0)::numeric AS sum_amt,
           COUNT(*)::int AS cnt
    FROM public.field_agent_pay_run_adjustments
    WHERE tenant_id = $1 AND applied_in_pay_run_id IS NULL
    GROUP BY field_agent_id
    `,
    [tid]
  );
  const byFa = new Map();
  for (const row of r.rows) {
    byFa.set(Number(row.field_agent_id), {
      sum: Number(row.sum_amt),
      count: Number(row.cnt),
    });
  }
  return byFa;
}

/**
 * @param {import("pg").PoolClient} client
 * @returns {Promise<{ linked: number }>}
 */
async function linkAdjustmentsToPayRunIds(client, tenantId, payRunId, adjustmentIds) {
  const ids = [...new Set((adjustmentIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return { linked: 0 };
  const tid = Number(tenantId);
  const pid = Number(payRunId);
  const r = await client.query(
    `
    UPDATE public.field_agent_pay_run_adjustments
    SET applied_in_pay_run_id = $3
    WHERE tenant_id = $1
      AND id = ANY($2::int[])
      AND applied_in_pay_run_id IS NULL
    RETURNING id
    `,
    [tid, ids, pid]
  );
  return { linked: r.rows.length };
}

module.exports = {
  getPayRunItemWithStatusForTenant,
  createAdjustment,
  listAdjustmentsForFieldAgent,
  listAdjustmentsForAdmin,
  listAdjustmentsForOriginalPayRun,
  listAdjustmentsAppliedInPayRun,
  getAdjustmentsForPayRunItem,
  linkAdjustmentToPayRun,
  linkAdjustmentsToPayRunIds,
  fetchUnappliedAdjustmentsByFieldAgentForUpdate,
  sumUnappliedAdjustmentsByFieldAgentForPreview,
  createAdjustmentAndResolveDispute,
  ADJUSTMENT_TYPES,
};
