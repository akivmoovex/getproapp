"use strict";

/**
 * BlessBoard V5 ministry memberships + event registrations (SQL only).
 */

function mapMembership(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    ministryId: row.ministry_id,
    memberId: row.member_id,
    status: row.status,
    message: row.message || null,
    reviewedByUserId: row.reviewed_by_user_id || null,
    reviewedAt: row.reviewed_at || null,
    reviewNotes: row.review_notes || null,
    joinedAt: row.joined_at || null,
    leftAt: row.left_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRegistration(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    eventId: row.event_id,
    memberId: row.member_id,
    status: row.status,
    cancelledAt: row.cancelled_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Privacy-limited member fields for admin lists (no phone). */
function mapMemberPrivacy(row) {
  if (!row) return null;
  const preferred = row.preferred_name || null;
  const displayName =
    preferred ||
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    "Member";
  return {
    memberId: row.member_id || row.id,
    displayName,
    emailDisplay: row.email_display || null,
  };
}

const MEMBERSHIP_COLS = `id, church_id, ministry_id, member_id, status, message,
  reviewed_by_user_id, reviewed_at, review_notes, joined_at, left_at, created_at, updated_at`;

const REGISTRATION_COLS = `id, church_id, event_id, member_id, status, cancelled_at,
  created_at, updated_at`;

async function findMinistryById(client, id) {
  const { rows } = await client.query(
    `SELECT id, church_id, branch_id, name, summary, description, meeting_day,
            contact_email, status, join_policy, created_at, updated_at
       FROM blessboard.ministries WHERE id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    name: row.name,
    summary: row.summary,
    description: row.description,
    meetingDay: row.meeting_day,
    contactEmail: row.contact_email,
    status: row.status,
    joinPolicy: row.join_policy || "request",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findEventById(client, id) {
  const { rows } = await client.query(
    `SELECT id, church_id, branch_id, title, summary, starts_at, ends_at, timezone,
            location, capacity, status, created_at, updated_at
       FROM blessboard.events WHERE id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    title: row.title,
    summary: row.summary,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    location: row.location,
    capacity: row.capacity == null ? null : Number(row.capacity),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Published ministries visible to a member (church-wide + branch).
 */
async function listPublishedMinistriesForBranch(client, opts) {
  const { rows } = await client.query(
    `SELECT id, church_id, branch_id, name, summary, description, meeting_day,
            contact_email, status, join_policy, created_at, updated_at
       FROM blessboard.ministries
      WHERE church_id = $1
        AND status = 'published'
        AND (branch_id IS NULL OR branch_id = $2)
      ORDER BY sort_order ASC, name ASC`,
    [opts.churchId, opts.branchId]
  );
  return rows.map((row) => ({
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    name: row.name,
    summary: row.summary,
    description: row.description,
    meetingDay: row.meeting_day,
    contactEmail: row.contact_email,
    status: row.status,
    joinPolicy: row.join_policy || "request",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function listPublishedEventsForBranch(client, opts) {
  const { rows } = await client.query(
    `SELECT id, church_id, branch_id, title, summary, starts_at, ends_at, timezone,
            location, capacity, status, created_at, updated_at
       FROM blessboard.events
      WHERE church_id = $1
        AND status = 'published'
        AND (branch_id IS NULL OR branch_id = $2)
      ORDER BY starts_at ASC`,
    [opts.churchId, opts.branchId]
  );
  return rows.map((row) => ({
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    title: row.title,
    summary: row.summary,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    location: row.location,
    capacity: row.capacity == null ? null : Number(row.capacity),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function findOpenMinistryMembership(client, memberId, ministryId) {
  const { rows } = await client.query(
    `SELECT ${MEMBERSHIP_COLS}
       FROM blessboard.ministry_memberships
      WHERE member_id = $1 AND ministry_id = $2
        AND status IN ('pending', 'active')
      LIMIT 1`,
    [memberId, ministryId]
  );
  return mapMembership(rows[0] || null);
}

async function findMinistryMembershipById(client, id) {
  const { rows } = await client.query(
    `SELECT ${MEMBERSHIP_COLS} FROM blessboard.ministry_memberships WHERE id = $1`,
    [id]
  );
  return mapMembership(rows[0] || null);
}

async function insertMinistryMembership(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.ministry_memberships
       (church_id, ministry_id, member_id, status, message, joined_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${MEMBERSHIP_COLS}`,
    [
      fields.churchId,
      fields.ministryId,
      fields.memberId,
      fields.status,
      fields.message || null,
      fields.joinedAt || null,
    ]
  );
  return mapMembership(rows[0]);
}

async function updateMinistryMembershipStatus(client, id, patch) {
  const { rows } = await client.query(
    `UPDATE blessboard.ministry_memberships
        SET status = $2,
            reviewed_by_user_id = COALESCE($3, reviewed_by_user_id),
            reviewed_at = COALESCE($4, reviewed_at),
            review_notes = COALESCE($5, review_notes),
            joined_at = COALESCE($6, joined_at),
            left_at = COALESCE($7, left_at),
            updated_at = now()
      WHERE id = $1
      RETURNING ${MEMBERSHIP_COLS}`,
    [
      id,
      patch.status,
      patch.reviewedByUserId || null,
      patch.reviewedAt || null,
      patch.reviewNotes !== undefined ? patch.reviewNotes : null,
      patch.joinedAt || null,
      patch.leftAt || null,
    ]
  );
  return mapMembership(rows[0] || null);
}

async function listMinistryMembershipsForMember(client, memberId) {
  const { rows } = await client.query(
    `SELECT ${MEMBERSHIP_COLS}
       FROM blessboard.ministry_memberships
      WHERE member_id = $1
      ORDER BY created_at DESC`,
    [memberId]
  );
  return rows.map(mapMembership);
}

/**
 * Admin list with privacy-limited member fields.
 */
async function listMinistryMembershipsForMinistry(client, opts) {
  const params = [opts.ministryId];
  let statusClause = "";
  if (opts.status) {
    params.push(opts.status);
    statusClause = ` AND mm.status = $${params.length}`;
  }
  const { rows } = await client.query(
    `SELECT mm.id, mm.church_id, mm.ministry_id, mm.member_id, mm.status, mm.message,
            mm.reviewed_by_user_id, mm.reviewed_at, mm.review_notes, mm.joined_at, mm.left_at,
            mm.created_at, mm.updated_at,
            m.first_name, m.last_name, m.preferred_name, m.email_display
       FROM blessboard.ministry_memberships mm
       INNER JOIN blessboard.members m ON m.id = mm.member_id
      WHERE mm.ministry_id = $1
        ${statusClause}
      ORDER BY mm.created_at DESC
      LIMIT 100`,
    params
  );
  return rows.map((row) => ({
    ...mapMembership(row),
    member: mapMemberPrivacy(row),
  }));
}

async function findEventRegistration(client, memberId, eventId) {
  const { rows } = await client.query(
    `SELECT ${REGISTRATION_COLS}
       FROM blessboard.event_registrations
      WHERE member_id = $1 AND event_id = $2`,
    [memberId, eventId]
  );
  return mapRegistration(rows[0] || null);
}

async function findEventRegistrationById(client, id) {
  const { rows } = await client.query(
    `SELECT ${REGISTRATION_COLS} FROM blessboard.event_registrations WHERE id = $1`,
    [id]
  );
  return mapRegistration(rows[0] || null);
}

async function countActiveEventRegistrations(client, eventId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.event_registrations
      WHERE event_id = $1 AND status = 'registered'`,
    [eventId]
  );
  return Number(rows[0] && rows[0].n) || 0;
}

async function insertEventRegistration(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.event_registrations
       (church_id, event_id, member_id, status)
     VALUES ($1, $2, $3, 'registered')
     RETURNING ${REGISTRATION_COLS}`,
    [fields.churchId, fields.eventId, fields.memberId]
  );
  return mapRegistration(rows[0]);
}

async function reactivateEventRegistration(client, id) {
  const { rows } = await client.query(
    `UPDATE blessboard.event_registrations
        SET status = 'registered',
            cancelled_at = NULL,
            updated_at = now()
      WHERE id = $1
      RETURNING ${REGISTRATION_COLS}`,
    [id]
  );
  return mapRegistration(rows[0] || null);
}

async function cancelEventRegistration(client, id) {
  const { rows } = await client.query(
    `UPDATE blessboard.event_registrations
        SET status = 'cancelled',
            cancelled_at = now(),
            updated_at = now()
      WHERE id = $1 AND status = 'registered'
      RETURNING ${REGISTRATION_COLS}`,
    [id]
  );
  return mapRegistration(rows[0] || null);
}

async function listEventRegistrationsForEvent(client, eventId) {
  const { rows } = await client.query(
    `SELECT er.id, er.church_id, er.event_id, er.member_id, er.status, er.cancelled_at,
            er.created_at, er.updated_at,
            m.first_name, m.last_name, m.preferred_name, m.email_display
       FROM blessboard.event_registrations er
       INNER JOIN blessboard.members m ON m.id = er.member_id
      WHERE er.event_id = $1
      ORDER BY er.created_at ASC
      LIMIT 200`,
    [eventId]
  );
  return rows.map((row) => ({
    ...mapRegistration(row),
    member: mapMemberPrivacy(row),
  }));
}

async function listAdminMinistries(client, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1 AND status = 'published'`;
  if (opts.branchId === null) {
    where += ` AND branch_id IS NULL`;
  } else if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `SELECT id, church_id, branch_id, name, status, join_policy
       FROM blessboard.ministries
      WHERE ${where}
      ORDER BY name ASC`,
    params
  );
  return rows.map((row) => ({
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    name: row.name,
    status: row.status,
    joinPolicy: row.join_policy || "request",
  }));
}

async function listAdminEvents(client, opts) {
  const params = [opts.churchId];
  let where = `church_id = $1 AND status = 'published'`;
  if (opts.branchId === null) {
    where += ` AND branch_id IS NULL`;
  } else if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `SELECT id, church_id, branch_id, title, starts_at, capacity, status
       FROM blessboard.events
      WHERE ${where}
      ORDER BY starts_at ASC`,
    params
  );
  return rows.map((row) => ({
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    title: row.title,
    startsAt: row.starts_at,
    capacity: row.capacity == null ? null : Number(row.capacity),
    status: row.status,
  }));
}

module.exports = {
  mapMembership,
  mapRegistration,
  mapMemberPrivacy,
  findMinistryById,
  findEventById,
  listPublishedMinistriesForBranch,
  listPublishedEventsForBranch,
  findOpenMinistryMembership,
  findMinistryMembershipById,
  insertMinistryMembership,
  updateMinistryMembershipStatus,
  listMinistryMembershipsForMember,
  listMinistryMembershipsForMinistry,
  findEventRegistration,
  findEventRegistrationById,
  countActiveEventRegistrations,
  insertEventRegistration,
  reactivateEventRegistration,
  cancelEventRegistration,
  listEventRegistrationsForEvent,
  listAdminMinistries,
  listAdminEvents,
};
