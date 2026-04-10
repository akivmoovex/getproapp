/**
 * Field Agent analytics (read-only aggregates from submission / callback / agent tables).
 */
const { canAccessCrm } = require("../../auth/roles");
const { getAdminTenantId } = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const fieldAgentAnalyticsRepo = require("../../db/pg/fieldAgentAnalyticsRepo");

module.exports = function registerAdminFieldAgentAnalyticsRoutes(router) {
  function requireCrmAccess(req, res, next) {
    if (!req.session.adminUser) return res.redirect("/admin/login");
    if (!canAccessCrm(req.session.adminUser.role)) {
      return res.status(403).type("text").send("CRM is not available for your role.");
    }
    return next();
  }

  router.get("/field-agent-analytics", requireCrmAccess, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const q = req.query || {};
      const from = q.from != null ? String(q.from).trim() : "";
      const to = q.to != null ? String(q.to).trim() : "";
      const agentRaw = q.agent != null ? String(q.agent).trim() : "";
      const fieldAgentId = agentRaw && Number(agentRaw) > 0 ? Number(agentRaw) : null;
      const trendDays = Math.min(Math.max(Number(q.days) || 30, 7), 90);

      const dateOpts =
        from || to
          ? { from: from || null, to: to || null, fieldAgentId }
          : { fieldAgentId };

      const summary = await fieldAgentAnalyticsRepo.getSubmissionSummaryForTenant(pool, tid, dateOpts);
      const decided = summary.approved + summary.rejected;
      const summaryRates = {
        approval_rate_decided: decided > 0 ? summary.approved / decided : null,
        approval_rate_total: summary.total > 0 ? summary.approved / summary.total : null,
      };

      const agents = await fieldAgentAnalyticsRepo.listFieldAgentsForTenant(pool, tid);
      const breakdown = await fieldAgentAnalyticsRepo.getPerAgentBreakdown(pool, tid, {
        from: from || null,
        to: to || null,
      });

      const submissionsByDay = await fieldAgentAnalyticsRepo.getSubmissionsPerDay(pool, tid, trendDays, fieldAgentId);
      const callbacksByDay = await fieldAgentAnalyticsRepo.getCallbackLeadsPerDay(pool, tid, trendDays, fieldAgentId);

      return res.render("admin/field_agent_analytics", {
        activeNav: "field_agent_analytics",
        summary: { ...summary, ...summaryRates },
        agents,
        breakdown,
        submissionsByDay,
        callbacksByDay,
        filters: {
          from: from || "",
          to: to || "",
          agent: fieldAgentId,
          days: trendDays,
        },
      });
    } catch (e) {
      return next(e);
    }
  });
};
