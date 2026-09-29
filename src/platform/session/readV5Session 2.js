"use strict";

/**
 * Read and optionally touch a V5 deployment-scoped session.
 * Supports BlessBoard user principal and platform-identity (ActiveClinic) principal.
 */

const { hashSessionToken, LAST_SEEN_MIN_INTERVAL_MS } = require("./sessionToken");
const {
  resolveDeploymentSessionPrincipal,
  RESULT: PRINCIPAL_RESULT,
  PRINCIPAL_TYPES,
} = require("./resolveDeploymentSessionPrincipal");
const {
  deploymentMatchesExpectedProduct,
} = require("./deploymentApplicationCompatibility");

/**
 * Fast path for BlessBoard legacy sessions when the user row is already joined.
 * Avoids an extra round-trip on the common path (preserves intermittent touch mocks).
 *
 * @param {object} row
 * @param {{ expectedProductCode?: string|null }} opts
 */
function resolveLegacyPrincipalFromJoinedRow(row, opts) {
  const expectedProduct = opts.expectedProductCode
    ? String(opts.expectedProductCode).trim().toLowerCase()
    : null;
  const deploymentProduct = row.application_code
    ? String(row.application_code).trim().toLowerCase()
    : null;

  if (!deploymentMatchesExpectedProduct(deploymentProduct, expectedProduct)) {
    return { ok: false, code: PRINCIPAL_RESULT.PRODUCT_MISMATCH, principal: null };
  }
  if (deploymentProduct === "activeclinic" || expectedProduct === "activeclinic") {
    return { ok: false, code: PRINCIPAL_RESULT.PRODUCT_MISMATCH, principal: null };
  }

  return {
    ok: true,
    code: PRINCIPAL_RESULT.OK,
    principal: {
      principalType: PRINCIPAL_TYPES.BLESSBOARD_USER,
      blessBoardUserId: String(row.user_id),
      platformIdentityId: null,
      blessboardUser: {
        id: row.user_id,
        status: row.user_status,
        displayName: row.display_name,
        emailNormalized: row.email_normalized,
        platformIdentityId: null,
      },
      platformIdentity: null,
    },
  };
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   rawToken: string,
 *   deploymentCode: string,
 *   touch?: boolean,
 *   expectedProductCode?: string|null,
 * }} opts
 */
async function readV5Session(client, opts) {
  const rawToken = String(opts.rawToken || "");
  const deploymentCode = String(opts.deploymentCode || "")
    .trim()
    .toLowerCase();
  if (!rawToken || !deploymentCode) {
    return { ok: false, code: "unauthenticated", session: null };
  }

  const tokenHash = hashSessionToken(rawToken);
  const found = await client.query(
    `SELECT s.id, s.deployment_code, s.user_id, s.platform_identity_id,
            s.organization_id, s.church_id, s.branch_id,
            s.created_at, s.last_seen_at, s.expires_at, s.revoked_at,
            COALESCE(s.context_json, '{}'::jsonb) AS context_json,
            d.application_code,
            u.email_normalized, u.display_name, u.status AS user_status
       FROM platform.deployment_sessions s
       JOIN platform.deployments d ON d.deployment_code = s.deployment_code
       LEFT JOIN blessboard.users u ON u.id = s.user_id
      WHERE s.session_token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );
  const row = found.rows[0];
  if (!row) {
    return { ok: false, code: "unauthenticated", session: null };
  }
  if (String(row.deployment_code) !== deploymentCode) {
    return { ok: false, code: "deployment_mismatch", session: null };
  }
  if (row.revoked_at) {
    return { ok: false, code: "revoked", session: null };
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, code: "expired", session: null };
  }

  const hasUser = row.user_id != null && String(row.user_id).trim() !== "";
  const hasIdentity =
    row.platform_identity_id != null && String(row.platform_identity_id).trim() !== "";

  let principal;
  if (hasUser && !hasIdentity && row.user_status != null) {
    principal = resolveLegacyPrincipalFromJoinedRow(row, opts);
  } else {
    principal = await resolveDeploymentSessionPrincipal(
      client,
      {
        user_id: row.user_id,
        platform_identity_id: row.platform_identity_id,
        deployment_code: row.deployment_code,
      },
      {
        expectedProductCode: opts.expectedProductCode || null,
        deploymentApplicationCode: row.application_code,
        requireActiveIdentity: true,
      }
    );
  }

  if (!principal.ok) {
    if (principal.code === PRINCIPAL_RESULT.IDENTITY_DISABLED) {
      return { ok: false, code: "inactive_identity", session: null };
    }
    if (principal.code === PRINCIPAL_RESULT.PRODUCT_MISMATCH) {
      return { ok: false, code: "product_mismatch", session: null };
    }
    if (principal.code === PRINCIPAL_RESULT.AMBIGUOUS_PRINCIPAL) {
      return { ok: false, code: "ambiguous_principal", session: null };
    }
    return { ok: false, code: "unauthenticated", session: null };
  }

  if (
    principal.principal.principalType !== "platform_identity" &&
    row.user_id &&
    String(row.user_status || "") !== "active"
  ) {
    return { ok: false, code: "inactive_user", session: null };
  }

  if (opts.touch) {
    try {
      const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
      const lastSeenValid = Number.isFinite(lastSeenMs) && lastSeenMs > 0;
      if (!lastSeenValid || Date.now() - lastSeenMs >= LAST_SEEN_MIN_INTERVAL_MS) {
        await client.query(
          `UPDATE platform.deployment_sessions
              SET last_seen_at = now()
            WHERE id = $1 AND revoked_at IS NULL`,
          [row.id]
        );
        row.last_seen_at = new Date();
      }
    } catch {
      /* ignore touch failures */
    }
  }

  const session = {
    id: row.id,
    deploymentCode: row.deployment_code,
    applicationCode: row.application_code,
    userId: row.user_id || null,
    platformIdentityId: row.platform_identity_id || null,
    organizationId: row.organization_id,
    churchId: row.church_id,
    branchId: row.branch_id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    contextJson:
      row.context_json && typeof row.context_json === "object" ? row.context_json : {},
    principalType: principal.principal.principalType,
    platformIdentity: principal.principal.platformIdentity || null,
    user: null,
  };

  if (principal.principal.blessboardUser) {
    session.user = {
      id: principal.principal.blessboardUser.id,
      emailNormalized:
        principal.principal.blessboardUser.emailNormalized ||
        row.email_normalized ||
        null,
      displayName:
        principal.principal.blessboardUser.displayName || row.display_name || null,
      status: principal.principal.blessboardUser.status || row.user_status || null,
    };
  }

  return {
    ok: true,
    code: "ok",
    session,
  };
}

module.exports = {
  readV5Session,
};
