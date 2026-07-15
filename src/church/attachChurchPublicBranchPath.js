"use strict";

const { getPgPool } = require("../db/pg");
const {
  organisationAllowsBranchPaths,
  parseBranchPath,
  findOrganisationBranchByPathSlug,
  isPubliclyActiveBranch,
  branchPathSlug,
} = require("../services/church/branchPathRoutingService");
const { renderChurchNotFound, renderChurchUnavailable } = require("./churchStatusAccess");

/**
 * Additive Growth path routing. Does not alter host_slug resolution.
 * Sets:
 *   req.churchContext.publicBranch — branch used for public content
 *   req.churchContext.branchPathPrefix — '' or '/branches/{slug}'
 *   req.churchContext.branchPathMode — 'host' | 'path' | 'foundation_blocked' | 'invalid' | 'inactive' | 'foreign'
 *   req.churchContext.hostBranch — always the host-resolved branch
 */
function createAttachChurchPublicBranchPath() {
  return async function attachChurchPublicBranchPath(req, res, next) {
    try {
      const ctx = req.churchContext;
      if (!ctx || ctx.kind !== "branch" || !ctx.organization || !ctx.branch) {
        return next();
      }

      ctx.hostBranch = ctx.branch;
      ctx.publicBranch = ctx.branch;
      ctx.branchPathPrefix = "";
      ctx.branchPathMode = "host";

      const parsed = parseBranchPath(req.path);
      if (!parsed) {
        return next();
      }

      if (!organisationAllowsBranchPaths(ctx.organization)) {
        ctx.branchPathMode = "foundation_blocked";
        ctx.publicBranch = null;
        return next();
      }

      const pool = getPgPool();
      if (!pool) {
        ctx.branchPathMode = "invalid";
        ctx.publicBranch = null;
        return next();
      }

      const target = await findOrganisationBranchByPathSlug(
        pool,
        ctx.organization.id,
        parsed.branchSlug
      );

      if (!target) {
        // Do not leak cross-tenant existence: unknown slug → not found mode.
        ctx.branchPathMode = "invalid";
        ctx.publicBranch = null;
        return next();
      }

      if (Number(target.organization_id) !== Number(ctx.organization.id)) {
        ctx.branchPathMode = "foreign";
        ctx.publicBranch = null;
        return next();
      }

      if (!isPubliclyActiveBranch(target)) {
        ctx.branchPathMode = "inactive";
        ctx.publicBranch = target;
        ctx.branchPathPrefix = `/branches/${branchPathSlug(target)}`;
        return next();
      }

      // Canonical collapse: path pointing at host branch → callers may 301 to root.
      if (Number(target.id) === Number(ctx.branch.id)) {
        ctx.branchPathMode = "canonical_host";
        ctx.publicBranch = ctx.branch;
        ctx.branchPathPrefix = "";
        ctx.branchPathRest = parsed.restPath;
        ctx.branchPathSlugParam = parsed.branchSlug;
        return next();
      }

      ctx.publicBranch = target;
      ctx.branchPathPrefix = `/branches/${branchPathSlug(target)}`;
      ctx.branchPathMode = "path";
      ctx.branchPathRest = parsed.restPath;
      ctx.branchPathSlugParam = parsed.branchSlug;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Guard for /branches/* public handlers.
 */
function requirePublicBranchPath(req, res, next) {
  const ctx = req.churchContext;
  if (!ctx || ctx.kind !== "branch") {
    return res.status(404).type("text").send("Not found.");
  }
  if (ctx.branchPathMode === "foundation_blocked") {
    return res.status(404).type("text").send("Not found.");
  }
  if (ctx.branchPathMode === "canonical_host") {
    const rest = ctx.branchPathRest || "/";
    return res.redirect(301, rest === "/" ? "/" : rest);
  }
  if (ctx.branchPathMode === "invalid" || ctx.branchPathMode === "foreign") {
    return renderChurchNotFound(req, res);
  }
  if (ctx.branchPathMode === "inactive") {
    return renderChurchUnavailable(req, res);
  }
  if (ctx.branchPathMode !== "path" || !ctx.publicBranch) {
    return res.status(404).type("text").send("Not found.");
  }
  return next();
}

module.exports = {
  createAttachChurchPublicBranchPath,
  requirePublicBranchPath,
};
