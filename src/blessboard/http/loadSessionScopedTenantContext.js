"use strict";

/**
 * On apex hosts, attach BlessBoard tenant context from the authenticated
 * session's organizationId when host-based routing did not resolve a tenant.
 *
 * Used so HQ / content / website admin can run on blessboard.org when
 * wildcard tenant hostnames are unavailable (testing / Hostinger).
 *
 * Trust model:
 * - Organization id comes only from the signed V5 session (never query/body).
 * - Catalogue + buildBlessBoardTenantContext still required for resolved=true.
 * - Authorization middleware / requireBlessBoardTenantRole still enforce roles.
 */

const {
  getBlessBoardCatalogueContext,
  STATUS: CTX_STATUS,
} = require("../services/getBlessBoardCatalogueContext");
const { buildBlessBoardTenantContext } = require("./buildBlessBoardTenantContext");

/**
 * @param {{
 *   getPool: () => { query: Function } | null | undefined,
 *   isApexHost: (req: import('express').Request) => boolean,
 * }} deps
 */
function createLoadSessionScopedTenantContext(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;

  return async function loadSessionScopedTenantContext(req, res, next) {
    void res;
    try {
      if (req.blessBoardTenantContext && req.blessBoardTenantContext.resolved === true) {
        return next();
      }
      if (typeof isApexHost !== "function" || !isApexHost(req)) {
        return next();
      }

      const session =
        req.v5Session && req.v5Session.authenticated && req.v5Session.session
          ? req.v5Session.session
          : null;
      const organizationId =
        session && session.organizationId != null ? String(session.organizationId).trim() : "";
      if (!organizationId) {
        return next();
      }
      if (typeof getPool !== "function") {
        return next();
      }
      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        return next();
      }

      const catalogue = await getBlessBoardCatalogueContext(pool, organizationId);
      if (!catalogue.ok || !catalogue.context) {
        req.blessBoardSessionTenantReason =
          catalogue.status || CTX_STATUS.LOOKUP_ERROR;
        return next();
      }

      const tenant = buildBlessBoardTenantContext({
        organization: {
          id: catalogue.context.organization.id,
          key: catalogue.context.organization.key,
        },
        church: catalogue.context.church
          ? {
              id: catalogue.context.church.id,
              churchKey: catalogue.context.church.key,
              displayName: catalogue.context.church.displayName,
              dataEnvironment: catalogue.context.church.dataEnvironment,
            }
          : null,
        hqBranch: catalogue.context.hqBranch
          ? {
              id: catalogue.context.hqBranch.id,
              branchKey: catalogue.context.hqBranch.key,
              displayName: catalogue.context.hqBranch.displayName,
            }
          : null,
        primaryBranch: catalogue.context.primaryBranch
          ? {
              id: catalogue.context.primaryBranch.id,
              branchKey: catalogue.context.primaryBranch.key,
              displayName: catalogue.context.primaryBranch.displayName,
            }
          : null,
      });

      if (!tenant) {
        req.blessBoardSessionTenantReason = "catalogue_incomplete";
        return next();
      }

      req.blessBoardTenantContext = tenant;
      req.blessBoardTenantContextSource = "session_scoped";
      return next();
    } catch {
      req.blessBoardSessionTenantReason = "lookup_error";
      return next();
    }
  };
}

module.exports = {
  createLoadSessionScopedTenantContext,
};
