"use strict";

/**
 * Attach req.blessBoardAuthorizationContext for the resolved tenant.
 * Observational / fail-soft — never sends a response (public routes stay up).
 *
 * `permissions` is the catalogue + legacy-compat effective set from
 * listEffectivePermissions (same source as requireBlessBoardPermission).
 * Callers that soft-check canView/canManage must not invent grants.
 */

const {
  authorizeBlessBoardTenantAccess,
  STATUS,
} = require("../services/authorizeBlessBoardTenantAccess");
const {
  listEffectivePermissions,
} = require("../services/blessBoardRbacAuthorizationService");

/**
 * Prefer authoritative tenant context; fall back to proposed shadow tenant for future handoff tests.
 * @param {import('express').Request} req
 */
function resolveTenantForAuthorization(req) {
  const ctx = req.blessBoardTenantContext;
  if (ctx && ctx.resolved === true) return ctx;
  const proposed =
    req.blessBoardTenantRoute && req.blessBoardTenantRoute.proposedTenant
      ? req.blessBoardTenantRoute.proposedTenant
      : null;
  if (proposed && proposed.resolved === true) return proposed;
  return null;
}

/**
 * @param {object} [partial]
 */
function emptyAuthzContext(partial) {
  return {
    authenticated: Boolean(partial && partial.authenticated),
    authorized: false,
    userId: (partial && partial.userId) || null,
    organizationId: null,
    churchId: null,
    branchId: null,
    effectiveRoles: [],
    permissions: Array.isArray(partial && partial.permissions) ? partial.permissions : [],
    reason: (partial && partial.reason) || "none",
  };
}

/**
 * Catalogue + legacy-compat permission keys for the host primary-branch resource
 * scope (or null branch when the host has none). Fail soft to [].
 *
 * @param {{ query: Function }} pool
 * @param {{ userId: string, tenant: object, branchId: string | null }} input
 */
async function resolveEffectivePermissionKeys(pool, input) {
  const tenant = input && input.tenant;
  const userId = input && input.userId ? String(input.userId) : "";
  if (
    !pool ||
    typeof pool.query !== "function" ||
    !userId ||
    !tenant ||
    tenant.resolved !== true ||
    !tenant.organization ||
    !tenant.church
  ) {
    return [];
  }
  try {
    const listed = await listEffectivePermissions(pool, {
      actor: { userId },
      tenantContext: tenant,
      resourceContext: {
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        branchId: input.branchId != null ? input.branchId : null,
      },
    });
    return listed && listed.ok === true && Array.isArray(listed.permissions)
      ? listed.permissions
      : [];
  } catch {
    return [];
  }
}

/**
 * @param {{
 *   getPool?: () => { query: Function } | null | undefined,
 *   authorize?: Function,
 *   listPermissions?: Function,
 *   getTenant?: (req: import('express').Request) => object | null,
 *   getBranchId?: (req: import('express').Request, tenant: object | null) => string | null,
 * }} [deps]
 */
function createLoadBlessBoardAuthorizationContext(deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const getPool = options.getPool;
  const authorize = options.authorize || authorizeBlessBoardTenantAccess;
  const listPermissions = options.listPermissions || resolveEffectivePermissionKeys;
  const getTenant = options.getTenant || resolveTenantForAuthorization;
  const getBranchId =
    options.getBranchId ||
    ((req, tenant) => {
      void req;
      if (!tenant || !tenant.primaryBranch) return null;
      return tenant.primaryBranch.id || null;
    });

  return async function loadBlessBoardAuthorizationContext(req, res, next) {
    void res;
    try {
      const session =
        req.v5Session && req.v5Session.authenticated && req.v5Session.session
          ? req.v5Session.session
          : null;
      const tenant = getTenant(req);

      if (!session) {
        req.blessBoardAuthorizationContext = emptyAuthzContext({
          authenticated: false,
          reason: (req.v5Session && req.v5Session.reason) || "unauthenticated",
        });
        return next();
      }

      if (!tenant) {
        req.blessBoardAuthorizationContext = emptyAuthzContext({
          authenticated: true,
          userId: session.userId,
          reason: STATUS.TENANT_UNRESOLVED,
        });
        return next();
      }

      if (typeof getPool !== "function") {
        req.blessBoardAuthorizationContext = emptyAuthzContext({
          authenticated: true,
          userId: session.userId,
          reason: STATUS.LOOKUP_ERROR,
        });
        return next();
      }
      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        req.blessBoardAuthorizationContext = emptyAuthzContext({
          authenticated: true,
          userId: session.userId,
          reason: STATUS.LOOKUP_ERROR,
        });
        return next();
      }

      const branchId = getBranchId(req, tenant);
      const result = await authorize(pool, {
        userId: session.userId,
        tenant,
        branchId,
      });

      const permissions = await listPermissions(pool, {
        userId: session.userId,
        tenant,
        branchId,
      });

      req.blessBoardAuthorizationContext = {
        ...result.context,
        reason: result.status,
        permissions,
      };
      return next();
    } catch {
      const userId =
        req.v5Session && req.v5Session.session ? req.v5Session.session.userId : null;
      req.blessBoardAuthorizationContext = emptyAuthzContext({
        authenticated: Boolean(userId),
        userId,
        reason: STATUS.LOOKUP_ERROR,
      });
      return next();
    }
  };
}

module.exports = {
  createLoadBlessBoardAuthorizationContext,
  resolveTenantForAuthorization,
  resolveEffectivePermissionKeys,
  emptyAuthzContext,
};
