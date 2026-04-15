"use strict";

/**
 * Accounting periods: one row per (tenant, calendar month YYYY-MM). Locked periods block new ledger lines
 * on pay runs whose period_start falls in that month (UTC).
 */

/**
 * @param {unknown} periodStart — timestamptz from field_agent_pay_runs.period_start
 * @returns {string | null} YYYY-MM or null
 */
function accountingPeriodKeyFromPeriodStart(periodStart) {
  if (periodStart == null) return null;
  const d = periodStart instanceof Date ? periodStart : new Date(periodStart);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} executor
 * @param {number} tenantId
 * @param {string} periodKey YYYY-MM
 */
async function isAccountingPeriodLocked(executor, tenantId, periodKey) {
  const tid = Number(tenantId);
  const pk = String(periodKey || "")
    .trim()
    .slice(0, 7);
  if (!Number.isFinite(tid) || tid < 1 || !/^\d{4}-\d{2}$/.test(pk)) return false;
  const r = await executor.query(
    `
    SELECT 1 FROM public.accounting_periods
    WHERE tenant_id = $1 AND period_id = $2 AND is_locked = true
    LIMIT 1
    `,
    [tid, pk]
  );
  return r.rows.length > 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, periodId: string, adminUserId: number | null }} p
 */
async function lockAccountingPeriod(pool, p) {
  const tid = Number(p.tenantId);
  const pid = String(p.periodId || "")
    .trim()
    .slice(0, 7);
  const aid = p.adminUserId != null && Number.isFinite(Number(p.adminUserId)) && Number(p.adminUserId) > 0 ? Number(p.adminUserId) : null;
  if (!Number.isFinite(tid) || tid < 1 || !/^\d{4}-\d{2}$/.test(pid)) {
    return { ok: false, error: "INVALID_PERIOD" };
  }
  const r = await pool.query(
    `
    INSERT INTO public.accounting_periods (tenant_id, period_id, is_locked, locked_at, locked_by_admin_user_id)
    VALUES ($1, $2, true, now(), $3)
    ON CONFLICT (tenant_id, period_id)
    DO UPDATE SET
      is_locked = true,
      locked_at = now(),
      locked_by_admin_user_id = EXCLUDED.locked_by_admin_user_id
    RETURNING *
    `,
    [tid, pid, aid]
  );
  return { ok: true, row: r.rows[0] ?? null };
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, periodId: string }} p
 */
async function unlockAccountingPeriod(pool, p) {
  const tid = Number(p.tenantId);
  const pid = String(p.periodId || "")
    .trim()
    .slice(0, 7);
  if (!Number.isFinite(tid) || tid < 1 || !/^\d{4}-\d{2}$/.test(pid)) {
    return { ok: false, error: "INVALID_PERIOD" };
  }
  await pool.query(
    `
    UPDATE public.accounting_periods
    SET is_locked = false,
        locked_at = NULL,
        locked_by_admin_user_id = NULL
    WHERE tenant_id = $1 AND period_id = $2 AND is_locked = true
    `,
    [tid, pid]
  );
  return { ok: true };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} [limit]
 */
async function listLockedPeriodsForTenant(pool, tenantId, limit = 36) {
  const tid = Number(tenantId);
  const lim = Math.min(Math.max(Number(limit) || 36, 1), 120);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const r = await pool.query(
    `
    SELECT period_id, locked_at, locked_by_admin_user_id
    FROM public.accounting_periods
    WHERE tenant_id = $1 AND is_locked = true
    ORDER BY period_id DESC
    LIMIT $2
    `,
    [tid, lim]
  );
  return r.rows;
}

module.exports = {
  accountingPeriodKeyFromPeriodStart,
  isAccountingPeriodLocked,
  lockAccountingPeriod,
  unlockAccountingPeriod,
  listLockedPeriodsForTenant,
};
