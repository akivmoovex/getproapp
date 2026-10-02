"use strict";

/**
 * Authorization resource context for branch-scoped website surfaces.
 *
 * A Branch Admin's website.* grants are scoped to the branch they are assigned
 * to. In a multi-branch church that branch is usually not the church's primary
 * branch, so defaulting the resource context to `tenant.primaryBranch` denies
 * branch admins their own editor and mislabels their shell. The defect is
 * invisible in a single-branch church, where the assigned branch and the
 * primary branch are the same row.
 *
 * Church-scoped actors (HQ admins reaching a branch surface) keep the previous
 * behaviour of falling back to the primary branch.
 */

const { resolveWebsiteScope, SCOPE_TYPE } = require("../services/resolveWebsiteScope");

function primaryBranchFallback(tenant, base) {
  const primary = tenant && tenant.primaryBranch ? tenant.primaryBranch : null;
  return {
    ...base,
    branchId: primary && primary.id ? primary.id : null,
    branchDisplayName: primary && primary.displayName ? primary.displayName : "",
  };
}

/**
 * @param {{ getPool: () => { query: Function } }} deps
 * @returns {(req: import('express').Request, tenant: object) => Promise<{
 *   organizationId: string, churchId: string, branchId: string|null,
 *   branchDisplayName: string
 * }>}
 */
function createAssignedBranchResourceContextResolver(deps) {
  const getPool = deps && deps.getPool;

  return async function resolveAssignedBranchResourceContext(req, tenant) {
    const base = {
      organizationId: tenant && tenant.organization ? tenant.organization.id : null,
      churchId: tenant && tenant.church ? tenant.church.id : null,
    };

    const session = req && req.v5Session && req.v5Session.session;
    const userId = session && session.userId;
    if (typeof getPool !== "function" || !userId) {
      return primaryBranchFallback(tenant, base);
    }

    try {
      const assigned = await resolveWebsiteScope(getPool(), {
        tenant,
        authenticatedUser: userId,
        organizationId: base.organizationId,
        churchId: base.churchId,
        requestedBranchKey: null,
      });
      if (assigned.ok && assigned.scopeType === SCOPE_TYPE.BRANCH && assigned.branchId) {
        return {
          ...base,
          branchId: assigned.branchId,
          branchDisplayName:
            (assigned.branch && assigned.branch.displayName) || assigned.branchKey || "",
        };
      }
    } catch {
      // Fall through to the primary branch; the permission check still runs and
      // fails closed if the actor holds no grant there.
    }

    return primaryBranchFallback(tenant, base);
  };
}

module.exports = { createAssignedBranchResourceContextResolver };
