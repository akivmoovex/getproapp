"use strict";

const { requireSuperAdmin } = require("../../auth");
const { getPgPool } = require("../../db/pg");
const memberPasswordResetRequestsRepo = require("../../db/pg/church/memberPasswordResetRequestsRepo");
const { churchPublicHost } = require("../../church/platformProvisioningValidation");
const { passwordResetStatusLabel } = require("../../church/memberPasswordResetRequestValidation");
const { parseMemberResetRequestParams } = require("../../church/platformMemberResetRequestValidation");
const { loadResetTimelineForDetail } = require("../../church/resetRequestTimeline");

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

module.exports = function registerAdminChurchMemberPasswordResetRequestRoutes(router) {
  router.get(
    "/church/member-password-reset-requests/:requestId",
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const parsed = parseMemberResetRequestParams(req.params, req.query);
        if (!parsed.ok) {
          return res.status(404).type("text").send("Not found");
        }

        const pool = getPgPool();
        const requestItem = await memberPasswordResetRequestsRepo.findMemberPasswordResetRequestByIdForPlatform(
          pool,
          parsed.data.requestId
        );
        if (!requestItem) {
          return res.status(404).type("text").send("Not found");
        }

        const recentForMember = requestItem.member_id
          ? await memberPasswordResetRequestsRepo.listRecentMemberPasswordResetRequestsForMember(
              pool,
              requestItem.member_id,
              { excludeRequestId: requestItem.id, limit: 5 }
            )
          : [];

        const returnTo =
          parsed.data.returnTo ||
          `/admin/church/reset-requests?request_type=member&organization_id=${requestItem.organization_id}`;

        const timeline = await loadResetTimelineForDetail(pool, "member", requestItem);

        return res.render("admin/church/member_password_reset_request_detail", {
          requestItem,
          recentForMember,
          returnTo,
          passwordResetStatusLabel,
          formatDate,
          formatDateTime,
          churchPublicHost,
          activeNav: "church_platform_reset_requests",
          ...timeline,
        });
      } catch (e) {
        return next(e);
      }
    }
  );
};
