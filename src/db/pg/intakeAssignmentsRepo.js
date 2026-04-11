"use strict";

const PENDING_RESPONSE_STATUSES = ["allocated", "viewed", "pending"];

function serializeAssignmentRow(row) {
  if (!row) return row;
  const o = { ...row };
  for (const k of ["created_at", "updated_at", "responded_at", "response_deadline_at"]) {
    if (o[k] instanceof Date) o[k] = o[k].toISOString().replace("T", " ").slice(0, 19);
  }
  return o;
}

async function listCompanyIdsByProject(pool, tenantId, projectId) {
  const r = await pool.query(
    `SELECT company_id FROM public.intake_project_assignments WHERE tenant_id = $1 AND project_id = $2`,
    [tenantId, projectId]
  );
  return r.rows.map((x) => Number(x.company_id));
}

async function countPositiveResponses(pool, tenantId, projectId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.intake_project_assignments
     WHERE tenant_id = $1 AND project_id = $2 AND lower(trim(status)) IN ('interested','callback_requested')`,
    [tenantId, projectId]
  );
  return Math.max(0, Math.floor(Number(r.rows[0].c) || 0));
}

async function insertAllocated(pool, p) {
  await pool.query(
    `INSERT INTO public.intake_project_assignments (
      tenant_id, project_id, company_id, assigned_by_admin_user_id, status,
      response_deadline_at, allocation_source, allocation_wave, updated_at
    ) VALUES ($1, $2, $3, $4, 'allocated', $5, $6, $7, now())`,
    [
      p.tenantId,
      p.projectId,
      p.companyId,
      p.assignedByAdminUserId,
      p.responseDeadlineAt,
      p.allocationSource,
      p.allocationWave,
    ]
  );
}

async function insertPendingManual(pool, p) {
  await pool.query(
    `INSERT INTO public.intake_project_assignments (
      tenant_id, project_id, company_id, assigned_by_admin_user_id, status,
      response_deadline_at, allocation_source, allocation_wave, updated_at
    ) VALUES ($1, $2, $3, $4, 'pending', $5, 'manual', 0, now())`,
    [p.tenantId, p.projectId, p.companyId, p.adminUserId, p.responseDeadlineAt]
  );
}

async function listOverduePendingAssignments(pool, tenantId, projectId) {
  const r = await pool.query(
    `SELECT id FROM public.intake_project_assignments
     WHERE tenant_id = $1 AND project_id = $2
       AND lower(trim(status)) IN ('allocated', 'viewed', 'pending')
       AND response_deadline_at IS NOT NULL
       AND response_deadline_at <= now()`,
    [tenantId, projectId]
  );
  return r.rows;
}

async function markTimedOut(pool, assignmentId, tenantId) {
  await pool.query(
    `UPDATE public.intake_project_assignments SET status = 'timed_out', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
    [assignmentId, tenantId]
  );
}

async function getProjectIdAndCategoryForAssignment(pool, assignmentId, tenantId) {
  const r = await pool.query(
    `SELECT a.project_id, p.intake_category_id
     FROM public.intake_project_assignments a
     INNER JOIN public.intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
     WHERE a.id = $1 AND a.tenant_id = $2`,
    [assignmentId, tenantId]
  );
  return r.rows[0] ?? null;
}

async function markViewedIfAllocated(pool, tenantId, companyId, assignmentId) {
  await pool.query(
    `UPDATE public.intake_project_assignments SET status = 'viewed', updated_at = now()
     WHERE id = $1 AND tenant_id = $2 AND company_id = $3 AND lower(trim(status)) = 'allocated'`,
    [assignmentId, tenantId, companyId]
  );
}

async function getByIdProjectTenant(pool, assignmentId, tenantId, projectId) {
  const r = await pool.query(
    `SELECT id FROM public.intake_project_assignments WHERE id = $1 AND tenant_id = $2 AND project_id = $3`,
    [assignmentId, tenantId, projectId]
  );
  return r.rows[0] ?? null;
}

async function deleteById(pool, assignmentId, tenantId) {
  await pool.query(`DELETE FROM public.intake_project_assignments WHERE id = $1 AND tenant_id = $2`, [
    assignmentId,
    tenantId,
  ]);
}

async function listDetailForProject(pool, projectId, tenantId) {
  const r = await pool.query(
    `SELECT a.id, a.company_id, a.status, a.created_at, a.responded_at, a.response_note,
        a.response_deadline_at, a.allocation_source, a.allocation_wave,
        c.name AS company_name, c.subdomain AS company_subdomain
     FROM public.intake_project_assignments a
     INNER JOIN public.companies c ON c.id = a.company_id AND c.tenant_id = a.tenant_id
     WHERE a.project_id = $1 AND a.tenant_id = $2
     ORDER BY a.created_at DESC`,
    [projectId, tenantId]
  );
  return r.rows.map(serializeAssignmentRow);
}

async function countByProjectAndAllocationSource(pool, tenantId, projectId, allocationSource) {
  const src = String(allocationSource || "").trim();
  if (!src) return 0;
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.intake_project_assignments
     WHERE tenant_id = $1 AND project_id = $2 AND lower(trim(allocation_source)) = lower(trim($3))`,
    [tenantId, projectId, src]
  );
  return Math.max(0, Number(r.rows[0].c) || 0);
}

module.exports = {
  PENDING_RESPONSE_STATUSES,
  listCompanyIdsByProject,
  countPositiveResponses,
  insertAllocated,
  insertPendingManual,
  listOverduePendingAssignments,
  markTimedOut,
  getProjectIdAndCategoryForAssignment,
  markViewedIfAllocated,
  getByIdProjectTenant,
  deleteById,
  listDetailForProject,
  countByProjectAndAllocationSource,
};
