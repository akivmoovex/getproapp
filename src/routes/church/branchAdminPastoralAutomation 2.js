"use strict";

const { getPgPool } = require("../../db/pg");
const pastoralAutomationRepo = require("../../db/pg/church/pastoralAutomationRepo");
const branchAdminsRepo = require("../../db/pg/church/branchAdminsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requirePastoralAccess } = require("../../church/foundationPastoralAccess");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  loadPlanForReq,
  requirePackageFeature,
} = require("../../services/church/churchPackageFeatureGateService");
const growthPastoralAutomationService = require("../../services/church/growthPastoralAutomationService");
const foundationPastoralCareService = require("../../services/church/foundationPastoralCareService");
const {
  validateAutomationSettingsBody,
  validateReassignBody,
  validatePauseBody,
} = require("../../church/growthPastoralAutomationValidation");
const { branchAdminLocals, recordBranchAudit } = require("./branchAdminShared");

function automationCtx(req) {
  const base = foundationPastoralCareService.trustedCtx(req);
  return {
    ...base,
    can_supervise_pastoral: Boolean(req.churchBranchAdmin && req.churchBranchAdmin.can_supervise_pastoral),
  };
}

module.exports = function registerBranchAdminPastoralAutomationRoutes(router) {
  const automationGuard = requirePackageFeature("care_automation", { allowGetUpgradeShell: true });

  router.get(
    "/branch/pastoral-automation",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    automationGuard,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          const { renderBranchFeatureGate } = require("./packageFeatureGates");
          return renderBranchFeatureGate(req, res, "care_automation");
        }
        const pool = getPgPool();
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const dashboard = await growthPastoralAutomationService.loadAutomationDashboard(
          pool,
          automationCtx(req),
          plan
        );
        const pastoralAdmins = await pool.query(
          `SELECT id, full_name, can_supervise_pastoral
           FROM public.church_branch_admins
           WHERE branch_id = $1 AND status = 'active' AND can_access_pastoral = true
           ORDER BY full_name ASC`,
          [req.churchContext.branch.id]
        );
        return res.render(
          "church/branch-admin/pastoral_automation",
          branchAdminLocals(req, {
            navActive: "pastoral-automation",
            settingsForm: dashboard.settings,
            workItems: dashboard.workItems,
            overdueCases: dashboard.overdue,
            workload: dashboard.workload,
            branchComparison: dashboard.branchComparison,
            pastoralAdmins: pastoralAdmins.rows,
            notice: req.query.saved ? "Settings saved." : req.query.ran ? "Scan completed." : null,
          })
        );
      } catch (e) {
        if (e.code === growthPastoralAutomationService.AUTOMATION_ERRORS.PACKAGE_REQUIRED) {
          return res.status(403).type("text").send(e.message);
        }
        return next(e);
      }
    }
  );

  router.post(
    "/branch/pastoral-automation/settings",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    automationGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          const { renderChurchFailureState } = require("../../church/churchFailureStates");
          return renderChurchFailureState(req, res, "package_restricted", {
            message: "Pastoral automation requires Growth.",
          });
        }
        const validated = validateAutomationSettingsBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const ctx = automationCtx(req);
        await pastoralAutomationRepo.upsertSettings(getPgPool(), {
          organization_id: ctx.organization_id,
          branch_id: ctx.branch_id,
          ...validated.data,
          updated_by_admin_id: ctx.admin_id,
        });
        return res.redirect(303, "/branch/pastoral-automation?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/pastoral-automation/run-scan",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    automationGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          const { renderChurchFailureState } = require("../../church/churchFailureStates");
          return renderChurchFailureState(req, res, "package_restricted", {
            message: "Pastoral automation requires Growth.",
          });
        }
        const pool = getPgPool();
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const result = await growthPastoralAutomationService.runMissedServiceScan(
          pool,
          automationCtx(req),
          plan
        );
        await recordBranchAudit(pool, req, {
          action: "pastoral_automation_scan",
          entityType: "pastoral_automation_run",
          entityId: result.run ? result.run.id : null,
          metadata: { stats: result.stats || {}, duplicate_run: result.duplicateRun === true },
        });
        return res.redirect(303, "/branch/pastoral-automation?ran=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/pastoral-automation/work-items/:workItemId/accept",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    automationGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const workItemId = Number(req.params.workItemId);
        const result = await growthPastoralAutomationService.acceptWorkItem(
          pool,
          automationCtx(req),
          plan,
          workItemId
        );
        return res.redirect(303, `/branch/pastoral-cases/${result.pastoralCase.id}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/pastoral-automation/work-items/:workItemId/dismiss",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    automationGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthPastoralAutomationService.dismissWorkItem(
          pool,
          automationCtx(req),
          plan,
          Number(req.params.workItemId)
        );
        return res.redirect(303, "/branch/pastoral-automation");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/pastoral-cases/:caseId/supervisor-ack",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    automationGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const caseId = Number(req.params.caseId);
        await growthPastoralAutomationService.supervisorAcknowledgeCase(
          pool,
          automationCtx(req),
          plan,
          caseId
        );
        return res.redirect(303, `/branch/pastoral-cases/${caseId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/pastoral-cases/:caseId/reassign",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    automationGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateReassignBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const pool = getPgPool();
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const caseId = Number(req.params.caseId);
        await growthPastoralAutomationService.reassignCase(
          pool,
          automationCtx(req),
          plan,
          caseId,
          validated.assigneeId
        );
        return res.redirect(303, `/branch/pastoral-cases/${caseId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/pastoral-cases/:caseId/escalate",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    automationGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const caseId = Number(req.params.caseId);
        const targetId = Number(req.body && req.body.escalated_to_admin_id);
        await growthPastoralAutomationService.escalateCase(
          pool,
          automationCtx(req),
          plan,
          caseId,
          Number.isFinite(targetId) && targetId > 0 ? targetId : null
        );
        return res.redirect(303, `/branch/pastoral-cases/${caseId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/pastoral-cases/:caseId/pause",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    automationGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validatePauseBody(req.body);
        const pool = getPgPool();
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const caseId = Number(req.params.caseId);
        await growthPastoralAutomationService.pauseCase(
          pool,
          automationCtx(req),
          plan,
          caseId,
          validated.reason
        );
        return res.redirect(303, `/branch/pastoral-cases/${caseId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/pastoral-cases/:caseId/resume",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    automationGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const caseId = Number(req.params.caseId);
        await growthPastoralAutomationService.resumeCase(pool, automationCtx(req), plan, caseId);
        return res.redirect(303, `/branch/pastoral-cases/${caseId}`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
