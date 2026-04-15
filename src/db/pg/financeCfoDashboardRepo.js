"use strict";

/**
 * Read-only aggregates for super-admin CFO dashboard (frozen pay-run + ledger + adjustments).
 * Does not mutate pay runs, payments, or adjustments.
 */

const fieldAgentPayRunRepo = require("./fieldAgentPayRunRepo");

function computeRecStatus(payable, paid) {
  const p = fieldAgentPayRunRepo.roundMoney2(payable);
  const x = fieldAgentPayRunRepo.roundMoney2(paid);
  if (x <= 0) return "unpaid";
  if (x < p) return "partial";
  if (x === p) return "paid";
  return "overpaid";
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ periodStartFrom?: string | null, periodStartTo?: string | null }} [opts]
 */
async function getPayRunStatusCountsByTenant(pool, opts = {}) {
  const from = opts.periodStartFrom && String(opts.periodStartFrom).trim() ? String(opts.periodStartFrom).trim() : null;
  const to = opts.periodStartTo && String(opts.periodStartTo).trim() ? String(opts.periodStartTo).trim() : null;
  const r = await pool.query(
    `
    SELECT pr.tenant_id::int AS tenant_id,
           pr.status::text AS status,
           COUNT(*)::int AS c
    FROM public.field_agent_pay_runs pr
    WHERE ($1::date IS NULL OR pr.period_start >= $1::date)
      AND ($2::date IS NULL OR pr.period_start <= $2::date)
    GROUP BY pr.tenant_id, pr.status
    `,
    [from, to]
  );
  const byTenant = new Map();
  for (const row of r.rows) {
    const tid = Number(row.tenant_id);
    if (!byTenant.has(tid)) {
      byTenant.set(tid, { draft: 0, locked: 0, approved: 0, paid: 0 });
    }
    const st = String(row.status || "");
    const o = byTenant.get(tid);
    if (st === "draft") o.draft = Number(row.c);
    else if (st === "locked") o.locked = Number(row.c);
    else if (st === "approved") o.approved = Number(row.c);
    else if (st === "paid") o.paid = Number(row.c);
  }
  return byTenant;
}

/**
 * Per approved/paid pay run: payable, paid, reconciliation bucket.
 * @param {import("pg").Pool} pool
 * @param {{ periodStartFrom?: string | null, periodStartTo?: string | null, tenantId?: number | null }} [opts]
 */
async function getApprovedPaidRunReconciliationRows(pool, opts = {}) {
  const from = opts.periodStartFrom && String(opts.periodStartFrom).trim() ? String(opts.periodStartFrom).trim() : null;
  const to = opts.periodStartTo && String(opts.periodStartTo).trim() ? String(opts.periodStartTo).trim() : null;
  const onlyTid = opts.tenantId != null && Number.isFinite(Number(opts.tenantId)) && Number(opts.tenantId) > 0 ? Number(opts.tenantId) : null;

  const r = await pool.query(
    `
    SELECT
      pr.id AS pay_run_id,
      pr.tenant_id::int AS tenant_id,
      pr.status::text AS run_status,
      pr.period_start,
      pr.period_end,
      pr.approved_at,
      pr.paid_at,
      COALESCE((
        SELECT COALESCE(SUM(COALESCE(i.net_payable_amount, (
          COALESCE(i.sp_payable_amount, 0)
          + COALESCE(i.ec_payable_amount, 0)
          + COALESCE(i.recruitment_commission_amount, 0)
        ))), 0)::numeric
        FROM public.field_agent_pay_run_items i
        WHERE i.pay_run_id = pr.id AND i.tenant_id = pr.tenant_id
      ), 0)::numeric AS payable,
      COALESCE((
        SELECT SUM(pay.amount)::numeric
        FROM public.field_agent_pay_run_payments pay
        WHERE pay.pay_run_id = pr.id AND pay.tenant_id = pr.tenant_id
      ), 0)::numeric AS paid
    FROM public.field_agent_pay_runs pr
    WHERE pr.status IN ('approved', 'paid')
      AND ($1::date IS NULL OR pr.period_start >= $1::date)
      AND ($2::date IS NULL OR pr.period_start <= $2::date)
      AND ($3::int IS NULL OR pr.tenant_id = $3::int)
    ORDER BY pr.tenant_id ASC, pr.period_start DESC NULLS LAST, pr.id DESC
    `,
    [from, to, onlyTid]
  );

  return r.rows.map((row) => {
    const payable = fieldAgentPayRunRepo.roundMoney2(Number(row.payable || 0));
    const paid = fieldAgentPayRunRepo.roundMoney2(Number(row.paid || 0));
    const outstanding = fieldAgentPayRunRepo.roundMoney2(payable - paid);
    const reconciliation_status = computeRecStatus(payable, paid);
    return {
      pay_run_id: Number(row.pay_run_id),
      tenant_id: Number(row.tenant_id),
      run_status: String(row.run_status || ""),
      period_start: row.period_start,
      period_end: row.period_end,
      approved_at: row.approved_at,
      paid_at: row.paid_at,
      run_payable_total: payable,
      total_paid_amount: paid,
      outstanding_amount: outstanding,
      reconciliation_status,
    };
  });
}

/**
 * @param {import("pg").Pool} pool
 */
async function getUnappliedAdjustmentsByTenant(pool) {
  const r = await pool.query(
    `
    SELECT tenant_id::int AS tenant_id,
           COUNT(*)::int AS cnt,
           COALESCE(SUM(adjustment_amount), 0)::numeric AS sum_amt
    FROM public.field_agent_pay_run_adjustments
    WHERE applied_in_pay_run_id IS NULL
    GROUP BY tenant_id
    `
  );
  const m = new Map();
  for (const row of r.rows) {
    m.set(Number(row.tenant_id), {
      count: Number(row.cnt),
      sum: fieldAgentPayRunRepo.roundMoney2(Number(row.sum_amt || 0)),
    });
  }
  return m;
}

/**
 * Recent ledger rows (no notes / reference / metadata — privacy).
 * @param {import("pg").Pool} pool
 * @param {{ limit?: number, tenantId?: number | null }} [opts]
 */
async function getRecentPaymentActivity(pool, opts = {}) {
  const lim = Math.min(Math.max(Number(opts.limit) || 15, 1), 50);
  const onlyTid = opts.tenantId != null && Number.isFinite(Number(opts.tenantId)) && Number(opts.tenantId) > 0 ? Number(opts.tenantId) : null;
  const r = await pool.query(
    `
    SELECT p.id::bigint AS id,
           p.tenant_id::int AS tenant_id,
           p.pay_run_id::int AS pay_run_id,
           p.payment_date,
           p.amount::numeric AS amount,
           p.payment_method,
           p.created_at
    FROM public.field_agent_pay_run_payments p
    WHERE ($1::int IS NULL OR p.tenant_id = $1::int)
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT $2
    `,
    [onlyTid, lim]
  );
  return r.rows;
}

/**
 * Roll up reconciliation rows by tenant.
 * @param {Array<Record<string, unknown>>} runRows from getApprovedPaidRunReconciliationRows
 */
function rollupReconciliationByTenant(runRows) {
  const byTenant = new Map();
  for (const row of runRows) {
    const tid = Number(row.tenant_id);
    if (!byTenant.has(tid)) {
      byTenant.set(tid, {
        approved_paid_run_count: 0,
        frozen_payable_total: 0,
        ledger_paid_total: 0,
        outstanding_total: 0,
        overpaid_total: 0,
        rec_unpaid: 0,
        rec_partial: 0,
        rec_paid: 0,
        rec_overpaid: 0,
      });
    }
    const a = byTenant.get(tid);
    a.approved_paid_run_count += 1;
    a.frozen_payable_total = fieldAgentPayRunRepo.roundMoney2(a.frozen_payable_total + Number(row.run_payable_total || 0));
    a.ledger_paid_total = fieldAgentPayRunRepo.roundMoney2(a.ledger_paid_total + Number(row.total_paid_amount || 0));
    const st = String(row.reconciliation_status || "");
    if (st === "unpaid") a.rec_unpaid += 1;
    else if (st === "partial") a.rec_partial += 1;
    else if (st === "paid") a.rec_paid += 1;
    else if (st === "overpaid") a.rec_overpaid += 1;
  }
  for (const a of byTenant.values()) {
    a.outstanding_total = fieldAgentPayRunRepo.roundMoney2(a.frozen_payable_total - a.ledger_paid_total);
    if (a.outstanding_total < 0) {
      a.overpaid_total = fieldAgentPayRunRepo.roundMoney2(-a.outstanding_total);
    } else {
      a.overpaid_total = 0;
    }
  }
  return byTenant;
}

/**
 * Platform-wide roll-up for summary cards.
 */
/**
 * All pay runs for a tenant in optional period window (read-only CFO drill-down).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {{ periodStartFrom?: string | null, periodStartTo?: string | null }} [opts]
 */
async function getTenantPayRunFinanceRows(pool, tenantId, opts = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const from = opts.periodStartFrom && String(opts.periodStartFrom).trim() ? String(opts.periodStartFrom).trim() : null;
  const to = opts.periodStartTo && String(opts.periodStartTo).trim() ? String(opts.periodStartTo).trim() : null;

  const r = await pool.query(
    `
    SELECT
      pr.id AS pay_run_id,
      pr.tenant_id::int AS tenant_id,
      pr.status::text AS run_status,
      pr.period_start,
      pr.period_end,
      pr.approved_at,
      pr.paid_at,
      COALESCE((
        SELECT COALESCE(SUM(COALESCE(i.net_payable_amount, (
          COALESCE(i.sp_payable_amount, 0)
          + COALESCE(i.ec_payable_amount, 0)
          + COALESCE(i.recruitment_commission_amount, 0)
        ))), 0)::numeric
        FROM public.field_agent_pay_run_items i
        WHERE i.pay_run_id = pr.id AND i.tenant_id = pr.tenant_id
      ), 0)::numeric AS payable,
      COALESCE((
        SELECT SUM(pay.amount)::numeric
        FROM public.field_agent_pay_run_payments pay
        WHERE pay.pay_run_id = pr.id AND pay.tenant_id = pr.tenant_id
      ), 0)::numeric AS paid
    FROM public.field_agent_pay_runs pr
    WHERE pr.tenant_id = $1
      AND ($2::date IS NULL OR pr.period_start >= $2::date)
      AND ($3::date IS NULL OR pr.period_start <= $3::date)
    ORDER BY pr.period_start DESC NULLS LAST, pr.id DESC
    LIMIT 200
    `,
    [tid, from, to]
  );

  return r.rows.map((row) => {
    const payable = fieldAgentPayRunRepo.roundMoney2(Number(row.payable || 0));
    const paid = fieldAgentPayRunRepo.roundMoney2(Number(row.paid || 0));
    const outstanding = fieldAgentPayRunRepo.roundMoney2(payable - paid);
    const st = String(row.run_status || "");
    const reconciliation_status =
      st === "approved" || st === "paid" ? computeRecStatus(payable, paid) : null;
    return {
      pay_run_id: Number(row.pay_run_id),
      tenant_id: Number(row.tenant_id),
      run_status: st,
      period_start: row.period_start,
      period_end: row.period_end,
      approved_at: row.approved_at,
      paid_at: row.paid_at,
      run_payable_total: payable,
      total_paid_amount: paid,
      outstanding_amount: outstanding,
      reconciliation_status,
    };
  });
}

/**
 * Tenant-scoped payout finance dashboard: KPIs use frozen items for approved+paid runs;
 * net paid = SUM(amount) on all ledger rows for the tenant (field_agent_pay_run_payments).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function getFieldAgentPayoutDashboardSummary(pool, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;

  const [counts, frozenAndScopeLedger, ledgerAll] = await Promise.all([
    pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'draft')::int AS cnt_draft,
        COUNT(*) FILTER (WHERE status = 'locked')::int AS cnt_locked,
        COUNT(*) FILTER (WHERE status = 'approved')::int AS cnt_approved,
        COUNT(*) FILTER (WHERE status = 'paid')::int AS cnt_paid,
        COUNT(*) FILTER (WHERE status = 'void')::int AS cnt_void
      FROM public.field_agent_pay_runs
      WHERE tenant_id = $1
      `,
      [tid]
    ),
    pool.query(
      `
      SELECT
        COALESCE(SUM(x.payable), 0)::numeric AS frozen_payable_total,
        COALESCE(SUM(x.paid), 0)::numeric AS ledger_paid_on_approved_paid_runs
      FROM (
        SELECT
          pr.id,
          COALESCE((
            SELECT COALESCE(SUM(COALESCE(i.net_payable_amount, (
              COALESCE(i.sp_payable_amount, 0)
              + COALESCE(i.ec_payable_amount, 0)
              + COALESCE(i.recruitment_commission_amount, 0)
            ))), 0)::numeric
            FROM public.field_agent_pay_run_items i
            WHERE i.pay_run_id = pr.id AND i.tenant_id = pr.tenant_id
          ), 0)::numeric AS payable,
          COALESCE((
            SELECT SUM(pay.amount)::numeric
            FROM public.field_agent_pay_run_payments pay
            WHERE pay.pay_run_id = pr.id AND pay.tenant_id = pr.tenant_id
          ), 0)::numeric AS paid
        FROM public.field_agent_pay_runs pr
        WHERE pr.tenant_id = $1 AND pr.status IN ('approved', 'paid')
      ) x
      `,
      [tid]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS ledger_all FROM public.field_agent_pay_run_payments WHERE tenant_id = $1`,
      [tid]
    ),
  ]);

  const c = counts.rows[0] || {};
  const f = frozenAndScopeLedger.rows[0] || {};
  const la = ledgerAll.rows[0] || {};
  const frozenPayable = fieldAgentPayRunRepo.roundMoney2(Number(f.frozen_payable_total || 0));
  const ledgerOnApprovedPaid = fieldAgentPayRunRepo.roundMoney2(Number(f.ledger_paid_on_approved_paid_runs || 0));
  const totalNetPaid = fieldAgentPayRunRepo.roundMoney2(Number(la.ledger_all || 0));
  const outstandingVsFrozen = fieldAgentPayRunRepo.roundMoney2(frozenPayable - totalNetPaid);

  return {
    statusCounts: {
      draft: Number(c.cnt_draft || 0),
      locked: Number(c.cnt_locked || 0),
      approved: Number(c.cnt_approved || 0),
      paid: Number(c.cnt_paid || 0),
      void: Number(c.cnt_void || 0),
    },
    frozenPayableApprovedPaid: frozenPayable,
    totalNetPaidLedger: totalNetPaid,
    outstandingAmount: outstandingVsFrozen,
    ledgerPaidOnApprovedPaidRuns: ledgerOnApprovedPaid,
  };
}

/** CFO finance-dashboard exception presets (read-only filters). */
const FINANCE_EXCEPTION_PRESET = Object.freeze({
  OUTSTANDING: "outstanding",
  REOPENED: "reopened",
  ADJUSTED: "adjusted",
  RECENT: "recent",
});

/** Window for "recently changed" pay runs (DB filter). */
const FINANCE_EXCEPTION_RECENT_ACTIVITY_DAYS = 14;

/**
 * @param {unknown} v
 * @returns {string | null}
 */
function normalizeFinanceExceptionPreset(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim().toLowerCase();
  if (s === FINANCE_EXCEPTION_PRESET.OUTSTANDING) return FINANCE_EXCEPTION_PRESET.OUTSTANDING;
  if (s === FINANCE_EXCEPTION_PRESET.REOPENED) return FINANCE_EXCEPTION_PRESET.REOPENED;
  if (s === FINANCE_EXCEPTION_PRESET.ADJUSTED) return FINANCE_EXCEPTION_PRESET.ADJUSTED;
  if (s === FINANCE_EXCEPTION_PRESET.RECENT) return FINANCE_EXCEPTION_PRESET.RECENT;
  return null;
}

/**
 * Labels for admin UI (terminology aligned with reconciliation strip / ledger).
 * @param {string | null} preset from normalizeFinanceExceptionPreset
 */
function getFinanceExceptionPresetMeta(preset) {
  const defs = {
    [FINANCE_EXCEPTION_PRESET.OUTSTANDING]: {
      key: FINANCE_EXCEPTION_PRESET.OUTSTANDING,
      title: "Outstanding",
      description: "Net ledger paid is below frozen payable (positive balance remaining).",
    },
    [FINANCE_EXCEPTION_PRESET.REOPENED]: {
      key: FINANCE_EXCEPTION_PRESET.REOPENED,
      title: "Reopened",
      description: "Status history includes a paid → approved transition (typically after ledger sync).",
    },
    [FINANCE_EXCEPTION_PRESET.ADJUSTED]: {
      key: FINANCE_EXCEPTION_PRESET.ADJUSTED,
      title: "Adjusted ledger",
      description: "At least one ledger row is a reversal or correction payment.",
    },
    [FINANCE_EXCEPTION_PRESET.RECENT]: {
      key: FINANCE_EXCEPTION_PRESET.RECENT,
      title: "Recently changed",
      description: `Pay run updated, or payment or status history activity, within the last ${FINANCE_EXCEPTION_RECENT_ACTIVITY_DAYS} days.`,
    },
  };
  if (preset && defs[preset]) return defs[preset];
  return {
    key: null,
    title: "Recent pay runs",
    description: "Latest pay runs by period (no exception filter).",
  };
}

function _mapPayRunPayoutDashboardRow(row) {
  const payable = fieldAgentPayRunRepo.roundMoney2(Number(row.payable || 0));
  const paid = fieldAgentPayRunRepo.roundMoney2(Number(row.paid || 0));
  return {
    pay_run_id: Number(row.pay_run_id),
    run_status: String(row.run_status || ""),
    closed_at: row.closed_at,
    period_start: row.period_start,
    period_end: row.period_end,
    paid_at: row.paid_at,
    updated_at: row.updated_at,
    field_agent_count: Number(row.field_agent_count || 0),
    run_payable_total: payable,
    total_paid_amount: paid,
    balance_remaining: fieldAgentPayRunRepo.roundMoney2(payable - paid),
  };
}

function _isStatusHistoryTableMissingError(e) {
  const msg = e && e.message ? String(e.message) : "";
  return msg.includes("field_agent_pay_run_status_history") || (e && e.code === "42P01");
}

/**
 * Recent pay runs with per-run payable / ledger / balance (read-only CFO shell).
 * Optional `exceptionPreset` filters (tenant-scoped, DB-backed).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {{ limit?: number, exceptionPreset?: string | null }} [opts]
 */
async function listPayRunsForPayoutDashboard(pool, tenantId, opts = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const lim = Math.min(Math.max(Number(opts.limit) || 25, 1), 100);
  const preset = normalizeFinanceExceptionPreset(opts.exceptionPreset);

  const baseSelect = `
    SELECT
      pr.id AS pay_run_id,
      pr.status::text AS run_status,
      pr.closed_at,
      pr.period_start,
      pr.period_end,
      pr.paid_at,
      pr.updated_at,
      (
        SELECT COUNT(DISTINCT i.field_agent_id)::int
        FROM public.field_agent_pay_run_items i
        WHERE i.pay_run_id = pr.id AND i.tenant_id = pr.tenant_id
      ) AS field_agent_count,
      COALESCE((
        SELECT COALESCE(SUM(COALESCE(i.net_payable_amount, (
          COALESCE(i.sp_payable_amount, 0)
          + COALESCE(i.ec_payable_amount, 0)
          + COALESCE(i.recruitment_commission_amount, 0)
        ))), 0)::numeric
        FROM public.field_agent_pay_run_items i
        WHERE i.pay_run_id = pr.id AND i.tenant_id = pr.tenant_id
      ), 0)::numeric AS payable,
      COALESCE((
        SELECT SUM(pay.amount)::numeric
        FROM public.field_agent_pay_run_payments pay
        WHERE pay.pay_run_id = pr.id AND pay.tenant_id = pr.tenant_id
      ), 0)::numeric AS paid
    FROM public.field_agent_pay_runs pr
    WHERE pr.tenant_id = $1
  `;

  let whereExtra = "";
  let orderBy = "ORDER BY pr.period_start DESC NULLS LAST, pr.id DESC";
  /** @type {unknown[]} */
  let params = [tid, lim];

  if (preset === FINANCE_EXCEPTION_PRESET.OUTSTANDING) {
    whereExtra = `
    AND COALESCE((
        SELECT COALESCE(SUM(COALESCE(i.net_payable_amount, (
          COALESCE(i.sp_payable_amount, 0)
          + COALESCE(i.ec_payable_amount, 0)
          + COALESCE(i.recruitment_commission_amount, 0)
        ))), 0)::numeric
        FROM public.field_agent_pay_run_items i
        WHERE i.pay_run_id = pr.id AND i.tenant_id = pr.tenant_id
      ), 0) >
      COALESCE((
        SELECT COALESCE(SUM(pay.amount), 0)::numeric
        FROM public.field_agent_pay_run_payments pay
        WHERE pay.pay_run_id = pr.id AND pay.tenant_id = pr.tenant_id
      ), 0)
    `;
  } else if (preset === FINANCE_EXCEPTION_PRESET.ADJUSTED) {
    whereExtra = `
    AND EXISTS (
      SELECT 1 FROM public.field_agent_pay_run_payments p
      WHERE p.tenant_id = pr.tenant_id AND p.pay_run_id = pr.id
        AND (p.metadata->>'type') IN ('reversal', 'correction_payment')
    )
    `;
  } else if (preset === FINANCE_EXCEPTION_PRESET.REOPENED) {
    whereExtra = `
    AND EXISTS (
      SELECT 1 FROM public.field_agent_pay_run_status_history h
      WHERE h.tenant_id = pr.tenant_id AND h.pay_run_id = pr.id
        AND h.from_status = 'paid' AND h.to_status = 'approved'
    )
    `;
  } else if (preset === FINANCE_EXCEPTION_PRESET.RECENT) {
    params = [tid, lim, FINANCE_EXCEPTION_RECENT_ACTIVITY_DAYS];
    whereExtra = `
    AND (
      pr.updated_at >= NOW() - ($3::int * INTERVAL '1 day')
      OR EXISTS (
        SELECT 1 FROM public.field_agent_pay_run_payments p
        WHERE p.tenant_id = pr.tenant_id AND p.pay_run_id = pr.id
          AND p.created_at >= NOW() - ($3::int * INTERVAL '1 day')
      )
      OR EXISTS (
        SELECT 1 FROM public.field_agent_pay_run_status_history h
        WHERE h.tenant_id = pr.tenant_id AND h.pay_run_id = pr.id
          AND h.created_at >= NOW() - ($3::int * INTERVAL '1 day')
      )
    )
    `;
    orderBy = `
    ORDER BY GREATEST(
      pr.updated_at,
      COALESCE((
        SELECT MAX(p.created_at) FROM public.field_agent_pay_run_payments p
        WHERE p.pay_run_id = pr.id AND p.tenant_id = pr.tenant_id
      ), 'epoch'::timestamptz),
      COALESCE((
        SELECT MAX(h.created_at) FROM public.field_agent_pay_run_status_history h
        WHERE h.pay_run_id = pr.id AND h.tenant_id = pr.tenant_id
      ), 'epoch'::timestamptz)
    ) DESC NULLS LAST,
    pr.id DESC
    `;
  }

  const sql = `${baseSelect} ${whereExtra} ${orderBy} LIMIT $2`;

  try {
    const r = await pool.query(sql, params);
    return r.rows.map(_mapPayRunPayoutDashboardRow);
  } catch (e) {
    if (preset === FINANCE_EXCEPTION_PRESET.REOPENED && _isStatusHistoryTableMissingError(e)) {
      return [];
    }
    if (preset === FINANCE_EXCEPTION_PRESET.RECENT && _isStatusHistoryTableMissingError(e)) {
      const r2 = await pool.query(
        `
        ${baseSelect}
        AND (
          pr.updated_at >= NOW() - ($3::int * INTERVAL '1 day')
          OR EXISTS (
            SELECT 1 FROM public.field_agent_pay_run_payments p
            WHERE p.tenant_id = pr.tenant_id AND p.pay_run_id = pr.id
              AND p.created_at >= NOW() - ($3::int * INTERVAL '1 day')
          )
        )
        ORDER BY GREATEST(
          pr.updated_at,
          COALESCE((
            SELECT MAX(p.created_at) FROM public.field_agent_pay_run_payments p
            WHERE p.pay_run_id = pr.id AND p.tenant_id = pr.tenant_id
          ), 'epoch'::timestamptz)
        ) DESC NULLS LAST,
        pr.id DESC
        LIMIT $2
        `,
        [tid, lim, FINANCE_EXCEPTION_RECENT_ACTIVITY_DAYS]
      );
      return r2.rows.map(_mapPayRunPayoutDashboardRow);
    }
    throw e;
  }
}

/**
 * All pay runs for a tenant with CFO summary columns (CSV export). Tenant-scoped; capped for safety.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {{ limit?: number }} [opts]
 */
async function listPayRunsForCfoSummaryExport(pool, tenantId, opts = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const lim = Math.min(Math.max(Number(opts.limit) || 500, 1), 2000);

  const r = await pool.query(
    `
    SELECT
      pr.id AS pay_run_id,
      pr.period_start,
      pr.period_end,
      pr.status::text AS run_status,
      pr.paid_at,
      pr.updated_at,
      COALESCE((
        SELECT COALESCE(SUM(COALESCE(i.net_payable_amount, (
          COALESCE(i.sp_payable_amount, 0)
          + COALESCE(i.ec_payable_amount, 0)
          + COALESCE(i.recruitment_commission_amount, 0)
        ))), 0)::numeric
        FROM public.field_agent_pay_run_items i
        WHERE i.pay_run_id = pr.id AND i.tenant_id = pr.tenant_id
      ), 0)::numeric AS frozen_payable,
      COALESCE((
        SELECT SUM(pay.amount)::numeric
        FROM public.field_agent_pay_run_payments pay
        WHERE pay.pay_run_id = pr.id AND pay.tenant_id = pr.tenant_id
      ), 0)::numeric AS net_paid,
      EXISTS (
        SELECT 1
        FROM public.field_agent_pay_run_adjustments a
        WHERE a.tenant_id = pr.tenant_id
          AND (a.original_pay_run_id = pr.id OR a.applied_in_pay_run_id = pr.id)
      ) AS has_adjustments
    FROM public.field_agent_pay_runs pr
    WHERE pr.tenant_id = $1
    ORDER BY pr.period_start DESC NULLS LAST, pr.id DESC
    LIMIT $2
    `,
    [tid, lim]
  );

  let reopenSet = new Set();
  try {
    const rh = await pool.query(
      `
      SELECT DISTINCT pay_run_id::int AS pay_run_id
      FROM public.field_agent_pay_run_status_history
      WHERE tenant_id = $1
        AND from_status = 'paid' AND to_status = 'approved'
      `,
      [tid]
    );
    reopenSet = new Set(rh.rows.map((x) => Number(x.pay_run_id)));
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "";
    if (!(msg.includes("field_agent_pay_run_status_history") || (e && e.code === "42P01"))) {
      throw e;
    }
  }

  return r.rows.map((row) => {
    const frozen = fieldAgentPayRunRepo.roundMoney2(Number(row.frozen_payable || 0));
    const net = fieldAgentPayRunRepo.roundMoney2(Number(row.net_paid || 0));
    const pid = Number(row.pay_run_id);
    return {
      pay_run_id: pid,
      period_start: row.period_start,
      period_end: row.period_end,
      run_status: String(row.run_status || ""),
      frozen_payable: frozen,
      net_paid: net,
      remaining_balance: fieldAgentPayRunRepo.roundMoney2(frozen - net),
      has_adjustments: !!row.has_adjustments,
      reopened_flag: reopenSet.has(pid),
      paid_at: row.paid_at,
      updated_at: row.updated_at,
    };
  });
}

/**
 * Pay-run rows for all tenants (CFO summary columns + tenant). One row per pay run;
 * net_paid is SUM(amount) on the run’s ledger (includes reversals/corrections as stored).
 * @param {import("pg").Pool} pool
 * @param {{ limit?: number }} [opts]
 */
async function listPayRunsForCrossTenantCfoSummaryExport(pool, opts = {}) {
  const lim = Math.min(Math.max(Number(opts.limit) || 2000, 1), 5000);

  const r = await pool.query(
    `
    SELECT
      t.id::int AS tenant_id,
      t.name::text AS tenant_name,
      t.slug::text AS tenant_slug,
      pr.id AS pay_run_id,
      pr.period_start,
      pr.period_end,
      pr.status::text AS run_status,
      pr.paid_at,
      pr.updated_at,
      COALESCE((
        SELECT COALESCE(SUM(COALESCE(i.net_payable_amount, (
          COALESCE(i.sp_payable_amount, 0)
          + COALESCE(i.ec_payable_amount, 0)
          + COALESCE(i.recruitment_commission_amount, 0)
        ))), 0)::numeric
        FROM public.field_agent_pay_run_items i
        WHERE i.pay_run_id = pr.id AND i.tenant_id = pr.tenant_id
      ), 0)::numeric AS frozen_payable,
      COALESCE((
        SELECT SUM(pay.amount)::numeric
        FROM public.field_agent_pay_run_payments pay
        WHERE pay.pay_run_id = pr.id AND pay.tenant_id = pr.tenant_id
      ), 0)::numeric AS net_paid,
      EXISTS (
        SELECT 1
        FROM public.field_agent_pay_run_adjustments a
        WHERE a.tenant_id = pr.tenant_id
          AND (a.original_pay_run_id = pr.id OR a.applied_in_pay_run_id = pr.id)
      ) AS has_adjustments
    FROM public.field_agent_pay_runs pr
    INNER JOIN public.tenants t ON t.id = pr.tenant_id
    ORDER BY t.id ASC, pr.period_start DESC NULLS LAST, pr.id DESC
    LIMIT $1
    `,
    [lim]
  );

  /** @type {Set<string>} */
  let reopenPairs = new Set();
  try {
    const rh = await pool.query(
      `
      SELECT tenant_id::int AS tenant_id, pay_run_id::int AS pay_run_id
      FROM public.field_agent_pay_run_status_history
      WHERE from_status = 'paid' AND to_status = 'approved'
      `
    );
    reopenPairs = new Set(rh.rows.map((x) => `${Number(x.tenant_id)}:${Number(x.pay_run_id)}`));
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "";
    if (!(msg.includes("field_agent_pay_run_status_history") || (e && e.code === "42P01"))) {
      throw e;
    }
  }

  return r.rows.map((row) => {
    const tid = Number(row.tenant_id);
    const frozen = fieldAgentPayRunRepo.roundMoney2(Number(row.frozen_payable || 0));
    const net = fieldAgentPayRunRepo.roundMoney2(Number(row.net_paid || 0));
    const pid = Number(row.pay_run_id);
    const pairKey = `${tid}:${pid}`;
    return {
      tenant_id: tid,
      tenant_name: String(row.tenant_name || ""),
      tenant_slug: String(row.tenant_slug || ""),
      pay_run_id: pid,
      period_start: row.period_start,
      period_end: row.period_end,
      run_status: String(row.run_status || ""),
      frozen_payable: frozen,
      net_paid: net,
      remaining_balance: fieldAgentPayRunRepo.roundMoney2(frozen - net),
      has_adjustments: !!row.has_adjustments,
      reopened_flag: reopenPairs.has(pairKey),
      paid_at: row.paid_at,
      updated_at: row.updated_at,
    };
  });
}

/**
 * All status history rows for one pay run (chronological).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} payRunId
 */
async function listPayRunStatusHistoryForPayRun(pool, tenantId, payRunId) {
  const tid = Number(tenantId);
  const pid = Number(payRunId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(pid) || pid < 1) return [];
  try {
    const r = await pool.query(
      `
      SELECT id::bigint AS id,
             from_status::text AS from_status,
             to_status::text AS to_status,
             reason::text AS reason,
             actor_admin_user_id::int AS actor_admin_user_id,
             source_payment_id::bigint AS source_payment_id,
             created_at
      FROM public.field_agent_pay_run_status_history
      WHERE tenant_id = $1 AND pay_run_id = $2
      ORDER BY created_at ASC, id ASC
      `,
      [tid, pid]
    );
    return r.rows;
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "";
    if (msg.includes("field_agent_pay_run_status_history") || (e && e.code === "42P01")) {
      return [];
    }
    throw e;
  }
}

/**
 * Human-readable ledger line kind for CFO read-only views.
 * @param {Record<string, unknown>} paymentRow
 */
function cfoLedgerRowKind(paymentRow) {
  const m = fieldAgentPayRunRepo.parsePaymentMetadata(paymentRow);
  const T = fieldAgentPayRunRepo.LEDGER_ENTRY_TYPE;
  const t = String(m.type || "");
  if (t === T.REVERSAL) {
    const oid = m.reverses_payment_id != null && Number.isFinite(Number(m.reverses_payment_id)) ? Number(m.reverses_payment_id) : null;
    return oid != null ? `Reversal of #${oid}` : "Reversal";
  }
  if (t === T.CORRECTION_PAYMENT) {
    const cid = m.corrects_payment_id != null && Number.isFinite(Number(m.corrects_payment_id)) ? Number(m.corrects_payment_id) : null;
    return cid != null ? `Correction replaces #${cid}` : "Correction payment";
  }
  return "Payment";
}

/**
 * Machine codes for CFO CSV: payment | reversal | correction (metadata.type).
 * @param {Record<string, unknown>} paymentRow
 * @returns {"payment"|"reversal"|"correction"}
 */
function cfoLedgerRowKindCode(paymentRow) {
  const m = fieldAgentPayRunRepo.parsePaymentMetadata(paymentRow);
  const T = fieldAgentPayRunRepo.LEDGER_ENTRY_TYPE;
  const t = String(m.type || "");
  if (t === T.REVERSAL) return "reversal";
  if (t === T.CORRECTION_PAYMENT) return "correction";
  return "payment";
}

/**
 * Short text derived from JSON metadata (not a substitute for the full JSONB audit trail).
 * @param {Record<string, unknown>} paymentRow
 */
function cfoLedgerMetadataSummary(paymentRow) {
  const m = fieldAgentPayRunRepo.parsePaymentMetadata(paymentRow);
  const bits = [];
  if (m.type != null && String(m.type).trim()) bits.push(`type: ${String(m.type).trim()}`);
  if (m.reason != null && String(m.reason).trim()) bits.push(`reason: ${String(m.reason).trim().slice(0, 160)}`);
  if (m.reverses_payment_id != null) bits.push(`reverses_payment_id: ${m.reverses_payment_id}`);
  if (m.corrects_payment_id != null) bits.push(`corrects_payment_id: ${m.corrects_payment_id}`);
  if (m.replaced_amount != null) bits.push(`replaced_amount: ${m.replaced_amount}`);
  if (m.correction === true) bits.push("correction: true");
  return bits.length ? bits.join(" · ") : "—";
}

/**
 * Core amounts + settlement label (Fully paid / Outstanding / Overpaid) from rounded reconciliation math.
 * @param {number} frozenPayable
 * @param {number} netPaid
 * @param {number | null | undefined} [outstandingAmount] — when set, used as remaining balance (must match ledger truth)
 */
function buildReconciliationStripCore(frozenPayable, netPaid, outstandingAmount) {
  const f = fieldAgentPayRunRepo.roundMoney2(Number(frozenPayable || 0));
  const n = fieldAgentPayRunRepo.roundMoney2(Number(netPaid || 0));
  const remaining =
    outstandingAmount != null && outstandingAmount !== "" && Number.isFinite(Number(outstandingAmount))
      ? fieldAgentPayRunRepo.roundMoney2(Number(outstandingAmount))
      : fieldAgentPayRunRepo.roundMoney2(f - n);
  let settlementState = "Outstanding";
  if (remaining === 0) settlementState = "Fully paid";
  else if (remaining < 0) settlementState = "Overpaid";
  return {
    frozenPayable: f,
    netPaid: n,
    remainingBalance: remaining,
    settlementState,
  };
}

/**
 * "Adjusted" if any ledger row is reversal or correction_payment (metadata.type).
 * @param {Array<Record<string, unknown>>} paymentRows
 */
function adjustmentStateFromLedgerRows(paymentRows) {
  const T = fieldAgentPayRunRepo.LEDGER_ENTRY_TYPE;
  for (const p of paymentRows || []) {
    const m = fieldAgentPayRunRepo.parsePaymentMetadata(p);
    const t = String(m.type || "");
    if (t === T.REVERSAL || t === T.CORRECTION_PAYMENT) {
      return "Adjusted";
    }
  }
  return "Unadjusted";
}

/**
 * @param {Array<{ from_status?: string, to_status?: string }>} statusHistoryRows
 * @returns {string | null}
 */
function reopenStateLabelFromStatusHistory(statusHistoryRows) {
  if (!statusHistoryRows || !Array.isArray(statusHistoryRows)) return null;
  const hit = statusHistoryRows.some(
    (h) => String(h.from_status || "").toLowerCase() === "paid" && String(h.to_status || "").toLowerCase() === "approved"
  );
  return hit ? "Reopened after payment" : null;
}

/**
 * Pre–soft-close finance checks (warnings only; callers must not block on this).
 * @param {{
 *   reconciliation?: { run_payable_total?: unknown, total_paid_amount?: unknown } | null,
 *   statusHistory?: Array<Record<string, unknown>>,
 *   hasPayRunAdjustmentRecords?: boolean,
 *   ledgerHasReversalOrCorrection?: boolean,
 *   payments?: Array<Record<string, unknown>>,
 * }} input
 * @returns {{ warnings: Array<{ code: string, message: string }> }}
 */
function buildPayRunSoftCloseWarnings(input) {
  const warnings = [];
  const round = fieldAgentPayRunRepo.roundMoney2;
  const rec = input && input.reconciliation;
  if (rec) {
    const fp = round(Number(rec.run_payable_total || 0));
    const np = round(Number(rec.total_paid_amount || 0));
    if (np < fp) {
      warnings.push({ code: "NOT_FULLY_PAID", message: "Run not fully paid" });
    }
  }
  let ledgerAdjusted = !!(input && input.ledgerHasReversalOrCorrection);
  if (input && input.ledgerHasReversalOrCorrection === undefined && input.payments) {
    ledgerAdjusted = adjustmentStateFromLedgerRows(input.payments) === "Adjusted";
  }
  const hasAdjRecords = !!(input && input.hasPayRunAdjustmentRecords);
  if (ledgerAdjusted || hasAdjRecords) {
    warnings.push({ code: "HAS_ADJUSTMENTS_OR_LEDGER", message: "Run contains reversals/corrections" });
  }
  const hist = input && input.statusHistory;
  if (reopenStateLabelFromStatusHistory(hist || [])) {
    warnings.push({ code: "REOPENED_AFTER_PAYMENT", message: "Run was reopened after payment" });
  }
  return { warnings };
}

/**
 * Tenant-wide: any ledger line tagged reversal or correction_payment.
 * @param {import("pg").Pool} pool
 */
async function getTenantLedgerHasReversalOrCorrection(pool, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return false;
  const r = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1 FROM public.field_agent_pay_run_payments p
      WHERE p.tenant_id = $1
        AND (p.metadata->>'type') IN ('reversal', 'correction_payment')
    ) AS x
    `,
    [tid]
  );
  return !!r.rows[0]?.x;
}

/**
 * Any pay run in the tenant was moved paid → approved in status history.
 * @param {import("pg").Pool} pool
 */
async function getTenantHasPaidToApprovedHistory(pool, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return false;
  try {
    const r = await pool.query(
      `
      SELECT EXISTS (
        SELECT 1 FROM public.field_agent_pay_run_status_history h
        WHERE h.tenant_id = $1
          AND h.from_status = 'paid' AND h.to_status = 'approved'
      ) AS x
      `,
      [tid]
    );
    return !!r.rows[0]?.x;
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "";
    if (msg.includes("field_agent_pay_run_status_history") || (e && e.code === "42P01")) {
      return false;
    }
    throw e;
  }
}

/**
 * Runs reopened (paid → approved) from ledger sync, when status history is present.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {{ limit?: number }} [opts]
 */
async function listRecentPayRunReopenHistory(pool, tenantId, opts = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const lim = Math.min(Math.max(Number(opts.limit) || 15, 1), 50);
  try {
    const r = await pool.query(
      `
      SELECT id::bigint AS id,
             pay_run_id::int AS pay_run_id,
             from_status::text AS from_status,
             to_status::text AS to_status,
             reason::text AS reason,
             created_at,
             source_payment_id::bigint AS source_payment_id
      FROM public.field_agent_pay_run_status_history
      WHERE tenant_id = $1
        AND reason = 'reversal_or_correction_reopened'
      ORDER BY created_at DESC, id DESC
      LIMIT $2
      `,
      [tid, lim]
    );
    return r.rows;
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "";
    if (msg.includes("field_agent_pay_run_status_history") || (e && e.code === "42P01")) {
      return [];
    }
    throw e;
  }
}

function rollupPlatform(rowsByTenant) {
  const o = {
    tenants_with_activity: 0,
    approved_paid_run_count: 0,
    frozen_payable_total: 0,
    ledger_paid_total: 0,
    outstanding_total: 0,
    overpaid_total: 0,
    rec_unpaid: 0,
    rec_partial: 0,
    rec_paid: 0,
    rec_overpaid: 0,
  };
  for (const a of rowsByTenant.values()) {
    if (a.approved_paid_run_count > 0 || a.rec_unpaid + a.rec_partial + a.rec_paid + a.rec_overpaid > 0) {
      o.tenants_with_activity += 1;
    }
    o.approved_paid_run_count += a.approved_paid_run_count;
    o.frozen_payable_total = fieldAgentPayRunRepo.roundMoney2(o.frozen_payable_total + a.frozen_payable_total);
    o.ledger_paid_total = fieldAgentPayRunRepo.roundMoney2(o.ledger_paid_total + a.ledger_paid_total);
    o.rec_unpaid += a.rec_unpaid;
    o.rec_partial += a.rec_partial;
    o.rec_paid += a.rec_paid;
    o.rec_overpaid += a.rec_overpaid;
  }
  o.outstanding_total = fieldAgentPayRunRepo.roundMoney2(o.frozen_payable_total - o.ledger_paid_total);
  o.overpaid_total = o.outstanding_total < 0 ? fieldAgentPayRunRepo.roundMoney2(-o.outstanding_total) : 0;
  return o;
}

function _periodBounds(opts) {
  const from = opts.periodStartFrom && String(opts.periodStartFrom).trim() ? String(opts.periodStartFrom).trim() : null;
  const to = opts.periodStartTo && String(opts.periodStartTo).trim() ? String(opts.periodStartTo).trim() : null;
  return { from, to, hasPeriod: from != null || to != null };
}

/**
 * Frozen payable (items snapshot) per tenant for approved + paid runs only.
 * Optional pay-run period window on `period_start` (inclusive).
 * @param {import("pg").Pool} pool
 * @param {{ periodStartFrom?: string | null, periodStartTo?: string | null }} [opts]
 * @returns {Promise<Map<number, number>>}
 */
async function getFrozenPayableApprovedPaidByTenant(pool, opts = {}) {
  const { from, to } = _periodBounds(opts);
  const r = await pool.query(
    `
    SELECT pr.tenant_id::int AS tenant_id,
           COALESCE(SUM((
             SELECT COALESCE(SUM(COALESCE(i.net_payable_amount, (
               COALESCE(i.sp_payable_amount, 0)
               + COALESCE(i.ec_payable_amount, 0)
               + COALESCE(i.recruitment_commission_amount, 0)
             ))), 0)::numeric
             FROM public.field_agent_pay_run_items i
             WHERE i.pay_run_id = pr.id AND i.tenant_id = pr.tenant_id
           )), 0)::numeric AS frozen_payable_total
    FROM public.field_agent_pay_runs pr
    WHERE pr.status IN ('approved', 'paid')
      AND ($1::date IS NULL OR pr.period_start >= $1::date)
      AND ($2::date IS NULL OR pr.period_start <= $2::date)
    GROUP BY pr.tenant_id
    `,
    [from, to]
  );
  const m = new Map();
  for (const row of r.rows) {
    m.set(Number(row.tenant_id), fieldAgentPayRunRepo.roundMoney2(Number(row.frozen_payable_total || 0)));
  }
  return m;
}

/**
 * Net paid for cross-tenant summary: all ledger lines per tenant, or — when a period window is set —
 * only payments whose pay run has `period_start` in that window (DB join; reversals stay on their run).
 * @param {import("pg").Pool} pool
 * @param {{ periodStartFrom?: string | null, periodStartTo?: string | null }} [opts]
 * @returns {Promise<Map<number, number>>}
 */
async function getNetPaidLedgerTotalByTenant(pool, opts = {}) {
  const { from, to, hasPeriod } = _periodBounds(opts);
  if (!hasPeriod) {
    const r = await pool.query(
      `
      SELECT p.tenant_id::int AS tenant_id,
             COALESCE(SUM(p.amount), 0)::numeric AS total_net_paid
      FROM public.field_agent_pay_run_payments p
      GROUP BY p.tenant_id
      `
    );
    const m = new Map();
    for (const row of r.rows) {
      m.set(Number(row.tenant_id), fieldAgentPayRunRepo.roundMoney2(Number(row.total_net_paid || 0)));
    }
    return m;
  }
  const r = await pool.query(
    `
    SELECT pr.tenant_id::int AS tenant_id,
           COALESCE(SUM(pay.amount), 0)::numeric AS total_net_paid
    FROM public.field_agent_pay_run_payments pay
    INNER JOIN public.field_agent_pay_runs pr
      ON pr.id = pay.pay_run_id AND pr.tenant_id = pay.tenant_id
    WHERE ($1::date IS NULL OR pr.period_start >= $1::date)
      AND ($2::date IS NULL OR pr.period_start <= $2::date)
    GROUP BY pr.tenant_id
    `,
    [from, to]
  );
  const m = new Map();
  for (const row of r.rows) {
    m.set(Number(row.tenant_id), fieldAgentPayRunRepo.roundMoney2(Number(row.total_net_paid || 0)));
  }
  return m;
}

/**
 * Distinct pay runs with paid → approved in status history (ledger sync reopen signal).
 * Optional: only runs whose pay-run `period_start` falls in the window.
 * @param {import("pg").Pool} pool
 * @param {{ periodStartFrom?: string | null, periodStartTo?: string | null }} [opts]
 * @returns {Promise<Map<number, number>>}
 */
async function getReopenedRunCountByTenant(pool, opts = {}) {
  const { from, to, hasPeriod } = _periodBounds(opts);
  try {
    const r = hasPeriod
      ? await pool.query(
          `
          SELECT h.tenant_id::int AS tenant_id,
                 COUNT(DISTINCT h.pay_run_id)::int AS cnt
          FROM public.field_agent_pay_run_status_history h
          INNER JOIN public.field_agent_pay_runs pr
            ON pr.id = h.pay_run_id AND pr.tenant_id = h.tenant_id
          WHERE h.from_status = 'paid' AND h.to_status = 'approved'
            AND ($1::date IS NULL OR pr.period_start >= $1::date)
            AND ($2::date IS NULL OR pr.period_start <= $2::date)
          GROUP BY h.tenant_id
          `,
          [from, to]
        )
      : await pool.query(
          `
          SELECT h.tenant_id::int AS tenant_id,
                 COUNT(DISTINCT h.pay_run_id)::int AS cnt
          FROM public.field_agent_pay_run_status_history h
          WHERE h.from_status = 'paid' AND h.to_status = 'approved'
          GROUP BY h.tenant_id
          `
        );
    const m = new Map();
    for (const row of r.rows) {
      m.set(Number(row.tenant_id), Number(row.cnt || 0));
    }
    return m;
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "";
    if (msg.includes("field_agent_pay_run_status_history") || (e && e.code === "42P01")) {
      return new Map();
    }
    throw e;
  }
}

/**
 * Distinct pay runs with at least one reversal or correction_payment ledger line (metadata.type).
 * Optional: only runs whose pay-run `period_start` falls in the window.
 * @param {import("pg").Pool} pool
 * @param {{ periodStartFrom?: string | null, periodStartTo?: string | null }} [opts]
 * @returns {Promise<Map<number, number>>}
 */
async function getAdjustedRunCountByTenant(pool, opts = {}) {
  const { from, to, hasPeriod } = _periodBounds(opts);
  const r = hasPeriod
    ? await pool.query(
        `
        SELECT p.tenant_id::int AS tenant_id,
               COUNT(DISTINCT p.pay_run_id)::int AS cnt
        FROM public.field_agent_pay_run_payments p
        INNER JOIN public.field_agent_pay_runs pr
          ON pr.id = p.pay_run_id AND pr.tenant_id = p.tenant_id
        WHERE (p.metadata->>'type') IN ('reversal', 'correction_payment')
          AND ($1::date IS NULL OR pr.period_start >= $1::date)
          AND ($2::date IS NULL OR pr.period_start <= $2::date)
        GROUP BY p.tenant_id
        `,
        [from, to]
      )
    : await pool.query(
        `
        SELECT p.tenant_id::int AS tenant_id,
               COUNT(DISTINCT p.pay_run_id)::int AS cnt
        FROM public.field_agent_pay_run_payments p
        WHERE (p.metadata->>'type') IN ('reversal', 'correction_payment')
        GROUP BY p.tenant_id
        `
      );
  const m = new Map();
  for (const row of r.rows) {
    m.set(Number(row.tenant_id), Number(row.cnt || 0));
  }
  return m;
}

/**
 * Latest finance-related activity per tenant (pay runs, payments, optional status history).
 * @param {import("pg").Pool} pool
 * @returns {Promise<Map<number, Date | null>>}
 */
async function getLatestFinanceActivityByTenant(pool) {
  const run = async (includeHistory) => {
    const sql = includeHistory
      ? `
        SELECT u.tenant_id::int AS tenant_id, MAX(u.activity_ts) AS latest_at
        FROM (
          SELECT pr.tenant_id, pr.updated_at AS activity_ts FROM public.field_agent_pay_runs pr
          UNION ALL
          SELECT pay.tenant_id, pay.created_at AS activity_ts FROM public.field_agent_pay_run_payments pay
          UNION ALL
          SELECT h.tenant_id, h.created_at AS activity_ts FROM public.field_agent_pay_run_status_history h
        ) u
        GROUP BY u.tenant_id
        `
      : `
        SELECT u.tenant_id::int AS tenant_id, MAX(u.activity_ts) AS latest_at
        FROM (
          SELECT pr.tenant_id, pr.updated_at AS activity_ts FROM public.field_agent_pay_runs pr
          UNION ALL
          SELECT pay.tenant_id, pay.created_at AS activity_ts FROM public.field_agent_pay_run_payments pay
        ) u
        GROUP BY u.tenant_id
        `;
    const r = await pool.query(sql);
    const m = new Map();
    for (const row of r.rows) {
      m.set(Number(row.tenant_id), row.latest_at instanceof Date ? row.latest_at : null);
    }
    return m;
  };
  try {
    return await run(true);
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "";
    if (msg.includes("field_agent_pay_run_status_history") || (e && e.code === "42P01")) {
      return run(false);
    }
    throw e;
  }
}

/** Presets for tenant-level exception filtering (summary table). */
const CROSS_TENANT_TENANT_PRESET = Object.freeze({
  OUTSTANDING: "outstanding",
  REOPENED: "reopened",
  FREQUENT_ADJUSTMENTS: "frequent_adjustments",
});

/**
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
function normalizeCrossTenantTenantPreset(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toLowerCase();
  if (s === CROSS_TENANT_TENANT_PRESET.OUTSTANDING) return CROSS_TENANT_TENANT_PRESET.OUTSTANDING;
  if (s === CROSS_TENANT_TENANT_PRESET.REOPENED) return CROSS_TENANT_TENANT_PRESET.REOPENED;
  if (s === CROSS_TENANT_TENANT_PRESET.FREQUENT_ADJUSTMENTS) return CROSS_TENANT_TENANT_PRESET.FREQUENT_ADJUSTMENTS;
  return null;
}

/**
 * Cross-tenant finance summary: DB-backed per-tenant aggregates + platform roll-up (read-only).
 * Aligns KPIs with tenant payout finance dashboard (frozen on approved+paid; net paid = full ledger, or period-scoped ledger when a period window is set).
 *
 * @param {import("pg").Pool} pool
 * @param {{
 *   periodStartFrom?: string | null,
 *   periodStartTo?: string | null,
 *   tenantId?: number | null,
 *   tenantExceptionPreset?: string | null,
 *   frequentAdjustmentsMinRuns?: number,
 * }} [opts]
 * @returns {Promise<{ platform: object, tenants: object[], filterMeta: object }>}
 */
async function getCrossTenantFinanceSummaryDashboard(pool, opts = {}) {
  const dateOpts = {
    periodStartFrom: opts.periodStartFrom && String(opts.periodStartFrom).trim() ? String(opts.periodStartFrom).trim() : null,
    periodStartTo: opts.periodStartTo && String(opts.periodStartTo).trim() ? String(opts.periodStartTo).trim() : null,
  };
  const onlyTid = opts.tenantId != null && Number.isFinite(Number(opts.tenantId)) && Number(opts.tenantId) > 0 ? Number(opts.tenantId) : null;
  const tenantPreset = normalizeCrossTenantTenantPreset(opts.tenantExceptionPreset);
  const frequentMin = Math.min(100, Math.max(1, Number(opts.frequentAdjustmentsMinRuns) || 3));
  const { hasPeriod } = _periodBounds(dateOpts);

  const [
    tenantRows,
    frozenByTenant,
    netPaidByTenant,
    statusByTenant,
    reopenedByTenant,
    adjustedByTenant,
    latestByTenant,
    globalStatus,
    globalReopened,
    globalAdjusted,
  ] = await Promise.all([
    pool.query(`SELECT id::int AS id, name::text AS name, slug::text AS slug FROM public.tenants ORDER BY id ASC`),
    getFrozenPayableApprovedPaidByTenant(pool, dateOpts),
    getNetPaidLedgerTotalByTenant(pool, dateOpts),
    getPayRunStatusCountsByTenant(pool, dateOpts),
    getReopenedRunCountByTenant(pool, dateOpts),
    getAdjustedRunCountByTenant(pool, dateOpts),
    getLatestFinanceActivityByTenant(pool),
    pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE pr.status = 'paid')::int AS cnt_paid,
        COUNT(*) FILTER (WHERE pr.status = 'approved')::int AS cnt_approved
      FROM public.field_agent_pay_runs pr
      WHERE ($1::date IS NULL OR pr.period_start >= $1::date)
        AND ($2::date IS NULL OR pr.period_start <= $2::date)
      `,
      [dateOpts.periodStartFrom, dateOpts.periodStartTo]
    ),
    (async () => {
      try {
        const r = hasPeriod
          ? await pool.query(
              `
              SELECT COUNT(DISTINCT h.pay_run_id)::int AS c
              FROM public.field_agent_pay_run_status_history h
              INNER JOIN public.field_agent_pay_runs pr
                ON pr.id = h.pay_run_id AND pr.tenant_id = h.tenant_id
              WHERE h.from_status = 'paid' AND h.to_status = 'approved'
                AND ($1::date IS NULL OR pr.period_start >= $1::date)
                AND ($2::date IS NULL OR pr.period_start <= $2::date)
              `,
              [dateOpts.periodStartFrom, dateOpts.periodStartTo]
            )
          : await pool.query(
              `
              SELECT COUNT(DISTINCT pay_run_id)::int AS c
              FROM public.field_agent_pay_run_status_history
              WHERE from_status = 'paid' AND to_status = 'approved'
              `
            );
        return Number(r.rows[0]?.c || 0);
      } catch (e) {
        const msg = e && e.message ? String(e.message) : "";
        if (msg.includes("field_agent_pay_run_status_history") || (e && e.code === "42P01")) {
          return 0;
        }
        throw e;
      }
    })(),
    (async () => {
      const r = hasPeriod
        ? await pool.query(
            `
            SELECT COUNT(DISTINCT p.pay_run_id)::int AS c
            FROM public.field_agent_pay_run_payments p
            INNER JOIN public.field_agent_pay_runs pr
              ON pr.id = p.pay_run_id AND pr.tenant_id = p.tenant_id
            WHERE (p.metadata->>'type') IN ('reversal', 'correction_payment')
              AND ($1::date IS NULL OR pr.period_start >= $1::date)
              AND ($2::date IS NULL OR pr.period_start <= $2::date)
            `,
            [dateOpts.periodStartFrom, dateOpts.periodStartTo]
          )
        : await pool.query(
            `
            SELECT COUNT(DISTINCT pay_run_id)::int AS c
            FROM public.field_agent_pay_run_payments
            WHERE (metadata->>'type') IN ('reversal', 'correction_payment')
            `
          );
      return Number(r.rows[0]?.c || 0);
    })(),
  ]);

  const gs = globalStatus.rows[0] || {};
  let tenants = tenantRows.rows.map((t) => {
    const id = Number(t.id);
    const frozen = frozenByTenant.get(id) ?? 0;
    const netPaid = netPaidByTenant.get(id) ?? 0;
    const remaining = fieldAgentPayRunRepo.roundMoney2(frozen - netPaid);
    const st = statusByTenant.get(id) || { draft: 0, locked: 0, approved: 0, paid: 0 };
    const reopenedCount = reopenedByTenant.get(id) ?? 0;
    const adjustedCount = adjustedByTenant.get(id) ?? 0;
    const latestAt = latestByTenant.get(id) ?? null;
    return {
      tenant_id: id,
      tenant_name: String(t.name || ""),
      tenant_slug: String(t.slug || ""),
      frozen_payable_total: frozen,
      total_net_paid: netPaid,
      remaining_balance: remaining,
      paid_run_count: Number(st.paid || 0),
      approved_run_count: Number(st.approved || 0),
      reopened_run_count: reopenedCount,
      adjusted_run_count: adjustedCount,
      latest_activity_at: latestAt instanceof Date ? latestAt.toISOString() : null,
    };
  });

  if (onlyTid != null) {
    tenants = tenants.filter((row) => row.tenant_id === onlyTid);
  }
  if (tenantPreset === CROSS_TENANT_TENANT_PRESET.OUTSTANDING) {
    tenants = tenants.filter((row) => fieldAgentPayRunRepo.roundMoney2(Number(row.remaining_balance || 0)) > 0);
  } else if (tenantPreset === CROSS_TENANT_TENANT_PRESET.REOPENED) {
    tenants = tenants.filter((row) => Number(row.reopened_run_count || 0) > 0);
  } else if (tenantPreset === CROSS_TENANT_TENANT_PRESET.FREQUENT_ADJUSTMENTS) {
    tenants = tenants.filter((row) => Number(row.adjusted_run_count || 0) >= frequentMin);
  }

  let totalFrozen = 0;
  let totalNetPaid = 0;
  for (const row of tenants) {
    totalFrozen = fieldAgentPayRunRepo.roundMoney2(totalFrozen + Number(row.frozen_payable_total || 0));
    totalNetPaid = fieldAgentPayRunRepo.roundMoney2(totalNetPaid + Number(row.total_net_paid || 0));
  }

  const platform = {
    total_frozen_payable: totalFrozen,
    total_net_paid: totalNetPaid,
    total_remaining_balance: fieldAgentPayRunRepo.roundMoney2(totalFrozen - totalNetPaid),
    paid_run_count: Number(gs.cnt_paid || 0),
    approved_run_count: Number(gs.cnt_approved || 0),
    reopened_run_count: globalReopened,
    adjusted_run_count: globalAdjusted,
    tenant_count: tenants.length,
  };

  const filterMeta = {
    periodStartFrom: dateOpts.periodStartFrom,
    periodStartTo: dateOpts.periodStartTo,
    periodScopedLedger: hasPeriod,
    tenantId: onlyTid,
    tenantExceptionPreset: tenantPreset,
    frequentAdjustmentsMinRuns: frequentMin,
  };

  return { platform, tenants, filterMeta };
}

/**
 * Pay runs for cross-tenant exception reporting (read-only). One row per run; ledger totals per run (SUM amount).
 * @param {import("pg").Pool} pool
 * @param {{
 *   periodStartFrom?: string | null,
 *   periodStartTo?: string | null,
 *   tenantId?: number | null,
 *   runStatus?: string | null,
 *   adjustedOnly?: boolean,
 *   reopenedOnly?: boolean,
 *   outstandingOnly?: boolean,
 *   changedAfterCloseOrSnapshotOnly?: boolean,
 *   limit?: number,
 * }} [opts]
 */
async function listCrossTenantFinanceExceptionRuns(pool, opts = {}) {
  const lim = Math.min(Math.max(Number(opts.limit) || 80, 1), 200);
  const dateOpts = {
    periodStartFrom: opts.periodStartFrom && String(opts.periodStartFrom).trim() ? String(opts.periodStartFrom).trim() : null,
    periodStartTo: opts.periodStartTo && String(opts.periodStartTo).trim() ? String(opts.periodStartTo).trim() : null,
  };
  const onlyTid = opts.tenantId != null && Number.isFinite(Number(opts.tenantId)) && Number(opts.tenantId) > 0 ? Number(opts.tenantId) : null;
  const st = opts.runStatus != null ? String(opts.runStatus).trim().toLowerCase() : "";
  const statusOk = ["draft", "locked", "approved", "paid", "void"].includes(st) ? st : null;

  const adjustedOnly = !!opts.adjustedOnly;
  const reopenedOnly = !!opts.reopenedOnly;
  const outstandingOnly = !!opts.outstandingOnly;
  const changedOnly = !!opts.changedAfterCloseOrSnapshotOnly;

  const params = [dateOpts.periodStartFrom, dateOpts.periodStartTo, onlyTid, statusOk, lim];
  let statusSql = "($4::text IS NULL OR pr.status::text = $4::text)";
  let extra = "";

  if (adjustedOnly) {
    extra += `
      AND EXISTS (
        SELECT 1 FROM public.field_agent_pay_run_payments p
        WHERE p.tenant_id = pr.tenant_id AND p.pay_run_id = pr.id
          AND (p.metadata->>'type') IN ('reversal', 'correction_payment')
      )`;
  }
  if (reopenedOnly) {
    extra += `
      AND EXISTS (
        SELECT 1 FROM public.field_agent_pay_run_status_history h
        WHERE h.tenant_id = pr.tenant_id AND h.pay_run_id = pr.id
          AND h.from_status = 'paid' AND h.to_status = 'approved'
      )`;
  }
  if (outstandingOnly) {
    extra += `
      AND COALESCE((
        SELECT COALESCE(SUM(COALESCE(i.net_payable_amount, (
          COALESCE(i.sp_payable_amount, 0) + COALESCE(i.ec_payable_amount, 0) + COALESCE(i.recruitment_commission_amount, 0)
        ))), 0)::numeric
        FROM public.field_agent_pay_run_items i
        WHERE i.pay_run_id = pr.id AND i.tenant_id = pr.tenant_id
      ), 0) >
      COALESCE((
        SELECT COALESCE(SUM(pay.amount), 0)::numeric
        FROM public.field_agent_pay_run_payments pay
        WHERE pay.pay_run_id = pr.id AND pay.tenant_id = pr.tenant_id
      ), 0)`;
  }
  if (changedOnly) {
    extra += `
      AND (
        (pr.closed_at IS NOT NULL AND pr.updated_at > pr.closed_at)
        OR EXISTS (
          SELECT 1 FROM public.field_agent_pay_run_snapshots s
          WHERE s.tenant_id = pr.tenant_id AND s.pay_run_id = pr.id
            AND pr.updated_at > s.snapshot_at
        )
      )`;
  }

  const sql = `
    SELECT
      t.id::int AS tenant_id,
      t.name::text AS tenant_name,
      t.slug::text AS tenant_slug,
      pr.id::int AS pay_run_id,
      pr.status::text AS run_status,
      pr.period_start,
      pr.period_end,
      pr.closed_at,
      pr.updated_at,
      COALESCE((
        SELECT COALESCE(SUM(COALESCE(i.net_payable_amount, (
          COALESCE(i.sp_payable_amount, 0)
          + COALESCE(i.ec_payable_amount, 0)
          + COALESCE(i.recruitment_commission_amount, 0)
        ))), 0)::numeric
        FROM public.field_agent_pay_run_items i
        WHERE i.pay_run_id = pr.id AND i.tenant_id = pr.tenant_id
      ), 0)::numeric AS frozen_payable,
      COALESCE((
        SELECT SUM(pay.amount)::numeric
        FROM public.field_agent_pay_run_payments pay
        WHERE pay.pay_run_id = pr.id AND pay.tenant_id = pr.tenant_id
      ), 0)::numeric AS net_paid
    FROM public.field_agent_pay_runs pr
    INNER JOIN public.tenants t ON t.id = pr.tenant_id
    WHERE ($1::date IS NULL OR pr.period_start >= $1::date)
      AND ($2::date IS NULL OR pr.period_start <= $2::date)
      AND ($3::int IS NULL OR pr.tenant_id = $3::int)
      AND ${statusSql}
      ${extra}
    ORDER BY pr.updated_at DESC NULLS LAST, pr.id DESC
    LIMIT $5
  `;

  try {
    const r = await pool.query(sql, params);
    return r.rows.map((row) => {
      const frozen = fieldAgentPayRunRepo.roundMoney2(Number(row.frozen_payable || 0));
      const net = fieldAgentPayRunRepo.roundMoney2(Number(row.net_paid || 0));
      return {
        tenant_id: Number(row.tenant_id),
        tenant_name: String(row.tenant_name || ""),
        tenant_slug: String(row.tenant_slug || ""),
        pay_run_id: Number(row.pay_run_id),
        run_status: String(row.run_status || ""),
        period_start: row.period_start,
        period_end: row.period_end,
        closed_at: row.closed_at,
        updated_at: row.updated_at,
        frozen_payable: frozen,
        net_paid: net,
        remaining_balance: fieldAgentPayRunRepo.roundMoney2(frozen - net),
      };
    });
  } catch (e) {
    const code = e && e.code;
    if ((reopenedOnly || changedOnly) && code === "42P01") {
      return [];
    }
    throw e;
  }
}

module.exports = {
  getPayRunStatusCountsByTenant,
  getApprovedPaidRunReconciliationRows,
  getTenantPayRunFinanceRows,
  getUnappliedAdjustmentsByTenant,
  getRecentPaymentActivity,
  rollupReconciliationByTenant,
  rollupPlatform,
  computeRecStatus,
  getFieldAgentPayoutDashboardSummary,
  listPayRunsForPayoutDashboard,
  listPayRunsForCfoSummaryExport,
  listPayRunsForCrossTenantCfoSummaryExport,
  listRecentPayRunReopenHistory,
  listPayRunStatusHistoryForPayRun,
  cfoLedgerRowKind,
  cfoLedgerRowKindCode,
  cfoLedgerMetadataSummary,
  buildReconciliationStripCore,
  adjustmentStateFromLedgerRows,
  reopenStateLabelFromStatusHistory,
  buildPayRunSoftCloseWarnings,
  getTenantLedgerHasReversalOrCorrection,
  getTenantHasPaidToApprovedHistory,
  FINANCE_EXCEPTION_PRESET,
  FINANCE_EXCEPTION_RECENT_ACTIVITY_DAYS,
  normalizeFinanceExceptionPreset,
  getFinanceExceptionPresetMeta,
  getCrossTenantFinanceSummaryDashboard,
  CROSS_TENANT_TENANT_PRESET,
  normalizeCrossTenantTenantPreset,
  listCrossTenantFinanceExceptionRuns,
};
