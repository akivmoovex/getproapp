"use strict";

/**
 * Foundation / Growth member and privileged-account seat quotas.
 *
 * Active members (compatible definition):
 *   church_members.status = 'verified'
 *   - Can sign in (member portal / login gates require verified).
 *   - pending = visitor/applicant (not counted; creation still allowed at cap).
 *   - rejected = not counted.
 *   - suspended = permanently inactive stand-in (maps archived / deceased /
 *     transferred / permanently inactive exclusions until those statuses exist).
 *
 * 12-month activity participation is not enforced separately: attendance and many
 * workflows are not reliably member-linked today. Verified remains the access gate.
 *
 * Privileged accounts counted (status = 'active'):
 *   - church_hq_admins
 *   - church_branch_admins
 *   - church_ministry_leaders (branch-scoped leadership)
 */

const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const { FAIR_USE } = require("../../church/blessBoardPackageCatalogue");
const { getNumericLimit, getOrganisationPlan } = require("./churchEntitlementService");
const { formatHardLimitFailureMessage } = require("../../church/blessBoardQuotaWarnings");

const FOUNDATION_MEMBER_LIMIT_ERROR = formatHardLimitFailureMessage("members", {
  packageLabel: "Foundation",
});

const FOUNDATION_ADMIN_LIMIT_ERROR = formatHardLimitFailureMessage("admins", {
  packageLabel: "Foundation",
});

const COUNTED_PRIVILEGED_ROLES = [
  "church_hq_admins (status=active)",
  "church_branch_admins (status=active)",
  "church_ministry_leaders (status=active)",
];

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {{ excludeMemberId?: number | null }} [opts]
 */
async function countActiveMembersForOrganization(db, organizationId, opts = {}) {
  const excludeId = opts.excludeMemberId != null ? Number(opts.excludeMemberId) : null;
  if (Number.isFinite(excludeId) && excludeId > 0) {
    const r = await db.query(
      `SELECT COUNT(m.id)::int AS c
       FROM public.church_members m
       INNER JOIN public.church_branches b ON b.id = m.branch_id
       WHERE b.organization_id = $1
         AND m.status = 'verified'
         AND m.id <> $2`,
      [organizationId, excludeId]
    );
    return r.rows[0]?.c ?? 0;
  }
  const r = await db.query(
    `SELECT COUNT(m.id)::int AS c
     FROM public.church_members m
     INNER JOIN public.church_branches b ON b.id = m.branch_id
     WHERE b.organization_id = $1
       AND m.status = 'verified'`,
    [organizationId]
  );
  return r.rows[0]?.c ?? 0;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {{
 *   excludeHqAdminId?: number | null,
 *   excludeBranchAdminId?: number | null,
 *   excludeMinistryLeaderId?: number | null,
 * }} [opts]
 */
async function countPrivilegedAccountsForOrganization(db, organizationId, opts = {}) {
  const r = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM public.church_hq_admins
         WHERE organization_id = $1 AND status = 'active'
           AND ($2::int IS NULL OR id <> $2)) AS hq_count,
       (SELECT COUNT(*)::int FROM public.church_branch_admins
         WHERE organization_id = $1 AND status = 'active'
           AND ($3::int IS NULL OR id <> $3)) AS branch_admin_count,
       (SELECT COUNT(*)::int
         FROM public.church_ministry_leaders ml
         INNER JOIN public.church_branches b ON b.id = ml.branch_id
         WHERE b.organization_id = $1 AND ml.status = 'active'
           AND ($4::int IS NULL OR ml.id <> $4)) AS ministry_leader_count`,
    [
      organizationId,
      opts.excludeHqAdminId != null ? Number(opts.excludeHqAdminId) : null,
      opts.excludeBranchAdminId != null ? Number(opts.excludeBranchAdminId) : null,
      opts.excludeMinistryLeaderId != null ? Number(opts.excludeMinistryLeaderId) : null,
    ]
  );
  const row = r.rows[0] || {};
  const hq = row.hq_count || 0;
  const branchAdmins = row.branch_admin_count || 0;
  const leaders = row.ministry_leader_count || 0;
  return {
    total: hq + branchAdmins + leaders,
    hq_admin_count: hq,
    branch_admin_count: branchAdmins,
    ministry_leader_count: leaders,
  };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 */
async function getOrganisationSeatUsage(db, organizationId) {
  const org = await organizationsRepo.findOrganizationById(db, organizationId);
  if (!org) return null;
  const plan = await getOrganisationPlan(db, organizationId);
  const activeMembers = await countActiveMembersForOrganization(db, organizationId);
  const privileged = await countPrivilegedAccountsForOrganization(db, organizationId);
  const memberLimit = getNumericLimit(plan, "members.max_active");
  const adminLimit = getNumericLimit(plan, "admins.max");

  return {
    organizationId,
    packageCode: plan.packageCode,
    packageLabel: plan.packageLabel,
    activeMembers,
    memberLimit,
    membersDisplay:
      memberLimit === FAIR_USE || memberLimit == null
        ? `${activeMembers} / fair use`
        : `${activeMembers} / ${memberLimit}`,
    memberAtLimit:
      typeof memberLimit === "number" && activeMembers >= memberLimit,
    privilegedAccounts: privileged.total,
    privilegedBreakdown: privileged,
    adminLimit,
    adminsDisplay:
      adminLimit === FAIR_USE || adminLimit == null
        ? `${privileged.total} / fair use`
        : `${privileged.total} / ${adminLimit}`,
    adminAtLimit: typeof adminLimit === "number" && privileged.total >= adminLimit,
    countedPrivilegedRoles: COUNTED_PRIVILEGED_ROLES,
    activeMemberDefinition:
      "verified members (can sign in). pending=visitor/applicant; suspended=inactive exclusion.",
  };
}

async function recordQuotaBlock(db, entry) {
  await auditLogsRepo.insertAuditLog(db, {
    organization_id: entry.organizationId,
    branch_id: entry.branchId || null,
    actor_type: entry.actorType || "system",
    actor_id: entry.actorId || null,
    action: entry.action,
    entity_type: entry.entityType || "church_organization",
    entity_id: entry.entityId || entry.organizationId,
    target_label: entry.targetLabel || null,
    metadata_json: {
      package_code: entry.packageCode || null,
      quota_key: entry.quotaKey,
      used: entry.used,
      limit: entry.limit,
      message: entry.message,
      ...(entry.metadata || {}),
    },
  });
}

/**
 * Must run inside an open transaction on `client` (caller holds org row lock).
 * @param {import("pg").PoolClient} client
 */
async function assertCanActivateMemberLocked(client, opts) {
  const organizationId = Number(opts.organizationId);
  if (String(opts.currentStatus || "") === "verified") {
    return { allowed: true, alreadyActive: true };
  }

  await client.query(`SELECT id FROM public.church_organizations WHERE id = $1 FOR UPDATE`, [
    organizationId,
  ]);

  const plan = await getOrganisationPlan(client, organizationId);
  const limit = getNumericLimit(plan, "members.max_active");
  const used = await countActiveMembersForOrganization(client, organizationId, {
    excludeMemberId: opts.memberId,
  });

  if (limit === FAIR_USE || limit == null) {
    return { allowed: true, used, limit, packageCode: plan.packageCode };
  }

  if (typeof limit === "number" && used >= limit) {
    const message = formatHardLimitFailureMessage("members", {
      packageLabel: plan.packageLabel,
      used,
      limit,
    });
    await recordQuotaBlock(client, {
      organizationId,
      branchId: opts.branchId,
      actorType: opts.actorType,
      actorId: opts.actorId,
      action: "package_quota_member_blocked",
      entityType: "church_member",
      entityId: opts.memberId || organizationId,
      packageCode: plan.packageCode,
      quotaKey: "members.max_active",
      used,
      limit,
      message,
    });
    throw Object.assign(new Error(message), {
      code: "FOUNDATION_MEMBER_LIMIT",
      packageCode: plan.packageCode,
      used,
      limit,
    });
  }

  return { allowed: true, used, limit, packageCode: plan.packageCode };
}

/**
 * Pool-friendly wrapper: opens a short transaction for the check only.
 * Prefer transactional activate helpers that call assertCanActivateMemberLocked.
 */
async function assertCanActivateMember(pool, opts) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await assertCanActivateMemberLocked(client, opts);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").PoolClient} client
 */
async function assertCanAssignPrivilegedRoleLocked(client, opts) {
  const organizationId = Number(opts.organizationId);
  await client.query(`SELECT id FROM public.church_organizations WHERE id = $1 FOR UPDATE`, [
    organizationId,
  ]);

  const plan = await getOrganisationPlan(client, organizationId);
  const limit = getNumericLimit(plan, "admins.max");
  const privileged = await countPrivilegedAccountsForOrganization(client, organizationId, {
    excludeHqAdminId: opts.excludeHqAdminId,
    excludeBranchAdminId: opts.excludeBranchAdminId,
    excludeMinistryLeaderId: opts.excludeMinistryLeaderId,
  });
  const used = privileged.total;

  if (limit === FAIR_USE || limit == null) {
    return { allowed: true, used, limit, packageCode: plan.packageCode, privileged };
  }

  if (typeof limit === "number" && used >= limit) {
    const message = formatHardLimitFailureMessage("admins", {
      packageLabel: plan.packageLabel,
      used,
      limit,
    });
    await recordQuotaBlock(client, {
      organizationId,
      branchId: opts.branchId,
      actorType: opts.actorType,
      actorId: opts.actorId,
      action: "package_quota_admin_blocked",
      entityType: "church_privileged_account",
      entityId: organizationId,
      packageCode: plan.packageCode,
      quotaKey: "admins.max",
      used,
      limit,
      message,
      metadata: { role: opts.roleLabel || null, breakdown: privileged },
    });
    throw Object.assign(new Error(message), {
      code: "FOUNDATION_ADMIN_LIMIT",
      packageCode: plan.packageCode,
      used,
      limit,
    });
  }

  return { allowed: true, used, limit, packageCode: plan.packageCode, privileged };
}

async function assertCanAssignPrivilegedRole(pool, opts) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await assertCanAssignPrivilegedRoleLocked(client, opts);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function findOrganizationIdForBranch(db, branchId) {
  const r = await db.query(`SELECT organization_id FROM public.church_branches WHERE id = $1 LIMIT 1`, [
    branchId,
  ]);
  return r.rows[0] ? Number(r.rows[0].organization_id) : null;
}

module.exports = {
  FOUNDATION_MEMBER_LIMIT_ERROR,
  FOUNDATION_ADMIN_LIMIT_ERROR,
  COUNTED_PRIVILEGED_ROLES,
  countActiveMembersForOrganization,
  countPrivilegedAccountsForOrganization,
  getOrganisationSeatUsage,
  assertCanActivateMember,
  assertCanActivateMemberLocked,
  assertCanAssignPrivilegedRole,
  assertCanAssignPrivilegedRoleLocked,
  findOrganizationIdForBranch,
};
