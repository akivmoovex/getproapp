"use strict";

const REQUEST_TYPE_CONFIG = {
  member: {
    actions: [
      "member_password_reset_requested",
      "member_password_reset_request_reviewed",
      "member_password_reset_completed_by_branch_admin",
      "member_password_reset_request_rejected",
    ],
    entityTypes: ["password_reset_request"],
    resolverActorType: "branch_admin",
    resolverDefaultLabel: "Branch admin",
  },
  ministry_leader: {
    actions: [
      "ministry_leader_password_reset_requested",
      "ministry_leader_password_reset_request_reviewed",
      "ministry_leader_password_reset_completed_by_branch_admin",
      "ministry_leader_password_reset_request_rejected",
    ],
    entityTypes: ["ministry_leader_password_reset_request"],
    resolverActorType: "branch_admin",
    resolverDefaultLabel: "Branch admin",
  },
  branch_admin: {
    actions: [
      "branch_admin_password_reset_requested",
      "branch_admin_password_reset_request_reviewed",
      "branch_admin_password_reset_completed_by_platform_admin",
      "branch_admin_password_reset_request_rejected",
    ],
    entityTypes: ["branch_admin_password_reset_request"],
    resolverActorType: "platform_admin",
    resolverDefaultLabel: "Platform admin",
  },
  hq_admin: {
    actions: [
      "hq_admin_password_reset_requested",
      "hq_admin_password_reset_request_reviewed",
      "hq_admin_password_reset_completed_by_platform_admin",
      "hq_admin_password_reset_request_rejected",
    ],
    entityTypes: ["hq_admin_password_reset_request"],
    resolverActorType: "platform_admin",
    resolverDefaultLabel: "Platform admin",
  },
};

const ACTION_EVENT_META = {
  member_password_reset_requested: { label: "Request Submitted", status_after: "submitted" },
  member_password_reset_request_reviewed: { label: "Marked Reviewed", status_after: "reviewed" },
  member_password_reset_completed_by_branch_admin: {
    label: "Password Reset Completed",
    status_after: "reset_completed",
  },
  member_password_reset_request_rejected: { label: "Request Rejected", status_after: "rejected" },
  ministry_leader_password_reset_requested: { label: "Request Submitted", status_after: "submitted" },
  ministry_leader_password_reset_request_reviewed: { label: "Marked Reviewed", status_after: "reviewed" },
  ministry_leader_password_reset_completed_by_branch_admin: {
    label: "Password Reset Completed",
    status_after: "reset_completed",
  },
  ministry_leader_password_reset_request_rejected: { label: "Request Rejected", status_after: "rejected" },
  branch_admin_password_reset_requested: { label: "Request Submitted", status_after: "submitted" },
  branch_admin_password_reset_request_reviewed: { label: "Marked Reviewed", status_after: "reviewed" },
  branch_admin_password_reset_completed_by_platform_admin: {
    label: "Password Reset Completed",
    status_after: "reset_completed",
  },
  branch_admin_password_reset_request_rejected: { label: "Request Rejected", status_after: "rejected" },
  hq_admin_password_reset_requested: { label: "Request Submitted", status_after: "submitted" },
  hq_admin_password_reset_request_reviewed: { label: "Marked Reviewed", status_after: "reviewed" },
  hq_admin_password_reset_completed_by_platform_admin: {
    label: "Password Reset Completed",
    status_after: "reset_completed",
  },
  hq_admin_password_reset_request_rejected: { label: "Request Rejected", status_after: "rejected" },
  password_reset_request_rate_limited: { label: "Rate Limited", status_after: null },
};

const AUDIT_SELECT = `
  SELECT a.id, a.action, a.actor_type, a.actor_id, a.actor_label, a.created_at,
         a.entity_type, a.entity_id, a.metadata_json,
         CASE
           WHEN a.actor_type = 'branch_admin' THEN ba.full_name
           WHEN a.actor_type = 'hq_admin' THEN ha.full_name
           WHEN a.actor_type = 'member' THEN m.full_name
           WHEN a.actor_type = 'leader' THEN ml.full_name
           ELSE NULL
         END AS actor_name
  FROM public.church_audit_logs a
  LEFT JOIN public.church_branch_admins ba
    ON a.actor_type = 'branch_admin' AND ba.id = a.actor_id
  LEFT JOIN public.church_hq_admins ha
    ON a.actor_type = 'hq_admin' AND ha.id = a.actor_id
  LEFT JOIN public.church_members m
    ON a.actor_type = 'member' AND m.id = a.actor_id
  LEFT JOIN public.church_ministry_leaders ml
    ON a.actor_type = 'leader' AND ml.id = a.actor_id
`;

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function truncateNote(value, max = 200) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function extractNote(metadata) {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  return truncateNote(meta.review_comment || meta.reason || null);
}

function resolveActorLabel(row) {
  const actorType = String(row.actor_type || "").trim();
  const named = String(row.actor_name || row.actor_label || "").trim();
  if (actorType === "public") return "Public requester";
  if (actorType === "branch_admin") return named || "Branch admin";
  if (actorType === "platform_admin") return named || "Platform admin";
  if (actorType === "system") return "System";
  if (named) return named;
  return "System";
}

function resolveFallbackActorLabel(requestType, requestRow) {
  const config = REQUEST_TYPE_CONFIG[requestType];
  if (!config) return "System";
  const resolvedName =
    requestRow.resolved_by_name ||
    requestRow.resolved_by_display_name ||
    requestRow.resolved_by_username ||
    null;
  if (resolvedName) return String(resolvedName).slice(0, 120);
  return config.resolverDefaultLabel;
}

function resolveIconClass(statusAfter) {
  if (statusAfter === "reset_completed") return "reset-timeline-dot--completed";
  if (statusAfter === "submitted") return "reset-timeline-dot--submitted";
  if (statusAfter === "reviewed") return "reset-timeline-dot--reviewed";
  if (statusAfter === "rejected") return "reset-timeline-dot--rejected";
  return "";
}

function mapAuditRowToEvent(row) {
  const meta = ACTION_EVENT_META[row.action];
  if (!meta) return null;
  const metadata = parseMetadata(row.metadata_json);
  return {
    occurred_at: row.created_at,
    label: meta.label,
    actor_label: resolveActorLabel(row),
    actor_type: row.actor_type || "unknown",
    status_after: meta.status_after,
    note: extractNote(metadata),
    source: "audit",
    icon_class: resolveIconClass(meta.status_after),
  };
}

function buildBranchScopeClause(branchId, params) {
  if (branchId != null) {
    params.push(branchId);
    return `a.branch_id = $${params.length}`;
  }
  return "a.branch_id IS NULL";
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {{
 *   request_type: string,
 *   request_id: number,
 *   organization_id: number,
 *   branch_id?: number | null,
 * }} scope
 */
async function listResetRequestTimelineEvents(pool, scope) {
  const config = REQUEST_TYPE_CONFIG[scope.request_type];
  if (!config) return [];

  const requestId = Number(scope.request_id);
  const organizationId = Number(scope.organization_id);
  if (!Number.isFinite(requestId) || requestId <= 0 || !Number.isFinite(organizationId)) {
    return [];
  }

  const params = [organizationId];
  const branchClause = buildBranchScopeClause(scope.branch_id ?? null, params);
  params.push(config.entityTypes);
  params.push(requestId);
  params.push([...config.actions, "password_reset_request_rate_limited"]);

  const sql = `
    ${AUDIT_SELECT}
    WHERE a.organization_id = $1
      AND ${branchClause}
      AND a.action = ANY($5)
      AND (
        (a.entity_id = $4 AND a.entity_type = ANY($3))
        OR COALESCE((a.metadata_json->>'request_id')::bigint, 0) = $4
      )
    ORDER BY a.created_at ASC, a.id ASC`;

  const result = await pool.query(sql, params);
  const events = [];

  for (const row of result.rows) {
    if (row.action === "password_reset_request_rate_limited") {
      const metadata = parseMetadata(row.metadata_json);
      if (Number(metadata.request_id || 0) !== requestId) continue;
      if (metadata.request_type && metadata.request_type !== scope.request_type) continue;
      const mapped = mapAuditRowToEvent(row);
      if (mapped) events.push(mapped);
      continue;
    }
    if (!config.actions.includes(row.action)) continue;
    const metadata = parseMetadata(row.metadata_json);
    if (metadata.request_id != null && Number(metadata.request_id) !== requestId) continue;
    if (metadata.organization_id != null && Number(metadata.organization_id) !== organizationId) {
      continue;
    }
    if (
      scope.branch_id != null &&
      metadata.branch_id != null &&
      Number(metadata.branch_id) !== Number(scope.branch_id)
    ) {
      continue;
    }
    const mapped = mapAuditRowToEvent(row);
    if (mapped) events.push(mapped);
  }

  return events;
}

/**
 * @param {string} requestType
 * @param {object} requestRow
 */
function buildFallbackResetRequestTimeline(requestType, requestRow) {
  if (!requestRow || !REQUEST_TYPE_CONFIG[requestType]) return [];

  const events = [];
  if (requestRow.created_at) {
    events.push({
      occurred_at: requestRow.created_at,
      label: "Request Submitted",
      actor_label: "Public requester",
      actor_type: "public",
      status_after: "submitted",
      note: null,
      source: "fallback",
      icon_class: "reset-timeline-dot--submitted",
    });
  }

  const status = String(requestRow.status || "");
  if (status === "reviewed" && requestRow.updated_at) {
    events.push({
      occurred_at: requestRow.updated_at,
      label: "Marked Reviewed",
      actor_label: resolveFallbackActorLabel(requestType, requestRow),
      actor_type: REQUEST_TYPE_CONFIG[requestType].resolverActorType,
      status_after: "reviewed",
      note: null,
      source: "fallback",
      icon_class: "reset-timeline-dot--reviewed",
    });
  }

  if (status === "reset_completed" && requestRow.resolved_at) {
    events.push({
      occurred_at: requestRow.resolved_at,
      label: "Password Reset Completed",
      actor_label: resolveFallbackActorLabel(requestType, requestRow),
      actor_type: REQUEST_TYPE_CONFIG[requestType].resolverActorType,
      status_after: "reset_completed",
      note: null,
      source: "fallback",
      icon_class: "reset-timeline-dot--completed",
    });
  }

  if (status === "rejected" && requestRow.resolved_at) {
    events.push({
      occurred_at: requestRow.resolved_at,
      label: "Request Rejected",
      actor_label: resolveFallbackActorLabel(requestType, requestRow),
      actor_type: REQUEST_TYPE_CONFIG[requestType].resolverActorType,
      status_after: "rejected",
      note: truncateNote(requestRow.review_comment),
      source: "fallback",
      icon_class: "reset-timeline-dot--rejected",
    });
  }

  return events.sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {{
 *   request_type: string,
 *   request_id: number,
 *   organization_id: number,
 *   branch_id?: number | null,
 *   requestRow?: object | null,
 * }} scope
 */
async function getResetRequestTimeline(pool, scope) {
  const auditEvents = await listResetRequestTimelineEvents(pool, scope);
  if (auditEvents.length > 0) {
    return auditEvents;
  }
  if (scope.requestRow) {
    return buildFallbackResetRequestTimeline(scope.request_type, scope.requestRow);
  }
  return [];
}

module.exports = {
  REQUEST_TYPE_CONFIG,
  listResetRequestTimelineEvents,
  buildFallbackResetRequestTimeline,
  getResetRequestTimeline,
};
