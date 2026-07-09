"use strict";

const ANNOUNCEMENT_SELECT = `
  SELECT a.*,
         COALESCE(a.publish_at, a.published_at) AS effective_publish_at,
         ca.full_name AS created_by_admin_name,
         ua.full_name AS updated_by_admin_name
  FROM public.church_announcements a
  LEFT JOIN public.church_branch_admins ca ON ca.id = a.created_by_admin_id
  LEFT JOIN public.church_branch_admins ua ON ua.id = a.updated_by_admin_id
`;

function mapAnnouncementRow(row) {
  if (!row) return row;
  return {
    ...row,
    publish_at: row.effective_publish_at || row.publish_at || row.published_at,
  };
}

const MEMBER_AUDIENCES = ["public", "members", "leaders"];

function visibleAnnouncementWhere(alias = "a") {
  return `
    ${alias}.status = 'published'
    AND (COALESCE(${alias}.publish_at, ${alias}.published_at) IS NULL OR COALESCE(${alias}.publish_at, ${alias}.published_at) <= now())
    AND (${alias}.expires_at IS NULL OR ${alias}.expires_at > now())
  `;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createAnnouncementForBranch(pool, fields) {
  const publishAt = fields.status === "published" ? fields.publish_at || new Date() : fields.publish_at || null;
  const r = await pool.query(
    `INSERT INTO public.church_announcements (
       organization_id, branch_id, title, body, category, audience, source_type,
       status, publish_at, published_at, expires_at,
       created_by_admin_id, updated_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $11)
     RETURNING id`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.title,
      fields.body || "",
      fields.category || "General",
      fields.audience || "members",
      fields.source_type || "branch",
      fields.status || "draft",
      publishAt,
      fields.expires_at || null,
      fields.created_by_admin_id || null,
    ]
  );
  return findAnnouncementByIdForBranch(pool, r.rows[0].id, fields.branch_id);
}

/** @deprecated use createAnnouncementForBranch */
async function createAnnouncement(pool, fields) {
  return createAnnouncementForBranch(pool, {
    ...fields,
    source_type: "branch",
    category: "General",
    audience: "members",
    created_by_admin_id: null,
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ status?: string }} opts
 * @returns {Promise<object[]>}
 */
async function listAnnouncementsForBranch(pool, branchId, opts = {}) {
  const status = String(opts.status || "").trim();
  const params = [branchId];
  let where = "WHERE a.branch_id = $1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND a.status = $${params.length}`;
  }
  const r = await pool.query(
    `${ANNOUNCEMENT_SELECT}
     ${where}
     ORDER BY COALESCE(a.publish_at, a.published_at, a.created_at) DESC NULLS LAST, a.id DESC`,
    params
  );
  return r.rows.map(mapAnnouncementRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} announcementId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findAnnouncementByIdForBranch(pool, announcementId, branchId) {
  const r = await pool.query(
    `${ANNOUNCEMENT_SELECT}
     WHERE a.id = $1 AND a.branch_id = $2
     LIMIT 1`,
    [announcementId, branchId]
  );
  return mapAnnouncementRow(r.rows[0] ?? null);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} announcementId
 * @param {number} branchId
 * @param {object} update
 * @returns {Promise<object | null>}
 */
async function updateAnnouncementForBranch(pool, announcementId, branchId, update) {
  const r = await pool.query(
    `UPDATE public.church_announcements
     SET title = $1,
         body = $2,
         category = $3,
         audience = $4,
         publish_at = $5,
         published_at = $5,
         expires_at = $6,
         updated_by_admin_id = $7,
         updated_at = now()
     WHERE id = $8 AND branch_id = $9
     RETURNING id`,
    [
      update.title,
      update.body,
      update.category,
      update.audience,
      update.publish_at || null,
      update.expires_at || null,
      update.updated_by_admin_id || null,
      announcementId,
      branchId,
    ]
  );
  if (!r.rows[0]) return null;
  return findAnnouncementByIdForBranch(pool, announcementId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} announcementId
 * @param {number} branchId
 * @param {object} update
 * @returns {Promise<object | null>}
 */
async function publishAnnouncementForBranch(pool, announcementId, branchId, update) {
  const publishAt = update.publish_at || new Date();
  const r = await pool.query(
    `UPDATE public.church_announcements
     SET status = 'published',
         publish_at = $1,
         published_at = $1,
         updated_by_admin_id = $2,
         updated_at = now()
     WHERE id = $3 AND branch_id = $4 AND status IN ('draft', 'published')
     RETURNING id`,
    [publishAt, update.updated_by_admin_id || null, announcementId, branchId]
  );
  if (!r.rows[0]) return null;
  return findAnnouncementByIdForBranch(pool, announcementId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} announcementId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function archiveAnnouncementForBranch(pool, announcementId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_announcements
     SET status = 'archived',
         updated_by_admin_id = $1,
         updated_at = now()
     WHERE id = $2 AND branch_id = $3 AND status IN ('draft', 'published')
     RETURNING id`,
    [adminId, announcementId, branchId]
  );
  if (!r.rows[0]) return null;
  return findAnnouncementByIdForBranch(pool, announcementId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<Record<string, number>>}
 */
async function countAnnouncementsByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_announcements
     WHERE branch_id = $1
     GROUP BY status`,
    [branchId]
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
 * @param {number} branchId
 * @param {{ limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listVisibleAnnouncementsForMember(pool, branchId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);
  const r = await pool.query(
    `${ANNOUNCEMENT_SELECT}
     WHERE a.branch_id = $1
       AND ${visibleAnnouncementWhere("a")}
       AND a.audience = ANY($2::text[])
     ORDER BY COALESCE(a.publish_at, a.published_at, a.created_at) DESC NULLS LAST
     LIMIT $3`,
    [branchId, MEMBER_AUDIENCES, limit]
  );
  return r.rows.map(mapAnnouncementRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listPublicAnnouncementsForBranch(pool, branchId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);
  const r = await pool.query(
    `${ANNOUNCEMENT_SELECT}
     WHERE a.branch_id = $1
       AND ${visibleAnnouncementWhere("a")}
       AND a.audience = 'public'
     ORDER BY COALESCE(a.publish_at, a.published_at, a.created_at) DESC NULLS LAST
     LIMIT $2`,
    [branchId, limit]
  );
  return r.rows.map(mapAnnouncementRow);
}

/** @deprecated use listVisibleAnnouncementsForMember */
async function listVisibleAnnouncementsForBranch(pool, branchId, opts = {}) {
  return listVisibleAnnouncementsForMember(pool, branchId, opts);
}

module.exports = {
  createAnnouncement,
  createAnnouncementForBranch,
  listAnnouncementsForBranch,
  findAnnouncementByIdForBranch,
  updateAnnouncementForBranch,
  publishAnnouncementForBranch,
  archiveAnnouncementForBranch,
  countAnnouncementsByStatusForBranch,
  listVisibleAnnouncementsForMember,
  listPublicAnnouncementsForBranch,
  listVisibleAnnouncementsForBranch,
};
