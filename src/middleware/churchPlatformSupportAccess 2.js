"use strict";

/**
 * Middleware / helpers for platform support access enforcement.
 * Do not rely on UI alone — call assertCanPerformSupportAction on every tenant-entry action.
 */

const churchPlatformSupportAccessService = require("../services/church/churchPlatformSupportAccessService");
const { getPgPool } = require("../db/pg");

/**
 * Express middleware factory.
 * @param {{ action: string, organizationIdParam?: string, branchIdParam?: string, recordUse?: boolean }} opts
 */
function requireSupportAccessAction(opts) {
  const action = String(opts.action || "").trim();
  const orgParam = opts.organizationIdParam || "organizationId";
  const branchParam = opts.branchIdParam || "branchId";

  return async function supportAccessMiddleware(req, res, next) {
    try {
      const pool = getPgPool();
      const adminUser = req.session && req.session.adminUser;
      const organizationId = Number(
        req.params[orgParam] || req.body?.[orgParam] || req.query?.[orgParam]
      );
      const branchRaw = req.params[branchParam] || req.body?.[branchParam] || req.query?.[branchParam];
      const branchId = branchRaw != null && String(branchRaw).trim() !== "" ? Number(branchRaw) : null;

      const result = await churchPlatformSupportAccessService.assertCanPerformSupportAction(pool, {
        adminUser,
        organizationId,
        branchId: Number.isFinite(branchId) && branchId > 0 ? branchId : null,
        action,
        recordUse: opts.recordUse !== false,
      });
      req.churchSupportAccess = result;
      return next();
    } catch (err) {
      if (err && err.code) {
        const status =
          err.code === "ORG_NOT_FOUND"
            ? 404
            : err.code === "SUPPORT_INACTIVE"
              ? 401
              : 403;
        if (req.accepts("html") && !req.xhr && !String(req.path || "").endsWith(".json")) {
          return res.status(status).render("admin/church/support_access_denied", {
            error: err.message,
            code: err.code,
            activeNav: "church_platform_support_access",
          });
        }
        return res.status(status).json({ ok: false, error: err.message, code: err.code });
      }
      return next(err);
    }
  };
}

module.exports = {
  requireSupportAccessAction,
};
