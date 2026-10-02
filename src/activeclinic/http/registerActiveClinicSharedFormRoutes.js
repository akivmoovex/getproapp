"use strict";

/**
 * ActiveClinic mount for shared Moovex form builder (SH01–SH07).
 */

const {
  createSharedFormBuilderRouter,
} = require("../../platform/http/sharedFormBuilderRoutes");
const { renderFormView } = require("../../platform/forms/renderFormView");
const { createRequireActiveClinicAuth } = require("./loadActiveClinicAuth");
const {
  createRequireActiveClinicPermission,
} = require("./activeClinicPermissionMiddleware");
const {
  PERMISSIONS,
  hasWebsitePermission,
} = require("../../platform/website/permissions");

function registerActiveClinicSharedFormRoutes(app, deps) {
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

  function sendHtml(res, html, status) {
    res.status(status || 200).type("html").send(html);
  }

  const router = createSharedFormBuilderRouter({
    productCode: "activeclinic",
    adminBasePath: "/app/forms",
    getPool,
    env,
    isProduction,
    brand: {
      productName: "ActiveClinic",
      productClass: "mx-forms--activeclinic",
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
    renderAdmin(req, res, viewName, locals) {
      const status = viewName === "access-denied" ? 403 : 200;
      sendHtml(
        res,
        renderFormView(viewName, { ...locals, pageTitle: locals.pageTitle }),
        status
      );
    },
    renderPublic(req, res, viewName, locals) {
      sendHtml(res, renderFormView(viewName, locals));
    },
  });

  app.use(router);
}

module.exports = {
  registerActiveClinicSharedFormRoutes,
};
