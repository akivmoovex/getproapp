"use strict";

const { maskLoginIdentifier, truncateMeta } = require("../../../church/loginProtection");
const auditLogsRepo = require("./auditLogsRepo");

const LEADER_DETAIL_SQL = `
  SELECT l.id, l.organization_id, l.branch_id, l.ministry_id, l.department_id, l.member_id,
         l.full_name, l.email, l.phone, l.role, l.status, l.notes,
         l.failed_login_attempts, l.login_locked_until, l.last_failed_login_at, l.last_successful_login_at,
         l.created_at, l.updated_at,
         o.name AS organization_name, o.slug AS organization_slug, o.status AS organization_status,
         o.plan_code,
         b.name AS branch_name, b.slug AS branch_slug,
         COALESCE(NULLIF(trim(b.host_slug), ''), b.slug) AS branch_host_slug,
         b.status AS branch_status,
         m.name AS ministry_name, m.status AS ministry_status, m.visibility AS ministry_visibility
  FROM public.church_ministry_leaders l
  INNER JOIN public.church_organizations o ON o.id = l.organization_id
  INNER JOIN public.church_branches b ON b.id = l.branch_id
  LEFT JOIN public.church_ministries m ON m.id = l.ministry_id
  WHERE l.id = $1
`;

function maskIpPreview(value) {
  const raw = truncateMeta(value, 64);
  if (!raw) return null;
  if (raw.includes(":")) {
    const parts = raw.split(":");
    if (parts.length > 2) return `${parts[0]}:${parts[1]}:…`;
  }
  const octets = raw.split(".");
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.*.*`;
  return raw.slice(0, 24);
}

function mapLeaderRow(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email || null,
    phone: row.phone || null,
    role: row.role || "ministry_leader",
    status: row.status,
    notes: row.notes || null,
    ministry_id: row.ministry_id,
    branch_id: row.branch_id,
    organization_id: row.organization_id,
    failed_login_attempts: Number(row.failed_login_attempts || 0),
    login_locked_until: row.login_locked_until,
    last_failed_login_at: row.last_failed_login_at,
    last_successful_login_at: row.last_successful_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapOrganizationRow(row) {
  return {
    id: row.organization_id,
    name: row.organization_name,
    slug: row.organization_slug,
    status: row.organization_status,
    plan_code: row.plan_code || "free",
  };
}

function mapBranchRow(row) {
  const hostSlug = String(row.branch_host_slug || row.branch_slug || "")
    .toLowerCase()
    .trim();
  return {
    id: row.branch_id,
    name: row.branch_name,
    host_slug: hostSlug,
    slug: row.branch_slug,
    status: row.branch_status,
    organization_id: row.organization_id,
  };
}

function mapMinistryRow(row) {
  if (!row.ministry_id) return null;
  return {
    id: row.ministry_id,
    name: row.ministry_name,
    status: row.ministry_status,
    visibility: row.ministry_visibility,
  };
}

function leaderStatusMeaning(status) {
  return status === "active"
    ? "Active — can sign in when organization and branch are active"
    : "Inactive — login blocked";
}

function getMinistryLeaderLoginContextForSupport(leader, organization, branch) {
  const blockedReasons = [];

  if (leader.status === "inactive") {
    blockedReasons.push("Leader is inactive");
  } else if (leader.status !== "active") {
    blockedReasons.push(`Leader status is ${leader.status}`);
  }

  if (organization.status === "suspended") {
    blockedReasons.push("Organization is suspended");
  } else if (organization.status === "archived") {
    blockedReasons.push("Organization is archived");
  } else if (organization.status !== "active") {
    blockedReasons.push(`Organization is ${organization.status}`);
  }

  if (branch.status === "suspended") {
    blockedReasons.push("Branch is suspended");
  } else if (branch.status === "archived") {
    blockedReasons.push("Branch is archived");
  } else if (branch.status !== "active") {
    blockedReasons.push(`Branch is ${branch.status}`);
  }

  const canAccess = blockedReasons.length === 0;

  let accessSummary;
  if (canAccess) {
    accessSummary = "Can access leader portal";
  } else if (leader.status === "inactive") {
    accessSummary = "Blocked because leader is inactive";
  } else if (branch.status === "suspended") {
    accessSummary = "Blocked because branch is suspended";
  } else if (organization.status === "suspended") {
    accessSummary = "Blocked because organization is suspended";
  } else if (organization.status === "archived") {
    accessSummary = "Blocked because organization is archived";
  } else if (branch.status === "archived") {
    accessSummary = "Blocked because branch is archived";
  } else {
    accessSummary = `Blocked: ${blockedReasons.join("; ")}`;
  }

  return {
    can_access_leader_portal: canAccess,
    access_summary: accessSummary,
    blocked_reasons: blockedReasons,
    leader_status_meaning: leaderStatusMeaning(leader.status),
    organization_status: organization.status,
    branch_status: branch.status,
  };
}

function mapLoginAttemptRow(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    success: row.success,
    failure_reason: row.failure_reason,
    identifier_display: maskLoginIdentifier(row.identifier_normalized),
    ip_preview: maskIpPreview(row.ip_address),
    user_agent_preview: truncateMeta(row.user_agent, 80),
    organization_name: row.organization_name || null,
    branch_name: row.branch_name || null,
  };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} leaderId
 * @param {{ branchId?: number | null }} [options]
 */
async function findMinistryLeaderSupportDetailById(pool, leaderId, options = {}) {
  const id = Number(leaderId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const r = await pool.query(`${LEADER_DETAIL_SQL} LIMIT 1`, [id]);
  const row = r.rows[0];
  if (!row) return null;

  if (options.branchId != null && Number(row.branch_id) !== Number(options.branchId)) {
    return null;
  }

  const leader = mapLeaderRow(row);
  const organization = mapOrganizationRow(row);
  const branch = mapBranchRow(row);
  const ministry = mapMinistryRow(row);

  const [loginContext, loginAttempts, activitySummary] = await Promise.all([
    Promise.resolve(getMinistryLeaderLoginContextForSupport(leader, organization, branch)),
    listRecentMinistryLeaderLoginAttempts(pool, id),
    listRecentMinistryLeaderActivitySummary(pool, id, leader.branch_id, leader.ministry_id),
  ]);

  return {
    leader,
    organization,
    branch,
    ministry,
    loginContext,
    loginAttempts,
    activitySummary,
  };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} leaderId
 * @param {{ limit?: number }} [opts]
 */
async function listRecentMinistryLeaderLoginAttempts(pool, leaderId, opts = {}) {
  const id = Number(leaderId);
  if (!Number.isFinite(id) || id <= 0) return [];
  const limit = Math.min(Math.max(Number(opts.limit) || 10, 1), 50);
  const r = await pool.query(
    `SELECT la.*, o.name AS organization_name, b.name AS branch_name
     FROM public.church_login_attempts la
     LEFT JOIN public.church_organizations o ON o.id = la.organization_id
     LEFT JOIN public.church_branches b ON b.id = la.branch_id
     WHERE la.account_type = 'ministry_leader' AND la.account_id = $1
     ORDER BY la.created_at DESC, la.id DESC
     LIMIT $2`,
    [id, limit]
  );
  return r.rows.map(mapLoginAttemptRow);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} leaderId
 * @param {number} branchId
 * @param {number | null} ministryId
 */
async function listRecentMinistryLeaderActivitySummary(pool, leaderId, branchId, ministryId) {
  const summary = {
    activity_notes_submitted: 0,
    activity_notes_reviewed: 0,
    activity_notes_follow_up: 0,
    latest_note_period: null,
    latest_note_review_status: null,
    confirmed_duties_count: 0,
    roster_duties_count: 0,
  };

  const notesR = await pool.query(
    `SELECT review_status, COUNT(*)::int AS count
     FROM public.church_ministry_activity_notes
     WHERE leader_id = $1 AND status = 'submitted'
     GROUP BY review_status`,
    [leaderId]
  );
  for (const row of notesR.rows) {
    if (row.review_status === "submitted") summary.activity_notes_submitted = row.count;
    if (row.review_status === "reviewed") summary.activity_notes_reviewed = row.count;
    if (row.review_status === "follow_up_requested") summary.activity_notes_follow_up = row.count;
  }

  const latestR = await pool.query(
    `SELECT period_month, review_status
     FROM public.church_ministry_activity_notes
     WHERE leader_id = $1 AND status = 'submitted'
     ORDER BY period_month DESC, updated_at DESC
     LIMIT 1`,
    [leaderId]
  );
  if (latestR.rows[0]) {
    summary.latest_note_period = latestR.rows[0].period_month;
    summary.latest_note_review_status = latestR.rows[0].review_status;
  }

  if (ministryId && branchId) {
    const dutyR = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_count,
         COUNT(*)::int AS roster_count
       FROM public.church_duty_roster
       WHERE branch_id = $1 AND ministry_id = $2 AND status <> 'cancelled'`,
      [branchId, ministryId]
    );
    summary.confirmed_duties_count = dutyR.rows[0]?.confirmed_count ?? 0;
    summary.roster_duties_count = dutyR.rows[0]?.roster_count ?? 0;
  }

  return summary;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {number} leaderId
 * @returns {Promise<object | null>}
 */
async function findMinistryLeaderForPlatformAction(client, leaderId) {
  const id = Number(leaderId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const r = await client.query(
    `SELECT l.id, l.organization_id, l.branch_id, l.ministry_id, l.full_name, l.email, l.status,
            l.failed_login_attempts, l.login_locked_until, l.last_failed_login_at,
            b.status AS branch_status, b.name AS branch_name,
            o.status AS organization_status, o.name AS organization_name
     FROM public.church_ministry_leaders l
     INNER JOIN public.church_branches b ON b.id = l.branch_id
     INNER JOIN public.church_organizations o ON o.id = l.organization_id
     WHERE l.id = $1
     LIMIT 1`,
    [id]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {object} entry
 */
async function recordPlatformMinistryLeaderSupportAudit(client, entry) {
  await auditLogsRepo.insertAuditLog(client, {
    organization_id: entry.organizationId,
    branch_id: entry.branchId,
    actor_type: "platform_admin",
    actor_id: entry.platformAdminId ?? null,
    actor_label: "Platform admin",
    action: entry.action,
    entity_type: "church_ministry_leader",
    entity_id: entry.leaderId,
    target_label: entry.leaderName,
    metadata_json: {
      organization_id: entry.organizationId,
      branch_id: entry.branchId,
      ministry_id: entry.ministryId ?? null,
      ministry_leader_id: entry.leaderId,
      previous_status: entry.previousStatus ?? null,
      new_status: entry.newStatus ?? null,
      reason: entry.reason ?? null,
      action_source: "platform_ministry_leader_support",
    },
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leaderId
 * @param {string} passwordHash
 * @param {number | null} platformAdminId
 */
async function resetMinistryLeaderPasswordForPlatform(pool, leaderId, passwordHash, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await findMinistryLeaderForPlatformAction(client, leaderId);
    if (!existing) {
      throw Object.assign(new Error("Ministry leader not found."), { code: "NOT_FOUND" });
    }

    await client.query(
      `UPDATE public.church_ministry_leaders
       SET password_hash = $2,
           platform_last_password_reset_at = now(),
           platform_password_reset_by_admin_id = $3,
           login_locked_until = NULL,
           failed_login_attempts = 0,
           updated_at = now()
       WHERE id = $1`,
      [leaderId, passwordHash, platformAdminId || null]
    );

    await recordPlatformMinistryLeaderSupportAudit(client, {
      organizationId: existing.organization_id,
      branchId: existing.branch_id,
      ministryId: existing.ministry_id,
      leaderId: existing.id,
      leaderName: existing.full_name,
      platformAdminId,
      action: "platform_ministry_leader_password_reset",
      previousStatus: existing.status,
      newStatus: existing.status,
    });

    await client.query("COMMIT");
    return existing;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leaderId
 * @param {string | null} reason
 * @param {number | null} platformAdminId
 */
async function activateMinistryLeaderForPlatform(pool, leaderId, reason, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await findMinistryLeaderForPlatformAction(client, leaderId);
    if (!existing) {
      throw Object.assign(new Error("Ministry leader not found."), { code: "NOT_FOUND" });
    }
    if (existing.status === "active") {
      await client.query("COMMIT");
      return { ...existing, alreadyActive: true };
    }

    await client.query(
      `UPDATE public.church_ministry_leaders
       SET status = 'active',
           platform_status_updated_at = now(),
           platform_status_updated_by_admin_id = $2,
           platform_status_reason = $3,
           updated_at = now()
       WHERE id = $1`,
      [leaderId, platformAdminId || null, reason]
    );

    await recordPlatformMinistryLeaderSupportAudit(client, {
      organizationId: existing.organization_id,
      branchId: existing.branch_id,
      ministryId: existing.ministry_id,
      leaderId: existing.id,
      leaderName: existing.full_name,
      platformAdminId,
      action: "platform_ministry_leader_activated",
      previousStatus: existing.status,
      newStatus: "active",
      reason,
    });

    await client.query("COMMIT");
    return { ...existing, status: "active", alreadyActive: false };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leaderId
 * @param {string} reason
 * @param {number | null} platformAdminId
 */
async function deactivateMinistryLeaderForPlatform(pool, leaderId, reason, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await findMinistryLeaderForPlatformAction(client, leaderId);
    if (!existing) {
      throw Object.assign(new Error("Ministry leader not found."), { code: "NOT_FOUND" });
    }
    if (existing.status === "inactive") {
      await client.query("COMMIT");
      return { ...existing, alreadyInactive: true };
    }

    await client.query(
      `UPDATE public.church_ministry_leaders
       SET status = 'inactive',
           platform_status_updated_at = now(),
           platform_status_updated_by_admin_id = $2,
           platform_status_reason = $3,
           updated_at = now()
       WHERE id = $1`,
      [leaderId, platformAdminId || null, reason]
    );

    await recordPlatformMinistryLeaderSupportAudit(client, {
      organizationId: existing.organization_id,
      branchId: existing.branch_id,
      ministryId: existing.ministry_id,
      leaderId: existing.id,
      leaderName: existing.full_name,
      platformAdminId,
      action: "platform_ministry_leader_deactivated",
      previousStatus: existing.status,
      newStatus: "inactive",
      reason,
    });

    await client.query("COMMIT");
    return { ...existing, status: "inactive", alreadyInactive: false };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leaderId
 * @param {string | null} reason
 * @param {number | null} platformAdminId
 */
async function unlockMinistryLeaderLoginForPlatform(pool, leaderId, reason, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await findMinistryLeaderForPlatformAction(client, leaderId);
    if (!existing) {
      throw Object.assign(new Error("Ministry leader not found."), { code: "NOT_FOUND" });
    }

    await client.query(
      `UPDATE public.church_ministry_leaders
       SET login_locked_until = NULL,
           failed_login_attempts = 0,
           updated_at = now()
       WHERE id = $1`,
      [leaderId]
    );

    await recordPlatformMinistryLeaderSupportAudit(client, {
      organizationId: existing.organization_id,
      branchId: existing.branch_id,
      ministryId: existing.ministry_id,
      leaderId: existing.id,
      leaderName: existing.full_name,
      platformAdminId,
      action: "platform_ministry_leader_login_unlocked",
      previousStatus: existing.status,
      newStatus: existing.status,
      reason,
    });

    await client.query("COMMIT");
    return existing;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  findMinistryLeaderSupportDetailById,
  getMinistryLeaderLoginContextForSupport,
  listRecentMinistryLeaderLoginAttempts,
  listRecentMinistryLeaderActivitySummary,
  findMinistryLeaderForPlatformAction,
  recordPlatformMinistryLeaderSupportAudit,
  resetMinistryLeaderPasswordForPlatform,
  activateMinistryLeaderForPlatform,
  deactivateMinistryLeaderForPlatform,
  unlockMinistryLeaderLoginForPlatform,
};
