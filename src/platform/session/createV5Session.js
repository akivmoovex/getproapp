"use strict";

/**
 * Create a deployment-scoped V5 session row (token hash only).
 */

const {
  generateSessionToken,
  sessionExpiresAt,
  sha256Hex,
} = require("./sessionToken");

/**
 * @param {{ query: Function }} client
 * @param {{
 *   deploymentCode: string,
 *   userId: string,
 *   organizationId?: string | null,
 *   churchId?: string | null,
 *   branchId?: string | null,
 *   ip?: string | null,
 *   userAgent?: string | null,
 * }} fields
 */
async function createV5Session(client, fields) {
  const deploymentCode = String(fields.deploymentCode || "").trim().toLowerCase();
  if (!deploymentCode) {
    return { ok: false, code: "invalid_deployment" };
  }

  const deployment = await client.query(
    `SELECT deployment_code, status
       FROM platform.deployments
      WHERE deployment_code = $1
      LIMIT 1`,
    [deploymentCode]
  );
  if (!deployment.rows[0]) {
    return { ok: false, code: "deployment_not_found" };
  }
  if (deployment.rows[0].status !== "active") {
    return { ok: false, code: "inactive_deployment" };
  }

  const { rawToken, tokenHash } = generateSessionToken();
  const expiresAt = sessionExpiresAt();
  const ipHash = fields.ip ? sha256Hex(fields.ip) : null;
  const uaHash = fields.userAgent ? sha256Hex(fields.userAgent) : null;

  const inserted = await client.query(
    `INSERT INTO platform.deployment_sessions
       (session_token_hash, deployment_code, user_id, organization_id, church_id, branch_id,
        expires_at, ip_hash, user_agent_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, deployment_code, user_id, organization_id, church_id, branch_id,
               created_at, last_seen_at, expires_at, revoked_at`,
    [
      tokenHash,
      deploymentCode,
      fields.userId,
      fields.organizationId || null,
      fields.churchId || null,
      fields.branchId || null,
      expiresAt.toISOString(),
      ipHash,
      uaHash,
    ]
  );

  return {
    ok: true,
    rawToken,
    session: inserted.rows[0],
  };
}

module.exports = {
  createV5Session,
};
