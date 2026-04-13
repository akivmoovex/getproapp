"use strict";

const { formatFieldAgentMoneyAmount } = require("./fieldAgentSpCommissionQualityPayable");
const { commerceCurrencyCodeUpper } = require("../tenants/tenantCommerceSettings");

/**
 * Format frozen pay-run line snapshot for statement UI (no recomputation).
 * @param {Record<string, unknown>} row — row from getPayRunStatementSnapshotForFieldAgent / getVisible*
 * @param {Record<string, unknown> | null} commerce — tenant_commerce_settings row
 */
function buildStatementDetailFromSnapshotRow(row, commerce) {
  const faCurrencyCode = commerceCurrencyCodeUpper(commerce);
  const faCurrencySymbol =
    commerce && commerce.currency_symbol != null && String(commerce.currency_symbol).trim()
      ? String(commerce.currency_symbol).trim().slice(0, 16)
      : "";
  const fmt = (n) => formatFieldAgentMoneyAmount(n, faCurrencySymbol, faCurrencyCode);
  const periodLabel =
    row.period_start && row.period_end
      ? `${new Date(row.period_start).toISOString().slice(0, 10)} – ${new Date(row.period_end).toISOString().slice(0, 10)}`
      : "—";
  const spPay = Number(row.sp_payable_amount);
  const ecPay = Number(row.ec_payable_amount);
  const rec = Number(row.recruitment_commission_amount);
  const baseFromParts =
    (Number.isFinite(spPay) ? spPay : 0) + (Number.isFinite(ecPay) ? ecPay : 0) + (Number.isFinite(rec) ? rec : 0);
  const baseTotal =
    row.base_payable_total != null && Number.isFinite(Number(row.base_payable_total))
      ? Number(row.base_payable_total)
      : baseFromParts;
  const appliedAdj =
    row.applied_adjustment_amount != null && Number.isFinite(Number(row.applied_adjustment_amount))
      ? Number(row.applied_adjustment_amount)
      : 0;
  const net =
    row.net_payable_amount != null && Number.isFinite(Number(row.net_payable_amount))
      ? Number(row.net_payable_amount)
      : row.total_payable != null && Number.isFinite(Number(row.total_payable))
        ? Number(row.total_payable)
        : baseTotal + appliedAdj;
  return {
    payRunId: row.pay_run_id,
    status: row.status,
    periodLabel,
    fieldAgentName: row.field_agent_label_snapshot != null ? String(row.field_agent_label_snapshot) : "",
    approvedAt: row.approved_at,
    paidAt: row.paid_at,
    qualityStatusLabelSp: row.quality_status_label_sp != null ? String(row.quality_status_label_sp) : "",
    qualityStatusLabelEc: row.quality_status_label_ec != null ? String(row.quality_status_label_ec) : "",
    earnedSpDisplay: fmt(row.earned_sp_commission),
    spBonusDisplay: fmt(row.sp_bonus_amount),
    spWithheldDisplay: fmt(row.sp_withheld_amount),
    spPayableDisplay: fmt(row.sp_payable_amount),
    earnedEcDisplay: fmt(row.earned_ec_commission),
    ecWithheldDisplay: fmt(row.ec_withheld_amount),
    ecPayableDisplay: fmt(row.ec_payable_amount),
    recruitmentDisplay: fmt(row.recruitment_commission_amount),
    basePayableTotalDisplay: fmt(baseTotal),
    appliedAdjustmentsDisplay: fmt(appliedAdj),
    netPayableDisplay: fmt(net),
    adjustmentSummaryLabel:
      row.adjustment_summary_label != null && String(row.adjustment_summary_label).trim()
        ? String(row.adjustment_summary_label).trim()
        : null,
    appliedAdjustmentCount:
      row.applied_adjustment_count != null && Number.isFinite(Number(row.applied_adjustment_count))
        ? Number(row.applied_adjustment_count)
        : 0,
    totalPayableDisplay: fmt(net),
    faCurrencyCode,
    faCurrencySymbol,
  };
}

module.exports = { buildStatementDetailFromSnapshotRow };
