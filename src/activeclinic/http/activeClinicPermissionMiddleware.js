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
const { getCsrfCookieName, CSRF_FIELD, issueCsrfToken, setCsrfCookie } = require("../../platform/http/v5Csrf");
const {
  renderAccessStatePage,
} = require("./renderActiveClinicAccessState");

const {
  STATE,
} = require("../services/activeClinicStateTaxonomy");
const {
  assertModuleDepartmentAvailable,
  RESULT: MODULE_RESULT,
} = require("../services/activeClinicModuleAvailability");
const {
  PERM: DEPT_PERM,
} = require("../services/activeClinicDepartmentService");

function issueAccessStateCsrf(res, env, isProduction, req) {
  const csrfToken = issueCsrfToken(env);
  setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
  return csrfToken;
}

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
            clearV5SessionCookie(res, { secure: isProduction, env, req });
            res.clearCookie(getCsrfCookieName(env, req), { path: "/" });
            const csrfToken = issueAccessStateCsrf(res, env, isProduction, req);
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
                  showLogout: true,
                  csrfToken,
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
          const csrfToken = issueAccessStateCsrf(res, env, isProduction, req);
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

/**
 * Server-side department availability gate (after permission checks).
 * Does not convert authorization failures into department-unavailable.
 * @param {{ getPool: Function, env?: NodeJS.ProcessEnv }} deps
 */
function createRequireActiveClinicDepartment(deps) {
  const getPool = deps.getPool;
  const env = deps.env || process.env;
  const isProduction =
    deps && Object.prototype.hasOwnProperty.call(deps, "isProduction")
      ? deps.isProduction === true
      : String(env.NODE_ENV || "") === "production";

  return function requireActiveClinicDepartment(moduleKey) {
    return async function departmentMiddleware(req, res, next) {
      try {
        const auth = req.activeClinicAuth;
        if (!auth || !auth.authenticated) {
          return res.redirect(303, "/login");
        }
        if (!auth.selectedFacility || !auth.selectedFacility.id) {
          const returnTo = encodeURIComponent(req.originalUrl || req.url || "/app");
          return res.redirect(303, `/app/select-facility?return=${returnTo}`);
        }

        const checked = await assertModuleDepartmentAvailable(getPool(), {
          moduleKey,
          auth,
        });
        if (checked.ok) return next();

        if (checked.result === MODULE_RESULT.FACILITY_REQUIRED) {
          const returnTo = encodeURIComponent(req.originalUrl || req.url || "/app");
          return res.redirect(303, `/app/select-facility?return=${returnTo}`);
        }

        const canManage =
          Array.isArray(auth.permissions) &&
          auth.permissions.includes(DEPT_PERM.MANAGE);
        const csrfToken = issueAccessStateCsrf(res, env, isProduction, req);
        return res.status(403).type("html").send(
          renderSimpleState(
            "Department unavailable",
            canManage
              ? "This module needs an active department for the current facility. Configure departments in Clinic Setup."
              : "This module is not available at the current facility.",
            {
              state: "department-unavailable",
              stateKey: STATE.DEPARTMENT_NOT_CONFIGURED,
              heading: "This department is not available",
              linkHref: canManage
                ? "/app/settings/clinic-setup/departments"
                : "/app",
              linkLabel: canManage ? "Clinic departments" : "Back to home",
              showLogout: true,
              csrfToken,
            }
          )
        );
      } catch (err) {
        return next(err);
      }
    };
  };
}

module.exports = {
  createRequireActiveClinicPermission,
  createRequireActiveClinicDepartment,
  requireActiveClinicOrganizationScope,
  requireActiveClinicFacilityScope,
  renderSimpleState,
};
