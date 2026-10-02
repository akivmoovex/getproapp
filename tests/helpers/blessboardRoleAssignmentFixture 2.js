"use strict";

/**
 * Canonical BlessBoard catalogue role-assignment fixtures (V2.02+).
 *
 * Uses blessboard.user_role_assignments only — never blessboard.user_roles.
 * Preserves schema invariants:
 *   - user_role_assignments_revoked_consistency (revoked ⇒ revoked_at set)
 *   - user_role_assignments_active_scope_uidx (one active row per user/org/role/scope)
 *
 * Does not grant broad/admin permissions; callers choose explicit role + scope.
 */

const rbacRepo = require("../../src/blessboard/repositories/blessBoardRbacRepository");

function sameScope(assignment, scope) {
  if (!assignment || !scope) return false;
  if (String(assignment.scopeType || "") !== String(scope.scopeType || "")) return false;
  if (String(assignment.scopeId || "") !== String(scope.scopeId || "")) return false;
  if (String(assignment.churchId || "") !== String(scope.churchId || "")) return false;
  return true;
}

/**
 * Insert an active catalogue assignment only when no matching active row exists.
 *
 * @param {import("pg").Pool | { query: Function }} pool
 * @param {string} userId
 * @param {string} roleKey catalogue role_key
 * @param {{
 *   organizationId: string,
 *   churchId?: string | null,
 *   scopeType: string,
 *   scopeId: string | null,
 *   assignmentOrigin?: string,
 *   assignmentReason?: string,
 * }} scope
 */
async function ensureCatalogueAssignment(pool, userId, roleKey, scope) {
  const role = await rbacRepo.findRoleByKey(pool, roleKey);
  if (!role || !role.id) {
    throw new Error(`blessboardRoleAssignmentFixture: missing catalogue role ${roleKey}`);
  }
  const existing = await rbacRepo.listActiveAssignmentsForUser(
    pool,
    userId,
    scope.organizationId
  );
  const hit = (existing || []).find(
    (a) => String(a.roleKey) === String(roleKey) && sameScope(a, scope)
  );
  if (hit) return { assignment: hit, created: false };

  const assignment = await rbacRepo.insertAssignment(pool, {
    userId,
    organizationId: scope.organizationId,
    churchId: scope.churchId || null,
    roleId: role.id,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    assignmentOrigin: scope.assignmentOrigin || "manual",
    assignmentReason: scope.assignmentReason || "test fixture ensureCatalogueAssignment",
  });
  return { assignment, created: true };
}

/**
 * Revoke all active assignments for a user in an organization using the
 * repository revoke path (sets revoked_at — satisfies revoked_consistency).
 *
 * @param {import("pg").Pool | { query: Function }} pool
 * @param {string} userId
 * @param {string} organizationId
 * @param {{ reason?: string, revokedByUserId?: string | null }} [opts]
 */
async function revokeActiveAssignmentsForUser(pool, userId, organizationId, opts = {}) {
  const reason =
    opts.reason != null && String(opts.reason).trim() !== ""
      ? String(opts.reason).trim()
      : "test fixture revokeActiveAssignmentsForUser";
  const active = await rbacRepo.listActiveAssignmentsForUser(pool, userId, organizationId);
  const revoked = [];
  for (const row of active || []) {
    // Platform-scoped rows may appear when listing with an org; only revoke
    // assignments that belong to this organization (or explicit platform scope
    // when the caller intentionally listed them for that org context).
    if (
      row.scopeType !== "platform" &&
      String(row.organizationId) !== String(organizationId)
    ) {
      continue;
    }
    const updated = await rbacRepo.revokeAssignment(pool, {
      assignmentId: row.id,
      revokedByUserId: opts.revokedByUserId != null ? opts.revokedByUserId : null,
      revocationReason: reason,
    });
    if (updated) revoked.push(updated);
  }
  return revoked;
}

module.exports = {
  ensureCatalogueAssignment,
  revokeActiveAssignmentsForUser,
};
