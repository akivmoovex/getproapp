"use strict";

const { requireSuperAdmin } = require("../../auth");
const { getPgPool } = require("../../db/pg");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const branchAdminsRepo = require("../../db/pg/church/branchAdminsRepo");
const branchAdminPasswordResetRequestsRepo = require("../../db/pg/church/branchAdminPasswordResetRequestsRepo");
const { hashBranchAdminPassword } = require("../../church/branchAdminAuth");
const { maskLoginIdentifier } = require("../../church/loginProtection");
const {
  PASSWORD_RESET_FILTERS,
  passwordResetStatusLabel,
  validatePlatformResetPasswordBody,
  validateRejectPasswordResetBody,
  parsePlatformPasswordResetFilters,
} = require("../../church/branchAdminPasswordResetRequestValidation");
const { loadResetTimelineForDetail } = require("../../church/resetRequestTimeline");
const { parseSafeReturnTo } = require("../../church/platformMemberResetRequestValidation");

function resolveResetReturnTo(req, requestType) {
  const parsed = parseSafeReturnTo(req.query && req.query.return_to);
  return parsed.returnTo || `/admin/church/reset-requests?request_type=${requestType}`;
}

function platformAdminId(req) {
  return req.session.adminUser && req.session.adminUser.id ? req.session.adminUser.id : null;
}

function formatDate(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { hour12: false });
}

function maskIdentifier(value) {
  return maskLoginIdentifier(String(value || ""));
}

function resetNotice(req) {
  const notice = String(req.query.notice || "").trim();
  const map = {
    reset_reviewed: "Password reset request marked as reviewed.",
    reset_completed: "Password reset completed. Share the temporary password securely.",
    reset_rejected: "Password reset request rejected.",
  };
  return map[notice] || null;
}

function auditMetadata(requestRow, extra = {}) {
  return {
    request_id: requestRow.id,
    branch_admin_id: requestRow.branch_admin_id ?? null,
    organization_id: requestRow.organization_id,
    branch_id: requestRow.branch_id,
    identifier_masked: maskIdentifier(requestRow.identifier_submitted),
    status: requestRow.status,
    action_source: "branch_admin_forgot_password_request",
    ...extra,
  };
}

async function recordPlatformPasswordResetAudit(client, req, { action, requestRow, extra }) {
  await auditLogsRepo.insertAuditLog(client, {
    organization_id: requestRow.organization_id,
    branch_id: requestRow.branch_id,
    actor_type: "platform_admin",
    actor_id: platformAdminId(req),
    action,
    entity_type: "branch_admin_password_reset_request",
    entity_id: requestRow.id,
    metadata_json: auditMetadata(requestRow, extra),
  });
}

async function loadDetail(pool, req, requestId, error) {
  const item = await branchAdminPasswordResetRequestsRepo.findBranchAdminPasswordResetRequestByIdForPlatform(
    pool,
    requestId
  );
  if (!item) return { notFound: true };
  const timeline = await loadResetTimelineForDetail(pool, "branch_admin", item);
  return {
    requestItem: item,
    passwordResetStatusLabel,
    maskIdentifier,
    formatDate,
    formatDateTime,
    error,
    flashNotice: resetNotice(req),
    returnTo: resolveResetReturnTo(req, "branch_admin"),
    ...timeline,
  };
}

module.exports = function registerAdminChurchBranchAdminPasswordResetRoutes(router) {
  router.get(
    "/church/branch-admin-password-reset-requests",
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const filters = parsePlatformPasswordResetFilters(req.query);
        const requests = await branchAdminPasswordResetRequestsRepo.listBranchAdminPasswordResetRequestsForPlatform(
          pool,
          {
            status: filters.status,
            organizationId: filters.organization_id,
            branchId: filters.branch_id,
          }
        );
        return res.render("admin/church/branch_admin_password_reset_requests", {
          requests,
          filters,
          passwordResetFilters: PASSWORD_RESET_FILTERS,
          passwordResetStatusLabel,
          maskIdentifier,
          formatDate,
          formatDateTime,
          flashNotice: resetNotice(req),
          activeNav: "church_platform_branch_admin_resets",
        });
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/church/branch-admin-password-reset-requests/:requestId",
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const requestId = Number(req.params.requestId);
        if (!Number.isFinite(requestId) || requestId <= 0) {
          return res.status(404).type("text").send("Request not found.");
        }
        const pool = getPgPool();
        const locals = await loadDetail(pool, req, requestId, null);
        if (locals.notFound) {
          return res.status(404).type("text").send("Request not found.");
        }
        return res.render("admin/church/branch_admin_password_reset_request_detail", {
          ...locals,
          activeNav: "church_platform_branch_admin_resets",
        });
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/church/branch-admin-password-reset-requests/:requestId/mark-reviewed",
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const requestId = Number(req.params.requestId);
        if (!Number.isFinite(requestId) || requestId <= 0) {
          return res.status(404).type("text").send("Request not found.");
        }
        const pool = getPgPool();
        const existing =
          await branchAdminPasswordResetRequestsRepo.findBranchAdminPasswordResetRequestByIdForPlatform(
            pool,
            requestId
          );
        if (!existing) {
          return res.status(404).type("text").send("Request not found.");
        }
        if (existing.status !== "submitted") {
          return res.status(400).render("admin/church/branch_admin_password_reset_request_detail", {
            ...(await loadDetail(
              pool,
              req,
              requestId,
              "Only submitted requests can be marked reviewed."
            )),
            activeNav: "church_platform_branch_admin_resets",
          });
        }

        const client = await pool.connect();
        let updated;
        try {
          await client.query("BEGIN");
          updated = await branchAdminPasswordResetRequestsRepo.markBranchAdminPasswordResetRequestReviewed(
            client,
            requestId,
            platformAdminId(req)
          );
          if (!updated) {
            throw Object.assign(new Error("Request could not be updated."), { code: "UPDATE_FAILED" });
          }
          await recordPlatformPasswordResetAudit(client, req, {
            action: "branch_admin_password_reset_request_reviewed",
            requestRow: updated,
          });
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }

        return res.redirect(
          303,
          `/admin/church/branch-admin-password-reset-requests/${requestId}?notice=reset_reviewed`
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/church/branch-admin-password-reset-requests/:requestId/reset-password",
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const requestId = Number(req.params.requestId);
        if (!Number.isFinite(requestId) || requestId <= 0) {
          return res.status(404).type("text").send("Request not found.");
        }
        const pool = getPgPool();
        const existing =
          await branchAdminPasswordResetRequestsRepo.findBranchAdminPasswordResetRequestByIdForPlatform(
            pool,
            requestId
          );
        if (!existing) {
          return res.status(404).type("text").send("Request not found.");
        }
        if (!existing.branch_admin_id) {
          return res.status(400).render("admin/church/branch_admin_password_reset_request_detail", {
            ...(await loadDetail(
              pool,
              req,
              requestId,
              "Cannot reset password — no matching branch administrator account was found for this request."
            )),
            activeNav: "church_platform_branch_admin_resets",
          });
        }
        if (existing.status === "reset_completed" || existing.status === "rejected") {
          return res.status(400).render("admin/church/branch_admin_password_reset_request_detail", {
            ...(await loadDetail(pool, req, requestId, "This request is already closed.")),
            activeNav: "church_platform_branch_admin_resets",
          });
        }

        const validation = validatePlatformResetPasswordBody(req.body || {});
        if (!validation.ok) {
          return res.status(400).render("admin/church/branch_admin_password_reset_request_detail", {
            ...(await loadDetail(pool, req, requestId, validation.error)),
            activeNav: "church_platform_branch_admin_resets",
          });
        }

        const passwordHash = await hashBranchAdminPassword(validation.new_password);
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const adminUpdated = await branchAdminsRepo.resetBranchAdminPasswordByPlatformResetRequest(
            client,
            existing.branch_admin_id,
            existing.branch_id,
            passwordHash
          );
          if (!adminUpdated) {
            throw Object.assign(new Error("Branch admin password could not be updated."), {
              code: "UPDATE_FAILED",
            });
          }
          const completed =
            await branchAdminPasswordResetRequestsRepo.completeBranchAdminPasswordResetRequest(
              client,
              requestId,
              platformAdminId(req)
            );
          if (!completed) {
            throw Object.assign(new Error("Request could not be completed."), { code: "UPDATE_FAILED" });
          }
          await recordPlatformPasswordResetAudit(client, req, {
            action: "branch_admin_password_reset_completed_by_platform_admin",
            requestRow: completed,
            extra: { branch_admin_id: existing.branch_admin_id },
          });
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }

        return res.redirect(
          303,
          `/admin/church/branch-admin-password-reset-requests/${requestId}?notice=reset_completed`
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/church/branch-admin-password-reset-requests/:requestId/reject",
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const requestId = Number(req.params.requestId);
        if (!Number.isFinite(requestId) || requestId <= 0) {
          return res.status(404).type("text").send("Request not found.");
        }
        const validation = validateRejectPasswordResetBody(req.body || {});
        const pool = getPgPool();
        const existing =
          await branchAdminPasswordResetRequestsRepo.findBranchAdminPasswordResetRequestByIdForPlatform(
            pool,
            requestId
          );
        if (!existing) {
          return res.status(404).type("text").send("Request not found.");
        }
        if (!validation.ok) {
          return res.status(400).render("admin/church/branch_admin_password_reset_request_detail", {
            ...(await loadDetail(pool, req, requestId, validation.error)),
            activeNav: "church_platform_branch_admin_resets",
          });
        }
        if (existing.status === "reset_completed" || existing.status === "rejected") {
          return res.status(400).render("admin/church/branch_admin_password_reset_request_detail", {
            ...(await loadDetail(pool, req, requestId, "This request is already closed.")),
            activeNav: "church_platform_branch_admin_resets",
          });
        }

        const client = await pool.connect();
        let updated;
        try {
          await client.query("BEGIN");
          updated = await branchAdminPasswordResetRequestsRepo.rejectBranchAdminPasswordResetRequest(
            client,
            requestId,
            platformAdminId(req),
            validation.review_comment
          );
          if (!updated) {
            throw Object.assign(new Error("Request could not be rejected."), { code: "UPDATE_FAILED" });
          }
          await recordPlatformPasswordResetAudit(client, req, {
            action: "branch_admin_password_reset_request_rejected",
            requestRow: updated,
            extra: { review_comment: validation.review_comment },
          });
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }

        return res.redirect(
          303,
          `/admin/church/branch-admin-password-reset-requests/${requestId}?notice=reset_rejected`
        );
      } catch (e) {
        return next(e);
      }
    }
  );
};
