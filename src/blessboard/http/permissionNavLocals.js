"use strict";

/**
 * Permission-based nav locals for HQ / Branch Admin shells.
 * Templates must not compute permissions themselves.
 */

const { listEffectivePermissions } = require("../services/blessBoardRbacAuthorizationService");

/**
 * @param {{ query: Function }} pool
 * @param {{
 *   actorUserId: string,
 *   tenant: object,
 *   branchId?: string|null,
 * }} opts
 */
async function buildPermissionNavFlags(pool, opts) {
  const flags = {
    canViewGiving: false,
    canViewStaffAccess: false,
    canPublishWebsite: false,
    canEditWebsite: false,
    canViewWebsite: false,
    canViewFinance: false,
    canExportData: false,
    canViewMembers: false,
    canViewAttendance: false,
    canViewAnnouncements: false,
    canViewReports: false,
    canViewPastoral: false,
    canViewWelfare: false,
    canViewJourney: false,
    canViewClasses: false,
    canViewCells: false,
    canViewDepartments: false,
  };

  if (!opts.tenant || opts.tenant.resolved !== true || !opts.actorUserId) {
    return flags;
  }

  try {
    const resourceContext = {
      organizationId: opts.tenant.organization.id,
      churchId: opts.tenant.church.id,
      branchId: Object.prototype.hasOwnProperty.call(opts, "branchId")
        ? opts.branchId
        : opts.tenant.primaryBranch && opts.tenant.primaryBranch.id
          ? opts.tenant.primaryBranch.id
          : null,
    };

    const result = await listEffectivePermissions(pool, {
      actor: { userId: opts.actorUserId },
      tenantContext: opts.tenant,
      resourceContext,
    });

    const permissions = new Set(result.permissions || []);

    flags.canViewGiving =
      permissions.has("giving.view_summary") || permissions.has("finance.transactions.view");
    flags.canViewStaffAccess = permissions.has("roles.view");
    flags.canPublishWebsite = permissions.has("website.publish");
    flags.canEditWebsite = permissions.has("website.edit");
    flags.canViewWebsite =
      permissions.has("website.view") || flags.canEditWebsite || flags.canPublishWebsite;
    flags.canViewFinance = permissions.has("finance.transactions.view");
    flags.canExportData = permissions.has("data.export") || permissions.has("finance.data.export");
    flags.canViewMembers = permissions.has("members.view");
    flags.canViewAttendance = permissions.has("attendance.view");
    flags.canViewAnnouncements = permissions.has("announcements.view");
    flags.canViewReports = permissions.has("audit.view") || permissions.has("organisation.view");
    flags.canViewPastoral =
      permissions.has("pastoral_cases.view_restricted") ||
      permissions.has("pastoral_cases.view_confidential");
    flags.canViewWelfare = permissions.has("welfare_cases.view");
    flags.canViewJourney =
      permissions.has("journey_contacts.view_team") ||
      permissions.has("journey_handovers.view_status");
    flags.canViewClasses = permissions.has("classes.view");
    flags.canViewCells = permissions.has("cells.view");
    flags.canViewDepartments = permissions.has("departments.view");
  } catch {
    // fail closed
  }

  return flags;
}

module.exports = {
  buildPermissionNavFlags,
};
