"use strict";

/**
 * Attach req.blessBoardAuthorizationContext for the resolved tenant.
 * Observational / fail-soft — never sends a response (public routes stay up).
 */

const {
  authorizeBlessBoardTenantAccess,
  STATUS,
} = require("../services/authorizeBlessBoardTenantAccess");

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
 * @param {import('express').Request} req
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
    reason: (partial && partial.reason) || "none",
  };
}

/**
 * @param {{
 *   getPool?: () => { query: Function } | null | undefined,
 *   authorize?: Function,
 *   getTenant?: (req: import('express').Request) => object | null,
 *   getBranchId?: (req: import('express').Request, tenant: object | null) => string | null,
 * }} [deps]
 */
function createLoadBlessBoardAuthorizationContext(deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const getPool = options.getPool;
  const authorize = options.authorize || authorizeBlessBoardTenantAccess;
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

      const result = await authorize(pool, {
        userId: session.userId,
        tenant,
        branchId: getBranchId(req, tenant),
      });

      req.blessBoardAuthorizationContext = {
        ...result.context,
        reason: result.status,
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
};
