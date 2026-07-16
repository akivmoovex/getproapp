"use strict";

async function insertGroup(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_groups (
       organization_id, branch_id, name, description, capacity,
       meeting_day_of_week, meeting_time, meeting_location, created_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.name,
      fields.description || "",
      fields.capacity ?? null,
      fields.meeting_day_of_week ?? null,
      fields.meeting_time || null,
      fields.meeting_location || "",
      fields.created_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function findGroupByIdForBranch(pool, groupId, branchId) {
  const r = await pool.query(
    `SELECT g.*,
            (SELECT COUNT(*)::int FROM public.church_group_memberships m
             WHERE m.group_id = g.id AND m.status = 'active') AS active_count,
            (SELECT COUNT(*)::int FROM public.church_group_memberships m
             WHERE m.group_id = g.id AND m.status = 'waitlisted') AS waitlist_count
     FROM public.church_groups g
     WHERE g.id = $1 AND g.branch_id = $2
     LIMIT 1`,
    [groupId, branchId]
  );
  return r.rows[0] ?? null;
}

async function listGroupsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT g.*,
            (SELECT COUNT(*)::int FROM public.church_group_memberships m
             WHERE m.group_id = g.id AND m.status = 'active') AS active_count,
            (SELECT COUNT(*)::int FROM public.church_group_memberships m
             WHERE m.group_id = g.id AND m.status = 'waitlisted') AS waitlist_count
     FROM public.church_groups g
     WHERE g.branch_id = $1
     ORDER BY g.status ASC, g.name ASC`,
    [branchId]
  );
  return r.rows;
}

async function closeGroup(pool, groupId, branchId, fields) {
  const r = await pool.query(
    `UPDATE public.church_groups
     SET status = 'closed', closed_at = now(), closed_by_admin_id = $3,
         closure_reason = $4, updated_at = now()
     WHERE id = $1 AND branch_id = $2 AND status = 'active'
     RETURNING *`,
    [groupId, branchId, fields.closed_by_admin_id ?? null, fields.closure_reason || ""]
  );
  return r.rows[0] ?? null;
}

async function addLeader(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_group_leaders (
       organization_id, branch_id, group_id, member_id, admin_id, role_label
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.group_id,
      fields.member_id ?? null,
      fields.admin_id ?? null,
      fields.role_label || "leader",
    ]
  );
  return r.rows[0];
}

async function listLeadersForGroup(pool, groupId) {
  const r = await pool.query(
    `SELECT l.*, m.full_name AS member_name, ba.full_name AS admin_name
     FROM public.church_group_leaders l
     LEFT JOIN public.church_members m ON m.id = l.member_id
     LEFT JOIN public.church_branch_admins ba ON ba.id = l.admin_id
     WHERE l.group_id = $1 AND l.status = 'active'
     ORDER BY l.id ASC`,
    [groupId]
  );
  return r.rows;
}

async function countActiveMembers(pool, groupId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM public.church_group_memberships
     WHERE group_id = $1 AND status = 'active'`,
    [groupId]
  );
  return r.rows[0].n;
}

async function findOpenMembership(pool, groupId, memberId) {
  const r = await pool.query(
    `SELECT * FROM public.church_group_memberships
     WHERE group_id = $1 AND member_id = $2 AND status IN ('active', 'waitlisted')
     LIMIT 1`,
    [groupId, memberId]
  );
  return r.rows[0] ?? null;
}

async function insertMembership(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_group_memberships (
       organization_id, branch_id, group_id, member_id, status,
       waitlisted_at, transferred_from_group_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.group_id,
      fields.member_id,
      fields.status || "active",
      fields.status === "waitlisted" ? new Date() : null,
      fields.transferred_from_group_id || null,
    ]
  );
  return r.rows[0];
}

async function updateMembership(pool, membershipId, fields) {
  const r = await pool.query(
    `UPDATE public.church_group_memberships
     SET status = COALESCE($2, status),
         left_at = COALESCE($3, left_at),
         waitlisted_at = COALESCE($4, waitlisted_at),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [membershipId, fields.status ?? null, fields.left_at ?? null, fields.waitlisted_at ?? null]
  );
  return r.rows[0] ?? null;
}

async function listMembershipsForGroup(pool, groupId) {
  const r = await pool.query(
    `SELECT gm.*, m.full_name AS member_name, m.email
     FROM public.church_group_memberships gm
     INNER JOIN public.church_members m ON m.id = gm.member_id
     WHERE gm.group_id = $1 AND gm.status IN ('active', 'waitlisted')
     ORDER BY gm.status ASC, m.full_name ASC`,
    [groupId]
  );
  return r.rows;
}

async function insertJoinRequest(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_group_join_requests (
       organization_id, branch_id, group_id, member_id, message
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.group_id,
      fields.member_id,
      fields.message || "",
    ]
  );
  return r.rows[0];
}

async function findJoinRequestByIdForBranch(pool, requestId, branchId) {
  const r = await pool.query(
    `SELECT jr.*, m.full_name AS member_name, g.name AS group_name
     FROM public.church_group_join_requests jr
     INNER JOIN public.church_members m ON m.id = jr.member_id
     INNER JOIN public.church_groups g ON g.id = jr.group_id
     WHERE jr.id = $1 AND jr.branch_id = $2
     LIMIT 1`,
    [requestId, branchId]
  );
  return r.rows[0] ?? null;
}

async function listPendingJoinRequestsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT jr.*, m.full_name AS member_name, g.name AS group_name
     FROM public.church_group_join_requests jr
     INNER JOIN public.church_members m ON m.id = jr.member_id
     INNER JOIN public.church_groups g ON g.id = jr.group_id
     WHERE jr.branch_id = $1 AND jr.status = 'pending'
     ORDER BY jr.created_at ASC`,
    [branchId]
  );
  return r.rows;
}

async function updateJoinRequest(pool, requestId, fields) {
  const r = await pool.query(
    `UPDATE public.church_group_join_requests
     SET status = COALESCE($2, status),
         decided_at = COALESCE($3, decided_at),
         decided_by_admin_id = COALESCE($4, decided_by_admin_id),
         decision_note = COALESCE($5, decision_note),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      requestId,
      fields.status ?? null,
      fields.decided_at ?? null,
      fields.decided_by_admin_id ?? null,
      fields.decision_note ?? null,
    ]
  );
  return r.rows[0] ?? null;
}

async function insertMeeting(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_group_meetings (
       organization_id, branch_id, group_id, starts_at, ends_at,
       is_recurring_instance, recurrence_series_key, location, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.group_id,
      fields.starts_at,
      fields.ends_at || null,
      fields.is_recurring_instance === true,
      fields.recurrence_series_key || null,
      fields.location || "",
      fields.notes || "",
    ]
  );
  return r.rows[0];
}

async function listMeetingsForGroup(pool, groupId) {
  const r = await pool.query(
    `SELECT * FROM public.church_group_meetings
     WHERE group_id = $1
     ORDER BY starts_at DESC
     LIMIT 50`,
    [groupId]
  );
  return r.rows;
}

async function findMeetingByIdForBranch(pool, meetingId, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_group_meetings WHERE id = $1 AND branch_id = $2 LIMIT 1`,
    [meetingId, branchId]
  );
  return r.rows[0] ?? null;
}

async function upsertAttendance(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_group_attendance (
       organization_id, branch_id, group_id, meeting_id, member_id, present, recorded_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (meeting_id, member_id) DO UPDATE SET
       present = EXCLUDED.present,
       recorded_by_admin_id = EXCLUDED.recorded_by_admin_id
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.group_id,
      fields.meeting_id,
      fields.member_id,
      fields.present !== false,
      fields.recorded_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function listAttendanceForMeeting(pool, meetingId) {
  const r = await pool.query(
    `SELECT a.*, m.full_name AS member_name
     FROM public.church_group_attendance a
     INNER JOIN public.church_members m ON m.id = a.member_id
     WHERE a.meeting_id = $1
     ORDER BY m.full_name ASC`,
    [meetingId]
  );
  return r.rows;
}

async function insertNote(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_group_notes (
       organization_id, branch_id, group_id, note_body, created_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.group_id,
      fields.note_body,
      fields.created_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function listNotesForGroup(pool, groupId) {
  const r = await pool.query(
    `SELECT n.*, ba.full_name AS author_name
     FROM public.church_group_notes n
     LEFT JOIN public.church_branch_admins ba ON ba.id = n.created_by_admin_id
     WHERE n.group_id = $1
     ORDER BY n.created_at DESC
     LIMIT 50`,
    [groupId]
  );
  return r.rows;
}

module.exports = {
  insertGroup,
  findGroupByIdForBranch,
  listGroupsForBranch,
  closeGroup,
  addLeader,
  listLeadersForGroup,
  countActiveMembers,
  findOpenMembership,
  insertMembership,
  updateMembership,
  listMembershipsForGroup,
  insertJoinRequest,
  findJoinRequestByIdForBranch,
  listPendingJoinRequestsForBranch,
  updateJoinRequest,
  insertMeeting,
  listMeetingsForGroup,
  findMeetingByIdForBranch,
  upsertAttendance,
  listAttendanceForMeeting,
  insertNote,
  listNotesForGroup,
};
