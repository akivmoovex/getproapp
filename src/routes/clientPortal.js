const express = require("express");

function requirePublicTenant(req, res, next) {
  if (!req.tenant || !req.tenant.id) {
    return res.status(404).type("text").send("Region not found.");
  }
  return next();
}

function clientBasePath(req) {
  const b = req.baseUrl != null && String(req.baseUrl).length > 0 ? String(req.baseUrl) : "/client";
  return b.replace(/\/$/, "") || "/client";
}

/**
 * End-client portal: foundation only (no auth, no PII). Separate layout from admin and provider.
 */
module.exports = function clientPortalRoutes() {
  const router = express.Router();

  router.use((req, res, next) => {
    res.locals.clientPortalBasePath = clientBasePath(req);
    next();
  });

  router.get("/login", requirePublicTenant, (req, res) => {
    const cb = clientBasePath(req);
    return res.render("client_login", {
      tenant: req.tenant,
      tenantUrlPrefix: req.tenantUrlPrefix != null ? String(req.tenantUrlPrefix) : "",
      clientPortalBasePath: cb,
      notice: String((req.query && req.query.notice) || "").trim().slice(0, 400) || null,
    });
  });

  router.get("/", requirePublicTenant, (req, res) => {
    return res.redirect(`${clientBasePath(req)}/login`);
  });

  return router;
};
