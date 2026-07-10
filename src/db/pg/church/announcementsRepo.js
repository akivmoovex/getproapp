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

const FEED_ORDER = `
  ORDER BY
    CASE WHEN a.is_featured AND (a.featured_until IS NULL OR a.featured_until > now()) THEN 1 ELSE 0 END DESC,
    CASE WHEN a.is_pinned THEN 1 ELSE 0 END DESC,
    CASE a.priority
      WHEN 'emergency' THEN 4
      WHEN 'urgent' THEN 3
      WHEN 'important' THEN 2
      ELSE 1
    END DESC,
    COALESCE(a.publish_at, a.published_at, a.created_at) DESC NULLS LAST,
    a.id DESC
`;

function mapAnnouncementRow(row) {
  if (!row) return row;
  return {
    ...row,
    publish_at: row.effective_publish_at || row.publish_at || row.published_at,
    is_pinned: Boolean(row.is_pinned),
    is_featured: Boolean(row.is_featured),
    featured_until: row.featured_until || null,
    priority: row.priority || "normal",
  };
}

function mapAnnouncementForFeed(row) {
  const mapped = mapAnnouncementRow(row);
  if (!mapped) return mapped;
  return {
    id: mapped.id,
    title: mapped.title,
    body: mapped.body,
    category: mapped.category,
    audience: mapped.audience,
    priority: mapped.priority,
    is_pinned: mapped.is_pinned,
    is_featured: mapped.is_featured,
    featured_until: mapped.featured_until,
    attachment_url: mapped.attachment_url || null,
    attachment_label: mapped.attachment_label || null,
    action_url: mapped.action_url || null,
    action_label: mapped.action_label || null,
    publish_at: mapped.publish_at,
    expires_at: mapped.expires_at,
    source: "branch",
    source_label: "Branch",
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

function normalizeListOpts(opts = {}) {
  const page = Math.max(Number(opts.page) || 1, 1);
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);
  const q = String(opts.q || "").trim().slice(0, 200);
  return { page, limit, offset: (page - 1) * limit, q, status: String(opts.status || "").trim() };
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
       priority, is_pinned, is_featured, featured_until,
       action_url, action_label,
       status, publish_at, published_at, expires_at,
       created_by_admin_id, updated_by_admin_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11,
       $12, $13,
       $14, $15, $15, $16,
       $17, $17
     )
     RETURNING id`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.title,
      fields.body || "",
      fields.category || "General",
      fields.audience || "members",
      fields.source_type || "branch",
      fields.priority || "normal",
      Boolean(fields.is_pinned),
      Boolean(fields.is_featured),
      fields.featured_until || null,
      fields.action_url || null,
      fields.action_label || null,
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
 * @param {{ status?: string, q?: string, page?: number, limit?: number }} opts
 * @returns {Promise<{ rows: object[], total: number, page: number, limit: number, totalPages: number }>}
 */
async function listAnnouncementsForBranch(pool, branchId, opts = {}) {
  const { page, limit, offset, q, status } = normalizeListOpts(opts);
  const params = [branchId];
  let where = "WHERE a.branch_id = $1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND a.status = $${params.length}`;
  }
  if (q) {
    params.push(`%${q.replace(/[%_]/g, "\\$&")}%`);
    where += ` AND (a.title ILIKE $${params.length} OR a.body ILIKE $${params.length} OR a.category ILIKE $${params.length})`;
  }

  const countR = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.church_announcements a ${where}`,
    params
  );
  const total = countR.rows[0] ? countR.rows[0].total : 0;

  params.push(limit, offset);
  const r = await pool.query(
    `${ANNOUNCEMENT_SELECT}
     ${where}
     ${FEED_ORDER}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    rows: r.rows.map(mapAnnouncementRow),
    total,
    page,
    limit,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
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
         priority = $5,
         is_pinned = $6,
         is_featured = $7,
         featured_until = $8,
         action_url = $9,
         action_label = $10,
         publish_at = $11,
         published_at = $11,
         expires_at = $12,
         updated_by_admin_id = $13,
         updated_at = now()
     WHERE id = $14 AND branch_id = $15
     RETURNING id`,
    [
      update.title,
      update.body,
      update.category,
      update.audience,
      update.priority || "normal",
      Boolean(update.is_pinned),
      Boolean(update.is_featured),
      update.featured_until || null,
      update.action_url || null,
      update.action_label || null,
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
     ${FEED_ORDER}
     LIMIT $3`,
    [branchId, MEMBER_AUDIENCES, limit]
  );
  return r.rows.map(mapAnnouncementForFeed);
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
     ${FEED_ORDER}
     LIMIT $2`,
    [branchId, limit]
  );
  return r.rows.map(mapAnnouncementForFeed);
}

/**
 * Visible branch announcement for a verified member.
 * @returns {Promise<object | null>}
 */
async function findVisibleAnnouncementForMember(pool, branchId, announcementId) {
  const r = await pool.query(
    `${ANNOUNCEMENT_SELECT}
     WHERE a.id = $1
       AND a.branch_id = $2
       AND ${visibleAnnouncementWhere("a")}
       AND a.audience = ANY($3::text[])
     LIMIT 1`,
    [announcementId, branchId, MEMBER_AUDIENCES]
  );
  return r.rows[0] ? mapAnnouncementForFeed(r.rows[0]) : null;
}

/** @deprecated use listVisibleAnnouncementsForMember */
async function listVisibleAnnouncementsForBranch(pool, branchId, opts = {}) {
  return listVisibleAnnouncementsForMember(pool, branchId, opts);
}

/**
 * @returns {Promise<{ estimated_recipients: number, recipient_label: string }>}
 */
async function estimateAnnouncementAudience(pool, organizationId, branchId, announcement) {
  const audience = String((announcement && announcement.audience) || "members");
  if (audience === "public") {
    return { estimated_recipients: 1, recipient_label: "public branch site" };
  }
  if (audience === "leaders") {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM public.church_ministry_leaders
       WHERE organization_id = $1 AND branch_id = $2 AND status = 'active'`,
      [organizationId, branchId]
    );
    return {
      estimated_recipients: r.rows[0] ? r.rows[0].count : 0,
      recipient_label: "leaders",
    };
  }
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_members
     WHERE organization_id = $1 AND branch_id = $2 AND status = 'verified'`,
    [organizationId, branchId]
  );
  return {
    estimated_recipients: r.rows[0] ? r.rows[0].count : 0,
    recipient_label: "verified members",
  };
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
  findVisibleAnnouncementForMember,
  listVisibleAnnouncementsForBranch,
  estimateAnnouncementAudience,
};
