"use strict";

const express = require("express");
const registerChurchAuthRoutes = require("./auth");
const registerBranchAdminRoutes = require("./branchAdmin");
const registerHqAdminRoutes = require("./hqAdmin");
const registerMemberPortalRoutes = require("./memberPortal");
const registerLeaderPortalRoutes = require("./leaderPortal");
const registerPublicPagesRoutes = require("./publicPages");
const registerPublicChurchDirectoryRoutes = require("./publicChurchDirectory");
const registerPlatformPublicPagesRoutes = require("./platformPublicPages");
const registerPlatformPublicFormRoutes = require("./platformPublicForms");
const { registerPlatformPublicSeoRoutes } = require("../../church/platformPublicSeo");
const { churchOperationalAccessGate } = require("../../church/churchStatusAccess");
const { createAttachChurchPublicBranchPath } = require("../../church/attachChurchPublicBranchPath");
const { churchFailureErrorHandler, renderChurchFailureState } = require("../../church/churchFailureStates");

function requireChurchHost(req, res, next) {
  if (!req.isChurchHost || !req.churchContext) {
    return next("router");
  }
  return next();
}

module.exports = function churchRoutes() {
  const router = express.Router();

  router.use(requireChurchHost);
  router.use(churchOperationalAccessGate);
  router.use(createAttachChurchPublicBranchPath());

  registerPlatformPublicFormRoutes(router);
  registerPlatformPublicSeoRoutes(router);
  registerPublicPagesRoutes(router);
  registerPlatformPublicPagesRoutes(router);
  registerPublicChurchDirectoryRoutes(router);
  registerChurchAuthRoutes(router);
  registerMemberPortalRoutes(router);
  require("./memberAppointmentsSurveys")(router);
  registerLeaderPortalRoutes(router);
  registerBranchAdminRoutes(router);
  registerHqAdminRoutes(router);

  router.use((req, res, next) => {
    if (!req.isChurchHost) return next();
    return renderChurchFailureState(req, res, "not_found", {
      lead: "We could not find that page on this church site.",
    });
  });

  router.use(churchFailureErrorHandler);

  return router;
};
