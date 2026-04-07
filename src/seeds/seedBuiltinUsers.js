const bcrypt = require("bcryptjs");
const { ROLES } = require("../auth/roles");
const { TENANT_ZM } = require("../tenants/tenantIds");
const { upsertMembershipAsync } = require("../auth/adminUserTenants");
const adminUsersRepo = require("../db/pg/adminUsersRepo");

/**
 * Idempotent built-in demo accounts (weak passwords for local/demo only).
 * Set SEED_BUILTIN_USERS=0 in production to skip.
 * @param {import("pg").Pool} pool
 */
async function seedBuiltinUsers(pool) {
  if (process.env.SEED_BUILTIN_USERS === "0") return;

  const ensure = async (username, password, role, tenantId) => {
    const u = username.toLowerCase();
    const exists = await adminUsersRepo.getIdByUsernameLower(pool, u);
    if (exists) return;
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const id = await adminUsersRepo.insertUser(pool, {
        username: u,
        passwordHash,
        role,
        tenantId,
        displayName: "",
      });
      if (tenantId != null && Number(tenantId) > 0) {
        try {
          await upsertMembershipAsync(pool, id, Number(tenantId), role);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("[getpro] seedBuiltinUsers membership:", e.message);
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[getpro] Seeded admin user: ${u} (${role})`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[getpro] seedBuiltinUsers:", e.message);
    }
  };

  await ensure("tenantmanager", "1234", ROLES.TENANT_MANAGER, TENANT_ZM);
  await ensure("crmagent", "1234", ROLES.TENANT_AGENT, TENANT_ZM);
  await ensure("superadmin", "1234", ROLES.SUPER_ADMIN, null);
}

module.exports = { seedBuiltinUsers };
