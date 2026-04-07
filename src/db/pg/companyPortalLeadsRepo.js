"use strict";

const {
  COMPANY_PORTAL_ASSIGNMENT_LIST_SELECT,
  COMPANY_PORTAL_ACTIVE_ASSIGNMENT_STATUSES,
} = require("../../intake/intakeProjectCompanyViewModel");

/**
 * Normalize timestamps for EJS / mappers (parity with SQLite text datetimes).
 * @param {Record<string, unknown>|null|undefined} row
 */
function serializePortalAssignmentRow(row) {
  if (!row) return row;
  const o = { ...row };
  for (const k of ["assigned_at", "assignment_responded_at", "project_created_at", "project_updated_at"]) {
    if (o[k] instanceof Date) o[k] = o[k].toISOString().replace("T", " ").slice(0, 19);
  }
  return o;
}

const BASE_FROM = `
  FROM public.intake_project_assignments a
  INNER JOIN public.intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
  WHERE a.tenant_id = $1 AND a.company_id = $2 AND lower(trim(p.status)) = 'published'
`;

/**
 * @param {"active" | "declined"} mode
 */
async function listAssignmentsForPortal(pool, tenantId, companyId, mode) {
  let filterSql;
  const params = [tenantId, companyId];
  if (mode === "active") {
    params.push(COMPANY_PORTAL_ACTIVE_ASSIGNMENT_STATUSES);
    filterSql = ` AND a.status = ANY($3::text[])`;
  } else {
    filterSql = ` AND lower(trim(a.status)) IN ('declined', 'timed_out', 'expired')`;
  }
  const sql = `
    SELECT ${COMPANY_PORTAL_ASSIGNMENT_LIST_SELECT}
    ${BASE_FROM}
    ${filterSql}
    ORDER BY a.created_at DESC, a.id DESC
  `;
  const r = await pool.query(sql, params);
  return r.rows.map(serializePortalAssignmentRow);
}

/**
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function getDetailForPortal(pool, assignmentId, tenantId, companyId) {
  const sql = `
    SELECT ${COMPANY_PORTAL_ASSIGNMENT_LIST_SELECT}
    ${BASE_FROM}
      AND a.id = $3
    LIMIT 1
  `;
  const r = await pool.query(sql, [tenantId, companyId, assignmentId]);
  const row = r.rows[0];
  return row ? serializePortalAssignmentRow(row) : null;
}

/**
 * Minimal row for POST /leads/:id/action (status transition gate).
 */
async function getIdAndStatusForCompanyAction(pool, assignmentId, tenantId, companyId) {
  const r = await pool.query(
    `SELECT a.id, a.status
     FROM public.intake_project_assignments a
     INNER JOIN public.intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
     WHERE a.id = $1 AND a.tenant_id = $2 AND a.company_id = $3 AND lower(trim(p.status)) = 'published'`,
    [assignmentId, tenantId, companyId]
  );
  return r.rows[0] ?? null;
}

/**
 * Provider updates assignment after validated action (same fields as SQLite UPDATE).
 */
async function updateStatusFromCompanyUser(pool, p) {
  await pool.query(
    `UPDATE public.intake_project_assignments SET
      status = $1,
      responded_at = now(),
      response_note = $2,
      updated_by_company_user_id = $3,
      updated_at = now()
     WHERE id = $4 AND tenant_id = $5 AND company_id = $6`,
    [p.nextStatus, p.note, p.companyUserId, p.assignmentId, p.tenantId, p.companyId]
  );
}

/**
 * True when the company has an "active" workflow assignment on a published project (image gate).
 */
async function hasActiveAssignmentForProjectImages(pool, tenantId, companyId, projectId) {
  const r = await pool.query(
    `SELECT 1 AS x
     FROM public.intake_project_assignments a
     INNER JOIN public.intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
     WHERE a.tenant_id = $1 AND a.company_id = $2 AND a.project_id = $3
       AND a.status = ANY($4::text[])
       AND lower(trim(p.status)) = 'published'
     LIMIT 1`,
    [tenantId, companyId, projectId, COMPANY_PORTAL_ACTIVE_ASSIGNMENT_STATUSES]
  );
  return r.rows.length > 0;
}

module.exports = {
  listAssignmentsForPortal,
  getDetailForPortal,
  getIdAndStatusForCompanyAction,
  updateStatusFromCompanyUser,
  hasActiveAssignmentForProjectImages,
};
