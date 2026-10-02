"use strict";

/**
 * PD-V204-BB-P1-01 OPTION A — resolve managed ministry/department IDs for
 * scoped join-request review.
 *
 * Managed resources = ministry/department scope_ids from active
 * ministry_leader / department_head (and aliases) role assignments.
 * Cells remain deferred (PD-V204-BB-05).
 */

const rbacRepo = require("../../repositories/blessBoardRbacRepository");

/** Normative leadership role keys that bind an actor to a resource (Option A). */
const MANAGED_RESOURCE_LEADER_ROLES = Object.freeze({
  ministry: Object.freeze(["ministry_leader"]),
  department: Object.freeze(["department_head"]),
});

/**
 * @param {{ query: Function }} db
 * @param {{
 *   actorUserId: string,
 *   organizationId: string,
 *   churchId?: string|null,
 * }} scope
 * @returns {Promise<string[]>}
 */
async function resolveManagedJoinResourceIds(db, scope) {
  const actorUserId = String((scope && scope.actorUserId) || "").trim();
  const organizationId = String((scope && scope.organizationId) || "").trim();
  const churchId = scope && scope.churchId ? String(scope.churchId).trim() : null;
  if (!actorUserId || !organizationId) return [];

  const assignments = await rbacRepo.listActiveAssignmentsForUser(
    db,
    actorUserId,
    organizationId
  );
  const now = new Date();
  const ids = new Set();

  for (const assignment of assignments || []) {
    if (!assignment || !assignment.scopeId) continue;
    if (assignment.expiresAt && new Date(assignment.expiresAt) <= now) continue;
    if (churchId && assignment.churchId && String(assignment.churchId) !== churchId) {
      continue;
    }
    const roleKey = String(assignment.roleKey || "").trim();
    const scopeType = String(assignment.scopeType || "").trim();
    if (
      scopeType === "ministry" &&
      MANAGED_RESOURCE_LEADER_ROLES.ministry.includes(roleKey)
    ) {
      ids.add(String(assignment.scopeId));
    }
    if (
      scopeType === "department" &&
      MANAGED_RESOURCE_LEADER_ROLES.department.includes(roleKey)
    ) {
      ids.add(String(assignment.scopeId));
    }
  }

  return Array.from(ids);
}

module.exports = {
  resolveManagedJoinResourceIds,
  MANAGED_RESOURCE_LEADER_ROLES,
};
