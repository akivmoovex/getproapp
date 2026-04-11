/**
 * After deal validation: randomly offer the intake project to up to 3 eligible service providers.
 * Eligibility: intake allocation rules, tenant minimum review rating, and credit vs deal price + floor.
 */

const crypto = require("crypto");
const {
  getAllocationSettingsAsync,
  getCategoryResponseWindowHoursAsync,
  DEFAULT_RESPONSE_HOURS,
} = require("./intakeProjectPublishValidation");
const { isCompanyEligibleForIntakeAllocation } = require("./intakeProjectAllocation");
const {
  getCommerceSettingsForTenant,
  passesMinimumReviewRatingForDealValidatedOffer,
  creditBalanceOkForDealOffer,
} = require("../tenants/tenantCommerceSettings");
const reviewsRepo = require("../db/pg/reviewsRepo");
const intakeAssignmentsRepo = require("../db/pg/intakeAssignmentsRepo");
const intakeClientProjectsRepo = require("../db/pg/intakeClientProjectsRepo");

const DEAL_VALIDATED_SOURCE = "deal_validated";
const OFFER_COUNT = 3;

async function deadlineAfterHours(pool, hours) {
  const h = Math.max(1, Math.floor(Number(hours) || DEFAULT_RESPONSE_HOURS));
  const r = await pool.query(`SELECT (now() + ($1::int * interval '1 hour')) AS d`, [h]);
  const d = r.rows[0].d;
  if (d instanceof Date) return d.toISOString().replace("T", " ").slice(0, 19);
  return String(d);
}

/**
 * Fisher–Yates shuffle using cryptographically strong randomness.
 * @param {number[]} ids
 */
function shuffleCompanyIds(ids) {
  const arr = ids.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number[]} companyIds
 */
async function loadBalancesForCompanies(pool, tenantId, companyIds) {
  const ids = [...new Set(companyIds.map(Number).filter((n) => n > 0))];
  if (ids.length === 0) return new Map();
  const r = await pool.query(
    `SELECT id, portal_lead_credits_balance FROM public.companies
     WHERE tenant_id = $1 AND id = ANY($2::int[])`,
    [tenantId, ids]
  );
  const m = new Map();
  for (const row of r.rows) {
    m.set(Number(row.id), Number(row.portal_lead_credits_balance) || 0);
  }
  return m;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} projectId
 * @returns {Promise<{ created: number, skipped: boolean }>}
 */
async function runDealValidatedOfferAllocation(pool, tenantId, projectId) {
  const tid = Number(tenantId);
  const pid = Number(projectId);
  if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(pid) || pid <= 0) {
    return { created: 0, skipped: true };
  }

  const existing = await intakeAssignmentsRepo.countByProjectAndAllocationSource(pool, tid, pid, DEAL_VALIDATED_SOURCE);
  if (existing > 0) {
    return { created: 0, skipped: true };
  }

  const project = await intakeClientProjectsRepo.getByIdAndTenant(pool, pid, tid);
  if (!project) return { created: 0, skipped: true };
  if (String(project.deal_validation_status || "").trim().toLowerCase() !== "validated") {
    return { created: 0, skipped: true };
  }

  const catId = Number(project.intake_category_id);
  if (!catId || catId < 1) {
    return { created: 0, skipped: true };
  }

  const settings = await getAllocationSettingsAsync(pool, tid);
  const hours = await getCategoryResponseWindowHoursAsync(pool, tid, catId);
  const commerce = await getCommerceSettingsForTenant(pool, tid);
  const dealPriceRaw = project.deal_price != null ? Number(project.deal_price) : null;
  const dealPrice = dealPriceRaw != null && Number.isFinite(dealPriceRaw) && dealPriceRaw > 0 ? dealPriceRaw : 0;

  const rows = await reviewsRepo.listAvgCountByTenantAndCategory(pool, tid, catId);
  const eligible = [];
  for (const row of rows) {
    const rc = Math.max(0, Math.floor(Number(row.review_count) || 0));
    const avg = row.avg_rating != null && Number.isFinite(Number(row.avg_rating)) ? Number(row.avg_rating) : null;
    if (!isCompanyEligibleForIntakeAllocation(avg, rc, settings)) continue;
    if (!passesMinimumReviewRatingForDealValidatedOffer(avg, commerce.minimum_review_rating)) continue;
    eligible.push(Number(row.company_id));
  }

  if (eligible.length === 0) {
    return { created: 0, skipped: false };
  }

  const balanceMap = await loadBalancesForCompanies(pool, tid, eligible);
  const creditFiltered = [];
  for (const cid of eligible) {
    const bal = balanceMap.has(cid) ? balanceMap.get(cid) : 0;
    if (creditBalanceOkForDealOffer(bal, dealPrice, commerce.minimum_credit_balance)) creditFiltered.push(cid);
  }

  const taken = await intakeAssignmentsRepo.listCompanyIdsByProject(pool, tid, pid);
  const takenSet = new Set(taken);
  const free = creditFiltered.filter((id) => !takenSet.has(id));
  if (free.length === 0) {
    return { created: 0, skipped: false };
  }

  const shuffled = shuffleCompanyIds(free);
  const picks = shuffled.slice(0, Math.min(OFFER_COUNT, shuffled.length));
  const deadline = await deadlineAfterHours(pool, hours);

  let created = 0;
  for (const companyId of picks) {
    await intakeAssignmentsRepo.insertAllocated(pool, {
      tenantId: tid,
      projectId: pid,
      companyId,
      assignedByAdminUserId: null,
      responseDeadlineAt: deadline,
      allocationSource: DEAL_VALIDATED_SOURCE,
      allocationWave: 0,
    });
    created += 1;
  }

  return { created, skipped: false };
}

module.exports = {
  runDealValidatedOfferAllocation,
  DEAL_VALIDATED_SOURCE,
  OFFER_COUNT,
};
