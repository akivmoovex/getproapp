"use strict";

/**
 * ActiveClinic Platform Admin clinic registration review.
 * Route-location hygiene only relative to website-admin: URLs, CSRF, and
 * permissions stay the same. Not a universal application-review module.
 */

const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const {
  approveAndProvisionClinicRegistration,
  rejectClinicRegistration,
} = require("../services/approveClinicRegistrationService");
const {
  listClinicRegistrationApplications,
  getClinicRegistrationDetail,
  requestClinicRegistrationInformation,
  markClinicRegistrationInformationReturned,
  addClinicRegistrationReviewNote,
} = require("../services/clinicRegistrationReviewService");
const { requirePlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const { getDeploymentEnvMode } = require("../../church/blessBoardEnv");
const { PRODUCT } = require("../../platform/registration/constants");
const { loadTenantHealthSummary } = require("../../platform/registration/tenantHealthSummary");

function actorId(req) {
  const ctx = req.platformAdminContext || {};
  return ctx.platformIdentityId || ctx.userId || null;
}

function clinicRegDetailPath(applicationId) {
  return `/admin/clinic-registrations/${encodeURIComponent(applicationId)}`;
}

function isAcknowledged(body) {
  const raw = body && body.acknowledge_existing_identity;
  return raw === "1" || raw === "on" || raw === true || raw === "true";
}

/**
 * Provisioning and review audit require a deployment-code string.
 * getPlatformDeploymentCode() returns { ok, status, code } — never pass that object through.
 * requirePlatformDeploymentCode() returns a string on success and fails closed otherwise.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true, code: string } | { ok: false, error: string }}
 */
function resolveClinicRegistrationDeploymentCode(env) {
  const required = requirePlatformDeploymentCode(env);
  if (!required.ok) {
    return { ok: false, error: "deployment_unavailable" };
  }
  return { ok: true, code: required.code };
}

function registerActiveClinicPlatformAdminClinicRegistrationRoutes(router, deps) {
  const {
    getPool,
    env,
    requireApex,
    requirePlatformAdmin,
    renderPlatformAdminView,
    buildPlatformAdminShellLocals,
    setAdminNoStore,
  } = deps;

  router.get("/admin/clinic-registrations", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const listed = await listClinicRegistrationApplications(getPool(), {
        status: req.query.status,
        followUpStatus: req.query.follow_up_status,
        provisioningStatus: req.query.provisioning_status,
        q: req.query.q,
      });
      const html = renderPlatformAdminView("platform-admin/clinic-registrations.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "clinic-registrations",
          pageTitle: "Clinic Registrations",
        }),
        applications: listed.applications,
        filters: listed.filters,
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/admin/clinic-registrations/:applicationId", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const detail = await getClinicRegistrationDetail(getPool(), req.params.applicationId);
      if (!detail.ok) {
        return res.redirect(303, "/admin/clinic-registrations?error=not_found");
      }
      let tenantHealth = null;
      try {
        tenantHealth = await loadTenantHealthSummary(getPool(), {
          productCode: PRODUCT.ACTIVECLINIC,
          applicationId: detail.application && detail.application.id,
          organizationId: detail.application && detail.application.organization_id,
          application: detail.application,
        });
      } catch {
        tenantHealth = null;
      }
      const html = renderPlatformAdminView("platform-admin/clinic-registration-detail.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "clinic-registrations",
          pageTitle: "Clinic registration",
        }),
        application: detail.application,
        reviewHistory: detail.history,
        reviewNotes: detail.notes,
        identityCollision: detail.identityCollision || null,
        websiteState: detail.websiteState || "not_provisioned",
        tenantHealth,
        notice: String(req.query.notice || ""),
        error: String(req.query.error || ""),
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  router.post("/admin/clinic-registrations/:applicationId/approve", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, "/admin/clinic-registrations?error=csrf");
      }
      const deployment = resolveClinicRegistrationDeploymentCode(env);
      if (!deployment.ok) {
        return res.redirect(
          303,
          `${clinicRegDetailPath(req.params.applicationId)}?error=${encodeURIComponent(deployment.error)}`
        );
      }
      const mode = getDeploymentEnvMode(env);
      const result = await approveAndProvisionClinicRegistration(getPool(), {
        applicationId: req.params.applicationId,
        actorIdentityId: actorId(req),
        dataEnvironment: mode === "production" ? "production" : "testing",
        deploymentCode: deployment.code,
        acknowledgeExistingIdentity: isAcknowledged(req.body),
        env,
      });
      if (!result.ok) {
        return res.redirect(
          303,
          `${clinicRegDetailPath(req.params.applicationId)}?error=${encodeURIComponent(result.code)}`
        );
      }
      return res.redirect(303, `${clinicRegDetailPath(req.params.applicationId)}?notice=approved`);
    } catch (err) {
      return next(err);
    }
  });

  router.post("/admin/clinic-registrations/:applicationId/request-information", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, `${clinicRegDetailPath(req.params.applicationId)}?error=csrf`);
      }
      const deployment = resolveClinicRegistrationDeploymentCode(env);
      if (!deployment.ok) {
        return res.redirect(
          303,
          `${clinicRegDetailPath(req.params.applicationId)}?error=${encodeURIComponent(deployment.error)}`
        );
      }
      const result = await requestClinicRegistrationInformation(getPool(), {
        applicationId: req.params.applicationId,
        actorId: actorId(req),
        requestText: req.body && req.body.request_text,
        deploymentCode: deployment.code,
        env,
      });
      if (!result.ok) {
        return res.redirect(
          303,
          `${clinicRegDetailPath(req.params.applicationId)}?error=${encodeURIComponent(result.code)}`
        );
      }
      return res.redirect(
        303,
        `${clinicRegDetailPath(req.params.applicationId)}?notice=information_requested`
      );
    } catch (err) {
      return next(err);
    }
  });

  router.post("/admin/clinic-registrations/:applicationId/information-returned", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, `${clinicRegDetailPath(req.params.applicationId)}?error=csrf`);
      }
      const deployment = resolveClinicRegistrationDeploymentCode(env);
      if (!deployment.ok) {
        return res.redirect(
          303,
          `${clinicRegDetailPath(req.params.applicationId)}?error=${encodeURIComponent(deployment.error)}`
        );
      }
      const result = await markClinicRegistrationInformationReturned(getPool(), {
        applicationId: req.params.applicationId,
        actorId: actorId(req),
        note: req.body && req.body.return_note,
        deploymentCode: deployment.code,
      });
      if (!result.ok) {
        return res.redirect(
          303,
          `${clinicRegDetailPath(req.params.applicationId)}?error=${encodeURIComponent(result.code)}`
        );
      }
      return res.redirect(
        303,
        `${clinicRegDetailPath(req.params.applicationId)}?notice=information_returned`
      );
    } catch (err) {
      return next(err);
    }
  });

  router.post("/admin/clinic-registrations/:applicationId/notes", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, `${clinicRegDetailPath(req.params.applicationId)}?error=csrf`);
      }
      const result = await addClinicRegistrationReviewNote(getPool(), {
        applicationId: req.params.applicationId,
        actorId: actorId(req),
        body: req.body && req.body.note_body,
      });
      if (!result.ok) {
        return res.redirect(
          303,
          `${clinicRegDetailPath(req.params.applicationId)}?error=${encodeURIComponent(result.code)}`
        );
      }
      return res.redirect(303, `${clinicRegDetailPath(req.params.applicationId)}?notice=note_saved`);
    } catch (err) {
      return next(err);
    }
  });

  router.post("/admin/clinic-registrations/:applicationId/reject", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, "/admin/clinic-registrations?error=csrf");
      }
      const result = await rejectClinicRegistration(getPool(), {
        applicationId: req.params.applicationId,
        actorIdentityId: actorId(req),
        rejectionReason: req.body && req.body.rejection_reason,
      });
      if (!result.ok) {
        return res.redirect(
          303,
          `${clinicRegDetailPath(req.params.applicationId)}?error=${encodeURIComponent(result.code)}`
        );
      }
      return res.redirect(303, `${clinicRegDetailPath(req.params.applicationId)}?notice=rejected`);
    } catch (err) {
      return next(err);
    }
  });
}

module.exports = {
  registerActiveClinicPlatformAdminClinicRegistrationRoutes,
  resolveClinicRegistrationDeploymentCode,
};
