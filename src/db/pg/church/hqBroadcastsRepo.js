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

const FEED_ORDER = `
  ORDER BY
    CASE WHEN b.is_featured AND (b.featured_until IS NULL OR b.featured_until > now()) THEN 1 ELSE 0 END DESC,
    CASE WHEN b.is_pinned THEN 1 ELSE 0 END DESC,
    CASE b.priority
      WHEN 'emergency' THEN 4
      WHEN 'urgent' THEN 3
      WHEN 'important' THEN 2
      ELSE 1
    END DESC,
    COALESCE(b.publish_at, b.created_at) DESC NULLS LAST,
    b.id DESC
`;

function visibleBroadcastWhere(alias = "b") {
  return `
    ${alias}.status IN ('published', 'partially_failed')
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
    priority: row.priority || "normal",
    is_pinned: Boolean(row.is_pinned),
    is_featured: Boolean(row.is_featured),
    featured_until: row.featured_until || null,
    attachment_url: row.attachment_url || null,
    attachment_label: row.attachment_label || null,
    action_url: row.action_url || null,
    action_label: row.action_label || null,
    publish_at: row.publish_at,
    expires_at: row.expires_at,
    source: "hq",
    source_label: "HQ",
  };
}

const LIST_PRIORITIES = ["normal", "important", "urgent", "emergency"];
const LIST_AUDIENCES = [
  "public",
  "members",
  "branch_admins",
  "leaders",
  "all_logged_in",
  "ministry",
  "department",
  "event",
  "selected_recipients",
];
const LIST_TARGET_SCOPES = ["all_branches", "selected_branches"];

function parseDateOnly(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function normalizeListOpts(opts = {}) {
  const page = Math.max(Number(opts.page) || 1, 1);
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);
  const q = String(opts.q || "").trim().slice(0, 200);
  const status = String(opts.status || "").trim();
  const priorityRaw = String(opts.priority || "").trim().toLowerCase();
  const priority = LIST_PRIORITIES.includes(priorityRaw) ? priorityRaw : "";
  const audienceRaw = String(opts.audience || "").trim().toLowerCase();
  const audience = LIST_AUDIENCES.includes(audienceRaw) ? audienceRaw : "";
  const scopeRaw = String(opts.target_scope || "").trim().toLowerCase();
  const target_scope = LIST_TARGET_SCOPES.includes(scopeRaw) ? scopeRaw : "";
  const date_from = parseDateOnly(opts.date_from || opts.dateFrom);
  const date_to = parseDateOnly(opts.date_to || opts.dateTo);
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    q,
    status,
    priority,
    audience,
    target_scope,
    date_from,
    date_to,
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
  const { page, limit, offset, q, status, priority, audience, target_scope, date_from, date_to } =
    normalizeListOpts(opts);
  const params = [organizationId];
  let where = "WHERE b.organization_id = $1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND b.status = $${params.length}`;
  }
  if (q) {
    params.push(`%${q.replace(/[%_]/g, "\\$&")}%`);
    where += ` AND (b.title ILIKE $${params.length} OR b.body ILIKE $${params.length} OR b.category ILIKE $${params.length})`;
  }
  if (priority) {
    params.push(priority);
    where += ` AND b.priority = $${params.length}`;
  }
  if (audience) {
    params.push(audience);
    where += ` AND b.audience = $${params.length}`;
  }
  if (target_scope) {
    params.push(target_scope);
    where += ` AND b.target_scope = $${params.length}`;
  }
  if (date_from) {
    params.push(date_from);
    where += ` AND COALESCE(b.publish_at, b.created_at)::date >= $${params.length}::date`;
  }
  if (date_to) {
    params.push(date_to);
    where += ` AND COALESCE(b.publish_at, b.created_at)::date <= $${params.length}::date`;
  }

  const countR = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.church_hq_broadcasts b ${where}`,
    params
  );
  const total = countR.rows[0] ? countR.rows[0].total : 0;
  const totalPages = Math.max(Math.ceil(total / limit) || 1, 1);
  const safePage = Math.min(page, totalPages);
  const safeOffset = (safePage - 1) * limit;

  params.push(limit, safeOffset);
  const r = await pool.query(
    `${BROADCAST_SELECT}
     ${where}
     ${FEED_ORDER}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    rows: r.rows,
    total,
    page: safePage,
    limit,
    totalPages,
    filters: { q, status, priority, audience, target_scope, date_from, date_to },
  };
}

/**
 * Safe recent broadcast rows for platform org overview (no body/content).
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ limit?: number }} [opts]
 */
async function listRecentBroadcastSummariesForOrganization(pool, organizationId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 5, 1), 20);
  const r = await pool.query(
    `SELECT id, title, status, created_at, publish_at, priority
     FROM public.church_hq_broadcasts
     WHERE organization_id = $1
     ORDER BY COALESCE(publish_at, created_at) DESC NULLS LAST, id DESC
     LIMIT $2`,
    [organizationId, limit]
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

async function setAudienceTargets(pool, broadcastId, organizationId, fields) {
  const audience = String(fields.audience || "");
  if (audience === "ministry") {
    await pool.query(
      `DELETE FROM public.church_hq_broadcast_ministry_targets WHERE broadcast_id = $1 AND organization_id = $2`,
      [broadcastId, organizationId]
    );
    for (const ministryId of fields.ministry_ids || []) {
      await pool.query(
        `INSERT INTO public.church_hq_broadcast_ministry_targets (organization_id, broadcast_id, ministry_id)
         SELECT $1, $2, m.id FROM public.church_ministries m
         WHERE m.id = $3 AND m.organization_id = $1
         ON CONFLICT DO NOTHING`,
        [organizationId, broadcastId, ministryId]
      );
    }
  }
  if (audience === "department") {
    await pool.query(
      `DELETE FROM public.church_hq_broadcast_department_targets WHERE broadcast_id = $1 AND organization_id = $2`,
      [broadcastId, organizationId]
    );
    for (const departmentId of fields.department_ids || []) {
      await pool.query(
        `INSERT INTO public.church_hq_broadcast_department_targets (organization_id, broadcast_id, department_id)
         SELECT $1, $2, d.id FROM public.church_departments d
         WHERE d.id = $3 AND d.organization_id = $1
         ON CONFLICT DO NOTHING`,
        [organizationId, broadcastId, departmentId]
      );
    }
  }
  if (audience === "event") {
    await pool.query(
      `DELETE FROM public.church_hq_broadcast_event_targets WHERE broadcast_id = $1 AND organization_id = $2`,
      [broadcastId, organizationId]
    );
    for (const eventId of fields.event_ids || []) {
      await pool.query(
        `INSERT INTO public.church_hq_broadcast_event_targets (organization_id, broadcast_id, event_id)
         SELECT $1, $2, e.id FROM public.church_events e
         WHERE e.id = $3 AND e.organization_id = $1
         ON CONFLICT DO NOTHING`,
        [organizationId, broadcastId, eventId]
      );
    }
  }
  if (audience === "selected_recipients") {
    await pool.query(
      `DELETE FROM public.church_hq_broadcast_selected_recipients WHERE broadcast_id = $1 AND organization_id = $2`,
      [broadcastId, organizationId]
    );
    for (const rec of fields.selected_recipients || []) {
      await pool.query(
        `INSERT INTO public.church_hq_broadcast_selected_recipients (
           organization_id, broadcast_id, recipient_type, recipient_id
         ) VALUES ($1,$2,$3,$4)
         ON CONFLICT DO NOTHING`,
        [organizationId, broadcastId, rec.recipient_type, rec.recipient_id]
      );
    }
  }
}

async function createBroadcastForOrganization(pool, organizationId, fields) {
  const channels = Array.isArray(fields.delivery_channels)
    ? fields.delivery_channels
    : ["in_app"];
  const r = await pool.query(
    `INSERT INTO public.church_hq_broadcasts (
       organization_id, title, body, category, audience, target_scope,
       priority, is_pinned, is_featured, featured_until,
       action_url, action_label,
       status, publish_at, expires_at, delivery_channels,
       created_by_hq_admin_id, updated_by_hq_admin_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10,
       $11, $12,
       $13, $14, $15, $16::jsonb,
       $17, $17
     )
     RETURNING id`,
    [
      organizationId,
      fields.title,
      fields.body || "",
      fields.category || "General",
      fields.audience || "members",
      fields.target_scope || "all_branches",
      fields.priority || "normal",
      Boolean(fields.is_pinned),
      Boolean(fields.is_featured),
      fields.featured_until || null,
      fields.action_url || null,
      fields.action_label || null,
      fields.status || "draft",
      fields.publish_at || null,
      fields.expires_at || null,
      JSON.stringify(channels),
      fields.created_by_hq_admin_id || null,
    ]
  );
  const broadcastId = r.rows[0].id;
  if (fields.target_scope === "selected_branches" && fields.branch_ids && fields.branch_ids.length > 0) {
    await setBroadcastTargets(pool, broadcastId, organizationId, fields.branch_ids);
  }
  await setAudienceTargets(pool, broadcastId, organizationId, fields);
  return findBroadcastByIdForOrganization(pool, broadcastId, organizationId);
}

async function updateBroadcastForOrganization(pool, broadcastId, organizationId, update) {
  const channels = Array.isArray(update.delivery_channels) ? update.delivery_channels : null;
  const r = await pool.query(
    `UPDATE public.church_hq_broadcasts
     SET title = $1,
         body = $2,
         category = $3,
         audience = $4,
         target_scope = $5,
         priority = $6,
         is_pinned = $7,
         is_featured = $8,
         featured_until = $9,
         action_url = $10,
         action_label = $11,
         publish_at = $12,
         expires_at = $13,
         delivery_channels = COALESCE($14::jsonb, delivery_channels),
         updated_by_hq_admin_id = $15,
         updated_at = now()
     WHERE id = $16 AND organization_id = $17
       AND status IN ('draft', 'preview', 'audience_estimate', 'approval', 'published', 'partially_failed')
     RETURNING id`,
    [
      update.title,
      update.body,
      update.category,
      update.audience,
      update.target_scope,
      update.priority || "normal",
      Boolean(update.is_pinned),
      Boolean(update.is_featured),
      update.featured_until || null,
      update.action_url || null,
      update.action_label || null,
      update.publish_at || null,
      update.expires_at || null,
      channels ? JSON.stringify(channels) : null,
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
  await setAudienceTargets(pool, broadcastId, organizationId, update);

  return findBroadcastByIdForOrganization(pool, broadcastId, organizationId);
}

async function publishBroadcastForOrganization(pool, broadcastId, organizationId, update) {
  const publishAt = update.publish_at || new Date();
  const status = update.status || "published";
  const r = await pool.query(
    `UPDATE public.church_hq_broadcasts
     SET status = $5,
         publish_at = $1,
         approved_at = COALESCE(approved_at, now()),
         approved_by_hq_admin_id = COALESCE(approved_by_hq_admin_id, $2),
         updated_by_hq_admin_id = $2,
         updated_at = now()
     WHERE id = $3 AND organization_id = $4
       AND status IN ('draft', 'preview', 'audience_estimate', 'approval', 'published', 'scheduled')
     RETURNING id`,
    [publishAt, update.updated_by_hq_admin_id || null, broadcastId, organizationId, status]
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
     WHERE id = $2 AND organization_id = $3
       AND status IN ('draft', 'preview', 'audience_estimate', 'approval', 'published', 'partially_failed', 'failed', 'cancelled')
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
  const out = {
    draft: 0,
    preview: 0,
    audience_estimate: 0,
    approval: 0,
    scheduled: 0,
    processing: 0,
    published: 0,
    partially_failed: 0,
    failed: 0,
    cancelled: 0,
    archived: 0,
  };
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
     ${FEED_ORDER}
     LIMIT $4`,
    [organizationId, audiences, branchId, limit]
  );
  return r.rows.map(mapBroadcastForFeed);
}

/**
 * Visible HQ broadcast for a member branch + allowed audiences.
 * @returns {Promise<object | null>}
 */
async function findVisibleBroadcastForBranch(pool, organizationId, branchId, broadcastId, opts = {}) {
  const audiences = opts.audiences || [];
  if (!audiences.length) return null;
  const r = await pool.query(
    `${BROADCAST_SELECT}
     WHERE b.id = $4
       AND b.organization_id = $1
       AND ${visibleBroadcastWhere("b")}
       AND b.audience = ANY($2::text[])
       AND (
         b.target_scope = 'all_branches'
         OR EXISTS (
           SELECT 1 FROM public.church_hq_broadcast_targets t
           WHERE t.broadcast_id = b.id AND t.branch_id = $3
         )
       )
     LIMIT 1`,
    [organizationId, audiences, branchId, broadcastId]
  );
  return r.rows[0] ? mapBroadcastForFeed(r.rows[0]) : null;
}

/**
 * Estimate audience for publish confirmation / analytics.
 * Counts distinct eligible records for the audience type within tenant + branch scope.
 * Labeled as estimated because delivery is in-app visibility, not guaranteed push delivery.
 * @returns {Promise<{
 *   branch_count: number,
 *   estimated_recipients: number,
 *   recipient_label: string,
 *   is_estimate: boolean,
 * }>}
 */
async function estimateBroadcastAudience(pool, organizationId, broadcast, opts = {}) {
  if (!broadcast) {
    return {
      branch_count: 0,
      estimated_recipients: 0,
      recipient_label: "recipients",
      is_estimate: true,
    };
  }

  let branchIds = Array.isArray(opts.branchIds) ? opts.branchIds.map(Number).filter((id) => id > 0) : null;
  if (!branchIds) {
    if (broadcast.target_scope === "selected_branches") {
      const targets = await listBroadcastTargets(pool, broadcast.id, organizationId);
      branchIds = targets.map((t) => Number(t.branch_id));
    } else {
      const r = await pool.query(
        `SELECT id FROM public.church_branches WHERE organization_id = $1 AND status = 'active'`,
        [organizationId]
      );
      branchIds = r.rows.map((row) => Number(row.id));
    }
  }

  const branchCount = branchIds.length;
  const audience = String(broadcast.audience || "members");

  if (audience === "public") {
    return {
      branch_count: branchCount,
      estimated_recipients: branchCount,
      recipient_label: "public branch sites",
      is_estimate: true,
    };
  }

  if (audience === "branch_admins") {
    if (!branchIds.length) {
      return {
        branch_count: 0,
        estimated_recipients: 0,
        recipient_label: "active branch admins",
        is_estimate: true,
      };
    }
    const r = await pool.query(
      `SELECT COUNT(DISTINCT ba.id)::int AS count
       FROM public.church_branch_admins ba
       WHERE ba.organization_id = $1
         AND ba.branch_id = ANY($2::bigint[])
         AND ba.status = 'active'`,
      [organizationId, branchIds]
    );
    return {
      branch_count: branchCount,
      estimated_recipients: r.rows[0] ? r.rows[0].count : 0,
      recipient_label: "active branch admins",
      is_estimate: true,
    };
  }

  if (audience === "leaders") {
    if (!branchIds.length) {
      return {
        branch_count: 0,
        estimated_recipients: 0,
        recipient_label: "active leaders",
        is_estimate: true,
      };
    }
    const r = await pool.query(
      `SELECT COUNT(DISTINCT l.id)::int AS count
       FROM public.church_ministry_leaders l
       WHERE l.organization_id = $1
         AND l.branch_id = ANY($2::bigint[])
         AND l.status = 'active'`,
      [organizationId, branchIds]
    );
    return {
      branch_count: branchCount,
      estimated_recipients: r.rows[0] ? r.rows[0].count : 0,
      recipient_label: "active leaders",
      is_estimate: true,
    };
  }

  if (audience === "ministry") {
    const r = await pool.query(
      `SELECT COUNT(DISTINCT mm.member_id)::int AS count
       FROM public.church_hq_broadcast_ministry_targets t
       INNER JOIN public.church_member_ministries mm
         ON mm.ministry_id = t.ministry_id AND mm.organization_id = t.organization_id
       INNER JOIN public.church_members m ON m.id = mm.member_id
       WHERE t.broadcast_id = $1 AND t.organization_id = $2
         AND mm.status = 'active' AND m.status = 'verified'`,
      [broadcast.id, organizationId]
    );
    return {
      branch_count: branchCount,
      estimated_recipients: r.rows[0] ? r.rows[0].count : 0,
      recipient_label: "active ministry members",
      is_estimate: true,
    };
  }

  if (audience === "department") {
    // Group (department): verified members on the department's campus.
    const r = await pool.query(
      `SELECT COUNT(DISTINCT m.id)::int AS count
       FROM public.church_hq_broadcast_department_targets t
       INNER JOIN public.church_departments d ON d.id = t.department_id AND d.organization_id = t.organization_id
       INNER JOIN public.church_members m ON m.branch_id = d.branch_id AND m.organization_id = t.organization_id
       WHERE t.broadcast_id = $1 AND t.organization_id = $2
         AND m.status = 'verified'`,
      [broadcast.id, organizationId]
    );
    return {
      branch_count: branchCount,
      estimated_recipients: r.rows[0] ? r.rows[0].count : 0,
      recipient_label: "verified members (group campus)",
      is_estimate: true,
    };
  }

  if (audience === "event") {
    const r = await pool.query(
      `SELECT COUNT(DISTINCT m.id)::int AS count
       FROM public.church_hq_broadcast_event_targets t
       INNER JOIN public.church_events e ON e.id = t.event_id AND e.organization_id = t.organization_id
       INNER JOIN public.church_members m ON m.branch_id = e.branch_id AND m.organization_id = t.organization_id
       WHERE t.broadcast_id = $1 AND t.organization_id = $2
         AND m.status = 'verified'`,
      [broadcast.id, organizationId]
    );
    return {
      branch_count: branchCount,
      estimated_recipients: r.rows[0] ? r.rows[0].count : 0,
      recipient_label: "verified members (event campus)",
      is_estimate: true,
    };
  }

  if (audience === "selected_recipients") {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM public.church_hq_broadcast_selected_recipients
       WHERE broadcast_id = $1 AND organization_id = $2`,
      [broadcast.id, organizationId]
    );
    return {
      branch_count: branchCount,
      estimated_recipients: r.rows[0] ? r.rows[0].count : 0,
      recipient_label: "selected recipients",
      is_estimate: true,
    };
  }

  // members + all_logged_in → distinct verified members in scope
  if (!branchIds.length) {
    return {
      branch_count: 0,
      estimated_recipients: 0,
      recipient_label: "verified members",
      is_estimate: true,
    };
  }
  const r = await pool.query(
    `SELECT COUNT(DISTINCT m.id)::int AS count
     FROM public.church_members m
     WHERE m.organization_id = $1
       AND m.branch_id = ANY($2::bigint[])
       AND m.status = 'verified'`,
    [organizationId, branchIds]
  );
  return {
    branch_count: branchCount,
    estimated_recipients: r.rows[0] ? r.rows[0].count : 0,
    recipient_label: audience === "all_logged_in" ? "verified members (logged-in audience)" : "verified members",
    is_estimate: true,
  };
}

/**
 * Resolve active target branch ids for a broadcast (org-scoped).
 * @returns {Promise<number[]>}
 */
async function resolveBroadcastTargetBranchIds(pool, organizationId, broadcast) {
  if (!broadcast) return [];
  if (broadcast.target_scope === "selected_branches") {
    const targets = await listBroadcastTargets(pool, broadcast.id, organizationId);
    return targets.map((t) => Number(t.branch_id)).filter((id) => id > 0);
  }
  const r = await pool.query(
    `SELECT id FROM public.church_branches
     WHERE organization_id = $1 AND status = 'active'
     ORDER BY name ASC, id ASC`,
    [organizationId]
  );
  return r.rows.map((row) => Number(row.id));
}

/**
 * Current estimated audience per branch (one aggregate query).
 * @returns {Promise<Array<{ branch_id: number, estimated_recipients: number }>>}
 */
async function estimateBroadcastAudienceByBranch(pool, organizationId, broadcast, branchIds) {
  const ids = Array.isArray(branchIds) ? branchIds.map(Number).filter((id) => id > 0) : [];
  if (!broadcast || !ids.length) return [];
  const audience = String(broadcast.audience || "members");

  if (audience === "public") {
    return ids.map((branch_id) => ({ branch_id, estimated_recipients: 1 }));
  }

  if (audience === "branch_admins") {
    const r = await pool.query(
      `SELECT ba.branch_id, COUNT(DISTINCT ba.id)::int AS estimated_recipients
       FROM public.church_branch_admins ba
       WHERE ba.organization_id = $1
         AND ba.branch_id = ANY($2::bigint[])
         AND ba.status = 'active'
       GROUP BY ba.branch_id`,
      [organizationId, ids]
    );
    const map = new Map(r.rows.map((row) => [Number(row.branch_id), row.estimated_recipients || 0]));
    return ids.map((branch_id) => ({
      branch_id,
      estimated_recipients: map.get(branch_id) || 0,
    }));
  }

  if (audience === "leaders") {
    const r = await pool.query(
      `SELECT l.branch_id, COUNT(DISTINCT l.id)::int AS estimated_recipients
       FROM public.church_ministry_leaders l
       WHERE l.organization_id = $1
         AND l.branch_id = ANY($2::bigint[])
         AND l.status = 'active'
       GROUP BY l.branch_id`,
      [organizationId, ids]
    );
    const map = new Map(r.rows.map((row) => [Number(row.branch_id), row.estimated_recipients || 0]));
    return ids.map((branch_id) => ({
      branch_id,
      estimated_recipients: map.get(branch_id) || 0,
    }));
  }

  const r = await pool.query(
    `SELECT m.branch_id, COUNT(DISTINCT m.id)::int AS estimated_recipients
     FROM public.church_members m
     WHERE m.organization_id = $1
       AND m.branch_id = ANY($2::bigint[])
       AND m.status = 'verified'
     GROUP BY m.branch_id`,
    [organizationId, ids]
  );
  const map = new Map(r.rows.map((row) => [Number(row.branch_id), row.estimated_recipients || 0]));
  return ids.map((branch_id) => ({
    branch_id,
    estimated_recipients: map.get(branch_id) || 0,
  }));
}

module.exports = {
  createBroadcastForOrganization,
  updateBroadcastForOrganization,
  listBroadcastsForOrganization,
  listRecentBroadcastSummariesForOrganization,
  findBroadcastByIdForOrganization,
  publishBroadcastForOrganization,
  archiveBroadcastForOrganization,
  setBroadcastTargets,
  setAudienceTargets,
  listBroadcastTargets,
  listVisibleBroadcastsForBranch,
  findVisibleBroadcastForBranch,
  countBroadcastsByStatusForOrganization,
  validateBranchIdsForOrganization,
  estimateBroadcastAudience,
  resolveBroadcastTargetBranchIds,
  estimateBroadcastAudienceByBranch,
  visibleBroadcastWhere,
};
