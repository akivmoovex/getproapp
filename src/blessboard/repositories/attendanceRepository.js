"use strict";

/**
 * BlessBoard V5 aggregate attendance repository (SQL only).
 */

const EVENT_COLS = `id, church_id, branch_id, event_date, event_at, event_type, title, status,
  created_by_user_id, submitted_by_user_id, submitted_at, approved_by_user_id, approved_at,
  created_at, updated_at`;

const ENTRY_COLS = `id, church_id, attendance_event_id, category, count, notes,
  submitted_by_user_id, created_at, updated_at`;

function mapEvent(row) {
  if (!row) return null;
  let eventDate = row.event_date;
  if (eventDate instanceof Date) {
    eventDate = eventDate.toISOString().slice(0, 10);
  } else if (eventDate != null) {
    eventDate = String(eventDate).slice(0, 10);
  }
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    eventDate,
    eventAt: row.event_at || null,
    eventType: row.event_type,
    title: row.title,
    status: row.status,
    createdByUserId: row.created_by_user_id || null,
    submittedByUserId: row.submitted_by_user_id || null,
    submittedAt: row.submitted_at || null,
    approvedByUserId: row.approved_by_user_id || null,
    approvedAt: row.approved_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    attendanceEventId: row.attendance_event_id,
    category: row.category,
    count: Number(row.count) || 0,
    notes: row.notes || null,
    submittedByUserId: row.submitted_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findEventById(client, id) {
  const { rows } = await client.query(
    `SELECT ${EVENT_COLS} FROM blessboard.attendance_events WHERE id = $1`,
    [id]
  );
  return mapEvent(rows[0] || null);
}

async function listEvents(client, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1`;
  if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  if (opts.status) {
    params.push(opts.status);
    where += ` AND status = $${params.length}`;
  }
  if (opts.yearMonth) {
    params.push(opts.yearMonth);
    where += ` AND to_char(event_date, 'YYYY-MM') = $${params.length}`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 50);
  if (opts.eventType) {
    params.push(opts.eventType);
    where += ` AND event_type = $${params.length}`;
  }
  params.push(limit);
  const { rows } = await client.query(
    `SELECT ${EVENT_COLS}
       FROM blessboard.attendance_events
      WHERE ${where}
      ORDER BY event_date DESC, created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows.map(mapEvent);
}

async function insertEvent(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.attendance_events
       (church_id, branch_id, event_date, event_at, event_type, title, status, created_by_user_id)
     VALUES ($1, $2, $3::date, $4, $5, $6, 'draft', $7)
     RETURNING ${EVENT_COLS}`,
    [
      fields.churchId,
      fields.branchId,
      fields.eventDate,
      fields.eventAt || null,
      fields.eventType,
      fields.title,
      fields.createdByUserId || null,
    ]
  );
  return mapEvent(rows[0]);
}

async function updateEventMeta(client, id, patch) {
  const { rows } = await client.query(
    `UPDATE blessboard.attendance_events
        SET title = COALESCE($2, title),
            event_type = COALESCE($3, event_type),
            event_date = COALESCE($4::date, event_date),
            event_at = CASE
              WHEN $5::boolean THEN NULL
              WHEN $6::timestamptz IS NOT NULL THEN $6::timestamptz
              ELSE event_at
            END,
            updated_at = now()
      WHERE id = $1
      RETURNING ${EVENT_COLS}`,
    [
      id,
      patch.title != null ? patch.title : null,
      patch.eventType != null ? patch.eventType : null,
      patch.eventDate != null ? patch.eventDate : null,
      patch.clearEventAt === true,
      patch.eventAt || null,
    ]
  );
  return mapEvent(rows[0] || null);
}

async function updateEventStatus(client, id, patch) {
  const { rows } = await client.query(
    `UPDATE blessboard.attendance_events
        SET status = $2,
            submitted_by_user_id = COALESCE($3, submitted_by_user_id),
            submitted_at = COALESCE($4, submitted_at),
            approved_by_user_id = COALESCE($5, approved_by_user_id),
            approved_at = COALESCE($6, approved_at),
            updated_at = now()
      WHERE id = $1
      RETURNING ${EVENT_COLS}`,
    [
      id,
      patch.status,
      patch.submittedByUserId || null,
      patch.submittedAt || null,
      patch.approvedByUserId || null,
      patch.approvedAt || null,
    ]
  );
  return mapEvent(rows[0] || null);
}

async function listEntriesForEvent(client, attendanceEventId) {
  const { rows } = await client.query(
    `SELECT ${ENTRY_COLS}
       FROM blessboard.attendance_entries
      WHERE attendance_event_id = $1
      ORDER BY category ASC`,
    [attendanceEventId]
  );
  return rows.map(mapEntry);
}

async function findEntryByEventCategory(client, attendanceEventId, category) {
  const { rows } = await client.query(
    `SELECT ${ENTRY_COLS}
       FROM blessboard.attendance_entries
      WHERE attendance_event_id = $1 AND category = $2`,
    [attendanceEventId, category]
  );
  return mapEntry(rows[0] || null);
}

async function upsertEntry(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.attendance_entries
       (church_id, attendance_event_id, category, count, notes, submitted_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (attendance_event_id, category)
     DO UPDATE SET
       count = EXCLUDED.count,
       notes = EXCLUDED.notes,
       submitted_by_user_id = COALESCE(EXCLUDED.submitted_by_user_id, blessboard.attendance_entries.submitted_by_user_id),
       updated_at = now()
     RETURNING ${ENTRY_COLS}`,
    [
      fields.churchId,
      fields.attendanceEventId,
      fields.category,
      fields.count,
      fields.notes || null,
      fields.submittedByUserId || null,
    ]
  );
  return mapEntry(rows[0]);
}

async function deleteEntry(client, attendanceEventId, category) {
  const { rowCount } = await client.query(
    `DELETE FROM blessboard.attendance_entries
      WHERE attendance_event_id = $1 AND category = $2`,
    [attendanceEventId, category]
  );
  return rowCount > 0;
}

/**
 * Monthly aggregate from real entry sums (excludes draft only).
 * @param {{ query: Function }} client
 * @param {{ churchId: string, branchId?: string|null, yearMonth: string }} opts
 */
async function monthlySummary(client, opts) {
  const params = [opts.churchId, opts.yearMonth];
  let branchClause = "";
  if (opts.branchId) {
    params.push(opts.branchId);
    branchClause = ` AND e.branch_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `SELECT
        to_char(e.event_date, 'YYYY-MM') AS year_month,
        e.branch_id,
        b.branch_key,
        b.display_name AS branch_display_name,
        en.category,
        COUNT(DISTINCT e.id)::int AS event_count,
        COALESCE(SUM(en.count), 0)::int AS total_count
       FROM blessboard.attendance_events e
       INNER JOIN blessboard.attendance_entries en
         ON en.attendance_event_id = e.id
       LEFT JOIN blessboard.branches b ON b.id = e.branch_id
      WHERE e.church_id = $1
        AND to_char(e.event_date, 'YYYY-MM') = $2
        AND e.status IN ('submitted', 'approved', 'archived')
        ${branchClause}
      GROUP BY to_char(e.event_date, 'YYYY-MM'), e.branch_id, b.branch_key, b.display_name, en.category
      ORDER BY b.display_name NULLS LAST, en.category`,
    params
  );
  return rows.map((row) => ({
    yearMonth: row.year_month,
    branchId: row.branch_id,
    branchKey: row.branch_key || null,
    branchDisplayName: row.branch_display_name || null,
    category: row.category,
    eventCount: Number(row.event_count) || 0,
    totalCount: Number(row.total_count) || 0,
  }));
}

/**
 * Church-wide monthly totals (no per-branch breakdown).
 */
async function monthlyChurchTotals(client, opts) {
  const { rows } = await client.query(
    `SELECT
        to_char(e.event_date, 'YYYY-MM') AS year_month,
        en.category,
        COUNT(DISTINCT e.id)::int AS event_count,
        COALESCE(SUM(en.count), 0)::int AS total_count
       FROM blessboard.attendance_events e
       INNER JOIN blessboard.attendance_entries en
         ON en.attendance_event_id = e.id
      WHERE e.church_id = $1
        AND to_char(e.event_date, 'YYYY-MM') = $2
        AND e.status IN ('submitted', 'approved', 'archived')
      GROUP BY to_char(e.event_date, 'YYYY-MM'), en.category
      ORDER BY en.category`,
    [opts.churchId, opts.yearMonth]
  );
  return rows.map((row) => ({
    yearMonth: row.year_month,
    category: row.category,
    eventCount: Number(row.event_count) || 0,
    totalCount: Number(row.total_count) || 0,
  }));
}

async function findBranchScope(client, branchId) {
  const { rows } = await client.query(
    `SELECT id, church_id, status, branch_key, display_name
       FROM blessboard.branches WHERE id = $1`,
    [branchId]
  );
  return rows[0] || null;
}

module.exports = {
  mapEvent,
  mapEntry,
  findEventById,
  listEvents,
  insertEvent,
  updateEventMeta,
  updateEventStatus,
  listEntriesForEvent,
  findEntryByEventCategory,
  upsertEntry,
  deleteEntry,
  monthlySummary,
  monthlyChurchTotals,
  findBranchScope,
};
