"use strict";

const { getPgPool } = require("../../db/pg");
const givingSummariesRepo = require("../../db/pg/church/givingSummariesRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  validateGivingSummaryBody,
  formatPeriodMonth,
  givingGrandTotal,
} = require("../../church/givingValidation");
const {
  branchAdminLocals,
  flashFromQuery,
  GIVING_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

function formatMoney(amount) {
  const n = Number(amount || 0);
  return n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function periodLabel(row) {
  return formatPeriodMonth(row.period_year, row.period_month);
}

module.exports = function registerBranchAdminGivingRoutes(router) {
  router.get("/branch/giving-summary", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const summaries = await givingSummariesRepo.listGivingSummariesForBranch(pool, branch.id);
      const now = new Date();
      const defaultPeriod = formatPeriodMonth(now.getFullYear(), now.getMonth() + 1);
      return res.render(
        "church/branch-admin/giving_summary",
        branchAdminLocals(req, {
          summaries: summaries.map((s) => ({ ...s, period_label: periodLabel(s) })),
          error: null,
          form: { period_month: defaultPeriod },
          formatMoney,
          notice: noticeMessage(flashFromQuery(req, GIVING_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post(
    "/branch/giving-summary",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const validation = validateGivingSummaryBody(req.body || {});
        const branch = req.churchContext.branch;
        const org = req.churchContext.organization;
        const pool = getPgPool();

        if (!validation.ok) {
          const summaries = await givingSummariesRepo.listGivingSummariesForBranch(pool, branch.id);
          return res.status(400).render(
            "church/branch-admin/giving_summary",
            branchAdminLocals(req, {
              summaries: summaries.map((s) => ({ ...s, period_label: periodLabel(s) })),
              error: validation.error,
              form: validation.form,
              formatMoney,
              notice: null,
            })
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
        const summary = await givingSummariesRepo.findGivingSummaryByIdForBranch(pool, summaryId, branch.id);
        if (!summary) {
          return res.status(404).type("text").send("Giving summary not found.");
        }
        return res.render(
          "church/branch-admin/giving_summary_detail",
          branchAdminLocals(req, {
            summary: { ...summary, period_label: periodLabel(summary) },
            formatMoney,
            notice: noticeMessage(flashFromQuery(req, GIVING_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );
};
