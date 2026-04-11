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

/** Published or closed (read-only detail + reviews for completed work). */
const BASE_FROM_DETAIL = `
  FROM public.intake_project_assignments a
  INNER JOIN public.intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
  WHERE a.tenant_id = $1 AND a.company_id = $2 AND lower(trim(p.status)) IN ('published', 'closed')
`;

/**
 * @param {"active" | "declined" | "completed"} mode
 */
async function listAssignmentsForPortal(pool, tenantId, companyId, mode) {
  let filterSql;
  const params = [tenantId, companyId];
  if (mode === "completed") {
    const sql = `
      SELECT ${COMPANY_PORTAL_ASSIGNMENT_LIST_SELECT}
      FROM public.intake_project_assignments a
      INNER JOIN public.intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
      WHERE a.tenant_id = $1 AND a.company_id = $2
        AND lower(trim(p.status)) = 'closed'
        AND lower(trim(a.status)) = 'interested'
      ORDER BY a.responded_at DESC NULLS LAST, a.id DESC
    `;
    const r = await pool.query(sql, params);
    return r.rows.map(serializePortalAssignmentRow);
  }
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
    ${BASE_FROM_DETAIL}
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
       AND (
         (a.status = ANY($4::text[]) AND lower(trim(p.status)) = 'published')
         OR (lower(trim(p.status)) = 'closed' AND lower(trim(a.status)) = 'interested')
       )
     LIMIT 1`,
    [tenantId, companyId, projectId, COMPANY_PORTAL_ACTIVE_ASSIGNMENT_STATUSES]
  );
  return r.rows.length > 0;
}

/**
 * Accepted (interested) deals with client contact — scoped query; not used for generic lead cards.
 * @returns {Promise<Array<{ project_code: string, responded_at: string | null, client_name: string, client_phone: string }>>}
 */
/**
 * Worst-case deal fee among this company’s active workflow rows on published projects (credit gate on list views).
 */
async function getMaxDealPriceForCompanyPublishedActiveAssignments(pool, tenantId, companyId) {
  const r = await pool.query(
    `SELECT COALESCE(MAX(p.deal_price::double precision), 0) AS m
     FROM public.intake_project_assignments a
     INNER JOIN public.intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
     WHERE a.tenant_id = $1 AND a.company_id = $2
       AND lower(trim(p.status)) = 'published'
       AND a.status = ANY($3::text[])`,
    [tenantId, companyId, COMPANY_PORTAL_ACTIVE_ASSIGNMENT_STATUSES]
  );
  const m = r.rows[0] && r.rows[0].m;
  return m != null && Number.isFinite(Number(m)) ? Number(m) : 0;
}

/**
 * @returns {Promise<number|null>}
 */
async function getPublishedDealPriceForCompanyAssignment(pool, assignmentId, tenantId, companyId) {
  const r = await pool.query(
    `SELECT p.deal_price
     FROM public.intake_project_assignments a
     INNER JOIN public.intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
     WHERE a.id = $1 AND a.tenant_id = $2 AND a.company_id = $3
       AND lower(trim(p.status)) = 'published'
     LIMIT 1`,
    [assignmentId, tenantId, companyId]
  );
  const v = r.rows[0] && r.rows[0].deal_price;
  return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
}

async function listAcceptedDealsWithClientContact(pool, tenantId, companyId) {
  const r = await pool.query(
    `
    SELECT
      p.project_code,
      a.responded_at,
      COALESCE(NULLIF(trim(c.full_name), ''), NULLIF(trim(p.client_full_name_snapshot), ''), '') AS client_name,
      COALESCE(NULLIF(trim(c.phone), ''), NULLIF(trim(p.client_phone_snapshot), ''), '') AS client_phone
    FROM public.intake_project_assignments a
    INNER JOIN public.intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
    INNER JOIN public.intake_clients c ON c.id = p.client_id AND c.tenant_id = p.tenant_id
    WHERE a.tenant_id = $1 AND a.company_id = $2
      AND lower(trim(a.status)) = 'interested'
      AND lower(trim(p.status)) IN ('published', 'closed')
    ORDER BY a.responded_at DESC NULLS LAST, a.id DESC
    `,
    [tenantId, companyId]
  );
  return (r.rows || []).map((row) => {
    const o = { ...row };
    if (o.responded_at instanceof Date) {
      o.responded_at = o.responded_at.toISOString().replace("T", " ").slice(0, 19);
    }
    return o;
  });
}

module.exports = {
  listAssignmentsForPortal,
  getDetailForPortal,
  getIdAndStatusForCompanyAction,
  updateStatusFromCompanyUser,
  hasActiveAssignmentForProjectImages,
  getMaxDealPriceForCompanyPublishedActiveAssignments,
  getPublishedDealPriceForCompanyAssignment,
  listAcceptedDealsWithClientContact,
};
