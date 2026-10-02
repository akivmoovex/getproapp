"use strict";

/**
 * DB persistence for blessboard.attendance_sessions (V2.04).
 */

async function insertAttendanceSession(client, row) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.attendance_sessions (
       organization_id, church_id, branch_id,
       service_event_ref, attendance_event_id,
       session_date, start_time, late_threshold_minutes,
       status, title, notes, wrong_branch_policy,
       created_by_user_id, updated_by_user_id
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
     )
     RETURNING *`,
    [
      row.organizationId,
      row.churchId,
      row.branchId,
      row.serviceEventRef || null,
      row.attendanceEventId || null,
      row.sessionDate,
      row.startTime,
      row.lateThresholdMinutes,
      row.status || "draft",
      row.title || "",
      row.notes || null,
      row.wrongBranchPolicy || "record",
      row.createdByUserId || null,
      row.updatedByUserId || null,
    ]
  );
  return rows[0] || null;
}

async function findAttendanceSessionById(client, sessionId) {
  const { rows } = await client.query(
    `SELECT * FROM blessboard.attendance_sessions WHERE id = $1 LIMIT 1`,
    [sessionId]
  );
  return rows[0] || null;
}

async function updateAttendanceSession(client, { sessionId, patch }) {
  const { rows } = await client.query(
    `UPDATE blessboard.attendance_sessions SET
       status = COALESCE($2, status),
       opened_at = COALESCE($3, opened_at),
       closed_at = COALESCE($4, closed_at),
       locked_at = COALESCE($5, locked_at),
       updated_by_user_id = COALESCE($6, updated_by_user_id),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      sessionId,
      patch.status || null,
      patch.openedAt || null,
      patch.closedAt || null,
      patch.lockedAt || null,
      patch.updatedByUserId || null,
    ]
  );
  return rows[0] || null;
}

/**
 * List sessions for a church, optionally branch + status filtered.
 */
async function listAttendanceSessions(client, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!churchId || !organizationId) return [];

  const params = [organizationId, churchId];
  const where = ["organization_id = $1", "church_id = $2"];
  let i = 3;

  if (input.branchId) {
    where.push(`branch_id = $${i++}`);
    params.push(String(input.branchId).trim());
  }
  if (input.status) {
    where.push(`status = $${i++}`);
    params.push(String(input.status).trim().toLowerCase());
  }
  if (input.fromDate) {
    where.push(`session_date >= $${i++}`);
    params.push(String(input.fromDate).trim());
  }
  if (input.toDate) {
    where.push(`session_date <= $${i++}`);
    params.push(String(input.toDate).trim());
  }

  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
  params.push(limit);

  const { rows } = await client.query(
    `SELECT * FROM blessboard.attendance_sessions
      WHERE ${where.join(" AND ")}
      ORDER BY session_date DESC, start_time DESC
      LIMIT $${i}`,
    params
  );
  return rows;
}

async function countCheckInsBySession(client, sessionId) {
  const { rows } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE status <> 'voided')::int AS total,
       COUNT(*) FILTER (WHERE status = 'present')::int AS present,
       COUNT(*) FILTER (WHERE status = 'late')::int AS late
     FROM blessboard.attendance_check_ins
     WHERE session_id = $1`,
    [sessionId]
  );
  const row = rows[0] || {};
  return {
    total: Number(row.total) || 0,
    present: Number(row.present) || 0,
    late: Number(row.late) || 0,
  };
}

async function listRecentCheckIns(client, sessionId, limit) {
  const lim = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const { rows } = await client.query(
    `SELECT c.id, c.member_id, c.status, c.method, c.checked_in_at, c.is_late,
            m.first_name, m.last_name, m.member_number
       FROM blessboard.attendance_check_ins c
       LEFT JOIN blessboard.members m ON m.id = c.member_id
      WHERE c.session_id = $1
        AND c.status <> 'voided'
      ORDER BY c.checked_in_at DESC
      LIMIT $2`,
    [sessionId, lim]
  );
  return rows.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    status: r.status,
    method: r.method,
    checkedInAt: r.checked_in_at,
    isLate: r.is_late === true,
    memberName: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Member",
    memberNumber: r.member_number || null,
  }));
}

function createDbSessionStore(getClient) {
  return {
    async insert(db, row) {
      const client = getClient ? await getClient(db) : db;
      return insertAttendanceSession(client, row);
    },
    async findById(db, sessionId) {
      const client = getClient ? await getClient(db) : db;
      return findAttendanceSessionById(client, sessionId);
    },
    async update(db, args) {
      const client = getClient ? await getClient(db) : db;
      return updateAttendanceSession(client, args);
    },
    async list(db, input) {
      const client = getClient ? await getClient(db) : db;
      return listAttendanceSessions(client, input);
    },
  };
}

module.exports = {
  insertAttendanceSession,
  findAttendanceSessionById,
  updateAttendanceSession,
  listAttendanceSessions,
  countCheckInsBySession,
  listRecentCheckIns,
  createDbSessionStore,
};
