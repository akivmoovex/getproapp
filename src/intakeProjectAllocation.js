/**
 * Stage 2: tenant-scoped provider allocation for published intake projects.
 * Explicit intake_project_assignments rows; rules live here, not in routes.
 */

const {
  getAllocationSettings,
  getCategoryResponseWindowHours,
  DEFAULT_RESPONSE_HOURS,
} = require("./intakeProjectPublishValidation");

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
 * @param {ReturnType<typeof getAllocationSettings>} settings
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
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {number} categoryId
 * @param {ReturnType<typeof getAllocationSettings>} settings
 * @returns {number[]}
 */
function listEligibleCompanyIds(db, tenantId, categoryId, settings) {
  const tid = Number(tenantId);
  const cid = Number(categoryId);
  if (!cid || cid < 1) return [];
  const rows = db
    .prepare(
      `SELECT c.id AS company_id,
        (SELECT AVG(rating) FROM reviews r WHERE r.company_id = c.id) AS avg_rating,
        (SELECT COUNT(*) FROM reviews r WHERE r.company_id = c.id) AS review_count
       FROM companies c
       WHERE c.tenant_id = ? AND c.category_id = ?`
    )
    .all(tid, cid);
  const out = [];
  for (const r of rows) {
    if (isCompanyEligibleForIntakeAllocation(r.avg_rating, r.review_count, settings)) {
      out.push(Number(r.company_id));
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {number} projectId
 * @returns {Set<number>}
 */
function assignedCompanyIdSet(db, tenantId, projectId) {
  const rows = db
    .prepare(`SELECT company_id FROM intake_project_assignments WHERE tenant_id = ? AND project_id = ?`)
    .all(Number(tenantId), Number(projectId));
  return new Set(rows.map((r) => Number(r.company_id)));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {number} projectId
 */
function countPositiveResponses(db, tenantId, projectId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM intake_project_assignments
       WHERE tenant_id = ? AND project_id = ? AND lower(trim(status)) IN ('interested','callback_requested')`
    )
    .get(Number(tenantId), Number(projectId));
  return Math.max(0, Math.floor(Number(row && row.c) || 0));
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {number} projectId
 * @param {ReturnType<typeof getAllocationSettings>} settings
 */
function refreshPausedIfTargetMet(db, tenantId, projectId, settings) {
  const tid = Number(tenantId);
  const pid = Number(projectId);
  if (countPositiveResponses(db, tid, pid) >= settings.target_positive_responses) {
    db.prepare(`UPDATE intake_client_projects SET intake_auto_allocation_paused = 1 WHERE id = ? AND tenant_id = ?`).run(pid, tid);
  }
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {number} projectId
 * @param {ReturnType<typeof getAllocationSettings>} settings
 * @param {number} responseHours
 * @param {number} categoryId
 * @param {number} seed
 * @returns {boolean} true if a row was inserted
 */
function tryAllocateOneReplacement(db, tenantId, projectId, settings, responseHours, categoryId, seed) {
  const tid = Number(tenantId);
  const pid = Number(projectId);
  const catId = Number(categoryId);
  const proj = db
    .prepare(
      `SELECT intake_auto_allocation_paused FROM intake_client_projects WHERE id = ? AND tenant_id = ?`
    )
    .get(pid, tid);
  if (!proj || proj.intake_auto_allocation_paused) return false;

  if (countPositiveResponses(db, tid, pid) >= settings.target_positive_responses) {
    db.prepare(`UPDATE intake_client_projects SET intake_auto_allocation_paused = 1 WHERE id = ? AND tenant_id = ?`).run(pid, tid);
    return false;
  }

  const eligible = listEligibleCompanyIds(db, tid, catId, settings);
  const taken = assignedCompanyIdSet(db, tid, pid);
  const pool = eligible.filter((id) => !taken.has(id));
  if (pool.length === 0) {
    db.prepare(`UPDATE intake_client_projects SET intake_auto_allocation_paused = 1 WHERE id = ? AND tenant_id = ?`).run(pid, tid);
    return false;
  }

  const waveRow = db.prepare(`SELECT intake_allocation_wave_number FROM intake_client_projects WHERE id = ? AND tenant_id = ?`).get(pid, tid);
  const waveNum = Math.max(1, Math.floor(Number(waveRow && waveRow.intake_allocation_wave_number) || 1));
  const cidPick = pickWithoutReplacement(pool, 1, seed)[0];
  const hours = Math.max(1, Math.floor(Number(responseHours) || DEFAULT_RESPONSE_HOURS));
  const deadlineRow = db.prepare(`SELECT datetime('now', '+' || ? || ' hours') AS d`).get(String(hours));
  const deadline = deadlineRow && deadlineRow.d ? String(deadlineRow.d) : null;

  db.prepare(
    `INSERT INTO intake_project_assignments (
      tenant_id, project_id, company_id, assigned_by_admin_user_id, status,
      response_deadline_at, allocation_source, allocation_wave, updated_at
    ) VALUES (?, ?, ?, NULL, 'allocated', ?, 'auto', ?, datetime('now'))`
  ).run(tid, pid, cidPick, deadline, waveNum);
  return true;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {number} projectId
 * @param {Record<string, unknown>} project
 * @param {ReturnType<typeof getAllocationSettings>} settings
 * @param {number} responseHours
 * @param {number} categoryId
 */
function maybeTopUpAfterWave(db, tenantId, projectId, project, settings, responseHours, categoryId) {
  const tid = Number(tenantId);
  const pid = Number(projectId);
  const catId = Number(categoryId);
  const wdead = project.intake_allocation_wave_deadline_at;
  if (!wdead || !String(wdead).trim()) return;

  const due = db
    .prepare(`SELECT CASE WHEN datetime(?) <= datetime('now') THEN 1 ELSE 0 END AS due`)
    .get(String(wdead));
  if (!due || !due.due) return;

  const projRow = db.prepare(`SELECT intake_auto_allocation_paused FROM intake_client_projects WHERE id = ? AND tenant_id = ?`).get(pid, tid);
  if (!projRow || projRow.intake_auto_allocation_paused) return;

  const positive = countPositiveResponses(db, tid, pid);
  if (positive >= settings.target_positive_responses) {
    db.prepare(`UPDATE intake_client_projects SET intake_auto_allocation_paused = 1 WHERE id = ? AND tenant_id = ?`).run(pid, tid);
    return;
  }

  const gap = Math.max(0, settings.target_positive_responses - positive);
  const batch = Math.min(settings.initial_allocation_count, gap);
  const eligible = listEligibleCompanyIds(db, tid, catId, settings);
  const taken = assignedCompanyIdSet(db, tid, pid);
  const pool = eligible.filter((id) => !taken.has(id));
  const waveNum = Math.max(1, Math.floor(Number(project.intake_allocation_wave_number) || 1)) + 1;
  const seed = allocationSeedFromString(`${tid}:${pid}:wave:${waveNum}`);
  const picks = pickWithoutReplacement(pool, batch, seed);

  const hours = Math.max(1, Math.floor(Number(responseHours) || DEFAULT_RESPONSE_HOURS));
  const waveEndRow = db.prepare(`SELECT datetime('now', '+' || ? || ' hours') AS d`).get(String(hours));
  const waveEnd = waveEndRow && waveEndRow.d ? String(waveEndRow.d) : null;

  const ins = db.prepare(
    `INSERT INTO intake_project_assignments (
      tenant_id, project_id, company_id, assigned_by_admin_user_id, status,
      response_deadline_at, allocation_source, allocation_wave, updated_at
    ) VALUES (?, ?, ?, NULL, 'allocated', ?, 'auto', ?, datetime('now'))`
  );

  for (const cid of picks) {
    ins.run(tid, pid, cid, waveEnd, waveNum);
  }

  if (picks.length === 0) {
    db.prepare(`UPDATE intake_client_projects SET intake_auto_allocation_paused = 1 WHERE id = ? AND tenant_id = ?`).run(pid, tid);
    return;
  }

  db.prepare(
    `UPDATE intake_client_projects SET intake_allocation_wave_deadline_at = ?, intake_allocation_wave_number = ? WHERE id = ? AND tenant_id = ?`
  ).run(waveEnd, waveNum, pid, tid);
}

/**
 * Run timeouts, replacements, wave top-up, and target checks for one published project.
 * Safe to call frequently (admin detail, company lead detail).
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {number} projectId
 */
function processPublishedProjectAllocation(db, tenantId, projectId) {
  const tid = Number(tenantId);
  const pid = Number(projectId);
  const project = db.prepare(`SELECT * FROM intake_client_projects WHERE id = ? AND tenant_id = ?`).get(pid, tid);
  if (!project) return;
  if (String(project.status || "").trim().toLowerCase() !== "published") return;

  const catId = Number(project.intake_category_id);
  const settings = getAllocationSettings(db, tid);
  const hours = catId ? getCategoryResponseWindowHours(db, tid, catId) : DEFAULT_RESPONSE_HOURS;

  const run = db.transaction(() => {
    refreshPausedIfTargetMet(db, tid, pid, settings);
    let proj = db.prepare(`SELECT * FROM intake_client_projects WHERE id = ? AND tenant_id = ?`).get(pid, tid);

    const stPlace = PENDING_RESPONSE_STATUSES.map(() => "?").join(", ");
    const overdue = db
      .prepare(
        `SELECT id FROM intake_project_assignments
         WHERE tenant_id = ? AND project_id = ? AND lower(trim(status)) IN (${stPlace})
           AND response_deadline_at IS NOT NULL AND length(trim(response_deadline_at)) > 0
           AND datetime(response_deadline_at) <= datetime('now')`
      )
      .all(tid, pid, ...PENDING_RESPONSE_STATUSES);

    for (const row of overdue) {
      const aid = Number(row.id);
      db.prepare(`UPDATE intake_project_assignments SET status = 'timed_out', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`).run(aid, tid);
      if (catId) {
        const seed = allocationSeedFromString(`${tid}:${pid}:timeout:${aid}`);
        tryAllocateOneReplacement(db, tid, pid, settings, hours, catId, seed);
      }
    }

    refreshPausedIfTargetMet(db, tid, pid, settings);
    proj = db.prepare(`SELECT * FROM intake_client_projects WHERE id = ? AND tenant_id = ?`).get(pid, tid);
    if (proj && !proj.intake_auto_allocation_paused && catId) {
      maybeTopUpAfterWave(db, tid, pid, proj, settings, hours, catId);
    }

    refreshPausedIfTargetMet(db, tid, pid, settings);
  });

  run();
}

/**
 * Initial auto-allocation when a project becomes published (call inside same DB transaction as status flip).
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {number} projectId
 * @param {number|null|undefined} publishingAdminUserId
 */
function onProjectPublished(db, tenantId, projectId, publishingAdminUserId) {
  const tid = Number(tenantId);
  const pid = Number(projectId);
  const uid = publishingAdminUserId != null && Number.isFinite(Number(publishingAdminUserId)) ? Number(publishingAdminUserId) : null;

  const project = db.prepare(`SELECT * FROM intake_client_projects WHERE id = ? AND tenant_id = ?`).get(pid, tid);
  if (!project) return;
  if (Number(project.intake_auto_allocation_seeded)) return;

  const catId = Number(project.intake_category_id);
  const settings = getAllocationSettings(db, tid);

  if (!catId || catId < 1) {
    db.prepare(
      `UPDATE intake_client_projects SET intake_auto_allocation_seeded = 1, intake_auto_allocation_paused = 1 WHERE id = ? AND tenant_id = ?`
    ).run(pid, tid);
    return;
  }

  const hours = getCategoryResponseWindowHours(db, tid, catId);
  const eligible = listEligibleCompanyIds(db, tid, catId, settings);
  const taken = assignedCompanyIdSet(db, tid, pid);
  const pool = eligible.filter((id) => !taken.has(id));
  const seed = allocationSeedFromString(`${tid}:${pid}:wave:1`);
  const picks = pickWithoutReplacement(pool, settings.initial_allocation_count, seed);

  if (picks.length === 0) {
    db.prepare(
      `UPDATE intake_client_projects SET
        intake_allocation_wave_deadline_at = NULL,
        intake_allocation_wave_number = 0,
        intake_auto_allocation_seeded = 1,
        intake_auto_allocation_paused = 1
       WHERE id = ? AND tenant_id = ?`
    ).run(pid, tid);
    refreshPausedIfTargetMet(db, tid, pid, settings);
    return;
  }

  const waveEndRow = db.prepare(`SELECT datetime('now', '+' || ? || ' hours') AS d`).get(String(Math.max(1, Math.floor(Number(hours) || DEFAULT_RESPONSE_HOURS))));
  const waveEnd = waveEndRow && waveEndRow.d ? String(waveEndRow.d) : null;

  const ins = db.prepare(
    `INSERT INTO intake_project_assignments (
      tenant_id, project_id, company_id, assigned_by_admin_user_id, status,
      response_deadline_at, allocation_source, allocation_wave, updated_at
    ) VALUES (?, ?, ?, ?, 'allocated', ?, 'auto', 1, datetime('now'))`
  );

  for (const cid of picks) {
    ins.run(tid, pid, cid, uid, waveEnd);
  }

  db.prepare(
    `UPDATE intake_client_projects SET
      intake_allocation_wave_deadline_at = ?,
      intake_allocation_wave_number = 1,
      intake_auto_allocation_seeded = 1,
      intake_auto_allocation_paused = 0
     WHERE id = ? AND tenant_id = ?`
  ).run(waveEnd, pid, tid);

  refreshPausedIfTargetMet(db, tid, pid, settings);
}

/**
 * After a provider declines (assignment row already updated to declined).
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {number} assignmentId
 */
function onAssignmentDeclinedByProvider(db, tenantId, assignmentId) {
  const tid = Number(tenantId);
  const aid = Number(assignmentId);
  const row = db
    .prepare(
      `SELECT a.project_id, p.intake_category_id
       FROM intake_project_assignments a
       INNER JOIN intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
       WHERE a.id = ? AND a.tenant_id = ?`
    )
    .get(aid, tid);
  if (!row) return;
  const pid = Number(row.project_id);
  const catId = Number(row.intake_category_id);
  if (!catId) return;

  const run = db.transaction(() => {
    const settings = getAllocationSettings(db, tid);
    refreshPausedIfTargetMet(db, tid, pid, settings);
    const proj = db.prepare(`SELECT intake_auto_allocation_paused FROM intake_client_projects WHERE id = ? AND tenant_id = ?`).get(pid, tid);
    if (!proj || proj.intake_auto_allocation_paused) return;
    const hours = getCategoryResponseWindowHours(db, tid, catId);
    const seed = allocationSeedFromString(`${tid}:${pid}:decl:${aid}`);
    tryAllocateOneReplacement(db, tid, pid, settings, hours, catId, seed);
    refreshPausedIfTargetMet(db, tid, pid, settings);
  });
  run();
}

/**
 * Mark allocated → viewed on first open (tenant + company scoped).
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {number} companyId
 * @param {number} assignmentId
 */
function markAssignmentViewedIfAllocated(db, tenantId, companyId, assignmentId) {
  db.prepare(
    `UPDATE intake_project_assignments SET status = 'viewed', updated_at = datetime('now')
     WHERE id = ? AND tenant_id = ? AND company_id = ? AND lower(trim(status)) = 'allocated'`
  ).run(Number(assignmentId), Number(tenantId), Number(companyId));
}

module.exports = {
  PENDING_RESPONSE_STATUSES,
  isCompanyEligibleForIntakeAllocation,
  listEligibleCompanyIds,
  assignedCompanyIdSet,
  countPositiveResponses,
  processPublishedProjectAllocation,
  onProjectPublished,
  onAssignmentDeclinedByProvider,
  markAssignmentViewedIfAllocated,
  pickWithoutReplacement,
  allocationSeedFromString,
};
