"use strict";

const { getPgPool } = require("../../db/pg");
const membersRepo = require("../../db/pg/church/membersRepo");
const volunteerSchedulingRepo = require("../../db/pg/church/volunteerSchedulingRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  loadPlanForReq,
  requirePackageFeature,
} = require("../../services/church/churchPackageFeatureGateService");
const growthVolunteerSchedulingService = require("../../services/church/growthVolunteerSchedulingService");
const {
  validateRoleBody,
  validateShiftBody,
  validateAssignBody,
  parseTime,
} = require("../../church/growthGroupsDiscipleshipVolunteersValidation");
const { branchAdminLocals } = require("./branchAdminShared");

function ctx(req) {
  return {
    organization_id: req.churchContext.organization.id,
    branch_id: req.churchContext.branch.id,
    admin_id: req.churchBranchAdmin.id,
  };
}

module.exports = function registerBranchAdminVolunteerSchedulingRoutes(router) {
  const guard = requirePackageFeature("volunteers_scheduling", { allowGetUpgradeShell: true });

  router.get(
    "/branch/volunteer-scheduling",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          return require("./packageFeatureGates").renderBranchFeatureGate(
            req,
            res,
            "volunteers_scheduling"
          );
        }
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const dashboard = await growthVolunteerSchedulingService.loadDashboard(
          getPgPool(),
          ctx(req),
          plan
        );
        const members = await membersRepo.listMembersForBranch(getPgPool(), req.churchContext.branch.id, {
          status: "verified",
        });
        return res.render(
          "church/branch-admin/volunteer_scheduling",
          branchAdminLocals(req, {
            navActive: "volunteer-scheduling",
            ...dashboard,
            members,
            notice: req.query.saved ? "Saved." : null,
            error: req.query.error || null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/volunteer-scheduling",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res) => res.redirect(303, "/branch/volunteer-scheduling")
  );

  router.post(
    "/branch/volunteer-scheduling/roles",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateRoleBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthVolunteerSchedulingService.createRole(getPgPool(), ctx(req), plan, validated.data);
        return res.redirect(303, "/branch/volunteer-scheduling?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/volunteer-scheduling/skills",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const name = String((req.body && req.body.name) || "").trim();
        if (!name) return res.status(400).type("text").send("Skill name is required.");
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthVolunteerSchedulingService.createSkill(getPgPool(), ctx(req), plan, name);
        return res.redirect(303, "/branch/volunteer-scheduling?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/volunteer-scheduling/role-skills",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthVolunteerSchedulingService.requireSkillForRole(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.body && req.body.role_id),
          Number(req.body && req.body.skill_id)
        );
        return res.redirect(303, "/branch/volunteer-scheduling?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/volunteer-scheduling/member-skills",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthVolunteerSchedulingService.addMemberSkill(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.body && req.body.member_id),
          Number(req.body && req.body.skill_id)
        );
        return res.redirect(303, "/branch/volunteer-scheduling?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/volunteer-scheduling/availability",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const start = parseTime(req.body && req.body.start_time);
        const end = parseTime(req.body && req.body.end_time);
        if (!start || !end) return res.status(400).type("text").send("Valid times required.");
        await growthVolunteerSchedulingService.setAvailability(getPgPool(), ctx(req), plan, {
          member_id: Number(req.body && req.body.member_id),
          day_of_week: Number(req.body && req.body.day_of_week),
          start_time: start,
          end_time: end,
        });
        return res.redirect(303, "/branch/volunteer-scheduling?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/volunteer-scheduling/shifts",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateShiftBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthVolunteerSchedulingService.createShift(getPgPool(), ctx(req), plan, validated.data);
        return res.redirect(303, "/branch/volunteer-scheduling?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/volunteer-scheduling/shifts/:shiftId/assign",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateAssignBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthVolunteerSchedulingService.assignShift(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.shiftId),
          validated.member_id
        );
        return res.redirect(303, "/branch/volunteer-scheduling?saved=1");
      } catch (e) {
        if (e.code === growthVolunteerSchedulingService.VOLUNTEER_ERRORS.CONFLICT) {
          return res.redirect(303, "/branch/volunteer-scheduling?error=" + encodeURIComponent(e.message));
        }
        if (e.code === growthVolunteerSchedulingService.VOLUNTEER_ERRORS.INELIGIBLE) {
          return res.status(409).type("text").send(e.message);
        }
        return next(e);
      }
    }
  );

  router.post(
    "/branch/volunteer-scheduling/assignments/:assignmentId/confirm",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthVolunteerSchedulingService.confirmAssignment(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.assignmentId)
        );
        return res.redirect(303, "/branch/volunteer-scheduling?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/volunteer-scheduling/assignments/:assignmentId/complete",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthVolunteerSchedulingService.completeAssignment(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.assignmentId)
        );
        return res.redirect(303, "/branch/volunteer-scheduling?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/volunteer-scheduling/shifts/:shiftId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const shift = await volunteerSchedulingRepo.findShiftByIdForBranch(
          pool,
          Number(req.params.shiftId),
          req.churchContext.branch.id
        );
        if (!shift) return res.status(404).type("text").send("Shift not found.");
        const assignments = await volunteerSchedulingRepo.listAssignmentsForShift(pool, shift.id);
        const members = await membersRepo.listMembersForBranch(pool, req.churchContext.branch.id, {
          status: "verified",
        });
        return res.render(
          "church/branch-admin/volunteer_shift_detail",
          branchAdminLocals(req, {
            navActive: "volunteer-scheduling",
            shift,
            assignments,
            members,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );
};
