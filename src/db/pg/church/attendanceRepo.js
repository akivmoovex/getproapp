"use strict";

function totalAttendance(row) {
  return (
    Number(row.adults_count || 0) +
    Number(row.youth_count || 0) +
    Number(row.children_count || 0)
  );
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createAttendanceRecord(pool, fields) {
  const headcount = totalAttendance(fields);
  const r = await pool.query(
    `INSERT INTO public.church_attendance_records (
       organization_id, branch_id, service_date, service_label,
       attendance_type, service_name,
       adults_count, youth_count, children_count,
       first_time_visitors_count, new_members_count, volunteers_count,
       headcount, notes, status, created_by_admin_id,
       ministry_id, created_by_leader_id
     ) VALUES (
       $1, $2, $3::date, $4,
       $5, $6,
       $7, $8, $9,
       $10, $11, $12,
       $13, $14, $15, $16,
       $17, $18
     )
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.attendance_date,
      fields.service_name,
      fields.attendance_type,
      fields.service_name,
      fields.adults_count,
      fields.youth_count,
      fields.children_count,
      fields.first_time_visitors_count,
      fields.new_members_count,
      fields.volunteers_count,
      headcount,
      fields.notes || "",
      fields.status || "draft",
      fields.created_by_admin_id ?? null,
      fields.ministry_id ?? null,
      fields.created_by_leader_id ?? null,
    ]
  );
  return r.rows[0];
}

/**
 * Uniqueness for branch-level tracker rows (ministry_id IS NULL):
 * (branch_id, service_date, attendance_type, lower(btrim(service_name)))
 */
const BRANCH_TRACKER_CONTEXT_WHERE = `
  a.branch_id = $1
  AND a.ministry_id IS NULL
  AND a.service_date = $2::date
  AND a.attendance_type = $3
  AND lower(btrim(a.service_name)) = lower(btrim($4::text))
`;

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} branchId
 * @param {{
 *   attendanceType?: string,
 *   status?: string,
 *   q?: string,
 *   month?: string,
 *   date?: string,
 *   includeMinistry?: boolean,
 *   limit?: number,
 * }} [filters]
 * @returns {Promise<object[]>}
 */
async function listAttendanceRecordsForBranch(db, branchId, filters = {}) {
  const params = [branchId];
  const where = ["a.branch_id = $1"];
  if (!filters.includeMinistry) {
    where.push("a.ministry_id IS NULL");
  }
  if (filters.attendanceType && filters.attendanceType !== "all") {
    params.push(filters.attendanceType);
    where.push(`a.attendance_type = $${params.length}`);
  }
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    where.push(`a.status = $${params.length}`);
  }
  if (filters.date) {
    params.push(filters.date);
    where.push(`a.service_date = $${params.length}::date`);
  } else if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    const [y, m] = filters.month.split("-").map(Number);
    params.push(y, m);
    where.push(`EXTRACT(YEAR FROM a.service_date)::int = $${params.length - 1}`);
    where.push(`EXTRACT(MONTH FROM a.service_date)::int = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${String(filters.q).trim()}%`);
    where.push(
      `(a.service_name ILIKE $${params.length} OR a.attendance_type ILIKE $${params.length} OR COALESCE(a.notes, '') ILIKE $${params.length})`
    );
  }
  let limitClause = "";
  if (filters.limit) {
    params.push(Math.min(Math.max(Number(filters.limit) || 50, 1), 500));
    limitClause = ` LIMIT $${params.length}`;
  }
  const r = await db.query(
    `SELECT a.*, ba.full_name AS created_by_name
     FROM public.church_attendance_records a
     LEFT JOIN public.church_branch_admins ba ON ba.id = a.created_by_admin_id
     WHERE ${where.join(" AND ")}
     ORDER BY a.service_date DESC, a.id DESC${limitClause}`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {{
 *   branchId?: number | null,
 *   attendanceType?: string,
 *   status?: string,
 *   q?: string,
 *   month?: string,
 *   date?: string,
 *   limit?: number,
 * }} [filters]
 */
async function listAttendanceRecordsForOrganization(db, organizationId, filters = {}) {
  const params = [organizationId];
  const where = ["a.organization_id = $1", "a.ministry_id IS NULL"];
  if (filters.branchId) {
    params.push(filters.branchId);
    where.push(`a.branch_id = $${params.length}`);
  }
  if (filters.attendanceType && filters.attendanceType !== "all") {
    params.push(filters.attendanceType);
    where.push(`a.attendance_type = $${params.length}`);
  }
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    where.push(`a.status = $${params.length}`);
  }
  if (filters.date) {
    params.push(filters.date);
    where.push(`a.service_date = $${params.length}::date`);
  } else if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    const [y, m] = filters.month.split("-").map(Number);
    params.push(y, m);
    where.push(`EXTRACT(YEAR FROM a.service_date)::int = $${params.length - 1}`);
    where.push(`EXTRACT(MONTH FROM a.service_date)::int = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${String(filters.q).trim()}%`);
    where.push(
      `(a.service_name ILIKE $${params.length} OR a.attendance_type ILIKE $${params.length} OR COALESCE(a.notes, '') ILIKE $${params.length})`
    );
  }
  let limitClause = "";
  if (filters.limit) {
    params.push(Math.min(Math.max(Number(filters.limit) || 100, 1), 500));
    limitClause = ` LIMIT $${params.length}`;
  }
  const r = await db.query(
    `SELECT a.*, b.name AS branch_name, ba.full_name AS created_by_name
     FROM public.church_attendance_records a
     INNER JOIN public.church_branches b ON b.id = a.branch_id AND b.organization_id = a.organization_id
     LEFT JOIN public.church_branch_admins ba ON ba.id = a.created_by_admin_id
     WHERE ${where.join(" AND ")}
     ORDER BY a.service_date DESC, a.id DESC${limitClause}`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {{ branchId?: number | null }} [opts]
 */
async function countAttendanceRecordsForOrganization(db, organizationId, opts = {}) {
  const params = [organizationId];
  let where = "organization_id = $1 AND ministry_id IS NULL";
  if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  const r = await db.query(
    `SELECT COUNT(*)::int AS count FROM public.church_attendance_records WHERE ${where}`,
    params
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} branchId
 * @param {{ attendance_date: string, attendance_type: string, service_name: string }} context
 * @param {{ forUpdate?: boolean }} [opts]
 */
async function findAttendanceRecordByContextForBranch(db, branchId, context, opts = {}) {
  const lock = opts.forUpdate ? " FOR UPDATE" : "";
  const r = await db.query(
    `SELECT a.*
     FROM public.church_attendance_records a
     WHERE ${BRANCH_TRACKER_CONTEXT_WHERE}
     LIMIT 1${lock}`,
    [branchId, context.attendance_date, context.attendance_type, context.service_name]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} recordId
 * @param {number} branchId
 * @param {object} fields
 */
async function updateAttendanceRecordForBranch(db, recordId, branchId, fields) {
  const headcount = totalAttendance(fields);
  const r = await db.query(
    `UPDATE public.church_attendance_records
     SET adults_count = $1,
         youth_count = $2,
         children_count = $3,
         first_time_visitors_count = $4,
         new_members_count = $5,
         volunteers_count = $6,
         headcount = $7,
         notes = $8,
         status = COALESCE($9, status),
         service_label = $10,
         service_name = $10,
         attendance_type = COALESCE($11, attendance_type),
         service_date = COALESCE($12::date, service_date),
         updated_at = now()
     WHERE id = $13 AND branch_id = $14 AND ministry_id IS NULL
     RETURNING *`,
    [
      fields.adults_count,
      fields.youth_count,
      fields.children_count,
      fields.first_time_visitors_count,
      fields.new_members_count,
      fields.volunteers_count,
      headcount,
      fields.notes || "",
      fields.status ?? null,
      fields.service_name,
      fields.attendance_type ?? null,
      fields.attendance_date ?? null,
      recordId,
      branchId,
    ]
  );
  return r.rows[0] ?? null;
}

/**
 * Create or update a branch-level attendance record inside a transaction.
 * Duplicate key: same branch + date + type + service name (case-insensitive), ministry_id IS NULL.
 * Submitted duplicates are rejected; draft duplicates are updated.
 *
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<{ record: object, created: boolean }>}
 */
async function saveAttendanceRecordForBranch(pool, fields) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await findAttendanceRecordByContextForBranch(
      client,
      fields.branch_id,
      {
        attendance_date: fields.attendance_date,
        attendance_type: fields.attendance_type,
        service_name: fields.service_name,
      },
      { forUpdate: true }
    );
    if (existing) {
      if (existing.status !== "draft") {
        const err = new Error(
          "An attendance record already exists for this date, type, and service name."
        );
        err.code = "ATTENDANCE_DUPLICATE";
        throw err;
      }
      const updated = await updateAttendanceRecordForBranch(client, existing.id, fields.branch_id, {
        ...fields,
        status: fields.status || existing.status,
      });
      await client.query("COMMIT");
      return { record: updated, created: false };
    }
    const created = await createAttendanceRecord(client, fields);
    await client.query("COMMIT");
    return { record: created, created: true };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (e && e.code === "23505") {
      const err = new Error(
        "An attendance record already exists for this date, type, and service name."
      );
      err.code = "ATTENDANCE_DUPLICATE";
      throw err;
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} days
 */
async function getAttendanceTotalsForBranchRecentDays(pool, branchId, days = 30) {
  const safeDays = Math.min(Math.max(Number(days) || 30, 1), 366);
  const r = await pool.query(
    `SELECT
       COALESCE(SUM(adults_count + youth_count + children_count), 0)::int AS total_attendance,
       COALESCE(SUM(first_time_visitors_count), 0)::int AS visitors_total,
       COALESCE(SUM(children_count), 0)::int AS children_total,
       COUNT(*)::int AS record_count
     FROM public.church_attendance_records
     WHERE branch_id = $1
       AND ministry_id IS NULL
       AND service_date >= (CURRENT_DATE - ($2::int * INTERVAL '1 day'))`,
    [branchId, safeDays]
  );
  return r.rows[0] ?? {};
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 */
async function findLatestAttendanceRecordForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_attendance_records
     WHERE branch_id = $1 AND ministry_id IS NULL
     ORDER BY service_date DESC, id DESC
     LIMIT 1`,
    [branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * Average total headcount for Sunday service records in a calendar month (real averages only).
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 */
async function getSundayAttendanceAverageForBranchMonth(pool, branchId, year, month) {
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS sunday_record_count,
       COALESCE(AVG(adults_count + youth_count + children_count), 0)::float AS avg_total
     FROM public.church_attendance_records
     WHERE branch_id = $1
       AND ministry_id IS NULL
       AND attendance_type = 'Sunday service'
       AND EXTRACT(YEAR FROM service_date)::int = $2
       AND EXTRACT(MONTH FROM service_date)::int = $3`,
    [branchId, year, month]
  );
  const row = r.rows[0] || {};
  return {
    sunday_record_count: row.sunday_record_count || 0,
    avg_total: Math.round(Number(row.avg_total || 0)),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} recordId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findAttendanceRecordByIdForBranch(pool, recordId, branchId) {
  const r = await pool.query(
    `SELECT a.*, ba.full_name AS created_by_name, b.name AS branch_name
     FROM public.church_attendance_records a
     INNER JOIN public.church_branches b ON b.id = a.branch_id
     LEFT JOIN public.church_branch_admins ba ON ba.id = a.created_by_admin_id
     WHERE a.id = $1 AND a.branch_id = $2 AND b.id = $2
     LIMIT 1`,
    [recordId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * Org-scoped lookup for HQ Growth (never loads by id alone).
 * @param {import("pg").Pool} pool
 * @param {number} recordId
 * @param {number} organizationId
 * @returns {Promise<object | null>}
 */
async function findAttendanceRecordByIdForOrganization(pool, recordId, organizationId) {
  const r = await pool.query(
    `SELECT a.*, b.name AS branch_name, ba.full_name AS created_by_name
     FROM public.church_attendance_records a
     INNER JOIN public.church_branches b
       ON b.id = a.branch_id AND b.organization_id = a.organization_id
     LEFT JOIN public.church_branch_admins ba ON ba.id = a.created_by_admin_id
     WHERE a.id = $1 AND a.organization_id = $2
     LIMIT 1`,
    [recordId, organizationId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} recordId
 * @param {number} branchId
 * @param {string} status
 * @returns {Promise<object | null>}
 */
async function updateAttendanceStatusForBranch(pool, recordId, branchId, status) {
  const r = await pool.query(
    `UPDATE public.church_attendance_records
     SET status = $1, updated_at = now()
     WHERE id = $2 AND branch_id = $3
     RETURNING *`,
    [status, recordId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<number>}
 */
async function countAttendancePendingForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_attendance_records
     WHERE branch_id = $1 AND status = 'draft'`,
    [branchId]
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<object>}
 */
async function getAttendanceSummaryForBranchPeriod(pool, branchId, year, month) {
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS record_count,
       COALESCE(SUM(adults_count), 0)::int AS adults_total,
       COALESCE(SUM(youth_count), 0)::int AS youth_total,
       COALESCE(SUM(children_count), 0)::int AS children_total,
       COALESCE(SUM(first_time_visitors_count), 0)::int AS visitors_total,
       COALESCE(SUM(new_members_count), 0)::int AS new_members_total,
       COALESCE(SUM(volunteers_count), 0)::int AS volunteers_total
     FROM public.church_attendance_records
     WHERE branch_id = $1
       AND EXTRACT(YEAR FROM service_date)::int = $2
       AND EXTRACT(MONTH FROM service_date)::int = $3`,
    [branchId, year, month]
  );
  return r.rows[0] ?? {};
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<object[]>}
 */
async function listSubmittedAttendanceForBranchPeriod(pool, branchId, year, month) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_attendance_records
     WHERE branch_id = $1
       AND EXTRACT(YEAR FROM service_date)::int = $2
       AND EXTRACT(MONTH FROM service_date)::int = $3
       AND status = 'submitted'
     ORDER BY service_date ASC, id ASC`,
    [branchId, year, month]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<number>}
 */
async function countDraftAttendanceForBranchPeriod(pool, branchId, year, month) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_attendance_records
     WHERE branch_id = $1
       AND EXTRACT(YEAR FROM service_date)::int = $2
       AND EXTRACT(MONTH FROM service_date)::int = $3
       AND status = 'draft'`,
    [branchId, year, month]
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<number>}
 */
async function syncSubmittedAttendanceToMonthlyReport(pool, branchId, year, month) {
  const r = await pool.query(
    `UPDATE public.church_attendance_records
     SET status = 'synced_to_monthly_report', updated_at = now()
     WHERE branch_id = $1
       AND EXTRACT(YEAR FROM service_date)::int = $2
       AND EXTRACT(MONTH FROM service_date)::int = $3
       AND status = 'submitted'`,
    [branchId, year, month]
  );
  return r.rowCount ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} ministryId
 * @param {number} leaderId
 * @returns {Promise<object[]>}
 */
async function listAttendanceRecordsForLeaderMinistry(pool, branchId, ministryId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_attendance_records
     WHERE branch_id = $1 AND ministry_id = $2
     ORDER BY service_date DESC, id DESC`,
    [branchId, ministryId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} ministryId
 * @param {number} leaderId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<number>}
 */
async function countAttendanceRecordsForLeaderMinistryMonth(
  pool,
  branchId,
  ministryId,
  leaderId,
  year,
  month
) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_attendance_records
     WHERE branch_id = $1
       AND ministry_id = $2
       AND created_by_leader_id = $3
       AND EXTRACT(YEAR FROM service_date)::int = $4
       AND EXTRACT(MONTH FROM service_date)::int = $5`,
    [branchId, ministryId, leaderId, year, month]
  );
  return r.rows[0]?.count ?? 0;
}

const MINISTRY_ATTENDANCE_SELECT = `
  SELECT a.*,
         min.name AS ministry_name,
         ba.full_name AS created_by_admin_name,
         ml.full_name AS created_by_leader_name,
         CASE
           WHEN a.created_by_leader_id IS NOT NULL THEN ml.full_name
           WHEN a.created_by_admin_id IS NOT NULL THEN ba.full_name
           ELSE '—'
         END AS created_by_display
  FROM public.church_attendance_records a
  LEFT JOIN public.church_ministries min ON min.id = a.ministry_id
  LEFT JOIN public.church_branch_admins ba ON ba.id = a.created_by_admin_id
  LEFT JOIN public.church_ministry_leaders ml ON ml.id = a.created_by_leader_id
`;

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ ministryId?: number, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listMinistryAttendanceForBranch(pool, branchId, opts = {}) {
  const params = [branchId];
  let where = "WHERE a.branch_id = $1 AND a.ministry_id IS NOT NULL";
  if (opts.ministryId) {
    params.push(opts.ministryId);
    where += ` AND a.ministry_id = $${params.length}`;
  }
  let limitClause = "";
  if (opts.limit) {
    params.push(Math.min(Math.max(Number(opts.limit) || 20, 1), 100));
    limitClause = ` LIMIT $${params.length}`;
  }
  const r = await pool.query(
    `${MINISTRY_ATTENDANCE_SELECT}
     ${where}
     ORDER BY a.service_date DESC, a.id DESC${limitClause}`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} ministryId
 * @param {{ limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listMinistryAttendanceForMinistry(pool, branchId, ministryId, opts = {}) {
  return listMinistryAttendanceForBranch(pool, branchId, { ministryId, limit: opts.limit });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<number>}
 */
async function countMinistryAttendanceForBranchMonth(pool, branchId, year, month) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_attendance_records
     WHERE branch_id = $1
       AND ministry_id IS NOT NULL
       AND EXTRACT(YEAR FROM service_date)::int = $2
       AND EXTRACT(MONTH FROM service_date)::int = $3`,
    [branchId, year, month]
  );
  return r.rows[0]?.count ?? 0;
}

module.exports = {
  totalAttendance,
  createAttendanceRecord,
  listAttendanceRecordsForBranch,
  listAttendanceRecordsForOrganization,
  countAttendanceRecordsForOrganization,
  findAttendanceRecordByIdForBranch,
  findAttendanceRecordByIdForOrganization,
  findAttendanceRecordByContextForBranch,
  updateAttendanceRecordForBranch,
  saveAttendanceRecordForBranch,
  updateAttendanceStatusForBranch,
  countAttendancePendingForBranch,
  getAttendanceSummaryForBranchPeriod,
  getAttendanceTotalsForBranchRecentDays,
  findLatestAttendanceRecordForBranch,
  getSundayAttendanceAverageForBranchMonth,
  listSubmittedAttendanceForBranchPeriod,
  countDraftAttendanceForBranchPeriod,
  syncSubmittedAttendanceToMonthlyReport,
  listAttendanceRecordsForLeaderMinistry,
  countAttendanceRecordsForLeaderMinistryMonth,
  listMinistryAttendanceForBranch,
  listMinistryAttendanceForMinistry,
  countMinistryAttendanceForBranchMonth,
};
