"use strict";

/**
 * ActiveClinic mount for shared Moovex announcement publication (AN01–AN05).
 */

const {
  createSharedAnnouncementRouter,
} = require("../../platform/http/sharedAnnouncementRoutes");
const { createRequireActiveClinicAuth } = require("./loadActiveClinicAuth");
const {
  createRequireActiveClinicPermission,
} = require("./activeClinicPermissionMiddleware");
const {
  PERMISSIONS,
  hasWebsitePermission,
} = require("../../platform/website/permissions");

function registerActiveClinicSharedAnnouncementRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env || process.env;
  const isProduction = deps.isProduction === true;

  const requireAuth = createRequireActiveClinicAuth({
    getPool,
    env,
    isProduction,
    loginPath: "/login",
  });
  const requireView = createRequireActiveClinicPermission({
    getPool,
    env,
    isProduction,
  })(PERMISSIONS.VIEW);

  const router = createSharedAnnouncementRouter({
    productCode: "activeclinic",
    adminBasePath: "/app/announcements",
    publicListPath: "/announcements/shared/public",
    getPool,
    env,
    isProduction,
    brand: {
      productName: "ActiveClinic",
      productClass: "mx-ann--activeclinic",
    },
    requireAdmin: [requireAuth, requireView],
    canView(req) {
      const perms = (req.activeClinicAuth && req.activeClinicAuth.permissions) || [];
      return (
        hasWebsitePermission(perms, PERMISSIONS.VIEW) ||
        hasWebsitePermission(perms, PERMISSIONS.EDIT) ||
        hasWebsitePermission(perms, PERMISSIONS.PUBLISH)
      );
    },
    canManage(req) {
      const perms = (req.activeClinicAuth && req.activeClinicAuth.permissions) || [];
      return (
        hasWebsitePermission(perms, PERMISSIONS.EDIT) ||
        hasWebsitePermission(perms, PERMISSIONS.PUBLISH)
      );
    },
    resolveTenant(req) {
      const auth = req.activeClinicAuth;
      if (!auth || !auth.organization || !auth.organization.id) return null;
      return {
        organizationId: auth.organization.id,
        actorIdentityId:
          (auth.platformIdentity && auth.platformIdentity.id) || null,
      };
    },
  });

  app.use(router);
}

module.exports = {
  registerActiveClinicSharedAnnouncementRoutes,
};
