"use strict";

const { getPgPool } = require("../../db/pg");
const ministryLeaderPasswordResetRequestsRepo = require("../../db/pg/church/ministryLeaderPasswordResetRequestsRepo");
const ministryLeadersRepo = require("../../db/pg/church/ministryLeadersRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { hashLeaderPassword } = require("../../church/leaderAuth");
const {
  PASSWORD_RESET_FILTERS,
  passwordResetStatusLabel,
  validateBranchAdminResetPasswordBody,
  validateRejectPasswordResetBody,
} = require("../../church/ministryLeaderPasswordResetRequestValidation");
const { requireChurchBranchHost } = require("./auth");
const {
  branchAdminLocals,
  flashFromQuery,
  LEADER_PASSWORD_RESET_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");
const { loadResetTimelineForDetail } = require("../../church/resetRequestTimeline");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");

async function loadLeaderPasswordResetDetail(pool, req, requestId, error) {
  const branch = req.churchContext.branch;
  const item = await ministryLeaderPasswordResetRequestsRepo.findMinistryLeaderPasswordResetRequestByIdForBranch(
    pool,
    branch.id,
    requestId
  );
  if (!item) return { notFound: true };
  const timeline = await loadResetTimelineForDetail(pool, "ministry_leader", item);
  return {
    requestItem: item,
    passwordResetStatusLabel,
    maskIdentifier: ministryLeaderPasswordResetRequestsRepo.maskIdentifier,
    error,
    notice: noticeMessage(flashFromQuery(req, LEADER_PASSWORD_RESET_NOTICES)),
    formatDateTime: (value) => {
      if (!value) return "—";
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleString("en-GB", { hour12: false });
    },
    ...timeline,
  };
}

function auditMetadata(requestRow, extra = {}) {
  return {
    request_id: requestRow.id,
    ministry_leader_id: requestRow.ministry_leader_id ?? null,
    ministry_id: requestRow.ministry_id ?? null,
    identifier_masked: ministryLeaderPasswordResetRequestsRepo.maskIdentifier(
      requestRow.identifier_submitted
    ),
    status: requestRow.status,
    action_source: "ministry_leader_forgot_password_request",
    ...extra,
  };
}

module.exports = function registerBranchAdminLeaderPasswordResetRequestsRoutes(router) {
  router.get(
    "/branch/leader-password-reset-requests",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const filter = String(req.query.status || "all").trim();
        const statusFilter = PASSWORD_RESET_FILTERS.includes(filter) ? filter : "all";
        const requests =
          await ministryLeaderPasswordResetRequestsRepo.listMinistryLeaderPasswordResetRequestsForBranch(
            pool,
            branch.id,
            { status: statusFilter }
          );
        return res.render(
          "church/branch-admin/leader_password_reset_requests",
          branchAdminLocals(req, {
            requests,
            statusFilter,
            passwordResetFilters: PASSWORD_RESET_FILTERS,
            passwordResetStatusLabel,
            maskIdentifier: ministryLeaderPasswordResetRequestsRepo.maskIdentifier,
            notice: noticeMessage(flashFromQuery(req, LEADER_PASSWORD_RESET_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/leader-password-reset-requests/:requestId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const requestId = Number(req.params.requestId);
        if (!Number.isFinite(requestId) || requestId <= 0) {
          return res.status(404).type("text").send("Request not found.");
        }
        const pool = getPgPool();
        const locals = await loadLeaderPasswordResetDetail(pool, req, requestId, null);
        if (locals.notFound) {
          return res.status(404).type("text").send("Request not found.");
        }
        return res.render(
          "church/branch-admin/leader_password_reset_request_detail",
          branchAdminLocals(req, locals)
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/leader-password-reset-requests/:requestId/mark-reviewed",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const requestId = Number(req.params.requestId);
        if (!Number.isFinite(requestId) || requestId <= 0) {
          return res.status(404).type("text").send("Request not found.");
        }
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const existing =
          await ministryLeaderPasswordResetRequestsRepo.findMinistryLeaderPasswordResetRequestByIdForBranch(
            pool,
            branch.id,
            requestId
          );
        if (!existing) {
          return res.status(404).type("text").send("Request not found.");
        }
        if (existing.status !== "submitted") {
          return res.status(400).render(
            "church/branch-admin/leader_password_reset_request_detail",
            branchAdminLocals(req, {
              ...(await loadLeaderPasswordResetDetail(
                pool,
                req,
                requestId,
                "Only submitted requests can be marked reviewed."
              )),
            })
          );
        }

        const client = await pool.connect();
        let updated;
        try {
          await client.query("BEGIN");
          updated = await ministryLeaderPasswordResetRequestsRepo.markMinistryLeaderPasswordResetRequestReviewed(
            client,
            branch.id,
            requestId,
            req.churchBranchAdmin.admin_id
          );
          if (!updated) {
            throw Object.assign(new Error("Request could not be updated."), { code: "UPDATE_FAILED" });
          }
          await recordBranchAudit(client, req, {
            action: "ministry_leader_password_reset_request_reviewed",
            entityType: "ministry_leader_password_reset_request",
            entityId: requestId,
            metadata: auditMetadata(updated),
          });
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }

        return res.redirect(303, `/branch/leader-password-reset-requests/${requestId}?notice=reset_reviewed`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/leader-password-reset-requests/:requestId/reset-password",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const requestId = Number(req.params.requestId);
        if (!Number.isFinite(requestId) || requestId <= 0) {
          return res.status(404).type("text").send("Request not found.");
        }
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const existing =
          await ministryLeaderPasswordResetRequestsRepo.findMinistryLeaderPasswordResetRequestByIdForBranch(
            pool,
            branch.id,
            requestId
          );
        if (!existing) {
          return res.status(404).type("text").send("Request not found.");
        }
        if (!existing.ministry_leader_id) {
          return res.status(400).render(
            "church/branch-admin/leader_password_reset_request_detail",
            branchAdminLocals(req, {
              ...(await loadLeaderPasswordResetDetail(
                pool,
                req,
                requestId,
                "Cannot reset password — no matching ministry leader account was found for this request."
              )),
            })
          );
        }
        if (existing.status === "reset_completed" || existing.status === "rejected") {
          return res.status(400).render(
            "church/branch-admin/leader_password_reset_request_detail",
            branchAdminLocals(req, {
              ...(await loadLeaderPasswordResetDetail(pool, req, requestId, "This request is already closed.")),
            })
          );
        }

        const validation = validateBranchAdminResetPasswordBody(req.body || {});
        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/leader_password_reset_request_detail",
            branchAdminLocals(req, {
              ...(await loadLeaderPasswordResetDetail(pool, req, requestId, validation.error)),
            })
          );
        }

        const passwordHash = await hashLeaderPassword(validation.new_password);
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const leaderUpdated = await ministryLeadersRepo.resetMinistryLeaderPasswordByBranchAdminResetRequest(
            client,
            existing.ministry_leader_id,
            branch.id,
            passwordHash,
            req.churchBranchAdmin.admin_id
          );
          if (!leaderUpdated) {
            throw Object.assign(new Error("Ministry leader password could not be updated."), {
              code: "UPDATE_FAILED",
            });
          }
          const completed =
            await ministryLeaderPasswordResetRequestsRepo.completeMinistryLeaderPasswordResetRequest(
              client,
              branch.id,
              requestId,
              req.churchBranchAdmin.admin_id
            );
          if (!completed) {
            throw Object.assign(new Error("Request could not be completed."), { code: "UPDATE_FAILED" });
          }
          await recordBranchAudit(client, req, {
            action: "ministry_leader_password_reset_completed_by_branch_admin",
            entityType: "ministry_leader_password_reset_request",
            entityId: requestId,
            metadata: auditMetadata(completed, {
              ministry_leader_id: existing.ministry_leader_id,
              ministry_id: existing.ministry_id ?? null,
            }),
          });
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }

        return res.redirect(303, `/branch/leader-password-reset-requests/${requestId}?notice=reset_completed`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/leader-password-reset-requests/:requestId/reject",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const requestId = Number(req.params.requestId);
        if (!Number.isFinite(requestId) || requestId <= 0) {
          return res.status(404).type("text").send("Request not found.");
        }
        const validation = validateRejectPasswordResetBody(req.body || {});
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const existing =
          await ministryLeaderPasswordResetRequestsRepo.findMinistryLeaderPasswordResetRequestByIdForBranch(
            pool,
            branch.id,
            requestId
          );
        if (!existing) {
          return res.status(404).type("text").send("Request not found.");
        }
        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/leader_password_reset_request_detail",
            branchAdminLocals(req, {
              ...(await loadLeaderPasswordResetDetail(pool, req, requestId, validation.error)),
            })
          );
        }
        if (existing.status === "reset_completed" || existing.status === "rejected") {
          return res.status(400).render(
            "church/branch-admin/leader_password_reset_request_detail",
            branchAdminLocals(req, {
              ...(await loadLeaderPasswordResetDetail(pool, req, requestId, "This request is already closed.")),
            })
          );
        }

        const client = await pool.connect();
        let updated;
        try {
          await client.query("BEGIN");
          updated = await ministryLeaderPasswordResetRequestsRepo.rejectMinistryLeaderPasswordResetRequest(
            client,
            branch.id,
            requestId,
            req.churchBranchAdmin.admin_id,
            validation.review_comment
          );
          if (!updated) {
            throw Object.assign(new Error("Request could not be rejected."), { code: "UPDATE_FAILED" });
          }
          await recordBranchAudit(client, req, {
            action: "ministry_leader_password_reset_request_rejected",
            entityType: "ministry_leader_password_reset_request",
            entityId: requestId,
            metadata: auditMetadata(updated, { review_comment: validation.review_comment }),
          });
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }

        return res.redirect(303, `/branch/leader-password-reset-requests/${requestId}?notice=reset_rejected`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
