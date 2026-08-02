"use strict";

/**
 * Central BlessBoard RBAC authorization service.
 * Combines new assignments + legacy user_roles compatibility bundles.
 * Deny by default. Trusted session/tenant context only.
 */

const authzRepo = require("../repositories/blessBoardAuthorizationRepository");
const rbacRepo = require("../repositories/blessBoardRbacRepository");
const {
  mapLegacyRolesToPermissionGrants,
} = require("../rbac/legacyCompatibilityPermissions");

const REASON = Object.freeze({
  ALLOWED: "RBAC_ALLOWED",
  UNAUTHENTICATED: "RBAC_UNAUTHENTICATED",
  INACTIVE_USER: "RBAC_INACTIVE_USER",
  TENANT_UNRESOLVED: "RBAC_TENANT_UNRESOLVED",
  PERMISSION_UNKNOWN: "RBAC_PERMISSION_UNKNOWN",
  PERMISSION_INACTIVE: "RBAC_PERMISSION_INACTIVE",
  PERMISSION_DENIED: "RBAC_PERMISSION_DENIED",
  SCOPE_MISMATCH: "RBAC_SCOPE_MISMATCH",
  INVALID_SCOPE: "RBAC_INVALID_SCOPE",
  LOOKUP_ERROR: "RBAC_LOOKUP_ERROR",
});

const PERMISSION_KEY_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

function uuidEqual(a, b) {
  if (a == null || b == null) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function isExpired(expiresAt, now) {
  if (!expiresAt) return false;
  const t = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(String(expiresAt));
  if (!Number.isFinite(t)) return false;
  return t <= now.getTime();
}

function extractTenantIds(tenant) {
  if (!tenant || tenant.resolved !== true) return null;
  const organizationId = tenant.organization && tenant.organization.id;
  const churchId = tenant.church && tenant.church.id;
  if (!organizationId || !churchId) return null;
  return {
    organizationId: String(organizationId),
    churchId: String(churchId),
    primaryBranchId:
      tenant.primaryBranch && tenant.primaryBranch.id ? String(tenant.primaryBranch.id) : null,
  };
}

function decision(partial) {
  return {
    allowed: Boolean(partial.allowed),
    reasonCode: partial.reasonCode,
    permission: partial.permission || null,
    matchedAssignments: partial.matchedAssignments || [],
    evaluatedScopes: partial.evaluatedScopes || [],
    // Server-side only enrichment; callers must not send to browser.
    _internal: partial._internal || null,
  };
}

/**
 * Does a grant apply to the requested resource context?
 * @param {object} grant
 * @param {object} target
 */
function grantMatchesScope(grant, target) {
  const scopeType = grant.scopeType;
  if (scopeType === "platform") {
    // Deployment-wide for resolved tenants (mirrors legacy platform_admin).
    return true;
  }
  if (scopeType === "organisation") {
    return uuidEqual(grant.organizationId, target.organizationId);
  }
  if (scopeType === "church") {
    return (
      uuidEqual(grant.organizationId, target.organizationId) &&
      uuidEqual(grant.churchId || grant.scopeId, target.churchId)
    );
  }
  if (scopeType === "branch") {
    if (!target.branchId) return false;
    return (
      uuidEqual(grant.organizationId, target.organizationId) &&
      uuidEqual(grant.churchId, target.churchId) &&
      uuidEqual(grant.branchId || grant.scopeId, target.branchId)
    );
  }
  if (scopeType === "ministry") {
    if (!target.ministryId) return false;
    return (
      uuidEqual(grant.organizationId, target.organizationId) &&
      uuidEqual(grant.churchId, target.churchId) &&
      uuidEqual(grant.scopeId, target.ministryId)
    );
  }
  if (scopeType === "department") {
    if (!target.departmentId) return false;
    return (
      uuidEqual(grant.organizationId, target.organizationId) &&
      uuidEqual(grant.churchId, target.churchId) &&
      uuidEqual(grant.scopeId, target.departmentId)
    );
  }
  if (scopeType === "cell") {
    if (!target.cellId) return false;
    return (
      uuidEqual(grant.organizationId, target.organizationId) &&
      uuidEqual(grant.churchId, target.churchId) &&
      uuidEqual(grant.scopeId, target.cellId)
    );
  }
  if (scopeType === "class") {
    if (!target.classId && !target.cohortId) return false;
    const classTarget = target.classId || target.cohortId;
    return (
      uuidEqual(grant.organizationId, target.organizationId) &&
      uuidEqual(grant.churchId, target.churchId) &&
      uuidEqual(grant.scopeId, classTarget)
    );
  }
  if (scopeType === "assigned_member") {
    if (!target.assignedMemberId && !target.memberId) return false;
    const memberTarget = target.assignedMemberId || target.memberId;
    return (
      uuidEqual(grant.organizationId, target.organizationId) &&
      uuidEqual(grant.churchId, target.churchId) &&
      uuidEqual(grant.scopeId, memberTarget)
    );
  }
  if (scopeType === "assigned_case") {
    if (!target.assignedCaseId && !target.caseId) return false;
    const caseTarget = target.assignedCaseId || target.caseId;
    return (
      uuidEqual(grant.organizationId, target.organizationId) &&
      uuidEqual(grant.churchId, target.churchId) &&
      uuidEqual(grant.scopeId, caseTarget)
    );
  }
  if (scopeType === "personal") {
    // Reserved — never grants staff-wide permissions.
    return false;
  }
  return false;
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   actor: { userId: string },
 *   permission: string,
 *   resourceContext?: { organizationId?: string, churchId?: string, branchId?: string | null },
 *   tenantContext?: object,
 *   now?: Date,
 * }} input
 */
async function authorize(db, input) {
  const permissionKey = String((input && input.permission) || "").trim();
  const actorUserId = String((input && input.actor && input.actor.userId) || "").trim();
  const now = input.now instanceof Date ? input.now : new Date();

  if (!actorUserId) {
    return decision({
      allowed: false,
      reasonCode: REASON.UNAUTHENTICATED,
      permission: permissionKey || null,
    });
  }

  if (!PERMISSION_KEY_RE.test(permissionKey)) {
    return decision({
      allowed: false,
      reasonCode: REASON.PERMISSION_UNKNOWN,
      permission: permissionKey || null,
    });
  }

  try {
    const user = await authzRepo.findUserStatusById(db, actorUserId);
    if (!user) {
      return decision({
        allowed: false,
        reasonCode: REASON.UNAUTHENTICATED,
        permission: permissionKey,
      });
    }
    if (String(user.status) !== "active") {
      return decision({
        allowed: false,
        reasonCode: REASON.INACTIVE_USER,
        permission: permissionKey,
      });
    }

    const perm = await rbacRepo.findPermissionByKey(db, permissionKey);
    if (!perm) {
      return decision({
        allowed: false,
        reasonCode: REASON.PERMISSION_UNKNOWN,
        permission: permissionKey,
      });
    }
    if (!perm.isActive) {
      return decision({
        allowed: false,
        reasonCode: REASON.PERMISSION_INACTIVE,
        permission: permissionKey,
      });
    }

    const tenantIds = extractTenantIds(input.tenantContext);
    const resource = input.resourceContext || {};
    const organizationId =
      (resource.organizationId && String(resource.organizationId)) ||
      (tenantIds && tenantIds.organizationId) ||
      null;
    const churchId =
      (resource.churchId && String(resource.churchId)) ||
      (tenantIds && tenantIds.churchId) ||
      null;
    // Explicit branchId: null means church-wide (do not fall back to primaryBranch).
    // Omitted branchId may use tenant primaryBranch for convenience on branch surfaces.
    let branchId = null;
    if (Object.prototype.hasOwnProperty.call(resource, "branchId")) {
      branchId =
        resource.branchId != null && String(resource.branchId).trim() !== ""
          ? String(resource.branchId)
          : null;
    } else if (tenantIds && tenantIds.primaryBranchId) {
      branchId = tenantIds.primaryBranchId;
    }

    if (!organizationId || !churchId) {
      return decision({
        allowed: false,
        reasonCode: REASON.TENANT_UNRESOLVED,
        permission: permissionKey,
      });
    }

    // If tenant was provided, resource org/church must match (never trust mismatched client IDs).
    if (tenantIds) {
      if (!uuidEqual(organizationId, tenantIds.organizationId) || !uuidEqual(churchId, tenantIds.churchId)) {
        return decision({
          allowed: false,
          reasonCode: REASON.SCOPE_MISMATCH,
          permission: permissionKey,
          evaluatedScopes: [{ organizationId, churchId, branchId }],
        });
      }
    }

    if (branchId) {
      const okBranch = await authzRepo.isActiveBranchOfChurch(db, branchId, churchId);
      if (!okBranch) {
        return decision({
          allowed: false,
          reasonCode: REASON.INVALID_SCOPE,
          permission: permissionKey,
          evaluatedScopes: [{ organizationId, churchId, branchId }],
        });
      }
    }

    const target = {
      organizationId,
      churchId,
      branchId,
      ministryId: resource.ministryId ? String(resource.ministryId) : null,
      departmentId: resource.departmentId ? String(resource.departmentId) : null,
      cellId: resource.cellId ? String(resource.cellId) : null,
      classId: resource.classId ? String(resource.classId) : null,
      cohortId: resource.cohortId ? String(resource.cohortId) : null,
      assignedMemberId: resource.assignedMemberId ? String(resource.assignedMemberId) : null,
      memberId: resource.memberId ? String(resource.memberId) : null,
      assignedCaseId: resource.assignedCaseId ? String(resource.assignedCaseId) : null,
      caseId: resource.caseId ? String(resource.caseId) : null,
    };
    const evaluatedScopes = [target];
    const matched = [];

    // 1) New RBAC assignments
    const assignments = await rbacRepo.listActiveAssignmentsForUser(db, actorUserId, organizationId);
    const scopedAssignments = [];

    for (const assignment of assignments) {
      if (isExpired(assignment.expiresAt, now)) {
        // Deny grant; mark expired transactionally when encountered.
        try {
          const marked = await rbacRepo.markAssignmentExpired(db, assignment.id);
          if (marked) {
            await rbacRepo.insertAssignmentEvent(db, {
              assignmentId: assignment.id,
              organizationId: assignment.organizationId,
              actorUserId: null,
              eventKey: "rbac.assignment.expired",
              previousStatus: "active",
              newStatus: "expired",
              reason: "expires_at_elapsed",
              metadata: { permission_key: permissionKey },
            });
          }
        } catch {
          // Evaluation still denies even if status update fails.
        }
        continue;
      }

      const grant = {
        scopeType: assignment.scopeType,
        organizationId: assignment.organizationId,
        churchId: assignment.churchId,
        branchId: assignment.scopeType === "branch" ? assignment.scopeId : null,
        scopeId: assignment.scopeId,
      };
      if (!grantMatchesScope(grant, target)) continue;
      scopedAssignments.push(assignment);
    }

    if (scopedAssignments.length) {
      const rolePermCache = new Map();
      for (const assignment of scopedAssignments) {
        let roleKeys = rolePermCache.get(assignment.roleId);
        if (!roleKeys) {
          roleKeys = await rbacRepo.listPermissionKeysForRoleId(db, assignment.roleId);
          rolePermCache.set(assignment.roleId, roleKeys);
        }
        if (!roleKeys.includes(permissionKey)) continue;
        matched.push({
          assignmentId: assignment.id,
          roleKey: assignment.roleKey,
          scopeType: assignment.scopeType,
          scopeId: assignment.scopeId,
          source: "assignment",
        });
      }
      if (matched.length) {
        return decision({
          allowed: true,
          reasonCode: REASON.ALLOWED,
          permission: permissionKey,
          matchedAssignments: matched,
          evaluatedScopes,
        });
      }
    }

    // 2) Legacy compatibility (active user_roles only)
    const legacyRoles = await authzRepo.listActiveAuthorizationRoles(db, actorUserId);
    const legacyGrants = mapLegacyRolesToPermissionGrants(legacyRoles).filter(
      (g) => g.permissionKey === permissionKey
    );

    for (const grant of legacyGrants) {
      const scoped = {
        scopeType: grant.scopeType,
        organizationId: grant.organizationId,
        churchId: grant.churchId,
        branchId: grant.branchId,
        scopeId: grant.branchId || grant.churchId || grant.organizationId,
      };
      if (!grantMatchesScope(scoped, target)) continue;
      matched.push({
        assignmentId: null,
        roleKey: grant.legacyRoleKey,
        scopeType: grant.scopeType,
        scopeId: scoped.scopeId,
        source: "legacy_compatibility",
      });
    }

    if (matched.length) {
      return decision({
        allowed: true,
        reasonCode: REASON.ALLOWED,
        permission: permissionKey,
        matchedAssignments: matched,
        evaluatedScopes,
      });
    }

    const denyReason =
      legacyGrants.length || scopedAssignments.length
        ? REASON.SCOPE_MISMATCH
        : REASON.PERMISSION_DENIED;

    if (perm.sensitivity === "sensitive" || perm.sensitivity === "highly_sensitive") {
      // Caller may audit; keep payload free of secrets.
      return decision({
        allowed: false,
        reasonCode: denyReason,
        permission: permissionKey,
        matchedAssignments: [],
        evaluatedScopes,
        _internal: { sensitiveDenial: true },
      });
    }

    return decision({
      allowed: false,
      reasonCode: denyReason,
      permission: permissionKey,
      matchedAssignments: [],
      evaluatedScopes,
    });
  } catch (err) {
    return decision({
      allowed: false,
      reasonCode: REASON.LOOKUP_ERROR,
      permission: permissionKey,
      _internal: { message: err && err.message ? String(err.message) : "error" },
    });
  }
}

async function hasPermission(db, input) {
  const result = await authorize(db, input);
  return result.allowed === true;
}

/**
 * @throws never — returns decision for middleware to map to HTTP
 */
async function requirePermission(db, input) {
  return authorize(db, input);
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   actor: { userId: string },
 *   tenantContext?: object,
 *   resourceContext?: object,
 *   now?: Date,
 * }} input
 */
async function listEffectivePermissions(db, input) {
  const actorUserId = String((input && input.actor && input.actor.userId) || "").trim();
  if (!actorUserId) {
    return { ok: false, reasonCode: REASON.UNAUTHENTICATED, permissions: [] };
  }

  try {
    const user = await authzRepo.findUserStatusById(db, actorUserId);
    if (!user || String(user.status) !== "active") {
      return { ok: false, reasonCode: REASON.INACTIVE_USER, permissions: [] };
    }

    const tenantIds = extractTenantIds(input.tenantContext);
    const resource = input.resourceContext || {};
    const organizationId =
      (resource.organizationId && String(resource.organizationId)) ||
      (tenantIds && tenantIds.organizationId) ||
      null;
    const churchId =
      (resource.churchId && String(resource.churchId)) ||
      (tenantIds && tenantIds.churchId) ||
      null;
    // Explicit branchId: null means church-wide (do not fall back to primaryBranch).
    let branchId = null;
    if (Object.prototype.hasOwnProperty.call(resource, "branchId")) {
      branchId =
        resource.branchId != null && String(resource.branchId).trim() !== ""
          ? String(resource.branchId)
          : null;
    } else if (tenantIds && tenantIds.primaryBranchId) {
      branchId = tenantIds.primaryBranchId;
    }

    if (!organizationId || !churchId) {
      return { ok: false, reasonCode: REASON.TENANT_UNRESOLVED, permissions: [] };
    }

    const target = {
      organizationId,
      churchId,
      branchId,
      ministryId: resource.ministryId ? String(resource.ministryId) : null,
      departmentId: resource.departmentId ? String(resource.departmentId) : null,
      cellId: resource.cellId ? String(resource.cellId) : null,
      classId: resource.classId ? String(resource.classId) : null,
      cohortId: resource.cohortId ? String(resource.cohortId) : null,
      assignedMemberId: resource.assignedMemberId ? String(resource.assignedMemberId) : null,
      memberId: resource.memberId ? String(resource.memberId) : null,
      assignedCaseId: resource.assignedCaseId ? String(resource.assignedCaseId) : null,
      caseId: resource.caseId ? String(resource.caseId) : null,
    };
    const now = input.now instanceof Date ? input.now : new Date();
    const set = new Set();

    const assignments = await rbacRepo.listActiveAssignmentsForUser(db, actorUserId, organizationId);
    for (const assignment of assignments) {
      if (isExpired(assignment.expiresAt, now)) continue;
      const grant = {
        scopeType: assignment.scopeType,
        organizationId: assignment.organizationId,
        churchId: assignment.churchId,
        branchId: assignment.scopeType === "branch" ? assignment.scopeId : null,
        scopeId: assignment.scopeId,
      };
      if (!grantMatchesScope(grant, target)) continue;
      const keys = await rbacRepo.listPermissionKeysForRoleId(db, assignment.roleId);
      for (const k of keys) set.add(k);
    }

    const legacyRoles = await authzRepo.listActiveAuthorizationRoles(db, actorUserId);
    for (const g of mapLegacyRolesToPermissionGrants(legacyRoles)) {
      const scoped = {
        scopeType: g.scopeType,
        organizationId: g.organizationId,
        churchId: g.churchId,
        branchId: g.branchId,
      };
      if (!grantMatchesScope(scoped, target)) continue;
      set.add(g.permissionKey);
    }

    return {
      ok: true,
      reasonCode: REASON.ALLOWED,
      permissions: Array.from(set).sort(),
    };
  } catch {
    return { ok: false, reasonCode: REASON.LOOKUP_ERROR, permissions: [] };
  }
}

module.exports = {
  REASON,
  PERMISSION_KEY_RE,
  authorize,
  hasPermission,
  requirePermission,
  listEffectivePermissions,
  grantMatchesScope,
  isExpired,
};
