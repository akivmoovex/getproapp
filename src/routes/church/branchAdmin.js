"use strict";

const { getPgPool } = require("../../db/pg");
const membersRepo = require("../../db/pg/church/membersRepo");
const branchAdminsRepo = require("../../db/pg/church/branchAdminsRepo");
const attendanceRepo = require("../../db/pg/church/attendanceRepo");
const givingSummariesRepo = require("../../db/pg/church/givingSummariesRepo");
const monthlyReportsRepo = require("../../db/pg/church/monthlyReportsRepo");
const {
  getChurchBranchAdminSession,
  setChurchBranchAdminSession,
  clearChurchBranchAdminSession,
  requireChurchBranchAdminSession,
  verifyBranchAdminPassword,
  hashBranchAdminPassword,
} = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  branchAdminLocals,
  flashFromQuery,
  MEMBER_NOTICES,
  ACCOUNT_NOTICES,
  noticeMessage,
} = require("./branchAdminShared");
const { validateChangePasswordBody } = require("../../church/branchAdminAccountValidation");
const registerBranchAdminAttendanceRoutes = require("./branchAdminAttendance");
const registerBranchAdminGivingRoutes = require("./branchAdminGiving");
const registerBranchAdminReportsRoutes = require("./branchAdminReports");
const registerBranchAdminMemberRequestsRoutes = require("./branchAdminMemberRequests");
const registerBranchAdminPasswordResetRequestsRoutes = require("./branchAdminPasswordResetRequests");
const registerBranchAdminLeaderPasswordResetRequestsRoutes = require("./branchAdminLeaderPasswordResetRequests");
const registerBranchAdminResetRequestsInboxRoutes = require("./branchAdminResetRequestsInbox");
const registerBranchAdminPrayerRequestsRoutes = require("./branchAdminPrayerRequests");
const registerBranchAdminAnnouncementsRoutes = require("./branchAdminAnnouncements");
const registerBranchAdminEventsRoutes = require("./branchAdminEvents");
const registerBranchAdminWebsiteEditorRoutes = require("./branchAdminWebsiteEditor");
const registerBranchAdminSiteSettingsRoutes = require("./branchAdminSiteSettings");
const registerBranchAdminSermonsRoutes = require("./branchAdminSermons");
const registerBranchAdminResourcesRoutes = require("./branchAdminResources");
const registerBranchAdminGivingSettingsRoutes = require("./branchAdminGivingSettings");
const registerBranchAdminMinistriesRoutes = require("./branchAdminMinistries");
const registerBranchAdminDepartmentsRoutes = require("./branchAdminDepartments");
const registerBranchAdminDutyRosterRoutes = require("./branchAdminDutyRoster");
const registerBranchAdminMinistryActivityRoutes = require("./branchAdminMinistryActivity");
const registerBranchAdminLeadersRoutes = require("./branchAdminLeaders");
const registerBranchAdminMinistryJoinRequestsRoutes = require("./branchAdminMinistryJoinRequests");
const registerBranchAdminMembersRoutes = require("./branchAdminMembers");
const registerBranchAdminAuditRoutes = require("./branchAdminAudit");
const memberRequestsRepo = require("../../db/pg/church/memberRequestsRepo");
const memberPasswordResetRequestsRepo = require("../../db/pg/church/memberPasswordResetRequestsRepo");
const ministryLeaderPasswordResetRequestsRepo = require("../../db/pg/church/ministryLeaderPasswordResetRequestsRepo");
const branchResetRequestsInboxRepo = require("../../db/pg/church/branchResetRequestsInboxRepo");
const prayerRequestsRepo = require("../../db/pg/church/prayerRequestsRepo");
const announcementsRepo = require("../../db/pg/church/announcementsRepo");
const hqBroadcastsRepo = require("../../db/pg/church/hqBroadcastsRepo");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const {
  auditSummary,
  actorDisplayFromRow,
  actionLabel,
} = require("../../church/auditLogFormatting");
const { BRANCH_ADMIN_HQ_AUDIENCES } = require("../../church/hqBroadcastValidation");
const eventsRepo = require("../../db/pg/church/eventsRepo");
const ministriesRepo = require("../../db/pg/church/ministriesRepo");
const departmentsRepo = require("../../db/pg/church/departmentsRepo");
const dutyRosterRepo = require("../../db/pg/church/dutyRosterRepo");
const ministryActivityNotesRepo = require("../../db/pg/church/ministryActivityNotesRepo");
const ministryLeadersRepo = require("../../db/pg/church/ministryLeadersRepo");
const ministryJoinRequestsRepo = require("../../db/pg/church/ministryJoinRequestsRepo");
const { reportStatusLabel } = require("../../church/monthlyReportValidation");
const churchPlanService = require("../../services/church/churchPlanService");
const { authenticateWithLoginProtection } = require("../../services/church/churchLoginProtectionService");
const branchAdminPasswordResetRequestsRepo = require("../../db/pg/church/branchAdminPasswordResetRequestsRepo");
const { maskLoginIdentifier } = require("../../church/loginProtection");
const {
  validatePublicBranchAdminForgotPasswordBody,
  PUBLIC_SUCCESS_MESSAGE,
} = require("../../church/branchAdminPasswordResetRequestValidation");
const {
  gatePasswordResetRequest,
  recordPasswordResetSubmission,
} = require("../../services/church/passwordResetRateLimitService");
const {
  getResetRequestStatusLabel,
  getResetRequestStatusClass,
  getResetRequestTypeLabel,
  getResetRequestTypeClass,
} = require("../../church/resetRequestFormatting");

function branchAdminRoleLabel(role) {
  const value = String(role || "branch_admin");
  if (value === "branch_admin") return "Branch admin";
  return value.replace(/_/g, " ");
}

function buildBranchAdminAccountView(row, branchName) {
  if (!row) return null;
  return {
    full_name: row.full_name || row.display_name || "Branch Admin",
    email: row.email,
    phone: row.phone,
    role: row.role || "branch_admin",
    status: row.status,
    branch_name: branchName,
    password_changed_at: row.password_changed_at || null,
  };
}

function registerBranchAdminRoutes(router) {
  router.use("/branch", requireChurchBranchHost);

  router.use("/branch", async (req, res, next) => {
    try {
      const admin = getChurchBranchAdminSession(req);
      const branchId = req.churchContext && req.churchContext.branch && req.churchContext.branch.id;
      if (admin && branchId && Number(admin.branch_id) === Number(branchId)) {
        const pool = getPgPool();
        const counts = await memberPasswordResetRequestsRepo.countPasswordResetRequestsByStatusForBranch(
          pool,
          branchId
        );
        const leaderCounts =
          await ministryLeaderPasswordResetRequestsRepo.countMinistryLeaderPasswordResetRequestsByStatusForBranch(
            pool,
            branchId
          );
        const pendingCounts = await branchResetRequestsInboxRepo.getPendingBranchResetRequestCounts(
          pool,
          req.churchContext.organization.id,
          branchId
        );
        res.locals.branchPasswordResetPendingCount = counts.submitted || 0;
        res.locals.branchLeaderPasswordResetPendingCount = leaderCounts.submitted || 0;
        res.locals.branchResetInboxPendingCount = pendingCounts.submitted_total || 0;
      } else {
        res.locals.branchPasswordResetPendingCount = 0;
        res.locals.branchLeaderPasswordResetPendingCount = 0;
        res.locals.branchResetInboxPendingCount = 0;
      }
      res.locals.getResetRequestStatusLabel = getResetRequestStatusLabel;
      res.locals.getResetRequestStatusClass = getResetRequestStatusClass;
      res.locals.getResetRequestTypeLabel = getResetRequestTypeLabel;
      res.locals.getResetRequestTypeClass = getResetRequestTypeClass;
      return next();
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/login", (req, res) => {
    const admin = getChurchBranchAdminSession(req);
    if (admin && Number(admin.branch_id) === Number(req.churchContext.branch.id)) {
      return res.redirect("/branch/dashboard");
    }
    return res.render(
      "church/branch-admin/login",
      branchAdminLocals(req, {
        error: null,
        identifier: "",
      })
    );
  });

  router.post("/branch/login", async (req, res, next) => {
    try {
      const identifier = String((req.body && req.body.identifier) || "").trim();
      const password = String((req.body && req.body.password) || "");
      const branch = req.churchContext.branch;
      const org = req.churchContext.organization;
      const pool = getPgPool();

      const renderError = (message) =>
        res.status(400).render(
          "church/branch-admin/login",
          branchAdminLocals(req, { error: message, identifier })
        );

      const auth = await authenticateWithLoginProtection(pool, req, {
        accountType: "branch_admin",
        organizationId: org.id,
        branchId: branch.id,
        identifier,
        password,
        findAccount: (db, ident) =>
          branchAdminsRepo.findBranchAdminByEmailOrPhoneForBranch(db, branch.id, ident),
        verifyPassword: verifyBranchAdminPassword,
      });

      if (!auth.ok) {
        return renderError(auth.error);
      }

      const row = auth.account;
      setChurchBranchAdminSession(req, {
        admin_id: row.id,
        organization_id: row.organization_id,
        branch_id: row.branch_id,
        full_name: row.full_name || row.display_name || "Branch Admin",
        role: row.role || "branch_admin",
        status: row.status,
      });

      return res.redirect(303, "/branch/dashboard");
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/forgot-password", (req, res) => {
    return res.render(
      "church/branch-admin/forgot_password",
      branchAdminLocals(req, {
        error: null,
        form: {},
      })
    );
  });

  router.post("/branch/forgot-password", async (req, res, next) => {
    try {
      const validation = validatePublicBranchAdminForgotPasswordBody(req.body || {});
      if (!validation.ok) {
        return res.status(400).render(
          "church/branch-admin/forgot_password",
          branchAdminLocals(req, {
            error: validation.error,
            form: validation.form,
          })
        );
      }

      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const pool = getPgPool();

      const rateGate = await gatePasswordResetRequest(pool, req, {
        requestType: "branch_admin",
        organizationId: org.id,
        branchId: branch.id,
        identifier: validation.data.identifier,
      });
      if (!rateGate.allowed) {
        return res.redirect(303, "/branch/forgot-password-submitted");
      }

      const matched = await branchAdminPasswordResetRequestsRepo.findPossibleBranchAdminByIdentifierForBranch(
        pool,
        branch.id,
        validation.data.identifier
      );

      const requestRow = await branchAdminPasswordResetRequestsRepo.createBranchAdminPasswordResetRequest(
        pool,
        {
          organizationId: org.id,
          branchId: branch.id,
          branchAdminId: matched ? matched.id : null,
          identifierSubmitted: validation.data.identifier,
          fullNameSubmitted: validation.data.full_name,
          phoneSubmitted: validation.data.phone,
          emailSubmitted: validation.data.email,
        }
      );

      await auditLogsRepo.insertAuditLog(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        actor_type: "public",
        actor_id: null,
        action: "branch_admin_password_reset_requested",
        entity_type: "branch_admin_password_reset_request",
        entity_id: requestRow.id,
        metadata_json: {
          request_id: requestRow.id,
          branch_admin_id: requestRow.branch_admin_id ?? null,
          organization_id: org.id,
          branch_id: branch.id,
          identifier_masked: maskLoginIdentifier(validation.data.identifier),
          status: requestRow.status,
          action_source: "branch_admin_forgot_password_request",
        },
      });

      await recordPasswordResetSubmission(pool, req, {
        requestType: "branch_admin",
        organizationId: org.id,
        branchId: branch.id,
        identifier: validation.data.identifier,
      });

      return res.redirect(303, "/branch/forgot-password-submitted");
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/forgot-password-submitted", (req, res) => {
    return res.render(
      "church/branch-admin/forgot_password_submitted",
      branchAdminLocals(req, {
        successMessage: PUBLIC_SUCCESS_MESSAGE,
      })
    );
  });

  router.post("/branch/logout", requireChurchBranchAdminSession, (req, res) => {
    clearChurchBranchAdminSession(req);
    return res.redirect(303, "/branch/login");
  });

  router.get("/branch/account", requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const row = await branchAdminsRepo.findBranchAdminById(pool, req.churchBranchAdmin.admin_id);
      if (!row) {
        clearChurchBranchAdminSession(req);
        return res.redirect("/branch/login");
      }
      const account = buildBranchAdminAccountView(row, branch.name);
      return res.render(
        "church/branch-admin/account",
        branchAdminLocals(req, {
          account,
          branchAdminRoleLabel,
          error: null,
          notice: noticeMessage(flashFromQuery(req, ACCOUNT_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post("/branch/account/change-password", requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const adminId = req.churchBranchAdmin.admin_id;
      const validation = validateChangePasswordBody(req.body || {});

      if (!validation.ok) {
        const row = await branchAdminsRepo.findBranchAdminById(pool, adminId);
        return res.status(400).render(
          "church/branch-admin/account",
          branchAdminLocals(req, {
            account: buildBranchAdminAccountView(row, branch.name),
            branchAdminRoleLabel,
            error: validation.error,
            notice: null,
          })
        );
      }

      const adminRow = await branchAdminsRepo.findBranchAdminByIdForPasswordChange(pool, adminId, branch.id);
      if (!adminRow || adminRow.status !== "active") {
        clearChurchBranchAdminSession(req);
        return res.redirect("/branch/login");
      }

      const currentOk = await verifyBranchAdminPassword(validation.current_password, adminRow.password_hash);
      if (!currentOk) {
        return res.status(400).render(
          "church/branch-admin/account",
          branchAdminLocals(req, {
            account: buildBranchAdminAccountView(adminRow, branch.name),
            branchAdminRoleLabel,
            error: "Current password is incorrect.",
            notice: null,
          })
        );
      }

      if (validation.current_password === validation.new_password) {
        return res.status(400).render(
          "church/branch-admin/account",
          branchAdminLocals(req, {
            account: buildBranchAdminAccountView(adminRow, branch.name),
            branchAdminRoleLabel,
            error: "New password must be different from your current password.",
            notice: null,
          })
        );
      }

      const passwordHash = await hashBranchAdminPassword(validation.new_password);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const updated = await branchAdminsRepo.updateBranchAdminPasswordSelfService(
          client,
          adminId,
          branch.id,
          passwordHash
        );
        if (!updated) {
          throw Object.assign(new Error("Unable to update password."), { code: "UPDATE_FAILED" });
        }
        await branchAdminsRepo.recordBranchAdminPasswordChangeAudit(client, {
          organizationId: adminRow.organization_id,
          branchId: branch.id,
          branchAdminId: adminId,
        });
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      return res.redirect(303, "/branch/account?notice=password_changed");
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/dashboard", requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const counts = await membersRepo.countMembersByStatusForBranch(pool, branch.id);
      const attendancePending = await attendanceRepo.countAttendancePendingForBranch(pool, branch.id);
      const now = new Date();
      const currentGiving = await givingSummariesRepo.getGivingSummaryForBranchPeriod(
        pool,
        branch.id,
        now.getFullYear(),
        now.getMonth() + 1
      );
      let currentMonthGivingStatus = "Not started";
      if (currentGiving) {
        currentMonthGivingStatus =
          currentGiving.status === "submitted"
            ? "Submitted"
            : currentGiving.status === "included_in_monthly_report"
              ? "Included in monthly report"
              : "Draft";
      }
      const currentReport = await monthlyReportsRepo.getCurrentMonthReportForBranch(pool, branch.id);
      let monthlyReportStatus = "Not started";
      if (currentReport) {
        monthlyReportStatus = reportStatusLabel(currentReport.status);
        if (currentReport.status === "submitted") {
          monthlyReportStatus = "Submitted — awaiting HQ review";
        }
      }
      const requestCounts = await memberRequestsRepo.countMemberRequestsByStatusForBranch(pool, branch.id);
      const passwordResetCounts = await memberPasswordResetRequestsRepo.countPasswordResetRequestsByStatusForBranch(
        pool,
        branch.id
      );
      const leaderPasswordResetCounts =
        await ministryLeaderPasswordResetRequestsRepo.countMinistryLeaderPasswordResetRequestsByStatusForBranch(
          pool,
          branch.id
        );
      const branchResetPendingCounts =
        await branchResetRequestsInboxRepo.getPendingBranchResetRequestCounts(
          pool,
          req.churchContext.organization.id,
          branch.id
        );
      const prayerCounts = await prayerRequestsRepo.countPrayerRequestsByStatusForBranch(pool, branch.id);
      const announcementCounts = await announcementsRepo.countAnnouncementsByStatusForBranch(pool, branch.id);
      const eventCounts = await eventsRepo.countEventsByStatusForBranch(pool, branch.id);
      const upcomingPublishedEvents = await eventsRepo.countUpcomingPublishedEventsForBranch(pool, branch.id);
      const ministryCounts = await ministriesRepo.countMinistriesByStatusForBranch(pool, branch.id);
      const departmentCounts = await departmentsRepo.countDepartmentsByStatusForBranch(pool, branch.id);
      const dutyCounts = await dutyRosterRepo.countDutiesByStatusForBranch(pool, branch.id);
      const confirmedUpcomingDuties = await dutyRosterRepo.countConfirmedUpcomingDutiesForBranch(
        pool,
        branch.id
      );
      const activityNoteCounts = await ministryActivityNotesRepo.countActivityNotesByReviewStatusForBranch(
        pool,
        branch.id
      );
      const ministryAttendanceThisMonth = await attendanceRepo.countMinistryAttendanceForBranchMonth(
        pool,
        branch.id,
        now.getFullYear(),
        now.getMonth() + 1
      );
      const leaderCounts = await ministryLeadersRepo.countLeadersByStatusForBranch(pool, branch.id);
      const joinRequestCounts = await ministryJoinRequestsRepo.countJoinRequestsByStatusForBranch(pool, branch.id);
      const hqBroadcasts = await hqBroadcastsRepo.listVisibleBroadcastsForBranch(
        pool,
        req.churchContext.organization.id,
        branch.id,
        { audiences: BRANCH_ADMIN_HQ_AUDIENCES, limit: 5 }
      );
      const recentActivity = await auditLogsRepo.listRecentAuditLogsForBranch(pool, branch.id, {
        limit: 5,
      });
      const planContext = await churchPlanService.loadPlanContextForOrganization(
        pool,
        req.churchContext.organization.id
      );
      return res.render(
        "church/branch-admin/dashboard",
        branchAdminLocals(req, {
          counts,
          planContext,
          attendancePending,
          currentMonthGivingStatus,
          monthlyReportStatus,
          requestCounts,
          passwordResetCounts,
          leaderPasswordResetCounts,
          branchResetPendingCounts,
          prayerCounts,
          announcementCounts,
          hqBroadcasts,
          recentActivity,
          auditSummary,
          actorDisplayFromRow,
          actionLabel,
          eventCounts,
          upcomingPublishedEvents,
          ministryCounts,
          departmentCounts,
          dutyCounts,
          confirmedUpcomingDuties,
          activityNoteCounts,
          ministryAttendanceThisMonth,
          leaderCounts,
          joinRequestCounts,
          notice: noticeMessage(flashFromQuery(req, MEMBER_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  registerBranchAdminAttendanceRoutes(router);
  registerBranchAdminGivingRoutes(router);
  registerBranchAdminGivingSettingsRoutes(router);
  registerBranchAdminMinistriesRoutes(router);
  registerBranchAdminDepartmentsRoutes(router);
  registerBranchAdminDutyRosterRoutes(router);
  registerBranchAdminMinistryActivityRoutes(router);
  registerBranchAdminLeadersRoutes(router);
  registerBranchAdminMinistryJoinRequestsRoutes(router);
  registerBranchAdminMembersRoutes(router);
  registerBranchAdminAuditRoutes(router);
  registerBranchAdminReportsRoutes(router);
  registerBranchAdminMemberRequestsRoutes(router);
  registerBranchAdminPasswordResetRequestsRoutes(router);
  registerBranchAdminLeaderPasswordResetRequestsRoutes(router);
  registerBranchAdminResetRequestsInboxRoutes(router);
  registerBranchAdminPrayerRequestsRoutes(router);
  registerBranchAdminAnnouncementsRoutes(router);
  registerBranchAdminEventsRoutes(router);
  registerBranchAdminWebsiteEditorRoutes(router);
  registerBranchAdminSiteSettingsRoutes(router);
  registerBranchAdminSermonsRoutes(router);
  registerBranchAdminResourcesRoutes(router);
}

registerBranchAdminRoutes.requireChurchBranchHost = requireChurchBranchHost;

module.exports = registerBranchAdminRoutes;
