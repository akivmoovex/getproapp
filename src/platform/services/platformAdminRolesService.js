"use strict";

/**
 * Platform Admin roles catalogue and detail views (read-only).
 * Includes platform_administrator; excludes visitor if desired.
 * Never edits role definitions or permission assignments.
 */

const {
  authorize,
} = require("../../blessboard/services/blessBoardRbacAuthorizationService");
const { LEGACY_BUNDLES } = require("../../blessboard/rbac/legacyCompatibilityPermissions");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CATEGORY_GROUPS = Object.freeze({
  platform: "Platform support",
  organisation: "Administration",
  church: "Administration",
  members: "Members and journey",
  pastoral: "Pastoral and welfare",
  finance: "Finance",
  communications: "Communications",
  website: "Website",
  audit: "Audit",
  cells: "Cells and classes",
  classes: "Cells and classes",
  departments: "Cells and classes",
  ministries: "Cells and classes",
});

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

function displayGroupForCategory(categoryKey) {
  const key = String(categoryKey || "").trim().toLowerCase();
  return CATEGORY_GROUPS[key] || "Other";
}

function isLegacyCompatibleRole(roleKey) {
  return Object.keys(LEGACY_BUNDLES).includes(String(roleKey));
}

async function listPlatformRoleCatalogue(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.roles.view"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason, roles: [] };
  }

  try {
    const rolesRes = await db.query(
      `SELECT
         r.id,
         r.role_key,
         r.display_name,
         r.description,
         r.role_category,
         r.is_sensitive,
         r.is_active,
         (
           SELECT COUNT(*)::int
             FROM blessboard.role_permissions rp
            WHERE rp.role_id = r.id
         ) AS permission_count,
         (
           SELECT COUNT(*)::int
             FROM blessboard.user_role_assignments ura
            WHERE ura.role_id = r.id
              AND ura.status = 'active'
              AND ura.revoked_at IS NULL
         ) AS active_assignment_count
         FROM blessboard.roles r
        WHERE r.role_key IS DISTINCT FROM 'visitor'
        ORDER BY r.role_category ASC, r.display_name ASC`
    );

    const roles = rolesRes.rows.map((row) => {
      const roleKey = String(row.role_key);
      const isPlatformAdmin = roleKey === "platform_administrator";
      const category = String(row.role_category || "");
      const supportedScopes =
        category === "platform"
          ? ["platform"]
          : ["organisation", "church", "branch"];
      return {
        roleId: String(row.id),
        roleKey,
        displayName: String(row.display_name || ""),
        description: row.description != null ? String(row.description) : null,
        category,
        displayGroup: displayGroupForCategory(row.role_category),
        sensitivity: row.is_sensitive ? "Sensitive" : "Standard",
        supportedScopes,
        permissionCount: Number(row.permission_count) || 0,
        activeAssignmentCount: Number(row.active_assignment_count) || 0,
        assignableByPlatformAdmin:
          row.is_active && !isPlatformAdmin,
        legacyCompatibility: isLegacyCompatibleRole(roleKey),
        isActive: Boolean(row.is_active),
      };
    });

    const grouped = {};
    for (const role of roles) {
      const group = role.displayGroup || "Other";
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(role);
    }

    return {
      ok: true,
      status: STATUS.OK,
      roles,
      grouped,
    };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
      roles: [],
    };
  }
}

async function getPlatformRoleDetail(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.roles.view"
  );
  if (!gate.ok) {
    return { ok: false, status: gate.status, reason: gate.reason, role: null };
  }

  const roleKey = String(input.roleKey || "").trim();
  if (!roleKey || !/^[a-z][a-z0-9_]{0,63}$/i.test(roleKey)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "role_key", role: null };
  }

  try {
    const roleRes = await db.query(
      `SELECT
         r.id,
         r.role_key,
         r.display_name,
         r.description,
         r.role_category,
         r.is_sensitive,
         r.is_active,
         r.created_at,
         r.updated_at
         FROM blessboard.roles r
        WHERE r.role_key = $1
        LIMIT 1`,
      [roleKey]
    );

    if (!roleRes.rows[0]) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found", role: null };
    }

    const role = roleRes.rows[0];
    const roleId = String(role.id);

    const permissionsRes = await db.query(
      `SELECT
         p.id,
         p.permission_key,
         p.display_name,
         p.description,
         p.is_active
         FROM blessboard.role_permissions rp
         JOIN blessboard.permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1
        ORDER BY p.permission_key ASC`,
      [roleId]
    );

    const assignmentsRes = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active' AND revoked_at IS NULL) AS active_count,
         COUNT(*) FILTER (WHERE status = 'expired') AS expired_count,
         COUNT(*) FILTER (WHERE status = 'revoked' OR revoked_at IS NOT NULL) AS revoked_count
         FROM blessboard.user_role_assignments
        WHERE role_id = $1`,
      [roleId]
    );

    const assignmentCounts = assignmentsRes.rows[0] || {};

    const permissions = permissionsRes.rows.map((p) => ({
      permissionId: String(p.id),
      permissionKey: String(p.permission_key),
      displayName: p.display_name != null ? String(p.display_name) : String(p.permission_key),
      description: p.description != null ? String(p.description) : null,
      isActive: Boolean(p.is_active),
    }));

    const category = String(role.role_category || "");
    const isSensitive = Boolean(role.is_sensitive);
    let sodNotes = null;
    if (isSensitive && (category === "finance" || category === "pastoral")) {
      sodNotes =
        "Sensitive role — assignment requires additional review and approval workflow per RBAC policy.";
    }

    const supportedScopes =
      category === "platform"
        ? ["platform"]
        : ["organisation", "church", "branch"];

    const detail = {
      roleId,
      roleKey: String(role.role_key),
      displayName: String(role.display_name || ""),
      description: role.description != null ? String(role.description) : null,
      category,
      displayGroup: displayGroupForCategory(category),
      sensitivity: isSensitive ? "Sensitive" : "Standard",
      supportedScopes,
      isActive: Boolean(role.is_active),
      legacyCompatibility: isLegacyCompatibleRole(String(role.role_key)),
      permissions,
      assignmentCounts: {
        active: Number(assignmentCounts.active_count) || 0,
        expired: Number(assignmentCounts.expired_count) || 0,
        revoked: Number(assignmentCounts.revoked_count) || 0,
      },
      sodNotes,
      createdAt: role.created_at || null,
      updatedAt: role.updated_at || null,
      readOnly: true,
    };

    return { ok: true, status: STATUS.OK, role: detail };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup",
      role: null,
    };
  }
}

module.exports = {
  STATUS,
  CATEGORY_GROUPS,
  listPlatformRoleCatalogue,
  getPlatformRoleDetail,
};
