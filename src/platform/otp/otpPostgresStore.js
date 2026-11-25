"use strict";

/**
 * Shared OTP store. Two workers use one pool and the reviewed tables.
 * This module does not create those tables and does not send email.
 */

const CHALLENGE_COLUMNS = `
  id, product_code, organization_id, account_id, session_id, attempt_id,
  action, purpose, channel, identifier_hash, code_hash, context_hash,
  status, attempt_count, max_attempts, consumed, created_at, expires_at,
  last_sent_at, verified_at
`;

function rejectPlaintext(record) {
  if (!record) return;
  if (record.code != null || record.otp != null || record.email != null || record.phone != null) {
    const error = new Error("otp_plaintext_rejected");
    error.code = "otp_plaintext_rejected";
    throw error;
  }
}

function asDate(value) {
  if (value instanceof Date) return value;
  return new Date(Number(value));
}

function asMillis(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? Number(value) : parsed;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    productCode: row.product_code,
    organizationId: row.organization_id,
    accountId: row.account_id,
    sessionId: row.session_id,
    attemptId: row.attempt_id,
    purpose: row.purpose,
    action: row.action,
    channel: row.channel,
    identifierHash: row.identifier_hash,
    codeHash: row.code_hash,
    contextHash: row.context_hash,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    createdAt: asMillis(row.created_at),
    expiresAt: asMillis(row.expires_at),
    lastSentAt: asMillis(row.last_sent_at),
    verifiedAt: asMillis(row.verified_at),
    consumed: row.consumed === true,
  };
}

function createPostgresOtpStore(pool) {
  if (!pool || typeof pool.query !== "function") {
    const error = new Error("otp_store_unavailable");
    error.code = "otp_store_unavailable";
    throw error;
  }

  async function query(sql, params) {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      if (error && error.code === "otp_plaintext_rejected") throw error;
      const wrapped = new Error("otp_store_unavailable");
      wrapped.code = "otp_store_unavailable";
      throw wrapped;
    }
  }

  return {
    async insert(record) {
      rejectPlaintext(record);
      const createdAt = asDate(record.createdAt);
      const result = await query(
        `INSERT INTO platform.otp_challenges (
           id, product_code, organization_id, account_id, session_id, attempt_id,
           action, purpose, channel, identifier_hash, code_hash, context_hash,
           status, attempt_count, max_attempts, consumed, created_at, expires_at,
           last_sent_at, verified_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11, $12,
           'pending', 0, $13, false, $14, $15,
           $14, NULL
         )
         RETURNING ${CHALLENGE_COLUMNS}`,
        [
          record.id,
          record.productCode,
          record.organizationId,
          record.accountId,
          record.sessionId,
          record.attemptId,
          record.action,
          record.purpose,
          record.channel,
          record.identifierHash,
          record.codeHash,
          record.contextHash,
          record.maxAttempts,
          createdAt,
          asDate(record.expiresAt),
        ]
      );
      return mapRow(result.rows[0]);
    },
    async findPending(binding) {
      const result = await query(
        `SELECT ${CHALLENGE_COLUMNS}
           FROM platform.otp_challenges
          WHERE product_code = $1
            AND organization_id = $2
            AND account_id = $3
            AND purpose = $4
            AND channel = $5
            AND status = 'pending'
            AND ($6::uuid IS NULL OR session_id = $6)
          ORDER BY created_at DESC
          LIMIT 1`,
        [
          binding.productCode,
          binding.organizationId,
          binding.accountId,
          binding.purpose,
          binding.channel,
          binding.sessionId || null,
        ]
      );
      return mapRow(result.rows[0]);
    },
    async findByAttempt(binding) {
      const result = await query(
        `SELECT ${CHALLENGE_COLUMNS}
           FROM platform.otp_challenges
          WHERE product_code = $1
            AND account_id = $2
            AND purpose = $3
            AND ($4::text IS NULL OR channel = $4)
            AND ($5::uuid IS NULL OR attempt_id = $5)
            AND ($6::uuid IS NULL OR session_id = $6)
            AND ($7::uuid IS NULL OR organization_id = $7)
          ORDER BY created_at DESC
          LIMIT 1`,
        [
          binding.productCode,
          binding.accountId,
          binding.purpose,
          binding.channel || null,
          binding.attemptId || null,
          binding.sessionId || null,
          binding.organizationId || null,
        ]
      );
      return mapRow(result.rows[0]);
    },
    async update(id, patch) {
      rejectPlaintext(patch);
      if (patch.status === "cancelled" || patch.status === "exhausted") {
        const result = await query(
          `UPDATE platform.otp_challenges
              SET status = $2
            WHERE id = $1
              AND status = 'pending'
              AND ($2 <> 'exhausted' OR attempt_count >= max_attempts)
          RETURNING ${CHALLENGE_COLUMNS}`,
          [id, patch.status]
        );
        return mapRow(result.rows[0]);
      }
      return null;
    },
    async compareAndVerify(id, now) {
      const result = await query(
        `UPDATE platform.otp_challenges
            SET status = 'verified',
                verified_at = $2
          WHERE id = $1
            AND status = 'pending'
            AND consumed = false
            AND expires_at > $2
            AND attempt_count < max_attempts
        RETURNING ${CHALLENGE_COLUMNS}`,
        [id, asDate(now)]
      );
      return mapRow(result.rows[0]);
    },
    async recordFailedAttempt(id) {
      const result = await query(
        `UPDATE platform.otp_challenges
            SET attempt_count = attempt_count + 1,
                status = CASE
                  WHEN attempt_count + 1 >= max_attempts THEN 'exhausted'
                  ELSE status
                END
          WHERE id = $1
            AND status = 'pending'
            AND consumed = false
        RETURNING ${CHALLENGE_COLUMNS}`,
        [id]
      );
      return mapRow(result.rows[0]);
    },
    async markExpired(id, now) {
      const result = await query(
        `UPDATE platform.otp_challenges
            SET status = 'expired'
          WHERE id = $1
            AND status = 'pending'
            AND expires_at <= $2
        RETURNING ${CHALLENGE_COLUMNS}`,
        [id, asDate(now)]
      );
      return mapRow(result.rows[0]);
    },
    async consumeVerified(id) {
      const result = await query(
        `UPDATE platform.otp_challenges
            SET consumed = true
          WHERE id = $1
            AND status = 'verified'
            AND consumed = false
        RETURNING ${CHALLENGE_COLUMNS}`,
        [id]
      );
      return mapRow(result.rows[0]);
    },
    async consumeRate(key, now, windowMs) {
      const started = asDate(now);
      const cutoff = asDate(Number(now) - Number(windowMs));
      const result = await query(
        `INSERT INTO platform.otp_rate_buckets (bucket_key, window_started_at, attempt_count)
         VALUES ($1, $2, 1)
         ON CONFLICT (bucket_key) DO UPDATE
           SET attempt_count = CASE
                 WHEN platform.otp_rate_buckets.window_started_at <= $3 THEN 1
                 ELSE platform.otp_rate_buckets.attempt_count + 1
               END,
               window_started_at = CASE
                 WHEN platform.otp_rate_buckets.window_started_at <= $3 THEN $2
                 ELSE platform.otp_rate_buckets.window_started_at
               END
         RETURNING attempt_count`,
        [key, started, cutoff]
      );
      return Number(result.rows[0].attempt_count);
    },
    appendAudit(event) {
      const safe = { ...event };
      delete safe.code;
      delete safe.otp;
      delete safe.codeHash;
      delete safe.identifier;
      delete safe.destination;
      delete safe.pepper;
      return safe;
    },
    audits() {
      return [];
    },
  };
}

module.exports = {
  createPostgresOtpStore,
};
