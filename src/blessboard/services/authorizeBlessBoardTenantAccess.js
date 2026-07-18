"use strict";

/**
 * Authorize an authenticated BlessBoard user against a resolved tenant (UUID scopes).
 * No process.env reads. Fail closed on missing inputs / inactive principals.
 */

const repo = require("../repositories/blessBoardAuthorizationRepository");

const STATUS = Object.freeze({
  AUTHORIZED: "authorized",
  UNAUTHENTICATED: "unauthenticated",
  UNAUTHORIZED: "unauthorized",
  TENANT_UNRESOLVED: "tenant_unresolved",
  INACTIVE_USER: "inactive_user",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
function uuidEqual(a, b) {
  if (a == null || b == null) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/**
 * @param {object | null | undefined} tenant
 */
function extractTenantIds(tenant) {
  if (!tenant || tenant.resolved !== true) {
    return null;
  }
  const organizationId = tenant.organization && tenant.organization.id;
  const churchId = tenant.church && tenant.church.id;
  if (!organizationId || !churchId) return null;
  return {
    organizationId: String(organizationId),
    churchId: String(churchId),
    hqBranchId: tenant.hqBranch && tenant.hqBranch.id ? String(tenant.hqBranch.id) : null,
    primaryBranchId:
      tenant.primaryBranch && tenant.primaryBranch.id ? String(tenant.primaryBranch.id) : null,
  };
}

/**
 * Compact denial / empty context.
 * @param {object} partial
 */
function deny(partial) {
  return {
    ok: false,
    status: partial.status,
    message: partial.message || partial.status,
    context: {
      authenticated: Boolean(partial.authenticated),
      authorized: false,
      userId: partial.userId || null,
      organizationId: partial.organizationId || null,
      churchId: partial.churchId || null,
      branchId: partial.branchId || null,
      effectiveRoles: [],
    },
  };
}

/**
 * Evaluate role grants against UUID scopes (pure; no DB).
 * @param {Array<{ roleKey: string, organizationId: string, churchId: string | null, branchId: string | null }>} roles
 * @param {{ organizationId: string, churchId: string, branchId: string | null }} target
 * @param {{ branchBelongsToChurch: boolean }} checks
 */
function evaluateRoleGrants(roles, target, checks) {
  const effective = [];
  for (const role of roles || []) {
    const key = String(role.roleKey || "");
    if (key === "platform_admin") {
      // Deployment-wide for active BlessBoard tenants; still requires resolved tenant.
      effective.push({
        roleKey: "platform_admin",
        organizationId: role.organizationId || null,
        churchId: null,
        branchId: null,
      });
      continue;
    }
    if (key === "church_hq_admin") {
      if (uuidEqual(role.churchId, target.churchId) && uuidEqual(role.organizationId, target.organizationId)) {
        if (target.branchId && !checks.branchBelongsToChurch) {
          continue;
        }
        effective.push({
          roleKey: "church_hq_admin",
          organizationId: role.organizationId,
          churchId: role.churchId,
          branchId: null,
        });
      }
      continue;
    }
    if (key === "branch_admin") {
      if (
        target.branchId &&
        uuidEqual(role.branchId, target.branchId) &&
        uuidEqual(role.churchId, target.churchId) &&
        uuidEqual(role.organizationId, target.organizationId)
      ) {
        effective.push({
          roleKey: "branch_admin",
          organizationId: role.organizationId,
          churchId: role.churchId,
          branchId: role.branchId,
        });
      }
    }
  }
  return effective;
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   userId?: string | null,
 *   tenant?: object | null,
 *   branchId?: string | null,
 * }} input
 */
async function authorizeBlessBoardTenantAccess(db, input) {
  const opts = input && typeof input === "object" ? input : {};
  const userId = opts.userId != null && String(opts.userId).trim() !== "" ? String(opts.userId) : null;

  if (!userId) {
    return deny({ status: STATUS.UNAUTHENTICATED, authenticated: false });
  }

  const tenantIds = extractTenantIds(opts.tenant);
  if (!tenantIds) {
    return deny({
      status: STATUS.TENANT_UNRESOLVED,
      authenticated: true,
      userId,
    });
  }

  const branchId =
    opts.branchId != null && String(opts.branchId).trim() !== ""
      ? String(opts.branchId)
      : tenantIds.primaryBranchId;

  if (!db || typeof db.query !== "function") {
    return deny({
      status: STATUS.LOOKUP_ERROR,
      authenticated: true,
      userId,
      organizationId: tenantIds.organizationId,
      churchId: tenantIds.churchId,
      branchId,
    });
  }

  try {
    const user = await repo.findUserStatusById(db, userId);
    if (!user || String(user.status) !== "active") {
      return deny({
        status: STATUS.INACTIVE_USER,
        authenticated: true,
        userId,
        organizationId: tenantIds.organizationId,
        churchId: tenantIds.churchId,
        branchId,
      });
    }

    const roles = await repo.listActiveAuthorizationRoles(db, userId);
    let branchBelongsToChurch = true;
    if (branchId) {
      branchBelongsToChurch = await repo.isActiveBranchOfChurch(db, branchId, tenantIds.churchId);
      if (!branchBelongsToChurch) {
        return deny({
          status: STATUS.UNAUTHORIZED,
          authenticated: true,
          userId,
          organizationId: tenantIds.organizationId,
          churchId: tenantIds.churchId,
          branchId,
        });
      }
    }

    const effectiveRoles = evaluateRoleGrants(
      roles,
      {
        organizationId: tenantIds.organizationId,
        churchId: tenantIds.churchId,
        branchId,
      },
      { branchBelongsToChurch }
    );

    if (!effectiveRoles.length) {
      return deny({
        status: STATUS.UNAUTHORIZED,
        authenticated: true,
        userId,
        organizationId: tenantIds.organizationId,
        churchId: tenantIds.churchId,
        branchId,
      });
    }

    return {
      ok: true,
      status: STATUS.AUTHORIZED,
      message: STATUS.AUTHORIZED,
      context: {
        authenticated: true,
        authorized: true,
        userId,
        organizationId: tenantIds.organizationId,
        churchId: tenantIds.churchId,
        branchId,
        effectiveRoles,
      },
    };
  } catch {
    return deny({
      status: STATUS.LOOKUP_ERROR,
      authenticated: true,
      userId,
      organizationId: tenantIds.organizationId,
      churchId: tenantIds.churchId,
      branchId,
    });
  }
}

module.exports = {
  STATUS,
  uuidEqual,
  extractTenantIds,
  evaluateRoleGrants,
  authorizeBlessBoardTenantAccess,
};
