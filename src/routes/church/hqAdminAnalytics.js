"use strict";

const { getPgPool } = require("../../db/pg");
const hqAnalyticsRepo = require("../../db/pg/church/hqAnalyticsRepo");
const { requireChurchHqAdminSession } = require("../../church/hqAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  parseAnalyticsPeriods,
  givingStatusLabel,
  reportStatusLabel,
  healthBadgeClass,
  formatMoney,
} = require("../../church/hqAnalyticsValidation");
const { hqAdminLocals } = require("./hqAdminShared");
const churchPlanService = require("../../services/church/churchPlanService");

function renderAnalyticsLocals(req, analytics, extra) {
  return hqAdminLocals(req, {
    analytics,
    periodMonth: analytics.period.label,
    compareMonth: analytics.comparePeriod.label,
    givingStatusLabel,
    reportStatusLabel,
    healthBadgeClass,
    formatMoney,
    ...(extra || {}),
  });
}

module.exports = function registerHqAdminAnalyticsRoutes(router) {
  router.get("/hq/analytics", requireChurchBranchHost, requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const { period, compare } = parseAnalyticsPeriods(req.query);
      const analytics = await hqAnalyticsRepo.getConsolidatedAnalytics(pool, org.id, period, compare);
      const planContext = await churchPlanService.loadPlanContextForOrganization(pool, org.id);
      return res.render("church/hq/analytics", renderAnalyticsLocals(req, analytics, {
        planContext,
        premiumNotice: planContext ? planContext.premiumAnalyticsNotice : null,
      }));
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/hq/analytics/branches",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const { period, compare } = parseAnalyticsPeriods(req.query);
        const analytics = await hqAnalyticsRepo.getConsolidatedAnalytics(pool, org.id, period, compare);
        const planContext = await churchPlanService.loadPlanContextForOrganization(pool, org.id);
        return res.render(
          "church/hq/analytics",
          renderAnalyticsLocals(req, analytics, {
            focusSection: "branch-health",
            planContext,
            premiumNotice: planContext ? planContext.premiumAnalyticsNotice : null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );
};
