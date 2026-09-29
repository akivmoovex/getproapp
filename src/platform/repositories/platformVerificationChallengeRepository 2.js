"use strict";

/**
 * Persistence for platform.identity_verification_challenges (hashed codes only).
 */

function mapChallenge(row) {
  if (!row) return null;
  return {
    id: row.id != null ? String(row.id) : null,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id != null ? String(row.subject_id) : null,
    productKey: row.product_key,
    channel: row.channel,
    purpose: row.purpose,
    identifierNormalized: row.identifier_normalized,
    codeHash: row.code_hash,
    status: row.status,
    attemptCount: Number(row.attempt_count) || 0,
    maxAttempts: Number(row.max_attempts) || 5,
    resendCount: Number(row.resend_count) || 0,
    expiresAt: row.expires_at || null,
    verifiedAt: row.verified_at || null,
    cancelledAt: row.cancelled_at || null,
    lastSentAt: row.last_sent_at || null,
    lastAttemptAt: row.last_attempt_at || null,
    requestIpHash: row.request_ip_hash || null,
    deliveryProvider: row.delivery_provider || null,
    metadataJson:
      row.metadata_json && typeof row.metadata_json === "object"
        ? row.metadata_json
        : {},
    createdAt: row.created_at || null,
  };
}

async function insertChallenge(db, fields) {
  const r = await db.query(
    `INSERT INTO platform.identity_verification_challenges (
       subject_kind, subject_id, product_key, channel, purpose,
       identifier_normalized, code_hash, max_attempts, expires_at,
       request_ip_hash, delivery_provider, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     RETURNING *`,
    [
      fields.subjectKind,
      fields.subjectId,
      fields.productKey,
      fields.channel,
      fields.purpose || "account_verification",
      fields.identifierNormalized,
      fields.codeHash,
      fields.maxAttempts || 5,
      fields.expiresAt,
      fields.requestIpHash || null,
      fields.deliveryProvider || "testing_outbox",
      JSON.stringify(fields.metadataJson || {}),
    ]
  );
  return mapChallenge(r.rows[0]);
}

async function findById(db, id, { forUpdate } = {}) {
  const lock = forUpdate ? " FOR UPDATE" : "";
  const r = await db.query(
    `SELECT * FROM platform.identity_verification_challenges
      WHERE id = $1 LIMIT 1${lock}`,
    [id]
  );
  return mapChallenge(r.rows[0] || null);
}

async function findLatestPending(db, input) {
  const r = await db.query(
    `SELECT * FROM platform.identity_verification_challenges
      WHERE subject_kind = $1
        AND subject_id = $2
        AND channel = $3
        AND purpose = $4
        AND status = 'pending'
        AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE`,
    [
      input.subjectKind,
      input.subjectId,
      input.channel,
      input.purpose || "account_verification",
    ]
  );
  return mapChallenge(r.rows[0] || null);
}

async function cancelPendingForSubject(db, input) {
  const r = await db.query(
    `UPDATE platform.identity_verification_challenges
        SET status = 'cancelled',
            cancelled_at = now()
      WHERE subject_kind = $1
        AND subject_id = $2
        AND channel = $3
        AND purpose = $4
        AND status = 'pending'
      RETURNING id`,
    [
      input.subjectKind,
      input.subjectId,
      input.channel,
      input.purpose || "account_verification",
    ]
  );
  return r.rowCount || 0;
}

async function markVerified(db, id) {
  const r = await db.query(
    `UPDATE platform.identity_verification_challenges
        SET status = 'verified',
            verified_at = now(),
            last_attempt_at = now()
      WHERE id = $1
        AND status = 'pending'
      RETURNING *`,
    [id]
  );
  return mapChallenge(r.rows[0] || null);
}

async function markExhausted(db, id) {
  const r = await db.query(
    `UPDATE platform.identity_verification_challenges
        SET status = 'exhausted',
            last_attempt_at = now()
      WHERE id = $1
      RETURNING *`,
    [id]
  );
  return mapChallenge(r.rows[0] || null);
}

async function markExpired(db, id) {
  const r = await db.query(
    `UPDATE platform.identity_verification_challenges
        SET status = 'expired'
      WHERE id = $1
        AND status = 'pending'
      RETURNING *`,
    [id]
  );
  return mapChallenge(r.rows[0] || null);
}

async function recordFailedAttempt(db, id) {
  const r = await db.query(
    `UPDATE platform.identity_verification_challenges
        SET attempt_count = attempt_count + 1,
            last_attempt_at = now(),
            status = CASE
              WHEN attempt_count + 1 >= max_attempts THEN 'exhausted'
              ELSE status
            END
      WHERE id = $1
        AND status = 'pending'
      RETURNING *`,
    [id]
  );
  return mapChallenge(r.rows[0] || null);
}

async function bumpResend(db, id, codeHash, expiresAt) {
  const r = await db.query(
    `UPDATE platform.identity_verification_challenges
        SET code_hash = $2,
            expires_at = $3,
            resend_count = resend_count + 1,
            last_sent_at = now(),
            attempt_count = 0,
            status = 'pending'
      WHERE id = $1
      RETURNING *`,
    [id, codeHash, expiresAt]
  );
  return mapChallenge(r.rows[0] || null);
}

/**
 * Sliding-window rate limit slot.
 */
async function consumeRateLimitSlot(db, input) {
  const windowMs = Math.max(1000, Number(input.windowMs) || 15 * 60 * 1000);
  const maxAttempts = Math.max(1, Number(input.maxAttempts) || 5);
  const now = Date.now();
  const existing = await db.query(
    `SELECT scope_kind, scope_key, window_started_at, attempt_count
       FROM platform.identity_verification_rate_limits
      WHERE scope_kind = $1 AND scope_key = $2
      FOR UPDATE`,
    [input.scopeKind, input.scopeKey]
  );
  if (!existing.rows[0]) {
    await db.query(
      `INSERT INTO platform.identity_verification_rate_limits
         (scope_kind, scope_key, window_started_at, attempt_count, updated_at)
       VALUES ($1,$2,now(),1,now())`,
      [input.scopeKind, input.scopeKey]
    );
    return { limited: false, attemptCount: 1 };
  }
  const row = existing.rows[0];
  const started = new Date(row.window_started_at).getTime();
  if (now - started > windowMs) {
    await db.query(
      `UPDATE platform.identity_verification_rate_limits
          SET window_started_at = now(),
              attempt_count = 1,
              updated_at = now()
        WHERE scope_kind = $1 AND scope_key = $2`,
      [input.scopeKind, input.scopeKey]
    );
    return { limited: false, attemptCount: 1 };
  }
  const next = (Number(row.attempt_count) || 0) + 1;
  if (next > maxAttempts) {
    return { limited: true, attemptCount: Number(row.attempt_count) || 0 };
  }
  await db.query(
    `UPDATE platform.identity_verification_rate_limits
        SET attempt_count = $3,
            updated_at = now()
      WHERE scope_kind = $1 AND scope_key = $2`,
    [input.scopeKind, input.scopeKey, next]
  );
  return { limited: false, attemptCount: next };
}

module.exports = {
  mapChallenge,
  insertChallenge,
  findById,
  findLatestPending,
  cancelPendingForSubject,
  markVerified,
  markExhausted,
  markExpired,
  recordFailedAttempt,
  bumpResend,
  consumeRateLimitSlot,
};
