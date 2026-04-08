/**
 * Login / logout (before requireAdmin).
 */
const {
  authenticateAdmin,
  isSuperAdmin,
} = require("../../auth");
const { ROLES } = require("../../auth/roles");
const { STAGES } = require("../../tenants/tenantStages");
const { resolveSessionAfterLoginAsync } = require("../../auth/adminUserTenants");
const { adminLoginLimiter } = require("../../middleware/authRateLimit");
const { getPgPool } = require("../../db/pg");
const tenantsRepo = require("../../db/pg/tenantsRepo");
const { tenantHomeHrefFromPrefix } = require("../../lib/tenantHomeHref");
const { ADMIN_DASHBOARD, ADMIN_SUPER } = require("../../auth/postLoginDestinations");

/**
 * Super-admin default directory scope after login (env slug → demo → global → zm), enabled tenants only.
 * @param {import("pg").Pool} pool
 */
async function pickSuperAdminInitialTenantScope(pool) {
  const envSlug = (process.env.GETPRO_SUPER_ADMIN_DEFAULT_TENANT_SLUG || "").trim().toLowerCase();
  const trySlugs = [];
  if (envSlug) trySlugs.push(envSlug);
  trySlugs.push("demo", "global", "zm");

  for (const s of trySlugs) {
    const row = await tenantsRepo.getIdBySlugAndStage(pool, s, STAGES.ENABLED);
    if (row && row.id) return row.id;
  }
  return null;
}

module.exports = function registerAdminAuthRoutes(router) {
  /** Host-level paths often link to `/admin` with no trailing segment; Express has no implicit index route. */
  router.get("/", (req, res) => {
    const embed =
      req.query && (req.query.embed === "1" || req.query.embed === "true") ? "?embed=1" : "";
    if (req.session && req.session.adminUser) {
      return res.redirect(302, `${ADMIN_DASHBOARD}${embed}`);
    }
    return res.redirect(302, `/admin/login${embed}`);
  });

  router.get("/login", (req, res) => {
    if (req.session && req.session.adminUser) return res.redirect(ADMIN_DASHBOARD);
    const prefix = req.tenantUrlPrefix != null ? String(req.tenantUrlPrefix) : "";
    const cancelHref = tenantHomeHrefFromPrefix(prefix);
    return res.render("admin/login", { error: null, cancelHref });
  });

  router.post("/login", adminLoginLimiter, async (req, res) => {
    const pool = getPgPool();
    const { username = "", password = "" } = req.body || {};
    const user = await authenticateAdmin({ pool, username, password });
    if (!user) {
      const prefix = req.tenantUrlPrefix != null ? String(req.tenantUrlPrefix) : "";
      const cancelHref = tenantHomeHrefFromPrefix(prefix);
      return res.render("admin/login", { error: "Invalid username or password.", cancelHref });
    }

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
      const resolved = await resolveSessionAfterLoginAsync(pool, user);
      req.session.adminUser = {
        id: user.id,
        username: user.username,
        role: resolved.role,
        tenantId: resolved.tenantId,
      };
      req.session.adminTenantMemberships = resolved.memberships;
    }
    if (isSuperAdmin(user.role)) {
      const scopeId = await pickSuperAdminInitialTenantScope(pool);
      if (scopeId) {
        req.session.adminTenantScope = scopeId;
        return res.redirect(ADMIN_DASHBOARD);
      }
      return res.redirect(ADMIN_SUPER);
    }
    return res.redirect(ADMIN_DASHBOARD);
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/admin/login"));
  });
};
