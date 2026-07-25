"use strict";

const { getPgPool } = require("../../db/pg");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const givingSummariesRepo = require("../../db/pg/church/givingSummariesRepo");
const { requireChurchHqAdminSession } = require("../../church/hqAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  parseGivingSummaryQuery,
  resolveGivingListState,
  buildGivingOverviewFromSummaries,
  computeSameMonthYoYChange,
  formatGivingMoney,
  formatPeriodMonth,
  givingStatusLabel,
  GIVING_STATUS_FILTERS,
  GIVING_FUND_FIELDS,
  GIVING_RANGE_FILTERS,
} = require("../../church/givingValidation");
const { assertCrossBranchMemberAccess } = require("../../services/church/growthMultiBranchService");
const { hqAdminLocals } = require("./hqAdminShared");

function resolveAllowedBranchId(branchId, branches) {
  if (branchId == null) return null;
  const allowed = (branches || []).some((b) => Number(b.id) === Number(branchId));
  return allowed ? branchId : null;
}

function periodLabel(row) {
  return formatPeriodMonth(row.period_year, row.period_month);
}

module.exports = function registerHqAdminGivingRoutes(router) {
  router.get("/hq/giving-summary", requireChurchBranchHost, requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const org = req.churchContext.organization;
      try {
        assertCrossBranchMemberAccess(org);
      } catch (err) {
        if (err.code === "PACKAGE_REQUIRED") {
          return res.status(403).type("text").send(err.message);
        }
        throw err;
      }

      const pool = getPgPool();
      const branches = await branchesRepo.listBranchesForOrganization(pool, org.id);
      const parsed = parseGivingSummaryQuery(req.query);
      const branchFilterId = resolveAllowedBranchId(parsed.branchId, branches);
      const filters = {
        branchId: branchFilterId,
        status: parsed.status,
        range: parsed.month ? "all" : parsed.range,
        month: parsed.month,
        q: parsed.q,
      };

      let summaries = [];
      let listError = null;
      let allForTrend = [];
      try {
        summaries = await givingSummariesRepo.listGivingSummariesForOrganization(pool, org.id, filters);
        allForTrend = await givingSummariesRepo.listGivingSummariesForOrganization(pool, org.id, {
          branchId: branchFilterId,
        });
      } catch {
        listError = "Giving summaries could not be loaded. Please try again.";
      }

      const totalInScope = await givingSummariesRepo.countGivingSummariesForOrganization(pool, org.id, {
        branchId: branchFilterId,
      });

      const rows = summaries.map((s) => ({
        ...s,
        period_label: periodLabel(s),
        status_label: givingStatusLabel(s.status),
        currency_code: String(s.currency_code || "ZMW").trim().toUpperCase() || "ZMW",
      }));

      const listState = resolveGivingListState(
        {
          q: parsed.q,
          status: parsed.status,
          range: filters.range,
          month: parsed.month,
          branchId: branchFilterId,
        },
        rows,
        { hasSummariesInScope: totalInScope > 0 }
      );

      const overviewBuilt = buildGivingOverviewFromSummaries(rows);
      const now = new Date();
      const yoy = computeSameMonthYoYChange(allForTrend, now.getFullYear(), now.getMonth() + 1);
      const draftCount = allForTrend.filter((r) => r.status === "draft").length;
      const fundBreakdown = GIVING_FUND_FIELDS.map((f) => {
        const amount = overviewBuilt.totalsByFund[f.key] || 0;
        const pct =
          overviewBuilt.grandTotal > 0
            ? Math.round((amount / overviewBuilt.grandTotal) * 1000) / 10
            : 0;
        return { key: f.key, label: f.label, amount, percent: pct };
      }).filter((f) => f.amount > 0 || overviewBuilt.summaryCount > 0);

      return res.render(
        "church/hq/giving_summary",
        hqAdminLocals(req, {
          activeNav: "giving-summary",
          summaries: rows,
          statusFilter: parsed.status,
          rangeFilter: parsed.month ? "all" : parsed.range,
          monthFilter: parsed.month,
          searchQuery: parsed.q,
          givingStatusFilters: GIVING_STATUS_FILTERS,
          givingRangeFilters: GIVING_RANGE_FILTERS,
          givingStatusLabel,
          givingFundFields: GIVING_FUND_FIELDS,
          formatGivingMoney,
          formatMoney: (amount, code) => formatGivingMoney(amount, code || overviewBuilt.currencyCode),
          showForm: false,
          canRecord: false,
          listState,
          listError,
          overview: { ...overviewBuilt, draftCount, yoy, fundBreakdown },
          summaryAction: "/hq/giving-summary",
          summaryDetailBase: "/hq/giving-summary",
          settingsHref: null,
          portalKind: "hq",
          showBranchFilter: branches.length > 1,
          branchOptions: branches,
          branchFilterId,
          error: null,
          form: {},
          notice: null,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/hq/giving-summary/:summaryId",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const org = req.churchContext.organization;
        try {
          assertCrossBranchMemberAccess(org);
        } catch (err) {
          if (err.code === "PACKAGE_REQUIRED") {
            return res.status(403).type("text").send(err.message);
          }
          throw err;
        }
        const summaryId = Number(req.params.summaryId);
        if (!Number.isFinite(summaryId) || summaryId <= 0) {
          return res.status(404).type("text").send("Giving summary not found.");
        }
        const pool = getPgPool();
        const summary = await givingSummariesRepo.findGivingSummaryByIdForOrganization(
          pool,
          summaryId,
          org.id
        );
        if (!summary) {
          return res.status(404).type("text").send("Giving summary not found.");
        }
        const currency = String(summary.currency_code || "ZMW").trim().toUpperCase() || "ZMW";
        return res.render(
          "church/hq/giving_summary_detail",
          hqAdminLocals(req, {
            activeNav: "giving-summary",
            summary: {
              ...summary,
              period_label: periodLabel(summary),
              status_label: givingStatusLabel(summary.status),
              currency_code: currency,
            },
            formatMoney: (amount) => formatGivingMoney(amount, currency),
            readOnly: true,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );
};
