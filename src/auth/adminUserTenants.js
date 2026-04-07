const { ROLES } = require("./roles");
const adminUserTenantRolesRepo = require("../db/pg/adminUserTenantRolesRepo");

/**
 * Per-tenant roles for admin users (see `admin_user_tenant_roles` table).
 * `admin_users.tenant_id` remains the default/home tenant for legacy + display;
 * effective tenant for a session comes from membership + chosen scope.
 */

/**
 * @param {import("pg").Pool} pool
 */
async function getMembershipsForUserAsync(pool, userId) {
  return adminUserTenantRolesRepo.listByAdminUserId(pool, userId);
}

/**
 * @param {import("pg").Pool} pool
 */
async function upsertMembershipAsync(pool, userId, tenantId, role) {
  await adminUserTenantRolesRepo.upsert(pool, userId, tenantId, role);
}

/**
 * @param {Array<{ tenant_id: number, role: string }>} mems
 * @returns {{ tenantId: number|null, role: string, memberships: Array<{ tenantId: number, role: string }> }}
 */
function resolveSessionFromMemberships(userRow, mems) {
  if (mems.length === 0) {
    return {
      tenantId: userRow.tenant_id != null ? Number(userRow.tenant_id) : null,
      role: userRow.role || ROLES.TENANT_EDITOR,
      memberships: [],
    };
  }
  const prefer = userRow.tenant_id != null ? Number(userRow.tenant_id) : null;
  let pick = mems[0];
  if (prefer && mems.some((m) => Number(m.tenant_id) === prefer)) {
    pick = mems.find((m) => Number(m.tenant_id) === prefer);
  }
  const tenantId = Number(pick.tenant_id);
  const role = pick.role || userRow.role || ROLES.TENANT_EDITOR;
  return {
    tenantId,
    role,
    memberships: mems.map((m) => ({
      tenantId: Number(m.tenant_id),
      role: m.role,
    })),
  };
}

/**
 * PostgreSQL memberships after login.
 * @param {import("pg").Pool} pool
 * @returns {Promise<{ tenantId: number|null, role: string, memberships: Array<{ tenantId: number, role: string }> }>}
 */
async function resolveSessionAfterLoginAsync(pool, userRow) {
  const mems = await getMembershipsForUserAsync(pool, userRow.id);
  return resolveSessionFromMemberships(userRow, mems);
}

module.exports = {
  getMembershipsForUserAsync,
  upsertMembershipAsync,
  resolveSessionAfterLoginAsync,
};
