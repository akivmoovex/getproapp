"use strict";

const { getPgPool } = require("../../db/pg");
const hqBranchesRepo = require("../../db/pg/church/hqBranchesRepo");
const { requireChurchHqAdminSession } = require("../../church/hqAuth");
const { requireChurchBranchHost } = require("./auth");
const { reportStatusLabel } = require("../../church/monthlyReportValidation");
const {
  REGISTRY_FILTERS,
  parsePeriodMonth,
  formatBranchLocation,
} = require("../../church/hqBranchRegistryValidation");
const { hqAdminLocals } = require("./hqAdminShared");
const { resolveBranchLifecycle } = require("../../church/branchLifecycle");
const {
  organisationAllowsBranchPaths,
  buildPublicBranchAbsoluteUrl,
  branchPathSlug,
} = require("../../services/church/branchPathRoutingService");
const branchesRepo = require("../../db/pg/church/branchesRepo");

function formatMoney(amount) {
  const n = Number(amount || 0);
  return n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function givingStatusLabel(status) {
  const map = {
    draft: "Draft",
    submitted: "Submitted",
    included_in_monthly_report: "Included in report",
    linked_in_report: "Linked in report",
    not_started: "Not started",
  };
  return map[status] || status;
}

module.exports = function registerHqAdminBranchesRoutes(router) {
  router.get("/hq/branches/switch-preview", requireChurchBranchHost, requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const org = req.churchContext.organization;
      const hostBranch = req.churchContext.hostBranch || req.churchContext.branch;
      const branchId = Number(req.query.branch_id);
      if (!Number.isFinite(branchId) || branchId <= 0) {
        return res.redirect(303, "/hq/branches");
      }
      const pool = getPgPool();
      const target = await hqBranchesRepo.findBranchByIdForOrganization(pool, branchId, org.id);
      if (!target) {
        return res.status(404).type("text").send("Branch not found.");
      }
      const url = buildPublicBranchAbsoluteUrl(hostBranch, target, "home");
      if (!url) {
        return res.redirect(303, "/hq/branches");
      }
      return res.redirect(303, url);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/hq/branches", requireChurchBranchHost, requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const period = parsePeriodMonth(req.query.period_month);
      const filter = String(req.query.status || "all").trim();
      const statusFilter = REGISTRY_FILTERS.includes(filter) ? filter : "all";
      const q = String(req.query.q || "").trim();
      const branches = await hqBranchesRepo.listBranchRegistryForOrganization(pool, org.id, {
        year: period.year,
        month: period.month,
        filter: statusFilter,
        q,
      });
      const branchesWithLifecycle = (branches || []).map((b) => ({
        ...b,
        lifecycle: resolveBranchLifecycle(b),
      }));
      const hostBranch = req.churchContext.hostBranch || req.churchContext.branch;
      const pathRouting = organisationAllowsBranchPaths(org);
      const siblingBranches = pathRouting
        ? await branchesRepo.listBranchesForOrganization(pool, org.id)
        : [];
      return res.render(
        "church/hq/branches_registry",
        hqAdminLocals(req, {
          branches: branchesWithLifecycle,
          statusFilter,
          registryFilters: REGISTRY_FILTERS,
          searchQuery: q,
          periodMonth: period.label,
          reportStatusLabel,
          givingStatusLabel,
          formatBranchLocation,
          hostBranch,
          pathRoutingEnabled: pathRouting,
          hqBranchSwitcher: siblingBranches.filter((b) => b.status === "active"),
          buildPublicBranchUrl(target) {
            return buildPublicBranchAbsoluteUrl(hostBranch, target, "home") || "#";
          },
          branchPathSlug,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/hq/branches/:branchId",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const branchId = Number(req.params.branchId);
        if (!Number.isFinite(branchId) || branchId <= 0) {
          return res.status(404).type("text").send("Branch not found.");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const period = parsePeriodMonth(req.query.period_month);
        const performance = await hqBranchesRepo.getBranchPerformanceSummary(
          pool,
          org.id,
          branchId,
          period
        );
        if (!performance) {
          return res.status(404).type("text").send("Branch not found.");
        }
        return res.render(
          "church/hq/branch_performance",
          hqAdminLocals(req, {
            performance,
            periodMonth: period.label,
            reportStatusLabel,
            givingStatusLabel,
            formatMoney,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/hq/branches/:branchId/reports",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const branchId = Number(req.params.branchId);
        if (!Number.isFinite(branchId) || branchId <= 0) {
          return res.status(404).type("text").send("Branch not found.");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const branch = await hqBranchesRepo.findBranchByIdForOrganization(pool, branchId, org.id);
        if (!branch) {
          return res.status(404).type("text").send("Branch not found.");
        }
        const period = parsePeriodMonth(req.query.period_month);
        return res.redirect(303, `/hq/branches/${branchId}?period_month=${period.label}#reports-summary`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
