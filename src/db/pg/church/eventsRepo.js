"use strict";

const EVENT_SELECT = `
  SELECT e.*,
         COALESCE(e.location, e.location_text, '') AS effective_location,
         COALESCE(e.start_time, e.event_time, '') AS effective_start_time,
         ca.full_name AS created_by_admin_name,
         ua.full_name AS updated_by_admin_name
  FROM public.church_events e
  LEFT JOIN public.church_branch_admins ca ON ca.id = e.created_by_admin_id
  LEFT JOIN public.church_branch_admins ua ON ua.id = e.updated_by_admin_id
`;

function mapEventRow(row) {
  if (!row) return row;
  return {
    ...row,
    location: row.effective_location,
    start_time: row.effective_start_time,
  };
}

const MEMBER_VISIBILITIES = ["public", "members", "leaders"];

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createEventForBranch(pool, fields) {
  const location = fields.location || fields.location_text || "";
  const startTime = fields.start_time || fields.event_time || "";
  const r = await pool.query(
    `INSERT INTO public.church_events (
       organization_id, branch_id, title, description,
       event_date, start_time, end_time, event_time,
       location, location_text, ministry_or_department, visibility,
       status, created_by_admin_id, updated_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5::date, $6, $7, $6, $8, $8, $9, $10, $11, $12, $12)
     RETURNING id`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.title,
      fields.description || "",
      fields.event_date,
      startTime,
      fields.end_time || "",
      location,
      fields.ministry_or_department || null,
      fields.visibility || "members",
      fields.status || "draft",
      fields.created_by_admin_id || null,
    ]
  );
  return findEventByIdForBranch(pool, r.rows[0].id, fields.branch_id);
}

/** @deprecated use createEventForBranch */
async function createEvent(pool, fields) {
  return createEventForBranch(pool, {
    ...fields,
    visibility: "members",
    created_by_admin_id: null,
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ status?: string }} opts
 * @returns {Promise<object[]>}
 */
async function listEventsForBranch(pool, branchId, opts = {}) {
  const status = String(opts.status || "").trim();
  const params = [branchId];
  let where = "WHERE e.branch_id = $1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND e.status = $${params.length}`;
  }
  const r = await pool.query(
    `${EVENT_SELECT}
     ${where}
     ORDER BY e.event_date DESC, e.id DESC`,
    params
  );
  return r.rows.map(mapEventRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} eventId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findEventByIdForBranch(pool, eventId, branchId) {
  const r = await pool.query(
    `${EVENT_SELECT}
     WHERE e.id = $1 AND e.branch_id = $2
     LIMIT 1`,
    [eventId, branchId]
  );
  return mapEventRow(r.rows[0] ?? null);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} eventId
 * @param {number} branchId
 * @param {object} update
 * @returns {Promise<object | null>}
 */
async function updateEventForBranch(pool, eventId, branchId, update) {
  const r = await pool.query(
    `UPDATE public.church_events
     SET title = $1,
         description = $2,
         event_date = $3::date,
         start_time = $4,
         end_time = $5,
         event_time = $4,
         location = $6,
         location_text = $6,
         ministry_or_department = $7,
         visibility = $8,
         updated_by_admin_id = $9,
         updated_at = now()
     WHERE id = $10 AND branch_id = $11
     RETURNING id`,
    [
      update.title,
      update.description,
      update.event_date,
      update.start_time || "",
      update.end_time || "",
      update.location || "",
      update.ministry_or_department || null,
      update.visibility,
      update.updated_by_admin_id || null,
      eventId,
      branchId,
    ]
  );
  if (!r.rows[0]) return null;
  return findEventByIdForBranch(pool, eventId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} eventId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function publishEventForBranch(pool, eventId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_events
     SET status = 'published',
         updated_by_admin_id = $1,
         updated_at = now()
     WHERE id = $2 AND branch_id = $3 AND status IN ('draft', 'published')
     RETURNING id`,
    [adminId, eventId, branchId]
  );
  if (!r.rows[0]) return null;
  return findEventByIdForBranch(pool, eventId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} eventId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function cancelEventForBranch(pool, eventId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_events
     SET status = 'cancelled',
         updated_by_admin_id = $1,
         updated_at = now()
     WHERE id = $2 AND branch_id = $3 AND status IN ('draft', 'published')
     RETURNING id`,
    [adminId, eventId, branchId]
  );
  if (!r.rows[0]) return null;
  return findEventByIdForBranch(pool, eventId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<Record<string, number>>}
 */
async function countEventsByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_events
     WHERE branch_id = $1
     GROUP BY status`,
    [branchId]
  );
  const out = { draft: 0, published: 0, cancelled: 0 };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(out, row.status)) {
      out[row.status] = row.count;
    }
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<number>}
 */
async function countUpcomingPublishedEventsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_events
     WHERE branch_id = $1
       AND status = 'published'
       AND event_date >= CURRENT_DATE`,
    [branchId]
  );
  return r.rows[0]?.count || 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ limit?: number, includeRecentDays?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listUpcomingEventsForBranch(pool, branchId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);
  const recentDays = Math.min(Math.max(Number(opts.includeRecentDays) || 0, 0), 90);
  const params = [branchId, MEMBER_VISIBILITIES];
  let dateClause = "e.event_date >= CURRENT_DATE";
  if (recentDays > 0) {
    params.push(recentDays);
    dateClause = `e.event_date >= CURRENT_DATE - ($${params.length}::int * INTERVAL '1 day')`;
  }
  params.push(limit);
  const r = await pool.query(
    `${EVENT_SELECT}
     WHERE e.branch_id = $1
       AND e.status = 'published'
       AND e.visibility = ANY($2::text[])
       AND ${dateClause}
     ORDER BY e.event_date ASC, e.id ASC
     LIMIT $${params.length}`,
    params
  );
  return r.rows.map(mapEventRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listPublicEventsForBranch(pool, branchId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);
  const r = await pool.query(
    `${EVENT_SELECT}
     WHERE e.branch_id = $1
       AND e.status = 'published'
       AND e.visibility = 'public'
       AND e.event_date >= CURRENT_DATE
     ORDER BY e.event_date ASC, e.id ASC
     LIMIT $2`,
    [branchId, limit]
  );
  return r.rows.map(mapEventRow);
}

module.exports = {
  createEvent,
  createEventForBranch,
  listEventsForBranch,
  findEventByIdForBranch,
  updateEventForBranch,
  publishEventForBranch,
  cancelEventForBranch,
  countEventsByStatusForBranch,
  countUpcomingPublishedEventsForBranch,
  listUpcomingEventsForBranch,
  listPublicEventsForBranch,
};
