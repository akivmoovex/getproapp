"use strict";

/**
 * Resolve BlessBoard tenant from /c/:organizationKey for member portal mounts
 * on product apex hosts (V8 testing where apex === churchHostDomain).
 */

const { findOrganizationByKey } = require("../repositories/blessBoardCatalogueRepository");
const {
  getBlessBoardCatalogueContext,
  STATUS: CTX_STATUS,
} = require("../services/getBlessBoardCatalogueContext");
const { buildBlessBoardTenantContext } = require("./buildBlessBoardTenantContext");
const {
  normalizeOrganizationKey,
  isReservedOrganizationKey,
} = require("../../platform/organization/organizationKey");

/**
 * @param {{ getPool: () => { query: Function } }} deps
 */
function createPathMemberTenantMiddleware(deps) {
  const getPool = deps.getPool;

  return async function pathMemberTenantMiddleware(req, res, next) {
    try {
      // Mounted at /c/:organizationKey — only bind tenant for /member* under that org.
      const pathOnly = String(req.path || "").split("?")[0] || "/";
      if (pathOnly !== "/member" && !pathOnly.startsWith("/member/")) {
        return next();
      }
      if (req.blessBoardTenantContext && req.blessBoardTenantContext.resolved === true) {
        return next();
      }
      const rawKey = String(req.params.organizationKey || "").trim().toLowerCase();
      if (!rawKey || isReservedOrganizationKey(rawKey)) {
        return res.status(404).type("text").send("Not found.");
      }
      const keyNorm = normalizeOrganizationKey(rawKey);
      if (!keyNorm.ok || keyNorm.key !== rawKey) {
        return res.status(404).type("text").send("Not found.");
      }
      let org;
      try {
        org = await findOrganizationByKey(getPool(), keyNorm.key);
      } catch {
        return res.status(503).type("text").send("Temporarily unavailable.");
      }
      if (
        !org ||
        String(org.status || "") === "retired" ||
        String(org.status || "") === "inactive"
      ) {
        return res.status(404).type("text").send("Not found.");
      }
      let catalogue;
      try {
        catalogue = await getBlessBoardCatalogueContext(getPool(), org.id);
      } catch {
        return res.status(503).type("text").send("Temporarily unavailable.");
      }
      if (!catalogue.ok || !catalogue.context) {
        if (
          catalogue.status === CTX_STATUS.ORGANIZATION_NOT_FOUND ||
          catalogue.status === CTX_STATUS.CHURCH_MISSING
        ) {
          return res.status(404).type("text").send("Not found.");
        }
        return res.status(503).type("text").send("Temporarily unavailable.");
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
        return res.status(503).type("text").send("Temporarily unavailable.");
      }
      req.blessBoardTenantContext = tenant;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  createPathMemberTenantMiddleware,
};
