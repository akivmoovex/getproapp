"use strict";

const { isBlessBoardApexHost } = require("./blessBoardApexHost");

function renderBlessBoardAdminHostNotFound(req, res) {
  return res.status(404).render("church/public/not_found", {
    pageTitle: "Page not found",
    requestedSlug: null,
    requestedHost: req.headers.host || "",
    metaDescription: "This admin area is only available on blessboard.com.",
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
