"use strict";

/**
 * Revoke a V5 session by raw cookie token (hashed lookup).
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

module.exports = {
  revokeV5Session,
};
