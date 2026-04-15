"use strict";

const financeGuardService = require("../../finance/financeGuardService");
const financeOverrideEventsRepo = require("./financeOverrideEventsRepo");

const {
  PAY_RUN_CLOSED_ERROR,
  PAY_RUN_CLOSED_MESSAGE,
  REVERSAL_WINDOW_EXPIRED_ERROR,
  REVERSAL_WINDOW_EXPIRED_MESSAGE,
  ACCOUNTING_PERIOD_LOCKED_ERROR,
  ACCOUNTING_PERIOD_LOCKED_MESSAGE,
  payRunIsHardClosed,
  payRunAccountingPeriodKey,
  paymentExceedsReversalWindowDays,
} = financeGuardService;

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

/** @enum {string} */
const LEDGER_ENTRY_TYPE = {
  PAYMENT: "payment",
  REVERSAL: "reversal",
  CORRECTION_PAYMENT: "correction_payment",
};

/** Reasons stored on {@link insertPayRunStatusHistory} (ledger-driven status sync). */
const PAY_RUN_STATUS_HISTORY_REASON = {
  REVERSAL_OR_CORRECTION_REOPENED: "reversal_or_correction_reopened",
  LEDGER_SETTLED: "ledger_settled",
};

/** Hard-close: {@link markPayRunSoftClosed} sets closed_at — ledger mutations must be blocked. */

/** Index names from db/postgres/031_field_agent_pay_run_payments_unique_linkage.sql (pg reports these on unique_violation). */
const UQ_FAPR_REVERSAL_PER_ORIGINAL_PAYMENT = "uq_fapr_reversal_per_original_payment";
const UQ_FAPR_CORRECTION_PER_ORIGINAL_PAYMENT = "uq_fapr_correction_per_original_payment";

/**
 * @param {unknown} err
 * @returns {{ error: string, message: string } | null}
 */
function mapPaymentLedgerUniqueViolation(err) {
  const e = err && typeof err === "object" ? err : null;
  if (!e || e.code !== "23505") return null;
  const c = String(e.constraint || "");
  if (c === UQ_FAPR_REVERSAL_PER_ORIGINAL_PAYMENT) {
    return { error: "ALREADY_REVERSED", message: "This payment already has a reversal row (database constraint)." };
  }
  if (c === UQ_FAPR_CORRECTION_PER_ORIGINAL_PAYMENT) {
    return { error: "ALREADY_CORRECTED", message: "A correction payment for this line already exists (database constraint)." };
  }
  return null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} executor
 * @param {Record<string, unknown>} row
 */
function parsePaymentMetadata(row) {
  const m = row && row.metadata;
  if (m != null && typeof m === "object" && !Array.isArray(m)) return m;
  if (typeof m === "string" && m.trim()) {
    try {
      const o = JSON.parse(m);
      return o && typeof o === "object" ? o : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

/**
 * Append-only ledger row (amount may be negative for reversals).
 * @param {import("pg").Pool | import("pg").PoolClient} executor
 */
async function insertPaymentLedgerRow(executor, p) {
  const tid = Number(p.tenantId);
  const prid = Number(p.payRunId);
  const amt = roundMoney2(Number(p.amount));
  const paymentDateRaw = String(p.paymentDate || "").trim();
  const method = p.paymentMethod != null ? String(p.paymentMethod).trim().slice(0, 200) : "";
  const reference = p.paymentReference != null ? String(p.paymentReference).trim().slice(0, 2000) : "";
  const notes = p.notes != null ? String(p.notes).trim().slice(0, 4000) : "";
  const adminId =
    p.createdByAdminUserId != null && Number.isFinite(Number(p.createdByAdminUserId)) && Number(p.createdByAdminUserId) > 0
      ? Number(p.createdByAdminUserId)
      : null;
  const metaObj = p.metadata != null && typeof p.metadata === "object" && !Array.isArray(p.metadata) ? p.metadata : {};
  const metadataJson = JSON.stringify(metaObj);

  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(prid) || prid < 1) {
    throw new Error("INVALID_LEDGER_INSERT");
  }
  if (amt === 0 || !Number.isFinite(amt)) {
    throw new Error("INVALID_LEDGER_AMOUNT");
  }
  if (!paymentDateRaw) {
    throw new Error("INVALID_PAYMENT_DATE");
  }
  const date = new Date(`${paymentDateRaw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== paymentDateRaw) {
    throw new Error("INVALID_PAYMENT_DATE");
  }

  const payRunProbe = await executor.query(
    `SELECT closed_at FROM public.field_agent_pay_runs WHERE id = $1 AND tenant_id = $2`,
    [prid, tid]
  );
  if (!payRunProbe.rows[0]) {
    throw new Error("INVALID_LEDGER_INSERT");
  }
  if (payRunIsHardClosed(payRunProbe.rows[0])) {
    const err = new Error(PAY_RUN_CLOSED_MESSAGE);
    err.code = PAY_RUN_CLOSED_ERROR;
    throw err;
  }

  const r = await executor.query(
    `
    INSERT INTO public.field_agent_pay_run_payments
      (tenant_id, pay_run_id, payment_date, amount, payment_method, payment_reference, notes, created_by_admin_user_id, metadata)
    VALUES
      ($1, $2, $3::date, $4::numeric(12,2), NULLIF($5::text, ''), NULLIF($6::text, ''), NULLIF($7::text, ''), $8, $9::jsonb)
    RETURNING *
    `,
    [tid, prid, paymentDateRaw, toMoneyFixed2(amt), method, reference, notes, adminId, metadataJson]
  );
  return r.rows[0];
}

async function getPaymentByIdForTenant(pool, paymentId, payRunId, tenantId) {
  const pid = Number(paymentId);
  const prid = Number(payRunId);
  const tid = Number(tenantId);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(prid) || prid < 1 || !Number.isFinite(tid) || tid < 1) {
    return null;
  }
  const r = await pool.query(
    `
    SELECT * FROM public.field_agent_pay_run_payments
    WHERE id = $1 AND pay_run_id = $2 AND tenant_id = $3
    LIMIT 1
    `,
    [pid, prid, tid]
  );
  return r.rows[0] ?? null;
}

/**
 * Row lock for reverse/correct flows — serializes concurrent operations on the same payment line.
 * @param {import("pg").Pool | import("pg").PoolClient} executor
 */
async function getPaymentByIdForTenantForUpdate(executor, paymentId, payRunId, tenantId) {
  const pid = Number(paymentId);
  const prid = Number(payRunId);
  const tid = Number(tenantId);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(prid) || prid < 1 || !Number.isFinite(tid) || tid < 1) {
    return null;
  }
  const r = await executor.query(
    `
    SELECT * FROM public.field_agent_pay_run_payments
    WHERE id = $1 AND pay_run_id = $2 AND tenant_id = $3
    FOR UPDATE
    LIMIT 1
    `,
    [pid, prid, tid]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} executor
 */
async function reversalExistsForOriginalPaymentId(executor, tenantId, payRunId, originalPaymentId) {
  const tid = Number(tenantId);
  const prid = Number(payRunId);
  const oid = Number(originalPaymentId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(prid) || prid < 1 || !Number.isFinite(oid) || oid < 1) {
    return false;
  }
  const r = await executor.query(
    `
    SELECT 1 FROM public.field_agent_pay_run_payments
    WHERE tenant_id = $1 AND pay_run_id = $2
      AND (metadata->>'reverses_payment_id') IS NOT NULL
      AND (metadata->>'reverses_payment_id')::bigint = $3
    LIMIT 1
    `,
    [tid, prid, oid]
  );
  return r.rows.length > 0;
}

/**
 * Append-only audit row for pay-run status changes (ledger-driven paths).
 * @param {import("pg").Pool | import("pg").PoolClient} executor
 * @param {{ tenantId: number, payRunId: number, fromStatus: string, toStatus: string, reason: string, actorAdminUserId: number | null, sourcePaymentId: number | null }} row
 */
async function insertPayRunStatusHistory(executor, row) {
  const tid = Number(row.tenantId);
  const prid = Number(row.payRunId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(prid) || prid < 1) return;
  const aid =
    row.actorAdminUserId != null && Number.isFinite(Number(row.actorAdminUserId)) && Number(row.actorAdminUserId) > 0
      ? Number(row.actorAdminUserId)
      : null;
  const sid =
    row.sourcePaymentId != null && Number.isFinite(Number(row.sourcePaymentId)) && Number(row.sourcePaymentId) > 0
      ? Number(row.sourcePaymentId)
      : null;
  await executor.query(
    `
    INSERT INTO public.field_agent_pay_run_status_history (
      tenant_id, pay_run_id, from_status, to_status, reason, actor_admin_user_id, source_payment_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [tid, prid, String(row.fromStatus || ""), String(row.toStatus || ""), String(row.reason || "").slice(0, 4000), aid, sid]
  );
}

/**
 * When ledger SUM changes: reopen paid runs if underpaid; mark approved runs paid if fully settled.
 * @param {import("pg").Pool} pool
 * @param {number} payRunId
 * @param {number} tenantId
 * @param {number | null} adminUserId
 * @param {{ sourcePaymentId?: number }} [options]
 * @returns {{ changed: boolean, run?: object, action?: string }}
 */
async function syncPayRunStatusWithLedger(pool, payRunId, tenantId, adminUserId, options = {}) {
  const pid = Number(payRunId);
  const tid = Number(tenantId);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) {
    return { changed: false };
  }
  const sourcePaymentId =
    options.sourcePaymentId != null && Number.isFinite(Number(options.sourcePaymentId)) && Number(options.sourcePaymentId) > 0
      ? Number(options.sourcePaymentId)
      : null;
  const run = await getPayRunByIdForTenant(pool, pid, tid);
  if (!run) return { changed: false };
  if (payRunIsHardClosed(run)) {
    return { changed: false, run };
  }
  const rec = await getPayRunReconciliationSummary(pool, pid, tid);
  if (!rec) return { changed: false };
  const payable = roundMoney2(Number(rec.run_payable_total || 0));
  const paid = roundMoney2(Number(rec.total_paid_amount || 0));
  const st = String(run.status || "");

  if (st === "paid" && paid < payable) {
    const r = await pool.query(
      `
      UPDATE public.field_agent_pay_runs
      SET status = 'approved',
          paid_at = NULL,
          paid_by_admin_user_id = NULL,
          payout_reference = NULL,
          payout_notes = NULL,
          updated_at = now()
      WHERE id = $1 AND tenant_id = $2 AND status = 'paid'
      RETURNING *
      `,
      [pid, tid]
    );
    if (r.rows.length) {
      await insertPayRunStatusHistory(pool, {
        tenantId: tid,
        payRunId: pid,
        fromStatus: "paid",
        toStatus: "approved",
        reason: PAY_RUN_STATUS_HISTORY_REASON.REVERSAL_OR_CORRECTION_REOPENED,
        actorAdminUserId: adminUserId != null && Number.isFinite(Number(adminUserId)) && Number(adminUserId) > 0 ? Number(adminUserId) : null,
        sourcePaymentId,
      });
      return { changed: true, run: r.rows[0], action: "reopened_to_approved" };
    }
  }

  if (st === "approved" && paid >= payable) {
    const mark = await markPayRunApprovedAsPaid(pool, pid, tid, adminUserId, {
      payoutReference: "reconciled via payment ledger",
      payoutNotes: "",
    });
    if (mark.run) {
      await insertPayRunStatusHistory(pool, {
        tenantId: tid,
        payRunId: pid,
        fromStatus: "approved",
        toStatus: "paid",
        reason: PAY_RUN_STATUS_HISTORY_REASON.LEDGER_SETTLED,
        actorAdminUserId: adminUserId != null && Number.isFinite(Number(adminUserId)) && Number(adminUserId) > 0 ? Number(adminUserId) : null,
        sourcePaymentId,
      });
      return { changed: true, run: mark.run, action: "marked_paid" };
    }
  }

  return { changed: false, run };
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
  const probe = await getPayRunByIdForTenant(pool, pid, tid);
  if (!probe) return { run: null, error: "INVALID_STATE" };
  const markPaidGuards = await financeGuardService.assertHardCloseAndPeriodUnlocked(pool, tid, probe);
  if (!markPaidGuards.ok) {
    return { run: null, error: markPaidGuards.error };
  }
  const r = await pool.query(
    `
    UPDATE public.field_agent_pay_runs
    SET status = 'paid',
        paid_at = now(),
        paid_by_admin_user_id = $3,
        payout_reference = NULLIF($4::text, ''),
        payout_notes = NULLIF($5::text, ''),
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2 AND status = 'approved' AND closed_at IS NULL
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
  if (payRunIsHardClosed(run)) {
    return { run: null, error: PAY_RUN_CLOSED_ERROR };
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
  if (!add.ok) {
    if (add.error === PAY_RUN_CLOSED_ERROR) return { run: null, error: PAY_RUN_CLOSED_ERROR };
    if (add.error === ACCOUNTING_PERIOD_LOCKED_ERROR) return { run: null, error: ACCOUNTING_PERIOD_LOCKED_ERROR };
    return { run: null, error: "INVALID_STATE" };
  }
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

/**
 * Whether the pay run’s ledger includes at least one reversal or correction line (metadata.type).
 * @param {import("pg").Pool} pool
 * @param {number} payRunId
 * @param {number} tenantId
 */
async function payRunLedgerHasReversalOrCorrection(pool, payRunId, tenantId) {
  const pid = Number(payRunId);
  const tid = Number(tenantId);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) return false;
  const r = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1 FROM public.field_agent_pay_run_payments p
      WHERE p.pay_run_id = $1 AND p.tenant_id = $2
        AND (p.metadata->>'type') IN ($3, $4)
    ) AS x
    `,
    [pid, tid, LEDGER_ENTRY_TYPE.REVERSAL, LEDGER_ENTRY_TYPE.CORRECTION_PAYMENT]
  );
  return !!r.rows[0]?.x;
}

async function listPaymentsForPayRun(pool, payRunId, tenantId, limit = 200, opts = {}) {
  const pid = Number(payRunId);
  const tid = Number(tenantId);
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) return [];
  const order = opts && opts.order === "asc" ? "ASC" : "DESC";
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
      p.metadata,
      p.created_at,
      p.created_by_admin_user_id
    FROM public.field_agent_pay_run_payments p
    WHERE p.pay_run_id = $1 AND p.tenant_id = $2
    ORDER BY p.payment_date ${order}, p.id ${order}
    LIMIT $3
    `,
    [pid, tid, lim]
  );
  return r.rows;
}

/**
 * Record one payment event for an approved/paid run (positive amount; append-only ledger).
 * Status is synced via {@link syncPayRunStatusWithLedger} after insert.
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

  const client = await pool.connect();
  let payment;
  try {
    await client.query("BEGIN");
    const runLocked = await getPayRunByIdForTenantForUpdate(client, pid, tid);
    if (!runLocked) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Not found." };
    }
    const payGuards = await financeGuardService.assertPaymentRecordingGuards(client, tid, runLocked);
    if (!payGuards.ok) {
      await client.query("ROLLBACK");
      return { ok: false, error: payGuards.error, message: payGuards.message };
    }
    payment = await insertPaymentLedgerRow(client, {
      tenantId: tid,
      payRunId: pid,
      paymentDate: paymentDateRaw,
      amount,
      paymentMethod: method,
      paymentReference: reference,
      notes,
      createdByAdminUserId: adminId,
      metadata: { type: LEDGER_ENTRY_TYPE.PAYMENT },
    });
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    const msg = e && e.message ? String(e.message) : "";
    if (msg.includes("INVALID_PAYMENT_DATE")) return { ok: false, error: "Invalid payment date." };
    if (e && e.code === PAY_RUN_CLOSED_ERROR) {
      return { ok: false, error: PAY_RUN_CLOSED_ERROR, message: PAY_RUN_CLOSED_MESSAGE };
    }
    throw e;
  } finally {
    client.release();
  }

  const reconciliation = await getPayRunReconciliationSummary(pool, pid, tid);
  const run = await getPayRunByIdForTenant(pool, pid, tid);
  let outRun = run;
  const st = run ? String(run.status || "") : "";
  if (
    st === "approved" &&
    reconciliation &&
    roundMoney2(reconciliation.total_paid_amount) >= roundMoney2(reconciliation.run_payable_total)
  ) {
    const mark = await markPayRunApprovedAsPaid(pool, pid, tid, adminId, {
      payoutReference: reference || "reconciled via payment ledger",
      payoutNotes: notes || "",
    });
    if (mark && mark.run) {
      outRun = mark.run;
      await insertPayRunStatusHistory(pool, {
        tenantId: tid,
        payRunId: pid,
        fromStatus: "approved",
        toStatus: "paid",
        reason: PAY_RUN_STATUS_HISTORY_REASON.LEDGER_SETTLED,
        actorAdminUserId: adminId,
        sourcePaymentId: payment && payment.id != null ? Number(payment.id) : null,
      });
    }
  } else {
    outRun = (await getPayRunByIdForTenant(pool, pid, tid)) || run;
  }

  return { ok: true, payment, reconciliation, run: outRun };
}

/**
 * Full reversal of one positive payment line (negative ledger entry). Original row is not modified.
 * @returns {Promise<{ ok: boolean, error?: string, message?: string, payment?: object, reconciliation?: object, run?: object }>}
 */
async function reversePaymentForPayRun(pool, p) {
  const reason = String(p.reason || "").trim();
  if (!reason) {
    return { ok: false, error: "REASON_REQUIRED", message: "Reason is required." };
  }
  const paymentId = Number(p.paymentId);
  const payRunId = Number(p.payRunId);
  const tenantId = Number(p.tenantId);
  const bypassReversalWindow = !!p.bypassReversalWindow;
  const adminId =
    p.createdByAdminUserId != null && Number.isFinite(Number(p.createdByAdminUserId)) && Number(p.createdByAdminUserId) > 0
      ? Number(p.createdByAdminUserId)
      : null;

  let payment;
  /** @type {object | undefined} */
  let original;
  /** @type {object | undefined} */
  let run;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    original = await getPaymentByIdForTenantForUpdate(client, paymentId, payRunId, tenantId);
    if (!original) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NOT_FOUND", message: "Payment not found." };
    }
    const origAmt = roundMoney2(Number(original.amount));
    if (origAmt <= 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NOT_REVERSIBLE", message: "Only positive payment lines can be reversed." };
    }
    const om = parsePaymentMetadata(original);
    if (String(om.type || "") === LEDGER_ENTRY_TYPE.REVERSAL) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NOT_REVERSIBLE", message: "Cannot reverse a reversal entry." };
    }

    const already = await reversalExistsForOriginalPaymentId(client, tenantId, payRunId, paymentId);
    if (already) {
      await client.query("ROLLBACK");
      return { ok: false, error: "ALREADY_REVERSED", message: "This payment was already reversed." };
    }

    run = await getPayRunByIdForTenantForUpdate(client, payRunId, tenantId);
    if (!run) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NOT_FOUND", message: "Pay run not found." };
    }
    const revGuards = await financeGuardService.assertReverseOrCorrectGuards(
      client,
      tenantId,
      run,
      original,
      bypassReversalWindow
    );
    if (!revGuards.ok) {
      await client.query("ROLLBACK");
      return { ok: false, error: revGuards.error, message: revGuards.message };
    }

    let paymentDateRaw = String(p.paymentDate || "").trim();
    if (!paymentDateRaw) {
      paymentDateRaw = new Date().toISOString().slice(0, 10);
    }
    const date = new Date(`${paymentDateRaw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== paymentDateRaw) {
      await client.query("ROLLBACK");
      return { ok: false, error: "INVALID_DATE", message: "Invalid payment date." };
    }

    const revAmount = roundMoney2(-origAmt);
    try {
      payment = await insertPaymentLedgerRow(client, {
        tenantId,
        payRunId,
        paymentDate: paymentDateRaw,
        amount: revAmount,
        paymentMethod: "reversal",
        paymentReference: `reversal of payment #${paymentId}`,
        notes: reason.slice(0, 4000),
        createdByAdminUserId: adminId,
        metadata: {
          type: LEDGER_ENTRY_TYPE.REVERSAL,
          reason,
          reverses_payment_id: paymentId,
        },
      });
    } catch (e) {
      await client.query("ROLLBACK");
      if (e && e.code === PAY_RUN_CLOSED_ERROR) {
        return { ok: false, error: PAY_RUN_CLOSED_ERROR, message: PAY_RUN_CLOSED_MESSAGE };
      }
      const mapped = mapPaymentLedgerUniqueViolation(e);
      if (mapped) return { ok: false, error: mapped.error, message: mapped.message };
      throw e;
    }

    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    if (e && e.code === PAY_RUN_CLOSED_ERROR) {
      return { ok: false, error: PAY_RUN_CLOSED_ERROR, message: PAY_RUN_CLOSED_MESSAGE };
    }
    throw e;
  } finally {
    client.release();
  }

  if (
    bypassReversalWindow &&
    original &&
    paymentExceedsReversalWindowDays(original, financeGuardService.getConfiguredReversalWindowDays())
  ) {
    try {
      await financeOverrideEventsRepo.insertFinanceOverrideEvent(pool, {
        tenantId,
        actionType: financeOverrideEventsRepo.ACTION_TYPES.REVERSE_OVERRIDE,
        reason,
        actorAdminUserId: adminId,
        payRunId,
        paymentId: Number(original.id),
      });
    } catch (auditErr) {
      console.error("[finance_override_events] reverse_override", auditErr);
    }
  }

  const sync = await syncPayRunStatusWithLedger(pool, payRunId, tenantId, adminId, {
    sourcePaymentId: payment && payment.id != null ? Number(payment.id) : null,
  });
  const reconciliation = await getPayRunReconciliationSummary(pool, payRunId, tenantId);
  const outRun = sync.run && sync.changed ? sync.run : (await getPayRunByIdForTenant(pool, payRunId, tenantId)) || run;

  return { ok: true, payment, reconciliation, run: outRun };
}

/**
 * Atomic correction: reversal of original + new positive payment (two inserts).
 * @returns {Promise<{ ok: boolean, error?: string, message?: string, reversal?: object, payment?: object, reconciliation?: object, run?: object }>}
 */
async function correctPaymentForPayRun(pool, p) {
  const reason = String(p.reason || "").trim();
  if (!reason) {
    return { ok: false, error: "REASON_REQUIRED", message: "Reason is required." };
  }
  const newAmount = roundMoney2(Number(p.newAmount));
  if (!(newAmount > 0)) {
    return { ok: false, error: "INVALID_AMOUNT", message: "Corrected amount must be greater than 0." };
  }

  const paymentId = Number(p.paymentId);
  const payRunId = Number(p.payRunId);
  const tenantId = Number(p.tenantId);
  const bypassReversalWindow = !!p.bypassReversalWindow;
  const adminId =
    p.createdByAdminUserId != null && Number.isFinite(Number(p.createdByAdminUserId)) && Number(p.createdByAdminUserId) > 0
      ? Number(p.createdByAdminUserId)
      : null;

  const method = p.paymentMethod != null ? String(p.paymentMethod).trim().slice(0, 200) : "";
  const reference = p.paymentReference != null ? String(p.paymentReference).trim().slice(0, 2000) : "";

  let reversalRow;
  let paymentRow;
  /** @type {object | undefined} */
  let original;
  /** @type {object | undefined} */
  let run;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    original = await getPaymentByIdForTenantForUpdate(client, paymentId, payRunId, tenantId);
    if (!original) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NOT_FOUND", message: "Payment not found." };
    }
    const origAmt = roundMoney2(Number(original.amount));
    if (origAmt <= 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NOT_REVERSIBLE", message: "Only positive payment lines can be corrected." };
    }
    const om = parsePaymentMetadata(original);
    if (String(om.type || "") === LEDGER_ENTRY_TYPE.REVERSAL) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NOT_REVERSIBLE", message: "Cannot correct a reversal entry." };
    }

    const already = await reversalExistsForOriginalPaymentId(client, tenantId, payRunId, paymentId);
    if (already) {
      await client.query("ROLLBACK");
      return { ok: false, error: "ALREADY_REVERSED", message: "This payment was already reversed or corrected." };
    }

    run = await getPayRunByIdForTenantForUpdate(client, payRunId, tenantId);
    if (!run) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NOT_FOUND", message: "Pay run not found." };
    }
    const corGuards = await financeGuardService.assertReverseOrCorrectGuards(
      client,
      tenantId,
      run,
      original,
      bypassReversalWindow
    );
    if (!corGuards.ok) {
      await client.query("ROLLBACK");
      return { ok: false, error: corGuards.error, message: corGuards.message };
    }

    let paymentDateRaw = String(p.paymentDate || "").trim();
    if (!paymentDateRaw) {
      paymentDateRaw = new Date().toISOString().slice(0, 10);
    }
    const date = new Date(`${paymentDateRaw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== paymentDateRaw) {
      await client.query("ROLLBACK");
      return { ok: false, error: "INVALID_DATE", message: "Invalid payment date." };
    }

    reversalRow = await insertPaymentLedgerRow(client, {
      tenantId,
      payRunId,
      paymentDate: paymentDateRaw,
      amount: roundMoney2(-origAmt),
      paymentMethod: "reversal",
      paymentReference: `correction: reversal of payment #${paymentId}`,
      notes: reason.slice(0, 4000),
      createdByAdminUserId: adminId,
      metadata: {
        type: LEDGER_ENTRY_TYPE.REVERSAL,
        reason,
        reverses_payment_id: paymentId,
        correction: true,
      },
    });

    paymentRow = await insertPaymentLedgerRow(client, {
      tenantId,
      payRunId,
      paymentDate: paymentDateRaw,
      amount: newAmount,
      paymentMethod: method || "correction",
      paymentReference: reference || `correction for payment #${paymentId}`,
      notes: reason.slice(0, 4000),
      createdByAdminUserId: adminId,
      metadata: {
        type: LEDGER_ENTRY_TYPE.CORRECTION_PAYMENT,
        reason,
        corrects_payment_id: paymentId,
        replaced_amount: origAmt,
      },
    });

    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    if (e && e.code === PAY_RUN_CLOSED_ERROR) {
      return { ok: false, error: PAY_RUN_CLOSED_ERROR, message: PAY_RUN_CLOSED_MESSAGE };
    }
    const mapped = mapPaymentLedgerUniqueViolation(e);
    if (mapped) {
      return { ok: false, error: mapped.error, message: mapped.message };
    }
    throw e;
  } finally {
    client.release();
  }

  if (
    bypassReversalWindow &&
    original &&
    paymentExceedsReversalWindowDays(original, financeGuardService.getConfiguredReversalWindowDays())
  ) {
    try {
      await financeOverrideEventsRepo.insertFinanceOverrideEvent(pool, {
        tenantId,
        actionType: financeOverrideEventsRepo.ACTION_TYPES.CORRECTION_OVERRIDE,
        reason,
        actorAdminUserId: adminId,
        payRunId,
        paymentId: Number(original.id),
      });
    } catch (auditErr) {
      console.error("[finance_override_events] correction_override", auditErr);
    }
  }

  const sync = await syncPayRunStatusWithLedger(pool, payRunId, tenantId, adminId, {
    sourcePaymentId: paymentRow && paymentRow.id != null ? Number(paymentRow.id) : null,
  });
  const reconciliation = await getPayRunReconciliationSummary(pool, payRunId, tenantId);
  const outRun = sync.run && sync.changed ? sync.run : (await getPayRunByIdForTenant(pool, payRunId, tenantId)) || run;

  return {
    ok: true,
    reversal: reversalRow,
    payment: paymentRow,
    reconciliation,
    run: outRun,
  };
}

async function listPayRunsForTenant(pool, tenantId, limit = 50) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const r = await pool.query(
    `
    SELECT id, tenant_id, period_start, period_end, status, created_at, updated_at, notes, created_by_admin_user_id,
           locked_at, locked_by_admin_user_id, approved_at, approved_by_admin_user_id,
           paid_at, paid_by_admin_user_id, payout_reference, export_generated_at, export_format,
           closed_at, closed_by_admin_user_id
    FROM public.field_agent_pay_runs
    WHERE tenant_id = $1
    ORDER BY period_start DESC, id DESC
    LIMIT $2
    `,
    [tid, lim]
  );
  return r.rows;
}

/**
 * Soft-close marker only (informational). Idempotent: no-op if already closed.
 * @param {import("pg").Pool} pool
 * @param {number} payRunId
 * @param {number} tenantId
 * @param {number} adminUserId
 * @returns {Promise<{ ok: boolean, run?: object, alreadyClosed?: boolean, error?: string }>}
 */
async function markPayRunSoftClosed(pool, payRunId, tenantId, adminUserId) {
  const pid = Number(payRunId);
  const tid = Number(tenantId);
  const aid = Number(adminUserId);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) {
    return { ok: false, error: "INVALID_SCOPE" };
  }
  if (!Number.isFinite(aid) || aid < 1) {
    return { ok: false, error: "INVALID_ACTOR" };
  }
  const existing = await getPayRunByIdForTenant(pool, pid, tid);
  if (!existing) {
    return { ok: false, error: "NOT_FOUND" };
  }
  if (existing.closed_at) {
    return { ok: true, run: existing, alreadyClosed: true };
  }
  const softGuards = financeGuardService.assertSoftCloseStatusPreconditions(existing);
  if (!softGuards.ok) {
    return { ok: false, error: softGuards.error };
  }
  const r = await pool.query(
    `
    UPDATE public.field_agent_pay_runs
    SET closed_at = now(),
        closed_by_admin_user_id = $3,
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2 AND closed_at IS NULL
    RETURNING *
    `,
    [pid, tid, aid]
  );
  if (!r.rows.length) {
    const again = await getPayRunByIdForTenant(pool, pid, tid);
    if (again && again.closed_at) {
      return { ok: true, run: again, alreadyClosed: true };
    }
    return { ok: false, error: "NO_UPDATE" };
  }
  return { ok: true, run: r.rows[0] };
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

/**
 * Row lock for payment flows — use inside an open transaction with add/reverse/correct.
 * @param {import("pg").Pool | import("pg").PoolClient} executor
 */
async function getPayRunByIdForTenantForUpdate(executor, payRunId, tenantId) {
  const pid = Number(payRunId);
  const tid = Number(tenantId);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) {
    return null;
  }
  const r = await executor.query(
    `SELECT * FROM public.field_agent_pay_runs WHERE id = $1 AND tenant_id = $2 FOR UPDATE LIMIT 1`,
    [pid, tid]
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
  LEDGER_ENTRY_TYPE,
  PAY_RUN_CLOSED_ERROR,
  PAY_RUN_CLOSED_MESSAGE,
  REVERSAL_WINDOW_EXPIRED_ERROR,
  REVERSAL_WINDOW_EXPIRED_MESSAGE,
  ACCOUNTING_PERIOD_LOCKED_ERROR,
  ACCOUNTING_PERIOD_LOCKED_MESSAGE,
  payRunIsHardClosed,
  payRunAccountingPeriodKey,
  insertPayRunDraft,
  insertPayRunItems,
  roundMoney2,
  parsePaymentMetadata,
  createDraftPayRunWithCarryForward,
  assertPayRunIsDraft,
  countItemsForPayRun,
  lockPayRunDraft,
  approvePayRunLocked,
  markPayRunApprovedAsPaid,
  markPayRunApprovedAsPaidViaLedger,
  recordPayRunExportGenerated,
  listPayRunsForTenant,
  markPayRunSoftClosed,
  getPayRunById,
  getPayRunByIdForTenant,
  getPayRunByIdForTenantForUpdate,
  getPaymentByIdForTenant,
  listItemsForPayRun,
  getPayRunReconciliationSummary,
  payRunLedgerHasReversalOrCorrection,
  listPaymentsForPayRun,
  insertPaymentLedgerRow,
  syncPayRunStatusWithLedger,
  reversalExistsForOriginalPaymentId,
  addPaymentForPayRun,
  reversePaymentForPayRun,
  correctPaymentForPayRun,
  listVisiblePayRunItemsForFieldAgent,
  getVisiblePayRunItemDetailForFieldAgent,
  getPayRunStatementSnapshotForFieldAgent,
};
