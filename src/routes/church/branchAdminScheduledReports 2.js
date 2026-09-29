"use strict";

const { getPgPool } = require("../../db/pg");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  requirePackageFeature,
  attachPackageFeatureLocals,
} = require("../../services/church/churchPackageFeatureGateService");
const {
  renderBranchFeatureGate,
} = require("./packageFeatureGates");
const scheduledReportService = require("../../services/church/scheduledReportService");
const {
  GROWTH_SCHEDULED_REPORTS_MONTHLY,
} = require("../../church/blessBoardPackageCatalogue");
const {
  parseAdminListPageParams,
  buildAdminListPageUrls,
} = require("../../church/adminListPagination");
const {
  branchAdminLocals,
  flashFromQuery,
  SCHEDULED_REPORT_NOTICES,
  noticeMessage,
} = require("./branchAdminShared");

const featureGuard = requirePackageFeature("reports_scheduled", { allowGetUpgradeShell: true });

function parseRecipientTokens(body) {
  const tokens = [];
  if (Array.isArray(body.recipient)) {
    for (const t of body.recipient) tokens.push(String(t));
  } else if (body.recipient) {
    tokens.push(String(body.recipient));
  }
  if (body.recipients) {
    for (const t of String(body.recipients).split(",")) {
      if (t.trim()) tokens.push(t.trim());
    }
  }
  return tokens.map((token) => {
    const [type, id] = String(token).split(":");
    return { recipient_type: type, recipient_id: Number(id) };
  });
}

module.exports = function registerBranchAdminScheduledReportsRoutes(router) {
  router.get(
    "/branch/scheduled-reports",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    featureGuard,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return renderBranchFeatureGate(req, res, "reports_scheduled");
        }
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const schedulePager = parseAdminListPageParams(req.query, { defaultLimit: 50, maxLimit: 100 });
        const [schedulePage, eligible, featureLocals] = await Promise.all([
          scheduledReportService.listSchedulesForBranch(pool, org.id, branch.id, {
            page: schedulePager.page,
            limit: schedulePager.limit,
          }),
          scheduledReportService.listEligibleRecipients(pool, org.id, branch.id),
          attachPackageFeatureLocals(req, "branch"),
        ]);
        const scheduleUrls = buildAdminListPageUrls("/branch/scheduled-reports", req.query, schedulePage);
        return res.render(
          "church/branch-admin/scheduled_reports",
          branchAdminLocals(req, {
            pageTitle: "Scheduled reports",
            navActive: "reports-scheduled",
            shellTitle: "Scheduled reports",
            schedules: schedulePage.rows,
            schedulePagination: {
              page: schedulePage.page,
              limit: schedulePage.limit,
              total: schedulePage.total,
              totalPages: schedulePage.totalPages,
              from: schedulePage.from,
              to: schedulePage.to,
              prevUrl: scheduleUrls.prevUrl,
              nextUrl: scheduleUrls.nextUrl,
            },
            supportedReports: scheduledReportService.listSupportedScheduledReports("branch"),
            eligible,
            frequencies: scheduledReportService.FREQUENCIES,
            formats: scheduledReportService.FORMATS,
            scheduledReportsMonthlyLimit: GROWTH_SCHEDULED_REPORTS_MONTHLY,
            notice: noticeMessage(flashFromQuery(req, SCHEDULED_REPORT_NOTICES)),
            error: null,
            form: {
              report_type: "branch_monthly_summary",
              export_format: "csv",
              frequency: "monthly",
              timezone: org.timezone || "UTC",
              delivery_time_local: "09:00",
              day_of_week: "1",
              day_of_month: "1",
              period_month: "",
            },
            ...featureLocals,
          })
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    "/branch/scheduled-reports",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    featureGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Scheduled reports requires Growth.");
        }
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const admin = req.churchBranchAdmin;
        const body = {
          ...(req.body || {}),
          recipients: parseRecipientTokens(req.body || {}),
        };
        try {
          await scheduledReportService.createSchedule(getPgPool(), {
            organizationId: org.id,
            branchId: branch.id,
            actorType: "branch_admin",
            actorId: admin && admin.admin_id,
            defaultTimezone: org.timezone || "UTC",
            body,
          });
        } catch (err) {
          if (
            err &&
            (err.code === "FOUNDATION_SCHEDULE_FORBIDDEN" ||
              err.code === "VALIDATION" ||
              err.code === "UNAUTHORISED_REPORT" ||
              err.code === "UNAUTHORISED_RECIPIENT")
          ) {
            const eligible = await scheduledReportService.listEligibleRecipients(
              getPgPool(),
              org.id,
              branch.id
            );
            const schedulePage = await scheduledReportService.listSchedulesForBranch(
              getPgPool(),
              org.id,
              branch.id,
              { page: 1, limit: 50 }
            );
            return res.status(400).render(
              "church/branch-admin/scheduled_reports",
              branchAdminLocals(req, {
                pageTitle: "Scheduled reports",
                navActive: "reports-scheduled",
                shellTitle: "Scheduled reports",
                schedules: schedulePage.rows,
                schedulePagination: {
                  page: schedulePage.page,
                  limit: schedulePage.limit,
                  total: schedulePage.total,
                  totalPages: schedulePage.totalPages,
                  from: schedulePage.from,
                  to: schedulePage.to,
                  prevUrl: null,
                  nextUrl: null,
                },
                supportedReports: scheduledReportService.listSupportedScheduledReports("branch"),
                eligible,
                frequencies: scheduledReportService.FREQUENCIES,
                formats: scheduledReportService.FORMATS,
                scheduledReportsMonthlyLimit: GROWTH_SCHEDULED_REPORTS_MONTHLY,
                notice: null,
                error: err.message,
                form: {
                  report_type: body.report_type || "",
                  export_format: body.export_format || "csv",
                  frequency: body.frequency || "monthly",
                  timezone: body.timezone || org.timezone || "UTC",
                  delivery_time_local: body.delivery_time_local || "09:00",
                  day_of_week: body.day_of_week || "1",
                  day_of_month: body.day_of_month || "1",
                  period_month: body.period_month || "",
                },
              })
            );
          }
          throw err;
        }
        return res.redirect(303, "/branch/scheduled-reports?notice=schedule_created");
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    "/branch/scheduled-reports/:scheduleId/status",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    featureGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Scheduled reports requires Growth.");
        }
        const status = String((req.body && req.body.status) || "").trim();
        const scheduleId = Number(req.params.scheduleId);
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const admin = req.churchBranchAdmin;
        try {
          await scheduledReportService.updateScheduleStatus(getPgPool(), {
            scheduleId,
            organizationId: org.id,
            branchId: branch.id,
            status,
            actorType: "branch_admin",
            actorId: admin && admin.admin_id,
          });
        } catch (err) {
          if (err && (err.code === "NOT_FOUND" || err.code === "VALIDATION" || err.code === "FOUNDATION_SCHEDULE_FORBIDDEN")) {
            return res.status(400).type("text").send(err.message);
          }
          throw err;
        }
        const notice =
          status === "enabled"
            ? "schedule_enabled"
            : status === "paused"
              ? "schedule_paused"
              : "schedule_cancelled";
        return res.redirect(303, `/branch/scheduled-reports?notice=${notice}`);
      } catch (err) {
        return next(err);
      }
    }
  );

  router.get(
    "/branch/scheduled-reports/:scheduleId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    featureGuard,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return renderBranchFeatureGate(req, res, "reports_scheduled");
        }
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const scheduleId = Number(req.params.scheduleId);
        const pool = getPgPool();
        const schedule = await scheduledReportService.findScheduleForBranch(
          pool,
          scheduleId,
          org.id,
          branch.id
        );
        if (!schedule || schedule.status === "cancelled") {
          return res.status(404).type("text").send("Schedule not found.");
        }
        const deliveryPager = parseAdminListPageParams(req.query, { defaultLimit: 50, maxLimit: 100 });
        const [recipients, runs, deliveryPage] = await Promise.all([
          scheduledReportService.listRecipientsForSchedule(pool, schedule.id, org.id),
          scheduledReportService.listRunsForSchedule(pool, schedule.id, org.id, { limit: 20 }),
          scheduledReportService.listDeliveriesForSchedule(pool, schedule.id, org.id, {
            page: deliveryPager.page,
            limit: deliveryPager.limit,
          }),
        ]);
        const deliveryUrls = buildAdminListPageUrls(
          `/branch/scheduled-reports/${schedule.id}`,
          req.query,
          deliveryPage
        );
        return res.render(
          "church/branch-admin/scheduled_report_detail",
          branchAdminLocals(req, {
            pageTitle: "Scheduled report",
            navActive: "reports-scheduled",
            shellTitle: "Scheduled report",
            schedule,
            recipients,
            runs,
            deliveries: deliveryPage.rows,
            deliveryPagination: {
              page: deliveryPage.page,
              limit: deliveryPage.limit,
              total: deliveryPage.total,
              totalPages: deliveryPage.totalPages,
              from: deliveryPage.from,
              to: deliveryPage.to,
              prevUrl: deliveryUrls.prevUrl,
              nextUrl: deliveryUrls.nextUrl,
            },
            reportDef: scheduledReportService.getSupportedScheduledReport(schedule.report_type),
            notice: noticeMessage(flashFromQuery(req, SCHEDULED_REPORT_NOTICES)),
          })
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    "/branch/scheduled-reports/runs/:runId/retry",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    featureGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Scheduled reports requires Growth.");
        }
        const org = req.churchContext.organization;
        const runId = Number(req.params.runId);
        const pool = getPgPool();
        const run = await scheduledReportService.findRunForOrganization(pool, runId, org.id);
        if (!run) {
          return res.status(404).type("text").send("Run not found.");
        }
        const schedule = await scheduledReportService.findScheduleForBranch(
          pool,
          run.schedule_id,
          org.id,
          req.churchContext.branch.id
        );
        if (!schedule) {
          return res.status(404).type("text").send("Schedule not found.");
        }
        try {
          await scheduledReportService.retryFailedRun(pool, runId, org.id);
        } catch (err) {
          if (err && (err.code === "INVALID_STATUS" || err.code === "FOUNDATION_SCHEDULE_FORBIDDEN")) {
            return res.status(400).type("text").send(err.message);
          }
          throw err;
        }
        return res.redirect(
          303,
          `/branch/scheduled-reports/${schedule.id}?notice=run_retried`
        );
      } catch (err) {
        return next(err);
      }
    }
  );
};
