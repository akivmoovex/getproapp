"use strict";

/**
 * Tenant-aware unified login coordinator.
 * Reuses existing role repositories and password verification.
 * Hostname establishes context; DB assignments establish authority.
 * Platform super-admin remains on dedicated apex /admin/login.
 */

const membersRepo = require("../../db/pg/church/membersRepo");
const ministryLeadersRepo = require("../../db/pg/church/ministryLeadersRepo");
const branchAdminsRepo = require("../../db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../../db/pg/church/hqAdminsRepo");
const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const hqBranchesRepo = require("../../db/pg/church/hqBranchesRepo");
const loginAttemptsRepo = require("../../db/pg/church/loginAttemptsRepo");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const { verifyMemberPassword } = require("../../church/memberAuth");
const { isOperationalStatus } = require("../../church/churchStatusAccess");
const {
  GENERIC_LOGIN_FAILURE,
  LOCKOUT_MESSAGE,
  MISSING_FIELDS_MESSAGE,
  normalizeLoginIdentifier,
  requestLoginMeta,
  maskLoginIdentifier,
} = require("../../church/loginProtection");

const UNIFIED_LOGIN_FAILURE = "The sign-in details were not recognized.";
const TENANT_MISMATCH_MESSAGE =
  "This account cannot sign in through this church. Please choose the church linked to your account.";
const ORG_UNAVAILABLE_MESSAGE =
  "This church is temporarily unavailable. Please try again later or contact the church office.";

const ROLE_PRECEDENCE = ["hq_admin", "branch_admin", "ministry_leader", "member"];

const ROLE_DESTINATIONS = {
  hq_admin: "/hq/dashboard",
  branch_admin: "/branch/dashboard",
  ministry_leader: "/leader/dashboard",
  member_verified: "/member/dashboard",
  member_pending: "/waiting-verification",
};

const ROLE_LABELS = {
  hq_admin: "HQ Administrator",
  branch_admin: "Branch Administrator",
  ministry_leader: "Ministry Leader",
  member: "Member",
};

function destinationForRole(role) {
  if (role.type === "member") {
    return role.status === "pending" ? ROLE_DESTINATIONS.member_pending : ROLE_DESTINATIONS.member_verified;
  }
  return ROLE_DESTINATIONS[role.type] || "/";
}

function isAccountLocked(row) {
  return loginAttemptsRepo.isAccountLocked(row);
}

function sortRolesByPrecedence(roles) {
  return [...roles].sort(
    (a, b) => ROLE_PRECEDENCE.indexOf(a.type) - ROLE_PRECEDENCE.indexOf(b.type)
  );
}

/**
 * One failed request must penalize at most one account record.
 * Prefer the highest-precedence unlocked candidate with a password hash.
 */
function pickCanonicalLockoutTarget(candidates) {
  const eligible = (candidates || []).filter(
    (c) => c && c.row && c.row.password_hash && !isAccountLocked(c.row)
  );
  if (eligible.length === 0) return null;
  return eligible
    .slice()
    .sort((a, b) => ROLE_PRECEDENCE.indexOf(a.type) - ROLE_PRECEDENCE.indexOf(b.type))[0];
}

function accountTypeForRoleType(type) {
  if (type === "member") return "member";
  if (type === "ministry_leader") return "ministry_leader";
  if (type === "branch_admin") return "branch_admin";
  if (type === "hq_admin") return "hq_admin";
  return null;
}

async function loadAccountRow(pool, roleType, accountId) {
  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (roleType === "member") return membersRepo.findMemberById(pool, id);
  if (roleType === "ministry_leader") return ministryLeadersRepo.findLeaderById(pool, id);
  if (roleType === "branch_admin") return branchAdminsRepo.findBranchAdminById(pool, id);
  if (roleType === "hq_admin") return hqAdminsRepo.findHqAdminById(pool, id);
  return null;
}

/**
 * Recheck DB status + tenant assignment before finalizing a portal choice.
 */
async function revalidateChosenRole(pool, organization, branch, choiceRole) {
  if (!choiceRole || !choiceRole.type || choiceRole.accountId == null) {
    return { ok: false, error: UNIFIED_LOGIN_FAILURE };
  }
  const orgCheck = await requireActiveOrganization(pool, organization);
  if (!orgCheck.ok) {
    return { ok: false, orgUnavailable: true, error: ORG_UNAVAILABLE_MESSAGE };
  }
  const activeOrg = orgCheck.organization;
  const freshBranch =
    (await loadBranchForOrganization(pool, activeOrg.id, branch.id)) || branch;
  const row = await loadAccountRow(pool, choiceRole.type, choiceRole.accountId);
  if (!row) return { ok: false, error: UNIFIED_LOGIN_FAILURE };
  if (isAccountLocked(row)) return { ok: false, error: LOCKOUT_MESSAGE };
  const accountType = accountTypeForRoleType(choiceRole.type);
  const validated = validateLocalRole({ type: choiceRole.type, accountType, row }, activeOrg, freshBranch);
  if (!validated.ok) {
    if (validated.reason === "org_inactive") {
      return { ok: false, orgUnavailable: true, error: ORG_UNAVAILABLE_MESSAGE };
    }
    return {
      ok: false,
      error: validated.reason === "status" ? validated.error || UNIFIED_LOGIN_FAILURE : UNIFIED_LOGIN_FAILURE,
    };
  }
  return { ok: true, role: validated.role };
}

async function clearExpiredLockIfNeeded(pool, accountType, row) {
  if (row.login_locked_until && !isAccountLocked(row)) {
    await loginAttemptsRepo.clearExpiredLoginLockForAccount(pool, accountType, row.id);
    row.login_locked_until = null;
    row.failed_login_attempts = 0;
  }
}

/**
 * Look up candidate accounts for this tenant host context only.
 */
async function findLocalCandidates(pool, org, branch, identifier) {
  const [member, leader, branchAdmin, hqAdmin] = await Promise.all([
    membersRepo.findMemberByEmailOrPhoneForBranch(pool, branch.id, identifier),
    ministryLeadersRepo.findLeaderByEmailOrPhoneForBranch(pool, branch.id, identifier),
    branchAdminsRepo.findBranchAdminByEmailOrPhoneForBranch(pool, branch.id, identifier),
    hqAdminsRepo.findHqAdminByEmailOrPhoneForOrganization(pool, org.id, identifier),
  ]);

  const out = [];
  if (member) out.push({ type: "member", accountType: "member", row: member });
  if (leader) out.push({ type: "ministry_leader", accountType: "ministry_leader", row: leader });
  if (branchAdmin) out.push({ type: "branch_admin", accountType: "branch_admin", row: branchAdmin });
  if (hqAdmin) out.push({ type: "hq_admin", accountType: "hq_admin", row: hqAdmin });
  return out;
}

/**
 * After credentials verified elsewhere, detect tenant mismatch without pre-auth enumeration.
 */
async function credentialsMatchForeignTenant(pool, org, branch, identifier, password) {
  const email = identifier.includes("@")
    ? String(identifier).trim().toLowerCase().slice(0, 254)
    : "";
  const phoneNorm = identifier.includes("@")
    ? ""
    : String(identifier || "").replace(/\D/g, "").slice(0, 32);
  if (!email && !phoneNorm) return false;

  const r = await pool.query(
    `SELECT 'member' AS kind, m.id, m.password_hash, m.organization_id, m.branch_id
     FROM public.church_members m
     WHERE (
       ($1 <> '' AND lower(trim(m.email)) = $1)
       OR ($2 <> '' AND m.phone_normalized = $2)
     )
       AND NOT (m.organization_id = $3 AND m.branch_id = $4)
     UNION ALL
     SELECT 'ministry_leader', l.id, l.password_hash, l.organization_id, l.branch_id
     FROM public.church_ministry_leaders l
     WHERE (
       ($1 <> '' AND lower(trim(l.email)) = $1)
       OR ($2 <> '' AND l.phone_normalized = $2)
     )
       AND NOT (l.organization_id = $3 AND l.branch_id = $4)
     UNION ALL
     SELECT 'branch_admin', ba.id, ba.password_hash, ba.organization_id, ba.branch_id
     FROM public.church_branch_admins ba
     WHERE ba.status = 'active'
       AND (
         ($1 <> '' AND lower(trim(ba.email)) = $1)
         OR ($2 <> '' AND ba.phone_normalized = $2)
         OR ($1 <> '' AND lower(trim(ba.username)) = $1)
       )
       AND NOT (ba.organization_id = $3 AND ba.branch_id = $4)
     UNION ALL
     SELECT 'hq_admin', ha.id, ha.password_hash, ha.organization_id, NULL::int
     FROM public.church_hq_admins ha
     WHERE ha.status = 'active'
       AND (
         ($1 <> '' AND lower(trim(ha.email)) = $1)
         OR ($2 <> '' AND ha.phone_normalized = $2)
         OR ($1 <> '' AND lower(trim(ha.username)) = $1)
       )
       AND ha.organization_id <> $3
     LIMIT 20`,
    [email, phoneNorm, org.id, branch.id]
  );

  for (const row of r.rows) {
    if (!row.password_hash) continue;
    if (await verifyMemberPassword(password, row.password_hash)) return true;
  }
  return false;
}

function validateLocalRole(candidate, org, branch) {
  const { type, row } = candidate;

  if (type === "member") {
    if (Number(row.organization_id) !== Number(org.id)) return { ok: false, reason: "tenant" };
    if (Number(row.branch_id) !== Number(branch.id)) return { ok: false, reason: "tenant" };
    if (!isOperationalStatus(branch.status)) {
      return { ok: false, reason: "branch_inactive" };
    }
    if (row.status === "rejected") {
      return {
        ok: false,
        reason: "status",
        error:
          "Your membership request was not approved. Please contact the church office if you believe this is an error.",
      };
    }
    if (row.status === "suspended") {
      return {
        ok: false,
        reason: "status",
        error:
          "Your member access is currently suspended. Please contact the church office for assistance.",
      };
    }
    if (row.status !== "pending" && row.status !== "verified") {
      return {
        ok: false,
        reason: "status",
        error: "Unable to sign in right now. Please contact the church office.",
      };
    }
    return {
      ok: true,
      role: {
        type: "member",
        status: row.status,
        label: ROLE_LABELS.member,
        destination: destinationForRole({ type: "member", status: row.status }),
        sessionPayload: {
          member_id: row.id,
          organization_id: row.organization_id,
          branch_id: row.branch_id,
          status: row.status,
          full_name: row.full_name,
        },
        accountId: row.id,
        full_name: row.full_name,
      },
    };
  }

  if (type === "ministry_leader") {
    if (Number(row.organization_id) !== Number(org.id)) return { ok: false, reason: "tenant" };
    if (Number(row.branch_id) !== Number(branch.id)) return { ok: false, reason: "tenant" };
    if (!isOperationalStatus(branch.status)) {
      return { ok: false, reason: "branch_inactive" };
    }
    if (row.status === "inactive") {
      return {
        ok: false,
        reason: "status",
        error: "Your ministry leader access is inactive. Please contact the church office.",
      };
    }
    if (row.status !== "active") {
      return {
        ok: false,
        reason: "status",
        error: "Unable to sign in right now. Please contact the church office.",
      };
    }
    return {
      ok: true,
      role: {
        type: "ministry_leader",
        status: row.status,
        label: ROLE_LABELS.ministry_leader,
        destination: ROLE_DESTINATIONS.ministry_leader,
        sessionPayload: {
          leader_id: row.id,
          organization_id: row.organization_id,
          branch_id: row.branch_id,
          ministry_id: row.ministry_id || null,
          full_name: row.full_name,
          role: row.role || "ministry_leader",
          status: row.status,
        },
        accountId: row.id,
        full_name: row.full_name,
      },
    };
  }

  if (type === "branch_admin") {
    if (Number(row.organization_id) !== Number(org.id)) return { ok: false, reason: "tenant" };
    if (Number(row.branch_id) !== Number(branch.id)) return { ok: false, reason: "tenant" };
    if (!isOperationalStatus(branch.status)) {
      return { ok: false, reason: "branch_inactive" };
    }
    if (row.status !== "active") {
      return {
        ok: false,
        reason: "status",
        error: "Unable to sign in right now. Please contact the church office.",
      };
    }
    return {
      ok: true,
      role: {
        type: "branch_admin",
        status: row.status,
        label: ROLE_LABELS.branch_admin,
        destination: ROLE_DESTINATIONS.branch_admin,
        sessionPayload: {
          admin_id: row.id,
          organization_id: row.organization_id,
          branch_id: row.branch_id,
          full_name: row.full_name || row.display_name || "Branch Admin",
          role: row.role || "branch_admin",
          status: row.status,
        },
        accountId: row.id,
        full_name: row.full_name || row.display_name || "Branch Admin",
      },
    };
  }

  if (type === "hq_admin") {
    if (Number(row.organization_id) !== Number(org.id)) return { ok: false, reason: "tenant" };
    // HQ requires an active organization. Branch must belong to the org (host context);
    // an inactive branch does not block HQ and must not escalate other roles to HQ.
    if (!isOperationalStatus(org.status)) {
      return { ok: false, reason: "org_inactive" };
    }
    if (row.status !== "active") {
      return {
        ok: false,
        reason: "status",
        error: "Unable to sign in right now. Please contact the church office.",
      };
    }
    return {
      ok: true,
      role: {
        type: "hq_admin",
        status: row.status,
        label: ROLE_LABELS.hq_admin,
        destination: ROLE_DESTINATIONS.hq_admin,
        sessionPayload: {
          hq_admin_id: row.id,
          organization_id: row.organization_id,
          full_name: row.full_name,
          role: row.role || "hq_admin",
          status: row.status,
        },
        accountId: row.id,
        full_name: row.full_name,
      },
    };
  }

  return { ok: false, reason: "unknown" };
}

/**
 * Reload organization status from the database (source of truth).
 * @returns {Promise<{ ok: true, organization: object } | { ok: false, orgUnavailable: true }>}
 */
async function requireActiveOrganization(pool, organization) {
  if (!organization || organization.id == null) {
    return { ok: false, orgUnavailable: true };
  }
  if (!isOperationalStatus(organization.status)) {
    return { ok: false, orgUnavailable: true };
  }
  const fresh = await organizationsRepo.findOrganizationById(pool, organization.id);
  if (!fresh || !isOperationalStatus(fresh.status)) {
    return { ok: false, orgUnavailable: true };
  }
  return { ok: true, organization: fresh };
}

/**
 * Reload branch row for the organization (membership check).
 */
async function loadBranchForOrganization(pool, organizationId, branchId) {
  return hqBranchesRepo.findBranchByIdForOrganization(pool, branchId, organizationId);
}

async function rejectOrgUnavailable(pool, req, organization, branch, normalizedIdentifier) {
  await recordAttempt(pool, req, {
    organizationId: organization && organization.id,
    branchId: branch && branch.id,
    accountType: "member",
    accountId: null,
    identifierNormalized: normalizedIdentifier || "",
    success: false,
    failureReason: "organization_unavailable",
  });
  await recordSafeAudit(pool, organization, branch, "tenant_login_org_unavailable", "anonymous", null, {
    identifier_masked: maskLoginIdentifier(normalizedIdentifier || ""),
  });
  return {
    ok: false,
    orgUnavailable: true,
    clearSessions: true,
    error: ORG_UNAVAILABLE_MESSAGE,
  };
}

async function recordAttempt(pool, req, opts) {
  const meta = requestLoginMeta(req);
  await loginAttemptsRepo.recordLoginAttempt(pool, {
    organization_id: opts.organizationId,
    branch_id: opts.branchId,
    account_type: opts.accountType,
    account_id: opts.accountId ?? null,
    identifier_normalized: opts.identifierNormalized,
    success: Boolean(opts.success),
    failure_reason: opts.failureReason || null,
    ip_address: meta.ip_address,
    user_agent: meta.user_agent,
  });
}

async function recordSafeAudit(pool, org, branch, action, actorType, actorId, metadata) {
  try {
    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: org.id,
      branch_id: branch && branch.id != null ? branch.id : null,
      actor_type: actorType,
      actor_id: actorId || null,
      action,
      entity_type: "auth",
      entity_id: actorId || null,
      metadata_json: metadata || {},
    });
  } catch {
    /* audit must not block login */
  }
}

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   error?: string,
 *   clearSessions?: boolean,
 *   roles?: object[],
 *   primaryRole?: object,
 *   needsPortalChoice?: boolean,
 *   tenantMismatch?: boolean
 * }>}
 */
async function authenticateTenantUnifiedLogin(pool, req, { organization, branch, identifier, password }) {
  const ident = String(identifier || "").trim();
  const pass = String(password || "");
  const normalizedIdentifier = normalizeLoginIdentifier(ident);

  if (!ident || !pass) {
    return { ok: false, error: MISSING_FIELDS_MESSAGE };
  }

  // 1) Organization status after host resolution — before any role selection.
  if (!isOperationalStatus(organization && organization.status)) {
    return rejectOrgUnavailable(pool, req, organization, branch, normalizedIdentifier);
  }

  // Ignore any client-posted role / org / branch / redirect fields by never reading them.
  const candidates = await findLocalCandidates(pool, organization, branch, ident);

  for (const c of candidates) {
    await clearExpiredLockIfNeeded(pool, c.accountType, c.row);
  }

  const lockedCandidates = candidates.filter((c) => isAccountLocked(c.row));
  if (candidates.length > 0 && lockedCandidates.length === candidates.length) {
    await recordAttempt(pool, req, {
      organizationId: organization.id,
      branchId: branch.id,
      accountType: lockedCandidates[0].accountType,
      accountId: lockedCandidates[0].row.id,
      identifierNormalized: normalizedIdentifier,
      success: false,
      failureReason: "locked",
    });
    return { ok: false, error: LOCKOUT_MESSAGE };
  }

  const passwordMatched = [];
  for (const c of candidates) {
    if (isAccountLocked(c.row)) continue;
    if (!c.row.password_hash) continue;
    const ok = await verifyMemberPassword(pass, c.row.password_hash);
    if (ok) passwordMatched.push(c);
  }

  if (passwordMatched.length === 0) {
    if (candidates.length > 0) {
      const target = pickCanonicalLockoutTarget(candidates);
      if (target) {
        const { failedAttempts, locked } = await loginAttemptsRepo.incrementFailedLoginForAccount(
          pool,
          target.accountType,
          target.row.id
        );
        await recordAttempt(pool, req, {
          organizationId: organization.id,
          branchId: branch.id,
          accountType: target.accountType,
          accountId: target.row.id,
          identifierNormalized: normalizedIdentifier,
          success: false,
          failureReason: locked ? "locked_after_failure" : "invalid_password",
        });
        await recordSafeAudit(pool, organization, branch, "tenant_login_failed", "anonymous", null, {
          identifier_masked: maskLoginIdentifier(normalizedIdentifier),
          failure_reason: locked ? "locked_after_failure" : "invalid_password",
        });
        if (locked) {
          await loginAttemptsRepo.recordLoginLockAudit(pool, {
            accountType: target.accountType,
            accountId: target.row.id,
            organizationId: organization.id,
            branchId: branch.id,
            identifierNormalized: normalizedIdentifier,
            failedAttempts,
          });
          return { ok: false, error: LOCKOUT_MESSAGE };
        }
      } else {
        await recordAttempt(pool, req, {
          organizationId: organization.id,
          branchId: branch.id,
          accountType: candidates[0].accountType,
          accountId: candidates[0].row.id,
          identifierNormalized: normalizedIdentifier,
          success: false,
          failureReason: "locked",
        });
        return { ok: false, error: LOCKOUT_MESSAGE };
      }
      return { ok: false, error: UNIFIED_LOGIN_FAILURE };
    }

    // No local candidates — only after verifying foreign credentials may we say tenant mismatch.
    const foreign = await credentialsMatchForeignTenant(pool, organization, branch, ident, pass);
    if (foreign) {
      await recordAttempt(pool, req, {
        organizationId: organization.id,
        branchId: branch.id,
        accountType: "member",
        accountId: null,
        identifierNormalized: normalizedIdentifier,
        success: false,
        failureReason: "tenant_mismatch",
      });
      await recordSafeAudit(pool, organization, branch, "tenant_login_tenant_mismatch", "anonymous", null, {
        identifier_masked: maskLoginIdentifier(normalizedIdentifier),
      });
      return { ok: false, error: TENANT_MISMATCH_MESSAGE, tenantMismatch: true };
    }

    await recordAttempt(pool, req, {
      organizationId: organization.id,
      branchId: branch.id,
      accountType: "member",
      accountId: null,
      identifierNormalized: normalizedIdentifier,
      success: false,
      failureReason: "invalid_identifier",
    });
    await recordSafeAudit(pool, organization, branch, "tenant_login_failed", "anonymous", null, {
      identifier_masked: maskLoginIdentifier(normalizedIdentifier),
      failure_reason: "invalid_identifier",
    });
    return { ok: false, error: UNIFIED_LOGIN_FAILURE };
  }

  // 2) Re-check organization from DB before final role selection / portal-choice state.
  const orgCheck = await requireActiveOrganization(pool, organization);
  if (!orgCheck.ok) {
    return rejectOrgUnavailable(pool, req, organization, branch, normalizedIdentifier);
  }
  const activeOrg = orgCheck.organization;

  const freshBranch =
    (await loadBranchForOrganization(pool, activeOrg.id, branch.id)) || branch;
  if (Number(freshBranch.organization_id) !== Number(activeOrg.id)) {
    return rejectOrgUnavailable(pool, req, activeOrg, branch, normalizedIdentifier);
  }

  const validRoles = [];
  let statusError = null;
  for (const c of passwordMatched) {
    const validated = validateLocalRole(c, activeOrg, freshBranch);
    if (validated.ok) {
      validRoles.push(validated.role);
    } else if (validated.reason === "status" && !statusError) {
      statusError = validated.error;
    }
  }

  if (validRoles.length === 0) {
    await recordAttempt(pool, req, {
      organizationId: activeOrg.id,
      branchId: freshBranch.id,
      accountType: passwordMatched[0].accountType,
      accountId: passwordMatched[0].row.id,
      identifierNormalized: normalizedIdentifier,
      success: false,
      failureReason: "account_status",
    });
    await recordSafeAudit(pool, activeOrg, freshBranch, "tenant_login_status_rejected", "anonymous", null, {
      identifier_masked: maskLoginIdentifier(normalizedIdentifier),
    });
    return {
      ok: false,
      error: statusError || UNIFIED_LOGIN_FAILURE,
      clearSessions: true,
    };
  }

  const sorted = sortRolesByPrecedence(validRoles);
  for (const role of sorted) {
    const accountType = accountTypeForRoleType(role.type);
    await loginAttemptsRepo.resetFailedLoginForAccount(pool, accountType, role.accountId);
  }

  const primary = sorted[0];
  await recordAttempt(pool, req, {
    organizationId: activeOrg.id,
    branchId: freshBranch.id,
    accountType: accountTypeForRoleType(primary.type),
    accountId: primary.accountId,
    identifierNormalized: normalizedIdentifier,
    success: true,
    failureReason: null,
  });

  await recordSafeAudit(
    pool,
    activeOrg,
    freshBranch,
    "tenant_login_success",
    primary.type,
    primary.accountId,
    {
      identifier_masked: maskLoginIdentifier(normalizedIdentifier),
      portal_choice_required: sorted.length > 1,
    }
  );

  return {
    ok: true,
    roles: sorted,
    primaryRole: primary,
    needsPortalChoice: sorted.length > 1,
  };
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session || typeof req.session.regenerate !== "function") {
      return resolve();
    }
    req.session.regenerate((err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

module.exports = {
  authenticateTenantUnifiedLogin,
  regenerateSession,
  destinationForRole,
  revalidateChosenRole,
  pickCanonicalLockoutTarget,
  requireActiveOrganization,
  ROLE_PRECEDENCE,
  ROLE_DESTINATIONS,
  ROLE_LABELS,
  UNIFIED_LOGIN_FAILURE,
  TENANT_MISMATCH_MESSAGE,
  ORG_UNAVAILABLE_MESSAGE,
  sortRolesByPrecedence,
};
