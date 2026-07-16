"use strict";

const { getPgPool } = require("../../db/pg");
const hqAdminsRepo = require("../../db/pg/church/hqAdminsRepo");
const monthlyReportsRepo = require("../../db/pg/church/monthlyReportsRepo");
const {
  getChurchHqAdminSession,
  clearChurchHqAdminSession,
  requireChurchHqAdminSession,
  hashHqAdminPassword,
} = require("../../church/hqAuth");
const { requireChurchBranchHost } = require("./auth");
const { reportStatusLabel } = require("../../church/monthlyReportValidation");
const {
  hqAdminLocals,
  flashFromQuery,
  HQ_NOTICES,
  ACCOUNT_NOTICES,
  noticeMessage,
  recordHqAudit,
} = require("./hqAdminShared");
const { validateChangePasswordBody } = require("../../church/hqAdminAccountValidation");
const registerHqAdminBranchesRoutes = require("./hqAdminBranches");
const registerHqAdminBroadcastsRoutes = require("./hqAdminBroadcasts");
const registerHqAdminAnalyticsRoutes = require("./hqAdminAnalytics");
const registerHqAdminAuditRoutes = require("./hqAdminAudit");
const hqBranchesRepo = require("../../db/pg/church/hqBranchesRepo");
const hqBroadcastsRepo = require("../../db/pg/church/hqBroadcastsRepo");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const {
  auditSummary,
  actorDisplayFromRow,
  actionLabel,
} = require("../../church/auditLogFormatting");
const { parsePeriodMonth } = require("../../church/hqBranchRegistryValidation");
const churchPlanService = require("../../services/church/churchPlanService");
const { runTenantUnifiedLoginPost } = require("../../services/church/runTenantUnifiedLogin");
const { clearPortalChoice } = require("../../church/tenantLoginSession");
const hqAdminPasswordResetRequestsRepo = require("../../db/pg/church/hqAdminPasswordResetRequestsRepo");
const { maskLoginIdentifier } = require("../../church/loginProtection");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  validatePublicHqAdminForgotPasswordBody,
  PUBLIC_SUCCESS_MESSAGE,
} = require("../../church/hqAdminPasswordResetRequestValidation");
const {
  gatePasswordResetRequest,
  recordPasswordResetSubmission,
} = require("../../services/church/passwordResetRateLimitService");

function formatMoney(amount) {
  const n = Number(amount || 0);
  return n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseJsonField(val) {
  if (!val) return {};
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return {};
  }
}

function validateHqComment(body, required) {
  const comment = String((body && body.hq_review_comment) || "").trim().slice(0, 4000);
  if (required && !comment) {
    return { ok: false, error: "Please enter a comment for the branch." };
  }
  return { ok: true, comment };
}

function hqAdminRoleLabel(role) {
  const value = String(role || "hq_admin");
  if (value === "hq_admin") return "HQ admin";
  return value.replace(/_/g, " ");
}

function buildHqAdminAccountView(row, organizationName) {
  if (!row) return null;
  return {
    full_name: row.full_name || row.display_name || "HQ Admin",
    email: row.email,
    phone: row.phone,
    role: row.role || "hq_admin",
    status: row.status,
    organization_name: organizationName,
    password_changed_at: row.password_changed_at || null,
  };
}

function registerHqAdminRoutes(router) {
  router.use("/hq", requireChurchBranchHost);

  router.get("/hq/login", (req, res) => {
    const admin = getChurchHqAdminSession(req);
    const org = req.churchContext.organization;
    if (admin && Number(admin.organization_id) === Number(org.id)) {
      return res.redirect("/hq/dashboard");
    }
    const { isOperationalStatus, renderChurchUnavailable } = require("../../church/churchStatusAccess");
    if (!isOperationalStatus(org && org.status)) {
      return renderChurchUnavailable(req, res);
    }
    return res.render(
      "church/auth/login",
      hqAdminLocals(req, {
        error: null,
        identifier: "",
        organizationName: org.name,
        branchName: req.churchContext.branch && req.churchContext.branch.name,
        loginFormAction: "/hq/login",
      })
    );
  });

  router.post("/hq/login", async (req, res, next) => {
    try {
      const identifier = String((req.body && req.body.identifier) || "").trim();
      const password = String((req.body && req.body.password) || "");
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const { renderChurchUnavailable } = require("../../church/churchStatusAccess");

      return await runTenantUnifiedLoginPost(pool, req, res, {
        identifier,
        password,
        renderUnavailable: () => renderChurchUnavailable(req, res),
        renderError: (message) =>
          res.status(400).render(
            "church/auth/login",
            hqAdminLocals(req, {
              error: message,
              identifier,
              organizationName: org.name,
              branchName: req.churchContext.branch && req.churchContext.branch.name,
              loginFormAction: "/hq/login",
            })
          ),
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/hq/forgot-password", (req, res) => {
    return res.render(
      "church/hq/forgot_password",
      hqAdminLocals(req, {
        error: null,
        form: {},
      })
    );
  });

  router.post("/hq/forgot-password", async (req, res, next) => {
    try {
      const validation = validatePublicHqAdminForgotPasswordBody(req.body || {});
      if (!validation.ok) {
        return res.status(400).render(
          "church/hq/forgot_password",
          hqAdminLocals(req, {
            error: validation.error,
            form: validation.form,
          })
        );
      }

      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const pool = getPgPool();

      const rateGate = await gatePasswordResetRequest(pool, req, {
        requestType: "hq_admin",
        organizationId: org.id,
        branchId: branch ? branch.id : null,
        identifier: validation.data.identifier,
      });
      if (!rateGate.allowed) {
        return res.redirect(303, "/hq/forgot-password-submitted");
      }

      const matched = await hqAdminPasswordResetRequestsRepo.findPossibleHqAdminByIdentifierForOrganization(
        pool,
        org.id,
        validation.data.identifier
      );

      const requestRow = await hqAdminPasswordResetRequestsRepo.createHqAdminPasswordResetRequest(pool, {
        organizationId: org.id,
        branchId: branch ? branch.id : null,
        hqAdminId: matched ? matched.id : null,
        identifierSubmitted: validation.data.identifier,
        fullNameSubmitted: validation.data.full_name,
        phoneSubmitted: validation.data.phone,
        emailSubmitted: validation.data.email,
      });

      await auditLogsRepo.insertAuditLog(pool, {
        organization_id: org.id,
        branch_id: branch ? branch.id : null,
        actor_type: "public",
        actor_id: null,
        action: "hq_admin_password_reset_requested",
        entity_type: "hq_admin_password_reset_request",
        entity_id: requestRow.id,
        metadata_json: {
          request_id: requestRow.id,
          hq_admin_id: requestRow.hq_admin_id ?? null,
          organization_id: org.id,
          branch_id: branch ? branch.id : null,
          identifier_masked: maskLoginIdentifier(validation.data.identifier),
          status: requestRow.status,
          action_source: "hq_admin_forgot_password_request",
        },
      });

      await recordPasswordResetSubmission(pool, req, {
        requestType: "hq_admin",
        organizationId: org.id,
        branchId: branch ? branch.id : null,
        identifier: validation.data.identifier,
      });

      return res.redirect(303, "/hq/forgot-password-submitted");
    } catch (e) {
      return next(e);
    }
  });

  router.get("/hq/forgot-password-submitted", (req, res) => {
    return res.render(
      "church/hq/forgot_password_submitted",
      hqAdminLocals(req, {
        successMessage: PUBLIC_SUCCESS_MESSAGE,
      })
    );
  });

  router.post("/hq/logout", requireChurchHqAdminSession, requireChurchSessionCsrf, (req, res) => {
    clearChurchHqAdminSession(req);
    clearPortalChoice(req);
    return res.redirect(303, "/hq/login");
  });

  router.get("/hq/account", requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const row = await hqAdminsRepo.findHqAdminById(pool, req.churchHqAdmin.hq_admin_id);
      if (!row) {
        clearChurchHqAdminSession(req);
        return res.redirect("/hq/login");
      }
      const account = buildHqAdminAccountView(row, org.name);
      const churchPackageUsageService = require("../../services/church/churchPackageUsageService");
      const packageUsage = await churchPackageUsageService.loadPackageUsageForAccountPage(pool, org.id, {
        reconcileStorage: false,
      });
      const churchDormancyService = require("../../services/church/churchDormancyService");
      const dormancyDiagnostic = await churchDormancyService.getOrganisationDormancyDiagnostic(pool, org.id);
      return res.render(
        "church/hq/account",
        hqAdminLocals(req, {
          account,
          hqAdminRoleLabel,
          packageUsage,
          dormancyDiagnostic,
          organizationStatus: org.status,
          error: null,
          notice: noticeMessage(flashFromQuery(req, ACCOUNT_NOTICES)),
        })
      );
    } catch (e) {
      console.error("[church:hq-account] failed to load account", {
        message: e && e.message ? String(e.message).slice(0, 200) : "unknown",
      });
      try {
        return res.status(500).render(
          "church/hq/account",
          hqAdminLocals(req, {
            account: {
              full_name: (req.churchHqAdmin && req.churchHqAdmin.full_name) || "HQ Admin",
              email: "",
              phone: "",
              role: (req.churchHqAdmin && req.churchHqAdmin.role) || "hq_admin",
              status: (req.churchHqAdmin && req.churchHqAdmin.status) || "",
              organization_name: (req.churchContext && req.churchContext.organization && req.churchContext.organization.name) || "",
            },
            hqAdminRoleLabel,
            error: "We could not load your account. Please try again.",
            notice: null,
          })
        );
      } catch (_) {
        return next(e);
      }
    }
  });

  router.post(
    "/hq/account/reactivate-from-dormancy",
    requireChurchHqAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const org = req.churchContext.organization;
        const pool = getPgPool();
        if (!org || String(org.status) !== "dormant") {
          return res.redirect(303, "/hq/account");
        }
        const churchDormancyService = require("../../services/church/churchDormancyService");
        await churchDormancyService.reactivateFromDormancy(pool, {
          organizationId: org.id,
          actorType: "hq_admin",
          actorId: req.churchHqAdmin.hq_admin_id,
          reason: String((req.body && req.body.status_reason) || "").trim() || "Reactivated by HQ admin.",
        });
        if (req.churchContext.organization) {
          req.churchContext.organization.status = "active";
        }
        delete req._churchOperationalStatus;
        return res.redirect(303, "/hq/account?notice=reactivated_from_dormancy");
      } catch (err) {
        if (err && (err.code === "INVALID_STATUS" || err.code === "NOT_FOUND")) {
          return res.redirect(303, "/hq/account");
        }
        return next(err);
      }
    }
  );

  router.post("/hq/account/change-password", requireChurchHqAdminSession, requireChurchSessionCsrf, async (req, res, next) => {
    try {
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const adminId = req.churchHqAdmin.hq_admin_id;
      const validation = validateChangePasswordBody(req.body || {});

      if (!validation.ok) {
        const row = await hqAdminsRepo.findHqAdminById(pool, adminId);
        return res.status(400).render(
          "church/hq/account",
          hqAdminLocals(req, {
            account: buildHqAdminAccountView(row, org.name),
            hqAdminRoleLabel,
            error: validation.error,
            notice: null,
          })
        );
      }

      const adminRow = await hqAdminsRepo.findHqAdminByIdForPasswordChange(pool, adminId, org.id);
      if (!adminRow || adminRow.status !== "active") {
        clearChurchHqAdminSession(req);
        return res.redirect("/hq/login");
      }

      const currentOk = await verifyHqAdminPassword(validation.current_password, adminRow.password_hash);
      if (!currentOk) {
        return res.status(400).render(
          "church/hq/account",
          hqAdminLocals(req, {
            account: buildHqAdminAccountView(adminRow, org.name),
            hqAdminRoleLabel,
            error: "Current password is incorrect.",
            notice: null,
          })
        );
      }

      if (validation.current_password === validation.new_password) {
        return res.status(400).render(
          "church/hq/account",
          hqAdminLocals(req, {
            account: buildHqAdminAccountView(adminRow, org.name),
            hqAdminRoleLabel,
            error: "New password must be different from your current password.",
            notice: null,
          })
        );
      }

      const passwordHash = await hashHqAdminPassword(validation.new_password);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const updated = await hqAdminsRepo.updateHqAdminPasswordSelfService(
          client,
          adminId,
          org.id,
          passwordHash
        );
        if (!updated) {
          throw Object.assign(new Error("Unable to update password."), { code: "UPDATE_FAILED" });
        }
        await hqAdminsRepo.recordHqAdminPasswordChangeAudit(client, {
          organizationId: org.id,
          hqAdminId: adminId,
        });
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      return res.redirect(303, "/hq/account?notice=password_changed");
    } catch (e) {
      return next(e);
    }
  });

  router.get("/hq/dashboard", requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const period = parsePeriodMonth();
      const registryStats = await hqBranchesRepo.getOrganizationRegistryStats(pool, org.id, period);
      const statusCounts = await monthlyReportsRepo.countReportsByStatusForOrganization(pool, org.id);
      const recentReports = await monthlyReportsRepo.listReportsForOrganization(pool, org.id, { limit: 8 });
      const broadcastCounts = await hqBroadcastsRepo.countBroadcastsByStatusForOrganization(pool, org.id);
      const recentActivity = await auditLogsRepo.listRecentAuditLogsForOrganization(pool, org.id, {
        limit: 5,
      });
      const planContext = await churchPlanService.loadPlanContextForOrganization(pool, org.id);

      return res.render(
        "church/hq/dashboard",
        hqAdminLocals(req, {
          branchCount: registryStats.totalBranches,
          registryStats,
          statusCounts,
          recentReports,
          broadcastCounts,
          recentActivity,
          planContext,
          auditSummary,
          actorDisplayFromRow,
          actionLabel,
          reportStatusLabel,
          notice: noticeMessage(flashFromQuery(req, HQ_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/hq/reports", requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const pending = await monthlyReportsRepo.listSubmittedReportsForOrganization(pool, org.id);
      const reviewed = await monthlyReportsRepo.listReportsForOrganization(pool, org.id, { limit: 50 });
      const reviewedFiltered = reviewed.filter((r) => r.status !== "submitted");

      return res.render(
        "church/hq/reports_review",
        hqAdminLocals(req, {
          pendingReports: pending,
          reviewedReports: reviewedFiltered,
          reportStatusLabel,
          notice: noticeMessage(flashFromQuery(req, HQ_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/hq/reports/:reportId", requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const reportId = Number(req.params.reportId);
      if (!Number.isFinite(reportId) || reportId <= 0) {
        return res.status(404).type("text").send("Report not found.");
      }
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const report = await monthlyReportsRepo.findReportByIdForOrganization(pool, reportId, org.id);
      if (!report) {
        return res.status(404).type("text").send("Report not found.");
      }

      return res.render(
        "church/hq/report_review_detail",
        hqAdminLocals(req, {
          report,
          givingSnapshot: parseJsonField(report.giving_snapshot_json),
          attendanceSnapshot: parseJsonField(report.attendance_snapshot_json),
          formatMoney,
          reportStatusLabel,
          error: null,
          notice: noticeMessage(flashFromQuery(req, HQ_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post("/hq/reports/:reportId/approve", requireChurchHqAdminSession, requireChurchSessionCsrf, async (req, res, next) => {
    try {
      const reportId = Number(req.params.reportId);
      if (!Number.isFinite(reportId) || reportId <= 0) {
        return res.status(404).type("text").send("Report not found.");
      }
      const commentCheck = validateHqComment(req.body, false);
      if (!commentCheck.ok) {
        return res.status(400).type("text").send(commentCheck.error);
      }
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const existing = await monthlyReportsRepo.findReportByIdForOrganization(pool, reportId, org.id);
      if (!existing) {
        return res.status(404).type("text").send("Report not found.");
      }
      if (existing.status !== "submitted") {
        return res.status(400).type("text").send("Only submitted reports can be approved.");
      }

      const approved = await monthlyReportsRepo.approveReportForOrganization(
        pool,
        reportId,
        org.id,
        commentCheck.comment
      );
      if (!approved) {
        return res.status(400).type("text").send("Report could not be approved.");
      }

      await recordHqAudit(pool, req, {
        action: "hq_report_approved",
        branchId: approved.branch_id,
        entityType: "monthly_report",
        entityId: approved.id,
        metadata: {
          period_month: approved.period_month_label,
          comment: commentCheck.comment || null,
        },
      });

      return res.redirect(303, `/hq/reports/${reportId}?notice=approved`);
    } catch (e) {
      return next(e);
    }
  });

  router.post("/hq/reports/:reportId/request-changes", requireChurchHqAdminSession, requireChurchSessionCsrf, async (req, res, next) => {
    try {
      const reportId = Number(req.params.reportId);
      if (!Number.isFinite(reportId) || reportId <= 0) {
        return res.status(404).type("text").send("Report not found.");
      }
      const commentCheck = validateHqComment(req.body, true);
      const org = req.churchContext.organization;
      const pool = getPgPool();

      if (!commentCheck.ok) {
        const report = await monthlyReportsRepo.findReportByIdForOrganization(pool, reportId, org.id);
        if (!report) {
          return res.status(404).type("text").send("Report not found.");
        }
        return res.status(400).render(
          "church/hq/report_review_detail",
          hqAdminLocals(req, {
            report,
            givingSnapshot: parseJsonField(report.giving_snapshot_json),
            attendanceSnapshot: parseJsonField(report.attendance_snapshot_json),
            formatMoney,
            reportStatusLabel,
            error: commentCheck.error,
            notice: null,
          })
        );
      }

      const existing = await monthlyReportsRepo.findReportByIdForOrganization(pool, reportId, org.id);
      if (!existing) {
        return res.status(404).type("text").send("Report not found.");
      }
      if (existing.status !== "submitted") {
        return res.status(400).type("text").send("Only submitted reports can be marked for changes.");
      }

      const updated = await monthlyReportsRepo.requestChangesForOrganization(
        pool,
        reportId,
        org.id,
        commentCheck.comment
      );
      if (!updated) {
        return res.status(400).type("text").send("Report could not be updated.");
      }

      await recordHqAudit(pool, req, {
        action: "hq_report_changes_requested",
        branchId: updated.branch_id,
        entityType: "monthly_report",
        entityId: updated.id,
        metadata: {
          period_month: updated.period_month_label,
          comment: commentCheck.comment,
        },
      });

      return res.redirect(303, `/hq/reports/${reportId}?notice=changes_requested`);
    } catch (e) {
      return next(e);
    }
  });

  registerHqAdminBranchesRoutes(router);
  registerHqAdminBroadcastsRoutes(router);
  const registerPackageFeatureGateRoutes = require("./packageFeatureGates");
  registerPackageFeatureGateRoutes(router, "hq");
  const registerHqAdminScheduledBroadcastsRoutes = require("./hqAdminScheduledBroadcasts");
  registerHqAdminScheduledBroadcastsRoutes(router);
  const registerHqAdminCrossBranchReportsRoutes = require("./hqAdminCrossBranchReports");
  registerHqAdminCrossBranchReportsRoutes(router);
  registerHqAdminAnalyticsRoutes(router);
  registerHqAdminAuditRoutes(router);
  const registerHqAdminNotificationTemplatesRoutes = require("./hqAdminNotificationTemplates");
  registerHqAdminNotificationTemplatesRoutes(router);
}

registerHqAdminRoutes.requireChurchBranchHost = requireChurchBranchHost;

module.exports = registerHqAdminRoutes;
