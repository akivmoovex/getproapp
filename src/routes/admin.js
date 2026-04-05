/**
 * Admin router: mounts domain sub-registrars after shared middleware (order matches legacy monolith).
 * Route paths and behavior are unchanged from pre-split admin.js.
 */
const express = require("express");
const multer = require("multer");
const {
  requireAdmin,
  isSuperAdmin,
  isTenantViewer,
} = require("../auth");
const {
  canEditDirectoryData,
  canManageTenantUsers,
  canAccessCrm,
  canMutateCrm,
  canClaimCrmTasks,
  canAccessTenantSettings,
  canAccessSettingsHub,
  canAccessClientProjectIntake,
  canMutateClientProjectIntake,
} = require("../auth/roles");
const { getAdminTenantId } = require("./admin/adminShared");
const clientIntake = require("../intake/clientProjectIntake");

const registerAdminAuthRoutes = require("./admin/adminAuth");
const registerAdminSuperRoutes = require("./admin/adminSuper");
const registerAdminTenantUsersRoutes = require("./admin/adminTenantUsers");
const registerAdminDashboardContentRoutes = require("./admin/adminDashboardContent");
const registerAdminDirectoryRoutes = require("./admin/adminDirectory");
const registerAdminCrmRoutes = require("./admin/adminCrm");
const registerAdminIntakeRoutes = require("./admin/adminIntake");

module.exports = function adminRoutes({ db }) {
  const router = express.Router();
  const projectIntakeUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: clientIntake.MAX_IMAGE_BYTES, files: 5 },
  });

  router.use((req, res, next) => {
    const em = req.query.embed === "1" || req.query.embed === "true";
    res.locals.embed = em;
    res.locals.bodyEmbedClass = em ? " admin-app--embed" : "";
    next();
  });

  registerAdminAuthRoutes(router, { db });

  router.use((req, res, next) => {
    if (!req.path.startsWith("/login")) return requireAdmin(req, res, next);
    return next();
  });

  /** Keep session tenant in sync with membership rows (multi-region managers). */
  router.use((req, res, next) => {
    if (!req.session || !req.session.adminUser || isSuperAdmin(req.session.adminUser.role)) {
      return next();
    }
    const u = req.session.adminUser;
    const mems = req.session.adminTenantMemberships || [];
    if (mems.length > 0) {
      const ok = mems.some((m) => Number(m.tenantId) === Number(u.tenantId));
      if (!ok) {
        const first = mems[0];
        u.tenantId = first.tenantId;
        u.role = first.role;
      }
    }
    return next();
  });

  router.post("/tenant-scope", (req, res) => {
    const u = req.session && req.session.adminUser;
    if (!u) return res.redirect("/admin/login");
    if (isSuperAdmin(u.role)) {
      return res.redirect(String(req.body.redirect || "/admin/dashboard"));
    }
    const tid = Number(req.body.tenant_id);
    if (!tid || tid <= 0) return res.status(400).send("Invalid region.");
    const mems = req.session.adminTenantMemberships || [];
    const match = mems.find((m) => Number(m.tenantId) === tid);
    if (!match) return res.status(400).send("You do not have access to that region.");
    u.tenantId = tid;
    u.role = match.role;
    const redir = String(req.body.redirect || "/admin/dashboard").trim();
    const safe = redir.startsWith("/admin") && !redir.includes("//") ? redir : "/admin/dashboard";
    req.session.save(() => res.redirect(safe));
  });

  router.use((req, res, next) => {
    if (!req.session.adminUser) return next();
    if (isTenantViewer(req.session.adminUser.role)) {
      const p = req.path;
      if (
        p.startsWith("/categories") ||
        p.startsWith("/companies") ||
        p.startsWith("/cities")
      ) {
        return res.redirect("/admin/leads");
      }
    }
    return next();
  });

  router.use((req, res, next) => {
    if (!req.session.adminUser) {
      return next();
    }
    const u = req.session.adminUser;
    const tid = getAdminTenantId(req);
    res.locals.adminNav = {
      role: u.role,
      isViewer: isTenantViewer(u.role),
      isSuper: isSuperAdmin(u.role),
      canEditDirectory: canEditDirectoryData(u.role),
      canManageUsers: canManageTenantUsers(u.role),
      tenantScoped: tid != null,
      canAccessCrm: canAccessCrm(u.role),
      canMutateCrm: canMutateCrm(u.role),
      canClaimCrmTasks: canClaimCrmTasks(u.role),
      canAccessTenantSettings: canAccessTenantSettings(u.role),
      canAccessSettingsHub: canAccessSettingsHub(u.role),
      canAccessProjectIntake: canAccessClientProjectIntake(u.role),
      canMutateProjectIntake: canMutateClientProjectIntake(u.role),
    };
    if (isSuperAdmin(u.role)) {
      const tn = db.prepare("SELECT id, slug, name FROM tenants WHERE id = ?").get(tid);
      res.locals.adminScopeTenant = tn || null;
      res.locals.adminScopeIsSession =
        req.session.adminTenantScope != null && Number(req.session.adminTenantScope) > 0;
      res.locals.adminRegionSwitch = null;
    } else {
      res.locals.adminScopeTenant = null;
      res.locals.adminScopeIsSession = false;
      const mems = req.session.adminTenantMemberships || [];
      if (mems.length > 1) {
        const ids = [...new Set(mems.map((m) => Number(m.tenantId)))].filter((n) => Number.isFinite(n) && n > 0);
        if (ids.length > 0) {
          const ph = ids.map(() => "?").join(",");
          const rows = db.prepare(`SELECT id, slug, name FROM tenants WHERE id IN (${ph})`).all(...ids);
          const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
          res.locals.adminRegionSwitch = {
            currentId: Number(u.tenantId),
            options: mems.map((m) => {
              const id = Number(m.tenantId);
              const r = byId[id];
              return {
                id,
                name: r ? r.name : `Region ${id}`,
                slug: r ? r.slug : "",
              };
            }),
          };
        } else {
          res.locals.adminRegionSwitch = null;
        }
      } else {
        res.locals.adminRegionSwitch = null;
      }
    }
    return next();
  });

  registerAdminSuperRoutes(router, { db });
  registerAdminTenantUsersRoutes(router, { db });
  registerAdminDashboardContentRoutes(router, { db });
  registerAdminDirectoryRoutes(router, { db });
  registerAdminCrmRoutes(router, { db });
  registerAdminIntakeRoutes(router, { db, projectIntakeUpload });

  return router;
};
