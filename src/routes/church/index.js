"use strict";

const express = require("express");
const registerChurchAuthRoutes = require("./auth");
const registerBranchAdminRoutes = require("./branchAdmin");
const registerHqAdminRoutes = require("./hqAdmin");
const registerMemberPortalRoutes = require("./memberPortal");
const registerLeaderPortalRoutes = require("./leaderPortal");
const registerPublicPagesRoutes = require("./publicPages");
const registerPublicChurchDirectoryRoutes = require("./publicChurchDirectory");
const { churchOperationalAccessGate } = require("../../church/churchStatusAccess");

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

  registerPublicPagesRoutes(router);
  registerPublicChurchDirectoryRoutes(router);
  registerChurchAuthRoutes(router);
  registerMemberPortalRoutes(router);
  registerLeaderPortalRoutes(router);
  registerBranchAdminRoutes(router);
  registerHqAdminRoutes(router);

  return router;
};
