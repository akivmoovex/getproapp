"use strict";

/**
 * Append-only audit log for payout finance workflow. Do not UPDATE/DELETE rows.
 */
const PAYOUT_FINANCE_AUDIT_ACTION = {
  PAYOUT_APPROVED: "payout_approved",
  BATCH_CREATED: "batch_created",
  PAY_RUN_ADDED_TO_BATCH: "pay_run_added_to_batch",
  BATCH_CLOSED: "batch_closed",
  BATCH_PAYOUT_COMPLETED: "batch_payout_completed",
  PAY_RUN_PAYOUT_COMPLETED: "pay_run_payout_completed",
  BATCH_BANK_RECONCILED: "batch_bank_reconciled",
  PAY_RUN_BANK_RECONCILED: "pay_run_bank_reconciled",
};

const ENTITY = {
  PAY_RUN: "pay_run",
  PAYOUT_BATCH: "payout_batch",
};

/**
 * @param {import("pg").Pool | import("pg").PoolClient} executor
 * @param {{
 *   tenantId: number,
 *   actorAdminUserId: number | null,
 *   actionType: string,
 *   entityType: string,
 *   entityId: number,
 *   note?: string | null,
 *   metadata?: Record<string, unknown> | null,
 * }} row
 */
async function appendPayoutFinanceAudit(executor, row) {
  const tid = Number(row.tenantId);
  const aid =
    row.actorAdminUserId != null && Number.isFinite(Number(row.actorAdminUserId)) && Number(row.actorAdminUserId) > 0
      ? Number(row.actorAdminUserId)
      : null;
  const actionType = String(row.actionType || "").trim().slice(0, 128);
  const entityType = String(row.entityType || "").trim();
  const eid = Number(row.entityId);
  const note = row.note != null ? String(row.note).trim().slice(0, 4000) : "";
  const meta = row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  if (!Number.isFinite(tid) || tid < 1 || !actionType || !Number.isFinite(eid) || eid < 1) {
    throw new Error("INVALID_PAYOUT_FINANCE_AUDIT");
  }
  if (entityType !== ENTITY.PAY_RUN && entityType !== ENTITY.PAYOUT_BATCH) {
    throw new Error("INVALID_PAYOUT_FINANCE_AUDIT_ENTITY");
  }
  const metaJson = JSON.stringify(meta);
  await executor.query(
    `
    INSERT INTO public.field_agent_payout_finance_audit (
      tenant_id, actor_admin_user_id, action_type, entity_type, entity_id, note, metadata
    ) VALUES ($1, $2, $3, $4, $5, NULLIF($6::text, ''), COALESCE($7::jsonb, '{}'::jsonb))
    `,
    [tid, aid, actionType, entityType, eid, note, metaJson]
  );
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} payRunId
 * @param {number} [limit]
 */
async function listPayoutFinanceAuditForPayRun(pool, tenantId, payRunId, limit = 40) {
  const tid = Number(tenantId);
  const pid = Number(payRunId);
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 100);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(pid) || pid < 1) return [];
  const r = await pool.query(
    `
    SELECT id, tenant_id, actor_admin_user_id, action_type, entity_type, entity_id, note, metadata, created_at
    FROM public.field_agent_payout_finance_audit
    WHERE tenant_id = $1 AND entity_type = 'pay_run' AND entity_id = $2
    ORDER BY created_at DESC, id DESC
    LIMIT $3
    `,
    [tid, pid, lim]
  );
  return r.rows;
}

/**
 * Includes batch-scoped events (entity = batch) and pay-run additions where metadata.payout_batch_id matches.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} batchId
 * @param {number} [limit]
 */
async function listPayoutFinanceAuditForPayoutBatch(pool, tenantId, batchId, limit = 60) {
  const tid = Number(tenantId);
  const bid = Number(batchId);
  const lim = Math.min(Math.max(Number(limit) || 60, 1), 150);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(bid) || bid < 1) return [];
  const r = await pool.query(
    `
    SELECT id, tenant_id, actor_admin_user_id, action_type, entity_type, entity_id, note, metadata, created_at
    FROM public.field_agent_payout_finance_audit
    WHERE tenant_id = $1
      AND (
        (entity_type = 'payout_batch' AND entity_id = $2)
        OR (
          action_type = $4
          AND entity_type = 'pay_run'
          AND (metadata->>'payout_batch_id')::int = $2
        )
      )
    ORDER BY created_at DESC, id DESC
    LIMIT $3
    `,
    [tid, bid, lim, PAYOUT_FINANCE_AUDIT_ACTION.PAY_RUN_ADDED_TO_BATCH]
  );
  return r.rows;
}

module.exports = {
  PAYOUT_FINANCE_AUDIT_ACTION,
  ENTITY,
  appendPayoutFinanceAudit,
  listPayoutFinanceAuditForPayRun,
  listPayoutFinanceAuditForPayoutBatch,
};
