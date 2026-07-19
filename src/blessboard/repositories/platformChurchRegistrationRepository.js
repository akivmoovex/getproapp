"use strict";

const SELECT_COLUMNS = `
  id, status, church_name, country, city, contact_name, contact_email, contact_phone,
  role_in_church, branch_name, branch_count, selected_plan, message, consent_terms,
  review_notes, source_ip, user_agent, created_at, updated_at
`;

/**
 * @param {import('pg').Pool} pool
 * @param {object} fields
 */
async function createApplication(pool, fields) {
  const r = await pool.query(
    `INSERT INTO blessboard.platform_church_registration_applications (
       status, church_name, country, city, contact_name, contact_email, contact_phone,
       role_in_church, branch_name, branch_count, selected_plan, message, consent_terms,
       source_ip, user_agent
     ) VALUES (
       'pending', $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12,
       $13, $14
     )
     RETURNING ${SELECT_COLUMNS}`,
    [
      fields.church_name,
      fields.country,
      fields.city,
      fields.contact_name,
      fields.contact_email,
      fields.contact_phone,
      fields.role_in_church || null,
      fields.branch_name || null,
      fields.branch_count || null,
      fields.selected_plan || null,
      fields.message || null,
      Boolean(fields.consent_terms),
      fields.source_ip || null,
      fields.user_agent || null,
    ]
  );
  return r.rows[0];
}

/**
 * Recent pending twin used for accidental double-submit idempotency.
 * @param {import('pg').Pool} pool
 * @param {{ contact_email: string, church_name: string, windowMinutes?: number }} opts
 */
async function findRecentPendingDuplicate(pool, opts) {
  const windowMinutes = Math.min(Math.max(Number(opts.windowMinutes) || 15, 1), 60);
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
       FROM blessboard.platform_church_registration_applications
      WHERE status = 'pending'
        AND lower(contact_email) = lower($1)
        AND lower(church_name) = lower($2)
        AND created_at >= now() - ($3::int * interval '1 minute')
      ORDER BY created_at DESC
      LIMIT 1`,
    [opts.contact_email, opts.church_name, windowMinutes]
  );
  return r.rows[0] || null;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ status?: string, limit?: number }} [opts]
 */
async function listApplications(pool, opts = {}) {
  const params = [];
  const clauses = [];
  const status = String(opts.status || "").trim().toLowerCase();
  if (status && status !== "all") {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 200);
  params.push(limit);
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
       FROM blessboard.platform_church_registration_applications
       ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

/**
 * @param {import('pg').Pool} pool
 */
async function countPending(pool) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM blessboard.platform_church_registration_applications
      WHERE status = 'pending'`
  );
  return r.rows[0]?.count || 0;
}

/**
 * Safety helper for tests — count organizations created after a timestamp.
 * @param {import('pg').Pool} pool
 * @param {Date | string} since
 */
async function countOrganizationsCreatedSince(pool, since) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM platform.organizations
      WHERE created_at >= $1`,
    [since]
  );
  return r.rows[0]?.count || 0;
}

module.exports = {
  createApplication,
  findRecentPendingDuplicate,
  listApplications,
  countPending,
  countOrganizationsCreatedSince,
};
