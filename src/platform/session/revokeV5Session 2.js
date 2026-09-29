"use strict";

/**
 * Revoke deployment sessions by token, BlessBoard user, or platform identity.
 */

const { hashSessionToken } = require("./sessionToken");

/**
 * @param {{ query: Function }} client
 * @param {{ rawToken: string, deploymentCode: string }} opts
 */
async function revokeV5Session(client, opts) {
  const rawToken = String(opts.rawToken || "");
  const deploymentCode = String(opts.deploymentCode || "")
    .trim()
    .toLowerCase();
  if (!rawToken || !deploymentCode) {
    return { ok: true, code: "already_cleared", revoked: false };
  }

  const tokenHash = hashSessionToken(rawToken);
  const result = await client.query(
    `UPDATE platform.deployment_sessions
        SET revoked_at = now()
      WHERE session_token_hash = $1
        AND deployment_code = $2
        AND revoked_at IS NULL
      RETURNING id`,
    [tokenHash, deploymentCode]
  );

  return {
    ok: true,
    code: result.rowCount > 0 ? "revoked" : "already_cleared",
    revoked: result.rowCount > 0,
  };
}

/**
 * Revoke active sessions for a BlessBoard user within one deployment.
 * @param {{ query: Function }} client
 * @param {{ userId: string, deploymentCode: string }} opts
 */
async function revokeSessionsByBlessBoardUser(client, opts) {
  const userId = String(opts.userId || "").trim();
  const deploymentCode = String(opts.deploymentCode || "")
    .trim()
    .toLowerCase();
  if (!userId || !deploymentCode) {
    return { ok: false, code: "invalid_input", revokedCount: 0 };
  }
  const result = await client.query(
    `UPDATE platform.deployment_sessions
        SET revoked_at = now()
      WHERE user_id = $1
        AND deployment_code = $2
        AND revoked_at IS NULL
      RETURNING id`,
    [userId, deploymentCode]
  );
  return { ok: true, code: "ok", revokedCount: result.rowCount };
}

/**
 * Revoke active sessions for a platform identity within one deployment (product-scoped).
 * Does not revoke other deployments unless deploymentCode omitted with allowGlobal.
 *
 * @param {{ query: Function }} client
 * @param {{
 *   platformIdentityId: string,
 *   deploymentCode?: string|null,
 *   allowGlobal?: boolean,
 * }} opts
 */
async function revokeSessionsByPlatformIdentity(client, opts) {
  const platformIdentityId = String(opts.platformIdentityId || "").trim();
  const deploymentCode = opts.deploymentCode
    ? String(opts.deploymentCode).trim().toLowerCase()
    : null;
  if (!platformIdentityId) {
    return { ok: false, code: "invalid_input", revokedCount: 0 };
  }
  if (!deploymentCode && !opts.allowGlobal) {
    return { ok: false, code: "deployment_required", revokedCount: 0 };
  }

  let result;
  if (deploymentCode) {
    result = await client.query(
      `UPDATE platform.deployment_sessions
          SET revoked_at = now()
        WHERE platform_identity_id = $1
          AND deployment_code = $2
          AND revoked_at IS NULL
        RETURNING id`,
      [platformIdentityId, deploymentCode]
    );
  } else {
    result = await client.query(
      `UPDATE platform.deployment_sessions
          SET revoked_at = now()
        WHERE platform_identity_id = $1
          AND revoked_at IS NULL
        RETURNING id`,
      [platformIdentityId]
    );
  }
  return { ok: true, code: "ok", revokedCount: result.rowCount };
}

module.exports = {
  revokeV5Session,
  revokeSessionsByBlessBoardUser,
  revokeSessionsByPlatformIdentity,
};
