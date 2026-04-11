/**
 * Stage 2: tenant-scoped provider allocation for published intake projects.
 * Explicit intake_project_assignments rows; rules live here, not in routes.
 */

const {
  getAllocationSettingsAsync,
  getCategoryResponseWindowHoursAsync,
  DEFAULT_RESPONSE_HOURS,
} = require("./intakeProjectPublishValidation");
const reviewsRepo = require("../db/pg/reviewsRepo");
const intakeClientProjectsRepo = require("../db/pg/intakeClientProjectsRepo");
const intakeAssignmentsRepo = require("../db/pg/intakeAssignmentsRepo");
const {
  getCommerceSettingsForTenant,
  passesMinimumReviewRatingForAllocation,
} = require("../tenants/tenantCommerceSettings");

const PENDING_RESPONSE_STATUSES = ["allocated", "viewed", "pending"];

/**
 * @param {string} s
 * @returns {number}
 */
function allocationSeedFromString(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic picks without replacement. Pool must be numeric ids (sorted for stability).
 * @param {number[]} sortedPool
 * @param {number} count
 * @param {number} seed
 * @returns {number[]}
 */
function pickWithoutReplacement(sortedPool, count, seed) {
  const arr = sortedPool.slice();
  let s = seed >>> 0;
  const picks = [];
  const n = Math.min(count, arr.length);
  for (let k = 0; k < n; k += 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const idx = s % arr.length;
    picks.push(arr[idx]);
    arr.splice(idx, 1);
  }
  return picks;
}

/**
 * @param {number|null|undefined} avgRating
 * @param {number} reviewCount
 * @param {object} settings normalized allocation settings (same shape as getAllocationSettingsAsync / intakeSettingsRepo)
 */
function isCompanyEligibleForIntakeAllocation(avgRating, reviewCount, settings) {
  const rc = Math.max(0, Math.floor(Number(reviewCount) || 0));
  const estMinR = settings.established_min_rating;
  const estMinC = Math.max(0, Math.floor(settings.established_min_review_count));
  const provMinR = settings.provisional_min_rating;
  const provMaxC = Math.max(0, Math.floor(settings.provisional_max_review_count));

  const avg = avgRating != null && Number.isFinite(Number(avgRating)) ? Number(avgRating) : null;
  const established = rc >= estMinC && avg != null && avg >= estMinR;
  const provisional = rc <= provMaxC && (rc === 0 || (avg != null && avg >= provMinR));
  return established || provisional;
}

/**
 * Eligible companies for intake allocation (aggregates from `public.reviews`).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} categoryId
 * @param {object} settings normalized allocation settings (same shape as getAllocationSettingsAsync / intakeSettingsRepo)
 * @returns {Promise<number[]>}
 */
async function listEligibleCompanyIdsAsync(pool, tenantId, categoryId, settings) {
  const tid = Number(tenantId);
  const cid = Number(categoryId);
  if (!cid || cid < 1) return [];
  const commerce = await getCommerceSettingsForTenant(pool, tid);
  const rows = await reviewsRepo.listAvgCountByTenantAndCategory(pool, tid, cid);
  const out = [];
  for (const r of rows) {
    const avg = r.avg_rating != null && Number.isFinite(Number(r.avg_rating)) ? Number(r.avg_rating) : null;
    if (!isCompanyEligibleForIntakeAllocation(avg, r.review_count, settings)) continue;
    if (!passesMinimumReviewRatingForAllocation(avg, commerce.minimum_review_rating)) continue;
    out.push(Number(r.company_id));
  }
  return out.sort((a, b) => a - b);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} hours
 */
async function deadlineAfterHours(pool, hours) {
  const h = Math.max(1, Math.floor(Number(hours) || DEFAULT_RESPONSE_HOURS));
  const r = await pool.query(`SELECT (now() + ($1::int * interval '1 hour')) AS d`, [h]);
  const d = r.rows[0].d;
  if (d instanceof Date) return d.toISOString().replace("T", " ").slice(0, 19);
  return String(d);
}

async function assignedCompanyIdSetAsync(pool, tid, pid) {
  const ids = await intakeAssignmentsRepo.listCompanyIdsByProject(pool, tid, pid);
  return new Set(ids);
}

async function countPositiveResponsesAsync(pool, tid, pid) {
  return intakeAssignmentsRepo.countPositiveResponses(pool, tid, pid);
}

async function refreshPausedIfTargetMetAsync(pool, tid, pid, settings) {
  const positive = await countPositiveResponsesAsync(pool, tid, pid);
  if (positive >= settings.target_positive_responses) {
    await intakeClientProjectsRepo.updateAllocationPaused(pool, pid, tid);
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} projectId
 * @param {object} settings allocation settings row (same shape as getAllocationSettingsAsync / intakeSettingsRepo)
 * @param {number} responseHours
 * @param {number} categoryId
 * @param {number} seed
 * @returns {Promise<boolean>} true if a row was inserted
 */
async function tryAllocateOneReplacement(pool, tenantId, projectId, settings, responseHours, categoryId, seed) {
  const tid = Number(tenantId);
  const pid = Number(projectId);
  const catId = Number(categoryId);
  let proj = await intakeClientProjectsRepo.getPausedFlag(pool, pid, tid);
  if (!proj || proj.intake_auto_allocation_paused) return false;

  const pos = await countPositiveResponsesAsync(pool, tid, pid);
  if (pos >= settings.target_positive_responses) {
    await intakeClientProjectsRepo.updateAllocationPaused(pool, pid, tid);
    return false;
  }

  const eligible = await listEligibleCompanyIdsAsync(pool, tid, catId, settings);
  const taken = await assignedCompanyIdSetAsync(pool, tid, pid);
  const freeIds = eligible.filter((id) => !taken.has(id));
  if (freeIds.length === 0) {
    await intakeClientProjectsRepo.updateAllocationPaused(pool, pid, tid);
    return false;
  }

  const waveRow = await intakeClientProjectsRepo.getIntakeAllocationWaveNumber(pool, pid, tid);
  const waveNum = Math.max(1, Math.floor(Number(waveRow && waveRow.intake_allocation_wave_number) || 1));
  const cidPick = pickWithoutReplacement(freeIds, 1, seed)[0];
  const deadline = await deadlineAfterHours(pool, responseHours);

  await intakeAssignmentsRepo.insertAllocated(pool, {
    tenantId: tid,
    projectId: pid,
    companyId: cidPick,
    assignedByAdminUserId: null,
    responseDeadlineAt: deadline,
    allocationSource: "auto",
    allocationWave: waveNum,
  });
  return true;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} projectId
 * @param {Record<string, unknown>} project
 * @param {object} settings allocation settings row (same shape as getAllocationSettingsAsync / intakeSettingsRepo)
 * @param {number} responseHours
 * @param {number} categoryId
 */
async function maybeTopUpAfterWave(pool, tenantId, projectId, project, settings, responseHours, categoryId) {
  const tid = Number(tenantId);
  const pid = Number(projectId);
  const catId = Number(categoryId);
  const wdead = project.intake_allocation_wave_deadline_at;
  if (!wdead || !String(wdead).trim()) return;

  const dueR = await pool.query(`SELECT ($1::timestamptz <= now()) AS due`, [wdead]);
  const dueOk = !!(dueR.rows[0] && dueR.rows[0].due);
  if (!dueOk) return;

  let projRow = await intakeClientProjectsRepo.getPausedFlag(pool, pid, tid);
  if (!projRow || projRow.intake_auto_allocation_paused) return;

  const positive = await countPositiveResponsesAsync(pool, tid, pid);
  if (positive >= settings.target_positive_responses) {
    await intakeClientProjectsRepo.updateAllocationPaused(pool, pid, tid);
    return;
  }

  const gap = Math.max(0, settings.target_positive_responses - positive);
  const batch = Math.min(settings.initial_allocation_count, gap);
  const eligible = await listEligibleCompanyIdsAsync(pool, tid, catId, settings);
  const taken = await assignedCompanyIdSetAsync(pool, tid, pid);
  const candidates = eligible.filter((id) => !taken.has(id));
  const waveNum = Math.max(1, Math.floor(Number(project.intake_allocation_wave_number) || 1)) + 1;
  const seed = allocationSeedFromString(`${tid}:${pid}:wave:${waveNum}`);
  const picks = pickWithoutReplacement(candidates, batch, seed);
  const waveEnd = await deadlineAfterHours(pool, responseHours);

  for (const cid of picks) {
    await intakeAssignmentsRepo.insertAllocated(pool, {
      tenantId: tid,
      projectId: pid,
      companyId: cid,
      assignedByAdminUserId: null,
      responseDeadlineAt: waveEnd,
      allocationSource: "auto",
      allocationWave: waveNum,
    });
  }

  if (picks.length === 0) {
    await intakeClientProjectsRepo.updateAllocationPaused(pool, pid, tid);
    return;
  }

  await intakeClientProjectsRepo.updateWaveDeadlineAndNumber(pool, {
    waveDeadlineAt: waveEnd,
    waveNumber: waveNum,
    projectId: pid,
    tenantId: tid,
  });
}

/**
 * Run timeouts, replacements, wave top-up, and target checks for one published project.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} projectId
 */
async function processPublishedProjectAllocation(pool, tenantId, projectId) {
  const tid = Number(tenantId);
  const pid = Number(projectId);
  let project = await intakeClientProjectsRepo.getByIdAndTenant(pool, pid, tid);
  if (!project) return;
  if (String(project.status || "").trim().toLowerCase() !== "published") return;

  const catId = Number(project.intake_category_id);
  const settings = await getAllocationSettingsAsync(pool, tid);
  const hours = catId ? await getCategoryResponseWindowHoursAsync(pool, tid, catId) : DEFAULT_RESPONSE_HOURS;

  await refreshPausedIfTargetMetAsync(pool, tid, pid, settings);
  let proj = await intakeClientProjectsRepo.getByIdAndTenant(pool, pid, tid);

  const overdue = await intakeAssignmentsRepo.listOverduePendingAssignments(pool, tid, pid);

  for (const row of overdue) {
    const aid = Number(row.id);
    await intakeAssignmentsRepo.markTimedOut(pool, aid, tid);
    if (catId) {
      const seed = allocationSeedFromString(`${tid}:${pid}:timeout:${aid}`);
      await tryAllocateOneReplacement(pool, tid, pid, settings, hours, catId, seed);
    }
  }

  await refreshPausedIfTargetMetAsync(pool, tid, pid, settings);
  proj = await intakeClientProjectsRepo.getByIdAndTenant(pool, pid, tid);
  if (proj && !proj.intake_auto_allocation_paused && catId) {
    await maybeTopUpAfterWave(pool, tid, pid, proj, settings, hours, catId);
  }

  await refreshPausedIfTargetMetAsync(pool, tid, pid, settings);
}

/**
 * Initial auto-allocation when a project becomes published (after status flip).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} projectId
 * @param {number|null|undefined} publishingAdminUserId
 */
async function onProjectPublished(pool, tenantId, projectId, publishingAdminUserId) {
  const tid = Number(tenantId);
  const pid = Number(projectId);
  const uid = publishingAdminUserId != null && Number.isFinite(Number(publishingAdminUserId)) ? Number(publishingAdminUserId) : null;

  let project = await intakeClientProjectsRepo.getByIdAndTenant(pool, pid, tid);
  if (!project) return;
  if (Number(project.intake_auto_allocation_seeded)) return;

  const catId = Number(project.intake_category_id);
  const settings = await getAllocationSettingsAsync(pool, tid);

  if (!catId || catId < 1) {
    await intakeClientProjectsRepo.markSeededAndPaused(pool, pid, tid);
    return;
  }

  const hours = await getCategoryResponseWindowHoursAsync(pool, tid, catId);
  const eligible = await listEligibleCompanyIdsAsync(pool, tid, catId, settings);
  const taken = await assignedCompanyIdSetAsync(pool, tid, pid);
  const candidates = eligible.filter((id) => !taken.has(id));
  const seed = allocationSeedFromString(`${tid}:${pid}:wave:1`);
  const picks = pickWithoutReplacement(candidates, settings.initial_allocation_count, seed);

  if (picks.length === 0) {
    await intakeClientProjectsRepo.updateAllocationSeededPausedNullWave(pool, pid, tid);
    await refreshPausedIfTargetMetAsync(pool, tid, pid, settings);
    return;
  }

  const waveEnd = await deadlineAfterHours(pool, hours);

  for (const cid of picks) {
    await intakeAssignmentsRepo.insertAllocated(pool, {
      tenantId: tid,
      projectId: pid,
      companyId: cid,
      assignedByAdminUserId: uid,
      responseDeadlineAt: waveEnd,
      allocationSource: "auto",
      allocationWave: 1,
    });
  }
  await intakeClientProjectsRepo.updateAfterInitialAllocation(pool, {
    waveDeadlineAt: waveEnd,
    projectId: pid,
    tenantId: tid,
  });

  await refreshPausedIfTargetMetAsync(pool, tid, pid, settings);
}

/**
 * After a provider declines (assignment row already updated to declined).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} assignmentId
 */
async function onAssignmentDeclinedByProvider(pool, tenantId, assignmentId) {
  const tid = Number(tenantId);
  const aid = Number(assignmentId);
  const row = await intakeAssignmentsRepo.getProjectIdAndCategoryForAssignment(pool, aid, tid);
  if (!row) return;
  const pid = Number(row.project_id);
  const catId = Number(row.intake_category_id);
  if (!catId) return;

  const settings = await getAllocationSettingsAsync(pool, tid);
  await refreshPausedIfTargetMetAsync(pool, tid, pid, settings);
  let proj = await intakeClientProjectsRepo.getPausedFlag(pool, pid, tid);
  if (!proj || proj.intake_auto_allocation_paused) return;
  const hours = await getCategoryResponseWindowHoursAsync(pool, tid, catId);
  const seed = allocationSeedFromString(`${tid}:${pid}:decl:${aid}`);
  await tryAllocateOneReplacement(pool, tid, pid, settings, hours, catId, seed);
  await refreshPausedIfTargetMetAsync(pool, tid, pid, settings);
}

/**
 * Mark allocated → viewed on first open (tenant + company scoped).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} companyId
 * @param {number} assignmentId
 */
async function markAssignmentViewedIfAllocated(pool, tenantId, companyId, assignmentId) {
  await intakeAssignmentsRepo.markViewedIfAllocated(pool, tenantId, companyId, assignmentId);
}

module.exports = {
  PENDING_RESPONSE_STATUSES,
  isCompanyEligibleForIntakeAllocation,
  listEligibleCompanyIdsAsync,
  processPublishedProjectAllocation,
  onProjectPublished,
  onAssignmentDeclinedByProvider,
  markAssignmentViewedIfAllocated,
  pickWithoutReplacement,
  allocationSeedFromString,
};
