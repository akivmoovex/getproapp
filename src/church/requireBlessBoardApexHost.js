"use strict";

const { isBlessBoardApexHost } = require("./blessBoardApexHost");

function renderBlessBoardAdminHostNotFound(req, res) {
  return res.status(404).render("church/public/platform_admin_not_available", {
    pageTitle: "Platform admin not available",
    requestedHost: req.headers.host || "",
    metaDescription: "BlessBoard platform admin is only available at blessboard.com.",
  });
}

/**
 * Allow BlessBoard platform admin only on blessboard.com / www.blessboard.com.
 */
function requireBlessBoardApexHost(req, res, next) {
  if (isBlessBoardApexHost(req)) return next();
  return renderBlessBoardAdminHostNotFound(req, res);
}

module.exports = {
  requireBlessBoardApexHost,
  renderBlessBoardAdminHostNotFound,
};
