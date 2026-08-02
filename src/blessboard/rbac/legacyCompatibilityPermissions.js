"use strict";

/**
 * Isolated legacy compatibility mapper: blessboard.user_roles → permission keys.
 * Runtime-only — does not copy rows into user_role_assignments.
 * Keep this module as the single source of compatibility bundles.
 */

/** @typedef {'platform_admin'|'church_hq_admin'|'branch_admin'} LegacyRoleKey */

/**
 * Permissions granted to preserve current platform_admin shell/ops behaviour.
 * Explicitly excludes pastoral-confidential and safeguarding permission keys
 * (pastoral_cases.*, pastoral_referrals.*, welfare_cases.*).
 * Does not grant data.export by default (sensitive; not required for current PA shells).
 */
const PLATFORM_ADMIN_PERMISSIONS = Object.freeze([
  "organisation.view",
  "organisation.settings.manage",
  "branches.view",
  "branches.create",
  "branches.edit",
  "branches.archive",
  "members.view",
  "members.create",
  "members.edit",
  "members.archive",
  "attendance.view",
  "attendance.record",
  "events.view",
  "events.manage",
  "website.view",
  "website.edit",
  "website.publish",
  "giving.view_summary",
  "giving.record",
  "giving.submit",
  "giving.approve",
  "giving.void",
  "requests.view",
  "requests.manage",
  "roles.view",
  "roles.assign_standard",
  "roles.assign_sensitive",
  "roles.revoke",
  "audit.view",
  "ministries.view",
  "ministries.manage",
  "departments.view",
  "departments.manage",
  "departments.members.manage",
  "departments.attendance.record",
  "cells.view",
  "cells.manage",
  "cells.members.assign",
  "cells.members.transfer",
  "cells.members.view_assigned",
  "cells.attendance.record",
  "classes.view",
  "classes.manage_programs",
  "classes.manage_cohorts",
  "classes.enrol",
  "classes.attendance.record",
  "classes.completion.recommend",
  "classes.completion.approve",
  "journey_contacts.create",
  "journey_contacts.view_team",
  "journey_contacts.edit_team",
  "journey_contacts.link_member",
  "journey_handovers.create",
  "journey_handovers.submit",
  "journey_handovers.accept",
  "journey_handovers.return",
  "journey_handovers.assign",
  "journey_handovers.complete",
  "journey_handovers.escalate",
  "journey_handovers.close",
  "journey_handovers.view_status",
]);

/**
 * Permissions granted to preserve current church_hq_admin HQ shell/ops.
 * Church-scoped at evaluation time via legacy role churchId.
 */
const CHURCH_HQ_ADMIN_PERMISSIONS = Object.freeze([
  "organisation.view",
  "organisation.settings.manage",
  "branches.view",
  "branches.create",
  "branches.edit",
  "branches.archive",
  "members.view",
  "members.create",
  "members.edit",
  "members.archive",
  "attendance.view",
  "attendance.record",
  "events.view",
  "events.manage",
  "website.view",
  "website.edit",
  "website.publish",
  "giving.view_summary",
  "giving.record",
  "giving.submit",
  "giving.approve",
  "giving.void",
  "requests.view",
  "requests.manage",
  "roles.view",
  "roles.assign_standard",
  "roles.assign_sensitive",
  "roles.revoke",
  "audit.view",
  "ministries.view",
  "ministries.manage",
  "departments.view",
  "departments.manage",
  "departments.members.manage",
  "departments.attendance.record",
  "cells.view",
  "cells.manage",
  "cells.members.assign",
  "cells.members.transfer",
  "cells.members.view_assigned",
  "cells.attendance.record",
  "classes.view",
  "classes.manage_programs",
  "classes.manage_cohorts",
  "classes.enrol",
  "classes.attendance.record",
  "classes.completion.recommend",
  "classes.completion.approve",
  "journey_contacts.create",
  "journey_contacts.view_team",
  "journey_contacts.edit_team",
  "journey_contacts.link_member",
  "journey_handovers.create",
  "journey_handovers.submit",
  "journey_handovers.accept",
  "journey_handovers.return",
  "journey_handovers.assign",
  "journey_handovers.complete",
  "journey_handovers.escalate",
  "journey_handovers.close",
  "journey_handovers.view_status",
]);

/**
 * Permissions granted to preserve current branch_admin branch shell/ops.
 * Branch-scoped at evaluation time via legacy role branchId — never expanded.
 * No giving.approve, roles.assign_*, roles.revoke, data.export, branches.create/archive.
 */
const BRANCH_ADMIN_PERMISSIONS = Object.freeze([
  "organisation.view",
  "branches.view",
  "branches.edit",
  "members.view",
  "members.create",
  "members.edit",
  "attendance.view",
  "attendance.record",
  "events.view",
  "events.manage",
  "website.view",
  "website.edit",
  "website.publish",
  "giving.view_summary",
  "giving.record",
  "giving.submit",
  "requests.view",
  "requests.manage",
  // Minimal journey compatibility — not full journey admin
  "ministries.view",
  "departments.view",
  "cells.view",
  "classes.view",
  "journey_contacts.view_team",
  "journey_contacts.create",
  "journey_handovers.view_status",
  "journey_handovers.create",
  "journey_handovers.submit",
]);

const LEGACY_BUNDLES = Object.freeze({
  platform_admin: PLATFORM_ADMIN_PERMISSIONS,
  church_hq_admin: CHURCH_HQ_ADMIN_PERMISSIONS,
  branch_admin: BRANCH_ADMIN_PERMISSIONS,
});

/**
 * @param {string} roleKey
 * @returns {readonly string[]}
 */
function permissionsForLegacyRoleKey(roleKey) {
  const key = String(roleKey || "");
  return LEGACY_BUNDLES[key] || Object.freeze([]);
}

/**
 * Map active legacy role rows to scoped permission grants.
 * Inactive/suspended roles must already be filtered out by the caller.
 *
 * @param {Array<{
 *   roleKey: string,
 *   organizationId: string,
 *   churchId: string | null,
 *   branchId: string | null,
 * }>} legacyRoles
 * @returns {Array<{
 *   permissionKey: string,
 *   source: 'legacy_compatibility',
 *   legacyRoleKey: string,
 *   organizationId: string,
 *   churchId: string | null,
 *   branchId: string | null,
 *   scopeType: 'platform'|'organisation'|'church'|'branch',
 * }>}
 */
function mapLegacyRolesToPermissionGrants(legacyRoles) {
  const out = [];
  for (const role of legacyRoles || []) {
    const roleKey = String(role.roleKey || "");
    const perms = permissionsForLegacyRoleKey(roleKey);
    if (!perms.length) continue;

    let scopeType = "organisation";
    if (roleKey === "platform_admin") scopeType = "platform";
    else if (roleKey === "church_hq_admin") scopeType = "church";
    else if (roleKey === "branch_admin") scopeType = "branch";

    for (const permissionKey of perms) {
      out.push({
        permissionKey,
        source: "legacy_compatibility",
        legacyRoleKey: roleKey,
        organizationId: role.organizationId || null,
        churchId: role.churchId || null,
        branchId: role.branchId || null,
        scopeType,
      });
    }
  }
  return out;
}

module.exports = {
  PLATFORM_ADMIN_PERMISSIONS,
  CHURCH_HQ_ADMIN_PERMISSIONS,
  BRANCH_ADMIN_PERMISSIONS,
  LEGACY_BUNDLES,
  permissionsForLegacyRoleKey,
  mapLegacyRolesToPermissionGrants,
};
