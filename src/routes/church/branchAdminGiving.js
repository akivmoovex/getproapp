"use strict";

const { getPgPool } = require("../../db/pg");
const givingSummariesRepo = require("../../db/pg/church/givingSummariesRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  validateGivingSummaryBody,
  formatPeriodMonth,
  givingGrandTotal,
  parseGivingSummaryQuery,
  resolveGivingListState,
  buildGivingOverviewFromSummaries,
  computeSameMonthYoYChange,
  formatGivingMoney,
  givingStatusLabel,
  GIVING_STATUS_FILTERS,
  GIVING_FUND_FIELDS,
  GIVING_RANGE_FILTERS,
} = require("../../church/givingValidation");
const {
  branchAdminLocals,
  flashFromQuery,
  GIVING_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

function periodLabel(row) {
  return formatPeriodMonth(row.period_year, row.period_month);
}

function mapSummaryRows(summaries) {
  return (summaries || []).map((s) => ({
    ...s,
    period_label: periodLabel(s),
    status_label: givingStatusLabel(s.status),
    currency_code: String(s.currency_code || "ZMW").trim().toUpperCase() || "ZMW",
  }));
}

async function loadSummaryLocals(req, extras = {}) {
  const branch = req.churchContext.branch;
  const pool = getPgPool();
  const parsed = extras.parsed || parseGivingSummaryQuery(req.query);
  const filters = {
    status: parsed.status,
    range: parsed.month ? "all" : parsed.range,
    month: parsed.month,
    q: parsed.q,
  };

  let summaries = [];
  let listError = null;
  let allForTrend = [];
  try {
    summaries = await givingSummariesRepo.listGivingSummariesForBranch(pool, branch.id, filters);
    allForTrend = await givingSummariesRepo.listGivingSummariesForBranch(pool, branch.id, {});
  } catch {
    listError = "Giving summaries could not be loaded. Please try again.";
  }

  const rows = mapSummaryRows(summaries);
  const hasInScope = allForTrend.length > 0;
  const listState = resolveGivingListState(
    { q: parsed.q, status: parsed.status, range: filters.range, month: parsed.month },
    rows,
    { hasSummariesInScope: hasInScope }
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

  const nowDefault = formatPeriodMonth(now.getFullYear(), now.getMonth() + 1);

  return {
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
    showForm: Boolean(parsed.showForm || extras.forceShowForm),
    canRecord: true,
    listState,
    listError: extras.listError || listError,
    overview: {
      ...overviewBuilt,
      draftCount,
      yoy,
      fundBreakdown,
    },
    summaryAction: "/branch/giving-summary",
    summaryDetailBase: "/branch/giving-summary",
    settingsHref: "/branch/giving-settings",
    portalKind: "branch",
    showBranchFilter: false,
    branchOptions: [],
    branchFilterId: null,
    error: extras.error != null ? extras.error : null,
    form: extras.form || { period_month: nowDefault },
    notice:
      extras.notice !== undefined
        ? extras.notice
        : noticeMessage(flashFromQuery(req, GIVING_NOTICES)),
  };
}

module.exports = function registerBranchAdminGivingRoutes(router) {
  router.get("/branch/giving-summary", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const locals = await loadSummaryLocals(req);
      return res.render("church/branch-admin/giving_summary", branchAdminLocals(req, locals));
    } catch (e) {
      return next(e);
    }
  });

  router.post(
    "/branch/giving-summary",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validation = validateGivingSummaryBody(req.body || {});
        const branch = req.churchContext.branch;
        const org = req.churchContext.organization;
        const pool = getPgPool();

        if (!validation.ok) {
          const locals = await loadSummaryLocals(req, {
            error: validation.error,
            form: validation.form,
            forceShowForm: true,
            notice: null,
          });
          return res.status(400).render(
            "church/branch-admin/giving_summary",
            branchAdminLocals(req, locals)
          );
        }

        const saved = await givingSummariesRepo.upsertGivingSummaryForBranchPeriod(pool, {
          organization_id: org.id,
          branch_id: branch.id,
          period_year: validation.data.period_year,
          period_month: validation.data.period_month,
          tithes_total: validation.data.tithes_total,
          offerings_total: validation.data.offerings_total,
          building_fund_total: validation.data.building_fund_total,
          missions_fund_total: validation.data.missions_fund_total,
          special_offerings_total: validation.data.special_offerings_total,
          other_giving_total: validation.data.other_giving_total,
          notes: validation.data.notes,
          status: validation.status,
          created_by_admin_id: req.churchBranchAdmin.admin_id,
        });

        await recordBranchAudit(pool, req, {
          action: validation.status === "submitted" ? "giving_summary_submitted" : "giving_summary_created",
          entityType: "giving_summary",
          entityId: saved.id,
          metadata: {
            period: validation.data.period_month_label,
            total: givingGrandTotal(saved),
          },
        });

        const notice = validation.status === "submitted" ? "giving_submitted" : "giving_saved";
        return res.redirect(303, `/branch/giving-summary/${saved.id}?notice=${notice}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/giving-summary/:summaryId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const summaryId = Number(req.params.summaryId);
        if (!Number.isFinite(summaryId) || summaryId <= 0) {
          return res.status(404).type("text").send("Giving summary not found.");
        }
        const pool = getPgPool();
        const summary = await givingSummariesRepo.findGivingSummaryByIdForBranch(
          pool,
          summaryId,
          branch.id
        );
        if (!summary) {
          return res.status(404).type("text").send("Giving summary not found.");
        }
        const currency = String(summary.currency_code || "ZMW").trim().toUpperCase() || "ZMW";
        return res.render(
          "church/branch-admin/giving_summary_detail",
          branchAdminLocals(req, {
            summary: {
              ...summary,
              period_label: periodLabel(summary),
              status_label: givingStatusLabel(summary.status),
              currency_code: currency,
            },
            formatMoney: (amount) => formatGivingMoney(amount, currency),
            formatGivingMoney,
            notice: noticeMessage(flashFromQuery(req, GIVING_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );
};
