"use strict";

/**
 * Platform Admin access health checks — safe counts only.
 * Never returns pastoral bodies, finance transactions, or confidential text fields.
 */

const {
  authorize,
} = require("../../blessboard/services/blessBoardRbacAuthorizationService");
const {
  inspectV7RuntimeSchemaCompatibility,
  presentV7SchemaCompatibilityPublic,
} = require("../schema/v7RuntimeSchemaCompatibility");

const STATUS = Object.freeze({
  OK: "ok",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function assertPlatformPermission(db, actorUserId, permissionKey) {
  const userId = String(actorUserId || "").trim();
  if (!UUID_RE.test(userId)) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "unauthenticated" };
  }
  const decision = await authorize(db, {
    actor: { userId },
    permission: permissionKey,
    tenantContext: {
      organizationId: null,
      churchId: null,
      primaryBranchId: null,
    },
    resourceContext: {
      organizationId: null,
      churchId: null,
      branchId: null,
    },
  });
  if (decision && decision.allowed === true) {
    return { ok: true };
  }
  const roles = await db.query(
    `SELECT 1
       FROM blessboard.user_roles
      WHERE user_id = $1
        AND role_key = 'platform_admin'
        AND status = 'active'
      LIMIT 1`,
    [userId]
  );
  if (roles.rows[0]) {
    return { ok: true };
  }
  return {
    ok: false,
    status: STATUS.FORBIDDEN,
    reason: (decision && decision.reasonCode) || "forbidden",
  };
}

async function getPlatformAccessHealth(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.access_health.view"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason, checks: [] };
  }

  try {
    const checks = [];

    // Users with no active role
    const noRoleRes = await db.query(
      `SELECT COUNT(DISTINCT u.id)::int AS count
         FROM blessboard.users u
        WHERE u.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM blessboard.user_roles ur
             WHERE ur.user_id = u.id AND ur.status = 'active'
          )
          AND NOT EXISTS (
            SELECT 1 FROM blessboard.user_role_assignments ura
             WHERE ura.user_id = u.id
               AND ura.status = 'active'
               AND ura.revoked_at IS NULL
          )`
    );
    checks.push({
      key: "usersWithNoActiveRole",
      label: "Users with no active role",
      count: Number(noRoleRes.rows[0] && noRoleRes.rows[0].count) || 0,
      href: "/admin/users",
    });

    // Expired assignments
    const expiredRes = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM blessboard.user_role_assignments
        WHERE status = 'expired'`
    );
    checks.push({
      key: "expiredAssignments",
      label: "Expired role assignments",
      count: Number(expiredRes.rows[0] && expiredRes.rows[0].count) || 0,
      href: "/admin/users",
    });

    // Revoked assignments
    const revokedRes = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM blessboard.user_role_assignments
        WHERE status = 'revoked' OR revoked_at IS NOT NULL`
    );
    checks.push({
      key: "revokedAssignments",
      label: "Revoked role assignments",
      count: Number(revokedRes.rows[0] && revokedRes.rows[0].count) || 0,
      href: "/admin/users",
    });

    // Sensitive assignments missing reason
    const sensitiveNoReasonRes = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM blessboard.user_role_assignments ura
         JOIN blessboard.roles r ON r.id = ura.role_id
        WHERE r.is_sensitive = true
          AND ura.status = 'active'
          AND ura.revoked_at IS NULL
          AND (ura.assignment_reason IS NULL OR trim(ura.assignment_reason) = '')`
    );
    checks.push({
      key: "sensitiveAssignmentsMissingReason",
      label: "Sensitive assignments without justification",
      count: Number(sensitiveNoReasonRes.rows[0] && sensitiveNoReasonRes.rows[0].count) || 0,
      href: "/admin/users",
    });

    // Legacy-only users (best effort)
    const legacyOnlyRes = await db.query(
      `SELECT COUNT(DISTINCT ur.user_id)::int AS count
         FROM blessboard.user_roles ur
        WHERE ur.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM blessboard.user_role_assignments ura
             WHERE ura.user_id = ur.user_id
               AND ura.status = 'active'
               AND ura.revoked_at IS NULL
          )`
    );
    checks.push({
      key: "legacyOnlyUsers",
      label: "Users with legacy roles only (no RBAC assignments)",
      count: Number(legacyOnlyRes.rows[0] && legacyOnlyRes.rows[0].count) || 0,
      href: "/admin/users",
    });

    // Suspended users with active assignments
    const suspendedActiveRes = await db.query(
      `SELECT COUNT(DISTINCT u.id)::int AS count
         FROM blessboard.users u
        WHERE u.status = 'suspended'
          AND (
            EXISTS (
              SELECT 1 FROM blessboard.user_roles ur
               WHERE ur.user_id = u.id AND ur.status = 'active'
            )
            OR EXISTS (
              SELECT 1 FROM blessboard.user_role_assignments ura
               WHERE ura.user_id = u.id
                 AND ura.status = 'active'
                 AND ura.revoked_at IS NULL
            )
          )`
    );
    checks.push({
      key: "suspendedUsersWithActiveAssignments",
      label: "Suspended users with active role assignments",
      count: Number(suspendedActiveRes.rows[0] && suspendedActiveRes.rows[0].count) || 0,
      href: "/admin/users",
    });

    // Users with multiple roles (3+)
    const multiRoleRes = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM (
           SELECT ura.user_id, COUNT(DISTINCT ura.role_id) AS role_count
             FROM blessboard.user_role_assignments ura
            WHERE ura.status = 'active'
              AND ura.revoked_at IS NULL
            GROUP BY ura.user_id
           HAVING COUNT(DISTINCT ura.role_id) >= 3
         ) sub`
    );
    checks.push({
      key: "usersWithMultipleRoles",
      label: "Users with 3+ active roles",
      count: Number(multiRoleRes.rows[0] && multiRoleRes.rows[0].count) || 0,
      href: "/admin/users",
    });

    // Pending invitations
    const pendingInvitesRes = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM blessboard.user_invitations
        WHERE status = 'pending'`
    );
    checks.push({
      key: "pendingInvitations",
      label: "Pending invitations",
      count: Number(pendingInvitesRes.rows[0] && pendingInvitesRes.rows[0].count) || 0,
      href: "/admin/users",
    });

    // Stale invitations (pending and expired)
    const staleInvitesRes = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM blessboard.user_invitations
        WHERE status = 'pending'
          AND expires_at < now()`
    );
    checks.push({
      key: "staleInvitations",
      label: "Stale invitations (pending but expired)",
      count: Number(staleInvitesRes.rows[0] && staleInvitesRes.rows[0].count) || 0,
      href: "/admin/users",
    });

    // Roles with no active users
    const rolesNoUsersRes = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM blessboard.roles r
        WHERE r.is_active = true
          AND r.role_key != 'visitor'
          AND NOT EXISTS (
            SELECT 1 FROM blessboard.user_role_assignments ura
             WHERE ura.role_id = r.id
               AND ura.status = 'active'
               AND ura.revoked_at IS NULL
          )`
    );
    checks.push({
      key: "rolesWithNoActiveUsers",
      label: "Active roles with no assignments",
      count: Number(rolesNoUsersRes.rows[0] && rolesNoUsersRes.rows[0].count) || 0,
      href: "/admin/roles",
    });

    // Inactive roles with assignments
    const inactiveRolesWithAssignmentsRes = await db.query(
      `SELECT COUNT(DISTINCT r.id)::int AS count
         FROM blessboard.roles r
        WHERE r.is_active = false
          AND EXISTS (
            SELECT 1 FROM blessboard.user_role_assignments ura
             WHERE ura.role_id = r.id
               AND ura.status = 'active'
               AND ura.revoked_at IS NULL
          )`
    );
    checks.push({
      key: "inactiveRolesWithAssignments",
      label: "Inactive roles with active assignments",
      count: Number(inactiveRolesWithAssignmentsRes.rows[0] && inactiveRolesWithAssignmentsRes.rows[0].count) || 0,
      href: "/admin/roles",
    });

    // Unknown or inactive permissions (best effort)
    const unknownPermissionsRes = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM blessboard.role_permissions rp
         LEFT JOIN blessboard.permissions p ON p.id = rp.permission_id
        WHERE p.id IS NULL OR p.is_active = false`
    );
    checks.push({
      key: "unknownOrInactivePermissions",
      label: "Role permissions pointing to inactive/missing permissions",
      count: Number(unknownPermissionsRes.rows[0] && unknownPermissionsRes.rows[0].count) || 0,
      href: "/admin/roles",
    });

    let schemaCompatibility = null;
    try {
      schemaCompatibility = presentV7SchemaCompatibilityPublic(
        await inspectV7RuntimeSchemaCompatibility(db)
      );
    } catch {
      schemaCompatibility = {
        compatible: false,
        code: "schema_lookup_failed",
        capability: null,
        missing: [],
        checks: [],
      };
    }

    return {
      ok: true,
      status: STATUS.OK,
      checks,
      schemaCompatibility,
    };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
      checks: [],
    };
  }
}

module.exports = {
  STATUS,
  getPlatformAccessHealth,
};
