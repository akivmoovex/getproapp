"use strict";

const fieldAgentsRepo = require("../db/pg/fieldAgentsRepo");
const fieldAgentSubmissionsRepo = require("../db/pg/fieldAgentSubmissionsRepo");
const fieldAgentPayRunAggregatesRepo = require("../db/pg/fieldAgentPayRunAggregatesRepo");
const fieldAgentPayRunAdjustmentsRepo = require("../db/pg/fieldAgentPayRunAdjustmentsRepo");
const { getCommerceSettingsForTenant, commerceCurrencyCodeUpper } = require("../tenants/tenantCommerceSettings");
const { normalizeSpRatingThresholdsForTenant } = require("../fieldAgent/normalizeSpRatingThresholds");
const {
  computeSpCommissionQualityPayable,
} = require("../fieldAgent/fieldAgentSpCommissionQualityPayable");
const { computeEcCommissionQualityPayableHoldbackOnly } = require("../fieldAgent/fieldAgentEcCommissionQualityPayable");

/**
 * Parse YYYY-MM-DD into inclusive UTC day range [start 00:00:00.000Z, end 23:59:59.999Z].
 * @returns {{ start: Date, end: Date } | null}
 */
function parseInclusiveUtcPeriodFromDateStrings(periodStartStr, periodEndStr) {
  const a = String(periodStartStr || "").trim();
  const b = String(periodEndStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const start = new Date(`${a}T00:00:00.000Z`);
  const end = new Date(`${b}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end < start) return null;
  return { start, end };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {string} periodStartStr YYYY-MM-DD
 * @param {string} periodEndStr YYYY-MM-DD
 */
async function computePayRunPreview(pool, tenantId, periodStartStr, periodEndStr) {
  const bounds = parseInclusiveUtcPeriodFromDateStrings(periodStartStr, periodEndStr);
  if (!bounds) {
    const err = new Error("INVALID_PERIOD");
    err.code = "INVALID_PERIOD";
    throw err;
  }
  const { start, end } = bounds;
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    const err = new Error("INVALID_TENANT");
    err.code = "INVALID_TENANT";
    throw err;
  }

  const commerce = await getCommerceSettingsForTenant(pool, tid);
  const faPctRaw = commerce && commerce.field_agent_sp_commission_percent;
  const faPct =
    faPctRaw != null && Number.isFinite(Number(faPctRaw)) ? Math.min(100, Math.max(0, Number(faPctRaw))) : 0;
  const ecPctRaw = commerce && commerce.field_agent_ec_commission_percent;
  const ecPct =
    ecPctRaw != null && Number.isFinite(Number(ecPctRaw)) ? Math.min(100, Math.max(0, Number(ecPctRaw))) : 0;
  const bonusPctRaw = commerce && commerce.field_agent_sp_high_rating_bonus_percent;
  const spRatingThresholds = normalizeSpRatingThresholdsForTenant(commerce);

  const settingsUsed = {
    spPercent: faPct,
    ecPercent: ecPct,
    bonusPercent: bonusPctRaw != null && Number.isFinite(Number(bonusPctRaw)) ? Number(bonusPctRaw) : null,
    lowThreshold: spRatingThresholds.low,
    highThreshold: spRatingThresholds.high,
    currencyCode: commerceCurrencyCodeUpper(commerce) || "",
  };

  const agents = await fieldAgentsRepo.listForTenantSelect(pool, tid);
  const unappliedByFa = await fieldAgentPayRunAdjustmentsRepo.sumUnappliedAdjustmentsByFieldAgentForPreview(pool, tid);
  const rows = [];

  for (const ag of agents) {
    const fid = Number(ag.id);
    const sumLead = await fieldAgentPayRunAggregatesRepo.sumDealPriceCollectedInPeriodForAccountManagerFieldAgent(
      pool,
      tid,
      fid,
      start,
      end
    );
    const earnedSp = Math.round(sumLead * (faPct / 100) * 100) / 100;

    const sumEcBase = await fieldAgentPayRunAggregatesRepo.sumDistinctDealPriceProjectCreatedInPeriodForAccountManagerFieldAgent(
      pool,
      tid,
      fid,
      start,
      end
    );
    const earnedEc = Math.round(sumEcBase * (ecPct / 100) * 100) / 100;

    const rawRating = await fieldAgentPayRunAggregatesRepo.getAvgRatingInPeriodForAccountManagerFieldAgent(
      pool,
      tid,
      fid,
      start,
      end
    );

    const spQ = computeSpCommissionQualityPayable({
      earnedSpCommission30: earnedSp,
      avgRating30: rawRating,
      bonusPercent: bonusPctRaw,
      lowThreshold: spRatingThresholds.low,
      highThreshold: spRatingThresholds.high,
    });

    const ecQ = computeEcCommissionQualityPayableHoldbackOnly({
      earnedEcCommission30: earnedEc,
      avgRating30: rawRating,
      lowThreshold: spRatingThresholds.low,
    });

    const recruitment = await fieldAgentSubmissionsRepo.sumCommissionApprovedInPeriod(pool, fid, start, end);

    const label = [String(ag.username || "").trim(), String(ag.display_name || "").trim()].filter(Boolean).join(" — ") || `FA #${fid}`;

    const spPay = spQ.payableSpCommission30;
    const ecPay = ecQ.payableEcCommission30;
    const rec = Math.round(recruitment * 100) / 100;
    const basePayableTotal =
      Math.round(((Number.isFinite(spPay) ? spPay : 0) + (Number.isFinite(ecPay) ? ecPay : 0) + (Number.isFinite(rec) ? rec : 0)) * 100) /
      100;
    const u = unappliedByFa.get(fid) || { sum: 0, count: 0 };
    const unappliedAdjustmentsTotal = Math.round(Number(u.sum) * 100) / 100;
    const unappliedAdjustmentCount = Number(u.count) || 0;
    const projectedNetPayable = Math.round((basePayableTotal + unappliedAdjustmentsTotal) * 100) / 100;

    rows.push({
      fieldAgentId: fid,
      fieldAgentLabel: label,
      spRatingValue: rawRating,
      spRatingLowThresholdUsed: spRatingThresholds.low,
      spRatingHighThresholdUsed: spRatingThresholds.high,
      spHighRatingBonusPercentUsed: settingsUsed.bonusPercent,
      earnedSpCommission: spQ.earnedSpCommission30,
      spBonusAmount: spQ.highRatingBonusSpCommission30,
      spWithheldAmount: spQ.withheldSpCommission30,
      spPayableAmount: spQ.payableSpCommission30,
      qualityStatusLabelSp: spQ.qualityEligibilityLabel,
      earnedEcCommission: ecQ.earnedEcCommission30,
      ecWithheldAmount: ecQ.withheldEcCommission30,
      ecPayableAmount: ecQ.payableEcCommission30,
      qualityStatusLabelEc: ecQ.qualityEligibilityLabel,
      recruitmentCommissionAmount: rec,
      basePayableTotal,
      unappliedAdjustmentsTotal,
      unappliedAdjustmentCount,
      projectedNetPayable,
    });
  }

  return {
    tenantId: tid,
    periodStart: start,
    periodEnd: end,
    periodStartInput: periodStartStr,
    periodEndInput: periodEndStr,
    settingsUsed,
    rows,
  };
}

module.exports = {
  parseInclusiveUtcPeriodFromDateStrings,
  computePayRunPreview,
};
