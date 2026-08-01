"use strict";

/**
 * Repository for BlessBoard user action tokens (password reset) and rate limits.
 * Stores hashed tokens only.
 */

function mapToken(row) {
  if (!row) return null;
  return {
    id: row.id != null ? String(row.id) : null,
    userId: row.user_id != null ? String(row.user_id) : null,
    purpose: row.purpose != null ? String(row.purpose) : null,
    tokenHash: row.token_hash != null ? String(row.token_hash) : null,
    expiresAt: row.expires_at || null,
    consumedAt: row.consumed_at || null,
    createdAt: row.created_at || null,
    createdByUserId: row.created_by_user_id != null ? String(row.created_by_user_id) : null,
    organizationId: row.organization_id != null ? String(row.organization_id) : null,
    churchId: row.church_id != null ? String(row.church_id) : null,
    requestIpHash: row.request_ip_hash != null ? String(row.request_ip_hash) : null,
    metadataJson:
      row.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : {},
  };
}

/**
 * @param {{ query: Function }} db
 * @param {object} fields
 */
async function insertActionToken(db, fields) {
  const res = await db.query(
    `INSERT INTO blessboard.user_action_tokens (
       user_id, purpose, token_hash, expires_at, created_by_user_id,
       organization_id, church_id, request_ip_hash, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     RETURNING *`,
    [
      fields.userId,
      fields.purpose,
      fields.tokenHash,
      fields.expiresAt,
      fields.createdByUserId || null,
      fields.organizationId || null,
      fields.churchId || null,
      fields.requestIpHash || null,
      JSON.stringify(fields.metadataJson || {}),
    ]
  );
  return mapToken(res.rows[0]);
}

/**
 * @param {{ query: Function }} db
 * @param {{ userId: string, purpose: string }} input
 */
async function consumeActiveTokensForUserPurpose(db, input) {
  const res = await db.query(
    `UPDATE blessboard.user_action_tokens
        SET consumed_at = now()
      WHERE user_id = $1
        AND purpose = $2
        AND consumed_at IS NULL
      RETURNING id`,
    [input.userId, input.purpose]
  );
  return res.rowCount || 0;
}

/**
 * @param {{ query: Function }} db
 * @param {string} tokenHash
 */
async function findByTokenHash(db, tokenHash) {
  const res = await db.query(
    `SELECT * FROM blessboard.user_action_tokens WHERE token_hash = $1 LIMIT 1`,
    [tokenHash]
  );
  return mapToken(res.rows[0] || null);
}

/**
 * @param {{ query: Function }} db
 * @param {string} tokenId
 */
async function markConsumed(db, tokenId) {
  const res = await db.query(
    `UPDATE blessboard.user_action_tokens
        SET consumed_at = now()
      WHERE id = $1 AND consumed_at IS NULL
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
    `SELECT * FROM blessboard.password_reset_rate_limits
      WHERE scope_kind = $1 AND scope_key = $2
      LIMIT 1
      FOR UPDATE`,
    [input.scopeKind, input.scopeKey]
  );
  if (!existing.rows[0]) {
    await db.query(
      `INSERT INTO blessboard.password_reset_rate_limits
         (scope_kind, scope_key, window_started_at, attempt_count)
       VALUES ($1, $2, now(), 1)`,
      [input.scopeKind, input.scopeKey]
    );
    return { ok: true, limited: false, attemptCount: 1 };
  }
  const row = existing.rows[0];
  const started = row.window_started_at ? new Date(row.window_started_at) : new Date(0);
  let attemptCount = Number(row.attempt_count || 0);
  if (started < windowStart) {
    attemptCount = 1;
    await db.query(
      `UPDATE blessboard.password_reset_rate_limits
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
    `UPDATE blessboard.password_reset_rate_limits
        SET attempt_count = $2, updated_at = now()
      WHERE id = $1`,
    [row.id, attemptCount]
  );
  return { ok: true, limited: false, attemptCount };
}

module.exports = {
  mapToken,
  insertActionToken,
  consumeActiveTokensForUserPurpose,
  findByTokenHash,
  markConsumed,
  consumeRateLimitSlot,
};
