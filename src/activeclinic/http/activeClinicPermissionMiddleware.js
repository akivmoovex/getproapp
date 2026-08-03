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

function renderSimpleState(title, message, extras) {
  return renderAccessStatePage({
    pageId: (extras && extras.state) || "error",
    pageTitle: title,
    heading: title,
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

  return function requireActiveClinicPermission(permissionKey) {
    return async function permissionMiddleware(req, res, next) {
      try {
        const auth = req.activeClinicAuth;
        if (!auth || !auth.authenticated) {
          const reason = (auth && auth.reason) || "unauthenticated";
          if (
            reason === "inactive_identity" ||
            reason === "eligibility_denied" ||
            reason === "identity_disabled"
          ) {
            clearV5SessionCookie(res, { secure: isProduction, env });
            res.clearCookie(getCsrfCookieName(env), { path: "/" });
            return res
              .status(401)
              .type("html")
              .send(
                renderSimpleState(
                  "Session ended",
                  "Your ActiveClinic session is no longer valid. Sign in again to continue.",
                  {
                    state: "session-expired",
                    linkHref: "/login?expired=1",
                    linkLabel: "Sign in",
                  }
                )
              );
          }
          return res.redirect(303, "/login");
        }

        if (auth.mustChangePassword) {
          return res.redirect(303, "/account/change-password");
        }

        const facilityId =
          (auth.selectedFacility && auth.selectedFacility.id) || null;
        const checked = await authorizeStaffPermission(getPool(), {
          organizationId: auth.organization.id,
          staffMemberId: auth.staffMember.id,
          platformIdentityId: auth.platformIdentity.id,
          permissionKey,
          facilityId,
        });
        if (!checked.allowed) {
          const csrfToken = issueCsrfToken(env);
          return res.status(403).type("html").send(
            renderSimpleState(
              "Access Restricted",
              "You do not have permission to view this page.",
              {
                state: "access-denied",
                linkHref: "/app",
                linkLabel: "Return to home",
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
