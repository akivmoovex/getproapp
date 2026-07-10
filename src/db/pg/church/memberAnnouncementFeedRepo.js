"use strict";

const { MEMBER_HQ_AUDIENCES } = require("../../../church/hqBroadcastValidation");

const MEMBER_BRANCH_AUDIENCES = ["public", "members", "leaders"];
const PRIORITIES = ["normal", "important", "urgent", "emergency"];
const SOURCES = ["all", "hq", "branch"];
const READ_STATUSES = ["all", "unread", "read"];

const FEED_ORDER = `
  ORDER BY
    CASE WHEN feed.is_featured AND (feed.featured_until IS NULL OR feed.featured_until > now()) THEN 1 ELSE 0 END DESC,
    CASE WHEN feed.is_pinned THEN 1 ELSE 0 END DESC,
    CASE feed.priority
      WHEN 'emergency' THEN 4
      WHEN 'urgent' THEN 3
      WHEN 'important' THEN 2
      ELSE 1
    END DESC,
    feed.publish_at DESC NULLS LAST,
    feed.source ASC,
    feed.id DESC
`;

function escapeIlike(q) {
  return `%${String(q).replace(/[%_]/g, "\\$&")}%`;
}

function normalizeMemberFeedOpts(opts = {}) {
  const page = Math.max(Number(opts.page) || 1, 1);
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);
  const q = String(opts.q || "").trim().slice(0, 200);
  const sourceRaw = String(opts.source || "all").trim().toLowerCase();
  const source = SOURCES.includes(sourceRaw) ? sourceRaw : "all";
  const priorityRaw = String(opts.priority || "").trim().toLowerCase();
  const priority = PRIORITIES.includes(priorityRaw) ? priorityRaw : "";
  const category = String(opts.category || "").trim().slice(0, 80);
  const readRaw = String(opts.read_status || opts.read || "all").trim().toLowerCase();
  const read_status = READ_STATUSES.includes(readRaw) ? readRaw : "all";
  const pinned_only = opts.pinned_only === true || opts.pinned_only === "1" || opts.pinned_only === "true";
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    q,
    source,
    priority,
    category,
    read_status,
    pinned_only,
  };
}

function mapFeedRow(row) {
  if (!row) return row;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    audience: row.audience,
    priority: row.priority || "normal",
    is_pinned: Boolean(row.is_pinned),
    is_featured: Boolean(row.is_featured),
    featured_until: row.featured_until || null,
    action_url: row.action_url || null,
    action_label: row.action_label || null,
    publish_at: row.publish_at,
    expires_at: row.expires_at,
    source: row.source === "hq" ? "hq" : "branch",
    source_label: row.source === "hq" ? "HQ" : "Branch",
    source_type: row.source_type,
    is_read: Boolean(row.read_at),
    read_at: row.read_at || null,
  };
}

/**
 * Server-side filtered + paginated member announcement feed (branch + HQ UNION).
 * Does not load the full feed into memory.
 *
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {{
 *   organizationId: number,
 *   branchId: number,
 *   memberId: number,
 *   audiences?: string[],
 *   q?: string,
 *   source?: string,
 *   priority?: string,
 *   category?: string,
 *   read_status?: string,
 *   pinned_only?: boolean|string,
 *   page?: number,
 *   limit?: number,
 * }} opts
 */
async function listVisibleMemberFeed(pool, opts = {}) {
  const organizationId = Number(opts.organizationId);
  const branchId = Number(opts.branchId);
  const memberId = Number(opts.memberId);
  const audiences = Array.isArray(opts.audiences) && opts.audiences.length ? opts.audiences : MEMBER_HQ_AUDIENCES;
  const filters = normalizeMemberFeedOpts(opts);

  const params = [organizationId, branchId, memberId, audiences, MEMBER_BRANCH_AUDIENCES];
  const includeBranch = filters.source === "all" || filters.source === "branch";
  const includeHq = filters.source === "all" || filters.source === "hq";

  const sharedFilters = [];
  if (filters.q) {
    params.push(escapeIlike(filters.q));
    const p = `$${params.length}`;
    sharedFilters.push(`(feed.title ILIKE ${p} OR feed.body ILIKE ${p})`);
  }
  if (filters.priority) {
    params.push(filters.priority);
    sharedFilters.push(`feed.priority = $${params.length}`);
  }
  if (filters.category) {
    params.push(filters.category);
    sharedFilters.push(`feed.category = $${params.length}`);
  }
  if (filters.pinned_only) {
    sharedFilters.push("feed.is_pinned = TRUE");
  }

  const branchSelect = `
    SELECT
      a.id,
      a.title,
      a.body,
      a.category,
      a.audience,
      COALESCE(a.priority, 'normal') AS priority,
      COALESCE(a.is_pinned, FALSE) AS is_pinned,
      COALESCE(a.is_featured, FALSE) AS is_featured,
      a.featured_until,
      a.action_url,
      a.action_label,
      COALESCE(a.publish_at, a.published_at) AS publish_at,
      a.expires_at,
      'branch'::text AS source,
      'announcement'::text AS source_type
    FROM public.church_announcements a
    WHERE a.branch_id = $2
      AND a.status = 'published'
      AND (COALESCE(a.publish_at, a.published_at) IS NULL OR COALESCE(a.publish_at, a.published_at) <= now())
      AND (a.expires_at IS NULL OR a.expires_at > now())
      AND a.audience = ANY($5::text[])
  `;

  const hqSelect = `
    SELECT
      b.id,
      b.title,
      b.body,
      b.category,
      b.audience,
      COALESCE(b.priority, 'normal') AS priority,
      COALESCE(b.is_pinned, FALSE) AS is_pinned,
      COALESCE(b.is_featured, FALSE) AS is_featured,
      b.featured_until,
      b.action_url,
      b.action_label,
      b.publish_at,
      b.expires_at,
      'hq'::text AS source,
      'hq_broadcast'::text AS source_type
    FROM public.church_hq_broadcasts b
    WHERE b.organization_id = $1
      AND b.status = 'published'
      AND (b.publish_at IS NULL OR b.publish_at <= now())
      AND (b.expires_at IS NULL OR b.expires_at > now())
      AND b.audience = ANY($4::text[])
      AND (
        b.target_scope = 'all_branches'
        OR EXISTS (
          SELECT 1 FROM public.church_hq_broadcast_targets t
          WHERE t.broadcast_id = b.id AND t.branch_id = $2
        )
      )
  `;

  const unionParts = [];
  if (includeBranch) unionParts.push(branchSelect);
  if (includeHq) unionParts.push(hqSelect);
  if (!unionParts.length) {
    return { rows: [], total: 0, page: filters.page, limit: filters.limit, totalPages: 1, filters };
  }

  const outerWhere = [];
  if (sharedFilters.length) outerWhere.push(...sharedFilters);
  if (filters.read_status === "unread") {
    outerWhere.push("r.read_at IS NULL");
  } else if (filters.read_status === "read") {
    outerWhere.push("r.read_at IS NOT NULL");
  }
  const whereSql = outerWhere.length ? `WHERE ${outerWhere.join(" AND ")}` : "";

  const baseSql = `
    FROM (
      ${unionParts.join("\n      UNION ALL\n")}
    ) feed
    LEFT JOIN public.church_feed_item_reads r
      ON r.member_id = $3
     AND r.source_type = feed.source_type
     AND r.source_id = feed.id
    ${whereSql}
  `;

  const countR = await pool.query(`SELECT COUNT(*)::int AS total ${baseSql}`, params);
  const total = countR.rows[0] ? countR.rows[0].total : 0;
  const totalPages = Math.max(Math.ceil(total / filters.limit) || 1, 1);
  const page = Math.min(filters.page, totalPages);
  const offset = (page - 1) * filters.limit;

  params.push(filters.limit, offset);
  const r = await pool.query(
    `SELECT feed.*, r.read_at
     ${baseSql}
     ${FEED_ORDER}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    rows: r.rows.map(mapFeedRow),
    total,
    page,
    limit: filters.limit,
    totalPages,
    filters: { ...filters, page, offset },
  };
}

/**
 * Count unread visible items for header badge (same visibility rules; ignores read_status filter).
 */
async function countUnreadVisibleMemberFeed(pool, opts = {}) {
  const listed = await listVisibleMemberFeed(pool, {
    ...opts,
    read_status: "unread",
    page: 1,
    limit: 1,
  });
  return listed.total;
}

module.exports = {
  listVisibleMemberFeed,
  countUnreadVisibleMemberFeed,
  normalizeMemberFeedOpts,
  MEMBER_BRANCH_AUDIENCES,
  PRIORITIES,
  SOURCES,
  READ_STATUSES,
};
