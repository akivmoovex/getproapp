"use strict";

/**
 * When an active support context exists, overlay BlessBoard tenant context from it
 * so HQ/branch portals resolve the supported church/branch without replacing the
 * Platform Admin session cookie.
 */

const {
  getBlessBoardCatalogueContext,
} = require("../../blessboard/services/getBlessBoardCatalogueContext");
const {
  buildBlessBoardTenantContext,
} = require("../../blessboard/http/buildBlessBoardTenantContext");
const {
  resolveTenantForAuthorization,
} = require("../../blessboard/http/loadBlessBoardAuthorizationContext");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {{
 *   getPool: () => { query: Function } | null | undefined,
 *   isApexHost?: (req: import('express').Request) => boolean,
 * }} deps
 */
function createApplySupportContextTenant(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;

  return async function applySupportContextTenant(req, res, next) {
    void res;
    try {
      const support = req.platformSupportContext;
      if (!support || support.active !== true || !support.context) {
        return next();
      }
      const ctx = support.context;
      if (!UUID_RE.test(String(ctx.organizationId || ""))) {
        return next();
      }
      if (typeof getPool !== "function") {
        return next();
      }
      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        return next();
      }

      const onApex = typeof isApexHost === "function" && isApexHost(req);
      // Same resolution path as HQ/branch gates (includes proposedTenant fallback).
      const existing = resolveTenantForAuthorization(req);

      if (
        existing &&
        existing.organization &&
        String(existing.organization.id) !== String(ctx.organizationId)
      ) {
        // Host already resolved a different organisation — do not silently switch tenants.
        return next();
      }

      // On non-apex hosts, only refine an already-resolved matching tenant (e.g. branch scope).
      // Never invent a tenant from the support cookie alone on a foreign hostname.
      if (!onApex && !existing) {
        return next();
      }

      const catalogue = await getBlessBoardCatalogueContext(pool, ctx.organizationId);
      if (!catalogue.ok || !catalogue.context) {
        return next();
      }
      const cat = catalogue.context;

      let primaryBranch = cat.primaryBranch
        ? {
            id: cat.primaryBranch.id,
            branchKey: cat.primaryBranch.key,
            displayName: cat.primaryBranch.displayName,
          }
        : null;

      if (ctx.supportType === "branch" && ctx.branchId) {
        const br = await pool.query(
          `SELECT id, branch_key, display_name
             FROM blessboard.branches
            WHERE id = $1
              AND church_id = $2
              AND status = 'active'
            LIMIT 1`,
          [ctx.branchId, ctx.churchId]
        );
        if (br.rows[0]) {
          primaryBranch = {
            id: String(br.rows[0].id),
            branchKey: String(br.rows[0].branch_key),
            displayName: String(br.rows[0].display_name || ""),
          };
        }
      }

      const tenant = buildBlessBoardTenantContext({
        organization: {
          id: cat.organization.id,
          key: cat.organization.key,
        },
        church: cat.church
          ? {
              id: cat.church.id,
              churchKey: cat.church.key,
              displayName: cat.church.displayName,
              dataEnvironment: cat.church.dataEnvironment,
            }
          : null,
        hqBranch: cat.hqBranch
          ? {
              id: cat.hqBranch.id,
              branchKey: cat.hqBranch.key,
              displayName: cat.hqBranch.displayName,
            }
          : null,
        primaryBranch,
      });
      if (tenant && tenant.resolved === true) {
        req.blessBoardTenantContext = tenant;
        req.blessBoardTenantContextSource = "platform_support_context";
        req.blessBoardSupportTenantApplied = true;
      }
      return next();
    } catch {
      return next();
    }
  };
}

module.exports = {
  createApplySupportContextTenant,
};
