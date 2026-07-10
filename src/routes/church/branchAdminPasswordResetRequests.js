"use strict";

const { getPgPool } = require("../../db/pg");
const memberPasswordResetRequestsRepo = require("../../db/pg/church/memberPasswordResetRequestsRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { hashMemberPassword } = require("../../church/memberAuth");
const { maskLoginIdentifier } = require("../../church/loginProtection");
const {
  PASSWORD_RESET_FILTERS,
  passwordResetStatusLabel,
  validateBranchAdminResetPasswordBody,
  validateRejectPasswordResetBody,
} = require("../../church/memberPasswordResetRequestValidation");
const { requireChurchBranchHost } = require("./auth");
const {
  branchAdminLocals,
  flashFromQuery,
  PASSWORD_RESET_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");
const { loadResetTimelineForDetail } = require("../../church/resetRequestTimeline");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");

function maskIdentifier(value) {
  return maskLoginIdentifier(String(value || ""));
}

async function loadPasswordResetDetail(pool, req, requestId, error) {
  const branch = req.churchContext.branch;
  const item = await memberPasswordResetRequestsRepo.findPasswordResetRequestByIdForBranch(
    pool,
    branch.id,
    requestId
  );
  if (!item) return { notFound: true };
  const timeline = await loadResetTimelineForDetail(pool, "member", item);
  return {
    requestItem: item,
    passwordResetStatusLabel,
    maskIdentifier,
    error,
    notice: noticeMessage(flashFromQuery(req, PASSWORD_RESET_NOTICES)),
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
    member_id: requestRow.member_id ?? null,
    identifier_masked: maskIdentifier(requestRow.identifier_submitted),
    status: requestRow.status,
    action_source: "member_forgot_password_request",
    ...extra,
  };
}

module.exports = function registerBranchAdminPasswordResetRequestsRoutes(router) {
  router.get(
    "/branch/password-reset-requests",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const filter = String(req.query.status || "all").trim();
        const statusFilter = PASSWORD_RESET_FILTERS.includes(filter) ? filter : "all";
        const requests = await memberPasswordResetRequestsRepo.listPasswordResetRequestsForBranch(
          pool,
          branch.id,
          { status: statusFilter }
        );
        return res.render(
          "church/branch-admin/password_reset_requests",
          branchAdminLocals(req, {
            requests,
            statusFilter,
            passwordResetFilters: PASSWORD_RESET_FILTERS,
            passwordResetStatusLabel,
            maskIdentifier,
            notice: noticeMessage(flashFromQuery(req, PASSWORD_RESET_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/password-reset-requests/:requestId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const requestId = Number(req.params.requestId);
        if (!Number.isFinite(requestId) || requestId <= 0) {
          return res.status(404).type("text").send("Request not found.");
        }
        const pool = getPgPool();
        const locals = await loadPasswordResetDetail(pool, req, requestId, null);
        if (locals.notFound) {
          return res.status(404).type("text").send("Request not found.");
        }
        return res.render(
          "church/branch-admin/password_reset_request_detail",
          branchAdminLocals(req, locals)
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/password-reset-requests/:requestId/mark-reviewed",
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
        const existing = await memberPasswordResetRequestsRepo.findPasswordResetRequestByIdForBranch(
          pool,
          branch.id,
          requestId
        );
        if (!existing) {
          return res.status(404).type("text").send("Request not found.");
        }
        if (existing.status !== "submitted") {
          return res.status(400).render(
            "church/branch-admin/password_reset_request_detail",
            branchAdminLocals(req, {
              ...(await loadPasswordResetDetail(
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
          updated = await memberPasswordResetRequestsRepo.markPasswordResetRequestReviewed(
            client,
            branch.id,
            requestId,
            req.churchBranchAdmin.admin_id
          );
          if (!updated) {
            throw Object.assign(new Error("Request could not be updated."), { code: "UPDATE_FAILED" });
          }
          await recordBranchAudit(client, req, {
            action: "member_password_reset_request_reviewed",
            entityType: "password_reset_request",
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

        return res.redirect(303, `/branch/password-reset-requests/${requestId}?notice=reset_reviewed`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/password-reset-requests/:requestId/reset-password",
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
        const existing = await memberPasswordResetRequestsRepo.findPasswordResetRequestByIdForBranch(
          pool,
          branch.id,
          requestId
        );
        if (!existing) {
          return res.status(404).type("text").send("Request not found.");
        }
        if (!existing.member_id) {
          return res.status(400).render(
            "church/branch-admin/password_reset_request_detail",
            branchAdminLocals(req, {
              ...(await loadPasswordResetDetail(
                pool,
                req,
                requestId,
                "Cannot reset password — no matching member account was found for this request."
              )),
            })
          );
        }
        if (existing.status === "reset_completed" || existing.status === "rejected") {
          return res.status(400).render(
            "church/branch-admin/password_reset_request_detail",
            branchAdminLocals(req, {
              ...(await loadPasswordResetDetail(
                pool,
                req,
                requestId,
                "This request is already closed."
              )),
            })
          );
        }

        const validation = validateBranchAdminResetPasswordBody(req.body || {});
        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/password_reset_request_detail",
            branchAdminLocals(req, {
              ...(await loadPasswordResetDetail(pool, req, requestId, validation.error)),
            })
          );
        }

        const passwordHash = await hashMemberPassword(validation.new_password);
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const memberUpdated = await membersRepo.resetMemberPasswordByBranchAdmin(
            client,
            existing.member_id,
            branch.id,
            passwordHash
          );
          if (!memberUpdated) {
            throw Object.assign(new Error("Member password could not be updated."), { code: "UPDATE_FAILED" });
          }
          const completed = await memberPasswordResetRequestsRepo.completePasswordResetRequest(
            client,
            branch.id,
            requestId,
            req.churchBranchAdmin.admin_id
          );
          if (!completed) {
            throw Object.assign(new Error("Request could not be completed."), { code: "UPDATE_FAILED" });
          }
          await recordBranchAudit(client, req, {
            action: "member_password_reset_completed_by_branch_admin",
            entityType: "password_reset_request",
            entityId: requestId,
            metadata: auditMetadata(completed, { member_id: existing.member_id }),
          });
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }

        return res.redirect(303, `/branch/password-reset-requests/${requestId}?notice=reset_completed`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/password-reset-requests/:requestId/reject",
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
        const existing = await memberPasswordResetRequestsRepo.findPasswordResetRequestByIdForBranch(
          pool,
          branch.id,
          requestId
        );
        if (!existing) {
          return res.status(404).type("text").send("Request not found.");
        }
        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/password_reset_request_detail",
            branchAdminLocals(req, {
              ...(await loadPasswordResetDetail(pool, req, requestId, validation.error)),
            })
          );
        }
        if (existing.status === "reset_completed" || existing.status === "rejected") {
          return res.status(400).render(
            "church/branch-admin/password_reset_request_detail",
            branchAdminLocals(req, {
              ...(await loadPasswordResetDetail(
                pool,
                req,
                requestId,
                "This request is already closed."
              )),
            })
          );
        }

        const client = await pool.connect();
        let updated;
        try {
          await client.query("BEGIN");
          updated = await memberPasswordResetRequestsRepo.rejectPasswordResetRequest(
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
            action: "member_password_reset_request_rejected",
            entityType: "password_reset_request",
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

        return res.redirect(303, `/branch/password-reset-requests/${requestId}?notice=reset_rejected`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
