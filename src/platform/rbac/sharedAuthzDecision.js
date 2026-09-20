"use strict";

/**
 * Normalize authorization decisions across BlessBoard, ActiveClinic, and platform admin.
 * Product catalogues and evaluators stay product-owned; this layer standardizes outcomes.
 */

const {
  isV8Deployment,
} = require("../config/v8DeploymentIsolation");

const REASON = Object.freeze({
  ALLOWED: "RBAC_ALLOWED",
  UNAUTHENTICATED: "RBAC_UNAUTHENTICATED",
  INACTIVE_USER: "RBAC_INACTIVE_USER",
  TENANT_UNRESOLVED: "RBAC_TENANT_UNRESOLVED",
  PERMISSION_DENIED: "RBAC_PERMISSION_DENIED",
  SCOPE_MISMATCH: "RBAC_SCOPE_MISMATCH",
  FORGED_TENANT_ID: "RBAC_FORGED_TENANT_ID",
  PRODUCT_MISMATCH: "RBAC_PRODUCT_MISMATCH",
  LOOKUP_ERROR: "RBAC_LOOKUP_ERROR",
  FACILITY_REQUIRED: "RBAC_FACILITY_REQUIRED",
});

/**
 * @param {object} partial
 */
function authzDecision(partial) {
  const src = partial && typeof partial === "object" ? partial : {};
  return {
    allowed: Boolean(src.allowed),
    reasonCode: String(src.reasonCode || (src.allowed ? REASON.ALLOWED : REASON.PERMISSION_DENIED)),
    permission: src.permission || null,
    productKey: src.productKey || null,
    httpStatus: Number.isFinite(src.httpStatus) ? src.httpStatus : src.allowed ? 200 : 403,
    concealAsNotFound: src.concealAsNotFound === true,
    matchedAssignments: Array.isArray(src.matchedAssignments) ? src.matchedAssignments : [],
    evaluatedScopes: Array.isArray(src.evaluatedScopes) ? src.evaluatedScopes : [],
    message: src.message || null,
    _internal: src._internal || null,
  };
}

/**
 * Map a shared decision to an HTTP status + client message.
 * @param {ReturnType<typeof authzDecision>} decision
 * @param {{ concealAsNotFound?: boolean }} [opts]
 */
function mapAuthzDecisionToHttp(decision, opts) {
  const conceal =
    (opts && opts.concealAsNotFound === true) ||
    (decision && decision.concealAsNotFound === true);
  if (!decision || decision.allowed) {
    return { status: 200, message: null, redirectLogin: false };
  }
  const code = String(decision.reasonCode || "");
  if (code === REASON.LOOKUP_ERROR) {
    return {
      status: 503,
      message: "Access check is temporarily unavailable.",
      redirectLogin: false,
    };
  }
  if (code === REASON.UNAUTHENTICATED || code === REASON.INACTIVE_USER) {
    return {
      status: 401,
      message: "Sign-in is required.",
      redirectLogin: true,
    };
  }
  return {
    status: conceal ? 404 : decision.httpStatus || 403,
    message: conceal ? "Not found." : "You do not have access to this site.",
    redirectLogin: false,
  };
}

/**
 * Platform-admin catalogue permission fallthrough via legacy `platform_admin` role.
 * V8 defaults to least privilege (no fallthrough). V7 keeps fallthrough for compat
 * unless PLATFORM_ADMIN_PERMISSION_FALLTHROUGH is explicitly set.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
function allowPlatformAdminPermissionFallthrough(env) {
  const source = env || process.env;
  const explicit = String(source.PLATFORM_ADMIN_PERMISSION_FALLTHROUGH || "")
    .trim()
    .toLowerCase();
  if (explicit === "1" || explicit === "true" || explicit === "yes") return true;
  if (explicit === "0" || explicit === "false" || explicit === "no") return false;
  return !isV8Deployment(source);
}

/**
 * Evaluate a platform-admin catalogue permission with optional legacy fallthrough.
 *
 * @param {{ query: Function }} pool
 * @param {{
 *   actorUserId: string,
 *   permissionKey: string,
 *   env?: NodeJS.ProcessEnv,
 *   authorize?: Function,
 * }} input
 */
async function evaluatePlatformAdminPermission(pool, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const permissionKey = String((input && input.permissionKey) || "").trim();
  if (!actorUserId || !permissionKey || !pool || typeof pool.query !== "function") {
    return authzDecision({
      allowed: false,
      reasonCode: REASON.UNAUTHENTICATED,
      httpStatus: 403,
      productKey: "platform",
      permission: permissionKey || null,
    });
  }

  const authorize =
    typeof input.authorize === "function"
      ? input.authorize
      : require("../../blessboard/services/blessBoardRbacAuthorizationService").authorize;

  let decision;
  try {
    decision = await authorize(pool, {
      actor: { userId: actorUserId },
      permission: permissionKey,
      tenantContext: {
        organizationId: null,
        churchId: null,
        primaryBranchId: null,
      },
      resourceContext: {
        organizationId: null,
        churchId: null,
        branchId: null,
      },
    });
  } catch {
    return authzDecision({
      allowed: false,
      reasonCode: REASON.LOOKUP_ERROR,
      httpStatus: 503,
      productKey: "platform",
      permission: permissionKey,
    });
  }

  if (decision && decision.allowed === true) {
    return authzDecision({
      allowed: true,
      reasonCode: REASON.ALLOWED,
      permission: permissionKey,
      productKey: "platform",
      matchedAssignments: decision.matchedAssignments,
      evaluatedScopes: decision.evaluatedScopes,
    });
  }

  if (!allowPlatformAdminPermissionFallthrough(input.env || process.env)) {
    return authzDecision({
      allowed: false,
      reasonCode: REASON.PERMISSION_DENIED,
      permission: permissionKey,
      productKey: "platform",
      httpStatus: 403,
      message: "Catalogue permission required (platform_admin fallthrough disabled).",
    });
  }

  try {
    const roles = await pool.query(
      `SELECT 1
         FROM blessboard.user_roles
        WHERE user_id = $1
          AND role_key = 'platform_admin'
          AND status = 'active'
        LIMIT 1`,
      [actorUserId]
    );
    if (roles.rows[0]) {
      return authzDecision({
        allowed: true,
        reasonCode: REASON.ALLOWED,
        permission: permissionKey,
        productKey: "platform",
        _internal: { legacyPlatformAdminFallthrough: true },
      });
    }
  } catch {
    return authzDecision({
      allowed: false,
      reasonCode: REASON.LOOKUP_ERROR,
      httpStatus: 503,
      productKey: "platform",
      permission: permissionKey,
    });
  }

  return authzDecision({
    allowed: false,
    reasonCode: REASON.PERMISSION_DENIED,
    permission: permissionKey,
    productKey: "platform",
    httpStatus: 403,
  });
}

module.exports = {
  REASON,
  authzDecision,
  mapAuthzDecisionToHttp,
  allowPlatformAdminPermissionFallthrough,
  evaluatePlatformAdminPermission,
};
