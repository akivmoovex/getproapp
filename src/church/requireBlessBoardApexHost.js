"use strict";

const { isBlessBoardApexHost } = require("./blessBoardApexHost");
const { getBlessBoardPublicUrl, getBlessBoardAdminUrl } = require("./blessBoardEnv");

function renderBlessBoardAdminHostNotFound(req, res) {
  const publicUrl = getBlessBoardPublicUrl();
  return res.status(404).render("church/public/platform_admin_not_available", {
    pageTitle: "Platform admin not available",
    requestedHost: req.headers.host || "",
    metaDescription: `BlessBoard platform admin is only available at the BlessBoard apex host.`,
    blessboardPublicUrl: publicUrl,
    blessboardAdminLoginUrl: `${getBlessBoardAdminUrl()}/admin/login`,
  });
}

/**
 * Allow BlessBoard platform admin only on configured BlessBoard apex hosts.
 */
function requireBlessBoardApexHost(req, res, next) {
  if (isBlessBoardApexHost(req)) return next();
  return renderBlessBoardAdminHostNotFound(req, res);
}

module.exports = {
  requireBlessBoardApexHost,
  renderBlessBoardAdminHostNotFound,
};
