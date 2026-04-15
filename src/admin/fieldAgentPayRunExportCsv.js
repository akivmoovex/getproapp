"use strict";

/**
 * Build UTF-8 CSV from frozen pay-run line items (no business recomputation).
 * total_payable column = net_payable_amount when present, else base components sum.
 */

function csvEscape(value) {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function numCsv(n) {
  if (n == null || n === "") return "";
  const x = Number(n);
  return Number.isFinite(x) ? String(x) : "";
}

function roundMoney2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/**
 * @param {Array<Record<string, unknown>>} items rows from field_agent_pay_run_items (ordered)
 * @param {string} currencyCode
 * @returns {string}
 */
function buildPayRunItemsCsv(items, currencyCode) {
  const cur = String(currencyCode || "").trim() || "—";
  const header = [
    "field_agent_id",
    "field_agent_name_snapshot",
    "period_start",
    "period_end",
    "earned_sp_commission",
    "sp_bonus_amount",
    "sp_withheld_amount",
    "sp_payable_amount",
    "earned_ec_commission",
    "ec_withheld_amount",
    "ec_payable_amount",
    "recruitment_commission_amount",
    "applied_adjustment_amount",
    "net_payable_amount",
    "total_payable",
    "currency_code",
    "status_label_sp",
    "status_label_ec",
  ];
  const lines = [header.join(",")];
  for (const it of items) {
    const spPay = Number(it.sp_payable_amount);
    const ecPay = Number(it.ec_payable_amount);
    const rec = Number(it.recruitment_commission_amount);
    const base =
      (Number.isFinite(spPay) ? spPay : 0) + (Number.isFinite(ecPay) ? ecPay : 0) + (Number.isFinite(rec) ? rec : 0);
    const applied =
      it.applied_adjustment_amount != null && Number.isFinite(Number(it.applied_adjustment_amount))
        ? Number(it.applied_adjustment_amount)
        : 0;
    const net =
      it.net_payable_amount != null && Number.isFinite(Number(it.net_payable_amount))
        ? Number(it.net_payable_amount)
        : base + applied;
    const ps = it.period_start ? new Date(it.period_start).toISOString().slice(0, 10) : "";
    const pe = it.period_end ? new Date(it.period_end).toISOString().slice(0, 10) : "";
    const row = [
      csvEscape(it.field_agent_id),
      csvEscape(it.field_agent_label_snapshot),
      csvEscape(ps),
      csvEscape(pe),
      numCsv(it.earned_sp_commission),
      numCsv(it.sp_bonus_amount),
      numCsv(it.sp_withheld_amount),
      numCsv(it.sp_payable_amount),
      numCsv(it.earned_ec_commission),
      numCsv(it.ec_withheld_amount),
      numCsv(it.ec_payable_amount),
      numCsv(it.recruitment_commission_amount),
      numCsv(applied),
      numCsv(net),
      csvEscape(String(net)),
      csvEscape(cur),
      csvEscape(it.quality_status_label_sp),
      csvEscape(it.quality_status_label_ec),
    ];
    lines.push(row.join(","));
  }
  return lines.join("\n") + "\n";
}

/**
 * Single-file accounting export: frozen pay-run item columns plus repeated run-level
 * reconciliation totals from `getPayRunReconciliationSummary` (payable sum from items,
 * paid sum from payment ledger only). No business recomputation beyond snapshot net fallback.
 *
 * @param {Record<string, unknown>} run — row from field_agent_pay_runs
 * @param {Record<string, unknown>} reconciliation — from getPayRunReconciliationSummary
 * @param {Array<Record<string, unknown>>} items — rows from listItemsForPayRun (ordered)
 * @returns {string}
 */
function buildPayRunAccountingReconciliationCsv(run, reconciliation, items) {
  const payRunId = run && run.id != null ? Number(run.id) : "";
  const tenantId = run && run.tenant_id != null ? Number(run.tenant_id) : "";
  const periodStart = run && run.period_start ? new Date(run.period_start).toISOString().slice(0, 10) : "";
  const periodEnd = run && run.period_end ? new Date(run.period_end).toISOString().slice(0, 10) : "";
  const payRunStatus = run && run.status != null ? String(run.status) : "";
  const recStatus = reconciliation && reconciliation.reconciliation_status != null ? String(reconciliation.reconciliation_status) : "";
  const paymentTotal =
    reconciliation && reconciliation.total_paid_amount != null ? roundMoney2(reconciliation.total_paid_amount) : 0;
  const outstanding =
    reconciliation && reconciliation.outstanding_amount != null ? roundMoney2(reconciliation.outstanding_amount) : 0;
  const overpaidAmount = outstanding < 0 ? roundMoney2(-outstanding) : roundMoney2(0);

  const header = [
    "pay_run_id",
    "tenant_id",
    "period_start",
    "period_end",
    "pay_run_status",
    "reconciliation_status",
    "field_agent_id",
    "field_agent_label_snapshot",
    "earned_sp_commission",
    "sp_bonus_amount",
    "sp_withheld_amount",
    "sp_payable_amount",
    "earned_ec_commission",
    "ec_withheld_amount",
    "ec_payable_amount",
    "recruitment_commission_amount",
    "applied_adjustment_amount",
    "net_payable_amount",
    "payment_total_for_run",
    "outstanding_amount_for_run",
    "overpaid_amount_for_run",
    "quality_status_label_sp",
    "quality_status_label_ec",
  ];
  const lines = [header.join(",")];
  const list = Array.isArray(items) ? items : [];
  for (const it of list) {
    const spPay = Number(it.sp_payable_amount);
    const ecPay = Number(it.ec_payable_amount);
    const rec = Number(it.recruitment_commission_amount);
    const base =
      (Number.isFinite(spPay) ? spPay : 0) + (Number.isFinite(ecPay) ? ecPay : 0) + (Number.isFinite(rec) ? rec : 0);
    const applied =
      it.applied_adjustment_amount != null && Number.isFinite(Number(it.applied_adjustment_amount))
        ? Number(it.applied_adjustment_amount)
        : 0;
    const net =
      it.net_payable_amount != null && Number.isFinite(Number(it.net_payable_amount))
        ? Number(it.net_payable_amount)
        : roundMoney2(base + applied);
    const row = [
      csvEscape(payRunId),
      csvEscape(tenantId),
      csvEscape(periodStart),
      csvEscape(periodEnd),
      csvEscape(payRunStatus),
      csvEscape(recStatus),
      csvEscape(it.field_agent_id),
      csvEscape(it.field_agent_label_snapshot),
      numCsv(it.earned_sp_commission),
      numCsv(it.sp_bonus_amount),
      numCsv(it.sp_withheld_amount),
      numCsv(it.sp_payable_amount),
      numCsv(it.earned_ec_commission),
      numCsv(it.ec_withheld_amount),
      numCsv(it.ec_payable_amount),
      numCsv(it.recruitment_commission_amount),
      numCsv(applied),
      numCsv(net),
      numCsv(paymentTotal),
      numCsv(outstanding),
      numCsv(overpaidAmount),
      csvEscape(it.quality_status_label_sp),
      csvEscape(it.quality_status_label_ec),
    ];
    lines.push(row.join(","));
  }
  return lines.join("\n") + "\n";
}

module.exports = { buildPayRunItemsCsv, buildPayRunAccountingReconciliationCsv, csvEscape };
