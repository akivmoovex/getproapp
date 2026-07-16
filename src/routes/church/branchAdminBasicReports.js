"use strict";

const { getPgPool } = require("../../db/pg");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  branchAdminLocals,
  flashFromQuery,
  recordBranchAudit,
} = require("./branchAdminShared");
const foundationBasicReportService = require("../../services/church/foundationBasicReportService");
const {
  buildExportPayload,
  renderFoundationBasicReportExport,
} = require("../../church/foundationBasicReportExport");
const {
  FOUNDATION_BASIC_REPORT_KPI_DEFINITIONS,
} = require("../../church/foundationBasicReportKpiDefinitions");

function formatMoney(amount) {
  const n = Number(amount || 0);
  return n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function filterQueryString(filters) {
  const q = new URLSearchParams();
  if (filters.dateFrom) q.set("date_from", filters.dateFrom);
  if (filters.dateTo) q.set("date_to", filters.dateTo);
  if (filters.serviceType) q.set("service", filters.serviceType);
  if (filters.ministryId) q.set("ministry_id", String(filters.ministryId));
  return q.toString();
}

module.exports = function registerBranchAdminBasicReportsRoutes(router) {
  router.get(
    "/branch/reports/basic",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const admin = req.churchBranchAdmin;
        const pool = getPgPool();
        const perms = await foundationBasicReportService.resolveReportPermissions(pool, {
          organizationId: org.id,
          branchId: branch.id,
          adminId: admin.admin_id,
        });
        const report = await foundationBasicReportService.loadFoundationBasicReport(pool, {
          organizationId: org.id,
          branchId: branch.id,
          query: req.query,
          canViewFinance: perms.canViewFinance,
        });
        return res.render(
          "church/branch-admin/basic_reports",
          branchAdminLocals(req, {
            report,
            canViewFinance: perms.canViewFinance,
            canExportReports: perms.canExportReports,
            exportMaxRows: perms.exportMaxRows,
            formatMoney,
            filterQueryString,
            notice: flashFromQuery(req),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/reports/basic/drill-down/:kpiId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const kpiId = String(req.params.kpiId || "").trim();
        const def = FOUNDATION_BASIC_REPORT_KPI_DEFINITIONS[kpiId];
        if (!def) {
          return res.status(404).type("text").send("Metric not found.");
        }
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const admin = req.churchBranchAdmin;
        const pool = getPgPool();
        const perms = await foundationBasicReportService.resolveReportPermissions(pool, {
          organizationId: org.id,
          branchId: branch.id,
          adminId: admin.admin_id,
        });
        const drillDown = await foundationBasicReportService.loadKpiDrillDown(pool, {
          organizationId: org.id,
          branchId: branch.id,
          kpiId,
          query: req.query,
          canViewFinance: perms.canViewFinance,
          exportMaxRows: perms.exportMaxRows,
        });
        const report = await foundationBasicReportService.loadFoundationBasicReport(pool, {
          organizationId: org.id,
          branchId: branch.id,
          filters: drillDown.filters,
          canViewFinance: perms.canViewFinance,
        });
        return res.render(
          "church/branch-admin/basic_report_drill_down",
          branchAdminLocals(req, {
            drillDown,
            reportKpiValue: report.kpis[kpiId],
            canViewFinance: perms.canViewFinance,
            formatMoney,
            filterQueryString,
          })
        );
      } catch (e) {
        if (e.code === "FINANCE_FORBIDDEN") {
          return res.status(403).type("text").send(e.message);
        }
        if (e.code === "UNKNOWN_KPI") {
          return res.status(404).type("text").send(e.message);
        }
        return next(e);
      }
    }
  );

  async function handleExport(req, res, next, format) {
    try {
      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const admin = req.churchBranchAdmin;
      const pool = getPgPool();
      const perms = await foundationBasicReportService.resolveReportPermissions(pool, {
        organizationId: org.id,
        branchId: branch.id,
        adminId: admin.admin_id,
      });
      if (!perms.canExportReports) {
        return res.status(403).type("text").send("Report export requires export permission.");
      }

      const report = await foundationBasicReportService.loadFoundationBasicReport(pool, {
        organizationId: org.id,
        branchId: branch.id,
        query: req.query,
        canViewFinance: perms.canViewFinance,
      });

      const drillDowns = [];
      let totalDetailRows = 0;
      for (const kpiId of report.kpiOrder) {
        if (kpiId === "giving_totals" && !perms.canViewFinance) continue;
        const def = FOUNDATION_BASIC_REPORT_KPI_DEFINITIONS[kpiId];
        if (!def?.drillDown) continue;
        const block = await foundationBasicReportService.loadKpiDrillDown(pool, {
          organizationId: org.id,
          branchId: branch.id,
          kpiId,
          filters: report.filters,
          canViewFinance: perms.canViewFinance,
          exportMaxRows: perms.exportMaxRows,
        });
        totalDetailRows += block.rows.length;
        if (block.totalCount > perms.exportMaxRows) {
          const err = new Error(
            `Export exceeds the ${perms.exportMaxRows}-row limit for ${def.label}. Narrow your date filters.`
          );
          err.code = "EXPORT_ROW_LIMIT";
          throw err;
        }
        drillDowns.push(block);
      }

      const payload = buildExportPayload(report, drillDowns, perms.canViewFinance);
      const body = renderFoundationBasicReportExport(payload, format);
      const ext = format === "pdf" ? "pdf" : "csv";
      const filename = `foundation-basic-report-${branch.id}-${report.filters.dateFrom}-${report.filters.dateTo}.${ext}`;

      await recordBranchAudit(pool, req, {
        action: "foundation_basic_report_exported",
        entityType: "foundation_basic_report",
        entityId: branch.id,
        metadata: {
          format: ext,
          date_from: report.filters.dateFrom,
          date_to: report.filters.dateTo,
          row_count: payload.rows.length,
          detail_rows: totalDetailRows,
          export_max_rows: perms.exportMaxRows,
        },
      });

      res.setHeader("Content-Type", format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(body);
    } catch (e) {
      if (e.code === "EXPORT_ROW_LIMIT" || e.code === "FINANCE_FORBIDDEN") {
        return res.status(413).type("text").send(e.message);
      }
      return next(e);
    }
  }

  router.get(
    "/branch/reports/basic/export.csv",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    (req, res, next) => handleExport(req, res, next, "csv")
  );

  router.get(
    "/branch/reports/basic/export.pdf",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    (req, res, next) => handleExport(req, res, next, "pdf")
  );
};
