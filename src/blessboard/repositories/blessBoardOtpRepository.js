"use strict";

/**
 * BlessBoard phone OTP repository (SQL only). Never returns plaintext codes.
 */

function mapRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    organizationId: row.organization_id ? String(row.organization_id) : null,
    userId: row.user_id ? String(row.user_id) : null,
    normalizedPhone: row.normalized_phone,
    purpose: row.purpose,
    provider: row.provider,
    providerVerificationId: row.provider_verification_id || null,
    status: row.status,
    attemptCount: Number(row.attempt_count) || 0,
    maxAttempts: Number(row.max_attempts) || 5,
    resendCount: Number(row.resend_count) || 0,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    verifiedAt: row.verified_at || null,
    cancelledAt: row.cancelled_at || null,
    lastAttemptAt: row.last_attempt_at || null,
    lastSentAt: row.last_sent_at,
    requestIp: row.request_ip || null,
    sessionFingerprint: row.session_fingerprint || null,
  };
}

async function insertVerification(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.phone_otp_verifications (
       organization_id, user_id, normalized_phone, purpose, provider,
       provider_verification_id, status, code_hash, max_attempts,
       expires_at, request_ip, session_fingerprint
     ) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      fields.organizationId || null,
      fields.userId || null,
      fields.normalizedPhone,
      fields.purpose,
      fields.provider,
      fields.providerVerificationId || null,
      fields.codeHash,
      fields.maxAttempts || 5,
      fields.expiresAt,
      fields.requestIp || null,
      fields.sessionFingerprint || null,
    ]
  );
  return mapRow(r.rows[0]);
}

async function findById(client, id, { forUpdate } = {}) {
  const lock = forUpdate ? " FOR UPDATE" : "";
  const r = await client.query(
    `SELECT * FROM blessboard.phone_otp_verifications WHERE id = $1 LIMIT 1${lock}`,
    [id]
  );
  return mapRow(r.rows[0] || null);
}

async function findLatestPending(client, { normalizedPhone, purpose, organizationId }) {
  const r = await client.query(
    `SELECT * FROM blessboard.phone_otp_verifications
      WHERE normalized_phone = $1
        AND purpose = $2
        AND status = 'pending'
        AND expires_at > now()
        AND ($3::uuid IS NULL OR organization_id IS NOT DISTINCT FROM $3::uuid)
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE`,
    [normalizedPhone, purpose, organizationId || null]
  );
  return mapRow(r.rows[0] || null);
}

async function updateProviderId(client, id, providerVerificationId) {
  await client.query(
    `UPDATE blessboard.phone_otp_verifications
        SET provider_verification_id = $2
      WHERE id = $1`,
    [id, providerVerificationId]
  );
}

async function markVerified(client, id) {
  const r = await client.query(
    `UPDATE blessboard.phone_otp_verifications
        SET status = 'verified',
            verified_at = now(),
            last_attempt_at = now(),
            attempt_count = attempt_count + 1
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [id]
  );
  return mapRow(r.rows[0] || null);
}

async function recordFailedAttempt(client, id, { exhausted }) {
  const r = await client.query(
    `UPDATE blessboard.phone_otp_verifications
        SET attempt_count = attempt_count + 1,
            last_attempt_at = now(),
            status = CASE WHEN $2 THEN 'exhausted' ELSE status END
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [id, Boolean(exhausted)]
  );
  return mapRow(r.rows[0] || null);
}

async function markCancelled(client, id) {
  const r = await client.query(
    `UPDATE blessboard.phone_otp_verifications
        SET status = 'cancelled', cancelled_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [id]
  );
  return mapRow(r.rows[0] || null);
}

async function markExpired(client, id) {
  const r = await client.query(
    `UPDATE blessboard.phone_otp_verifications
        SET status = 'expired'
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [id]
  );
  return mapRow(r.rows[0] || null);
}

async function countSentSince(client, { normalizedPhone, organizationId, since, purpose, requestIp }) {
  const r = await client.query(
    `SELECT
        COUNT(*) FILTER (WHERE normalized_phone = $1)::int AS phone_count,
        COUNT(*) FILTER (WHERE $2::uuid IS NOT NULL AND organization_id = $2)::int AS org_count,
        COUNT(*) FILTER (WHERE $3::text IS NOT NULL AND request_ip = $3)::int AS ip_count,
        COUNT(*) FILTER (WHERE purpose = $4 AND normalized_phone = $1)::int AS purpose_phone_count
       FROM blessboard.phone_otp_verifications
      WHERE created_at >= $5`,
    [normalizedPhone, organizationId || null, requestIp || null, purpose, since]
  );
  return r.rows[0];
}

module.exports = {
  insertVerification,
  findById,
  findLatestPending,
  updateProviderId,
  markVerified,
  recordFailedAttempt,
  markCancelled,
  markExpired,
  countSentSince,
  mapRow,
};
