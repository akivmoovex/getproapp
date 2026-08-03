"use strict";

/**
 * Persistence for platform.identity_action_tokens (hashed only).
 */

function mapToken(row) {
  if (!row) return null;
  return {
    id: row.id != null ? String(row.id) : null,
    platformIdentityId:
      row.platform_identity_id != null ? String(row.platform_identity_id) : null,
    purpose: row.purpose != null ? String(row.purpose) : null,
    tokenHash: row.token_hash != null ? String(row.token_hash) : null,
    expiresAt: row.expires_at || null,
    consumedAt: row.consumed_at || null,
    revokedAt: row.revoked_at || null,
    createdAt: row.created_at || null,
    createdByPlatformIdentityId:
      row.created_by_platform_identity_id != null
        ? String(row.created_by_platform_identity_id)
        : null,
    deploymentCode:
      row.deployment_code != null ? String(row.deployment_code) : null,
    productKey: row.product_key != null ? String(row.product_key) : null,
    organizationId:
      row.organization_id != null ? String(row.organization_id) : null,
    staffMemberId:
      row.staff_member_id != null ? String(row.staff_member_id) : null,
    requestIpHash:
      row.request_ip_hash != null ? String(row.request_ip_hash) : null,
    metadataJson:
      row.metadata_json && typeof row.metadata_json === "object"
        ? row.metadata_json
        : {},
  };
}

/**
 * @param {{ query: Function }} db
 * @param {object} fields
 */
async function insertActionToken(db, fields) {
  const res = await db.query(
    `INSERT INTO platform.identity_action_tokens (
       platform_identity_id, purpose, token_hash, expires_at,
       created_by_platform_identity_id, deployment_code, product_key,
       organization_id, staff_member_id, request_ip_hash, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     RETURNING *`,
    [
      fields.platformIdentityId,
      fields.purpose,
      fields.tokenHash,
      fields.expiresAt,
      fields.createdByPlatformIdentityId || null,
      fields.deploymentCode,
      fields.productKey,
      fields.organizationId || null,
      fields.staffMemberId || null,
      fields.requestIpHash || null,
      JSON.stringify(fields.metadataJson || {}),
    ]
  );
  return mapToken(res.rows[0]);
}

/**
 * Revoke (and optionally consume) active tokens for identity+purpose (+optional staff).
 * @param {{ query: Function }} db
 * @param {{
 *   platformIdentityId: string,
 *   purpose: string,
 *   staffMemberId?: string|null,
 *   deploymentCode?: string|null,
 * }} input
 */
async function revokeActiveTokens(db, input) {
  const params = [input.platformIdentityId, input.purpose];
  let sql = `
    UPDATE platform.identity_action_tokens
       SET revoked_at = COALESCE(revoked_at, now()),
           consumed_at = COALESCE(consumed_at, now())
     WHERE platform_identity_id = $1
       AND purpose = $2
       AND consumed_at IS NULL
       AND revoked_at IS NULL`;
  if (input.staffMemberId) {
    params.push(input.staffMemberId);
    sql += ` AND staff_member_id = $${params.length}`;
  }
  if (input.deploymentCode) {
    params.push(input.deploymentCode);
    sql += ` AND deployment_code = $${params.length}`;
  }
  sql += ` RETURNING id`;
  const res = await db.query(sql, params);
  return res.rowCount || 0;
}

/**
 * @param {{ query: Function }} db
 * @param {string} tokenHash
 */
async function findByTokenHash(db, tokenHash) {
  const res = await db.query(
    `SELECT * FROM platform.identity_action_tokens
      WHERE token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );
  return mapToken(res.rows[0] || null);
}

/**
 * @param {{ query: Function }} db
 * @param {string} tokenId
 */
async function findById(db, tokenId) {
  const res = await db.query(
    `SELECT * FROM platform.identity_action_tokens WHERE id = $1 LIMIT 1`,
    [tokenId]
  );
  return mapToken(res.rows[0] || null);
}

/**
 * One-time consume. Concurrent callers: only one succeeds.
 * @param {{ query: Function }} db
 * @param {string} tokenId
 */
async function markConsumed(db, tokenId) {
  const res = await db.query(
    `UPDATE platform.identity_action_tokens
        SET consumed_at = now()
      WHERE id = $1
        AND consumed_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > now()
      RETURNING *`,
    [tokenId]
  );
  return mapToken(res.rows[0] || null);
}

/**
 * @param {{ query: Function }} db
 * @param {string} tokenId
 */
async function markRevoked(db, tokenId) {
  const res = await db.query(
    `UPDATE platform.identity_action_tokens
        SET revoked_at = COALESCE(revoked_at, now()),
            consumed_at = COALESCE(consumed_at, now())
      WHERE id = $1
        AND revoked_at IS NULL
      RETURNING *`,
    [tokenId]
  );
  return mapToken(res.rows[0] || null);
}

/**
 * @param {{ query: Function }} db
 * @param {{ scopeKind: string, scopeKey: string, windowMs: number, maxAttempts: number }} input
 */
async function consumeRateLimitSlot(db, input) {
  const windowStart = new Date(Date.now() - Number(input.windowMs || 0));
  const existing = await db.query(
    `SELECT * FROM platform.identity_action_token_rate_limits
      WHERE scope_kind = $1 AND scope_key = $2
      LIMIT 1
      FOR UPDATE`,
    [input.scopeKind, input.scopeKey]
  );
  if (!existing.rows[0]) {
    await db.query(
      `INSERT INTO platform.identity_action_token_rate_limits
         (scope_kind, scope_key, window_started_at, attempt_count)
       VALUES ($1, $2, now(), 1)`,
      [input.scopeKind, input.scopeKey]
    );
    return { ok: true, limited: false, attemptCount: 1 };
  }
  const row = existing.rows[0];
  const started = row.window_started_at
    ? new Date(row.window_started_at)
    : new Date(0);
  let attemptCount = Number(row.attempt_count || 0);
  if (started < windowStart) {
    attemptCount = 1;
    await db.query(
      `UPDATE platform.identity_action_token_rate_limits
          SET window_started_at = now(), attempt_count = 1, updated_at = now()
        WHERE id = $1`,
      [row.id]
    );
    return { ok: true, limited: false, attemptCount: 1 };
  }
  if (attemptCount >= Number(input.maxAttempts || 5)) {
    return { ok: true, limited: true, attemptCount };
  }
  attemptCount += 1;
  await db.query(
    `UPDATE platform.identity_action_token_rate_limits
        SET attempt_count = $2, updated_at = now()
      WHERE id = $1`,
    [row.id, attemptCount]
  );
  return { ok: true, limited: false, attemptCount };
}

module.exports = {
  mapToken,
  insertActionToken,
  revokeActiveTokens,
  findByTokenHash,
  findById,
  markConsumed,
  markRevoked,
  consumeRateLimitSlot,
};
