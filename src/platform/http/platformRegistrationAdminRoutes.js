"use strict";

const { listUnifiedRegistrations } = require("../registration/unifiedRegistrationQueue");
const { PRODUCT } = require("../registration/constants");
const { resumeOrganizationProvisioning } = require("../registration/provisioningRecovery");
const { CSRF_FIELD, validateCsrf } = require("./v5Csrf");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");

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
      const lifecycle = String(req.query.lifecycle || req.query.status || "").trim().toLowerCase();
      const rows = await listUnifiedRegistrations(getPool(), { product, q, lifecycle, limit: 100 });
      const html = renderPlatformAdminView("platform-admin/registrations.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "registrations",
          pageTitle: "Registrations",
        }),
        registrations: rows,
        filters: { product, q, lifecycle },
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  router.post(
    "/admin/registrations/:product/:id/retry-provision",
    requireApex,
    requirePlatformAdmin,
    async (req, res, next) => {
      try {
        setAdminNoStore(res);
        const productCode = String(req.params.product || "").trim().toLowerCase();
        const id = String(req.params.id || "").trim();
        const listPath = "/admin/registrations";
        const submitted = req.body && req.body[CSRF_FIELD];
        if (!validateCsrf(req, submitted, env)) {
          return res.redirect(303, `${listPath}?error=csrf`);
        }
        if (productCode !== PRODUCT.ACTIVECLINIC && productCode !== PRODUCT.BLESSBOARD) {
          return res.redirect(303, `${listPath}?error=invalid`);
        }
        const deployment = getPlatformDeploymentCode(env);
        const actorUserId =
          req.platformAdminContext && req.platformAdminContext.userId
            ? req.platformAdminContext.userId
            : null;
        const result = await resumeOrganizationProvisioning(getPool(), {
          productCode,
          applicationId: id,
          actorUserId,
          actorIdentityId: actorUserId,
          dataEnvironment: "testing",
          deploymentCode: deployment && deployment.ok ? deployment.code : undefined,
          env,
        });
        const detailHref =
          productCode === PRODUCT.ACTIVECLINIC
            ? `/admin/clinic-registrations/${encodeURIComponent(id)}`
            : `/admin/registration-applications/${encodeURIComponent(id)}`;
        if (!result || result.ok === false) {
          return res.redirect(303, `${detailHref}?error=retry_failed`);
        }
        return res.redirect(303, `${detailHref}?notice=provision_retried`);
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerPlatformRegistrationAdminRoutes,
};
