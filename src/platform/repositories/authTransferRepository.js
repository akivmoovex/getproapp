"use strict";

/**
 * platform.auth_transfers repository (parameterized SQL; hash only).
 */

/**
 * @param {{ query: Function }} client
 * @param {{
 *   transferTokenHash: string,
 *   deploymentCode: string,
 *   requestedHostname: string,
 *   organizationId: string,
 *   churchId: string,
 *   branchId?: string | null,
 *   purpose: string,
 *   returnPath?: string | null,
 *   expiresAt: Date | string,
 * }} fields
 */
async function insertAuthTransfer(client, fields) {
  const r = await client.query(
    `INSERT INTO platform.auth_transfers
       (transfer_token_hash, deployment_code, requested_hostname, organization_id, church_id,
        branch_id, purpose, return_path, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, transfer_token_hash, deployment_code, requested_hostname, organization_id,
               church_id, branch_id, user_id, purpose, return_path, created_at, expires_at, consumed_at`,
    [
      fields.transferTokenHash,
      fields.deploymentCode,
      fields.requestedHostname,
      fields.organizationId,
      fields.churchId,
      fields.branchId || null,
      fields.purpose,
      fields.returnPath || null,
      fields.expiresAt instanceof Date ? fields.expiresAt.toISOString() : fields.expiresAt,
    ]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} tokenHash
 */
async function findAuthTransferByHash(client, tokenHash) {
  const r = await client.query(
    `SELECT id, transfer_token_hash, deployment_code, requested_hostname, organization_id,
            church_id, branch_id, user_id, purpose, return_path, created_at, expires_at, consumed_at
       FROM platform.auth_transfers
      WHERE transfer_token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );
  return r.rows[0] || null;
}

/**
 * Atomically rotate token hash and attach authenticated user (pending → redeemable).
 * @param {{ query: Function }} client
 * @param {{
 *   id: string,
 *   expectedHash: string,
 *   newTokenHash: string,
 *   userId: string,
 *   expiresAt: Date | string,
 * }} fields
 */
async function markAuthTransferAuthenticated(client, fields) {
  const r = await client.query(
    `UPDATE platform.auth_transfers
        SET transfer_token_hash = $3,
            user_id = $4,
            expires_at = $5
      WHERE id = $1
        AND transfer_token_hash = $2
        AND user_id IS NULL
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING id, transfer_token_hash, deployment_code, requested_hostname, organization_id,
                church_id, branch_id, user_id, purpose, return_path, created_at, expires_at, consumed_at`,
    [
      fields.id,
      fields.expectedHash,
      fields.newTokenHash,
      fields.userId,
      fields.expiresAt instanceof Date ? fields.expiresAt.toISOString() : fields.expiresAt,
    ]
  );
  return r.rows[0] || null;
}

/**
 * Atomically consume a redeemable transfer (user_id set, not expired).
 * @param {{ query: Function }} client
 * @param {{ id: string, expectedHash: string, hostname: string, deploymentCode: string }} fields
 */
async function consumeAuthTransfer(client, fields) {
  const r = await client.query(
    `UPDATE platform.auth_transfers
        SET consumed_at = now()
      WHERE id = $1
        AND transfer_token_hash = $2
        AND requested_hostname = $3
        AND deployment_code = $4
        AND user_id IS NOT NULL
        AND consumed_at IS NULL
        AND expires_at > now()
        AND purpose = 'tenant_login'
      RETURNING id, transfer_token_hash, deployment_code, requested_hostname, organization_id,
                church_id, branch_id, user_id, purpose, return_path, created_at, expires_at, consumed_at`,
    [fields.id, fields.expectedHash, fields.hostname, fields.deploymentCode]
  );
  return r.rows[0] || null;
}

module.exports = {
  insertAuthTransfer,
  findAuthTransferByHash,
  markAuthTransferAuthenticated,
  consumeAuthTransfer,
};
