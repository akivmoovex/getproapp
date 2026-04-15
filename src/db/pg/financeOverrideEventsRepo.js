"use strict";

/**
 * Append-only audit for exceptional finance actions (not general app logging).
 */

const ACTION_TYPES = {
  REVERSE_OVERRIDE: "reverse_override",
  CORRECTION_OVERRIDE: "correction_override",
  UNLOCK_PERIOD: "unlock_period",
  CLOSED_RUN_OVERRIDE: "closed_run_override",
};

const REASON_MAX = 8000;

/**
 * @param {import("pg").Pool} pool
 * @param {{
 *   tenantId: number,
 *   actionType: string,
 *   reason: string,
 *   actorAdminUserId: number | null,
 *   payRunId: number | null,
 *   paymentId: number | null,
 * }} p
 */
async function insertFinanceOverrideEvent(pool, p) {
  const tid = Number(p.tenantId);
  const actionType = String(p.actionType || "").trim();
  const reason = String(p.reason || "").trim().slice(0, REASON_MAX);
  const aid =
    p.actorAdminUserId != null && Number.isFinite(Number(p.actorAdminUserId)) && Number(p.actorAdminUserId) > 0
      ? Number(p.actorAdminUserId)
      : null;
  const prid = p.payRunId != null && Number.isFinite(Number(p.payRunId)) && Number(p.payRunId) > 0 ? Number(p.payRunId) : null;
  const paymid = p.paymentId != null && Number.isFinite(Number(p.paymentId)) && Number(p.paymentId) > 0 ? Number(p.paymentId) : null;

  if (!Number.isFinite(tid) || tid < 1) {
    throw new Error("INVALID_TENANT");
  }
  if (!reason) {
    throw new Error("REASON_REQUIRED");
  }
  if (!Object.values(ACTION_TYPES).includes(actionType)) {
    throw new Error("INVALID_ACTION_TYPE");
  }

  await pool.query(
    `
    INSERT INTO public.finance_override_events (
      tenant_id, action_type, reason, actor_admin_user_id, pay_run_id, payment_id
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [tid, actionType, reason, aid, prid, paymid]
  );
}

/**
 * Reserved for a future `bypassClosedPayRun` path: record when ledger mutation is allowed despite soft-close.
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, reason: string, actorAdminUserId: number | null, payRunId: number, paymentId: number | null }} p
 */
async function insertClosedRunOverrideEvent(pool, p) {
  return insertFinanceOverrideEvent(pool, {
    tenantId: p.tenantId,
    actionType: ACTION_TYPES.CLOSED_RUN_OVERRIDE,
    reason: p.reason,
    actorAdminUserId: p.actorAdminUserId,
    payRunId: p.payRunId,
    paymentId: p.paymentId != null ? Number(p.paymentId) : null,
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} [limit]
 */
async function listRecentFinanceOverrideEventsForTenant(pool, tenantId, limit = 12) {
  const tid = Number(tenantId);
  const lim = Math.min(Math.max(Number(limit) || 12, 1), 50);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const r = await pool.query(
    `
    SELECT id, tenant_id, action_type, reason, actor_admin_user_id, pay_run_id, payment_id, created_at
    FROM public.finance_override_events
    WHERE tenant_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT $2
    `,
    [tid, lim]
  );
  return r.rows;
}

module.exports = {
  ACTION_TYPES,
  insertFinanceOverrideEvent,
  insertClosedRunOverrideEvent,
  listRecentFinanceOverrideEventsForTenant,
};
