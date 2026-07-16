"use strict";

const { getPgPool } = require("../../db/pg");
const hqBroadcastsRepo = require("../../db/pg/church/hqBroadcastsRepo");
const { requireChurchHqAdminSession } = require("../../church/hqAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  requirePackageFeature,
  attachPackageFeatureLocals,
} = require("../../services/church/churchPackageFeatureGateService");
const { renderHqFeatureGate } = require("./packageFeatureGates");
const scheduledBroadcastService = require("../../services/church/scheduledBroadcastService");
const {
  broadcastStatusLabel,
  broadcastAudienceLabel,
  targetScopeLabel,
  priorityLabel,
} = require("../../church/hqBroadcastValidation");
const { hqAdminLocals, flashFromQuery, noticeMessage } = require("./hqAdminShared");

const featureGuard = requirePackageFeature("broadcasts_scheduled", { allowGetUpgradeShell: true });

const SCHEDULED_BROADCAST_NOTICES = new Set([
  "broadcast_scheduled",
  "broadcast_cancelled",
  "broadcast_retried",
  "moved_preview",
  "estimate_ready",
  "submitted_approval",
  "quiet_hours_saved",
  "test_delivery_recorded",
]);

function scheduledNotice(code) {
  const map = {
    broadcast_scheduled: "Broadcast scheduled for publication.",
    broadcast_cancelled: "Scheduled broadcast cancelled.",
    broadcast_retried: "Failed deliveries retried.",
    moved_preview: "Broadcast moved to preview.",
    estimate_ready: "Audience estimate ready.",
    submitted_approval: "Broadcast submitted for approval.",
    quiet_hours_saved: "Quiet-hour policy saved.",
    test_delivery_recorded: "Test delivery recorded to your email (quota applied).",
  };
  return map[code] || noticeMessage(code);
}

module.exports = function registerHqAdminScheduledBroadcastsRoutes(router) {
  router.get(
    "/hq/scheduled-broadcasts",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    featureGuard,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return renderHqFeatureGate(req, res, "broadcasts_scheduled");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const [broadcasts, featureLocals, quietHours] = await Promise.all([
          scheduledBroadcastService.listScheduledBroadcasts(pool, org.id),
          attachPackageFeatureLocals(req, "hq"),
          scheduledBroadcastService.getQuietHoursPolicy(pool, org.id),
        ]);
        const noticeCode = flashFromQuery(req, SCHEDULED_BROADCAST_NOTICES);
        return res.render(
          "church/hq/scheduled_broadcasts",
          hqAdminLocals(req, {
            pageTitle: "Scheduled broadcasts",
            activeNav: "broadcasts-scheduled",
            broadcasts,
            quietHours,
            broadcastStatusLabel,
            broadcastAudienceLabel,
            targetScopeLabel,
            priorityLabel,
            notice: scheduledNotice(noticeCode),
            ...featureLocals,
          })
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  router.get(
    "/hq/scheduled-broadcasts/:broadcastId",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    featureGuard,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return renderHqFeatureGate(req, res, "broadcasts_scheduled");
        }
        const org = req.churchContext.organization;
        const broadcastId = Number(req.params.broadcastId);
        const pool = getPgPool();
        const broadcast = await hqBroadcastsRepo.findBroadcastByIdForOrganization(
          pool,
          broadcastId,
          org.id
        );
        if (!broadcast) {
          return res.status(404).type("text").send("Broadcast not found.");
        }
        const deliveryPage = Math.max(Number(req.query.page) || 1, 1);
        const [targets, deliveryPageResult] = await Promise.all([
          hqBroadcastsRepo.listBroadcastTargets(pool, broadcastId, org.id),
          scheduledBroadcastService.listDeliveries(pool, broadcastId, org.id, {
            page: deliveryPage,
            limit: 50,
          }),
        ]);
        const noticeCode = flashFromQuery(req, SCHEDULED_BROADCAST_NOTICES);
        return res.render(
          "church/hq/scheduled_broadcast_detail",
          hqAdminLocals(req, {
            pageTitle: "Scheduled broadcast",
            activeNav: "broadcasts-scheduled",
            broadcast,
            targets,
            deliveries: deliveryPageResult.rows,
            deliveryPagination: {
              page: deliveryPageResult.page,
              total: deliveryPageResult.total,
              totalPages: deliveryPageResult.totalPages,
              prevUrl:
                deliveryPageResult.page > 1
                  ? `/hq/scheduled-broadcasts/${broadcastId}?page=${deliveryPageResult.page - 1}`
                  : null,
              nextUrl:
                deliveryPageResult.page < deliveryPageResult.totalPages
                  ? `/hq/scheduled-broadcasts/${broadcastId}?page=${deliveryPageResult.page + 1}`
                  : null,
            },
            broadcastStatusLabel,
            broadcastAudienceLabel,
            targetScopeLabel,
            priorityLabel,
            notice: scheduledNotice(noticeCode),
          })
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    "/hq/scheduled-broadcasts/:broadcastId/preview",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    featureGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Scheduled broadcasts require Growth.");
        }
        await scheduledBroadcastService.moveToPreview(
          getPgPool(),
          Number(req.params.broadcastId),
          req.churchContext.organization.id
        );
        return res.redirect(303, `/hq/scheduled-broadcasts/${req.params.broadcastId}?notice=moved_preview`);
      } catch (err) {
        if (err && (err.code === "INVALID_STATUS" || err.code === "NOT_FOUND")) {
          return res.status(400).type("text").send(err.message);
        }
        return next(err);
      }
    }
  );

  router.post(
    "/hq/scheduled-broadcasts/:broadcastId/estimate",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    featureGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Scheduled broadcasts require Growth.");
        }
        await scheduledBroadcastService.computeAndStoreAudienceEstimate(
          getPgPool(),
          Number(req.params.broadcastId),
          req.churchContext.organization.id
        );
        return res.redirect(303, `/hq/scheduled-broadcasts/${req.params.broadcastId}?notice=estimate_ready`);
      } catch (err) {
        if (err && (err.code === "INVALID_STATUS" || err.code === "NOT_FOUND")) {
          return res.status(400).type("text").send(err.message);
        }
        return next(err);
      }
    }
  );

  router.post(
    "/hq/scheduled-broadcasts/:broadcastId/submit-approval",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    featureGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Scheduled broadcasts require Growth.");
        }
        await scheduledBroadcastService.submitForApproval(
          getPgPool(),
          Number(req.params.broadcastId),
          req.churchContext.organization.id
        );
        return res.redirect(
          303,
          `/hq/broadcasts/${req.params.broadcastId}/confirm-publish?notice=submitted_approval`
        );
      } catch (err) {
        if (err && (err.code === "INVALID_STATUS" || err.code === "NOT_FOUND")) {
          return res.status(400).type("text").send(err.message);
        }
        return next(err);
      }
    }
  );

  router.post(
    "/hq/scheduled-broadcasts/:broadcastId/cancel",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    featureGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Scheduled broadcasts require Growth.");
        }
        await scheduledBroadcastService.cancelScheduledBroadcast(
          getPgPool(),
          Number(req.params.broadcastId),
          req.churchContext.organization.id,
          req.churchHqAdmin.hq_admin_id
        );
        return res.redirect(303, `/hq/scheduled-broadcasts?notice=broadcast_cancelled`);
      } catch (err) {
        if (err && (err.code === "INVALID_STATUS" || err.code === "NOT_FOUND")) {
          return res.status(400).type("text").send(err.message);
        }
        return next(err);
      }
    }
  );

  router.post(
    "/hq/scheduled-broadcasts/:broadcastId/retry",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    featureGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Scheduled broadcasts require Growth.");
        }
        await scheduledBroadcastService.retryFailedDeliveries(
          getPgPool(),
          Number(req.params.broadcastId),
          req.churchContext.organization.id
        );
        return res.redirect(
          303,
          `/hq/scheduled-broadcasts/${req.params.broadcastId}?notice=broadcast_retried`
        );
      } catch (err) {
        if (err && (err.code === "INVALID_STATUS" || err.code === "NOT_FOUND")) {
          return res.status(400).type("text").send(err.message);
        }
        return next(err);
      }
    }
  );

  router.post(
    "/hq/scheduled-broadcasts/quiet-hours",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    featureGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Scheduled broadcasts require Growth.");
        }
        await scheduledBroadcastService.saveQuietHoursPolicy(
          getPgPool(),
          req.churchContext.organization.id,
          req.churchHqAdmin.hq_admin_id,
          req.body || {}
        );
        return res.redirect(303, "/hq/scheduled-broadcasts?notice=quiet_hours_saved");
      } catch (err) {
        if (err && (err.code === "VALIDATION" || err.code === "FOUNDATION_SCHEDULE_FORBIDDEN")) {
          return res.status(err.code === "VALIDATION" ? 400 : 403).type("text").send(err.message);
        }
        return next(err);
      }
    }
  );

  router.post(
    "/hq/scheduled-broadcasts/:broadcastId/test-delivery",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    featureGuard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        if (!req.packageFeatureUi || req.packageFeatureUi.state !== "available") {
          return res.status(403).type("text").send("Scheduled broadcasts require Growth.");
        }
        await scheduledBroadcastService.testBroadcastDelivery(getPgPool(), {
          broadcastId: Number(req.params.broadcastId),
          organizationId: req.churchContext.organization.id,
          hqAdminId: req.churchHqAdmin.hq_admin_id,
        });
        return res.redirect(
          303,
          `/hq/scheduled-broadcasts/${req.params.broadcastId}?notice=test_delivery_recorded`
        );
      } catch (err) {
        if (
          err &&
          ["NOT_FOUND", "FORBIDDEN", "CONSENT_REQUIRED", "PACKAGE_EXTERNAL_EMAIL_LIMIT", "FOUNDATION_SCHEDULE_FORBIDDEN"].includes(
            err.code
          )
        ) {
          return res
            .status(err.code === "PACKAGE_EXTERNAL_EMAIL_LIMIT" || err.code === "FOUNDATION_SCHEDULE_FORBIDDEN" ? 409 : 400)
            .type("text")
            .send(err.message);
        }
        return next(err);
      }
    }
  );
};
