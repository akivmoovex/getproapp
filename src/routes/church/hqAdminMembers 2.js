"use strict";

const { getPgPool } = require("../../db/pg");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const { requireChurchHqAdminSession } = require("../../church/hqAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  MEMBER_STATUS_FILTERS,
  VERIFICATION_STATUS_FILTERS,
  memberStatusLabel,
  verificationStatusLabel,
  parseMemberDirectoryQuery,
  parseVerificationQueueQuery,
  resolveMemberListState,
} = require("../../church/memberDirectoryValidation");
const {
  transferMemberToBranch,
  listMemberBranchHistory,
} = require("../../services/church/memberBranchTransferService");
const {
  assertCrossBranchMemberAccess,
  listMembersAcrossBranches,
  listPendingMembersAcrossBranches,
  findMemberForHq,
} = require("../../services/church/growthMultiBranchService");
const { organisationAllowsBranchPaths } = require("../../services/church/branchPathRoutingService");
const { validateHqMemberTransferBody } = require("../../church/hqGrowthBranchValidation");
const { hqAdminLocals, flashFromQuery, recordHqAudit } = require("./hqAdminShared");

const MEMBER_NOTICES = new Set(["transferred"]);

function memberNoticeMessage(code) {
  if (code === "transferred") return "Member transferred successfully.";
  return null;
}

function resolveAllowedBranchId(branchId, branches) {
  if (branchId == null) return null;
  const allowed = (branches || []).some((b) => Number(b.id) === Number(branchId));
  return allowed ? branchId : null;
}

module.exports = function registerHqAdminMembersRoutes(router) {
  router.get("/hq/members", requireChurchBranchHost, requireChurchHqAdminSession, async (req, res, next) => {
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
      const parsed = parseMemberDirectoryQuery(req.query);
      const branchFilterId = resolveAllowedBranchId(parsed.branchId, branches);
      const members = await listMembersAcrossBranches(pool, org.id, {
        status: parsed.status,
        branchId: branchFilterId,
        q: parsed.q,
      });
      const totalInScope = await membersRepo.countMembersForOrganization(pool, org.id, {
        branchId: branchFilterId,
      });
      const listState = resolveMemberListState(
        { q: parsed.q, status: parsed.status, branchId: branchFilterId },
        members,
        { hasMembersInScope: totalInScope > 0 }
      );

      return res.render(
        "church/hq/members_directory",
        hqAdminLocals(req, {
          activeNav: "members",
          members,
          statusFilter: parsed.status,
          memberFilters: MEMBER_STATUS_FILTERS,
          memberStatusLabel,
          searchQuery: parsed.q,
          branchFilterId,
          branchOptions: branches,
          showBranchFilter: branches.length > 1,
          listState,
          listError: null,
          memberDetailBase: "/hq/members",
          directoryAction: "/hq/members",
          verificationHref: "/hq/member-verification",
          showImportAction: false,
          portalKind: "hq",
          pathRoutingEnabled: organisationAllowsBranchPaths(org),
          notice: memberNoticeMessage(flashFromQuery(req, MEMBER_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/hq/member-verification",
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

        const pool = getPgPool();
        const branches = await branchesRepo.listBranchesForOrganization(pool, org.id);
        const parsed = parseVerificationQueueQuery(req.query);
        const branchFilterId = resolveAllowedBranchId(parsed.branchId, branches);
        const pendingMembers = await listPendingMembersAcrossBranches(pool, org.id, {
          branchId: branchFilterId,
          q: parsed.q,
        });
        const pendingCount = parsed.q
          ? (
              await listPendingMembersAcrossBranches(pool, org.id, {
                branchId: branchFilterId,
              })
            ).length
          : pendingMembers.length;
        const listState =
          pendingMembers.length > 0 ? "results" : parsed.q || branchFilterId ? "no_results" : "empty";

        return res.render(
          "church/hq/verification_queue",
          hqAdminLocals(req, {
            activeNav: "verification",
            pendingMembers,
            pendingCount,
            statusFilter: parsed.status,
            verificationFilters: VERIFICATION_STATUS_FILTERS,
            memberStatusLabel,
            verificationStatusLabel,
            searchQuery: parsed.q,
            branchFilterId,
            branchOptions: branches,
            showBranchFilter: branches.length > 1,
            listState,
            listError: null,
            memberDetailBase: "/hq/members",
            membersListHref: "/hq/members",
            verificationAction: "/hq/member-verification",
            portalKind: "hq",
            notice: null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/hq/members/:memberId",
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

        const memberId = Number(req.params.memberId);
        if (!Number.isFinite(memberId) || memberId <= 0) {
          return res.status(404).type("text").send("Member not found.");
        }

        const pool = getPgPool();
        const member = await findMemberForHq(pool, memberId, org.id);
        if (!member) return res.status(404).type("text").send("Member not found.");

        const allBranches = await branchesRepo.listBranchesForOrganization(pool, org.id);
        const transferTargets = allBranches.filter(
          (b) => b.status === "active" && Number(b.id) !== Number(member.branch_id)
        );
        const transferHistory = await listMemberBranchHistory(pool, memberId);

        return res.render(
          "church/hq/member_detail",
          hqAdminLocals(req, {
            activeNav: "members",
            member,
            transferTargets,
            transferHistory,
            memberStatusLabel,
            error: null,
            notice: memberNoticeMessage(flashFromQuery(req, MEMBER_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/hq/members/:memberId/transfer",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const org = req.churchContext.organization;
        const admin = req.churchHqAdmin;
        try {
          assertCrossBranchMemberAccess(org);
        } catch (err) {
          if (err.code === "PACKAGE_REQUIRED") {
            return res.status(403).type("text").send(err.message);
          }
          throw err;
        }

        const memberId = Number(req.params.memberId);
        const pool = getPgPool();
        const member = await findMemberForHq(pool, memberId, org.id);
        if (!member) return res.status(404).type("text").send("Member not found.");

        const body = validateHqMemberTransferBody(req.body);
        if (!body.toBranchId) {
          const allBranches = await branchesRepo.listBranchesForOrganization(pool, org.id);
          const transferTargets = allBranches.filter(
            (b) => b.status === "active" && Number(b.id) !== Number(member.branch_id)
          );
          const transferHistory = await listMemberBranchHistory(pool, memberId);
          return res.status(400).render(
            "church/hq/member_detail",
            hqAdminLocals(req, {
              activeNav: "members",
              member,
              transferTargets,
              transferHistory,
              memberStatusLabel,
              error: "Select a target branch.",
              notice: null,
            })
          );
        }

        try {
          await transferMemberToBranch(pool, {
            memberId,
            fromBranchId: member.branch_id,
            toBranchId: body.toBranchId,
            organizationId: org.id,
            organization: org,
            actorType: "hq_admin",
            actorId: admin.hq_admin_id,
            reason: body.reason,
          });
        } catch (err) {
          const allBranches = await branchesRepo.listBranchesForOrganization(pool, org.id);
          const transferTargets = allBranches.filter(
            (b) => b.status === "active" && Number(b.id) !== Number(member.branch_id)
          );
          const transferHistory = await listMemberBranchHistory(pool, memberId);
          return res.status(400).render(
            "church/hq/member_detail",
            hqAdminLocals(req, {
              activeNav: "members",
              member,
              transferTargets,
              transferHistory,
              memberStatusLabel,
              error: err.message || "Transfer failed.",
              notice: null,
            })
          );
        }

        await recordHqAudit(pool, req, {
          action: "hq_member_transferred",
          branchId: body.toBranchId,
          entityType: "member",
          entityId: memberId,
          metadata: { from_branch_id: member.branch_id, to_branch_id: body.toBranchId },
        });

        return res.redirect(303, `/hq/members/${memberId}?notice=transferred`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
