"use strict";

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 */
async function createPastoralCase(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_pastoral_cases (
       organization_id, branch_id, member_id, prayer_request_id,
       case_type, title, summary, status,
       assigned_admin_id, due_date, next_action, opened_by_admin_id
     ) VALUES ($1, $2, $3, $4, 'pastoral_care', $5, $6, 'open', $7, $8::date, $9, $10)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.member_id,
      fields.prayer_request_id ?? null,
      fields.title,
      fields.summary || "",
      fields.assigned_admin_id ?? null,
      fields.due_date || null,
      fields.next_action || "",
      fields.opened_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} memberId
 */
async function findOpenPastoralCaseForMember(pool, branchId, memberId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_pastoral_cases
     WHERE branch_id = $1 AND member_id = $2
       AND status IN ('open', 'in_follow_up', 'paused', 'pending_supervisor_ack', 'escalated')
     LIMIT 1`,
    [branchId, memberId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} caseId
 * @param {number} branchId
 */
async function findPastoralCaseByIdForBranch(pool, caseId, branchId) {
  const r = await pool.query(
    `SELECT c.*,
            m.full_name AS member_name,
            aa.full_name AS assigned_admin_name,
            ob.full_name AS opened_by_name
     FROM public.church_pastoral_cases c
     INNER JOIN public.church_members m ON m.id = c.member_id
     LEFT JOIN public.church_branch_admins aa ON aa.id = c.assigned_admin_id
     LEFT JOIN public.church_branch_admins ob ON ob.id = c.opened_by_admin_id
     WHERE c.id = $1 AND c.branch_id = $2
     LIMIT 1`,
    [caseId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 */
async function listPastoralCasesForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT c.*, m.full_name AS member_name, aa.full_name AS assigned_admin_name
     FROM public.church_pastoral_cases c
     INNER JOIN public.church_members m ON m.id = c.member_id
     LEFT JOIN public.church_branch_admins aa ON aa.id = c.assigned_admin_id
     WHERE c.branch_id = $1
     ORDER BY c.created_at DESC`,
    [branchId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} caseId
 * @param {number} branchId
 * @param {object} update
 */
async function updatePastoralCaseForBranch(pool, caseId, branchId, update) {
  const sets = ["updated_at = now()"];
  const params = [];
  let idx = 1;

  for (const [key, col] of [
    ["status", "status"],
    ["assigned_admin_id", "assigned_admin_id"],
    ["due_date", "due_date"],
    ["next_action", "next_action"],
    ["outcome", "outcome"],
    ["closure_reason", "closure_reason"],
  ]) {
    if (update[key] !== undefined) {
      sets.push(`${col} = $${idx}${col === "due_date" ? "::date" : ""}`);
      params.push(update[key]);
      idx += 1;
    }
  }
  if (update.set_closed_at) {
    sets.push("closed_at = now()");
  }
  if (update.closed_by_admin_id !== undefined) {
    sets.push(`closed_by_admin_id = $${idx}`);
    params.push(update.closed_by_admin_id);
    idx += 1;
  }

  params.push(caseId, branchId);
  const r = await pool.query(
    `UPDATE public.church_pastoral_cases
     SET ${sets.join(", ")}
     WHERE id = $${idx} AND branch_id = $${idx + 1}
     RETURNING id`,
    params
  );
  if (!r.rows[0]) return null;
  return findPastoralCaseByIdForBranch(pool, caseId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 */
async function createFollowUp(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_pastoral_case_follow_ups (
       organization_id, branch_id, pastoral_case_id,
       contact_attempt, outcome, next_action, notes, recorded_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.pastoral_case_id,
      fields.contact_attempt,
      fields.outcome || "",
      fields.next_action || "",
      fields.notes || "",
      fields.recorded_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} caseId
 * @param {number} branchId
 */
async function listFollowUpsForCase(pool, caseId, branchId) {
  const r = await pool.query(
    `SELECT f.*, ba.full_name AS recorded_by_name
     FROM public.church_pastoral_case_follow_ups f
     LEFT JOIN public.church_branch_admins ba ON ba.id = f.recorded_by_admin_id
     WHERE f.pastoral_case_id = $1 AND f.branch_id = $2
     ORDER BY f.recorded_at DESC, f.id DESC`,
    [caseId, branchId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 */
async function createSafeguardingIncident(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_safeguarding_incidents (
       organization_id, branch_id, member_id, summary, status,
       assigned_admin_id, reported_by_admin_id
     ) VALUES ($1, $2, $3, $4, 'open', $5, $6)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.member_id ?? null,
      fields.summary,
      fields.assigned_admin_id ?? null,
      fields.reported_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} incidentId
 * @param {number} branchId
 */
async function findSafeguardingIncidentByIdForBranch(pool, incidentId, branchId) {
  const r = await pool.query(
    `SELECT s.*, m.full_name AS member_name, ra.full_name AS reported_by_name
     FROM public.church_safeguarding_incidents s
     LEFT JOIN public.church_members m ON m.id = s.member_id
     LEFT JOIN public.church_branch_admins ra ON ra.id = s.reported_by_admin_id
     WHERE s.id = $1 AND s.branch_id = $2
     LIMIT 1`,
    [incidentId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 */
async function listSafeguardingIncidentsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT s.*, m.full_name AS member_name
     FROM public.church_safeguarding_incidents s
     LEFT JOIN public.church_members m ON m.id = s.member_id
     WHERE s.branch_id = $1
     ORDER BY s.created_at DESC`,
    [branchId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 */
async function createAttachment(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_pastoral_attachments (
       organization_id, branch_id, entity_type, entity_id,
       stored_filename, original_filename, mime_type, visibility, uploaded_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.entity_type,
      fields.entity_id,
      fields.stored_filename,
      fields.original_filename,
      fields.mime_type || "application/octet-stream",
      fields.visibility || "pastoral_only",
      fields.uploaded_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} attachmentId
 * @param {number} branchId
 */
async function findAttachmentByIdForBranch(pool, attachmentId, branchId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_pastoral_attachments
     WHERE id = $1 AND branch_id = $2
     LIMIT 1`,
    [attachmentId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} entityType
 * @param {number} entityId
 * @param {number} branchId
 */
async function listAttachmentsForEntity(pool, entityType, entityId, branchId) {
  const r = await pool.query(
    `SELECT id, original_filename, mime_type, visibility, created_at
     FROM public.church_pastoral_attachments
     WHERE entity_type = $1 AND entity_id = $2 AND branch_id = $3
     ORDER BY created_at DESC`,
    [entityType, entityId, branchId]
  );
  return r.rows;
}

module.exports = {
  createPastoralCase,
  findOpenPastoralCaseForMember,
  findPastoralCaseByIdForBranch,
  listPastoralCasesForBranch,
  updatePastoralCaseForBranch,
  createFollowUp,
  listFollowUpsForCase,
  createSafeguardingIncident,
  findSafeguardingIncidentByIdForBranch,
  listSafeguardingIncidentsForBranch,
  createAttachment,
  findAttachmentByIdForBranch,
  listAttachmentsForEntity,
};
