"use strict";

/**
 * On apex hosts, attach BlessBoard tenant context from the authenticated
 * session's organizationId when host-based routing did not resolve a tenant.
 *
 * Used so HQ / content / website admin / branch-admin can run on blessboard.org
 * when wildcard tenant hostnames are unavailable (testing / Hostinger).
 *
 * Trust model:
 * - Organization id comes only from the signed V5 session (never query/body).
 * - Optional session.branchId may select an active branch owned by that church
 *   (never client-supplied branch ids outside the session).
 * - Catalogue + buildBlessBoardTenantContext still required for resolved=true.
 * - Authorization middleware / requireBlessBoardTenantRole still enforce roles.
 */

const {
  getBlessBoardCatalogueContext,
  STATUS: CTX_STATUS,
} = require("../services/getBlessBoardCatalogueContext");
const { buildBlessBoardTenantContext } = require("./buildBlessBoardTenantContext");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {{ query: Function }} pool
 * @param {string} churchId
 * @param {string} branchId
 */
async function loadActiveBranchForChurch(pool, churchId, branchId) {
  if (!UUID_RE.test(churchId) || !UUID_RE.test(branchId)) return null;
  const r = await pool.query(
    `SELECT id, branch_key, display_name, status
       FROM blessboard.branches
      WHERE id = $1
        AND church_id = $2
        AND status = 'active'
      LIMIT 1`,
    [branchId, churchId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    key: row.branch_key != null ? String(row.branch_key) : null,
    displayName: row.display_name != null ? String(row.display_name) : "",
  };
}

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

      let primaryBranch = catalogue.context.primaryBranch
        ? {
            id: catalogue.context.primaryBranch.id,
            branchKey: catalogue.context.primaryBranch.key,
            displayName: catalogue.context.primaryBranch.displayName,
          }
        : null;

      const sessionBranchId =
        session && session.branchId != null ? String(session.branchId).trim() : "";
      if (
        sessionBranchId &&
        catalogue.context.church &&
        catalogue.context.church.id
      ) {
        const scoped = await loadActiveBranchForChurch(
          pool,
          String(catalogue.context.church.id),
          sessionBranchId
        );
        if (scoped) {
          primaryBranch = {
            id: scoped.id,
            branchKey: scoped.key,
            displayName: scoped.displayName,
          };
          req.blessBoardSessionBranchSource = "session_branch_id";
        } else {
          req.blessBoardSessionBranchSource = "session_branch_rejected";
        }
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
        primaryBranch,
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
  loadActiveBranchForChurch,
};
