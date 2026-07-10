"use strict";

const { getPgPool } = require("../../db/pg");
const ministryJoinRequestsRepo = require("../../db/pg/church/ministryJoinRequestsRepo");
const memberMinistriesRepo = require("../../db/pg/church/memberMinistriesRepo");
const ministriesRepo = require("../../db/pg/church/ministriesRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  JOIN_REQUEST_FILTERS,
  joinRequestStatusLabel,
  leaderRecommendationLabel,
  validateJoinRequestReviewComment,
} = require("../../church/ministryJoinRequestValidation");
const {
  branchAdminLocals,
  flashFromQuery,
  MINISTRY_JOIN_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");

async function loadJoinRequestDetail(pool, req, requestId, error) {
  const branch = req.churchContext.branch;
  const item = await ministryJoinRequestsRepo.findJoinRequestByIdForBranch(pool, requestId, branch.id);
  if (!item) return { notFound: true };
  return {
    joinRequest: item,
    joinRequestStatusLabel,
    leaderRecommendationLabel,
    error,
    notice: noticeMessage(flashFromQuery(req, MINISTRY_JOIN_NOTICES)),
  };
}

async function handleJoinRequestAction(req, res, next, action) {
  try {
    const requestId = Number(req.params.requestId);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      return res.status(404).type("text").send("Join request not found.");
    }

    const branch = req.churchContext.branch;
    const org = req.churchContext.organization;
    const pool = getPgPool();
    const adminId = req.churchBranchAdmin.admin_id;
    const existing = await ministryJoinRequestsRepo.findJoinRequestByIdForBranch(pool, requestId, branch.id);
    if (!existing) {
      return res.status(404).type("text").send("Join request not found.");
    }

    const commentValidation = validateJoinRequestReviewComment(req.body, {
      required: action === "reject" || action === "request-more-info",
    });
    if (!commentValidation.ok) {
      return res.status(400).render(
        "church/branch-admin/ministry_join_request_detail",
        branchAdminLocals(req, {
          ...(await loadJoinRequestDetail(pool, req, requestId, commentValidation.error)),
        })
      );
    }

    if (!["submitted", "more_info_needed"].includes(existing.status)) {
      return res.status(400).render(
        "church/branch-admin/ministry_join_request_detail",
        branchAdminLocals(req, {
          ...(await loadJoinRequestDetail(
            pool,
            req,
            requestId,
            "This join request has already been processed."
          )),
        })
      );
    }

    let updated = null;
    let notice = null;
    let auditAction = null;

    if (action === "approve") {
      updated = await ministryJoinRequestsRepo.approveJoinRequestForBranch(pool, requestId, branch.id, adminId);
      if (updated) {
        const assignment = await memberMinistriesRepo.addMemberToMinistry(pool, {
          organization_id: org.id,
          branch_id: branch.id,
          member_id: updated.member_id,
          ministry_id: updated.ministry_id,
          role: "member",
        });
        await recordBranchAudit(pool, req, {
          action: "member_added_to_ministry",
          entityType: "member_ministry",
          entityId: assignment ? assignment.id : null,
          metadata: {
            ministry_id: updated.ministry_id,
            member_id: updated.member_id,
            status: "active",
          },
        });
        auditAction = "ministry_join_request_approved";
        notice = "join_request_approved";
      }
    } else if (action === "reject") {
      updated = await ministryJoinRequestsRepo.rejectJoinRequestForBranch(
        pool,
        requestId,
        branch.id,
        adminId,
        commentValidation.adminComment
      );
      auditAction = "ministry_join_request_rejected";
      notice = "join_request_rejected";
    } else if (action === "request-more-info") {
      updated = await ministryJoinRequestsRepo.requestMoreInfoForBranch(
        pool,
        requestId,
        branch.id,
        adminId,
        commentValidation.adminComment
      );
      auditAction = "ministry_join_request_more_info_requested";
      notice = "join_request_more_info";
    }

    if (!updated) {
      return res.status(400).render(
        "church/branch-admin/ministry_join_request_detail",
        branchAdminLocals(req, {
          ...(await loadJoinRequestDetail(pool, req, requestId, "Join request could not be updated.")),
        })
      );
    }

    await recordBranchAudit(pool, req, {
      action: auditAction,
      entityType: "ministry_join_request",
      entityId: requestId,
      metadata: {
        ministry_id: updated.ministry_id,
        member_id: updated.member_id,
        status: updated.status,
        comment: commentValidation.adminComment || null,
      },
    });

    return res.redirect(303, `/branch/ministry-join-requests/${requestId}?notice=${notice}`);
  } catch (e) {
    return next(e);
  }
}

module.exports = function registerBranchAdminMinistryJoinRequestsRoutes(router) {
  router.get(
    "/branch/ministry-join-requests",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const filter = String(req.query.status || "all").trim();
        const statusFilter = JOIN_REQUEST_FILTERS.includes(filter) ? filter : "all";
        const ministryId = Number(req.query.ministry_id);
        const joinRequests = await ministryJoinRequestsRepo.listJoinRequestsForBranch(pool, branch.id, {
          status: statusFilter,
          ministryId: Number.isFinite(ministryId) && ministryId > 0 ? ministryId : undefined,
        });
        return res.render(
          "church/branch-admin/ministry_join_requests",
          branchAdminLocals(req, {
            joinRequests,
            statusFilter,
            joinRequestFilters: JOIN_REQUEST_FILTERS,
            joinRequestStatusLabel,
            ministryFilterId: Number.isFinite(ministryId) && ministryId > 0 ? ministryId : null,
            notice: noticeMessage(flashFromQuery(req, MINISTRY_JOIN_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/ministry-join-requests/:requestId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const requestId = Number(req.params.requestId);
        if (!Number.isFinite(requestId) || requestId <= 0) {
          return res.status(404).type("text").send("Join request not found.");
        }
        const pool = getPgPool();
        const locals = await loadJoinRequestDetail(pool, req, requestId, null);
        if (locals.notFound) {
          return res.status(404).type("text").send("Join request not found.");
        }
        return res.render(
          "church/branch-admin/ministry_join_request_detail",
          branchAdminLocals(req, locals)
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/ministry-join-requests/:requestId/approve",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    (req, res, next) => handleJoinRequestAction(req, res, next, "approve")
  );
  router.post(
    "/branch/ministry-join-requests/:requestId/reject",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    (req, res, next) => handleJoinRequestAction(req, res, next, "reject")
  );
  router.post(
    "/branch/ministry-join-requests/:requestId/request-more-info",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    (req, res, next) => handleJoinRequestAction(req, res, next, "request-more-info")
  );
};
