"use strict";

async function countRecentSends(pool, tenantId, phoneNorm) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.intake_phone_otp
     WHERE tenant_id = $1 AND phone_normalized = $2
       AND created_at > now() - interval '1 hour'`,
    [tenantId, phoneNorm]
  );
  return r.rows[0].c;
}

async function insertOtp(pool, p) {
  await pool.query(
    `INSERT INTO public.intake_phone_otp (tenant_id, client_id, phone_normalized, code_hash, purpose, expires_at, max_attempts)
     VALUES ($1, $2, $3, $4, 'phone_verify', $5, 5)`,
    [p.tenantId, p.clientId, p.phoneNormalized, p.codeHash, p.expiresAt]
  );
}

async function getActiveOtpForClientPhone(pool, tenantId, clientId, phoneNorm) {
  const r = await pool.query(
    `SELECT * FROM public.intake_phone_otp
     WHERE tenant_id = $1 AND client_id = $2 AND phone_normalized = $3 AND verified_at IS NULL
       AND expires_at > now()
     ORDER BY id DESC LIMIT 1`,
    [tenantId, clientId, phoneNorm]
  );
  return r.rows[0] ?? null;
}

async function updateAttempts(pool, attempts, id, tenantId) {
  await pool.query(`UPDATE public.intake_phone_otp SET attempts = $1 WHERE id = $2 AND tenant_id = $3`, [
    attempts,
    id,
    tenantId,
  ]);
}

async function markVerified(pool, attempts, id, tenantId) {
  await pool.query(
    `UPDATE public.intake_phone_otp SET attempts = $1, verified_at = now() WHERE id = $2 AND tenant_id = $3`,
    [attempts, id, tenantId]
  );
}

module.exports = {
  countRecentSends,
  insertOtp,
  getActiveOtpForClientPhone,
  updateAttempts,
  markVerified,
};
