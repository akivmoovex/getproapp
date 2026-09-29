"use strict";

/**
 * platform.auth_transfers repository (parameterized SQL; hash only).
 * BlessBoard: user_id + purpose tenant_login.
 * ActiveClinic: platform_identity_id + purpose activeclinic_login (AC-V6-07).
 */

const TRANSFER_COLUMNS = `id, transfer_token_hash, deployment_code, requested_hostname, organization_id,
            church_id, branch_id, user_id, platform_identity_id, purpose, return_path,
            created_at, expires_at, consumed_at`;

/**
 * @param {{ query: Function }} client
 * @param {{
 *   transferTokenHash: string,
 *   deploymentCode: string,
 *   requestedHostname: string,
 *   organizationId: string,
 *   churchId?: string | null,
 *   branchId?: string | null,
 *   purpose: string,
 *   returnPath?: string | null,
 *   expiresAt: Date | string,
 *   platformIdentityId?: string | null,
 *   userId?: string | null,
 * }} fields
 */
async function insertAuthTransfer(client, fields) {
  const r = await client.query(
    `INSERT INTO platform.auth_transfers
       (transfer_token_hash, deployment_code, requested_hostname, organization_id, church_id,
        branch_id, user_id, platform_identity_id, purpose, return_path, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${TRANSFER_COLUMNS}`,
    [
      fields.transferTokenHash,
      fields.deploymentCode,
      fields.requestedHostname,
      fields.organizationId,
      fields.churchId || null,
      fields.branchId || null,
      fields.userId || null,
      fields.platformIdentityId || null,
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
    `SELECT ${TRANSFER_COLUMNS}
       FROM platform.auth_transfers
      WHERE transfer_token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );
  return r.rows[0] || null;
}

/**
 * Atomically rotate token hash and attach authenticated BlessBoard user (pending → redeemable).
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
        AND platform_identity_id IS NULL
        AND consumed_at IS NULL
        AND expires_at > now()
        AND purpose = 'tenant_login'
      RETURNING ${TRANSFER_COLUMNS}`,
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
 * Atomically rotate token hash and attach platform identity (ActiveClinic pending → redeemable).
 * @param {{ query: Function }} client
 * @param {{
 *   id: string,
 *   expectedHash: string,
 *   newTokenHash: string,
 *   platformIdentityId: string,
 *   expiresAt: Date | string,
 * }} fields
 */
async function markAuthTransferAuthenticatedPlatformIdentity(client, fields) {
  const r = await client.query(
    `UPDATE platform.auth_transfers
        SET transfer_token_hash = $3,
            platform_identity_id = $4,
            expires_at = $5
      WHERE id = $1
        AND transfer_token_hash = $2
        AND user_id IS NULL
        AND platform_identity_id IS NULL
        AND consumed_at IS NULL
        AND expires_at > now()
        AND purpose = 'activeclinic_login'
      RETURNING ${TRANSFER_COLUMNS}`,
    [
      fields.id,
      fields.expectedHash,
      fields.newTokenHash,
      fields.platformIdentityId,
      fields.expiresAt instanceof Date ? fields.expiresAt.toISOString() : fields.expiresAt,
    ]
  );
  return r.rows[0] || null;
}

/**
 * Atomically consume a redeemable BlessBoard transfer (user_id set, not expired).
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
        AND platform_identity_id IS NULL
        AND consumed_at IS NULL
        AND expires_at > now()
        AND purpose = 'tenant_login'
      RETURNING ${TRANSFER_COLUMNS}`,
    [fields.id, fields.expectedHash, fields.hostname, fields.deploymentCode]
  );
  return r.rows[0] || null;
}

/**
 * Atomically consume a redeemable ActiveClinic transfer (platform_identity_id set).
 * @param {{ query: Function }} client
 * @param {{ id: string, expectedHash: string, hostname: string, deploymentCode: string }} fields
 */
async function consumePlatformIdentityAuthTransfer(client, fields) {
  const r = await client.query(
    `UPDATE platform.auth_transfers
        SET consumed_at = now()
      WHERE id = $1
        AND transfer_token_hash = $2
        AND requested_hostname = $3
        AND deployment_code = $4
        AND platform_identity_id IS NOT NULL
        AND user_id IS NULL
        AND consumed_at IS NULL
        AND expires_at > now()
        AND purpose = 'activeclinic_login'
      RETURNING ${TRANSFER_COLUMNS}`,
    [fields.id, fields.expectedHash, fields.hostname, fields.deploymentCode]
  );
  return r.rows[0] || null;
}

module.exports = {
  insertAuthTransfer,
  findAuthTransferByHash,
  markAuthTransferAuthenticated,
  markAuthTransferAuthenticatedPlatformIdentity,
  consumeAuthTransfer,
  consumePlatformIdentityAuthTransfer,
};
