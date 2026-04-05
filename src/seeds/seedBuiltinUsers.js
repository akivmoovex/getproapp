const bcrypt = require("bcryptjs");
const { ROLES } = require("../auth/roles");
const { TENANT_ZM } = require("../tenants/tenantIds");
const { upsertMembership } = require("../auth/adminUserTenants");

/**
 * Idempotent built-in demo accounts (weak passwords for local/demo only).
 * Set SEED_BUILTIN_USERS=0 in production to skip.
 */
function seedBuiltinUsers(db) {
  if (process.env.SEED_BUILTIN_USERS === "0") return;

  const hash = (p) => bcrypt.hashSync(p, 12);

  const ensure = (username, password, role, tenantId) => {
    const u = username.toLowerCase();
    const exists = db.prepare("SELECT id FROM admin_users WHERE username = ?").get(u);
    if (exists) return;
    try {
      const info = db.prepare("INSERT INTO admin_users (username, password_hash, role, tenant_id, enabled) VALUES (?, ?, ?, ?, 1)").run(
        u,
        hash(password),
        role,
        tenantId
      );
      try {
        upsertMembership(db, Number(info.lastInsertRowid), Number(tenantId), role);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[getpro] seedBuiltinUsers membership:", e.message);
      }
      // eslint-disable-next-line no-console
      console.log(`[getpro] Seeded admin user: ${u} (${role})`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[getpro] seedBuiltinUsers:", e.message);
    }
  };

  ensure("tenantmanager", "1234", ROLES.TENANT_MANAGER, TENANT_ZM);
  ensure("crmagent", "1234", ROLES.TENANT_AGENT, TENANT_ZM);
  ensure("superadmin", "1234", ROLES.SUPER_ADMIN, null);
}

module.exports = { seedBuiltinUsers };
