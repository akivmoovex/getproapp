"use strict";

const express = require("express");
const {
  authenticateAdmin,
  isSuperAdmin,
  requireAdmin,
  requireSuperAdmin,
} = require("../auth");
const { ROLES } = require("../auth/roles");
const { adminLoginLimiter } = require("../middleware/authRateLimit");
const { getPgPool } = require("../db/pg");
const platformResetRequestsInboxRepo = require("../db/pg/church/platformResetRequestsInboxRepo");
const {
  formatResetRequestCounts,
  getResetRequestStatusLabel,
  getResetRequestStatusClass,
  getResetRequestTypeLabel,
  getResetRequestTypeClass,
} = require("../church/resetRequestFormatting");
const { requireBlessBoardApexHost } = require("../church/requireBlessBoardApexHost");
const {
  rewriteBlessBoardAdminPathToInternal,
  BLESSBOARD_ADMIN,
} = require("../church/blessboardAdminPaths");
const { BLESSBOARD_NAME, BLESSBOARD_POWERED_BY } = require("../church/branding");
const registerAdminChurchPlatformRoutes = require("./admin/adminChurchPlatform");
const registerAdminChurchBranchAdminPasswordResetRoutes = require("./admin/adminChurchBranchAdminPasswordResetRequests");
const registerAdminChurchHqAdminPasswordResetRoutes = require("./admin/adminChurchHqAdminPasswordResetRequests");
const registerAdminChurchResetRequestsInboxRoutes = require("./admin/adminChurchResetRequestsInbox");
const registerAdminChurchMemberPasswordResetRequestRoutes = require("./admin/adminChurchMemberPasswordResetRequests");
const registerAdminChurchMinistryLeaderSupportRoutes = require("./admin/adminChurchMinistryLeaderSupport");

function blessboardAdminPathRewrite(req, res, next) {
  // Legacy /admin/church/organizations/... → canonical /admin/churches/...
  const legacyOrg = String(req.path || "").match(/^\/church\/organizations(\/.*)?$/);
  if (legacyOrg) {
    const suffix = legacyOrg[1] || "";
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    if (req.method === "GET" || req.method === "HEAD") {
      return res.redirect(302, `/admin/churches${suffix}${qs}`);
    }
    // POST/PUT/etc.: keep handling on the internal church platform routes
    return next();
  }

  const rewritten = rewriteBlessBoardAdminPathToInternal(req.method, req.path);
  if (rewritten) {
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    req.url = `${rewritten}${qs}`;
  }
  return next();
}

function registerBlessBoardAdminAuthRoutes(router) {
  router.get("/", (req, res) => {
    if (req.session && req.session.adminUser) {
      return res.redirect(302, BLESSBOARD_ADMIN.dashboard);
    }
    return res.redirect(302, BLESSBOARD_ADMIN.login);
  });

  router.get("/login", (req, res) => {
    if (req.session && req.session.adminUser && isSuperAdmin(req.session.adminUser.role)) {
      return res.redirect(BLESSBOARD_ADMIN.dashboard);
    }
    return res.render("admin/blessboard_login", {
      error: null,
      cancelHref: "/",
    });
  });

  router.post("/login", adminLoginLimiter, async (req, res) => {
    const pool = getPgPool();
    const { username = "", password = "" } = req.body || {};
    const user = await authenticateAdmin({ pool, username, password });
    if (!user || !isSuperAdmin(user.role)) {
      return res.render("admin/blessboard_login", {
        error: "Invalid credentials or insufficient access. BlessBoard platform admin requires a super admin account.",
        cancelHref: "/",
      });
    }

    req.session.adminTenantScope = null;
    req.session.adminTenantMemberships = undefined;
    req.session.adminUser = {
      id: user.id,
      username: user.username,
      role: user.role || ROLES.SUPER_ADMIN,
      tenantId: user.tenant_id,
    };

    return res.redirect(BLESSBOARD_ADMIN.dashboard);
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect(302, "/"));
  });
}

module.exports = function blessboardAdminRoutes() {
  const router = express.Router();

  router.use(requireBlessBoardApexHost);

  router.use((req, res, next) => {
    req.blessboardAdminMode = true;
    res.locals.blessboardAdminMode = true;
    res.locals.brandProductName = BLESSBOARD_NAME;
    res.locals.brandProductNameGetPro = "GetPro";
    res.locals._bn = BLESSBOARD_NAME;
    res.locals._bnGetPro = "GetPro";
    res.locals.blessboardPoweredBy = BLESSBOARD_POWERED_BY;
    res.locals.embed = false;
    res.locals.bodyEmbedClass = "";
    res.locals.adminUser = (req.session && req.session.adminUser) || null;
    res.locals.asset = res.locals.asset || ((k) => `/${String(k || "").replace(/^\//, "")}`);
    next();
  });

  registerBlessBoardAdminAuthRoutes(router);

  router.use((req, res, next) => {
    if (req.path.startsWith("/login")) return next();
    return requireAdmin(req, res, next);
  });

  router.use((req, res, next) => {
    if (req.path.startsWith("/login")) return next();
    return requireSuperAdmin(req, res, next);
  });

  router.use(async (req, res, next) => {
    try {
      if (!req.session.adminUser) return next();
      const pool = getPgPool();
      res.locals.adminNav = {
        role: req.session.adminUser.role,
        isSuper: true,
      };
      res.locals.churchResetPendingCounts = formatResetRequestCounts(
        await platformResetRequestsInboxRepo.getPendingResetRequestCounts(pool)
      );
      res.locals.getResetRequestStatusLabel = getResetRequestStatusLabel;
      res.locals.getResetRequestStatusClass = getResetRequestStatusClass;
      res.locals.getResetRequestTypeLabel = getResetRequestTypeLabel;
      res.locals.getResetRequestTypeClass = getResetRequestTypeClass;
      return next();
    } catch (e) {
      return next(e);
    }
  });

  router.use(blessboardAdminPathRewrite);

  registerAdminChurchPlatformRoutes(router);
  registerAdminChurchBranchAdminPasswordResetRoutes(router);
  registerAdminChurchHqAdminPasswordResetRoutes(router);
  registerAdminChurchResetRequestsInboxRoutes(router);
  registerAdminChurchMemberPasswordResetRequestRoutes(router);
  registerAdminChurchMinistryLeaderSupportRoutes(router);

  return router;
};
