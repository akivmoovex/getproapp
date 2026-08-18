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
 * Explicitly excludes Finance transaction / export / bank / welfare disbursement keys
 * (Prompt 5: Platform Administrators denied transaction-level Finance by default).
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
  "website.media.upload",
  "website.submit",
  "website.publish",
  "website.review",
  "website.rollback",
  "website.manage_template",
  "website.moderate",
  "website.take_offline",
  "website.suspend",
  "website.restore",
  "website.manage_policy",
  // No giving.* / finance.transactions.* — PA denied transaction-level Finance by default.
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
  // Prompt 7 communications + narrowly scoped audit (no pastoral bodies / finance details)
  "announcements.view",
  "announcements.manage",
  // Platform may inspect/draft announcements; publish remains product-policy gated
  // (not granted here — see announcementsService authorizeActor).
  "broadcasts.view",
  "broadcasts.manage",
  "audit.view_access",
  "audit.view_website",
  "audit.view_pastoral_metadata",
  // Prompt 10B: explicit platform directory permissions (no church-confidential keys)
  "platform.users.view",
  "platform.members.search",
  "platform.members.view_support_profile",
  // Prompt 10C: audited support mode (no Finance / pastoral auto-grants)
  "platform.support.enter_hq",
  "platform.support.enter_branch",
  "platform.support.exit",
  "platform.support.view_status",
  // Prompt 10D: organisation team management (delegates to Staff Access / RBAC services)
  "platform.users.invite",
  "platform.roles.view",
  "platform.roles.assign_standard",
  "platform.roles.assign_sensitive",
  "platform.roles.revoke",
  // Prompt 10E: account recovery (no password view/retrieval)
  "platform.users.reset_access",
  "platform.users.revoke_sessions",
  "platform.users.suspend",
  "platform.users.restore",
  "platform.users.unlock",
  // Prompt 13B–13D: information architecture (view-only)
  "platform.deployments.view",
  "platform.domains.view",
  "platform.access_health.view",
  "platform.audit.view",
]);

/**
 * Permissions granted to preserve current church_hq_admin HQ shell/ops.
 * Church-scoped at evaluation time via legacy role churchId.
 * Temporary Finance compatibility (documented): giving.view_summary/record/submit/approve/void
 * required to preserve current HQ giving workflows. Does NOT grant finance.data.export,
 * finance.bank_details.view, finance.periods.close, or finance.welfare_disbursement.record.
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
  "website.media.upload",
  "website.submit",
  "website.publish",
  "website.rollback",
  "giving.view_summary",
  "giving.record",
  "giving.submit",
  "giving.approve",
  "giving.void",
  "finance.transactions.view",
  "finance.transactions.create",
  "finance.transactions.edit_draft",
  "finance.transactions.submit",
  "finance.transactions.approve",
  "finance.transactions.reject",
  "finance.transactions.void",
  "finance.reports.view",
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
  "announcements.view",
  "announcements.manage",
  "announcements.publish",
  "broadcasts.view",
  "broadcasts.manage",
  "audit.view_access",
  "audit.view_website",
  "audit.view_finance",
  "audit.view_pastoral_metadata",
]);

/**
 * Permissions granted to preserve current branch_admin branch shell/ops.
 * Branch-scoped at evaluation time via legacy role branchId — never expanded.
 * No giving.approve, roles.assign_*, roles.revoke, data.export, branches.create/archive.
 * Temporary branch Finance compatibility: giving.view_summary/record/submit only.
 * Does NOT grant finance.transactions.approve/void/export/bank/welfare_disbursement.
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
  "website.media.upload",
  "website.submit",
  "website.publish",
  "giving.view_summary",
  "giving.record",
  "giving.submit",
  "finance.transactions.view",
  "finance.transactions.create",
  "finance.transactions.edit_draft",
  "finance.transactions.submit",
  "finance.reports.view",
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
  "announcements.view",
  "announcements.manage",
  "announcements.publish",
  "audit.view_website",
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
