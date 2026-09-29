"use strict";

/**
 * Platform Support Access + Account Manager routes (BlessBoard Admin MVP).
 */

const { requireAdmin, requireSuperAdmin } = require("../../auth");
const { getPgPool } = require("../../db/pg");
const platformProvisioningRepo = require("../../db/pg/church/platformProvisioningRepo");
const adminUsersRepo = require("../../db/pg/adminUsersRepo");
const churchPlatformSupportAccessService = require("../../services/church/churchPlatformSupportAccessService");
const catalogue = require("../../church/platformSupportAccessCatalogue");
const { requireSupportAccessAction } = require("../../middleware/churchPlatformSupportAccess");
const churchSupportDiagnosticService = require("../../services/church/churchSupportDiagnosticService");
const { requirePlatformAdminCsrfOnMutations } = require("../../church/platformAdminCsrf");

function platformAdminId(req) {
  return req.session && req.session.adminUser ? Number(req.session.adminUser.id) : null;
}

function requireSupportAccessCapability(req, res, next) {
  const role = req.session && req.session.adminUser && req.session.adminUser.role;
  if (
    catalogue.canRequestSupportAccess(role) ||
    catalogue.canApproveSupportAccess(role) ||
    catalogue.canAssignAccountManagers(role)
  ) {
    return next();
  }
  return res.status(403).type("text").send("Forbidden");
}

module.exports = function registerAdminChurchSupportAccessRoutes(router) {
  router.use(requirePlatformAdminCsrfOnMutations);

  router.get(
    "/church/organizations/:organizationId/account-managers",
    requireAdmin,
    requireSupportAccessCapability,
    async (req, res, next) => {
      try {
        const organizationId = Number(req.params.organizationId);
        const pool = getPgPool();
        const organization = await platformProvisioningRepo.findOrganizationByIdForPlatform(
          pool,
          organizationId
        );
        if (!organization) return res.status(404).type("text").send("Organization not found");
        const assignment = await churchPlatformSupportAccessService.getAccountManagers(
          pool,
          organizationId
        );
        const staff = await adminUsersRepo.listUsersForTenantScope(
          pool,
          Number(organization.platform_tenant_id)
        );
        const eligible = staff.filter((u) =>
          catalogue.ACCOUNT_MANAGER_ELIGIBLE_ROLES.has(catalogue.normalizeRole(u.role))
        );
        return res.render("admin/church/organization_account_managers", {
          organization,
          assignment,
          eligibleStaff: eligible,
          canAssign: catalogue.canAssignAccountManagers(req.session.adminUser.role),
          notice: req.query.notice || null,
          error: req.query.error || null,
          activeNav: "church_platform_orgs",
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    "/church/organizations/:organizationId/account-managers",
    requireAdmin,
    requireSupportAccessCapability,
    async (req, res, next) => {
      try {
        const organizationId = Number(req.params.organizationId);
        const pool = getPgPool();
        await churchPlatformSupportAccessService.assignAccountManagers(pool, {
          adminUser: req.session.adminUser,
          organizationId,
          primaryAdminUserId: req.body.primary_admin_user_id
            ? Number(req.body.primary_admin_user_id)
            : null,
          backupAdminUserId: req.body.backup_admin_user_id
            ? Number(req.body.backup_admin_user_id)
            : null,
          status: req.body.status === "inactive" ? "inactive" : "active",
          internalNote: req.body.internal_note || null,
        });
        return res.redirect(
          302,
          `/admin/church/organizations/${organizationId}/account-managers?notice=${encodeURIComponent(
            "Account managers updated."
          )}`
        );
      } catch (err) {
        if (err && err.code) {
          return res.redirect(
            302,
            `/admin/church/organizations/${req.params.organizationId}/account-managers?error=${encodeURIComponent(
              err.message
            )}`
          );
        }
        return next(err);
      }
    }
  );

  router.get(
    "/church/organizations/:organizationId/support-access",
    requireAdmin,
    requireSupportAccessCapability,
    async (req, res, next) => {
      try {
        const organizationId = Number(req.params.organizationId);
        const pool = getPgPool();
        const organization = await platformProvisioningRepo.findOrganizationByIdForPlatform(
          pool,
          organizationId
        );
        if (!organization) return res.status(404).type("text").send("Organization not found");
        const branches = await platformProvisioningRepo.listBranchesForOrganization(
          pool,
          organizationId
        );
        const grants = await churchPlatformSupportAccessService.listAccessForOrganization(
          pool,
          organizationId,
          { limit: 50 }
        );
        return res.render("admin/church/organization_support_access", {
          organization,
          branches,
          grants,
          scopes: catalogue.SUPPORT_SCOPES,
          canRequest: catalogue.canRequestSupportAccess(req.session.adminUser.role),
          canApprove: catalogue.canApproveSupportAccess(req.session.adminUser.role),
          notice: req.query.notice || null,
          error: req.query.error || null,
          activeNav: "church_platform_support_access",
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    "/church/organizations/:organizationId/support-access",
    requireAdmin,
    requireSupportAccessCapability,
    async (req, res, next) => {
      try {
        const organizationId = Number(req.params.organizationId);
        const pool = getPgPool();
        await churchPlatformSupportAccessService.requestSupportAccess(pool, {
          adminUser: req.session.adminUser,
          organizationId,
          branchId: req.body.branch_id ? Number(req.body.branch_id) : null,
          ticketReference: req.body.ticket_reference,
          reason: req.body.reason,
          requestedScope: req.body.requested_scope,
        });
        return res.redirect(
          302,
          `/admin/church/organizations/${organizationId}/support-access?notice=${encodeURIComponent(
            "Support access requested."
          )}`
        );
      } catch (err) {
        if (err && err.code) {
          return res.redirect(
            302,
            `/admin/church/organizations/${req.params.organizationId}/support-access?error=${encodeURIComponent(
              err.message
            )}`
          );
        }
        return next(err);
      }
    }
  );

  router.post(
    "/church/support-access/:accessId/approve",
    requireAdmin,
    requireSupportAccessCapability,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const updated = await churchPlatformSupportAccessService.approveSupportAccess(pool, {
          adminUser: req.session.adminUser,
          accessId: Number(req.params.accessId),
          durationHours: req.body.duration_hours,
        });
        return res.redirect(
          302,
          `/admin/church/organizations/${updated.organization_id}/support-access?notice=${encodeURIComponent(
            "Access approved."
          )}`
        );
      } catch (err) {
        if (err && err.code) {
          const access = await churchPlatformSupportAccessService
            .findAccessById(getPgPool(), Number(req.params.accessId))
            .catch(() => null);
          const orgId = access ? access.organization_id : "";
          return res.redirect(
            302,
            `/admin/church/organizations/${orgId}/support-access?error=${encodeURIComponent(err.message)}`
          );
        }
        return next(err);
      }
    }
  );

  router.post(
    "/church/support-access/:accessId/reject",
    requireAdmin,
    requireSupportAccessCapability,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const updated = await churchPlatformSupportAccessService.rejectSupportAccess(pool, {
          adminUser: req.session.adminUser,
          accessId: Number(req.params.accessId),
          rejectionReason: req.body.rejection_reason,
        });
        return res.redirect(
          302,
          `/admin/church/organizations/${updated.organization_id}/support-access?notice=${encodeURIComponent(
            "Access rejected."
          )}`
        );
      } catch (err) {
        if (err && err.code) {
          return res.status(403).type("text").send(err.message);
        }
        return next(err);
      }
    }
  );

  router.post(
    "/church/support-access/:accessId/revoke",
    requireAdmin,
    requireSupportAccessCapability,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const updated = await churchPlatformSupportAccessService.revokeSupportAccess(pool, {
          adminUser: req.session.adminUser,
          accessId: Number(req.params.accessId),
        });
        return res.redirect(
          302,
          `/admin/church/organizations/${updated.organization_id}/support-access?notice=${encodeURIComponent(
            "Access revoked."
          )}`
        );
      } catch (err) {
        if (err && err.code) {
          return res.status(403).type("text").send(err.message);
        }
        return next(err);
      }
    }
  );

  // Redacted diagnostics for support staff (no tenant-entry grant required).
  router.get(
    "/church/organizations/:organizationId/support-diagnostic-redacted",
    requireAdmin,
    requireSupportAccessAction({
      action: "view_redacted_diagnostics",
      organizationIdParam: "organizationId",
      recordUse: false,
    }),
    async (req, res, next) => {
      try {
        const organizationId = Number(req.params.organizationId);
        const pool = getPgPool();
        const diagnostic = await churchSupportDiagnosticService.buildOrganisationSupportDiagnostic(
          pool,
          organizationId
        );
        return res.render("admin/church/organization_support_diagnostic", {
          organization: diagnostic.organisation || { id: organizationId, name: "Organisation" },
          diagnostic,
          exportJsonUrl: null,
          exportTxtUrl: null,
          activeNav: "church_platform_orgs",
          redactedMode: true,
          notice: null,
          error: null,
          orgDetailUrl: `/admin/church/organizations/${organizationId}`,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Example gated tenant-entry action (configuration scope).
  router.get(
    "/church/organizations/:organizationId/support-config",
    requireAdmin,
    requireSupportAccessAction({
      action: "view_org_config",
      organizationIdParam: "organizationId",
    }),
    async (req, res, next) => {
      try {
        const organizationId = Number(req.params.organizationId);
        const pool = getPgPool();
        const organization = await platformProvisioningRepo.findOrganizationByIdForPlatform(
          pool,
          organizationId
        );
        if (!organization) return res.status(404).type("text").send("Organization not found");
        return res.render("admin/church/organization_support_config", {
          organization,
          supportAccess: req.churchSupportAccess,
          activeNav: "church_platform_support_access",
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Sensitive finance route — always denied for support-access path.
  router.get(
    "/church/organizations/:organizationId/support-finance",
    requireAdmin,
    requireSupportAccessAction({
      action: "finance_view",
      organizationIdParam: "organizationId",
      recordUse: false,
    }),
    (req, res) => res.status(403).type("text").send("Forbidden")
  );

  void platformAdminId;
  void requireSuperAdmin;
};
