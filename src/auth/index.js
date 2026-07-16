const bcrypt = require("bcryptjs");
const {
  ROLES,
  ALL_ROLES,
  isSuperAdmin,
  isTenantViewer,
  canEditDirectoryData,
  canAccessSuperConsole,
  canAccessClientProjectIntake,
  canMutateClientProjectIntake,
  canManageArticles,
  canManageServiceProviderCategories,
} = require("./roles");
const { TENANT_ZM } = require("../tenants/tenantIds");
const { upsertMembershipAsync } = require("./adminUserTenants");
const adminUsersRepo = require("../db/pg/adminUsersRepo");
const tenantsRepo = require("../db/pg/tenantsRepo");

function adminRowDisabled(admin) {
  if (!admin) return true;
  if (admin.enabled === false) return true;
  return Number(admin.enabled) === 0;
}

async function ensureAdminUser({ pool }) {
  await tenantsRepo.ensureCanonicalTenantsIfMissing(pool);

  const username = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
  const existing = await adminUsersRepo.getByUsernameLower(pool, username);
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`[getpro] Admin user already exists: ${username}`);
    return;
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "ADMIN_PASSWORD is not set. For local dev, use .env. For production, set ADMIN_PASSWORD in your host's environment variables (the admin user is created on first boot)."
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const raw = String(process.env.ADMIN_ROLE || "").trim().toLowerCase();
  const envRole = !raw || !ALL_ROLES.includes(raw) ? ROLES.SUPER_ADMIN : raw;
  const role =
    envRole === ROLES.TENANT_MANAGER ||
    envRole === ROLES.TENANT_EDITOR ||
    envRole === ROLES.TENANT_AGENT ||
    envRole === ROLES.TENANT_VIEWER ||
    envRole === ROLES.CSR ||
    envRole === ROLES.END_USER ||
    envRole === ROLES.FINANCE_VIEWER ||
    envRole === ROLES.FINANCE_OPERATOR ||
    envRole === ROLES.FINANCE_MANAGER
      ? envRole
      : ROLES.SUPER_ADMIN;
  const tenantId = role === ROLES.SUPER_ADMIN ? null : Number(process.env.ADMIN_TENANT_ID) || TENANT_ZM;

  const id = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash,
    role,
    tenantId,
    displayName: "",
  });
  if (role !== ROLES.SUPER_ADMIN && tenantId != null && Number(tenantId) > 0) {
    try {
      await upsertMembershipAsync(pool, id, Number(tenantId), role);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[getpro] ensureAdminUser membership:", e.message);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[getpro] Admin user created: ${username} (${role})`);
}

function clearAdminSession(req) {
  if (!req.session) return;
  delete req.session.adminUser;
  delete req.session.adminTenantScope;
  delete req.session.adminTenantMemberships;
}

function adminWantsJson(req) {
  return !!(
    req.xhr ||
    (req.headers && String(req.headers.accept || "").includes("application/json")) ||
    (req.headers && String(req.headers["content-type"] || "").includes("application/json"))
  );
}

/**
 * Compare session security_version to the live admin_users row.
 * Stale sessions are destroyed and redirected (or 401 for JSON).
 */
async function enforceAdminSecurityVersion(req, res) {
  const sessionUser = req.session && req.session.adminUser;
  if (!sessionUser) return true;
  const id = Number(sessionUser.id);
  // Role-only unit stubs may omit id; skip version compare until a durable account id exists.
  if (!Number.isFinite(id) || id <= 0) return true;
  try {
    const { getPgPool } = require("../db/pg");
    const pool = getPgPool();
    if (!pool) return true;
    const {
      sessionMatchesSecurityVersion,
      rejectStaleSecuritySession,
      normalizeSecurityVersion,
    } = require("../church/accountSecurityVersion");
    const row = await adminUsersRepo.getById(pool, id);
    if (!row || adminRowDisabled(row)) {
      clearAdminSession(req);
      if (adminWantsJson(req)) {
        res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
        return false;
      }
      res.redirect("/admin/login");
      return false;
    }
    if (!sessionMatchesSecurityVersion(sessionUser, row)) {
      rejectStaleSecuritySession(req, res, {
        loginPath: "/admin/login",
        clearFn: clearAdminSession,
        wantsJson: adminWantsJson,
      });
      return false;
    }
    req.session.adminUser = {
      ...sessionUser,
      security_version: normalizeSecurityVersion(row.security_version),
    };
    return true;
  } catch (err) {
    clearAdminSession(req);
    if (adminWantsJson(req)) {
      res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
      return false;
    }
    res.redirect("/admin/login");
    return false;
  }
}

async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminUser) {
    if (adminWantsJson(req)) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    return res.redirect("/admin/login");
  }
  const ok = await enforceAdminSecurityVersion(req, res);
  if (!ok) return;
  return next();
}

async function requireSuperAdmin(req, res, next) {
  if (!req.session || !req.session.adminUser) {
    if (adminWantsJson(req)) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    return res.redirect("/admin/login");
  }
  const ok = await enforceAdminSecurityVersion(req, res);
  if (!ok) return;
  if (!canAccessSuperConsole(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Super admin access required.");
  }
  return next();
}

/** Block tenant viewers from mutating or editing directory screens (POST or restricted GET). */
function requireDirectoryEditor(req, res, next) {
  if (!req.session || !req.session.adminUser) return res.redirect("/admin/login");
  if (!canEditDirectoryData(req.session.adminUser.role)) {
    return res.status(403).type("text").send("You do not have permission to change directory data.");
  }
  return next();
}

/** Service provider category list CRUD (admin): super admin + tenant manager only. */
function requireServiceProviderCategoryAdmin(req, res, next) {
  if (!req.session || !req.session.adminUser) return res.redirect("/admin/login");
  if (!canManageServiceProviderCategories(req.session.adminUser.role)) {
    return res.status(403).type("text").send("You do not have permission to manage service provider categories.");
  }
  return next();
}

/** Directory featured / premium flags on companies: same role gate as categories; CSR and tenant_editor cannot POST. */
function requireManageDirectoryFeaturedFlags(req, res, next) {
  if (!req.session || !req.session.adminUser) return res.redirect("/admin/login");
  if (!canManageServiceProviderCategories(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Only super admin or tenant manager can change directory featured or premium flags.");
  }
  return next();
}

/** Block viewers from any POST in admin (except logout). */
function requireNotViewer(req, res, next) {
  if (!req.session || !req.session.adminUser) return res.redirect("/admin/login");
  if (isTenantViewer(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Read-only access. You can view reports only.");
  }
  return next();
}

/** Articles / managed content writes: super admin and tenant manager only (enforced server-side). */
function requireContentManager(req, res, next) {
  if (!req.session || !req.session.adminUser) return res.redirect("/admin/login");
  if (!canManageArticles(req.session.adminUser.role)) {
    return res.status(403).type("text").send("You do not have permission to create or edit this content.");
  }
  return next();
}

function requireClientProjectIntakeAccess(req, res, next) {
  if (!req.session || !req.session.adminUser) return res.redirect("/admin/login");
  if (!canAccessClientProjectIntake(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Project intake is not available for your role.");
  }
  return next();
}

/** POST/create for project intake only; excludes tenant_viewer (same rule as CRM writes). */
function requireClientProjectIntakeMutate(req, res, next) {
  if (!req.session || !req.session.adminUser) return res.redirect("/admin/login");
  if (!canMutateClientProjectIntake(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Read-only access. Creating clients or projects requires a non-viewer role.");
  }
  return next();
}

async function authenticateAdmin({ pool, username, password }) {
  const uname = String(username || "").toLowerCase();
  if (!pool) return null;
  const admin = await adminUsersRepo.getByUsernameLower(pool, uname);

  if (!admin) return null;
  if (adminRowDisabled(admin)) return null;
  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return null;
  return admin;
}

module.exports = {
  ensureAdminUser,
  requireAdmin,
  requireSuperAdmin,
  requireDirectoryEditor,
  requireServiceProviderCategoryAdmin,
  requireManageDirectoryFeaturedFlags,
  requireNotViewer,
  requireContentManager,
  requireClientProjectIntakeAccess,
  requireClientProjectIntakeMutate,
  authenticateAdmin,
  isSuperAdmin,
  isTenantViewer,
  canManageArticles,
};
