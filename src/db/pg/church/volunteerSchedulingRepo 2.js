"use strict";

async function insertRole(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_volunteer_roles (
       organization_id, branch_id, name, description
     ) VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [fields.organization_id, fields.branch_id, fields.name, fields.description || ""]
  );
  return r.rows[0];
}

async function listRolesForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_volunteer_roles
     WHERE branch_id = $1 AND status = 'active'
     ORDER BY name ASC`,
    [branchId]
  );
  return r.rows;
}

async function findRoleByIdForBranch(pool, roleId, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_volunteer_roles WHERE id = $1 AND branch_id = $2 LIMIT 1`,
    [roleId, branchId]
  );
  return r.rows[0] ?? null;
}

async function insertSkill(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_volunteer_skills (organization_id, branch_id, name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [fields.organization_id, fields.branch_id, fields.name]
  );
  return r.rows[0];
}

async function listSkillsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_volunteer_skills WHERE branch_id = $1 ORDER BY name ASC`,
    [branchId]
  );
  return r.rows;
}

async function linkRoleSkill(pool, roleId, skillId) {
  await pool.query(
    `INSERT INTO public.church_volunteer_role_skills (role_id, skill_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [roleId, skillId]
  );
}

async function listSkillsForRole(pool, roleId) {
  const r = await pool.query(
    `SELECT s.* FROM public.church_volunteer_skills s
     INNER JOIN public.church_volunteer_role_skills rs ON rs.skill_id = s.id
     WHERE rs.role_id = $1
     ORDER BY s.name ASC`,
    [roleId]
  );
  return r.rows;
}

async function addMemberSkill(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_volunteer_member_skills (
       organization_id, branch_id, member_id, skill_id
     ) VALUES ($1, $2, $3, $4)
     ON CONFLICT (member_id, skill_id) DO NOTHING
     RETURNING *`,
    [fields.organization_id, fields.branch_id, fields.member_id, fields.skill_id]
  );
  return r.rows[0] ?? null;
}

async function listMemberSkillIds(pool, memberId) {
  const r = await pool.query(
    `SELECT skill_id FROM public.church_volunteer_member_skills WHERE member_id = $1`,
    [memberId]
  );
  return r.rows.map((row) => Number(row.skill_id));
}

async function insertAvailability(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_volunteer_availability (
       organization_id, branch_id, member_id, day_of_week, start_time, end_time
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.member_id,
      fields.day_of_week,
      fields.start_time,
      fields.end_time,
    ]
  );
  return r.rows[0];
}

async function listAvailabilityForMember(pool, memberId) {
  const r = await pool.query(
    `SELECT * FROM public.church_volunteer_availability
     WHERE member_id = $1 AND status = 'active'
     ORDER BY day_of_week ASC, start_time ASC`,
    [memberId]
  );
  return r.rows;
}

async function insertShift(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_volunteer_shifts (
       organization_id, branch_id, role_id, title, starts_at, ends_at, slots, created_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.role_id,
      fields.title || "",
      fields.starts_at,
      fields.ends_at,
      fields.slots ?? 1,
      fields.created_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function findShiftByIdForBranch(pool, shiftId, branchId) {
  const r = await pool.query(
    `SELECT s.*, r.name AS role_name
     FROM public.church_volunteer_shifts s
     INNER JOIN public.church_volunteer_roles r ON r.id = s.role_id
     WHERE s.id = $1 AND s.branch_id = $2
     LIMIT 1`,
    [shiftId, branchId]
  );
  return r.rows[0] ?? null;
}

async function listShiftsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT s.*, r.name AS role_name,
            (SELECT COUNT(*)::int FROM public.church_volunteer_assignments a
             WHERE a.shift_id = s.id AND a.status IN ('assigned', 'confirmed', 'completed')) AS assigned_count
     FROM public.church_volunteer_shifts s
     INNER JOIN public.church_volunteer_roles r ON r.id = s.role_id
     WHERE s.branch_id = $1 AND s.status <> 'cancelled'
     ORDER BY s.starts_at ASC`,
    [branchId]
  );
  return r.rows;
}

async function findConflictingAssignment(pool, memberId, startsAt, endsAt, excludeShiftId) {
  const r = await pool.query(
    `SELECT a.*, s.starts_at, s.ends_at, s.title
     FROM public.church_volunteer_assignments a
     INNER JOIN public.church_volunteer_shifts s ON s.id = a.shift_id
     WHERE a.member_id = $1
       AND a.status IN ('assigned', 'confirmed')
       AND ($4::int IS NULL OR a.shift_id <> $4)
       AND s.starts_at < $3 AND s.ends_at > $2
     LIMIT 1`,
    [memberId, startsAt, endsAt, excludeShiftId || null]
  );
  return r.rows[0] ?? null;
}

async function insertAssignment(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_volunteer_assignments (
       organization_id, branch_id, shift_id, member_id, status, assigned_by_admin_id
     ) VALUES ($1, $2, $3, $4, 'assigned', $5)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.shift_id,
      fields.member_id,
      fields.assigned_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function findAssignmentByIdForBranch(pool, assignmentId, branchId) {
  const r = await pool.query(
    `SELECT a.*, m.full_name AS member_name, s.starts_at, s.ends_at, s.title, r.name AS role_name
     FROM public.church_volunteer_assignments a
     INNER JOIN public.church_members m ON m.id = a.member_id
     INNER JOIN public.church_volunteer_shifts s ON s.id = a.shift_id
     INNER JOIN public.church_volunteer_roles r ON r.id = s.role_id
     WHERE a.id = $1 AND a.branch_id = $2
     LIMIT 1`,
    [assignmentId, branchId]
  );
  return r.rows[0] ?? null;
}

async function updateAssignment(pool, assignmentId, fields) {
  const r = await pool.query(
    `UPDATE public.church_volunteer_assignments
     SET status = COALESCE($2, status),
         confirmed_at = COALESCE($3, confirmed_at),
         completed_at = COALESCE($4, completed_at),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      assignmentId,
      fields.status ?? null,
      fields.confirmed_at ?? null,
      fields.completed_at ?? null,
    ]
  );
  return r.rows[0] ?? null;
}

async function listAssignmentsForShift(pool, shiftId) {
  const r = await pool.query(
    `SELECT a.*, m.full_name AS member_name
     FROM public.church_volunteer_assignments a
     INNER JOIN public.church_members m ON m.id = a.member_id
     WHERE a.shift_id = $1
     ORDER BY a.created_at ASC`,
    [shiftId]
  );
  return r.rows;
}

module.exports = {
  insertRole,
  listRolesForBranch,
  findRoleByIdForBranch,
  insertSkill,
  listSkillsForBranch,
  linkRoleSkill,
  listSkillsForRole,
  addMemberSkill,
  listMemberSkillIds,
  insertAvailability,
  listAvailabilityForMember,
  insertShift,
  findShiftByIdForBranch,
  listShiftsForBranch,
  findConflictingAssignment,
  insertAssignment,
  findAssignmentByIdForBranch,
  updateAssignment,
  listAssignmentsForShift,
};
