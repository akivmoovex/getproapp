"use strict";

const { getPgPool } = require("../../db/pg");
const membersRepo = require("../../db/pg/church/membersRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const attendanceOfflineQueueRepo = require("../../db/pg/church/attendanceOfflineQueueRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const { wantsJson } = require("../../church/churchFailureStates");
const {
  loadPlanForReq,
  requirePackageFeature,
} = require("../../services/church/churchPackageFeatureGateService");
const growthAttendanceRulesService = require("../../services/church/growthAttendanceRulesService");
const growthAttendanceOfflineSyncService = require("../../services/church/growthAttendanceOfflineSyncService");
const {
  validateOfflineBatchBody,
  validateBranchRulesBody,
  validateExemptionBody,
  validateCrossBranchAuthBody,
} = require("../../church/growthAttendanceValidation");
const { branchAdminLocals } = require("./branchAdminShared");

function trustedCtx(req) {
  const branch = req.churchContext.branch;
  const org = req.churchContext.organization;
  const admin = req.churchBranchAdmin;
  const tenant = org.platform_tenant_id || (req.tenant && req.tenant.id);
  return {
    organization_id: org.id,
    branch_id: branch.id,
    platform_tenant_id: Number(tenant),
    admin_id: admin.admin_id,
  };
}

function syncResultSummary(results) {
  const summary = { synced: 0, duplicate: 0, conflict: 0, failed: 0, skipped: 0 };
  for (const r of results || []) {
    if (r.error) {
      summary.failed += 1;
      continue;
    }
    const status = r.queueItem && r.queueItem.sync_status;
    if (r.duplicate || status === "duplicate") summary.duplicate += 1;
    else if (status === "review_required" || r.code === "CONFLICT") summary.conflict += 1;
    else if (r.skipped) summary.skipped += 1;
    else summary.synced += 1;
  }
  return summary;
}

async function handleOfflineSyncPost(req, res, next) {
  try {
    if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
      const { renderChurchFailureState } = require("../../church/churchFailureStates");
      return renderChurchFailureState(req, res, "package_restricted", {
        message: "Offline attendance requires Growth.",
      });
    }
    const validated = validateOfflineBatchBody(req.body);
    if (!validated.ok) {
      if (wantsJson(req)) return res.status(400).json({ ok: false, error: validated.error });
      return res.status(400).type("text").send(validated.error);
    }
    const pool = getPgPool();
    const ctx = trustedCtx(req);
    const results = await growthAttendanceOfflineSyncService.submitOfflineBatch(
      pool,
      ctx,
      validated.items
    );
    const summary = syncResultSummary(results);
    if (wantsJson(req)) {
      return res.status(200).json({ ok: true, summary, results });
    }
    return res.redirect(303, `/branch/attendance-offline?synced=${summary.synced}&conflicts=${summary.conflict}`);
  } catch (e) {
    return next(e);
  }
}

module.exports = function registerBranchAdminGrowthAttendanceRoutes(router) {
  const offlineGuard = requirePackageFeature("attendance_offline", { allowGetUpgradeShell: true });
  const rulesGuard = requirePackageFeature("attendance_custom_rules", { allowGetUpgradeShell: true });

  router.get(
    "/branch/attendance-offline",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    offlineGuard,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          const { renderBranchFeatureGate } = require("./packageFeatureGates");
          return renderBranchFeatureGate(req, res, "attendance_offline");
        }
        const pool = getPgPool();
        const ctx = trustedCtx(req);
        const counts = await attendanceOfflineQueueRepo.countQueueByStatusForBranch(pool, ctx.branch_id);
        const recent = await attendanceOfflineQueueRepo.listQueueItemsForBranch(pool, ctx.branch_id, {
          statuses: ["pending", "failed", "review_required", "conflict", "synced", "duplicate"],
          limit: 30,
        });
        return res.render(
          "church/branch-admin/attendance_offline",
          branchAdminLocals(req, {
            navActive: "attendance-offline",
            queueCounts: counts,
            recentQueue: recent,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/attendance-offline",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    offlineGuard,
    requireChurchSessionCsrf,
    handleOfflineSyncPost
  );

  router.post(
    "/branch/attendance-offline/sync",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    offlineGuard,
    requireChurchSessionCsrf,
    handleOfflineSyncPost
  );

  router.post(
    "/branch/attendance-offline/retry",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    offlineGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Offline attendance requires Growth.");
        }
        const pool = getPgPool();
        const ctx = trustedCtx(req);
        const results = await growthAttendanceOfflineSyncService.retryFailedQueueItems(pool, ctx);
        if (wantsJson(req)) {
          return res.status(200).json({ ok: true, results, summary: syncResultSummary(results) });
        }
        return res.redirect(303, "/branch/attendance-offline?retried=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/attendance-rules",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    rulesGuard,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          const { renderBranchFeatureGate } = require("./packageFeatureGates");
          return renderBranchFeatureGate(req, res, "attendance_custom_rules");
        }
        const pool = getPgPool();
        const ctx = trustedCtx(req);
        const dashboard = await growthAttendanceRulesService.loadRulesDashboard(
          pool,
          ctx.branch_id,
          ctx.organization_id
        );
        const members = await membersRepo.listVerifiedMembersForBranch(pool, ctx.branch_id);
        const siblingBranches = await branchesRepo.listBranchesForOrganization(pool, ctx.organization_id);
        return res.render(
          "church/branch-admin/attendance_rules",
          branchAdminLocals(req, {
            navActive: "attendance-rules",
            rulesForm: dashboard.rules,
            exemptions: dashboard.exemptions,
            reviewQueue: dashboard.reviewQueue,
            absenceFlags: dashboard.absenceFlags,
            crossBranchComparison: dashboard.crossBranchComparison,
            periodLabel: dashboard.periodLabel,
            members,
            siblingBranches: siblingBranches.filter((b) => Number(b.id) !== Number(ctx.branch_id)),
            notice: req.query.saved ? "Rules saved." : req.query.exemption ? "Exemption added." : null,
            error: null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/attendance-rules",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    rulesGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Attendance rules require Growth.");
        }
        const validated = validateBranchRulesBody(req.body);
        if (!validated.ok) {
          return res.status(400).type("text").send(validated.error);
        }
        const pool = getPgPool();
        await growthAttendanceRulesService.saveBranchRules(pool, trustedCtx(req), validated.data);
        return res.redirect(303, "/branch/attendance-rules?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/attendance-rules/exemptions",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    rulesGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Attendance rules require Growth.");
        }
        const validated = validateExemptionBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const pool = getPgPool();
        await growthAttendanceRulesService.addMemberExemption(pool, trustedCtx(req), validated.data);
        return res.redirect(303, "/branch/attendance-rules?exemption=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/attendance-rules/cross-branch-auth",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    rulesGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Attendance rules require Growth.");
        }
        const validated = validateCrossBranchAuthBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const pool = getPgPool();
        await growthAttendanceRulesService.authorizeCrossBranchGuest(pool, trustedCtx(req), validated.data);
        return res.redirect(303, "/branch/attendance-rules?auth=1");
      } catch (e) {
        if (e.code === "RULES_DISABLED" || e.code === "NOT_FOUND") {
          return res.status(400).type("text").send(e.message);
        }
        return next(e);
      }
    }
  );
};
