"use strict";

const { getPgPool } = require("../../db/pg");
const { requireChurchHqAdminSession } = require("../../church/hqAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  requirePackageFeature,
  attachPackageFeatureLocals,
} = require("../../services/church/churchPackageFeatureGateService");
const { renderHqFeatureGate } = require("./packageFeatureGates");
const crossBranchComparisonService = require("../../services/church/crossBranchComparisonService");
const { hqAdminLocals } = require("./hqAdminShared");
const branchesRepo = require("../../db/pg/church/branchesRepo");

const featureGuard = requirePackageFeature("reports_cross_branch", { allowGetUpgradeShell: true });

function formatMoney(amount) {
  const n = Number(amount || 0);
  return n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = function registerHqAdminCrossBranchReportsRoutes(router) {
  router.get(
    "/hq/cross-branch-reports",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    featureGuard,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return renderHqFeatureGate(req, res, "reports_cross_branch");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const canViewFinance = await crossBranchComparisonService.hqAdminCanViewFinance(
          pool,
          req.churchHqAdmin.hq_admin_id,
          org.id
        );
        const filters = crossBranchComparisonService.parseFilters(req.query || {});
        const [comparison, branches, featureLocals] = await Promise.all([
          crossBranchComparisonService.loadCrossBranchComparison(pool, {
            organizationId: org.id,
            canViewFinance,
            filters,
          }),
          branchesRepo.listBranchesForOrganization(pool, org.id),
          attachPackageFeatureLocals(req, "hq"),
        ]);
        const ministries = await pool.query(
          `SELECT id, name FROM public.church_ministries
           WHERE organization_id = $1 AND status = 'published'
           ORDER BY name ASC LIMIT 200`,
          [org.id]
        );
        const departments = await pool.query(
          `SELECT id, name FROM public.church_departments
           WHERE organization_id = $1 AND status = 'active'
           ORDER BY name ASC LIMIT 200`,
          [org.id]
        );
        return res.render(
          "church/hq/cross_branch_reports",
          hqAdminLocals(req, {
            pageTitle: "Cross-branch comparison",
            activeNav: "reports-cross-branch",
            comparison,
            filters: comparison.filters,
            canViewFinance,
            branches: (branches || []).filter((b) => b.status === "active"),
            ministries: ministries.rows,
            departments: departments.rows,
            formatMoney,
            viewMode: String(req.query.view || "chart") === "table" ? "table" : "chart",
            ...featureLocals,
          })
        );
      } catch (err) {
        if (err && err.code === "FOUNDATION_CROSS_BRANCH_FORBIDDEN") {
          return res.status(403).type("text").send(err.message);
        }
        return next(err);
      }
    }
  );

  router.get(
    "/hq/cross-branch-reports/branches/:branchId",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    featureGuard,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return renderHqFeatureGate(req, res, "reports_cross_branch");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const branchId = Number(req.params.branchId);
        const canViewFinance = await crossBranchComparisonService.hqAdminCanViewFinance(
          pool,
          req.churchHqAdmin.hq_admin_id,
          org.id
        );
        const filters = crossBranchComparisonService.parseFilters(req.query || {});
        const drill = await crossBranchComparisonService.loadBranchDrillDown(pool, {
          organizationId: org.id,
          branchId,
          canViewFinance,
          filters,
        });
        return res.render(
          "church/hq/cross_branch_report_detail",
          hqAdminLocals(req, {
            pageTitle: "Branch comparison detail",
            activeNav: "reports-cross-branch",
            drill,
            formatMoney,
          })
        );
      } catch (err) {
        if (err && err.code === "NOT_FOUND") {
          return res.status(404).type("text").send(err.message);
        }
        if (err && err.code === "FOUNDATION_CROSS_BRANCH_FORBIDDEN") {
          return res.status(403).type("text").send(err.message);
        }
        return next(err);
      }
    }
  );
};
