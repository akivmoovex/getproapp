"use strict";

const { getPgPool } = require("../../db/pg");
const memberRequestsRepo = require("../../db/pg/church/memberRequestsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  canTransitionRequest,
  resolveMemberRequestAction,
  memberRequestStatusLabel,
} = require("../../church/requestProcessingValidation");
const {
  branchAdminLocals,
  flashFromQuery,
  REQUEST_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

const REQUEST_FILTERS = [
  "all",
  "submitted",
  "in_review",
  "more_info_needed",
  "approved",
  "rejected",
  "completed",
];

async function loadRequestDetail(pool, req, requestId, error) {
  const branch = req.churchContext.branch;
  const item = await memberRequestsRepo.findMemberRequestByIdForBranch(pool, requestId, branch.id);
  if (!item) return { notFound: true };
  return {
    requestItem: item,
    requestStatusLabel: memberRequestStatusLabel,
    error,
    notice: noticeMessage(flashFromQuery(req, REQUEST_NOTICES)),
  };
}

async function handleRequestAction(req, res, next, actionKey) {
  try {
    const requestId = Number(req.params.requestId);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      return res.status(404).type("text").send("Request not found.");
    }
    const action = resolveMemberRequestAction(actionKey);
    if (!action) {
      return res.status(400).type("text").send("Invalid action.");
    }

    const branch = req.churchContext.branch;
    const pool = getPgPool();
    const existing = await memberRequestsRepo.findMemberRequestByIdForBranch(pool, requestId, branch.id);
    if (!existing) {
      return res.status(404).type("text").send("Request not found.");
    }

    const comment = String((req.body && req.body.admin_comment) || "").trim().slice(0, 2000);
    if (action.commentRequired && !comment) {
      return res.status(400).render(
        "church/branch-admin/request_detail",
        branchAdminLocals(req, {
          ...(await loadRequestDetail(pool, req, requestId, "Please enter a comment for this action.")),
        })
      );
    }

    if (!canTransitionRequest(existing.status, action.status)) {
      return res.status(400).render(
        "church/branch-admin/request_detail",
        branchAdminLocals(req, {
          ...(await loadRequestDetail(
            pool,
            req,
            requestId,
            `Cannot move request from ${memberRequestStatusLabel(existing.status)} to ${memberRequestStatusLabel(action.status)}.`
          )),
        })
      );
    }

    const updated = await memberRequestsRepo.updateMemberRequestStatusForBranch(pool, requestId, branch.id, {
      status: action.status,
      from_status: existing.status,
      admin_comment: comment || existing.admin_comment || "",
      assigned_admin_id: req.churchBranchAdmin.admin_id,
      set_reviewed_at: action.status === "in_review" || action.status === "approved" || action.status === "rejected",
      set_completed_at: action.status === "completed",
    });

    if (!updated) {
      return res.status(400).render(
        "church/branch-admin/request_detail",
        branchAdminLocals(req, {
          ...(await loadRequestDetail(pool, req, requestId, "Request could not be updated.")),
        })
      );
    }

    await recordBranchAudit(pool, req, {
      action: action.audit,
      entityType: "member_request",
      entityId: requestId,
      metadata: {
        previous_status: existing.status,
        new_status: action.status,
        comment: comment || null,
      },
    });

    const noticeMap = {
      "start-review": "request_in_review",
      approve: "request_approved",
      reject: "request_rejected",
      "request-more-info": "request_more_info",
      complete: "request_completed",
    };
    return res.redirect(303, `/branch/requests/${requestId}?notice=${noticeMap[actionKey]}`);
  } catch (e) {
    return next(e);
  }
}

module.exports = function registerBranchAdminMemberRequestsRoutes(router) {
  router.get("/branch/requests", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const filter = String(req.query.status || "all").trim();
      const statusFilter = REQUEST_FILTERS.includes(filter) ? filter : "all";
      const requests = await memberRequestsRepo.listMemberRequestsForBranch(pool, branch.id, {
        status: statusFilter,
      });
      return res.render(
        "church/branch-admin/requests_queue",
        branchAdminLocals(req, {
          requests,
          statusFilter,
          requestFilters: REQUEST_FILTERS,
          requestStatusLabel: memberRequestStatusLabel,
          notice: noticeMessage(flashFromQuery(req, REQUEST_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/branch/requests/:requestId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const requestId = Number(req.params.requestId);
        if (!Number.isFinite(requestId) || requestId <= 0) {
          return res.status(404).type("text").send("Request not found.");
        }
        const pool = getPgPool();
        const locals = await loadRequestDetail(pool, req, requestId, null);
        if (locals.notFound) {
          return res.status(404).type("text").send("Request not found.");
        }
        return res.render("church/branch-admin/request_detail", branchAdminLocals(req, locals));
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/requests/:requestId/start-review",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    (req, res, next) => handleRequestAction(req, res, next, "start-review")
  );
  router.post(
    "/branch/requests/:requestId/approve",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    (req, res, next) => handleRequestAction(req, res, next, "approve")
  );
  router.post(
    "/branch/requests/:requestId/reject",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    (req, res, next) => handleRequestAction(req, res, next, "reject")
  );
  router.post(
    "/branch/requests/:requestId/request-more-info",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    (req, res, next) => handleRequestAction(req, res, next, "request-more-info")
  );
  router.post(
    "/branch/requests/:requestId/complete",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    (req, res, next) => handleRequestAction(req, res, next, "complete")
  );
};
