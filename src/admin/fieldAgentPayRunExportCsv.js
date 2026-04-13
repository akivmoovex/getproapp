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

module.exports = { buildPayRunItemsCsv, csvEscape };
