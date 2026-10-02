"use strict";

async function insertSavedFilter(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_saved_report_filters (
       organization_id, branch_id, surface, name, filters_json,
       created_by_actor_type, created_by_actor_id
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id || null,
      fields.surface,
      fields.name,
      JSON.stringify(fields.filters_json || {}),
      fields.created_by_actor_type,
      fields.created_by_actor_id || null,
    ]
  );
  return r.rows[0];
}

async function listSavedFiltersForOrg(pool, organizationId, opts = {}) {
  const params = [organizationId];
  let sql = `
    SELECT * FROM public.church_saved_report_filters
    WHERE organization_id = $1
  `;
  if (opts.surface) {
    params.push(opts.surface);
    sql += ` AND surface = $${params.length}`;
  }
  if (opts.branchId) {
    params.push(opts.branchId);
    sql += ` AND (branch_id IS NULL OR branch_id = $${params.length})`;
  }
  sql += ` ORDER BY updated_at DESC, id DESC LIMIT ${Number(opts.limit) > 0 ? Math.min(Number(opts.limit), 100) : 50}`;
  const r = await pool.query(sql, params);
  return r.rows;
}

async function findSavedFilterByIdForOrg(pool, filterId, organizationId) {
  const r = await pool.query(
    `SELECT * FROM public.church_saved_report_filters
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [filterId, organizationId]
  );
  return r.rows[0] || null;
}

async function deleteSavedFilterForOrg(pool, filterId, organizationId) {
  const r = await pool.query(
    `DELETE FROM public.church_saved_report_filters
     WHERE id = $1 AND organization_id = $2
     RETURNING id`,
    [filterId, organizationId]
  );
  return Boolean(r.rows[0]);
}

module.exports = {
  insertSavedFilter,
  listSavedFiltersForOrg,
  findSavedFilterByIdForOrg,
  deleteSavedFilterForOrg,
};
