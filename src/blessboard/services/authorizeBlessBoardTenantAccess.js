"use strict";

/**
 * Authorize an authenticated BlessBoard user against a resolved tenant (UUID scopes).
 * Catalogue role assignments only (V2.02) — no blessboard.user_roles / legacy role keys.
 */

const repo = require("../repositories/blessBoardAuthorizationRepository");
const {
  isCatalogueHqRole,
  isCatalogueBranchRole,
} = require("./blessBoardCatalogueLogin");

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
 * Evaluate catalogue role grants against UUID scopes (pure; no DB).
 * @param {Array<{ roleKey: string, organizationId: string|null, churchId: string|null, branchId: string|null, scopeType?: string }>} roles
 * @param {{ organizationId: string, churchId: string, branchId: string | null }} target
 * @param {{ branchBelongsToChurch: boolean }} checks
 */
function evaluateRoleGrants(roles, target, checks) {
  const effective = [];
  for (const role of roles || []) {
    const key = String(role.roleKey || "");
    if (key === "platform_administrator") {
      effective.push({
        roleKey: "platform_administrator",
        organizationId: role.organizationId || null,
        churchId: null,
        branchId: null,
      });
      continue;
    }
    if (isCatalogueHqRole(key)) {
      const orgOk =
        !role.organizationId || uuidEqual(role.organizationId, target.organizationId);
      const churchOk =
        !role.churchId || uuidEqual(role.churchId, target.churchId);
      if (orgOk && churchOk) {
        if (target.branchId && !checks.branchBelongsToChurch) {
          continue;
        }
        effective.push({
          roleKey: key,
          organizationId: role.organizationId || target.organizationId,
          churchId: role.churchId || target.churchId,
          branchId: null,
        });
      }
      continue;
    }
    if (isCatalogueBranchRole(key) || key === "communications_officer") {
      if (
        target.branchId &&
        role.branchId &&
        uuidEqual(role.branchId, target.branchId) &&
        (!role.organizationId || uuidEqual(role.organizationId, target.organizationId)) &&
        (!role.churchId || uuidEqual(role.churchId, target.churchId))
      ) {
        effective.push({
          roleKey: key,
          organizationId: role.organizationId || target.organizationId,
          churchId: role.churchId || target.churchId,
          branchId: role.branchId,
        });
      }
      continue;
    }
    // Known catalogue staff roles at org/church/branch (website, finance, auditor, …).
    const CATALOGUE_STAFF = new Set([
      "website_editor",
      "website_publisher",
      "auditor",
      "finance_director",
      "finance_officer",
      "finance_approver",
      "communications_officer",
      "role_administrator",
      "ministry_leader",
      "safeguarding_officer",
      "minister",
    ]);
    if (!CATALOGUE_STAFF.has(key)) {
      continue;
    }
    if (role.organizationId && uuidEqual(role.organizationId, target.organizationId)) {
      if (role.churchId && !uuidEqual(role.churchId, target.churchId)) continue;
      if (role.branchId) {
        if (!target.branchId || !uuidEqual(role.branchId, target.branchId)) continue;
      }
      effective.push({
        roleKey: key,
        organizationId: role.organizationId,
        churchId: role.churchId || target.churchId,
        branchId: role.branchId || null,
      });
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
  evaluateRoleGrants,
  authorizeBlessBoardTenantAccess,
  extractTenantIds,
  uuidEqual,
};
