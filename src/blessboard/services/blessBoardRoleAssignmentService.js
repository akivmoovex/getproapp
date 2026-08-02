"use strict";

/**
 * Internal RBAC assignment service (no public management UI in this stage).
 */

const rbacRepo = require("../repositories/blessBoardRbacRepository");
const {
  authorize,
  listEffectivePermissions,
  REASON: AUTHZ_REASON,
} = require("./blessBoardRbacAuthorizationService");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
});

const SCOPE_TYPES = Object.freeze([
  "platform",
  "organisation",
  "church",
  "branch",
  "personal",
  "ministry",
  "department",
  "cell",
  "class",
  "assigned_member",
  "assigned_case",
]);
const ORIGINS = Object.freeze(["system", "legacy_compatibility", "manual", "migration", "support"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.query === "function" && typeof db.release === "function") {
      return await fn(db);
    }
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

/**
 * @param {object} input
 */
function validateAssignmentScope(input) {
  const scopeType = String((input && input.scopeType) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = input.churchId != null ? String(input.churchId).trim() : "";
  const scopeId = input.scopeId != null ? String(input.scopeId).trim() : "";
  const userId = String((input && input.userId) || "").trim();

  if (!SCOPE_TYPES.includes(scopeType)) {
    return { ok: false, reason: "scope_type" };
  }
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(userId)) {
    return { ok: false, reason: "ids" };
  }

  if (scopeType === "platform") {
    if (churchId || scopeId) return { ok: false, reason: "platform_scope" };
    return {
      ok: true,
      scopeType,
      organizationId,
      churchId: null,
      scopeId: null,
    };
  }
  if (scopeType === "organisation") {
    if (churchId) return { ok: false, reason: "organisation_scope" };
    if (scopeId && scopeId !== organizationId) return { ok: false, reason: "organisation_scope_id" };
    return {
      ok: true,
      scopeType,
      organizationId,
      churchId: null,
      scopeId: scopeId || null,
    };
  }
  if (scopeType === "church") {
    if (!UUID_RE.test(churchId) || !UUID_RE.test(scopeId) || scopeId !== churchId) {
      return { ok: false, reason: "church_scope" };
    }
    return { ok: true, scopeType, organizationId, churchId, scopeId };
  }
  if (scopeType === "branch") {
    if (!UUID_RE.test(churchId) || !UUID_RE.test(scopeId)) {
      return { ok: false, reason: "branch_scope" };
    }
    return { ok: true, scopeType, organizationId, churchId, scopeId };
  }
  if (
    scopeType === "ministry" ||
    scopeType === "department" ||
    scopeType === "cell" ||
    scopeType === "class" ||
    scopeType === "assigned_member" ||
    scopeType === "assigned_case"
  ) {
    if (!UUID_RE.test(churchId) || !UUID_RE.test(scopeId)) {
      return { ok: false, reason: `${scopeType}_scope` };
    }
    return { ok: true, scopeType, organizationId, churchId, scopeId };
  }
  if (scopeType === "personal") {
    if (scopeId !== userId) return { ok: false, reason: "personal_scope" };
    return {
      ok: true,
      scopeType,
      organizationId,
      churchId: churchId && UUID_RE.test(churchId) ? churchId : null,
      scopeId: userId,
    };
  }
  return { ok: false, reason: "scope_type" };
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {object} input
 */
async function createRoleAssignment(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const targetUserId = String((input && input.userId) || "").trim();
  const roleKey = String((input && input.roleKey) || "").trim();
  const origin = String((input && input.assignmentOrigin) || "manual").trim();
  const reason = input.assignmentReason != null ? String(input.assignmentReason).trim() : "";
  const expiresAt = input.expiresAt || null;

  if (!UUID_RE.test(actorUserId) || !UUID_RE.test(targetUserId) || !roleKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, assignment: null, reason: "ids" };
  }
  if (!ORIGINS.includes(origin)) {
    return { ok: false, status: STATUS.INVALID_INPUT, assignment: null, reason: "origin" };
  }
  if (actorUserId === targetUserId) {
    return { ok: false, status: STATUS.FORBIDDEN, assignment: null, reason: "self_elevation" };
  }

  const scope = validateAssignmentScope({
    scopeType: input.scopeType,
    organizationId: input.organizationId,
    churchId: input.churchId,
    scopeId: input.scopeId,
    userId: targetUserId,
  });
  if (!scope.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, assignment: null, reason: scope.reason };
  }

  // Personal scope must not grant staff-wide roles
  if (scope.scopeType === "personal") {
    return { ok: false, status: STATUS.FORBIDDEN, assignment: null, reason: "personal_no_staff" };
  }

  try {
    return await withClient(db, async (client) => {
      const role = await rbacRepo.findRoleByKey(client, roleKey);
      if (!role || !role.isActive) {
        return { ok: false, status: STATUS.NOT_FOUND, assignment: null, reason: "role" };
      }

      const neededPerm = role.isSensitive ? "roles.assign_sensitive" : "roles.assign_standard";
      if (role.isSensitive && !reason) {
        return { ok: false, status: STATUS.INVALID_INPUT, assignment: null, reason: "reason_required" };
      }

      const tenantContext = input.tenantContext || {
        resolved: true,
        organization: { id: scope.organizationId },
        church: { id: scope.churchId || (input.actorChurchId || null) },
        primaryBranch: input.tenantContext && input.tenantContext.primaryBranch
          ? input.tenantContext.primaryBranch
          : scope.scopeType === "branch"
            ? { id: scope.scopeId }
            : null,
      };

      // When church_id is null (org/platform), require actor church from tenant for audit path.
      const actorChurchId =
        scope.churchId ||
        (tenantContext.church && tenantContext.church.id) ||
        input.actorChurchId ||
        null;
      if (!actorChurchId || !UUID_RE.test(String(actorChurchId))) {
        return { ok: false, status: STATUS.INVALID_INPUT, assignment: null, reason: "church_context" };
      }
      if (!tenantContext.church || !tenantContext.church.id) {
        tenantContext.church = { id: actorChurchId };
      }
      if (!tenantContext.organization) {
        tenantContext.organization = { id: scope.organizationId };
      }
      tenantContext.resolved = true;

      const authz = await authorize(client, {
        actor: { userId: actorUserId },
        permission: neededPerm,
        tenantContext,
        resourceContext: {
          organizationId: scope.organizationId,
          churchId: actorChurchId,
          branchId: scope.scopeType === "branch" ? scope.scopeId : null,
        },
      });
      if (!authz.allowed) {
        return { ok: false, status: STATUS.FORBIDDEN, assignment: null, reason: authz.reasonCode };
      }

      // Actor cannot assign a role whose permissions exceed their own effective set
      // for sensitive keys beyond assign_sensitive itself.
      const actorPerms = await listEffectivePermissions(client, {
        actor: { userId: actorUserId },
        tenantContext,
        resourceContext: {
          organizationId: scope.organizationId,
          churchId: actorChurchId,
          branchId: scope.scopeType === "branch" ? scope.scopeId : null,
        },
      });
      const rolePerms = await rbacRepo.listPermissionKeysForRoleId(client, role.id);
      const actorSet = new Set(actorPerms.permissions || []);
      const delegationMeta = new Set([
        "roles.view",
        "roles.assign_standard",
        "roles.assign_sensitive",
        "roles.revoke",
      ]);
      for (const pk of rolePerms) {
        if (delegationMeta.has(pk)) continue;
        if (actorSet.has(pk)) continue;
        // Standard assigners may only grant permissions they hold.
        if (neededPerm === "roles.assign_standard") {
          return { ok: false, status: STATUS.FORBIDDEN, assignment: null, reason: "excessive_delegation" };
        }
        // Sensitive assigners still cannot grant permissions outside their effective set
        // unless they also hold assign_sensitive and the target role is marked sensitive
        // — require hold-or-deny to keep delegation narrow.
        if (!actorSet.has("roles.assign_sensitive")) {
          return { ok: false, status: STATUS.FORBIDDEN, assignment: null, reason: "excessive_delegation" };
        }
        // Org/platform admins with assign_sensitive may grant mapped role permissions
        // they themselves received via the same sensitive-admin bundle.
        if (!actorSet.has(pk) && !role.isSensitive) {
          return { ok: false, status: STATUS.FORBIDDEN, assignment: null, reason: "excessive_delegation" };
        }
      }

      try {
        const assignment = await rbacRepo.insertAssignment(client, {
          userId: targetUserId,
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          roleId: role.id,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          assignedByUserId: actorUserId,
          assignmentOrigin: origin,
          assignmentReason: reason || null,
          expiresAt,
        });

        await rbacRepo.insertAssignmentEvent(client, {
          assignmentId: assignment.id,
          organizationId: scope.organizationId,
          actorUserId,
          eventKey: "rbac.assignment.created",
          previousStatus: null,
          newStatus: "active",
          reason: reason || null,
          metadata: {
            role_key: role.roleKey,
            scope_type: scope.scopeType,
            scope_id: scope.scopeId,
            target_user_id: targetUserId,
          },
        });

        await recordBlessBoardAudit(client, {
          organizationId: scope.organizationId,
          churchId: actorChurchId,
          branchId: scope.scopeType === "branch" ? scope.scopeId : null,
          actorUserId,
          actionKey: "rbac.assignment.created",
          entityType: "user_role_assignment",
          entityId: assignment.id,
          outcome: "success",
          metadata: {
            target_user_id: targetUserId,
            role_key: role.roleKey,
            scope_type: scope.scopeType,
            scope_id: scope.scopeId,
          },
        });

        return {
          ok: true,
          status: STATUS.OK,
          assignment: { ...assignment, roleKey: role.roleKey },
        };
      } catch (err) {
        const msg = err && err.message ? String(err.message) : "";
        if (/unique|duplicate/i.test(msg) || (err && err.code === "23505")) {
          const existing = await rbacRepo.listActiveAssignmentsForUser(
            client,
            targetUserId,
            scope.organizationId
          );
          const dup = existing.find(
            (a) =>
              a.roleId === role.id &&
              a.scopeType === scope.scopeType &&
              String(a.scopeId || "") === String(scope.scopeId || "") &&
              String(a.churchId || "") === String(scope.churchId || "")
          );
          if (dup) {
            return {
              ok: true,
              status: STATUS.OK,
              assignment: dup,
              idempotent: true,
            };
          }
          return { ok: false, status: STATUS.CONFLICT, assignment: null, reason: "duplicate" };
        }
        if (err && (err.code === "23514" || err.code === "23503" || /belong|scope/i.test(msg))) {
          return { ok: false, status: STATUS.INVALID_INPUT, assignment: null, reason: "scope_ownership" };
        }
        throw err;
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      assignment: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {object} input
 */
async function revokeRoleAssignment(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const assignmentId = String((input && input.assignmentId) || "").trim();
  const reason = input.revocationReason != null ? String(input.revocationReason).trim() : "";

  if (!UUID_RE.test(actorUserId) || !UUID_RE.test(assignmentId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, assignment: null, reason: "ids" };
  }

  try {
    return await withClient(db, async (client) => {
      const existing = await rbacRepo.findAssignmentById(client, assignmentId);
      if (!existing) {
        return { ok: false, status: STATUS.NOT_FOUND, assignment: null, reason: "missing" };
      }
      if (existing.status !== "active") {
        return { ok: false, status: STATUS.CONFLICT, assignment: existing, reason: "not_active" };
      }
      if (existing.userId === actorUserId) {
        return { ok: false, status: STATUS.FORBIDDEN, assignment: null, reason: "self_elevation" };
      }

      const tenantContext = input.tenantContext;
      const churchId =
        existing.churchId ||
        (tenantContext && tenantContext.church && tenantContext.church.id) ||
        input.actorChurchId ||
        null;
      if (!churchId) {
        return { ok: false, status: STATUS.INVALID_INPUT, assignment: null, reason: "church_context" };
      }

      const authz = await authorize(client, {
        actor: { userId: actorUserId },
        permission: "roles.revoke",
        tenantContext: tenantContext || {
          resolved: true,
          organization: { id: existing.organizationId },
          church: { id: churchId },
          primaryBranch:
            existing.scopeType === "branch" ? { id: existing.scopeId } : null,
        },
        resourceContext: {
          organizationId: existing.organizationId,
          churchId,
          branchId: existing.scopeType === "branch" ? existing.scopeId : null,
        },
      });
      if (!authz.allowed) {
        return { ok: false, status: STATUS.FORBIDDEN, assignment: null, reason: authz.reasonCode };
      }

      const revoked = await rbacRepo.revokeAssignment(client, {
        assignmentId,
        revokedByUserId: actorUserId,
        revocationReason: reason || null,
      });
      if (!revoked) {
        return { ok: false, status: STATUS.CONFLICT, assignment: null, reason: "not_active" };
      }

      await rbacRepo.insertAssignmentEvent(client, {
        assignmentId,
        organizationId: existing.organizationId,
        actorUserId,
        eventKey: "rbac.assignment.revoked",
        previousStatus: "active",
        newStatus: "revoked",
        reason: reason || null,
        metadata: {
          role_key: existing.roleKey,
          target_user_id: existing.userId,
          scope_type: existing.scopeType,
          scope_id: existing.scopeId,
        },
      });

      await recordBlessBoardAudit(client, {
        organizationId: existing.organizationId,
        churchId,
        branchId: existing.scopeType === "branch" ? existing.scopeId : null,
        actorUserId,
        actionKey: "rbac.assignment.revoked",
        entityType: "user_role_assignment",
        entityId: assignmentId,
        outcome: "success",
        metadata: {
          target_user_id: existing.userId,
          role_key: existing.roleKey,
          scope_type: existing.scopeType,
          scope_id: existing.scopeId,
        },
      });

      return { ok: true, status: STATUS.OK, assignment: revoked };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      assignment: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function getUserRoleAssignments(db, input) {
  const userId = String((input && input.userId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!UUID_RE.test(userId) || !UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, assignments: [] };
  }
  try {
    return await withClient(db, async (client) => {
      const assignments = await rbacRepo.listAssignmentsForUserOrg(client, userId, organizationId);
      return { ok: true, status: STATUS.OK, assignments };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      assignments: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function getEffectivePermissions(db, input) {
  return listEffectivePermissions(db, input);
}

module.exports = {
  STATUS,
  SCOPE_TYPES,
  ORIGINS,
  validateAssignmentScope,
  createRoleAssignment,
  revokeRoleAssignment,
  getUserRoleAssignments,
  getEffectivePermissions,
  AUTHZ_REASON,
};
