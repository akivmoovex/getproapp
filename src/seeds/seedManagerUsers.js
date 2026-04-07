const bcrypt = require("bcryptjs");
const { ROLES } = require("../auth/roles");
const { TENANT_DEMO, TENANT_ZM } = require("../tenants/tenantIds");
const { upsertMembershipAsync } = require("../auth/adminUserTenants");
const adminUsersRepo = require("../db/pg/adminUsersRepo");

/**
 * Idempotent: Martin, Faith, Daisy as tenant_manager on Demo + Zambia (weak password for demo only).
 * Set SEED_MANAGER_USERS=0 to skip.
 * @param {import("pg").Pool} pool
 */
async function seedManagerUsers(pool) {
  if (process.env.SEED_MANAGER_USERS === "0") return;

  const people = [
    { username: "martin", displayName: "Martin Ndemena" },
    { username: "faith", displayName: "Faith Lutangu" },
    { username: "daisy", displayName: "Daisy Namuyemba" },
  ];

  const tenantIds = [TENANT_DEMO, TENANT_ZM];

  for (const p of people) {
    const u = String(p.username || "").toLowerCase().trim();
    if (!u) continue;
    try {
      let uid;
      const existing = await adminUsersRepo.getIdByUsernameLower(pool, u);
      const passwordHash = await bcrypt.hash("1234", 12);
      if (!existing) {
        uid = await adminUsersRepo.insertUser(pool, {
          username: u,
          passwordHash,
          role: ROLES.TENANT_MANAGER,
          tenantId: TENANT_ZM,
          displayName: p.displayName,
        });
      } else {
        uid = existing.id;
        await adminUsersRepo.updateDisplayNameAndPasswordHash(pool, uid, p.displayName, passwordHash);
      }
      if (!uid) continue;
      for (const tid of tenantIds) {
        await upsertMembershipAsync(pool, uid, tid, ROLES.TENANT_MANAGER);
      }
      await adminUsersRepo.updateRoleTenantHome(pool, uid, ROLES.TENANT_MANAGER, TENANT_ZM);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[getpro] seedManagerUsers:", e.message);
    }
  }
}

module.exports = { seedManagerUsers };
