"use strict";

const { listUnifiedRegistrations } = require("../registration/unifiedRegistrationQueue");

function registerPlatformRegistrationAdminRoutes(router, deps) {
  const {
    getPool,
    env,
    requireApex,
    requirePlatformAdmin,
    renderPlatformAdminView,
    buildPlatformAdminShellLocals,
    setAdminNoStore,
  } = deps;

  router.get("/admin/registrations", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const product = String(req.query.product || "all").trim().toLowerCase();
      const q = String(req.query.q || "").trim();
      const rows = await listUnifiedRegistrations(getPool(), { product, q, limit: 100 });
      const html = renderPlatformAdminView("platform-admin/registrations.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "registrations",
          pageTitle: "Registrations",
        }),
        registrations: rows,
        filters: { product, q },
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });
}

module.exports = {
  registerPlatformRegistrationAdminRoutes,
};
