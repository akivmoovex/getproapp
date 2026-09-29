"use strict";

async function insertStage(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_discipleship_stages (
       organization_id, branch_id, name, description, sort_order
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.name,
      fields.description || "",
      fields.sort_order ?? 0,
    ]
  );
  return r.rows[0];
}

async function listStagesForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_discipleship_stages
     WHERE branch_id = $1 AND status = 'active'
     ORDER BY sort_order ASC, id ASC`,
    [branchId]
  );
  return r.rows;
}

async function findStageByIdForBranch(pool, stageId, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_discipleship_stages
     WHERE id = $1 AND branch_id = $2 LIMIT 1`,
    [stageId, branchId]
  );
  return r.rows[0] ?? null;
}

async function insertMilestone(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_discipleship_milestones (
       organization_id, branch_id, stage_id, name, description, sort_order
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.stage_id,
      fields.name,
      fields.description || "",
      fields.sort_order ?? 0,
    ]
  );
  return r.rows[0];
}

async function listMilestonesForStage(pool, stageId) {
  const r = await pool.query(
    `SELECT * FROM public.church_discipleship_milestones
     WHERE stage_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [stageId]
  );
  return r.rows;
}

async function findMilestoneByIdForBranch(pool, milestoneId, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_discipleship_milestones
     WHERE id = $1 AND branch_id = $2 LIMIT 1`,
    [milestoneId, branchId]
  );
  return r.rows[0] ?? null;
}

async function findMemberDiscipleship(pool, memberId, branchId) {
  const r = await pool.query(
    `SELECT md.*, s.name AS stage_name, ba.full_name AS owner_name
     FROM public.church_member_discipleship md
     INNER JOIN public.church_discipleship_stages s ON s.id = md.stage_id
     LEFT JOIN public.church_branch_admins ba ON ba.id = md.owner_admin_id
     WHERE md.member_id = $1 AND md.branch_id = $2
     LIMIT 1`,
    [memberId, branchId]
  );
  return r.rows[0] ?? null;
}

async function upsertMemberDiscipleship(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_member_discipleship (
       organization_id, branch_id, member_id, stage_id, owner_admin_id, status
     ) VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (member_id) DO UPDATE SET
       stage_id = EXCLUDED.stage_id,
       owner_admin_id = COALESCE(EXCLUDED.owner_admin_id, church_member_discipleship.owner_admin_id),
       status = 'active',
       updated_at = now()
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.member_id,
      fields.stage_id,
      fields.owner_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function insertHistory(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_discipleship_history (
       organization_id, branch_id, member_id, from_stage_id, to_stage_id,
       milestone_id, movement_reason, moved_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.member_id,
      fields.from_stage_id ?? null,
      fields.to_stage_id,
      fields.milestone_id ?? null,
      fields.movement_reason || "",
      fields.moved_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function listHistoryForMember(pool, memberId, branchId) {
  const r = await pool.query(
    `SELECT h.*, fs.name AS from_stage_name, ts.name AS to_stage_name,
            ms.name AS milestone_name, ba.full_name AS moved_by_name
     FROM public.church_discipleship_history h
     LEFT JOIN public.church_discipleship_stages fs ON fs.id = h.from_stage_id
     INNER JOIN public.church_discipleship_stages ts ON ts.id = h.to_stage_id
     LEFT JOIN public.church_discipleship_milestones ms ON ms.id = h.milestone_id
     LEFT JOIN public.church_branch_admins ba ON ba.id = h.moved_by_admin_id
     WHERE h.member_id = $1 AND h.branch_id = $2
     ORDER BY h.created_at DESC`,
    [memberId, branchId]
  );
  return r.rows;
}

async function listMemberDiscipleshipForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT md.*, m.full_name AS member_name, s.name AS stage_name, ba.full_name AS owner_name
     FROM public.church_member_discipleship md
     INNER JOIN public.church_members m ON m.id = md.member_id
     INNER JOIN public.church_discipleship_stages s ON s.id = md.stage_id
     LEFT JOIN public.church_branch_admins ba ON ba.id = md.owner_admin_id
     WHERE md.branch_id = $1 AND md.status = 'active'
     ORDER BY s.sort_order ASC, m.full_name ASC`,
    [branchId]
  );
  return r.rows;
}

module.exports = {
  insertStage,
  listStagesForBranch,
  findStageByIdForBranch,
  insertMilestone,
  listMilestonesForStage,
  findMilestoneByIdForBranch,
  findMemberDiscipleship,
  upsertMemberDiscipleship,
  insertHistory,
  listHistoryForMember,
  listMemberDiscipleshipForBranch,
};
