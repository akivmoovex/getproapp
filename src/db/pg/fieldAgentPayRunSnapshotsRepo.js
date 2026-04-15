"use strict";

/**
 * Append-only pay-run finance snapshots (totals at capture time). Does not mutate pay runs or ledger.
 */

const SNAPSHOT_TYPE_MONTH_CLOSE = "month_close";

/**
 * @param {import("pg").Pool} pool
 * @param {{
 *   tenantId: number,
 *   payRunId: number,
 *   snapshotType?: string,
 *   frozenPayable: number,
 *   netPaid: number,
 *   remainingBalance: number,
 *   status: string,
 *   actorAdminUserId: number,
 *   snapshotAt?: Date | string | null,
 * }} p
 */
async function insertPayRunSnapshot(pool, p) {
  const tid = Number(p.tenantId);
  const pid = Number(p.payRunId);
  const actorId = Number(p.actorAdminUserId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(pid) || pid < 1) {
    throw new Error("INVALID_SNAPSHOT_SCOPE");
  }
  if (!Number.isFinite(actorId) || actorId < 1) {
    throw new Error("INVALID_SNAPSHOT_ACTOR");
  }
  const stype = String(p.snapshotType || SNAPSHOT_TYPE_MONTH_CLOSE).trim().slice(0, 64) || SNAPSHOT_TYPE_MONTH_CLOSE;
  const status = String(p.status || "").trim().slice(0, 32);
  if (!status) {
    throw new Error("INVALID_SNAPSHOT_STATUS");
  }
  const fp = Number(p.frozenPayable);
  const np = Number(p.netPaid);
  const rb = Number(p.remainingBalance);
  if (!Number.isFinite(fp) || !Number.isFinite(np) || !Number.isFinite(rb)) {
    throw new Error("INVALID_SNAPSHOT_AMOUNTS");
  }

  const r = await pool.query(
    `
    INSERT INTO public.field_agent_pay_run_snapshots (
      tenant_id, pay_run_id, snapshot_type,
      frozen_payable, net_paid, remaining_balance,
      status, snapshot_at, actor_admin_user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()), $9)
    RETURNING *
    `,
    [tid, pid, stype, fp, np, rb, status, p.snapshotAt != null ? p.snapshotAt : null, actorId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} payRunId
 * @param {number} [limit]
 */
async function listSnapshotsForPayRun(pool, tenantId, payRunId, limit = 100) {
  const tid = Number(tenantId);
  const pid = Number(payRunId);
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(pid) || pid < 1) return [];
  const r = await pool.query(
    `
    SELECT id, tenant_id, pay_run_id, snapshot_type, frozen_payable, net_paid, remaining_balance,
           status, snapshot_at, actor_admin_user_id
    FROM public.field_agent_pay_run_snapshots
    WHERE tenant_id = $1 AND pay_run_id = $2
    ORDER BY snapshot_at DESC, id DESC
    LIMIT $3
    `,
    [tid, pid, lim]
  );
  return r.rows;
}

/**
 * Latest snapshot for a pay run (by snapshot_at, then id), or null.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} payRunId
 */
async function getLatestSnapshotForPayRun(pool, tenantId, payRunId) {
  const rows = await listSnapshotsForPayRun(pool, tenantId, payRunId, 1);
  return rows[0] ?? null;
}

module.exports = {
  SNAPSHOT_TYPE_MONTH_CLOSE,
  insertPayRunSnapshot,
  listSnapshotsForPayRun,
  getLatestSnapshotForPayRun,
};
