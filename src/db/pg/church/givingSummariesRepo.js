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
 * @param {{
 *   status?: string,
 *   range?: string,
 *   month?: string,
 *   q?: string,
 *   now?: Date,
 * }} [filters]
 * @returns {Promise<object[]>}
 */
async function listGivingSummariesForBranch(pool, branchId, filters = {}) {
  const params = [branchId];
  const where = ["g.branch_id = $1"];
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    where.push(`g.status = $${params.length}`);
  }
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    const [y, m] = filters.month.split("-").map(Number);
    params.push(y, m);
    where.push(`g.period_year = $${params.length - 1}`);
    where.push(`g.period_month = $${params.length}`);
  } else if (filters.range === "ytd" || filters.range === "current_month") {
    const now = filters.now instanceof Date ? filters.now : new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    params.push(year);
    where.push(`g.period_year = $${params.length}`);
    if (filters.range === "current_month") {
      params.push(month);
      where.push(`g.period_month = $${params.length}`);
    }
  }
  if (filters.q) {
    params.push(`%${String(filters.q).trim()}%`);
    where.push(`(COALESCE(g.notes, '') ILIKE $${params.length})`);
  }
  const r = await pool.query(
    `SELECT g.*, ba.full_name AS created_by_name
     FROM public.church_giving_summaries g
     LEFT JOIN public.church_branch_admins ba ON ba.id = g.created_by_admin_id
     WHERE ${where.join(" AND ")}
     ORDER BY g.period_year DESC, g.period_month DESC`,
    params
  );
  return r.rows.map(rowWithTotal);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{
 *   branchId?: number | null,
 *   status?: string,
 *   range?: string,
 *   month?: string,
 *   q?: string,
 *   now?: Date,
 * }} [filters]
 */
async function listGivingSummariesForOrganization(pool, organizationId, filters = {}) {
  const params = [organizationId];
  const where = ["g.organization_id = $1"];
  if (filters.branchId) {
    params.push(filters.branchId);
    where.push(`g.branch_id = $${params.length}`);
  }
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    where.push(`g.status = $${params.length}`);
  }
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    const [y, m] = filters.month.split("-").map(Number);
    params.push(y, m);
    where.push(`g.period_year = $${params.length - 1}`);
    where.push(`g.period_month = $${params.length}`);
  } else if (filters.range === "ytd" || filters.range === "current_month") {
    const now = filters.now instanceof Date ? filters.now : new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    params.push(year);
    where.push(`g.period_year = $${params.length}`);
    if (filters.range === "current_month") {
      params.push(month);
      where.push(`g.period_month = $${params.length}`);
    }
  }
  if (filters.q) {
    params.push(`%${String(filters.q).trim()}%`);
    where.push(`(COALESCE(g.notes, '') ILIKE $${params.length})`);
  }
  const r = await pool.query(
    `SELECT g.*, b.name AS branch_name, ba.full_name AS created_by_name
     FROM public.church_giving_summaries g
     INNER JOIN public.church_branches b ON b.id = g.branch_id AND b.organization_id = g.organization_id
     LEFT JOIN public.church_branch_admins ba ON ba.id = g.created_by_admin_id
     WHERE ${where.join(" AND ")}
     ORDER BY g.period_year DESC, g.period_month DESC`,
    params
  );
  return r.rows.map(rowWithTotal);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ branchId?: number | null }} [opts]
 */
async function countGivingSummariesForOrganization(pool, organizationId, opts = {}) {
  const params = [organizationId];
  let where = "organization_id = $1";
  if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count FROM public.church_giving_summaries WHERE ${where}`,
    params
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * Org-scoped lookup (never by id alone).
 * @param {import("pg").Pool} pool
 * @param {number} summaryId
 * @param {number} organizationId
 */
async function findGivingSummaryByIdForOrganization(pool, summaryId, organizationId) {
  const r = await pool.query(
    `SELECT g.*, b.name AS branch_name, ba.full_name AS created_by_name
     FROM public.church_giving_summaries g
     INNER JOIN public.church_branches b
       ON b.id = g.branch_id AND b.organization_id = g.organization_id
     LEFT JOIN public.church_branch_admins ba ON ba.id = g.created_by_admin_id
     WHERE g.id = $1 AND g.organization_id = $2
     LIMIT 1`,
    [summaryId, organizationId]
  );
  return rowWithTotal(r.rows[0] ?? null);
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
  listGivingSummariesForOrganization,
  countGivingSummariesForOrganization,
  findGivingSummaryByIdForBranch,
  findGivingSummaryByIdForOrganization,
  getGivingSummaryForBranchPeriod,
  updateGivingSummaryStatusForBranch,
  markGivingSummaryIncludedInMonthlyReport,
};
