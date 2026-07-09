"use strict";

const SELECT_COLUMNS = `
  id, organization_id, branch_id, full_name, email, phone, message,
  status, reviewed_by_admin_id, created_at, updated_at
`;

async function createContactSubmissionForBranch(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_public_contact_submissions (
       organization_id, branch_id, full_name, email, phone, message, status
     ) VALUES ($1, $2, $3, $4, $5, $6, 'new')
     RETURNING ${SELECT_COLUMNS}`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.full_name,
      fields.email || null,
      fields.phone || null,
      fields.message,
    ]
  );
  return r.rows[0];
}

async function listContactSubmissionsForBranch(pool, branchId, opts = {}) {
  const status = String(opts.status || "all").trim().toLowerCase();
  const params = [branchId];
  let where = "WHERE branch_id = $1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 200);
  params.push(limit);
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
     FROM public.church_public_contact_submissions
     ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

async function findContactSubmissionByIdForBranch(pool, submissionId, branchId) {
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
     FROM public.church_public_contact_submissions
     WHERE id = $1 AND branch_id = $2
     LIMIT 1`,
    [submissionId, branchId]
  );
  return r.rows[0] ?? null;
}

async function updateContactSubmissionStatusForBranch(pool, submissionId, branchId, update) {
  const r = await pool.query(
    `UPDATE public.church_public_contact_submissions
     SET status = $1,
         reviewed_by_admin_id = $2,
         updated_at = now()
     WHERE id = $3 AND branch_id = $4
     RETURNING ${SELECT_COLUMNS}`,
    [update.status, update.reviewed_by_admin_id || null, submissionId, branchId]
  );
  return r.rows[0] ?? null;
}

async function countNewContactSubmissionsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_public_contact_submissions
     WHERE branch_id = $1 AND status = 'new'`,
    [branchId]
  );
  return r.rows[0]?.count || 0;
}

module.exports = {
  createContactSubmissionForBranch,
  listContactSubmissionsForBranch,
  findContactSubmissionByIdForBranch,
  updateContactSubmissionStatusForBranch,
  countNewContactSubmissionsForBranch,
};
