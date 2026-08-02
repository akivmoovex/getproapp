"use strict";

/**
 * Internal RBAC assignment service.
 * Staff-access HQ UI calls createRoleAssignment / revokeRoleAssignment only —
 * routes must not insert into assignment tables directly.
 *
 * Highly sensitive limitation: no separate multi-step approval engine.
 * Requires roles.assign_sensitive + organisation-wide admin authority + reason
 * + immutable audit (rbac.assignment.created_highly_sensitive).
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

/** Scopes church HQ staff-access UI may select (never platform). */
const CHURCH_ASSIGNABLE_SCOPE_TYPES = Object.freeze([
  "organisation",
  "church",
  "branch",
  "ministry",
  "department",
  "cell",
  "class",
  "assigned_member",
  "assigned_case",
]);

const ORIGINS = Object.freeze(["system", "legacy_compatibility", "manual", "migration", "support"]);

/** Roles that require strongest church-HQ authority + reason (no separate approval engine). */
const HIGHLY_SENSITIVE_ROLE_KEYS = Object.freeze([
  "organisation_administrator",
  "church_system_administrator",
  "finance_director",
  "finance_approver",
  "safeguarding_officer",
  "auditor",
  "website_publisher",
]);

const HIGHLY_SENSITIVE_PERMISSION_MARKERS = Object.freeze([
  "pastoral_cases.view_highly_confidential",
  "pastoral_cases.view_safeguarding",
  "finance.data.export",
  "data.export",
  "roles.assign_sensitive",
  "roles.revoke",
]);

const FINANCE_ROLE_KEYS = Object.freeze([
  "finance_director",
  "finance_approver",
  "finance_officer",
]);

const PASTORAL_CONFIDENTIAL_ROLE_KEYS = Object.freeze([
  "safeguarding_officer",
  "minister",
  "branch_pastor",
  "welfare_officer",
  "welfare_approver",
]);

const EXPORT_ROLE_MARKERS = Object.freeze(["data.export", "finance.data.export"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isHighlySensitiveRole(role, rolePerms) {
  if (!role) return false;
  if (HIGHLY_SENSITIVE_ROLE_KEYS.includes(String(role.roleKey || ""))) return true;
  const perms = rolePerms || [];
  return perms.some((pk) => HIGHLY_SENSITIVE_PERMISSION_MARKERS.includes(pk));
}

/**
 * Explicit delegation SoD beyond generic permission-subset checks.
 * @returns {string|null} denial reason or null when allowed
 */
function evaluateDelegationMatrix(actorRoleKeys, targetRoleKey, targetPerms) {
  const actors = new Set((actorRoleKeys || []).map((k) => String(k)));
  const target = String(targetRoleKey || "");
  const perms = targetPerms || [];
  const isFinanceTarget =
    FINANCE_ROLE_KEYS.includes(target) || perms.some((p) => String(p).startsWith("finance.") || String(p).startsWith("giving."));
  const isPastoralTarget =
    PASTORAL_CONFIDENTIAL_ROLE_KEYS.includes(target) ||
    perms.some((p) => String(p).startsWith("pastoral_") || String(p).startsWith("welfare_"));
  const isExportTarget = perms.some((p) => EXPORT_ROLE_MARKERS.includes(p));
  const isRoleAdminTarget = perms.some((p) => String(p).startsWith("roles."));
  const isAuditorTarget = target === "auditor" || perms.includes("audit.view");

  const isBranchAdminOnly =
    (actors.has("branch_administrator") || actors.has("branch_admin")) &&
    ![
      "organisation_administrator",
      "church_system_administrator",
      "church_hq_admin",
      "platform_admin",
      "platform_administrator",
    ].some((k) => actors.has(k));

  if (isBranchAdminOnly) {
    if (
      target === "finance_director" ||
      target === "safeguarding_officer" ||
      target === "organisation_administrator" ||
      target === "church_system_administrator"
    ) {
      return "excessive_delegation";
    }
  }

  if (actors.has("ministry_leader") && !actors.has("organisation_administrator") && !actors.has("church_hq_admin")) {
    if (isFinanceTarget || isPastoralTarget || isAuditorTarget || isExportTarget || isRoleAdminTarget) {
      return "excessive_delegation";
    }
  }

  if (actors.has("finance_director") && !actors.has("organisation_administrator") && !actors.has("church_hq_admin")) {
    if (isPastoralTarget) return "excessive_delegation";
  }

  if (
    (actors.has("branch_pastor") || actors.has("minister")) &&
    !actors.has("organisation_administrator") &&
    !actors.has("church_system_administrator") &&
    !actors.has("church_hq_admin")
  ) {
    if (isFinanceTarget && !actors.has("role_administrator")) return "excessive_delegation";
  }

  if (actors.has("website_publisher") && !actors.has("organisation_administrator") && !actors.has("church_hq_admin")) {
    if (isFinanceTarget) return "excessive_delegation";
  }

  if (
    actors.has("communications_officer") &&
    !actors.has("organisation_administrator") &&
    !actors.has("church_hq_admin")
  ) {
    if (isExportTarget) return "excessive_delegation";
  }

  return null;
}

/**
 * Resolve scoped resource belongs to the trusted church/org (server-side).
 */
async function resolveScopedResource(client, scope) {
  const { scopeType, organizationId, churchId, scopeId } = scope;
  if (scopeType === "platform" || scopeType === "organisation" || scopeType === "personal") {
    return { ok: true };
  }
  if (scopeType === "church") {
    const r = await client.query(
      `SELECT id FROM blessboard.churches WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [churchId, organizationId]
    );
    return r.rowCount ? { ok: true } : { ok: false, reason: "scope_ownership" };
  }
  if (scopeType === "branch") {
    const r = await client.query(
      `SELECT b.id FROM blessboard.branches b
        JOIN blessboard.churches c ON c.id = b.church_id
       WHERE b.id = $1 AND b.church_id = $2 AND c.organization_id = $3 LIMIT 1`,
      [scopeId, churchId, organizationId]
    );
    return r.rowCount ? { ok: true } : { ok: false, reason: "scope_ownership" };
  }
  if (scopeType === "ministry") {
    const r = await client.query(
      `SELECT id FROM blessboard.ministries WHERE id = $1 AND church_id = $2 LIMIT 1`,
      [scopeId, churchId]
    ).catch(() => ({ rowCount: 0 }));
    return r.rowCount ? { ok: true } : { ok: false, reason: "scope_ownership" };
  }
  if (scopeType === "department") {
    const r = await client.query(
      `SELECT id FROM blessboard.departments WHERE id = $1 AND church_id = $2 LIMIT 1`,
      [scopeId, churchId]
    ).catch(() => ({ rowCount: 0 }));
    return r.rowCount ? { ok: true } : { ok: false, reason: "scope_ownership" };
  }
  if (scopeType === "cell") {
    const r = await client.query(
      `SELECT id FROM blessboard.cells WHERE id = $1 AND church_id = $2 LIMIT 1`,
      [scopeId, churchId]
    ).catch(() => ({ rowCount: 0 }));
    return r.rowCount ? { ok: true } : { ok: false, reason: "scope_ownership" };
  }
  if (scopeType === "class") {
    const r = await client.query(
      `SELECT id FROM blessboard.class_cohorts WHERE id = $1 AND church_id = $2 LIMIT 1`,
      [scopeId, churchId]
    ).catch(() => ({ rowCount: 0 }));
    return r.rowCount ? { ok: true } : { ok: false, reason: "scope_ownership" };
  }
  if (scopeType === "assigned_member") {
    const r = await client.query(
      `SELECT id FROM blessboard.members WHERE id = $1 AND church_id = $2 LIMIT 1`,
      [scopeId, churchId]
    ).catch(() => ({ rowCount: 0 }));
    return r.rowCount ? { ok: true } : { ok: false, reason: "scope_ownership" };
  }
  if (scopeType === "assigned_case") {
    const pastoral = await client.query(
      `SELECT id FROM blessboard.pastoral_cases
        WHERE id = $1 AND church_id = $2 AND organization_id = $3 LIMIT 1`,
      [scopeId, churchId, organizationId]
    ).catch(() => ({ rowCount: 0 }));
    if (pastoral.rowCount) return { ok: true };
    const welfare = await client.query(
      `SELECT id FROM blessboard.welfare_cases
        WHERE id = $1 AND church_id = $2 AND organization_id = $3 LIMIT 1`,
      [scopeId, churchId, organizationId]
    ).catch(() => ({ rowCount: 0 }));
    return welfare.rowCount ? { ok: true } : { ok: false, reason: "scope_ownership" };
  }
  return { ok: false, reason: "scope_type" };
}

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

  if (expiresAt) {
    const exp = new Date(expiresAt);
    if (Number.isNaN(exp.getTime())) {
      return { ok: false, status: STATUS.INVALID_INPUT, assignment: null, reason: "expires_at" };
    }
    if (exp.getTime() <= Date.now()) {
      return { ok: false, status: STATUS.INVALID_INPUT, assignment: null, reason: "expires_at_past" };
    }
  }

  // Church HQ UI never assigns platform scope.
  if (input.forbidPlatformScope !== false && String(input.scopeType || "") === "platform") {
    return { ok: false, status: STATUS.FORBIDDEN, assignment: null, reason: "platform_scope_forbidden" };
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

      const rolePerms = await rbacRepo.listPermissionKeysForRoleId(client, role.id);
      const highlySensitive = isHighlySensitiveRole(role, rolePerms);
      const neededPerm =
        role.isSensitive || highlySensitive ? "roles.assign_sensitive" : "roles.assign_standard";
      if ((role.isSensitive || highlySensitive) && !reason) {
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

      const owned = await resolveScopedResource(client, scope);
      if (!owned.ok) {
        return { ok: false, status: STATUS.INVALID_INPUT, assignment: null, reason: owned.reason };
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
      const actorSet = new Set(actorPerms.permissions || []);
      const delegationMeta = new Set([
        "roles.view",
        "roles.assign_standard",
        "roles.assign_sensitive",
        "roles.revoke",
      ]);

      // Scope breadth: branch-only actors cannot grant org/church-wide scopes.
      const actorAssignments = await rbacRepo.listActiveAssignmentsForUser(
        client,
        actorUserId,
        scope.organizationId
      );
      const authzRepo = require("../repositories/blessBoardAuthorizationRepository");
      const legacyRoles = await authzRepo.listActiveAuthorizationRoles(client, actorUserId);
      const actorRoleKeys = [
        ...actorAssignments.map((a) => a.roleKey),
        ...legacyRoles.map((r) => r.roleKey),
      ];
      const matrixDenial = evaluateDelegationMatrix(actorRoleKeys, role.roleKey, rolePerms);
      if (matrixDenial) {
        return { ok: false, status: STATUS.FORBIDDEN, assignment: null, reason: matrixDenial };
      }

      const hasOrgWideAdmin =
        actorAssignments.some((a) =>
          ["organisation_administrator", "church_system_administrator", "platform_administrator"].includes(
            String(a.roleKey || "")
          )
        ) ||
        legacyRoles.some((r) =>
          ["church_hq_admin", "platform_admin"].includes(String(r.roleKey || ""))
        );
      const branchOnlyActor =
        !hasOrgWideAdmin &&
        actorAssignments.length > 0 &&
        actorAssignments.every((a) => String(a.scopeType) === "branch") &&
        !legacyRoles.some((r) => r.roleKey === "church_hq_admin" || r.roleKey === "platform_admin");

      if (
        branchOnlyActor &&
        (scope.scopeType === "organisation" || scope.scopeType === "church" || scope.scopeType === "platform")
      ) {
        return { ok: false, status: STATUS.FORBIDDEN, assignment: null, reason: "scope_exceeds_authority" };
      }

      if (highlySensitive) {
        if (!hasOrgWideAdmin) {
          return {
            ok: false,
            status: STATUS.FORBIDDEN,
            assignment: null,
            reason: "highly_sensitive_requires_org_admin",
          };
        }
        if (!actorSet.has("roles.assign_sensitive")) {
          return { ok: false, status: STATUS.FORBIDDEN, assignment: null, reason: authz.reasonCode };
        }
      }

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
        if (!actorSet.has(pk) && !role.isSensitive && !highlySensitive) {
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
            highly_sensitive: highlySensitive,
          },
        });

        await recordBlessBoardAudit(client, {
          organizationId: scope.organizationId,
          churchId: actorChurchId,
          branchId: scope.scopeType === "branch" ? scope.scopeId : null,
          actorUserId,
          actionKey: highlySensitive
            ? "rbac.assignment.created_highly_sensitive"
            : "rbac.assignment.created",
          entityType: "user_role_assignment",
          entityId: assignment.id,
          outcome: "success",
          metadata: {
            target_user_id: targetUserId,
            role_key: role.roleKey,
            scope_type: scope.scopeType,
            scope_id: scope.scopeId,
            highly_sensitive: highlySensitive,
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

      const rolePerms = await rbacRepo.listPermissionKeysForRoleId(client, existing.roleId);
      const highlySensitive = isHighlySensitiveRole(
        { roleKey: existing.roleKey, isSensitive: existing.isSensitiveRole },
        rolePerms
      );
      if ((existing.isSensitiveRole || highlySensitive) && !reason) {
        return { ok: false, status: STATUS.INVALID_INPUT, assignment: null, reason: "reason_required" };
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
  CHURCH_ASSIGNABLE_SCOPE_TYPES,
  ORIGINS,
  HIGHLY_SENSITIVE_ROLE_KEYS,
  isHighlySensitiveRole,
  evaluateDelegationMatrix,
  validateAssignmentScope,
  createRoleAssignment,
  revokeRoleAssignment,
  getUserRoleAssignments,
  getEffectivePermissions,
  AUTHZ_REASON,
};
