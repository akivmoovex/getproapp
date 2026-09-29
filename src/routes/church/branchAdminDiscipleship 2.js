"use strict";

const { getPgPool } = require("../../db/pg");
const membersRepo = require("../../db/pg/church/membersRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  loadPlanForReq,
  requirePackageFeature,
} = require("../../services/church/churchPackageFeatureGateService");
const growthDiscipleshipService = require("../../services/church/growthDiscipleshipService");
const {
  validateStageBody,
  validateMilestoneBody,
  validateMovementBody,
} = require("../../church/growthGroupsDiscipleshipVolunteersValidation");
const { branchAdminLocals } = require("./branchAdminShared");

function ctx(req) {
  return {
    organization_id: req.churchContext.organization.id,
    branch_id: req.churchContext.branch.id,
    admin_id: req.churchBranchAdmin.id,
  };
}

module.exports = function registerBranchAdminDiscipleshipRoutes(router) {
  const guard = requirePackageFeature("discipleship_pathways", { allowGetUpgradeShell: true });

  router.get(
    "/branch/discipleship",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          return require("./packageFeatureGates").renderBranchFeatureGate(
            req,
            res,
            "discipleship_pathways"
          );
        }
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const dashboard = await growthDiscipleshipService.loadDashboard(getPgPool(), ctx(req), plan);
        const members = await membersRepo.listMembersForBranch(getPgPool(), req.churchContext.branch.id, {
          status: "verified",
        });
        const adminsResult = await getPgPool().query(
          `SELECT id, full_name FROM public.church_branch_admins
           WHERE branch_id = $1 AND status = 'active' ORDER BY full_name ASC`,
          [req.churchContext.branch.id]
        );
        return res.render(
          "church/branch-admin/discipleship",
          branchAdminLocals(req, {
            navActive: "discipleship",
            ...dashboard,
            members,
            admins: adminsResult.rows,
            notice: req.query.saved ? "Saved." : null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/discipleship/stages",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateStageBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthDiscipleshipService.createStage(getPgPool(), ctx(req), plan, validated.data);
        return res.redirect(303, "/branch/discipleship?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/discipleship/milestones",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateMilestoneBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthDiscipleshipService.createMilestone(getPgPool(), ctx(req), plan, validated.data);
        return res.redirect(303, "/branch/discipleship?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/discipleship/move",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateMovementBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthDiscipleshipService.moveMember(getPgPool(), ctx(req), plan, validated.data);
        return res.redirect(303, "/branch/discipleship?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/discipleship/members/:memberId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const detail = await growthDiscipleshipService.loadMemberHistory(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.memberId)
        );
        return res.render(
          "church/branch-admin/discipleship_member",
          branchAdminLocals(req, {
            navActive: "discipleship",
            memberId: Number(req.params.memberId),
            ...detail,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );
};
