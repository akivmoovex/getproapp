"use strict";

/**
 * BlessBoard mount for shared Moovex announcement publication (AN01–AN05).
 * Product-specific BB announcements (/hq/announcements) remain separate.
 */

const {
  createSharedAnnouncementRouter,
} = require("../../platform/http/sharedAnnouncementRoutes");
const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const {
  createRequireV5AuthenticatedSession,
} = require("../../platform/http/v5SessionAuthGate");
const {
  resolveTenantForAuthorization,
} = require("./loadBlessBoardAuthorizationContext");

function hasPermission(req, key) {
  const ctx = req.blessBoardAuthorizationContext;
  const granted = (ctx && ctx.permissions) || [];
  if (granted.includes(key)) return true;
  const sessionPerms =
    (req.v5Session &&
      req.v5Session.authorization &&
      req.v5Session.authorization.permissions) ||
    [];
  return sessionPerms.includes(key);
}

function registerBlessBoardSharedAnnouncementRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env || process.env;
  const isProduction = deps.isProduction === true;
  const variant = deps.variant === "branch" ? "branch" : "hq";
  const adminBasePath =
    variant === "hq" ? "/hq/announcement-studio" : "/branch-admin/announcement-studio";

  const requireSession = createRequireV5AuthenticatedSession({
    loginNext: adminBasePath,
  });
  const requireView = createRequireBlessBoardPermission("announcements.manage", null, {
    getPool,
    scopeMode: variant === "hq" ? "church" : undefined,
  });

  function requireAdmin(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || adminBasePath })) {
      return;
    }
    return requireView(req, res, next);
  }

  const router = createSharedAnnouncementRouter({
    productCode: "blessboard",
    adminBasePath,
    publicListPath: "/announcements/shared/public",
    getPool,
    env,
    isProduction,
    brand: {
      productName: "BlessBoard",
      productClass: "mx-ann--blessboard",
    },
    requireAdmin,
    canView(req) {
      return (
        hasPermission(req, "announcements.manage") ||
        hasPermission(req, "announcements.publish") ||
        hasPermission(req, "announcements.view")
      );
    },
    canManage(req) {
      return (
        hasPermission(req, "announcements.manage") ||
        hasPermission(req, "announcements.publish")
      );
    },
    resolveTenant(req) {
      const tenant = resolveTenantForAuthorization(req);
      if (!tenant || !tenant.organization || !tenant.organization.id) return null;
      const session = req.v5Session && req.v5Session.session;
      return {
        organizationId: tenant.organization.id,
        actorIdentityId: (session && session.platformIdentityId) || null,
      };
    },
  });

  app.use(router);
}

module.exports = {
  registerBlessBoardSharedAnnouncementRoutes,
};
