"use strict";

/**
 * Read-only CFO CSV exports: pay-run summary list and single-run ledger lines.
 *
 * Summary columns: pay_run_id, period, status, frozen_payable, net_paid, remaining_balance,
 * has_adjustments, reopened_flag, paid_at, updated_at
 *
 * Ledger columns: row_id, pay_run_id, payment_date, amount, kind (payment|reversal|correction),
 * payment_method, payment_reference, reverses_payment_id, corrects_payment_id, replaced_amount,
 * reason, created_at — one row per ledger line, chronological export order matches listPaymentsForPayRun asc.
 */

const { csvEscape } = require("./fieldAgentPayRunExportCsv");
const fieldAgentPayRunRepo = require("../db/pg/fieldAgentPayRunRepo");
const financeCfoDashboardRepo = require("../db/pg/financeCfoDashboardRepo");

function isoDate(d) {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return x.toISOString().slice(0, 10);
}

function isoDateTime(d) {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return x.toISOString();
}

function periodMonthLabel(periodStart, periodEnd) {
  const a = isoDate(periodStart);
  const b = isoDate(periodEnd);
  if (!a && !b) return "";
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

function numCsv(n) {
  if (n == null || n === "") return "";
  const x = Number(n);
  return Number.isFinite(x) ? String(x) : "";
}

/**
 * @param {Array<Record<string, unknown>>} rows from listPayRunsForCfoSummaryExport
 */
function buildCfoPayRunSummaryCsv(rows) {
  const header = [
    "pay_run_id",
    "period",
    "status",
    "frozen_payable",
    "net_paid",
    "remaining_balance",
    "has_adjustments",
    "reopened_flag",
    "paid_at",
    "updated_at",
  ];
  const lines = [header.join(",")];
  for (const row of rows || []) {
    const r = [
      csvEscape(row.pay_run_id),
      csvEscape(periodMonthLabel(row.period_start, row.period_end)),
      csvEscape(row.run_status),
      numCsv(fieldAgentPayRunRepo.roundMoney2(Number(row.frozen_payable || 0))),
      numCsv(fieldAgentPayRunRepo.roundMoney2(Number(row.net_paid || 0))),
      numCsv(fieldAgentPayRunRepo.roundMoney2(Number(row.remaining_balance || 0))),
      csvEscape(row.has_adjustments ? "true" : "false"),
      csvEscape(row.reopened_flag ? "true" : "false"),
      csvEscape(isoDateTime(row.paid_at)),
      csvEscape(isoDateTime(row.updated_at)),
    ];
    lines.push(r.join(","));
  }
  return lines.join("\n") + "\n";
}

/**
 * @param {number} payRunId
 * @param {Array<Record<string, unknown>>} payments from listPaymentsForPayRun (any order)
 */
function buildCfoPayRunLedgerCsv(payRunId, payments) {
  const header = [
    "row_id",
    "pay_run_id",
    "payment_date",
    "amount",
    "kind",
    "payment_method",
    "payment_reference",
    "reverses_payment_id",
    "corrects_payment_id",
    "replaced_amount",
    "reason",
    "created_at",
  ];
  const lines = [header.join(",")];
  const pid = Number(payRunId);
  for (const p of payments || []) {
    const m = fieldAgentPayRunRepo.parsePaymentMetadata(p);
    const kindCode = financeCfoDashboardRepo.cfoLedgerRowKindCode(p);
    const rev =
      m.reverses_payment_id != null && Number.isFinite(Number(m.reverses_payment_id)) ? Number(m.reverses_payment_id) : "";
    const corr =
      m.corrects_payment_id != null && Number.isFinite(Number(m.corrects_payment_id)) ? Number(m.corrects_payment_id) : "";
    const replaced =
      m.replaced_amount != null && Number.isFinite(Number(m.replaced_amount))
        ? fieldAgentPayRunRepo.roundMoney2(Number(m.replaced_amount))
        : "";
    const reason = m.reason != null ? String(m.reason) : "";
    const amt = fieldAgentPayRunRepo.roundMoney2(Number(p.amount || 0));
    const row = [
      csvEscape(p.id),
      csvEscape(pid),
      csvEscape(isoDate(p.payment_date)),
      numCsv(amt),
      csvEscape(kindCode),
      csvEscape(p.payment_method),
      csvEscape(p.payment_reference),
      rev === "" ? "" : csvEscape(rev),
      corr === "" ? "" : csvEscape(corr),
      replaced === "" ? "" : numCsv(replaced),
      csvEscape(reason),
      csvEscape(isoDateTime(p.created_at)),
    ];
    lines.push(row.join(","));
  }
  return lines.join("\n") + "\n";
}

module.exports = { buildCfoPayRunSummaryCsv, buildCfoPayRunLedgerCsv };
