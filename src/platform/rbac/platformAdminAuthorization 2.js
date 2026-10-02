"use strict";

/**
 * Platform Admin authorization — catalogue-only (V2.02).
 *
 * Gate: active `platform_administrator` assignment with scope_type = platform.
 * Permissions: `platform.*` keys from role_permissions (no legacy `platform_admin`
 * user_roles fallthrough; no BB tenant context required).
 *
 * Does not auto-grant clinic patient, financial transaction, or pastoral-confidential
 * product permissions — those remain product-scoped and must be assigned explicitly.
 */

const REASON = Object.freeze({
  ALLOWED: "RBAC_ALLOWED",
  UNAUTHENTICATED: "RBAC_UNAUTHENTICATED",
  INACTIVE_USER: "RBAC_INACTIVE_USER",
  PERMISSION_DENIED: "RBAC_PERMISSION_DENIED",
  LOOKUP_ERROR: "RBAC_LOOKUP_ERROR",
});

function authzDecision(partial) {
  const src = partial && typeof partial === "object" ? partial : {};
  return {
    allowed: Boolean(src.allowed),
    reasonCode: String(
      src.reasonCode || (src.allowed ? REASON.ALLOWED : REASON.PERMISSION_DENIED)
    ),
    permission: src.permission || null,
    productKey: src.productKey || null,
    httpStatus: Number.isFinite(src.httpStatus)
      ? src.httpStatus
      : src.allowed
        ? 200
        : 403,
    concealAsNotFound: src.concealAsNotFound === true,
    matchedAssignments: Array.isArray(src.matchedAssignments)
      ? src.matchedAssignments
      : [],
    evaluatedScopes: Array.isArray(src.evaluatedScopes)
      ? src.evaluatedScopes
      : [],
    message: src.message || null,
    _internal: src._internal || null,
  };
}

const PLATFORM_ADMINISTRATOR_ROLE_KEY = "platform_administrator";

/** Platform ops permissions expected on platform_administrator (catalogue). */
const PLATFORM_ADMIN_PERMISSION_KEYS = Object.freeze([
  "platform.users.view",
  "platform.users.invite",
  "platform.users.reset_access",
  "platform.users.revoke_sessions",
  "platform.users.suspend",
  "platform.users.restore",
  "platform.users.unlock",
  "platform.members.search",
  "platform.members.view_support_profile",
  "platform.roles.view",
  "platform.roles.assign_standard",
  "platform.roles.assign_sensitive",
  "platform.roles.revoke",
  "platform.support.enter_hq",
  "platform.support.enter_branch",
  "platform.support.exit",
  "platform.support.view_status",
  "platform.deployments.view",
  "platform.domains.view",
  "platform.access_health.view",
  "platform.audit.view",
]);

/**
 * Product-sensitive keys that must NOT be implied by platform administration alone.
 * Used in QA / policy assertions; not granted by platform_administrator defaults
 * for ActiveClinic patient create or pastoral confidentiality.
 */
const PLATFORM_ADMIN_MUST_NOT_AUTO_GRANT = Object.freeze([
  "patient.create",
  "pastoral.view_confidential",
  "pastoral.notes.view_confidential",
  "finance.transactions.view",
  "finance.transactions.create",
  "finance.transactions.approve",
  "billing.transactions.view",
  "billing.transactions.post",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Active catalogue platform_administrator assignment (platform scope).
 * @param {{ query: Function }} pool
 * @param {string} userId
 */
async function hasActivePlatformAdministratorAssignment(pool, userId) {
  const id = String(userId || "").trim();
  if (!UUID_RE.test(id) || !pool || typeof pool.query !== "function") {
    return false;
  }
  try {
    const r = await pool.query(
      `SELECT 1
         FROM blessboard.user_role_assignments ura
         INNER JOIN blessboard.roles r
           ON r.id = ura.role_id
          AND r.is_active = true
          AND r.role_key = $2
        WHERE ura.user_id = $1
          AND ura.status = 'active'
          AND ura.revoked_at IS NULL
          AND (ura.expires_at IS NULL OR ura.expires_at > now())
          AND ura.scope_type = 'platform'
        LIMIT 1`,
      [id, PLATFORM_ADMINISTRATOR_ROLE_KEY]
    );
    return Boolean(r.rows[0]);
  } catch {
    return false;
  }
}

/**
 * Catalogue permission check for platform ops (no tenant org/church required).
 * @param {{ query: Function }} pool
 * @param {{ actorUserId: string, permissionKey: string }} input
 */
async function authorizePlatformCataloguePermission(pool, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const permissionKey = String((input && input.permissionKey) || "").trim();

  if (!actorUserId || !permissionKey) {
    return authzDecision({
      allowed: false,
      reasonCode: REASON.UNAUTHENTICATED,
      httpStatus: 403,
      productKey: "platform",
      permission: permissionKey || null,
    });
  }
  if (!UUID_RE.test(actorUserId)) {
    return authzDecision({
      allowed: false,
      reasonCode: REASON.UNAUTHENTICATED,
      httpStatus: 403,
      productKey: "platform",
      permission: permissionKey,
    });
  }
  if (!pool || typeof pool.query !== "function") {
    return authzDecision({
      allowed: false,
      reasonCode: REASON.LOOKUP_ERROR,
      httpStatus: 503,
      productKey: "platform",
      permission: permissionKey,
    });
  }

  try {
    const user = await pool.query(
      `SELECT status FROM blessboard.users WHERE id = $1 LIMIT 1`,
      [actorUserId]
    );
    if (!user.rows[0]) {
      return authzDecision({
        allowed: false,
        reasonCode: REASON.UNAUTHENTICATED,
        httpStatus: 403,
        productKey: "platform",
        permission: permissionKey,
      });
    }
    if (String(user.rows[0].status) !== "active") {
      return authzDecision({
        allowed: false,
        reasonCode: REASON.INACTIVE_USER,
        httpStatus: 403,
        productKey: "platform",
        permission: permissionKey,
      });
    }

    const granted = await pool.query(
      `SELECT p.permission_key
         FROM blessboard.user_role_assignments ura
         INNER JOIN blessboard.roles r
           ON r.id = ura.role_id
          AND r.is_active = true
          AND r.role_key = $3
         INNER JOIN blessboard.role_permissions rp ON rp.role_id = r.id
         INNER JOIN blessboard.permissions p
           ON p.id = rp.permission_id
          AND p.is_active = true
          AND p.permission_key = $2
        WHERE ura.user_id = $1
          AND ura.status = 'active'
          AND ura.revoked_at IS NULL
          AND (ura.expires_at IS NULL OR ura.expires_at > now())
          AND ura.scope_type = 'platform'
        LIMIT 1`,
      [actorUserId, permissionKey, PLATFORM_ADMINISTRATOR_ROLE_KEY]
    );

    if (granted.rows[0]) {
      return authzDecision({
        allowed: true,
        reasonCode: REASON.ALLOWED,
        permission: permissionKey,
        productKey: "platform",
        matchedAssignments: [
          {
            roleKey: PLATFORM_ADMINISTRATOR_ROLE_KEY,
            scopeType: "platform",
            permissionKey,
          },
        ],
        evaluatedScopes: [{ scopeType: "platform" }],
      });
    }

    return authzDecision({
      allowed: false,
      reasonCode: REASON.PERMISSION_DENIED,
      permission: permissionKey,
      productKey: "platform",
      httpStatus: 403,
      message: "platform_administrator catalogue permission required.",
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
}

/**
 * Service-layer helper: map catalogue decision to { ok, status, reason }.
 * @param {{ query: Function }} pool
 * @param {string} actorUserId
 * @param {string} permissionKey
 * @param {{ FORBIDDEN?: string, LOOKUP_ERROR?: string }} [statusMap]
 */
async function assertPlatformCataloguePermission(
  pool,
  actorUserId,
  permissionKey,
  statusMap
) {
  const STATUS = statusMap || {};
  const forbidden = STATUS.FORBIDDEN || "forbidden";
  const lookupError = STATUS.LOOKUP_ERROR || "lookup_error";
  const decision = await authorizePlatformCataloguePermission(pool, {
    actorUserId,
    permissionKey,
  });
  if (decision && decision.allowed === true) {
    return { ok: true, decision };
  }
  if (decision && decision.reasonCode === REASON.LOOKUP_ERROR) {
    return { ok: false, status: lookupError, reason: "lookup_error", decision };
  }
  if (
    decision &&
    (decision.reasonCode === REASON.UNAUTHENTICATED ||
      decision.reasonCode === REASON.INACTIVE_USER)
  ) {
    return {
      ok: false,
      status: forbidden,
      reason: "unauthenticated",
      decision,
    };
  }
  return {
    ok: false,
    status: forbidden,
    reason: (decision && decision.reasonCode) || "forbidden",
    decision,
  };
}

module.exports = {
  PLATFORM_ADMINISTRATOR_ROLE_KEY,
  PLATFORM_ADMIN_PERMISSION_KEYS,
  PLATFORM_ADMIN_MUST_NOT_AUTO_GRANT,
  hasActivePlatformAdministratorAssignment,
  authorizePlatformCataloguePermission,
  assertPlatformCataloguePermission,
};
