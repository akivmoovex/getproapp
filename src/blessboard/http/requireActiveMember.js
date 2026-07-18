"use strict";

/**
 * Fail-closed Express middleware: active member + active branch membership.
 * Admin roles alone never grant access.
 */

const {
  requireActiveMemberForTenant,
  STATUS,
} = require("../services/requireActiveMemberForTenant");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");

/**
 * @param {{ getPool: () => { query: Function, connect?: Function } }} deps
 */
function createRequireActiveMember(deps) {
  const getPool = deps.getPool;

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  return async function requireActiveMember(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated && req.v5Session.session);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, "/login?next=/member");
      }
      return res.status(401).type("text").send("Sign-in is required.");
    }

    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.primaryBranch) {
      return res.status(403).type("text").send("You do not have access to this site.");
    }

    const userId = req.v5Session.session.userId;
    const access = await requireActiveMemberForTenant(getPool(), {
      userId,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
    });

    if (!access.ok) {
      if (access.status === STATUS.UNAUTHENTICATED || access.status === STATUS.INACTIVE_USER) {
        const wantsHtml = String(req.get("accept") || "").includes("text/html");
        if (wantsHtml) {
          return res.redirect(303, "/login?next=/member");
        }
        return res.status(401).type("text").send("Sign-in is required.");
      }
      if (access.status === STATUS.LOOKUP_ERROR) {
        return res.status(503).type("text").send("Member portal is temporarily unavailable.");
      }
      return res.status(403).type("text").send("You do not have member access to this site.");
    }

    req.blessBoardMemberAccess = {
      member: access.member,
      membership: access.membership,
      tenant,
    };
    return next();
  };
}

module.exports = {
  createRequireActiveMember,
};
