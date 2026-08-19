"use strict";

/**
 * Resolve ActiveClinic authenticated request context from deployment session.
 */

const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const {
  isIdentityUsable,
  mapIdentity,
} = require("../../platform/services/platformIdentityService");
const {
  resolveEligibleOrganization,
} = require("../services/activeClinicLoginEligibility");
const {
  getActiveStaffFacilityAssignment,
} = require("../services/activeClinicStaffFacilityService");
const {
  resolveEffectivePermissions,
} = require("../services/activeClinicAuthorizationService");
const {
  deploymentAllowsPlatformIdentityPrincipal,
} = require("../../platform/session/deploymentApplicationCompatibility");

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createLoadActiveClinicAuth(deps) {
  const getPool = deps.getPool;

  return async function loadActiveClinicAuth(req, res, next) {
    req.activeClinicAuth = {
      authenticated: false,
      reason: "none",
      platformIdentity: null,
      organization: null,
      organizationProduct: null,
      healthcareOrganization: null,
      staffMember: null,
      facilityAssignments: [],
      roleAssignments: [],
      permissions: [],
      selectedFacility: null,
      mustChangePassword: false,
      session: null,
    };

    try {
      const v5 = req.v5Session;
      if (!v5 || !v5.authenticated || !v5.session) {
        req.activeClinicAuth.reason = (v5 && v5.reason) || "unauthenticated";
        return next();
      }
      const session = v5.session;
      if (session.principalType !== "platform_identity" || !session.platformIdentityId) {
        req.activeClinicAuth.reason = "wrong_principal";
        return next();
      }
      if (!deploymentAllowsPlatformIdentityPrincipal(session.applicationCode)) {
        req.activeClinicAuth.reason = "product_mismatch";
        return next();
      }
      if (
        req.platform &&
        req.platform.productKey &&
        String(req.platform.productKey).toLowerCase() !== "activeclinic"
      ) {
        req.activeClinicAuth.reason = "product_mismatch";
        return next();
      }

      const pool = getPool();
      const identityRow = await identityRepo.findIdentityById(
        pool,
        session.platformIdentityId
      );
      if (!identityRow || !isIdentityUsable(identityRow)) {
        req.activeClinicAuth.reason = "identity_disabled";
        return next();
      }

      if (!session.organizationId) {
        req.activeClinicAuth.reason = "organization_required";
        return next();
      }

      const resolved = await resolveEligibleOrganization(pool, {
        platformIdentityId: session.platformIdentityId,
        organizationId: session.organizationId,
      });
      if (!resolved.ok) {
        req.activeClinicAuth.reason = "eligibility_denied";
        return next();
      }

      const elig = resolved.eligibility;
      let selectedFacility = null;
      const sessionContext =
        session.contextJson && typeof session.contextJson === "object"
          ? session.contextJson
          : {};
      const requestedFacilityId =
        sessionContext.selectedFacilityId ||
        elig.defaultFacilityId ||
        null;

      if (requestedFacilityId) {
        const assignment = await getActiveStaffFacilityAssignment(pool, {
          staffMemberId: elig.staffMember.id,
          facilityId: requestedFacilityId,
          organizationId: elig.organization.id,
        });
        if (assignment.ok || elig.isNetworkAdmin) {
          const fac = await pool.query(
            `SELECT * FROM activeclinic.facilities
              WHERE id = $1 AND organization_id = $2 AND status = 'active'
              LIMIT 1`,
            [requestedFacilityId, elig.organization.id]
          );
          if (fac.rows[0]) {
            selectedFacility = {
              id: fac.rows[0].id,
              facilityKey: fac.rows[0].facility_key,
              displayName: fac.rows[0].display_name,
              status: fac.rows[0].status,
              isPrimary: fac.rows[0].is_primary === true,
            };
          }
        }
      }

      // Facility-scoped effective permissions for nav/context. Route gates also
      // re-authorize live via authorizeStaffPermission (no session perm cache).
      let permissions = elig.permissions || [];
      if (selectedFacility) {
        const scoped = await resolveEffectivePermissions(pool, {
          organizationId: elig.organization.id,
          staffMemberId: elig.staffMember.id,
          platformIdentityId: identityRow.id,
          facilityId: selectedFacility.id,
        });
        if (scoped.ok) permissions = scoped.permissions;
      }

      req.activeClinicAuth = {
        authenticated: true,
        reason: "ok",
        platformIdentity: mapIdentity(identityRow),
        organization: elig.organization,
        organizationProduct: elig.organizationProduct,
        healthcareOrganization: elig.healthcareOrganization,
        staffMember: elig.staffMember,
        facilityAssignments: elig.facilityAssignments,
        roleAssignments: elig.roleAssignments,
        permissions,
        selectedFacility,
        mustChangePassword: identityRow.must_change_password === true,
        session,
        isNetworkAdmin: elig.isNetworkAdmin,
        provisioningIncomplete: elig.provisioningIncomplete === true,
        failedStage: elig.failedStage || null,
        // P07 billing/cashier compatibility aliases
        tenantId: elig.organization && elig.organization.id,
        staff: elig.staffMember,
      };
      return next();
    } catch {
      req.activeClinicAuth.reason = "lookup_error";
      return next();
    }
  };
}

/**
 * Require authenticated ActiveClinic context. Password-change gate optional.
 * Eligibility / identity failures clear the ActiveClinic session and render a
 * context-unavailable state (no login↔app redirect loop).
 */
function createRequireActiveClinicAuth(options) {
  const allowPasswordChangeOnly = Boolean(options && options.allowPasswordChangeOnly);
  const loginPath = (options && options.loginPath) || "/login";
  const changePasswordPath =
    (options && options.changePasswordPath) || "/account/change-password";
  const env = (options && options.env) || process.env;
  const isProduction =
    options && Object.prototype.hasOwnProperty.call(options, "isProduction")
      ? options.isProduction === true
      : String(env.NODE_ENV || "") === "production";

  return function requireActiveClinicAuth(req, res, next) {
    const auth = req.activeClinicAuth;
    const patientAuth = req.activeClinicPatientAuth;
    const sessionContext =
      req.v5Session &&
      req.v5Session.session &&
      req.v5Session.session.contextJson &&
      typeof req.v5Session.session.contextJson === "object"
        ? req.v5Session.session.contextJson
        : {};

    // Patient portal sessions must never be cleared by staff gates.
    if (
      sessionContext.principalKind === "patient" ||
      (patientAuth && patientAuth.authenticated)
    ) {
      if (req.accepts("html")) {
        return res.redirect(303, loginPath);
      }
      return res.status(403).json({ ok: false, code: "wrong_principal_kind" });
    }

    if (!auth || !auth.authenticated) {
      const reason = (auth && auth.reason) || "unauthenticated";
      const contextDenied =
        reason === "eligibility_denied" ||
        reason === "identity_disabled" ||
        reason === "inactive_identity" ||
        reason === "product_mismatch" ||
        reason === "wrong_principal";

      if (contextDenied && req.accepts("html")) {
        const {
          clearV5SessionCookie,
        } = require("../../platform/session/v5SessionCookie");
        const { getCsrfCookieName, CSRF_FIELD, issueCsrfToken, setCsrfCookie } = require(
          "../../platform/http/v5Csrf"
        );
        const {
          renderAccessStatePage,
        } = require("./renderActiveClinicAccessState");
        const {
          STATE,
        } = require("../services/activeClinicStateTaxonomy");

        clearV5SessionCookie(res, { secure: isProduction, env, req });
        res.clearCookie(getCsrfCookieName(env, req), { path: "/" });
        const csrfToken = issueCsrfToken(env);
        setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
        return res.status(403).type("html").send(
          renderAccessStatePage({
            stateKey: STATE.CONTEXT_UNAVAILABLE,
            pageId: "context-unavailable",
            pageTitle: "Workspace unavailable",
            heading: "This ActiveClinic workspace is currently unavailable",
            message:
              "Your account cannot access this workspace right now. Sign in again, or contact your administrator.",
            primaryHref: "/login",
            primaryLabel: "Sign in",
            showLogout: true,
            csrfField: CSRF_FIELD,
            csrfToken,
          })
        );
      }

      if (req.accepts("html")) {
        return res.redirect(303, loginPath);
      }
      return res.status(401).json({ ok: false, code: "unauthenticated" });
    }
    if (auth.mustChangePassword && !allowPasswordChangeOnly) {
      const pathOnly = String(req.path || "").split("?")[0];
      if (
        pathOnly !== changePasswordPath &&
        pathOnly !== "/logout" &&
        !pathOnly.startsWith("/account/change-password")
      ) {
        if (req.accepts("html")) {
          return res.redirect(303, changePasswordPath);
        }
        return res.status(403).json({ ok: false, code: "password_change_required" });
      }
    }
    return next();
  };
}

module.exports = {
  createLoadActiveClinicAuth,
  createRequireActiveClinicAuth,
};
