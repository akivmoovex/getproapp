"use strict";

/**
 * Persist admin pay runs (frozen snapshot rows) with draft → locked → approved workflow.
 */

async function assertPayRunIsDraft(pool, payRunId) {
  const r = await pool.query(`SELECT status FROM public.field_agent_pay_runs WHERE id = $1`, [payRunId]);
  const st = r.rows[0] && r.rows[0].status;
  if (st !== "draft") {
    const e = new Error("PAY_RUN_NOT_DRAFT");
    e.code = "PAY_RUN_NOT_DRAFT";
    throw e;
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, periodStart: Date, periodEnd: Date, adminUserId: number | null, notes?: string }} p
 */
async function insertPayRunDraft(executor, { tenantId, periodStart, periodEnd, adminUserId, notes }) {
  const r = await executor.query(
    `
    INSERT INTO public.field_agent_pay_runs (
      tenant_id, period_start, period_end, status, created_by_admin_user_id, notes, updated_at
    ) VALUES ($1, $2, $3, 'draft', $4, $5, now())
    RETURNING id
    `,
    [tenantId, periodStart, periodEnd, adminUserId, String(notes || "").slice(0, 2000)]
  );
  return Number(r.rows[0].id);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} payRunId
 * @param {Array<Record<string, unknown>>} items
 */
function roundMoney2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function toMoneyFixed2(n) {
  return roundMoney2(n).toFixed(2);
}

function computeReconciliationStatus(payable, paid) {
  const p = roundMoney2(payable);
  const x = roundMoney2(paid);
  if (x <= 0) return "unpaid";
  if (x < p) return "partial";
  if (x === p) return "paid";
  return "overpaid";
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} executor
 */
async function insertPayRunItems(executor, payRunId, tenantId, items) {
  const tid = Number(tenantId);
  const pid = Number(payRunId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(pid) || pid < 1) return 0;
  await assertPayRunIsDraft(executor, pid);
  let n = 0;
  for (const it of items) {
    const spPay = Number(it.spPayableAmount);
    const ecPay = Number(it.ecPayableAmount);
    const rec = Number(it.recruitmentCommissionAmount);
    const base = roundMoney2(
      (Number.isFinite(spPay) ? spPay : 0) + (Number.isFinite(ecPay) ? ecPay : 0) + (Number.isFinite(rec) ? rec : 0)
    );
    const applied =
      it.appliedAdjustmentAmount != null && it.appliedAdjustmentAmount !== ""
        ? roundMoney2(it.appliedAdjustmentAmount)
        : 0;
    const net =
      it.netPayableAmount != null && it.netPayableAmount !== "" ? roundMoney2(it.netPayableAmount) : roundMoney2(base + applied);
    const adjCount =
      it.appliedAdjustmentCount != null && Number.isFinite(Number(it.appliedAdjustmentCount))
        ? Math.max(0, Math.floor(Number(it.appliedAdjustmentCount)))
        : 0;
    const adjLabel =
      it.adjustmentSummaryLabel != null && String(it.adjustmentSummaryLabel).trim()
        ? String(it.adjustmentSummaryLabel).trim().slice(0, 500)
        : null;
    // eslint-disable-next-line no-await-in-loop
    await executor.query(
      `
      INSERT INTO public.field_agent_pay_run_items (
        pay_run_id, tenant_id, field_agent_id, field_agent_label_snapshot,
        period_start, period_end,
        sp_rating_value_used,
        sp_rating_low_threshold_used, sp_rating_high_threshold_used,
        sp_high_rating_bonus_percent_used,
        earned_sp_commission, sp_bonus_amount, sp_withheld_amount, sp_payable_amount,
        earned_ec_commission, ec_withheld_amount, ec_payable_amount,
        recruitment_commission_amount,
        quality_status_label_sp, quality_status_label_ec,
        applied_adjustment_amount, net_payable_amount, applied_adjustment_count, adjustment_summary_label
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17,
        $18,
        $19, $20,
        $21, $22, $23, $24
      )
      `,
      [
        pid,
        tid,
        it.fieldAgentId,
        String(it.fieldAgentLabel || "").slice(0, 500),
        it.periodStart,
        it.periodEnd,
        it.spRatingValue,
        it.spRatingLowThresholdUsed,
        it.spRatingHighThresholdUsed,
        it.spHighRatingBonusPercentUsed,
        it.earnedSpCommission,
        it.spBonusAmount,
        it.spWithheldAmount,
        it.spPayableAmount,
        it.earnedEcCommission,
        it.ecWithheldAmount,
        it.ecPayableAmount,
        it.recruitmentCommissionAmount,
        String(it.qualityStatusLabelSp || "").slice(0, 120),
        String(it.qualityStatusLabelEc || "").slice(0, 120),
        applied,
        net,
        adjCount,
        adjLabel,
      ]
    );
    n += 1;
  }
  return n;
}

async function countItemsForPayRun(pool, payRunId, tenantId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.field_agent_pay_run_items WHERE pay_run_id = $1 AND tenant_id = $2`,
    [payRunId, tenantId]
  );
  return Number(r.rows[0].c);
}

/**
 * draft → locked. Fails if not draft, no items, or concurrent transition.
 * @returns {{ run: object | null, error: 'NO_ITEMS' | 'INVALID_STATE' | null }}
 */
async function lockPayRunDraft(pool, payRunId, tenantId, adminUserId) {
  const pid = Number(payRunId);
  const tid = Number(tenantId);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) {
    return { run: null, error: "INVALID_STATE" };
  }
  const n = await countItemsForPayRun(pool, pid, tid);
  if (n === 0) return { run: null, error: "NO_ITEMS" };
  const aid = adminUserId != null && Number.isFinite(Number(adminUserId)) && Number(adminUserId) > 0 ? Number(adminUserId) : null;
  const r = await pool.query(
    `
    UPDATE public.field_agent_pay_runs
    SET status = 'locked',
        locked_at = now(),
        locked_by_admin_user_id = $3,
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2 AND status = 'draft'
    RETURNING *
    `,
    [pid, tid, aid]
  );
  if (!r.rows.length) return { run: null, error: "INVALID_STATE" };
  return { run: r.rows[0], error: null };
}

/**
 * locked → approved.
 * @returns {{ run: object | null, error: 'INVALID_STATE' | null }}
 */
async function approvePayRunLocked(pool, payRunId, tenantId, adminUserId) {
  const pid = Number(payRunId);
  const tid = Number(tenantId);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) {
    return { run: null, error: "INVALID_STATE" };
  }
  const aid = adminUserId != null && Number.isFinite(Number(adminUserId)) && Number(adminUserId) > 0 ? Number(adminUserId) : null;
  const r = await pool.query(
    `
    UPDATE public.field_agent_pay_runs
    SET status = 'approved',
        approved_at = now(),
        approved_by_admin_user_id = $3,
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2 AND status = 'locked'
    RETURNING *
    `,
    [pid, tid, aid]
  );
  if (!r.rows.length) return { run: null, error: "INVALID_STATE" };
  return { run: r.rows[0], error: null };
}

/**
 * approved → paid. Single-use transition (WHERE status = 'approved').
 * @returns {{ run: object | null, error: 'INVALID_STATE' | null }}
 */
async function markPayRunApprovedAsPaid(pool, payRunId, tenantId, adminUserId, { payoutReference, payoutNotes } = {}) {
  const pid = Number(payRunId);
  const tid = Number(tenantId);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) {
    return { run: null, error: "INVALID_STATE" };
  }
  const aid = adminUserId != null && Number.isFinite(Number(adminUserId)) && Number(adminUserId) > 0 ? Number(adminUserId) : null;
  const pref = payoutReference != null ? String(payoutReference).trim().slice(0, 2000) : "";
  const pnotes = payoutNotes != null ? String(payoutNotes).trim().slice(0, 4000) : "";
  const r = await pool.query(
    `
    UPDATE public.field_agent_pay_runs
    SET status = 'paid',
        paid_at = now(),
        paid_by_admin_user_id = $3,
        payout_reference = NULLIF($4::text, ''),
        payout_notes = NULLIF($5::text, ''),
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2 AND status = 'approved'
    RETURNING *
    `,
    [pid, tid, aid, pref, pnotes]
  );
  if (!r.rows.length) return { run: null, error: "INVALID_STATE" };
  return { run: r.rows[0], error: null };
}

/**
 * Backward-compatible shortcut: mark paid by recording one full-outstanding payment event.
 */
async function markPayRunApprovedAsPaidViaLedger(pool, payRunId, tenantId, adminUserId, { payoutReference, payoutNotes } = {}) {
  const pid = Number(payRunId);
  const tid = Number(tenantId);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) {
    return { run: null, error: "INVALID_STATE" };
  }
  const run = await getPayRunByIdForTenant(pool, pid, tid);
  if (!run || String(run.status || "") !== "approved") {
    return { run: null, error: "INVALID_STATE" };
  }
  const rec = await getPayRunReconciliationSummary(pool, pid, tid);
  if (!rec) return { run: null, error: "INVALID_STATE" };
  const outstanding = roundMoney2(rec.outstanding_amount);
  if (outstanding <= 0) {
    return markPayRunApprovedAsPaid(pool, pid, tid, adminUserId, { payoutReference, payoutNotes });
  }
  const today = new Date().toISOString().slice(0, 10);
  const add = await addPaymentForPayRun(pool, {
    payRunId: pid,
    tenantId: tid,
    paymentDate: today,
    amount: outstanding,
    paymentMethod: "manual",
    paymentReference: payoutReference,
    notes: payoutNotes,
    createdByAdminUserId: adminUserId,
  });
  if (!add.ok) return { run: null, error: "INVALID_STATE" };
  const row = await getPayRunByIdForTenant(pool, pid, tid);
  if (!row || String(row.status || "") !== "paid") {
    return { run: null, error: "INVALID_STATE" };
  }
  return { run: row, error: null };
}

/**
 * Record last CSV export (idempotent; safe to call on each download).
 */
async function recordPayRunExportGenerated(pool, payRunId, tenantId) {
  const pid = Number(payRunId);
  const tid = Number(tenantId);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) return null;
  const r = await pool.query(
    `
    UPDATE public.field_agent_pay_runs
    SET export_generated_at = now(),
        export_format = 'csv',
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2 AND status IN ('approved', 'paid')
    RETURNING *
    `,
    [pid, tid]
  );
  return r.rows[0] ?? null;
}

/**
 * Frozen payable total (from pay_run_items snapshot) versus payment ledger total.
 * Does not mutate run state; safe for read paths.
 */
async function getPayRunReconciliationSummary(pool, payRunId, tenantId) {
  const pid = Number(payRunId);
  const tid = Number(tenantId);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) return null;
  const run = await getPayRunByIdForTenant(pool, pid, tid);
  if (!run) return null;
  const totals = await pool.query(
    `
    SELECT
      COALESCE((
        SELECT SUM(COALESCE(i.net_payable_amount, (
          COALESCE(i.sp_payable_amount, 0)
          + COALESCE(i.ec_payable_amount, 0)
          + COALESCE(i.recruitment_commission_amount, 0)
        )))::numeric
        FROM public.field_agent_pay_run_items i
        WHERE i.pay_run_id = $1 AND i.tenant_id = $2
      ), 0)::numeric AS run_payable_total,
      COALESCE((
        SELECT SUM(p.amount)::numeric
        FROM public.field_agent_pay_run_payments p
        WHERE p.pay_run_id = $1 AND p.tenant_id = $2
      ), 0)::numeric AS total_paid_amount
    `,
    [pid, tid]
  );
  const row = totals.rows[0] || {};
  const payable = roundMoney2(Number(row.run_payable_total || 0));
  const paid = roundMoney2(Number(row.total_paid_amount || 0));
  const outstanding = roundMoney2(payable - paid);
  const status = computeReconciliationStatus(payable, paid);
  return {
    run_id: pid,
    tenant_id: tid,
    run_status: String(run.status || ""),
    run_payable_total: payable,
    total_paid_amount: paid,
    outstanding_amount: outstanding,
    reconciliation_status: status,
  };
}

async function listPaymentsForPayRun(pool, payRunId, tenantId, limit = 200) {
  const pid = Number(payRunId);
  const tid = Number(tenantId);
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) return [];
  const r = await pool.query(
    `
    SELECT
      p.id,
      p.tenant_id,
      p.pay_run_id,
      p.payment_date,
      p.amount,
      p.payment_method,
      p.payment_reference,
      p.notes,
      p.created_at,
      p.created_by_admin_user_id
    FROM public.field_agent_pay_run_payments p
    WHERE p.pay_run_id = $1 AND p.tenant_id = $2
    ORDER BY p.payment_date DESC, p.id DESC
    LIMIT $3
    `,
    [pid, tid, lim]
  );
  return r.rows;
}

/**
 * Record one payment event for an approved/paid run.
 * If an approved run reaches full settlement (paid >= payable), status is transitioned to paid.
 */
async function addPaymentForPayRun(pool, p) {
  const pid = Number(p.payRunId);
  const tid = Number(p.tenantId);
  const adminId =
    p.createdByAdminUserId != null && Number.isFinite(Number(p.createdByAdminUserId)) && Number(p.createdByAdminUserId) > 0
      ? Number(p.createdByAdminUserId)
      : null;
  const amount = roundMoney2(p.amount);
  const paymentDateRaw = String(p.paymentDate || "").trim();
  const method = p.paymentMethod != null ? String(p.paymentMethod).trim().slice(0, 200) : "";
  const reference = p.paymentReference != null ? String(p.paymentReference).trim().slice(0, 2000) : "";
  const notes = p.notes != null ? String(p.notes).trim().slice(0, 4000) : "";

  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) {
    return { ok: false, error: "Invalid pay run." };
  }
  if (!(amount > 0)) {
    return { ok: false, error: "Payment amount must be greater than 0." };
  }
  if (!paymentDateRaw) {
    return { ok: false, error: "Payment date is required." };
  }
  const date = new Date(`${paymentDateRaw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== paymentDateRaw) {
    return { ok: false, error: "Invalid payment date." };
  }

  const run = await getPayRunByIdForTenant(pool, pid, tid);
  if (!run) return { ok: false, error: "Not found." };
  const st = String(run.status || "");
  if (st !== "approved" && st !== "paid") {
    return { ok: false, error: "Payments can only be recorded for approved or paid runs." };
  }

  const inserted = await pool.query(
    `
    INSERT INTO public.field_agent_pay_run_payments
      (tenant_id, pay_run_id, payment_date, amount, payment_method, payment_reference, notes, created_by_admin_user_id)
    VALUES
      ($1, $2, $3::date, $4::numeric(12,2), NULLIF($5::text, ''), NULLIF($6::text, ''), NULLIF($7::text, ''), $8)
    RETURNING *
    `,
    [tid, pid, paymentDateRaw, toMoneyFixed2(amount), method, reference, notes, adminId]
  );
  const payment = inserted.rows[0];
  const reconciliation = await getPayRunReconciliationSummary(pool, pid, tid);
  let outRun = run;
  if (
    st === "approved" &&
    reconciliation &&
    roundMoney2(reconciliation.total_paid_amount) >= roundMoney2(reconciliation.run_payable_total)
  ) {
    const mark = await markPayRunApprovedAsPaid(pool, pid, tid, adminId, {
      payoutReference: reference || "reconciled via payment ledger",
      payoutNotes: notes || "",
    });
    if (mark && mark.run) outRun = mark.run;
  }

  return { ok: true, payment, reconciliation, run: outRun };
}

async function listPayRunsForTenant(pool, tenantId, limit = 50) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const r = await pool.query(
    `
    SELECT id, tenant_id, period_start, period_end, status, created_at, updated_at, notes, created_by_admin_user_id,
           locked_at, locked_by_admin_user_id, approved_at, approved_by_admin_user_id,
           paid_at, paid_by_admin_user_id, payout_reference, export_generated_at, export_format
    FROM public.field_agent_pay_runs
    WHERE tenant_id = $1
    ORDER BY period_start DESC, id DESC
    LIMIT $2
    `,
    [tid, lim]
  );
  return r.rows;
}

async function getPayRunById(pool, payRunId) {
  const r = await pool.query(`SELECT * FROM public.field_agent_pay_runs WHERE id = $1 LIMIT 1`, [payRunId]);
  return r.rows[0] ?? null;
}

async function getPayRunByIdForTenant(pool, payRunId, tenantId) {
  const r = await pool.query(
    `SELECT * FROM public.field_agent_pay_runs WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [payRunId, tenantId]
  );
  return r.rows[0] ?? null;
}

async function listItemsForPayRun(pool, payRunId, tenantId) {
  const r = await pool.query(
    `
    SELECT *
    FROM public.field_agent_pay_run_items
    WHERE pay_run_id = $1 AND tenant_id = $2
    ORDER BY field_agent_id ASC
    `,
    [payRunId, tenantId]
  );
  return r.rows;
}

/**
 * One row per pay run where this field agent has a line item (frozen snapshot summary).
 * Visible statuses: approved + paid only (no draft/locked).
 * Newest period first.
 * @param {import("pg").Pool} pool
 * @param {{ limit?: number }} [options]
 */
async function listVisiblePayRunItemsForFieldAgent(pool, tenantId, fieldAgentId, options = {}) {
  const tid = Number(tenantId);
  const fid = Number(fieldAgentId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(fid) || fid < 1) return [];
  const lim = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const r = await pool.query(
    `
    SELECT
      pr.id AS pay_run_id,
      pr.status,
      pr.period_start,
      pr.period_end,
      pr.approved_at,
      pr.paid_at,
      i.id AS item_id,
      COALESCE(i.net_payable_amount, (
        COALESCE(i.sp_payable_amount, 0)
        + COALESCE(i.ec_payable_amount, 0)
        + COALESCE(i.recruitment_commission_amount, 0)
      ))::double precision AS total_payable
    FROM public.field_agent_pay_runs pr
    INNER JOIN public.field_agent_pay_run_items i
      ON i.pay_run_id = pr.id AND i.tenant_id = pr.tenant_id
    WHERE pr.tenant_id = $1
      AND i.field_agent_id = $2
      AND pr.status IN ('approved', 'paid')
    ORDER BY pr.period_start DESC NULLS LAST, pr.id DESC
    LIMIT $3
    `,
    [tid, fid, lim]
  );
  return r.rows;
}

/**
 * Frozen statement line for one field agent on one pay run (read-only).
 * @param {{ forAdmin?: boolean }} [opts] — if forAdmin, include draft/locked/approved/paid; else approved+paid only (field-agent policy).
 * @returns {Promise<object | null>}
 */
async function getPayRunStatementSnapshotForFieldAgent(pool, tenantId, payRunId, fieldAgentId, opts = {}) {
  const tid = Number(tenantId);
  const pid = Number(payRunId);
  const fid = Number(fieldAgentId);
  const forAdmin = !!opts.forAdmin;
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(pid) || pid < 1 || !Number.isFinite(fid) || fid < 1) {
    return null;
  }
  const statusClause = forAdmin ? "" : `AND pr.status IN ('approved', 'paid')`;
  const r = await pool.query(
    `
    SELECT
      pr.id AS pay_run_id,
      pr.status,
      pr.period_start,
      pr.period_end,
      pr.approved_at,
      pr.paid_at,
      i.id AS item_id,
      i.field_agent_label_snapshot,
      i.earned_sp_commission,
      i.sp_bonus_amount,
      i.sp_withheld_amount,
      i.sp_payable_amount,
      i.earned_ec_commission,
      i.ec_withheld_amount,
      i.ec_payable_amount,
      i.recruitment_commission_amount,
      i.quality_status_label_sp,
      i.quality_status_label_ec,
      (
        COALESCE(i.sp_payable_amount, 0)
        + COALESCE(i.ec_payable_amount, 0)
        + COALESCE(i.recruitment_commission_amount, 0)
      )::double precision AS base_payable_total,
      COALESCE(i.applied_adjustment_amount, 0)::double precision AS applied_adjustment_amount,
      COALESCE(i.applied_adjustment_count, 0)::int AS applied_adjustment_count,
      i.adjustment_summary_label,
      COALESCE(i.net_payable_amount, (
        COALESCE(i.sp_payable_amount, 0)
        + COALESCE(i.ec_payable_amount, 0)
        + COALESCE(i.recruitment_commission_amount, 0)
      ))::double precision AS total_payable
    FROM public.field_agent_pay_runs pr
    INNER JOIN public.field_agent_pay_run_items i
      ON i.pay_run_id = pr.id AND i.tenant_id = pr.tenant_id
    WHERE pr.tenant_id = $1
      AND i.field_agent_id = $2
      AND pr.id = $3
      ${statusClause}
    LIMIT 1
    `,
    [tid, fid, pid]
  );
  return r.rows[0] ?? null;
}

/**
 * Field-agent visibility: approved + paid only.
 * @returns {Promise<object | null>}
 */
async function getVisiblePayRunItemDetailForFieldAgent(pool, tenantId, fieldAgentId, payRunId) {
  return getPayRunStatementSnapshotForFieldAgent(pool, tenantId, payRunId, fieldAgentId, { forAdmin: false });
}

/**
 * Draft pay run + line items + link all unapplied adjustments (per field agent) in one transaction.
 * Deleting the draft pay run clears applied_in_pay_run_id via ON DELETE SET NULL on adjustments.
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, periodStart: Date, periodEnd: Date, adminUserId: number | null, notes?: string, previewRows: Array<Record<string, unknown>> }} p
 */
async function createDraftPayRunWithCarryForward(pool, p) {
  const fieldAgentPayRunAdjustmentsRepo = require("./fieldAgentPayRunAdjustmentsRepo");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const payRunId = await insertPayRunDraft(client, {
      tenantId: p.tenantId,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      adminUserId: p.adminUserId,
      notes: p.notes,
    });
    const tid = Number(p.tenantId);
    const byFa = await fieldAgentPayRunAdjustmentsRepo.fetchUnappliedAdjustmentsByFieldAgentForUpdate(client, tid);
    const allIds = [];
    const items = [];
    for (const row of p.previewRows) {
      const fid = Number(row.fieldAgentId);
      const g = byFa.get(fid) || { ids: [], sum: 0 };
      const applied = roundMoney2(g.sum);
      const adjCount = g.ids.length;
      const spPay = Number(row.spPayableAmount);
      const ecPay = Number(row.ecPayableAmount);
      const rec = Number(row.recruitmentCommissionAmount);
      const base = roundMoney2(
        (Number.isFinite(spPay) ? spPay : 0) + (Number.isFinite(ecPay) ? ecPay : 0) + (Number.isFinite(rec) ? rec : 0)
      );
      const net = roundMoney2(base + applied);
      allIds.push(...g.ids);
      items.push({
        ...row,
        appliedAdjustmentAmount: applied,
        netPayableAmount: net,
        appliedAdjustmentCount: adjCount,
        adjustmentSummaryLabel: adjCount > 0 ? `${adjCount} adjustment(s)` : null,
      });
    }
    await insertPayRunItems(client, payRunId, tid, items);
    const uniqueIds = [...new Set(allIds)];
    const link = await fieldAgentPayRunAdjustmentsRepo.linkAdjustmentsToPayRunIds(client, tid, payRunId, uniqueIds);
    if (link.linked !== uniqueIds.length) {
      const err = new Error("ADJUSTMENT_LINK_MISMATCH");
      err.code = "ADJUSTMENT_LINK_MISMATCH";
      throw err;
    }
    await client.query("COMMIT");
    return payRunId;
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

module.exports = {
  insertPayRunDraft,
  insertPayRunItems,
  roundMoney2,
  createDraftPayRunWithCarryForward,
  assertPayRunIsDraft,
  countItemsForPayRun,
  lockPayRunDraft,
  approvePayRunLocked,
  markPayRunApprovedAsPaid,
  markPayRunApprovedAsPaidViaLedger,
  recordPayRunExportGenerated,
  listPayRunsForTenant,
  getPayRunById,
  getPayRunByIdForTenant,
  listItemsForPayRun,
  getPayRunReconciliationSummary,
  listPaymentsForPayRun,
  addPaymentForPayRun,
  listVisiblePayRunItemsForFieldAgent,
  getVisiblePayRunItemDetailForFieldAgent,
  getPayRunStatementSnapshotForFieldAgent,
};
