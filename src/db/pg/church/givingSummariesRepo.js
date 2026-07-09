"use strict";

const { givingGrandTotal } = require("../../../church/givingValidation");

function rowWithTotal(row) {
  if (!row) return row;
  return { ...row, grand_total: givingGrandTotal(row) };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function upsertGivingSummaryForBranchPeriod(pool, fields) {
  const totalCents = Math.round(givingGrandTotal(fields) * 100);
  const r = await pool.query(
    `INSERT INTO public.church_giving_summaries (
       organization_id, branch_id, period_year, period_month,
       tithes_total, offerings_total, building_fund_total,
       missions_fund_total, special_offerings_total, other_giving_total,
       total_amount_cents, currency_code, notes, status, created_by_admin_id
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15
     )
     ON CONFLICT (branch_id, period_year, period_month)
     DO UPDATE SET
       tithes_total = EXCLUDED.tithes_total,
       offerings_total = EXCLUDED.offerings_total,
       building_fund_total = EXCLUDED.building_fund_total,
       missions_fund_total = EXCLUDED.missions_fund_total,
       special_offerings_total = EXCLUDED.special_offerings_total,
       other_giving_total = EXCLUDED.other_giving_total,
       total_amount_cents = EXCLUDED.total_amount_cents,
       notes = EXCLUDED.notes,
       status = EXCLUDED.status,
       updated_at = now()
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.period_year,
      fields.period_month,
      fields.tithes_total,
      fields.offerings_total,
      fields.building_fund_total,
      fields.missions_fund_total,
      fields.special_offerings_total,
      fields.other_giving_total,
      totalCents,
      fields.currency_code || "ZMW",
      fields.notes || "",
      fields.status || "draft",
      fields.created_by_admin_id ?? null,
    ]
  );
  return rowWithTotal(r.rows[0]);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<object[]>}
 */
async function listGivingSummariesForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT g.*, ba.full_name AS created_by_name
     FROM public.church_giving_summaries g
     LEFT JOIN public.church_branch_admins ba ON ba.id = g.created_by_admin_id
     WHERE g.branch_id = $1
     ORDER BY g.period_year DESC, g.period_month DESC`,
    [branchId]
  );
  return r.rows.map(rowWithTotal);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} summaryId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findGivingSummaryByIdForBranch(pool, summaryId, branchId) {
  const r = await pool.query(
    `SELECT g.*, ba.full_name AS created_by_name
     FROM public.church_giving_summaries g
     LEFT JOIN public.church_branch_admins ba ON ba.id = g.created_by_admin_id
     WHERE g.id = $1 AND g.branch_id = $2
     LIMIT 1`,
    [summaryId, branchId]
  );
  return rowWithTotal(r.rows[0] ?? null);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<object | null>}
 */
async function getGivingSummaryForBranchPeriod(pool, branchId, year, month) {
  const r = await pool.query(
    `SELECT g.*, ba.full_name AS created_by_name
     FROM public.church_giving_summaries g
     LEFT JOIN public.church_branch_admins ba ON ba.id = g.created_by_admin_id
     WHERE g.branch_id = $1 AND g.period_year = $2 AND g.period_month = $3
     LIMIT 1`,
    [branchId, year, month]
  );
  return rowWithTotal(r.rows[0] ?? null);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} summaryId
 * @param {number} branchId
 * @param {string} status
 * @returns {Promise<object | null>}
 */
async function updateGivingSummaryStatusForBranch(pool, summaryId, branchId, status) {
  const r = await pool.query(
    `UPDATE public.church_giving_summaries
     SET status = $1, updated_at = now()
     WHERE id = $2 AND branch_id = $3
     RETURNING *`,
    [status, summaryId, branchId]
  );
  return rowWithTotal(r.rows[0] ?? null);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} summaryId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function markGivingSummaryIncludedInMonthlyReport(pool, summaryId, branchId) {
  return updateGivingSummaryStatusForBranch(pool, summaryId, branchId, "included_in_monthly_report");
}

module.exports = {
  upsertGivingSummaryForBranchPeriod,
  listGivingSummariesForBranch,
  findGivingSummaryByIdForBranch,
  getGivingSummaryForBranchPeriod,
  updateGivingSummaryStatusForBranch,
  markGivingSummaryIncludedInMonthlyReport,
};
