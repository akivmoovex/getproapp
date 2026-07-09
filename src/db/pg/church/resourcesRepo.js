"use strict";

const RESOURCE_SELECT = `
  SELECT r.*
  FROM public.church_resources r
`;

function resourceIcon(type) {
  if (type === "form") return "description";
  if (type === "document") return "article";
  return "menu_book";
}

function mapPublicResource(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    resource_type: row.resource_type,
    file_url: row.file_url,
    external_url: row.external_url,
    icon: resourceIcon(row.resource_type),
    meta: row.description || (row.file_url ? "Download" : "Available soon"),
  };
}

async function createResourceForBranch(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_resources (
       organization_id, branch_id, title, description, resource_type,
       file_url, external_url, visibility, status, sort_order,
       created_by_admin_id, updated_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     RETURNING id`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.title,
      fields.description || "",
      fields.resource_type || "study",
      fields.file_url || null,
      fields.external_url || null,
      fields.visibility || "members",
      fields.status || "draft",
      fields.sort_order || 0,
      fields.created_by_admin_id || null,
    ]
  );
  return findResourceByIdForBranch(pool, r.rows[0].id, fields.branch_id);
}

async function findResourceByIdForBranch(pool, resourceId, branchId) {
  const r = await pool.query(
    `${RESOURCE_SELECT} WHERE r.id = $1 AND r.branch_id = $2 LIMIT 1`,
    [resourceId, branchId]
  );
  return r.rows[0] ?? null;
}

async function listResourcesForBranch(pool, branchId, opts = {}) {
  const status = String(opts.status || "").trim();
  const resourceType = String(opts.resource_type || "").trim();
  const params = [branchId];
  let where = "WHERE r.branch_id = $1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND r.status = $${params.length}`;
  }
  if (resourceType && resourceType !== "all") {
    params.push(resourceType);
    where += ` AND r.resource_type = $${params.length}`;
  }
  const r = await pool.query(
    `${RESOURCE_SELECT} ${where}
     ORDER BY r.sort_order ASC, r.id DESC`,
    params
  );
  return r.rows;
}

async function listPublishedResourcesForBranch(pool, branchId, opts = {}) {
  const resourceType = String(opts.resource_type || "").trim();
  const visibility = String(opts.visibility || "").trim();
  const params = [branchId];
  let where = "WHERE r.branch_id = $1 AND r.status = 'published'";
  if (resourceType && resourceType !== "all") {
    params.push(resourceType);
    where += ` AND r.resource_type = $${params.length}`;
  }
  if (visibility) {
    params.push(visibility);
    where += ` AND r.visibility = $${params.length}`;
  }
  const r = await pool.query(
    `${RESOURCE_SELECT} ${where}
     ORDER BY r.sort_order ASC, r.id DESC`,
    params
  );
  return r.rows.map(mapPublicResource);
}

async function updateResourceForBranch(pool, resourceId, branchId, update) {
  const r = await pool.query(
    `UPDATE public.church_resources
     SET title = $1,
         description = $2,
         resource_type = $3,
         file_url = $4,
         external_url = $5,
         visibility = $6,
         status = $7,
         sort_order = $8,
         updated_by_admin_id = $9,
         updated_at = now()
     WHERE id = $10 AND branch_id = $11
     RETURNING id`,
    [
      update.title,
      update.description || "",
      update.resource_type || "study",
      update.file_url || null,
      update.external_url || null,
      update.visibility || "members",
      update.status || "draft",
      update.sort_order || 0,
      update.updated_by_admin_id || null,
      resourceId,
      branchId,
    ]
  );
  if (!r.rows[0]) return null;
  return findResourceByIdForBranch(pool, resourceId, branchId);
}

async function publishResourceForBranch(pool, resourceId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_resources
     SET status = 'published', updated_by_admin_id = $1, updated_at = now()
     WHERE id = $2 AND branch_id = $3
     RETURNING id`,
    [adminId, resourceId, branchId]
  );
  if (!r.rows[0]) return null;
  return findResourceByIdForBranch(pool, resourceId, branchId);
}

async function countResourcesForBranch(pool, branchId, opts = {}) {
  const resourceType = String(opts.resource_type || "").trim();
  const params = [branchId];
  let where = "WHERE branch_id = $1";
  if (resourceType) {
    params.push(resourceType);
    where += ` AND resource_type = $${params.length}`;
  }
  const r = await pool.query(`SELECT COUNT(*)::int AS count FROM public.church_resources ${where}`, params);
  return r.rows[0]?.count || 0;
}

module.exports = {
  createResourceForBranch,
  findResourceByIdForBranch,
  listResourcesForBranch,
  listPublishedResourcesForBranch,
  updateResourceForBranch,
  publishResourceForBranch,
  countResourcesForBranch,
  mapPublicResource,
};
