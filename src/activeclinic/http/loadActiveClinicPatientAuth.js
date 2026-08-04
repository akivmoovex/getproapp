"use strict";

/**
 * Resolve ActiveClinic patient portal request context from deployment session.
 */

const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const {
  isIdentityUsable,
  mapIdentity,
} = require("../../platform/services/platformIdentityService");
const {
  resolvePatientForIdentity,
} = require("../services/activeClinicPatientPortalAuthService");

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createLoadActiveClinicPatientAuth(deps) {
  const getPool = deps.getPool;

  return async function loadActiveClinicPatientAuth(req, res, next) {
    req.activeClinicPatientAuth = {
      authenticated: false,
      reason: "none",
      platformIdentity: null,
      organization: null,
      healthcareOrganization: null,
      patient: null,
      clinicKey: null,
      session: null,
    };

    try {
      const v5 = req.v5Session;
      if (!v5 || !v5.authenticated || !v5.session) {
        req.activeClinicPatientAuth.reason = (v5 && v5.reason) || "unauthenticated";
        return next();
      }

      const session = v5.session;
      if (session.principalType !== "platform_identity" || !session.platformIdentityId) {
        req.activeClinicPatientAuth.reason = "wrong_principal";
        return next();
      }

      if (String(session.applicationCode || "").toLowerCase() !== "activeclinic") {
        req.activeClinicPatientAuth.reason = "product_mismatch";
        return next();
      }

      const sessionContext =
        session.contextJson && typeof session.contextJson === "object"
          ? session.contextJson
          : {};

      if (sessionContext.principalKind !== "patient") {
        req.activeClinicPatientAuth.reason = "wrong_principal_kind";
        return next();
      }

      if (!sessionContext.patientId || !sessionContext.clinicKey || !sessionContext.healthcareOrganizationId) {
        req.activeClinicPatientAuth.reason = "invalid_session_context";
        return next();
      }

      const pool = getPool();
      const identityRow = await identityRepo.findIdentityById(
        pool,
        session.platformIdentityId
      );
      if (!identityRow || !isIdentityUsable(identityRow)) {
        req.activeClinicPatientAuth.reason = "identity_disabled";
        return next();
      }

      if (!session.organizationId) {
        req.activeClinicPatientAuth.reason = "organization_required";
        return next();
      }

      const patientResolved = await resolvePatientForIdentity(pool, {
        identityId: session.platformIdentityId,
        organizationId: session.organizationId,
        healthcareOrganizationId: sessionContext.healthcareOrganizationId,
      });

      if (!patientResolved.ok) {
        req.activeClinicPatientAuth.reason = "patient_not_found";
        return next();
      }

      if (patientResolved.patient.id !== sessionContext.patientId) {
        req.activeClinicPatientAuth.reason = "patient_mismatch";
        return next();
      }

      const orgRow = await pool.query(
        `SELECT id, organization_key, display_name, data_environment
         FROM platform.organizations
         WHERE id = $1 AND status = 'active'
         LIMIT 1`,
        [session.organizationId]
      );

      if (!orgRow.rows[0]) {
        req.activeClinicPatientAuth.reason = "organization_not_found";
        return next();
      }

      const hcoRow = await pool.query(
        `SELECT id, legal_name, public_name, website_published
         FROM activeclinic.healthcare_organizations
         WHERE id = $1 AND organization_id = $2 AND status = 'active'
         LIMIT 1`,
        [sessionContext.healthcareOrganizationId, session.organizationId]
      );

      if (!hcoRow.rows[0]) {
        req.activeClinicPatientAuth.reason = "healthcare_organization_not_found";
        return next();
      }

      req.activeClinicPatientAuth = {
        authenticated: true,
        reason: "ok",
        platformIdentity: mapIdentity(identityRow),
        organization: {
          id: orgRow.rows[0].id,
          key: orgRow.rows[0].organization_key,
          displayName: orgRow.rows[0].display_name,
          dataEnvironment: orgRow.rows[0].data_environment,
        },
        healthcareOrganization: {
          id: hcoRow.rows[0].id,
          legalName: hcoRow.rows[0].legal_name,
          publicName: hcoRow.rows[0].public_name,
          clinicKey: sessionContext.clinicKey || orgRow.rows[0].organization_key,
          websitePublished: hcoRow.rows[0].website_published === true,
        },
        patient: patientResolved.patient,
        clinicKey: sessionContext.clinicKey || orgRow.rows[0].organization_key,
        session,
      };

      return next();
    } catch {
      req.activeClinicPatientAuth.reason = "lookup_error";
      return next();
    }
  };
}

/**
 * Require authenticated patient context.
 */
function createRequireActiveClinicPatientAuth(options) {
  const loginPath = (options && options.loginPath) || "/login";
  const env = (options && options.env) || process.env;
  const isProduction =
    options && Object.prototype.hasOwnProperty.call(options, "isProduction")
      ? options.isProduction === true
      : String(env.NODE_ENV || "") === "production";

  return function requireActiveClinicPatientAuth(req, res, next) {
    const auth = req.activeClinicPatientAuth;
    const clinicKey =
      (req.params && req.params.clinicKey) ||
      (auth && auth.clinicKey) ||
      "";
    const resolvedLoginPath =
      clinicKey && loginPath === "/login"
        ? `/clinics/${clinicKey}/patient/login`
        : loginPath;

    if (!auth || !auth.authenticated) {
      const reason = (auth && auth.reason) || "unauthenticated";
      const contextDenied =
        reason === "identity_disabled" ||
        reason === "patient_not_found" ||
        reason === "healthcare_organization_not_found" ||
        reason === "organization_not_found" ||
        reason === "product_mismatch" ||
        reason === "wrong_principal" ||
        reason === "wrong_principal_kind" ||
        reason === "patient_mismatch" ||
        reason === "invalid_session_context";

      if (contextDenied && req.accepts("html")) {
        const {
          clearV5SessionCookie,
        } = require("../../platform/session/v5SessionCookie");
        const { getCsrfCookieName } = require("../../platform/http/v5Csrf");

        clearV5SessionCookie(res, { secure: isProduction, env });
        res.clearCookie(getCsrfCookieName(env), { path: "/" });
        return res.status(403).type("html").send(
          `<!DOCTYPE html><html><head><title>Access unavailable</title></head>
<body><h1>Patient portal access unavailable</h1>
<p>Your account cannot access this patient portal. Please contact the clinic.</p>
<p><a href="${resolvedLoginPath}">Sign in again</a></p></body></html>`
        );
      }

      if (req.accepts("html")) {
        return res.redirect(303, resolvedLoginPath);
      }
      return res.status(401).json({ ok: false, code: "unauthenticated" });
    }
    return next();
  };
}

module.exports = {
  createLoadActiveClinicPatientAuth,
  createRequireActiveClinicPatientAuth,
};
