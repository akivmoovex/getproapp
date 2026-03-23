const { ROLES } = require("./roles");

/**
 * Per-tenant roles for admin users (see `admin_user_tenant_roles` table).
 * `admin_users.tenant_id` remains the default/home tenant for legacy + display;
 * effective tenant for a session comes from membership + chosen scope.
 */

function getMembershipsForUser(db, userId) {
  return db
    .prepare("SELECT tenant_id, role FROM admin_user_tenant_roles WHERE admin_user_id = ? ORDER BY tenant_id ASC")
    .all(userId);
}

function upsertMembership(db, userId, tenantId, role) {
  db.prepare(
    `INSERT INTO admin_user_tenant_roles (admin_user_id, tenant_id, role) VALUES (?, ?, ?)
     ON CONFLICT(admin_user_id, tenant_id) DO UPDATE SET role = excluded.role`
  ).run(userId, tenantId, role);
}

/**
 * Build session fields after successful password login.
 * @returns {{ tenantId: number|null, role: string, memberships: Array<{ tenantId: number, role: string }> }}
 */
function resolveSessionAfterLogin(db, userRow) {
  const mems = getMembershipsForUser(db, userRow.id);
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

/** True if this admin user may act in tenantId (home row or membership). */
function adminUserIsInTenant(db, userId, tenantId) {
  const tid = Number(tenantId);
  const uid = Number(userId);
  if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(uid) || uid <= 0) return false;
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM admin_users u
       WHERE u.id = ? AND COALESCE(u.enabled, 1) = 1
         AND (
           u.tenant_id = ?
           OR EXISTS (SELECT 1 FROM admin_user_tenant_roles m WHERE m.admin_user_id = u.id AND m.tenant_id = ?)
         )
       LIMIT 1`
    )
    .get(uid, tid, tid);
  return !!row;
}

module.exports = {
  getMembershipsForUser,
  upsertMembership,
  resolveSessionAfterLogin,
  adminUserIsInTenant,
};
