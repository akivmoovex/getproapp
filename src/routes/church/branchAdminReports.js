"use strict";

const { getPgPool } = require("../../db/pg");
const monthlyReportsRepo = require("../../db/pg/church/monthlyReportsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { parsePeriodMonth, formatPeriodMonth } = require("../../church/givingValidation");
const {
  validateMonthlyReportBody,
  reportStatusLabel,
} = require("../../church/monthlyReportValidation");
const monthlyReportsService = require("../../services/church/monthlyReportsService");
const {
  branchAdminLocals,
  flashFromQuery,
  REPORT_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

function formatMoney(amount) {
  const n = Number(amount || 0);
  return n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildFormFromReport(report, periodLabel) {
  if (!report) {
    return { period_month: periodLabel || "" };
  }
  return {
    period_month: report.period_month_label,
    starting_members: report.starting_members,
    new_members: report.new_members,
    transferred_members: report.transferred_members,
    inactive_members: report.inactive_members,
    ending_members: report.ending_members,
    services_held: report.services_held,
    ministry_meetings_held: report.ministry_meetings_held,
    department_meetings_held: report.department_meetings_held,
    outreach_activities: report.outreach_activities,
    special_events: report.special_events,
    ministry_activity_notes: report.ministry_activity_notes,
    main_challenges: report.main_challenges,
    support_needed_from_hq: report.support_needed_from_hq,
  };
}

async function renderSubmitForm(req, res, { periodMonth, error, form, reportId }) {
  const branch = req.churchContext.branch;
  const pool = getPgPool();
  const parsed = parsePeriodMonth(periodMonth) || {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  };
  const ctx = await monthlyReportsService.loadReportPeriodContext(pool, {
    branchId: branch.id,
    organizationId: req.churchContext.organization.id,
    year: parsed.year,
    month: parsed.month,
  });

  if (
    ctx.existingReport &&
    ctx.existingReport.status !== "draft" &&
    ctx.existingReport.status !== "changes_requested" &&
    !reportId
  ) {
    return res.redirect(303, `/branch/reports/${ctx.existingReport.id}`);
  }

  const effectiveReport = reportId
    ? await monthlyReportsRepo.findReportByIdForBranch(pool, reportId, branch.id)
    : ctx.existingReport;

  if (
    effectiveReport &&
    effectiveReport.status !== "draft" &&
    effectiveReport.status !== "changes_requested"
  ) {
    return res.redirect(303, `/branch/reports/${effectiveReport.id}`);
  }

  const effectiveForm = form || buildFormFromReport(effectiveReport, ctx.period_month_label);

  return res.render(
    "church/branch-admin/submit_monthly_report",
    branchAdminLocals(req, {
      form: effectiveForm,
      reportId: effectiveReport ? effectiveReport.id : null,
      periodContext: ctx,
      formatMoney,
      error,
      notice: noticeMessage(flashFromQuery(req, REPORT_NOTICES)),
    })
  );
}

async function handleSaveDraft(req, res, next, reportId) {
  try {
    const forSubmit = false;
    const validation = validateMonthlyReportBody(req.body || {}, { forSubmit });
    const branch = req.churchContext.branch;
    const org = req.churchContext.organization;
    const pool = getPgPool();

    if (!validation.ok) {
      if (reportId) {
        return res.status(400).render(
          "church/branch-admin/report_details",
          branchAdminLocals(req, {
            error: validation.error,
            ...(await loadReportDetailLocals(pool, req, reportId)),
          })
        );
      }
      return renderSubmitForm(req, res, {
        periodMonth: validation.form.period_month,
        error: validation.error,
        form: validation.form,
      });
    }

    const saved = await monthlyReportsService.saveDraftReport(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      ...validation.data,
    });

    await recordBranchAudit(pool, req, {
      action: "monthly_report_draft_saved",
      entityType: "monthly_report",
      entityId: saved.id,
      metadata: { period_month: validation.data.period_month_label, status: "draft" },
    });

    return res.redirect(303, `/branch/reports/${saved.id}?notice=report_draft_saved`);
  } catch (e) {
    if (e.code === "REPORT_LOCKED") {
      const pool = getPgPool();
      const branch = req.churchContext.branch;
      if (reportId) {
        return res.status(403).render(
          "church/branch-admin/report_details",
          branchAdminLocals(req, {
            error: e.message,
            ...(await loadReportDetailLocals(pool, req, reportId)),
          })
        );
      }
      return res.status(403).render(
        "church/branch-admin/submit_monthly_report",
        branchAdminLocals(req, {
          error: e.message,
          form: req.body,
          formatMoney,
        })
      );
    }
    return next(e);
  }
}

async function loadReportDetailLocals(pool, req, reportId) {
  const branch = req.churchContext.branch;
  const report = await monthlyReportsRepo.findReportByIdForBranch(pool, reportId, branch.id);
  if (!report) return { notFound: true };

  const givingSnapshot =
    typeof report.giving_snapshot_json === "string"
      ? JSON.parse(report.giving_snapshot_json || "{}")
      : report.giving_snapshot_json || {};
  const attendanceSnapshot =
    typeof report.attendance_snapshot_json === "string"
      ? JSON.parse(report.attendance_snapshot_json || "{}")
      : report.attendance_snapshot_json || {};

  return {
    report,
    givingSnapshot,
    attendanceSnapshot,
    formatMoney,
    reportStatusLabel,
    notice: noticeMessage(flashFromQuery(req, REPORT_NOTICES)),
    error: null,
    readOnly: report.status !== "draft",
  };
}

module.exports = function registerBranchAdminReportsRoutes(router) {
  router.get("/branch/reports", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const dashboard = await monthlyReportsService.getReportsDashboardData(pool, branch.id);
      return res.render(
        "church/branch-admin/reports_dashboard",
        branchAdminLocals(req, {
          dashboard,
          reportStatusLabel,
          formatMoney,
          notice: noticeMessage(flashFromQuery(req, REPORT_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/reports/new", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const now = new Date();
      const defaultPeriod =
        String(req.query.period_month || "").trim() ||
        formatPeriodMonth(now.getFullYear(), now.getMonth() + 1);
      return renderSubmitForm(req, res, { periodMonth: defaultPeriod, error: null });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/branch/reports", requireChurchBranchHost, requireChurchBranchAdminSession, (req, res, next) =>
    handleSaveDraft(req, res, next, null)
  );

  router.get(
    "/branch/reports/:reportId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const reportId = Number(req.params.reportId);
        if (!Number.isFinite(reportId) || reportId <= 0) {
          return res.status(404).type("text").send("Report not found.");
        }
        const pool = getPgPool();
        const locals = await loadReportDetailLocals(pool, req, reportId);
        if (locals.notFound) {
          return res.status(404).type("text").send("Report not found.");
        }
        return res.render("church/branch-admin/report_details", branchAdminLocals(req, locals));
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/reports/:reportId/save-draft",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    (req, res, next) => {
      const reportId = Number(req.params.reportId);
      if (!Number.isFinite(reportId) || reportId <= 0) {
        return res.status(404).type("text").send("Report not found.");
      }
      req.body.period_month =
        req.body.period_month ||
        String(req.body.period_month_hidden || "").trim();
      return handleSaveDraft(req, res, next, reportId);
    }
  );

  router.post(
    "/branch/reports/:reportId/submit",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const reportId = Number(req.params.reportId);
        if (!Number.isFinite(reportId) || reportId <= 0) {
          return res.status(404).type("text").send("Report not found.");
        }
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const existing = await monthlyReportsRepo.findReportByIdForBranch(pool, reportId, branch.id);
        if (!existing) {
          return res.status(404).type("text").send("Report not found.");
        }
        const mergedBody = { ...buildFormFromReport(existing), ...(req.body || {}) };
        const validation = validateMonthlyReportBody(mergedBody, { forSubmit: true });

        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/report_details",
            branchAdminLocals(req, {
              error: validation.error,
              ...(await loadReportDetailLocals(pool, req, reportId)),
            })
          );
        }

        const submitted = await monthlyReportsService.submitMonthlyReport(pool, {
          reportId,
          branchId: branch.id,
          organizationId: req.churchContext.organization.id,
          adminId: req.churchBranchAdmin.admin_id,
          formData: validation.data,
        });

        await recordBranchAudit(pool, req, {
          action: "monthly_report_submitted",
          entityType: "monthly_report",
          entityId: submitted.id,
          metadata: { period_month: submitted.period_month_label, status: "submitted" },
        });

        return res.redirect(303, `/branch/reports/${submitted.id}?notice=report_submitted`);
      } catch (e) {
        if (e.code === "REPORT_LOCKED" || e.code === "NOT_FOUND") {
          const pool = getPgPool();
          const reportId = Number(req.params.reportId);
          return res.status(e.code === "NOT_FOUND" ? 404 : 403).render(
            "church/branch-admin/report_details",
            branchAdminLocals(req, {
              error: e.message,
              ...(await loadReportDetailLocals(pool, req, reportId)),
            })
          );
        }
        return next(e);
      }
    }
  );
};
