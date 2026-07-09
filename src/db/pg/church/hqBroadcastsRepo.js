"use strict";

const BROADCAST_SELECT = `
  SELECT b.*,
         ca.full_name AS created_by_hq_admin_name,
         ua.full_name AS updated_by_hq_admin_name,
         (SELECT COUNT(*)::int
          FROM public.church_hq_broadcast_targets t
          WHERE t.broadcast_id = b.id) AS target_branch_count
  FROM public.church_hq_broadcasts b
  LEFT JOIN public.church_hq_admins ca ON ca.id = b.created_by_hq_admin_id
  LEFT JOIN public.church_hq_admins ua ON ua.id = b.updated_by_hq_admin_id
`;

function visibleBroadcastWhere(alias = "b") {
  return `
    ${alias}.status = 'published'
    AND (${alias}.publish_at IS NULL OR ${alias}.publish_at <= now())
    AND (${alias}.expires_at IS NULL OR ${alias}.expires_at > now())
  `;
}

function mapBroadcastForFeed(row) {
  if (!row) return row;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    audience: row.audience,
    publish_at: row.publish_at,
    expires_at: row.expires_at,
    source: "hq",
    source_label: "HQ",
  };
}

async function findBroadcastByIdForOrganization(pool, broadcastId, organizationId) {
  const r = await pool.query(
    `${BROADCAST_SELECT}
     WHERE b.id = $1 AND b.organization_id = $2
     LIMIT 1`,
    [broadcastId, organizationId]
  );
  return r.rows[0] ?? null;
}

async function listBroadcastsForOrganization(pool, organizationId, opts = {}) {
  const status = String(opts.status || "").trim();
  const params = [organizationId];
  let where = "WHERE b.organization_id = $1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND b.status = $${params.length}`;
  }
  const r = await pool.query(
    `${BROADCAST_SELECT}
     ${where}
     ORDER BY COALESCE(b.publish_at, b.created_at) DESC NULLS LAST, b.id DESC`,
    params
  );
  return r.rows;
}

async function listBroadcastTargets(pool, broadcastId, organizationId) {
  const r = await pool.query(
    `SELECT t.*, br.name AS branch_name, br.slug AS branch_slug
     FROM public.church_hq_broadcast_targets t
     INNER JOIN public.church_branches br ON br.id = t.branch_id
     WHERE t.broadcast_id = $1 AND t.organization_id = $2
     ORDER BY br.name ASC, t.id ASC`,
    [broadcastId, organizationId]
  );
  return r.rows;
}

async function validateBranchIdsForOrganization(pool, organizationId, branchIds) {
  if (!branchIds || branchIds.length === 0) return [];
  const r = await pool.query(
    `SELECT id FROM public.church_branches
     WHERE organization_id = $1 AND id = ANY($2::bigint[])`,
    [organizationId, branchIds]
  );
  const valid = new Set(r.rows.map((row) => Number(row.id)));
  return branchIds.filter((id) => valid.has(Number(id)));
}

async function setBroadcastTargets(pool, broadcastId, organizationId, branchIds) {
  await pool.query(
    `DELETE FROM public.church_hq_broadcast_targets
     WHERE broadcast_id = $1 AND organization_id = $2`,
    [broadcastId, organizationId]
  );
  if (!branchIds || branchIds.length === 0) return [];
  const validIds = await validateBranchIdsForOrganization(pool, organizationId, branchIds);
  for (const branchId of validIds) {
    await pool.query(
      `INSERT INTO public.church_hq_broadcast_targets (organization_id, broadcast_id, branch_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (broadcast_id, branch_id) DO NOTHING`,
      [organizationId, broadcastId, branchId]
    );
  }
  return validIds;
}

async function createBroadcastForOrganization(pool, organizationId, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_hq_broadcasts (
       organization_id, title, body, category, audience, target_scope,
       status, publish_at, expires_at,
       created_by_hq_admin_id, updated_by_hq_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     RETURNING id`,
    [
      organizationId,
      fields.title,
      fields.body || "",
      fields.category || "General",
      fields.audience || "members",
      fields.target_scope || "all_branches",
      fields.status || "draft",
      fields.publish_at || null,
      fields.expires_at || null,
      fields.created_by_hq_admin_id || null,
    ]
  );
  const broadcastId = r.rows[0].id;
  if (fields.target_scope === "selected_branches" && fields.branch_ids && fields.branch_ids.length > 0) {
    await setBroadcastTargets(pool, broadcastId, organizationId, fields.branch_ids);
  }
  return findBroadcastByIdForOrganization(pool, broadcastId, organizationId);
}

async function updateBroadcastForOrganization(pool, broadcastId, organizationId, update) {
  const r = await pool.query(
    `UPDATE public.church_hq_broadcasts
     SET title = $1,
         body = $2,
         category = $3,
         audience = $4,
         target_scope = $5,
         publish_at = $6,
         expires_at = $7,
         updated_by_hq_admin_id = $8,
         updated_at = now()
     WHERE id = $9 AND organization_id = $10 AND status IN ('draft', 'published')
     RETURNING id`,
    [
      update.title,
      update.body,
      update.category,
      update.audience,
      update.target_scope,
      update.publish_at || null,
      update.expires_at || null,
      update.updated_by_hq_admin_id || null,
      broadcastId,
      organizationId,
    ]
  );
  if (!r.rows[0]) return null;

  if (update.target_scope === "all_branches") {
    await pool.query(
      `DELETE FROM public.church_hq_broadcast_targets
       WHERE broadcast_id = $1 AND organization_id = $2`,
      [broadcastId, organizationId]
    );
  } else if (update.branch_ids) {
    await setBroadcastTargets(pool, broadcastId, organizationId, update.branch_ids);
  }

  return findBroadcastByIdForOrganization(pool, broadcastId, organizationId);
}

async function publishBroadcastForOrganization(pool, broadcastId, organizationId, update) {
  const publishAt = update.publish_at || new Date();
  const r = await pool.query(
    `UPDATE public.church_hq_broadcasts
     SET status = 'published',
         publish_at = $1,
         updated_by_hq_admin_id = $2,
         updated_at = now()
     WHERE id = $3 AND organization_id = $4 AND status IN ('draft', 'published')
     RETURNING id`,
    [publishAt, update.updated_by_hq_admin_id || null, broadcastId, organizationId]
  );
  if (!r.rows[0]) return null;
  return findBroadcastByIdForOrganization(pool, broadcastId, organizationId);
}

async function archiveBroadcastForOrganization(pool, broadcastId, organizationId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_hq_broadcasts
     SET status = 'archived',
         updated_by_hq_admin_id = $1,
         updated_at = now()
     WHERE id = $2 AND organization_id = $3 AND status IN ('draft', 'published')
     RETURNING id`,
    [adminId, broadcastId, organizationId]
  );
  if (!r.rows[0]) return null;
  return findBroadcastByIdForOrganization(pool, broadcastId, organizationId);
}

async function countBroadcastsByStatusForOrganization(pool, organizationId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_hq_broadcasts
     WHERE organization_id = $1
     GROUP BY status`,
    [organizationId]
  );
  const out = { draft: 0, published: 0, archived: 0 };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(out, row.status)) {
      out[row.status] = row.count;
    }
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {number} branchId
 * @param {{ audiences: string[], limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listVisibleBroadcastsForBranch(pool, organizationId, branchId, opts = {}) {
  const audiences = opts.audiences || [];
  if (!audiences.length) return [];
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);
  const r = await pool.query(
    `${BROADCAST_SELECT}
     WHERE b.organization_id = $1
       AND ${visibleBroadcastWhere("b")}
       AND b.audience = ANY($2::text[])
       AND (
         b.target_scope = 'all_branches'
         OR EXISTS (
           SELECT 1 FROM public.church_hq_broadcast_targets t
           WHERE t.broadcast_id = b.id AND t.branch_id = $3
         )
       )
     ORDER BY COALESCE(b.publish_at, b.created_at) DESC NULLS LAST
     LIMIT $4`,
    [organizationId, audiences, branchId, limit]
  );
  return r.rows.map(mapBroadcastForFeed);
}

module.exports = {
  createBroadcastForOrganization,
  updateBroadcastForOrganization,
  listBroadcastsForOrganization,
  findBroadcastByIdForOrganization,
  publishBroadcastForOrganization,
  archiveBroadcastForOrganization,
  setBroadcastTargets,
  listBroadcastTargets,
  listVisibleBroadcastsForBranch,
  countBroadcastsByStatusForOrganization,
  validateBranchIdsForOrganization,
};
