"use strict";

async function insertImage(pool, tenantId, projectId, imagePath, sortOrder) {
  await pool.query(
    `INSERT INTO public.intake_project_images (tenant_id, project_id, image_path, sort_order) VALUES ($1, $2, $3, $4)`,
    [tenantId, projectId, imagePath, sortOrder]
  );
}

async function countByProject(pool, tenantId, projectId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.intake_project_images WHERE tenant_id = $1 AND project_id = $2`,
    [tenantId, projectId]
  );
  return r.rows[0].c;
}

async function getByIdAndTenant(pool, id, tenantId) {
  const r = await pool.query(`SELECT * FROM public.intake_project_images WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return r.rows[0] ?? null;
}

async function listByProject(pool, tenantId, projectId) {
  const r = await pool.query(
    `SELECT id, image_path, sort_order FROM public.intake_project_images WHERE tenant_id = $1 AND project_id = $2 ORDER BY sort_order ASC, id ASC`,
    [tenantId, projectId]
  );
  return r.rows;
}

module.exports = {
  insertImage,
  countByProject,
  getByIdAndTenant,
  listByProject,
};
