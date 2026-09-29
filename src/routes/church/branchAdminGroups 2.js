"use strict";

const { getPgPool } = require("../../db/pg");
const membersRepo = require("../../db/pg/church/membersRepo");
const groupsRepo = require("../../db/pg/church/groupsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  loadPlanForReq,
  requirePackageFeature,
} = require("../../services/church/churchPackageFeatureGateService");
const growthGroupsService = require("../../services/church/growthGroupsService");
const {
  validateGroupBody,
  validateMeetingBody,
} = require("../../church/growthGroupsDiscipleshipVolunteersValidation");
const { branchAdminLocals, recordBranchAudit } = require("./branchAdminShared");

function ctx(req) {
  return {
    organization_id: req.churchContext.organization.id,
    branch_id: req.churchContext.branch.id,
    admin_id: req.churchBranchAdmin.id,
  };
}

module.exports = function registerBranchAdminGroupsRoutes(router) {
  const guard = requirePackageFeature("groups_management", { allowGetUpgradeShell: true });

  router.get(
    "/branch/groups",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          return require("./packageFeatureGates").renderBranchFeatureGate(req, res, "groups_management");
        }
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const dashboard = await growthGroupsService.loadDashboard(getPgPool(), ctx(req), plan);
        return res.render(
          "church/branch-admin/groups",
          branchAdminLocals(req, {
            navActive: "groups",
            groups: dashboard.groups,
            pending: dashboard.pending,
            notice: req.query.saved ? "Saved." : null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/groups",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          return require("../../church/churchFailureStates").renderChurchFailureState(
            req,
            res,
            "package_restricted",
            { message: "Growth groups require Growth." }
          );
        }
        const validated = validateGroupBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const group = await growthGroupsService.createGroup(getPgPool(), ctx(req), plan, validated.data);
        return res.redirect(303, `/branch/groups/${group.id}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/groups/join-requests/:requestId/decide",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const decision = String((req.body && req.body.decision) || "");
        await growthGroupsService.decideJoinRequest(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.requestId),
          decision
        );
        return res.redirect(303, "/branch/groups?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/groups/:groupId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const detail = await growthGroupsService.loadGroupDetail(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.groupId)
        );
        const members = await membersRepo.listMembersForBranch(getPgPool(), req.churchContext.branch.id, {
          status: "verified",
        });
        const groups = await groupsRepo.listGroupsForBranch(getPgPool(), req.churchContext.branch.id);
        return res.render(
          "church/branch-admin/group_detail",
          branchAdminLocals(req, {
            navActive: "groups",
            ...detail,
            members,
            allGroups: groups.filter((g) => g.status === "active"),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/groups/:groupId/leaders",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const memberId = Number(req.body && req.body.member_id);
        await growthGroupsService.addLeader(getPgPool(), ctx(req), plan, Number(req.params.groupId), {
          member_id: Number.isFinite(memberId) && memberId > 0 ? memberId : null,
          admin_id: ctx(req).admin_id,
        });
        return res.redirect(303, `/branch/groups/${req.params.groupId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/groups/:groupId/meetings",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateMeetingBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthGroupsService.scheduleRecurringMeetings(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.groupId),
          validated.data
        );
        return res.redirect(303, `/branch/groups/${req.params.groupId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/groups/:groupId/meetings/:meetingId/attendance",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const memberId = Number(req.body && req.body.member_id);
        await growthGroupsService.recordAttendance(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.meetingId),
          memberId,
          String((req.body && req.body.present) || "1") !== "0"
        );
        return res.redirect(303, `/branch/groups/${req.params.groupId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/groups/:groupId/notes",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthGroupsService.addNote(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.groupId),
          String((req.body && req.body.note_body) || "").trim()
        );
        return res.redirect(303, `/branch/groups/${req.params.groupId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/groups/:groupId/transfer",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthGroupsService.transferMember(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.groupId),
          Number(req.body && req.body.to_group_id),
          Number(req.body && req.body.member_id)
        );
        return res.redirect(303, `/branch/groups/${req.params.groupId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/groups/:groupId/close",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthGroupsService.closeGroup(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.groupId),
          String((req.body && req.body.closure_reason) || "")
        );
        await recordBranchAudit(getPgPool(), req, {
          action: "group_closed",
          entityType: "group",
          entityId: Number(req.params.groupId),
        });
        return res.redirect(303, "/branch/groups?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );
};
