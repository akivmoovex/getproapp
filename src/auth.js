const bcrypt = require("bcryptjs");
const {
  ROLES,
  normalizeRole,
  isSuperAdmin,
  isTenantViewer,
  canEditDirectoryData,
  canAccessSuperConsole,
  canAccessClientProjectIntake,
  canMutateClientProjectIntake,
} = require("./roles");
const { TENANT_ZM } = require("./tenantIds");
const { upsertMembership } = require("./adminUserTenants");

async function ensureAdminUser({ db }) {
  const username = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
  const admin = db.prepare("SELECT * FROM admin_users WHERE username = ?").get(username);
  if (admin) return;

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "ADMIN_PASSWORD is not set. For local dev, use .env. For production, set ADMIN_PASSWORD in your host's environment variables (the admin user is created on first boot)."
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const envRole = normalizeRole(process.env.ADMIN_ROLE);
  const role =
    envRole === ROLES.TENANT_MANAGER ||
    envRole === ROLES.TENANT_EDITOR ||
    envRole === ROLES.TENANT_AGENT ||
    envRole === ROLES.TENANT_VIEWER
      ? envRole
      : ROLES.SUPER_ADMIN;
  const tenantId = role === ROLES.SUPER_ADMIN ? null : Number(process.env.ADMIN_TENANT_ID) || TENANT_ZM;

  const info = db.prepare("INSERT INTO admin_users (username, password_hash, role, tenant_id, enabled) VALUES (?, ?, ?, ?, 1)").run(
    username,
    passwordHash,
    role,
    tenantId
  );
  if (role !== ROLES.SUPER_ADMIN && tenantId != null && Number(tenantId) > 0) {
    try {
      upsertMembership(db, Number(info.lastInsertRowid), Number(tenantId), role);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[getpro] ensureAdminUser membership:", e.message);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`Admin user created: ${username} (${role})`);
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminUser) return next();
  res.redirect("/admin/login");
}

function requireSuperAdmin(req, res, next) {
  if (!req.session || !req.session.adminUser) return res.redirect("/admin/login");
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

/** Block viewers from any POST in admin (except logout). */
function requireNotViewer(req, res, next) {
  if (!req.session || !req.session.adminUser) return res.redirect("/admin/login");
  if (isTenantViewer(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Read-only access. You can view reports only.");
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

/** POST/create for project intake only; keeps tenant_viewer read-only without opening other admin POSTs. */
function requireClientProjectIntakeMutate(req, res, next) {
  if (!req.session || !req.session.adminUser) return res.redirect("/admin/login");
  if (!canMutateClientProjectIntake(req.session.adminUser.role)) {
    return res.status(403).type("text").send("Read-only access. Creating clients or projects requires a non-viewer role.");
  }
  return next();
}

async function authenticateAdmin({ db, username, password }) {
  const admin = db.prepare("SELECT * FROM admin_users WHERE username = ?").get(username.toLowerCase());
  if (!admin) return null;
  if (Number(admin.enabled) === 0) return null;
  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return null;
  return admin;
}

module.exports = {
  ensureAdminUser,
  requireAdmin,
  requireSuperAdmin,
  requireDirectoryEditor,
  requireNotViewer,
  requireClientProjectIntakeAccess,
  requireClientProjectIntakeMutate,
  authenticateAdmin,
  isSuperAdmin,
  isTenantViewer,
};
