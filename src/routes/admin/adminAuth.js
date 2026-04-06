/**
 * Login / logout (before requireAdmin).
 */
const {
  authenticateAdmin,
  isSuperAdmin,
} = require("../../auth");
const { ROLES } = require("../../auth/roles");
const { STAGES } = require("../../tenants/tenantStages");
const { resolveSessionAfterLogin } = require("../../auth/adminUserTenants");
const { adminLoginLimiter } = require("../../middleware/authRateLimit");

module.exports = function registerAdminAuthRoutes(router, deps) {
  const { db } = deps;
  router.get("/login", (req, res) => {
    if (req.session && req.session.adminUser) return res.redirect("/admin/dashboard");
    return res.render("admin/login", { error: null, cancelHref: "/getpro-admin" });
  });

  router.post("/login", adminLoginLimiter, async (req, res) => {
    const { username = "", password = "" } = req.body || {};
    const user = await authenticateAdmin({ db, username, password });
    if (!user) return res.render("admin/login", { error: "Invalid username or password.", cancelHref: "/getpro-admin" });

    req.session.adminTenantScope = null;
    req.session.adminTenantMemberships = undefined;
    if (isSuperAdmin(user.role)) {
      req.session.adminUser = {
        id: user.id,
        username: user.username,
        role: user.role || ROLES.TENANT_EDITOR,
        tenantId: user.tenant_id,
      };
    } else {
      const resolved = resolveSessionAfterLogin(db, user);
      req.session.adminUser = {
        id: user.id,
        username: user.username,
        role: resolved.role,
        tenantId: resolved.tenantId,
      };
      req.session.adminTenantMemberships = resolved.memberships;
    }
    if (isSuperAdmin(user.role)) {
      /** Default region for directory tools: env override → demo → global → zm. Global is apex-only and usually has no listings — demo holds sample data. */
      const envSlug = (process.env.GETPRO_SUPER_ADMIN_DEFAULT_TENANT_SLUG || "").trim().toLowerCase();
      let scopeRow = null;
      if (envSlug) {
        scopeRow = db.prepare("SELECT id FROM tenants WHERE slug = ? AND stage = ?").get(envSlug, STAGES.ENABLED);
      }
      if (!scopeRow) {
        scopeRow = db.prepare("SELECT id FROM tenants WHERE slug = 'demo' AND stage = ?").get(STAGES.ENABLED);
      }
      if (!scopeRow) {
        scopeRow = db.prepare("SELECT id FROM tenants WHERE slug = 'global' AND stage = ?").get(STAGES.ENABLED);
      }
      if (!scopeRow) {
        scopeRow = db.prepare("SELECT id FROM tenants WHERE slug = 'zm' AND stage = ?").get(STAGES.ENABLED);
      }
      if (scopeRow && scopeRow.id) {
        req.session.adminTenantScope = scopeRow.id;
        return res.redirect("/admin/dashboard");
      }
      return res.redirect("/admin/super");
    }
    return res.redirect("/admin/dashboard");
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/admin/login"));
  });
};
