"use strict";

const { getPgPool } = require("../../db/pg");
const { requireChurchHqAdminSession } = require("../../church/hqAuth");
const { requireChurchBranchHost } = require("./auth");
const { hqAdminLocals } = require("./hqAdminShared");
const churchPlatformSupportAccessService = require("../../services/church/churchPlatformSupportAccessService");

module.exports = function registerHqAdminSupportAccessRoutes(router) {
  router.get(
    "/hq/support-access",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const organizationId = Number(req.churchContext.organization.id);
        const history = await churchPlatformSupportAccessService.listChurchVisibleHistory(
          pool,
          organizationId,
          { limit: 50 }
        );
        return res.render(
          "church/hq/support_access_history",
          hqAdminLocals(req, {
            pageTitle: "Support access history",
            activeNav: "support-access",
            history,
          })
        );
      } catch (err) {
        return next(err);
      }
    }
  );
};
