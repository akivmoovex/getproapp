"use strict";

/**
 * V5 tenant public contact submissions (blessboard.public_contact_submissions).
 * All list/find/update queries MUST include church_id and/or organization_id.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SELECT_COLUMNS = `
  id, organization_id, church_id, branch_id, full_name, email, phone, message,
  status, reviewed_by_user_id, created_at, updated_at
`;

function assertUuid(value) {
  return value && UUID_RE.test(String(value));
}

async function createPublicContactSubmission(pool, fields) {
  if (
    !assertUuid(fields.organization_id) ||
    !assertUuid(fields.church_id) ||
    !assertUuid(fields.branch_id)
  ) {
    return null;
  }
  const r = await pool.query(
    `INSERT INTO blessboard.public_contact_submissions (
       organization_id, church_id, branch_id, full_name, email, phone, message, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
     RETURNING ${SELECT_COLUMNS}`,
    [
      fields.organization_id,
      fields.church_id,
      fields.branch_id,
      fields.full_name,
      fields.email || null,
      fields.phone || null,
      fields.message,
    ]
  );
  return r.rows[0] ?? null;
}

async function listPublicContactSubmissionsForBranch(pool, churchId, branchId, opts = {}) {
  if (!assertUuid(churchId) || !assertUuid(branchId)) return [];
  const status = String(opts.status || "all").trim().toLowerCase();
  const params = [churchId, branchId];
  let where = "WHERE church_id = $1 AND branch_id = $2";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 200);
  params.push(limit);
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
       FROM blessboard.public_contact_submissions
       ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

async function listPublicContactSubmissionsForChurch(pool, churchId, organizationId, opts = {}) {
  if (!assertUuid(churchId) || !assertUuid(organizationId)) return [];
  const status = String(opts.status || "all").trim().toLowerCase();
  const params = [churchId, organizationId];
  let where = "WHERE church_id = $1 AND organization_id = $2";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 200);
  params.push(limit);
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
       FROM blessboard.public_contact_submissions
       ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

async function findPublicContactSubmissionForBranch(pool, id, churchId, branchId) {
  if (!assertUuid(id) || !assertUuid(churchId) || !assertUuid(branchId)) return null;
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
       FROM blessboard.public_contact_submissions
      WHERE id = $1 AND church_id = $2 AND branch_id = $3
      LIMIT 1`,
    [id, churchId, branchId]
  );
  return r.rows[0] ?? null;
}

async function findPublicContactSubmissionForChurch(pool, id, churchId, organizationId) {
  if (!assertUuid(id) || !assertUuid(churchId) || !assertUuid(organizationId)) return null;
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
       FROM blessboard.public_contact_submissions
      WHERE id = $1 AND church_id = $2 AND organization_id = $3
      LIMIT 1`,
    [id, churchId, organizationId]
  );
  return r.rows[0] ?? null;
}

async function updatePublicContactSubmissionStatusForBranch(
  pool,
  id,
  churchId,
  branchId,
  update
) {
  if (!assertUuid(id) || !assertUuid(churchId) || !assertUuid(branchId)) return null;
  const r = await pool.query(
    `UPDATE blessboard.public_contact_submissions
        SET status = $1,
            reviewed_by_user_id = $2,
            updated_at = now()
      WHERE id = $3 AND church_id = $4 AND branch_id = $5
      RETURNING ${SELECT_COLUMNS}`,
    [update.status, update.reviewed_by_user_id || null, id, churchId, branchId]
  );
  return r.rows[0] ?? null;
}

async function updatePublicContactSubmissionStatusForChurch(
  pool,
  id,
  churchId,
  organizationId,
  update
) {
  if (!assertUuid(id) || !assertUuid(churchId) || !assertUuid(organizationId)) return null;
  const r = await pool.query(
    `UPDATE blessboard.public_contact_submissions
        SET status = $1,
            reviewed_by_user_id = $2,
            updated_at = now()
      WHERE id = $3 AND church_id = $4 AND organization_id = $5
      RETURNING ${SELECT_COLUMNS}`,
    [update.status, update.reviewed_by_user_id || null, id, churchId, organizationId]
  );
  return r.rows[0] ?? null;
}

async function countNewPublicContactSubmissionsForBranch(pool, churchId, branchId) {
  if (!assertUuid(churchId) || !assertUuid(branchId)) return 0;
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM blessboard.public_contact_submissions
      WHERE church_id = $1 AND branch_id = $2 AND status = 'new'`,
    [churchId, branchId]
  );
  return r.rows[0]?.count || 0;
}

async function countNewPublicContactSubmissionsForChurch(pool, churchId, organizationId) {
  if (!assertUuid(churchId) || !assertUuid(organizationId)) return 0;
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM blessboard.public_contact_submissions
      WHERE church_id = $1 AND organization_id = $2 AND status = 'new'`,
    [churchId, organizationId]
  );
  return r.rows[0]?.count || 0;
}

module.exports = {
  createPublicContactSubmission,
  listPublicContactSubmissionsForBranch,
  listPublicContactSubmissionsForChurch,
  findPublicContactSubmissionForBranch,
  findPublicContactSubmissionForChurch,
  updatePublicContactSubmissionStatusForBranch,
  updatePublicContactSubmissionStatusForChurch,
  countNewPublicContactSubmissionsForBranch,
  countNewPublicContactSubmissionsForChurch,
};
