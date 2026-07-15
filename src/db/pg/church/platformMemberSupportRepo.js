"use strict";

const auditLogsRepo = require("./auditLogsRepo");
const memberMinistriesRepo = require("./memberMinistriesRepo");
const ministryJoinRequestsRepo = require("./ministryJoinRequestsRepo");
const memberRequestsRepo = require("./memberRequestsRepo");
const dutyRosterRepo = require("./dutyRosterRepo");
const memberPasswordResetRequestsRepo = require("./memberPasswordResetRequestsRepo");

const MEMBER_DETAIL_SQL = `
  SELECT m.id, m.organization_id, m.branch_id, m.platform_tenant_id,
         m.email, m.phone, m.full_name, m.status, m.gender, m.age_group,
         m.address_area, m.attendance_duration, m.ministry_interest,
         m.emergency_contact_name, m.emergency_contact_phone,
         m.admin_notes, m.last_admin_note_at, m.review_comment,
         m.created_at, m.updated_at, m.suspended_at, m.reactivated_at,
         b.name AS branch_name, b.host_slug, b.slug AS branch_slug, b.status AS branch_status,
         b.city AS branch_city, b.country AS branch_country,
         o.name AS organization_name, o.slug AS organization_slug,
         o.status AS organization_status, o.plan_code,
         o.country AS organization_country, o.city AS organization_city
  FROM public.church_members m
  INNER JOIN public.church_branches b ON b.id = m.branch_id
  INNER JOIN public.church_organizations o ON o.id = m.organization_id
  WHERE m.id = $1
  LIMIT 1
`;

const MEMBER_AUDIT_SQL = `
  SELECT a.id, a.action, a.entity_type, a.entity_id, a.actor_type, a.actor_id,
         a.actor_label, a.target_label, a.created_at,
         CASE
           WHEN a.actor_type = 'branch_admin' THEN ba.full_name
           WHEN a.actor_type = 'hq_admin' THEN ha.full_name
           WHEN a.actor_type = 'member' THEN mem.full_name
           WHEN a.actor_type = 'leader' THEN ml.full_name
           ELSE a.actor_label
         END AS actor_name
  FROM public.church_audit_logs a
  LEFT JOIN public.church_branch_admins ba
    ON a.actor_type = 'branch_admin' AND ba.id = a.actor_id
  LEFT JOIN public.church_hq_admins ha
    ON a.actor_type = 'hq_admin' AND ha.id = a.actor_id
  LEFT JOIN public.church_members mem
    ON a.actor_type = 'member' AND mem.id = a.actor_id
  LEFT JOIN public.church_ministry_leaders ml
    ON a.actor_type = 'leader' AND ml.id = a.actor_id
  WHERE a.branch_id = $2
    AND (
      (a.entity_type = 'member' AND a.entity_id = $1)
      OR (a.actor_type = 'member' AND a.actor_id = $1)
    )
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT $3
`;

function mapMemberRow(row) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    branch_id: row.branch_id,
    platform_tenant_id: row.platform_tenant_id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    gender: row.gender,
    age_group: row.age_group,
    address_area: row.address_area,
    attendance_duration: row.attendance_duration,
    ministry_interest: row.ministry_interest,
    emergency_contact_name: row.emergency_contact_name,
    emergency_contact_phone: row.emergency_contact_phone,
    admin_notes: row.admin_notes,
    last_admin_note_at: row.last_admin_note_at,
    review_comment: row.review_comment,
    created_at: row.created_at,
    updated_at: row.updated_at,
    suspended_at: row.suspended_at,
    reactivated_at: row.reactivated_at,
  };
}

function mapOrganizationRow(row) {
  return {
    id: row.organization_id,
    name: row.organization_name,
    slug: row.organization_slug,
    status: row.organization_status,
    plan_code: row.plan_code || "free",
    country: row.organization_country,
    city: row.organization_city,
  };
}

function mapBranchRow(row) {
  const hostSlug = String(row.host_slug || row.branch_slug || "")
    .toLowerCase()
    .trim();
  return {
    id: row.branch_id,
    name: row.branch_name,
    host_slug: hostSlug,
    slug: row.branch_slug,
    status: row.branch_status,
    organization_id: row.organization_id,
    city: row.branch_city,
    country: row.branch_country,
  };
}

function memberStatusMeaning(status) {
  const map = {
    pending: "Waiting for branch admin verification",
    verified: "Verified — can access member portal when organization and branch are active",
    rejected: "Registration rejected — login blocked",
    suspended: "Suspended — login blocked",
  };
  return map[status] || status;
}

function getMemberLoginContextForSupport(member, organization, branch) {
  const blockedReasons = [];

  if (member.status === "pending") {
    blockedReasons.push("Member is pending verification");
  } else if (member.status === "rejected") {
    blockedReasons.push("Member registration was rejected");
  } else if (member.status === "suspended") {
    blockedReasons.push("Member is suspended");
  } else if (member.status !== "verified") {
    blockedReasons.push(`Member status is ${member.status}`);
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
    accessSummary = "Can access member portal";
  } else if (member.status === "pending") {
    accessSummary = "Blocked because member is pending verification";
  } else if (member.status === "rejected") {
    accessSummary = "Blocked because member registration was rejected";
  } else if (member.status === "suspended") {
    accessSummary = "Blocked because member is suspended";
  } else if (branch.status === "suspended") {
    accessSummary = "Blocked because branch is suspended";
  } else if (organization.status === "suspended") {
    accessSummary = "Blocked because organization is suspended";
  } else if (branch.status === "archived") {
    accessSummary = "Blocked because branch is archived";
  } else if (organization.status === "archived") {
    accessSummary = "Blocked because organization is archived";
  } else {
    accessSummary = `Blocked: ${blockedReasons.join("; ")}`;
  }

  return {
    can_access_member_portal: canAccess,
    access_summary: accessSummary,
    blocked_reasons: blockedReasons,
    member_status_meaning: memberStatusMeaning(member.status),
    organization_status: organization.status,
    branch_status: branch.status,
  };
}

async function getMemberMinistrySummaryForSupport(pool, memberId, branchId) {
  const [activeMinistries, joinRequests] = await Promise.all([
    memberMinistriesRepo.listMinistriesForMember(pool, memberId, branchId),
    ministryJoinRequestsRepo.listJoinRequestsForMember(pool, memberId, branchId),
  ]);

  const pendingJoinRequests = joinRequests
    .filter((r) => ["submitted", "more_info_needed"].includes(r.status))
    .map((r) => ({
      id: r.id,
      ministry_id: r.ministry_id,
      ministry_name: r.ministry_name,
      status: r.status,
      created_at: r.created_at,
    }));

  const closedJoinRequests = joinRequests
    .filter((r) => ["approved", "rejected"].includes(r.status))
    .map((r) => ({
      id: r.id,
      ministry_id: r.ministry_id,
      ministry_name: r.ministry_name,
      status: r.status,
      created_at: r.created_at,
      reviewed_at: r.reviewed_at,
    }));

  return {
    active_ministries: activeMinistries.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      joined_at: m.joined_at,
    })),
    pending_join_requests: pendingJoinRequests,
    closed_join_requests: closedJoinRequests,
  };
}

async function getMemberRequestSummaryForSupport(pool, memberId, branchId) {
  const rows = await memberRequestsRepo.listMemberRequestsForMember(pool, memberId, branchId);
  return rows.slice(0, 10).map((r) => ({
    id: r.id,
    request_type: r.request_type,
    subject: r.subject,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

async function getMemberPrayerSummaryForSupport(pool, memberId, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_prayer_requests
     WHERE member_id = $1 AND branch_id = $2
     GROUP BY status`,
    [memberId, branchId]
  );
  const summary = { submitted: 0, reviewed: 0, closed: 0, total: 0 };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(summary, row.status)) {
      summary[row.status] = row.count;
    }
    summary.total += row.count;
  }
  return summary;
}

async function getMemberDutySummaryForSupport(pool, memberId, branchId) {
  const [upcomingDuties, pastDutyCount] = await Promise.all([
    dutyRosterRepo.listDutiesForMember(pool, memberId, branchId, {
      timeframe: "upcoming",
      limit: 5,
    }),
    dutyRosterRepo.countDutiesForMember(pool, memberId, branchId, { timeframe: "past" }),
  ]);

  return {
    upcoming_duties: upcomingDuties.map((d) => ({
      id: d.id,
      duty_date: d.duty_date,
      service_name: d.service_name,
      role_name: d.role_name,
      status: d.status,
    })),
    past_duty_count: pastDutyCount,
  };
}

async function listMemberAuditEventsForSupport(pool, memberId, branchId, limit = 5) {
  const r = await pool.query(MEMBER_AUDIT_SQL, [memberId, branchId, limit]);
  return r.rows;
}

async function getMemberSupportSummary(pool, memberId, branchId) {
  const [ministries, requests, prayer, duties] = await Promise.all([
    getMemberMinistrySummaryForSupport(pool, memberId, branchId),
    getMemberRequestSummaryForSupport(pool, memberId, branchId),
    getMemberPrayerSummaryForSupport(pool, memberId, branchId),
    getMemberDutySummaryForSupport(pool, memberId, branchId),
  ]);

  return {
    ...ministries,
    member_requests: requests,
    prayer_summary: prayer,
    ...duties,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @returns {Promise<object | null>}
 */
async function findMemberSupportDetailById(pool, memberId) {
  const id = Number(memberId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const r = await pool.query(MEMBER_DETAIL_SQL, [id]);
  const row = r.rows[0];
  if (!row) return null;

  const member = mapMemberRow(row);
  const organization = mapOrganizationRow(row);
  const branch = mapBranchRow(row);

  const [summary, loginContext, auditLogs, passwordResetRequests] = await Promise.all([
    getMemberSupportSummary(pool, id, branch.id),
    Promise.resolve(getMemberLoginContextForSupport(member, organization, branch)),
    listMemberAuditEventsForSupport(pool, id, branch.id, 5),
    memberPasswordResetRequestsRepo.listRecentMemberPasswordResetRequestsForMember(pool, id, { limit: 5 }),
  ]);

  return {
    member,
    organization,
    branch,
    summary,
    loginContext,
    auditLogs,
    passwordResetRequests,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @returns {Promise<object | null>}
 */
async function findMemberForPlatformAction(pool, memberId) {
  const id = Number(memberId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const r = await pool.query(
    `SELECT m.id, m.organization_id, m.branch_id, m.full_name, m.status, m.email,
            b.status AS branch_status, b.name AS branch_name,
            o.status AS organization_status, o.name AS organization_name
     FROM public.church_members m
     INNER JOIN public.church_branches b ON b.id = m.branch_id
     INNER JOIN public.church_organizations o ON o.id = m.organization_id
     WHERE m.id = $1
     LIMIT 1`,
    [id]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {object} entry
 */
async function recordPlatformMemberSupportAudit(client, entry) {
  await auditLogsRepo.insertAuditLog(client, {
    organization_id: entry.organizationId,
    branch_id: entry.branchId,
    actor_type: "platform_admin",
    actor_id: entry.platformAdminId ?? null,
    actor_label: "Platform admin",
    action: entry.action,
    entity_type: "member",
    entity_id: entry.memberId,
    target_label: entry.memberName,
    metadata_json: {
      organization_id: entry.organizationId,
      branch_id: entry.branchId,
      member_id: entry.memberId,
      previous_status: entry.previousStatus ?? null,
      new_status: entry.newStatus ?? null,
      reason: entry.reason ?? null,
      action_source: "platform_member_support",
    },
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {string} passwordHash
 * @param {number | null} platformAdminId
 */
async function resetMemberPasswordForPlatform(pool, memberId, passwordHash, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await findMemberForPlatformAction(client, memberId);
    if (!existing) {
      throw Object.assign(new Error("Member not found."), { code: "NOT_FOUND" });
    }

    await client.query(
      `UPDATE public.church_members
       SET password_hash = $2,
           platform_last_password_reset_at = now(),
           platform_password_reset_by_admin_id = $3,
           updated_at = now()
       WHERE id = $1`,
      [memberId, passwordHash, platformAdminId || null]
    );

    await recordPlatformMemberSupportAudit(client, {
      organizationId: existing.organization_id,
      branchId: existing.branch_id,
      memberId: existing.id,
      memberName: existing.full_name,
      platformAdminId,
      action: "platform_member_password_reset",
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
 * @param {number} memberId
 * @param {string} reason
 * @param {number | null} platformAdminId
 */
async function suspendMemberForPlatform(pool, memberId, reason, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await findMemberForPlatformAction(client, memberId);
    if (!existing) {
      throw Object.assign(new Error("Member not found."), { code: "NOT_FOUND" });
    }
    if (existing.status !== "verified") {
      throw Object.assign(new Error("Only verified members can be suspended."), { code: "INVALID_STATUS" });
    }

    const r = await client.query(
      `UPDATE public.church_members
       SET status = 'suspended',
           suspended_at = now(),
           platform_status_updated_at = now(),
           platform_status_updated_by_admin_id = $2,
           platform_status_reason = $3,
           review_comment = CASE WHEN $3::text <> '' THEN $3 ELSE review_comment END,
           updated_at = now()
       WHERE id = $1
         AND status = 'verified'
       RETURNING id`,
      [memberId, platformAdminId || null, reason]
    );
    if (!r.rows[0]) {
      throw Object.assign(new Error("Only verified members can be suspended."), { code: "INVALID_STATUS" });
    }

    await recordPlatformMemberSupportAudit(client, {
      organizationId: existing.organization_id,
      branchId: existing.branch_id,
      memberId: existing.id,
      memberName: existing.full_name,
      platformAdminId,
      action: "platform_member_suspended",
      previousStatus: existing.status,
      newStatus: "suspended",
      reason,
    });

    await client.query("COMMIT");
    return { ...existing, status: "suspended" };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {string | null} reason
 * @param {number | null} platformAdminId
 */
async function reactivateMemberForPlatform(pool, memberId, reason, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await findMemberForPlatformAction(client, memberId);
    if (!existing) {
      throw Object.assign(new Error("Member not found."), { code: "NOT_FOUND" });
    }
    if (existing.status !== "suspended") {
      throw Object.assign(new Error("Only suspended members can be reactivated."), { code: "INVALID_STATUS" });
    }

    const seatQuota = require("../../../services/church/churchSeatQuotaService");
    await seatQuota.assertCanActivateMemberLocked(client, {
      organizationId: existing.organization_id,
      branchId: existing.branch_id,
      memberId: existing.id,
      currentStatus: existing.status,
      actorType: "platform_admin",
      actorId: platformAdminId,
    });

    const r = await client.query(
      `UPDATE public.church_members
       SET status = 'verified',
           reactivated_at = now(),
           platform_status_updated_at = now(),
           platform_status_updated_by_admin_id = $2,
           platform_status_reason = $3,
           updated_at = now()
       WHERE id = $1
         AND status = 'suspended'
       RETURNING id`,
      [memberId, platformAdminId || null, reason]
    );
    if (!r.rows[0]) {
      throw Object.assign(new Error("Only suspended members can be reactivated."), { code: "INVALID_STATUS" });
    }

    await recordPlatformMemberSupportAudit(client, {
      organizationId: existing.organization_id,
      branchId: existing.branch_id,
      memberId: existing.id,
      memberName: existing.full_name,
      platformAdminId,
      action: "platform_member_reactivated",
      previousStatus: existing.status,
      newStatus: "verified",
      reason,
    });

    await client.query("COMMIT");
    return { ...existing, status: "verified" };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {string | null} reason
 * @param {number | null} platformAdminId
 */
async function verifyMemberForPlatform(pool, memberId, reason, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await findMemberForPlatformAction(client, memberId);
    if (!existing) {
      throw Object.assign(new Error("Member not found."), { code: "NOT_FOUND" });
    }
    if (existing.status === "verified") {
      throw Object.assign(new Error("Member is already verified."), { code: "ALREADY_VERIFIED" });
    }
    if (!["pending", "rejected", "suspended"].includes(existing.status)) {
      throw Object.assign(new Error("Member cannot be verified from current status."), { code: "INVALID_STATUS" });
    }

    const seatQuota = require("../../../services/church/churchSeatQuotaService");
    await seatQuota.assertCanActivateMemberLocked(client, {
      organizationId: existing.organization_id,
      branchId: existing.branch_id,
      memberId: existing.id,
      currentStatus: existing.status,
      actorType: "platform_admin",
      actorId: platformAdminId,
    });

    const r = await client.query(
      `UPDATE public.church_members
       SET status = 'verified',
           reactivated_at = CASE WHEN status = 'suspended' THEN now() ELSE reactivated_at END,
           platform_status_updated_at = now(),
           platform_status_updated_by_admin_id = $2,
           platform_status_reason = $3,
           review_comment = CASE WHEN $3::text IS NOT NULL AND $3::text <> '' THEN $3 ELSE review_comment END,
           updated_at = now()
       WHERE id = $1
         AND status IN ('pending', 'rejected', 'suspended')
       RETURNING id`,
      [memberId, platformAdminId || null, reason]
    );
    if (!r.rows[0]) {
      throw Object.assign(new Error("Member cannot be verified from current status."), { code: "INVALID_STATUS" });
    }

    await recordPlatformMemberSupportAudit(client, {
      organizationId: existing.organization_id,
      branchId: existing.branch_id,
      memberId: existing.id,
      memberName: existing.full_name,
      platformAdminId,
      action: "platform_member_verified",
      previousStatus: existing.status,
      newStatus: "verified",
      reason,
    });

    await client.query("COMMIT");
    return { ...existing, status: "verified" };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  findMemberSupportDetailById,
  getMemberSupportSummary,
  getMemberMinistrySummaryForSupport,
  getMemberRequestSummaryForSupport,
  getMemberDutySummaryForSupport,
  getMemberLoginContextForSupport,
  listMemberAuditEventsForSupport,
  findMemberForPlatformAction,
  recordPlatformMemberSupportAudit,
  resetMemberPasswordForPlatform,
  suspendMemberForPlatform,
  reactivateMemberForPlatform,
  verifyMemberForPlatform,
};
