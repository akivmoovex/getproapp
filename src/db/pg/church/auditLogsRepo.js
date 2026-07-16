"use strict";

const {
  actionPatternsForGroup,
  BRANCH_RESTRICTED_ACTOR_TYPES,
  BRANCH_RESTRICTED_ACTION_LIKE,
  isBranchRestrictedAuditRow,
} = require("../../../church/auditLogFormatting");

const AUDIT_SELECT = `
  SELECT a.*,
         b.name AS branch_name,
         o.name AS organization_name,
         CASE
           WHEN a.actor_type = 'branch_admin' THEN ba.full_name
           WHEN a.actor_type = 'hq_admin' THEN ha.full_name
           WHEN a.actor_type = 'member' THEN m.full_name
           WHEN a.actor_type = 'leader' THEN ml.full_name
           ELSE a.actor_label
         END AS actor_name
  FROM public.church_audit_logs a
  LEFT JOIN public.church_branches b ON b.id = a.branch_id
  LEFT JOIN public.church_organizations o ON o.id = a.organization_id
  LEFT JOIN public.church_branch_admins ba
    ON a.actor_type = 'branch_admin' AND ba.id = a.actor_id
  LEFT JOIN public.church_hq_admins ha
    ON a.actor_type = 'hq_admin' AND ha.id = a.actor_id
  LEFT JOIN public.church_members m
    ON a.actor_type = 'member' AND m.id = a.actor_id
  LEFT JOIN public.church_ministry_leaders ml
    ON a.actor_type = 'leader' AND ml.id = a.actor_id
`;

function mapAuditRow(row) {
  if (!row) return row;
  let metadata_json = row.metadata_json;
  if (typeof metadata_json === "string") {
    try {
      metadata_json = JSON.parse(metadata_json);
    } catch {
      metadata_json = {};
    }
  }
  return { ...row, metadata_json: metadata_json || {} };
}

function buildFilterClause(opts, params, { organizationId, branchId }) {
  const clauses = [];
  if (organizationId != null) {
    params.push(organizationId);
    clauses.push(`a.organization_id = $${params.length}`);
  }
  if (branchId != null) {
    params.push(branchId);
    clauses.push(`a.branch_id = $${params.length}`);
  }
  if (opts.organizationId != null && organizationId == null) {
    params.push(opts.organizationId);
    clauses.push(`a.organization_id = $${params.length}`);
  }
  if (opts.branchId != null) {
    params.push(opts.branchId);
    clauses.push(`a.branch_id = $${params.length}`);
  }
  if (opts.excludeBranchRestricted) {
    for (const actorType of BRANCH_RESTRICTED_ACTOR_TYPES) {
      params.push(actorType);
      clauses.push(`a.actor_type IS DISTINCT FROM $${params.length}`);
    }
    for (const pattern of BRANCH_RESTRICTED_ACTION_LIKE) {
      params.push(pattern);
      clauses.push(`a.action NOT LIKE $${params.length}`);
    }
  }
  if (opts.actorId != null) {
    params.push(opts.actorId);
    clauses.push(`a.actor_id = $${params.length}`);
  }
  if (opts.action) {
    params.push(opts.action);
    clauses.push(`a.action = $${params.length}`);
  } else if (opts.actionGroup && opts.actionGroup !== "all") {
    const patterns = actionPatternsForGroup(opts.actionGroup);
    if (patterns && patterns.length > 0) {
      const orParts = patterns.map((pattern) => {
        params.push(pattern);
        return `a.action LIKE $${params.length}`;
      });
      clauses.push(`(${orParts.join(" OR ")})`);
    }
  }
  if (opts.actorType) {
    params.push(opts.actorType);
    clauses.push(`a.actor_type = $${params.length}`);
  }
  if (opts.targetType) {
    params.push(opts.targetType);
    clauses.push(`a.entity_type = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q.toLowerCase()}%`);
    const idx = params.length;
    clauses.push(`(
      lower(a.action) LIKE $${idx}
      OR lower(a.entity_type) LIKE $${idx}
      OR lower(COALESCE(a.actor_label, '')) LIKE $${idx}
      OR lower(COALESCE(a.target_label, '')) LIKE $${idx}
      OR lower(COALESCE(a.metadata_json::text, '')) LIKE $${idx}
    )`);
  }
  if (opts.dateFrom) {
    params.push(opts.dateFrom);
    clauses.push(`a.created_at >= $${params.length}::date`);
  }
  if (opts.dateTo) {
    params.push(opts.dateTo);
    clauses.push(`a.created_at < ($${params.length}::date + interval '1 day')`);
  }
  return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
}

async function countAuditLogs(pool, opts, scope) {
  const params = [];
  const where = buildFilterClause(opts, params, scope);
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_audit_logs a
     ${where}`,
    params
  );
  return r.rows[0]?.count ?? 0;
}

async function queryAuditLogs(pool, opts, scope) {
  const params = [];
  const where = buildFilterClause(opts, params, scope);
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;
  params.push(limit, offset);
  const r = await pool.query(
    `${AUDIT_SELECT}
     ${where}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return r.rows.map(mapAuditRow);
}

async function listAuditLogsForBranch(pool, branchId, opts = {}) {
  return queryAuditLogs(pool, { ...opts, excludeBranchRestricted: true }, { branchId });
}

async function listAuditLogsForOrganization(pool, organizationId, opts = {}) {
  return queryAuditLogs(pool, opts, { organizationId });
}

/**
 * Platform-wide audit list (super-admin). Optional organizationId filter via opts.
 */
async function listAuditLogsForPlatform(pool, opts = {}) {
  return queryAuditLogs(pool, opts, {
    organizationId: opts.organizationId != null ? opts.organizationId : null,
  });
}

async function countAuditLogsForPlatform(pool, opts = {}) {
  return countAuditLogs(pool, opts, {
    organizationId: opts.organizationId != null ? opts.organizationId : null,
  });
}

async function findAuditLogByIdForPlatform(pool, auditId) {
  const r = await pool.query(
    `${AUDIT_SELECT}
     WHERE a.id = $1
     LIMIT 1`,
    [auditId]
  );
  return mapAuditRow(r.rows[0] ?? null);
}

async function countAuditLogsForBranch(pool, branchId, opts = {}) {
  return countAuditLogs(pool, { ...opts, excludeBranchRestricted: true }, { branchId });
}

async function countAuditLogsForOrganization(pool, organizationId, opts = {}) {
  return countAuditLogs(pool, opts, { organizationId });
}

async function listRecentAuditLogsForBranch(pool, branchId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 5, 1), 20);
  return listAuditLogsForBranch(pool, branchId, { ...opts, limit, offset: 0, page: 1 });
}

async function listRecentAuditLogsForOrganization(pool, organizationId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 5, 1), 20);
  return listAuditLogsForOrganization(pool, organizationId, { ...opts, limit, offset: 0, page: 1 });
}

async function findAuditLogByIdForBranch(pool, auditId, branchId) {
  const r = await pool.query(
    `${AUDIT_SELECT}
     WHERE a.id = $1 AND a.branch_id = $2
     LIMIT 1`,
    [auditId, branchId]
  );
  const row = mapAuditRow(r.rows[0] ?? null);
  if (!row || isBranchRestrictedAuditRow(row)) return null;
  return row;
}

async function findAuditLogByIdForOrganization(pool, auditId, organizationId) {
  const r = await pool.query(
    `${AUDIT_SELECT}
     WHERE a.id = $1 AND a.organization_id = $2
     LIMIT 1`,
    [auditId, organizationId]
  );
  return mapAuditRow(r.rows[0] ?? null);
}

async function insertAuditLog(pool, entry) {
  const metadata =
    entry.metadata_json != null && typeof entry.metadata_json === "object" ? entry.metadata_json : {};
  const r = await pool.query(
    `INSERT INTO public.church_audit_logs (
       organization_id, branch_id, actor_type, actor_id,
       action, entity_type, entity_id, metadata_json,
       actor_label, target_label, ip_address, user_agent
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
     RETURNING *`,
    [
      entry.organization_id ?? null,
      entry.branch_id ?? null,
      String(entry.actor_type || "system").slice(0, 64),
      entry.actor_id ?? null,
      String(entry.action || "").slice(0, 128),
      String(entry.entity_type || "").slice(0, 64),
      entry.entity_id ?? null,
      JSON.stringify(metadata),
      entry.actor_label ? String(entry.actor_label).slice(0, 255) : null,
      entry.target_label ? String(entry.target_label).slice(0, 255) : null,
      entry.ip_address ? String(entry.ip_address).slice(0, 64) : null,
      entry.user_agent ? String(entry.user_agent).slice(0, 512) : null,
    ]
  );
  return mapAuditRow(r.rows[0]);
}

module.exports = {
  insertAuditLog,
  listAuditLogsForBranch,
  findAuditLogByIdForBranch,
  listAuditLogsForOrganization,
  findAuditLogByIdForOrganization,
  listAuditLogsForPlatform,
  countAuditLogsForPlatform,
  findAuditLogByIdForPlatform,
  countAuditLogsForBranch,
  countAuditLogsForOrganization,
  listRecentAuditLogsForBranch,
  listRecentAuditLogsForOrganization,
};
