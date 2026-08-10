"use strict";

/**
 * ActiveClinic permission / scope middleware helpers (AC-V6-10).
 * Authorization uses resolved permissions — never role-name allowlists.
 */

const {
  authorizeStaffPermission,
} = require("../services/activeClinicAuthorizationService");
const {
  clearV5SessionCookie,
} = require("../../platform/session/v5SessionCookie");
const { getCsrfCookieName, CSRF_FIELD, issueCsrfToken } = require("../../platform/http/v5Csrf");
const {
  renderAccessStatePage,
} = require("./renderActiveClinicAccessState");

const {
  STATE,
} = require("../services/activeClinicStateTaxonomy");

function renderSimpleState(title, message, extras) {
  const pageId = (extras && extras.state) || "error";
  const stateKey =
    (extras && extras.stateKey) ||
    (pageId === "session-expired"
      ? STATE.SESSION_EXPIRED
      : pageId === "context-unavailable"
        ? STATE.CONTEXT_UNAVAILABLE
        : pageId === "access-denied"
          ? STATE.ACCESS_RESTRICTED
          : pageId === "not-found"
            ? STATE.NOT_FOUND
            : STATE.REQUEST_ERROR);
  return renderAccessStatePage({
    stateKey,
    pageId,
    pageTitle: title,
    heading: (extras && extras.heading) || title,
    message,
    primaryHref: (extras && extras.linkHref) || "/login",
    primaryLabel: (extras && extras.linkLabel) || "Sign in",
    secondaryHref: (extras && extras.secondaryHref) || null,
    secondaryLabel: (extras && extras.secondaryLabel) || null,
    showLogout: extras && extras.showLogout === true,
    csrfField: CSRF_FIELD,
    csrfToken: (extras && extras.csrfToken) || "",
  });
}

/**
 * @param {{
 *   isProduction?: boolean,
 *   env?: NodeJS.ProcessEnv,
 *   getPool: Function,
 * }} deps
 */
function createRequireActiveClinicPermission(deps) {
  const getPool = deps.getPool;
  const env = deps.env || process.env;
  const isProduction = deps.isProduction === true;

  return function requireActiveClinicPermission(permissionKeyOrKeys) {
    const requiredKeys = Array.isArray(permissionKeyOrKeys)
      ? permissionKeyOrKeys.map((k) => String(k || "").trim()).filter(Boolean)
      : [String(permissionKeyOrKeys || "").trim()].filter(Boolean);

    return async function permissionMiddleware(req, res, next) {
      try {
        const auth = req.activeClinicAuth;
        if (!auth || !auth.authenticated) {
          const reason = (auth && auth.reason) || "unauthenticated";
          if (
            reason === "inactive_identity" ||
            reason === "eligibility_denied" ||
            reason === "identity_disabled" ||
            reason === "product_mismatch" ||
            reason === "wrong_principal"
          ) {
            clearV5SessionCookie(res, { secure: isProduction, env });
            res.clearCookie(getCsrfCookieName(env), { path: "/" });
            return res.status(403).type("html").send(
              renderSimpleState(
                "Workspace unavailable",
                "This ActiveClinic workspace is currently unavailable. Sign in again, or contact your administrator.",
                {
                  state: "context-unavailable",
                  stateKey: STATE.CONTEXT_UNAVAILABLE,
                  heading: "This ActiveClinic workspace is currently unavailable",
                  linkHref: "/login",
                  linkLabel: "Sign in",
                }
              )
            );
          }
          if (
            reason === "session_expired" ||
            reason === "session_revoked" ||
            reason === "unauthenticated"
          ) {
            /* fall through to login redirect */
          }
          return res.redirect(303, "/login");
        }

        if (auth.mustChangePassword) {
          return res.redirect(303, "/account/change-password");
        }

        const facilityId =
          (auth.selectedFacility && auth.selectedFacility.id) || null;
        let allowed = false;
        for (const permissionKey of requiredKeys) {
          const checked = await authorizeStaffPermission(getPool(), {
            organizationId: auth.organization.id,
            staffMemberId: auth.staffMember.id,
            platformIdentityId: auth.platformIdentity.id,
            permissionKey,
            facilityId,
          });
          if (checked.allowed) {
            allowed = true;
            break;
          }
        }
        if (!allowed) {
          const csrfToken = issueCsrfToken(env);
          return res.status(403).type("html").send(
            renderSimpleState(
              "Access restricted",
              "You do not have access to this area. Ask an administrator if you need permission, or return to an area you can use.",
              {
                state: "access-denied",
                stateKey: STATE.ACCESS_RESTRICTED,
                heading: "You do not have access to this area",
                linkHref: "/app",
                linkLabel: "Back to home",
                showLogout: true,
                csrfToken,
              }
            )
          );
        }
        return next();
      } catch (err) {
        return next(err);
      }
    };
  };
}

function requireActiveClinicOrganizationScope() {
  return function orgScopeMiddleware(req, res, next) {
    const auth = req.activeClinicAuth;
    if (!auth || !auth.authenticated || !auth.organization) {
      return res.redirect(303, "/login");
    }
    return next();
  };
}

/**
 * For facility-dependent routes. Network admins may proceed without selection
 * unless requireSelected is true.
 */
function requireActiveClinicFacilityScope(options) {
  const requireSelected = options && options.requireSelected === true;
  return function facilityScopeMiddleware(req, res, next) {
    const auth = req.activeClinicAuth;
    if (!auth || !auth.authenticated) {
      return res.redirect(303, "/login");
    }
    if (auth.isNetworkAdmin && !requireSelected) {
      return next();
    }
    if (!auth.selectedFacility) {
      return res.redirect(303, "/app/select-facility");
    }
    return next();
  };
}

module.exports = {
  createRequireActiveClinicPermission,
  requireActiveClinicOrganizationScope,
  requireActiveClinicFacilityScope,
  renderSimpleState,
};
