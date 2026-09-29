"use strict";

/**
 * Platform Admin must hold a matching active support context to open HQ/branch portals.
 * Ordinary church roles are unaffected. Expiry is evaluated on the request path.
 */

const {
  actorHasPlatformAdminRole,
  supportMatchesTenant,
} = require("../services/platformSupportModeService");
const { resolveTenantForAuthorization } = require("../../blessboard/http/loadBlessBoardAuthorizationContext");

function sendDenied(req, res, message) {
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (wantsHtml) {
    return res.status(403).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Support mode required</title></head>
<body>
  <h1>Support mode required</h1>
  <p>${message}</p>
  <p><a href="/admin">Return to Platform Admin</a></p>
</body></html>`);
  }
  return res.status(403).type("text").send(message);
}

function portalKindFromPath(req) {
  const path = String((req.originalUrl || req.url || req.path || "").split("?")[0]);
  if (path === "/hq/support/exit" || path === "/branch-admin/support/exit") {
    return null;
  }
  if (path.startsWith("/branch-admin")) {
    return "branch";
  }
  if (path.startsWith("/hq")) {
    return "hq";
  }
  return null;
}

/**
 * @param {{
 *   getPool?: () => unknown,
 *   getTenant?: Function,
 * }} [deps]
 */
function createRequirePlatformSupportContext(deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const getTenant = options.getTenant || resolveTenantForAuthorization;

  return function requirePlatformSupportContext(req, res, next) {
    try {
      if (!actorHasPlatformAdminRole(req)) {
        return next();
      }
      const portalKind = portalKindFromPath(req);
      if (!portalKind) {
        return next();
      }
      const tenant = getTenant(req);
      if (!tenant || tenant.resolved !== true) {
        return sendDenied(
          req,
          res,
          "Support mode could not resolve a church context for this request."
        );
      }
      const support = req.platformSupportContext;
      if (!support || support.active !== true || !support.context) {
        return sendDenied(
          req,
          res,
          "Start an audited support session from Platform Admin before opening this portal."
        );
      }
      if (!supportMatchesTenant(support.context, tenant, portalKind)) {
        return sendDenied(
          req,
          res,
          "Your active support session does not match this organisation or branch."
        );
      }
      // Banner cannot be disabled via query parameters.
      req.platformSupportBanner = {
        visible: true,
        supportType: support.context.supportType,
        churchName: support.context.churchName || "this church",
        branchName: support.context.branchName || null,
        expiresAt: support.context.expiresAt,
        exitHref: "/admin/support/exit",
      };
      return next();
    } catch {
      return sendDenied(req, res, "Support mode check failed.");
    }
  };
}

module.exports = {
  createRequirePlatformSupportContext,
  portalKindFromPath,
};
