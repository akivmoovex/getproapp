"use strict";

/**
 * Platform Support Access + Account Manager service (MVP).
 * Centralized enforcement — routes must call assertCanPerformSupportAction.
 */

const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const repo = require("../../db/pg/church/platformSupportAccessRepo");
const catalogue = require("../../church/platformSupportAccessCatalogue");

const DEFAULT_ACCESS_HOURS = 8;
const MAX_ACCESS_HOURS = 72;

function err(code, message) {
  return Object.assign(new Error(message), { code });
}

function actorFromSession(adminUser) {
  if (!adminUser || !adminUser.id) return null;
  return {
    id: Number(adminUser.id),
    role: catalogue.normalizeRole(adminUser.role),
    username: adminUser.username || "",
    display_name: adminUser.display_name || adminUser.username || "",
    enabled: adminUser.enabled !== false && adminUser.enabled !== 0,
    tenant_id: adminUser.tenant_id != null ? Number(adminUser.tenant_id) : null,
  };
}

async function loadOrganization(db, organizationId) {
  const org = await organizationsRepo.findOrganizationById(db, organizationId);
  if (!org) throw err("ORG_NOT_FOUND", "Organisation not found");
  return org;
}

async function assertCountryScope(db, actor, organization) {
  const tenantId = Number(organization.platform_tenant_id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    throw err("COUNTRY_SCOPE_DENIED", "Organisation has no platform country scope");
  }
  if (catalogue.isSuperAdmin(actor.role)) return true;
  const ok = await repo.adminHasTenantScope(db, actor.id, tenantId);
  if (!ok) {
    throw err(
      "COUNTRY_SCOPE_DENIED",
      "Staff is outside this organisation's country scope"
    );
  }
  return true;
}

async function assertEligibleAccountManager(db, adminUserId, organization) {
  const user = await repo.findAdminUserSafe(db, adminUserId);
  if (!user || !user.enabled) {
    throw err("INELIGIBLE_MANAGER", "Account manager must be an active platform user");
  }
  if (!catalogue.ACCOUNT_MANAGER_ELIGIBLE_ROLES.has(catalogue.normalizeRole(user.role))) {
    throw err("INELIGIBLE_MANAGER", "Account manager role is not eligible for assignment");
  }
  const tenantId = Number(organization.platform_tenant_id);
  if (!catalogue.isSuperAdmin(user.role)) {
    const scoped = await repo.adminHasTenantScope(db, user.id, tenantId);
    if (!scoped) {
      throw err("COUNTRY_SCOPE_DENIED", "Account manager must share the organisation country scope");
    }
  }
  return user;
}

/**
 * Assign primary / backup account managers (country-scoped).
 */
async function assignAccountManagers(db, opts) {
  const actor = opts.actor || actorFromSession(opts.adminUser);
  if (!actor || !actor.enabled) throw err("SUPPORT_INACTIVE", "Actor account is inactive");
  if (!catalogue.canAssignAccountManagers(actor.role)) {
    throw err("FORBIDDEN", "Only country administrators may assign account managers");
  }

  const organization = await loadOrganization(db, opts.organizationId);
  await assertCountryScope(db, actor, organization);

  const primaryId = opts.primaryAdminUserId != null ? Number(opts.primaryAdminUserId) : null;
  const backupId = opts.backupAdminUserId != null ? Number(opts.backupAdminUserId) : null;
  if (primaryId) await assertEligibleAccountManager(db, primaryId, organization);
  if (backupId) await assertEligibleAccountManager(db, backupId, organization);
  if (primaryId && backupId && primaryId === backupId) {
    throw err("INVALID_ASSIGNMENT", "Primary and backup account managers must be different people");
  }

  const status = opts.status === "inactive" ? "inactive" : "active";
  const note = opts.internalNote != null ? String(opts.internalNote).trim().slice(0, 2000) : null;

  const row = await repo.upsertAccountManagers(db, {
    organization_id: organization.id,
    primary_admin_user_id: primaryId,
    backup_admin_user_id: backupId,
    status,
    assigned_by_admin_user_id: actor.id,
    internal_note: note || null,
  });

  await auditLogsRepo.insertAuditLog(db, {
    organization_id: organization.id,
    branch_id: null,
    actor_type: "platform_admin",
    actor_id: actor.id,
    action: "platform_account_managers_assigned",
    entity_type: "church_organization",
    entity_id: organization.id,
    target_label: organization.name,
    metadata_json: {
      primary_admin_user_id: primaryId,
      backup_admin_user_id: backupId,
      status,
      // internal_note intentionally omitted from church/platform audit metadata
    },
  });

  return row;
}

async function getAccountManagers(db, organizationId) {
  return repo.getAccountManagers(db, organizationId);
}

/**
 * Support staff requests time-limited access.
 */
async function requestSupportAccess(db, opts) {
  const actor = opts.actor || actorFromSession(opts.adminUser);
  if (!actor || !actor.enabled) throw err("SUPPORT_INACTIVE", "Support account is inactive");
  if (!catalogue.canRequestSupportAccess(actor.role)) {
    throw err("FORBIDDEN", "Role may not request support access");
  }

  const organization = await loadOrganization(db, opts.organizationId);
  await assertCountryScope(db, actor, organization);

  const scope = String(opts.requestedScope || "").trim();
  if (!catalogue.isValidSupportScope(scope)) {
    throw err("INVALID_SCOPE", "Requested scope is not in the allowed catalogue");
  }

  let branchId = opts.branchId != null ? Number(opts.branchId) : null;
  if (branchId) {
    const branch = await branchesRepo.findBranchByIdForPlatform(db, branchId);
    if (!branch || Number(branch.organization_id) !== Number(organization.id)) {
      throw err("BRANCH_SCOPE_DENIED", "Branch is not in the requested organisation");
    }
  } else {
    branchId = null;
  }

  const ticket = String(opts.ticketReference || "").trim().slice(0, 120);
  const reason = String(opts.reason || "").trim().slice(0, 2000);
  if (!ticket) throw err("INVALID_REQUEST", "Ticket / reference number is required");
  if (reason.length < 3) throw err("INVALID_REQUEST", "Reason must be at least 3 characters");

  const access = await repo.createAccessRequest(db, {
    support_admin_user_id: actor.id,
    organization_id: organization.id,
    branch_id: branchId,
    ticket_reference: ticket,
    reason,
    requested_scope: scope,
  });

  await repo.insertAccessEvent(db, {
    access_id: access.id,
    organization_id: organization.id,
    event_type: "request",
    actor_admin_user_id: actor.id,
    action_summary: `Support access requested (${scope})`,
    church_visible: false,
    metadata_json: { scope, ticket_reference: ticket },
  });

  await auditLogsRepo.insertAuditLog(db, {
    organization_id: organization.id,
    branch_id: branchId,
    actor_type: "platform_admin",
    actor_id: actor.id,
    action: "platform_support_access_requested",
    entity_type: "church_platform_support_access",
    entity_id: access.id,
    target_label: organization.name,
    metadata_json: { scope, ticket_reference: ticket, branch_id: branchId },
  });

  return access;
}

/**
 * Country administrator approves a pending request.
 */
async function approveSupportAccess(db, opts) {
  const actor = opts.actor || actorFromSession(opts.adminUser);
  if (!actor || !actor.enabled) throw err("SUPPORT_INACTIVE", "Approver account is inactive");
  if (!catalogue.canApproveSupportAccess(actor.role)) {
    throw err("FORBIDDEN", "Only authorized platform roles may approve support access");
  }

  const access = await repo.findAccessById(db, opts.accessId);
  if (!access) throw err("NOT_FOUND", "Support access request not found");
  if (access.status !== "pending") {
    throw err("INVALID_STATUS", "Only pending requests can be approved");
  }
  if (Number(access.support_admin_user_id) === Number(actor.id)) {
    throw err("SELF_APPROVAL_DENIED", "Support staff may not approve their own access");
  }

  const organization = await loadOrganization(db, access.organization_id);
  await assertCountryScope(db, actor, organization);

  let hours = Number(opts.durationHours);
  if (!Number.isFinite(hours) || hours <= 0) hours = DEFAULT_ACCESS_HOURS;
  hours = Math.min(Math.max(hours, 1), MAX_ACCESS_HOURS);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  if (!(expiresAt > new Date())) {
    throw err("INVALID_EXPIRY", "Access must have a future expiry");
  }

  const updated = await repo.updateAccessStatus(db, access.id, {
    status: "approved",
    approved_by_admin_user_id: actor.id,
    approved_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  await repo.insertAccessEvent(db, {
    access_id: access.id,
    organization_id: organization.id,
    event_type: "approval",
    actor_admin_user_id: actor.id,
    action_summary: `Access approved until ${expiresAt.toISOString()} (${access.requested_scope})`,
    church_visible: true,
    metadata_json: {
      scope: access.requested_scope,
      expires_at: expiresAt.toISOString(),
    },
  });

  await auditLogsRepo.insertAuditLog(db, {
    organization_id: organization.id,
    branch_id: access.branch_id,
    actor_type: "platform_admin",
    actor_id: actor.id,
    action: "platform_support_access_approved",
    entity_type: "church_platform_support_access",
    entity_id: access.id,
    target_label: organization.name,
    metadata_json: {
      support_admin_user_id: access.support_admin_user_id,
      scope: access.requested_scope,
      expires_at: expiresAt.toISOString(),
    },
  });

  return updated;
}

async function rejectSupportAccess(db, opts) {
  const actor = opts.actor || actorFromSession(opts.adminUser);
  if (!actor || !actor.enabled) throw err("SUPPORT_INACTIVE", "Approver account is inactive");
  if (!catalogue.canApproveSupportAccess(actor.role)) {
    throw err("FORBIDDEN", "Only authorized platform roles may reject support access");
  }

  const access = await repo.findAccessById(db, opts.accessId);
  if (!access) throw err("NOT_FOUND", "Support access request not found");
  if (access.status !== "pending") {
    throw err("INVALID_STATUS", "Only pending requests can be rejected");
  }
  if (Number(access.support_admin_user_id) === Number(actor.id)) {
    throw err("SELF_APPROVAL_DENIED", "Support staff may not decide their own access");
  }

  const organization = await loadOrganization(db, access.organization_id);
  await assertCountryScope(db, actor, organization);

  const rejectionReason = String(opts.rejectionReason || "Rejected").trim().slice(0, 500);
  const updated = await repo.updateAccessStatus(db, access.id, {
    status: "rejected",
    rejection_reason: rejectionReason,
    approved_by_admin_user_id: actor.id,
    approved_at: new Date().toISOString(),
  });

  await repo.insertAccessEvent(db, {
    access_id: access.id,
    organization_id: organization.id,
    event_type: "rejection",
    actor_admin_user_id: actor.id,
    action_summary: "Support access request rejected",
    church_visible: true,
    metadata_json: {},
  });

  await auditLogsRepo.insertAuditLog(db, {
    organization_id: organization.id,
    branch_id: access.branch_id,
    actor_type: "platform_admin",
    actor_id: actor.id,
    action: "platform_support_access_rejected",
    entity_type: "church_platform_support_access",
    entity_id: access.id,
    target_label: organization.name,
    metadata_json: { support_admin_user_id: access.support_admin_user_id },
  });

  return updated;
}

async function revokeSupportAccess(db, opts) {
  const actor = opts.actor || actorFromSession(opts.adminUser);
  if (!actor || !actor.enabled) throw err("SUPPORT_INACTIVE", "Actor account is inactive");
  if (!catalogue.canApproveSupportAccess(actor.role)) {
    throw err("FORBIDDEN", "Only authorized platform roles may revoke support access");
  }

  const access = await repo.findAccessById(db, opts.accessId);
  if (!access) throw err("NOT_FOUND", "Support access request not found");
  if (access.status !== "approved") {
    throw err("INVALID_STATUS", "Only approved access can be revoked");
  }

  const organization = await loadOrganization(db, access.organization_id);
  await assertCountryScope(db, actor, organization);

  const updated = await repo.updateAccessStatus(db, access.id, {
    status: "revoked",
    revoked_at: new Date().toISOString(),
    revoked_by_admin_user_id: actor.id,
  });

  await repo.insertAccessEvent(db, {
    access_id: access.id,
    organization_id: organization.id,
    event_type: "revocation",
    actor_admin_user_id: actor.id,
    action_summary: "Support access revoked",
    church_visible: true,
    metadata_json: {},
  });

  await auditLogsRepo.insertAuditLog(db, {
    organization_id: organization.id,
    branch_id: access.branch_id,
    actor_type: "platform_admin",
    actor_id: actor.id,
    action: "platform_support_access_revoked",
    entity_type: "church_platform_support_access",
    entity_id: access.id,
    target_label: organization.name,
    metadata_json: { support_admin_user_id: access.support_admin_user_id },
  });

  return updated;
}

async function markExpiredIfNeeded(db, access) {
  if (!access || access.status !== "approved") return access;
  if (access.expires_at && new Date(access.expires_at) <= new Date()) {
    const updated = await repo.updateAccessStatus(db, access.id, { status: "expired" });
    await repo.insertAccessEvent(db, {
      access_id: access.id,
      organization_id: access.organization_id,
      event_type: "expiry",
      actor_admin_user_id: null,
      action_summary: "Support access expired",
      church_visible: true,
      metadata_json: {},
    });
    return updated;
  }
  return access;
}

/**
 * Central enforcement for tenant-entry support actions.
 * Country administrators / super admins bypass grants within country scope.
 * Ordinary support staff require an approved, unexpired, in-scope grant.
 */
async function assertCanPerformSupportAction(db, opts) {
  const actor = opts.actor || actorFromSession(opts.adminUser);
  const action = String(opts.action || "").trim();
  const organizationId = Number(opts.organizationId);

  if (!actor || !actor.id) {
    throw err("SUPPORT_INACTIVE", "Support account required");
  }
  if (!actor.enabled) {
    throw err("SUPPORT_INACTIVE", "Support account is inactive");
  }
  if (!action) throw err("INVALID_ACTION", "Action is required");

  if (catalogue.isSensitiveDeniedAction(action)) {
    await recordDeniedUse(db, {
      actor,
      organizationId,
      accessId: opts.accessId || null,
      action,
      reason: "sensitive_action_denied",
    });
    throw err("SENSITIVE_ACTION_DENIED", "This action is not available through support access");
  }

  const organization = await loadOrganization(db, organizationId);
  await assertCountryScope(db, actor, organization);

  // Redacted diagnostics: ordinary support may view without tenant-entry grant.
  if (
    action === "view_redacted_diagnostics" &&
    catalogue.canViewRedactedDiagnosticsWithoutGrant(actor.role)
  ) {
    return { allowed: true, mode: "redacted_without_grant", grant: null, organization };
  }

  // Platform / country administrators: country-scoped operational access without grant.
  if (catalogue.canApproveSupportAccess(actor.role) && !catalogue.isOrdinarySupportStaff(actor.role)) {
    return { allowed: true, mode: "country_admin", grant: null, organization };
  }

  const grants = await repo.listActiveApprovedAccessForSupportUser(db, actor.id, organizationId);
  let matched = null;
  for (const g of grants) {
    const fresh = await markExpiredIfNeeded(db, g);
    if (!fresh || fresh.status !== "approved") continue;
    if (fresh.branch_id != null) {
      if (opts.branchId == null || Number(fresh.branch_id) !== Number(opts.branchId)) {
        continue;
      }
    }
    if (!catalogue.scopeAllowsAction(fresh.requested_scope, action)) continue;
    matched = fresh;
    break;
  }

  if (!matched) {
    await recordDeniedUse(db, {
      actor,
      organizationId,
      accessId: null,
      action,
      reason: "no_matching_grant",
    });
    throw err("SUPPORT_ACCESS_DENIED", "Approved support access is required for this action");
  }

  if (opts.recordUse !== false) {
    await repo.insertAccessEvent(db, {
      access_id: matched.id,
      organization_id: organizationId,
      event_type: "use",
      actor_admin_user_id: actor.id,
      action_summary: `Used support access: ${action}`,
      church_visible: true,
      metadata_json: { action, scope: matched.requested_scope },
    });
  }

  return { allowed: true, mode: "grant", grant: matched, organization };
}

async function recordDeniedUse(db, { actor, organizationId, accessId, action, reason }) {
  if (!organizationId) return;
  try {
    if (accessId) {
      await repo.insertAccessEvent(db, {
        access_id: accessId,
        organization_id: organizationId,
        event_type: "denied_use",
        actor_admin_user_id: actor?.id || null,
        action_summary: `Denied: ${action}`,
        church_visible: false,
        metadata_json: { action, reason },
      });
    }
    await auditLogsRepo.insertAuditLog(db, {
      organization_id: organizationId,
      branch_id: null,
      actor_type: "platform_admin",
      actor_id: actor?.id || null,
      action: "platform_support_access_denied",
      entity_type: "church_platform_support_access",
      entity_id: accessId || null,
      target_label: null,
      metadata_json: { action, reason },
    });
  } catch {
    /* best-effort audit */
  }
}

async function listChurchVisibleHistory(db, organizationId, opts) {
  return repo.listChurchVisibleSupportHistory(db, organizationId, opts);
}

async function listAccessForOrganization(db, organizationId, opts) {
  return repo.listAccessForOrganization(db, organizationId, opts);
}

async function findAccessById(db, accessId) {
  return repo.findAccessById(db, accessId);
}

module.exports = {
  DEFAULT_ACCESS_HOURS,
  MAX_ACCESS_HOURS,
  actorFromSession,
  assignAccountManagers,
  getAccountManagers,
  requestSupportAccess,
  approveSupportAccess,
  rejectSupportAccess,
  revokeSupportAccess,
  assertCanPerformSupportAction,
  listChurchVisibleHistory,
  listAccessForOrganization,
  findAccessById,
  catalogue,
};
