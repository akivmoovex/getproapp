"use strict";

/**
 * ActiveClinic patient portal password service (AC-V6-P27).
 * Forgot/reset using new purpose. Enumeration-safe. Delivery UNAVAILABLE honesty.
 */

const crypto = require("crypto");
const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const {
  normalizeEmail,
} = require("../../platform/services/platformIdentityService");
const {
  normalizeActiveClinicPhone,
} = require("./normalizeActiveClinicContact");
const {
  setPlatformIdentityPassword,
} = require("../../platform/services/platformIdentityCredentialService");

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  DELIVERY_UNAVAILABLE: "delivery_unavailable",
  TOKEN_INVALID: "token_invalid",
  TOKEN_EXPIRED: "token_expired",
  TOKEN_ALREADY_USED: "token_already_used",
  IDENTITY_NOT_FOUND: "identity_not_found",
  TRANSACTION_ERROR: "transaction_error",
});

function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashIp(ip) {
  return ip ? crypto.createHash("sha256").update(ip).digest("hex") : null;
}

/**
 * Request password reset (enumeration-safe).
 * Always returns success, but delivery is UNAVAILABLE (honest).
 */
async function requestPatientPasswordReset(db, input) {
  const identifier = String((input && input.identifier) || "").trim();
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();
  const organizationId = String((input && input.organizationId) || "").trim();
  const ip = input && input.ip ? String(input.ip) : null;

  if (!identifier || !deploymentCode || !organizationId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  let identityId = null;
  const email = normalizeEmail(identifier);
  if (email && EMAIL_RE.test(email)) {
    const rows = await identityRepo.findIdentitiesByNormalizedContact(db, {
      emailNormalized: email,
    });
    if (rows.length === 1) {
      identityId = rows[0].id;
    }
  } else {
    const phone = normalizeActiveClinicPhone(identifier, {
      country: input.country || "ZM",
    });
    if (phone.ok && phone.normalized) {
      const rows = await identityRepo.findIdentitiesByNormalizedContact(db, {
        phoneNormalized: phone.normalized,
      });
      if (rows.length === 1) {
        identityId = rows[0].id;
      }
    }
  }

  // Enumeration-safe: always return success, but delivery is unavailable
  if (!identityId) {
    return {
      ok: true,
      code: RESULT.DELIVERY_UNAVAILABLE,
      message: "reset_delivery_unavailable",
    };
  }

  // Check if identity has patient link in this org
  const patientRow = await db.query(
    `SELECT id FROM activeclinic.patients
     WHERE platform_identity_id = $1 AND organization_id = $2 AND status = 'active'
     LIMIT 1`,
    [identityId, organizationId]
  );

  if (!patientRow.rows[0]) {
    return {
      ok: true,
      code: RESULT.DELIVERY_UNAVAILABLE,
      message: "reset_delivery_unavailable",
    };
  }

  const rawToken = generateResetToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.query(
    `INSERT INTO platform.identity_action_tokens
      (platform_identity_id, purpose, token_hash, expires_at, deployment_code, product_key, organization_id, request_ip_hash, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      identityId,
      "activeclinic_patient_password_reset",
      tokenHash,
      expiresAt,
      deploymentCode,
      "activeclinic",
      organizationId,
      hashIp(ip),
      JSON.stringify({ patient_id: patientRow.rows[0].id }),
    ]
  );

  // Real implementation would send email/SMS here, but we don't have delivery.
  // Return delivery unavailable with token for TEST environments only.
  if (process.env.NODE_ENV === "test") {
    return {
      ok: true,
      code: RESULT.DELIVERY_UNAVAILABLE,
      message: "reset_delivery_unavailable",
      testToken: rawToken,
    };
  }

  return {
    ok: true,
    code: RESULT.DELIVERY_UNAVAILABLE,
    message: "reset_delivery_unavailable",
  };
}

/**
 * Reset password with token.
 */
async function resetPatientPassword(db, input) {
  const rawToken = String((input && input.token) || "").trim();
  const newPassword = String((input && input.newPassword) || "");

  if (!rawToken || !newPassword) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  if (newPassword.length < 8) {
    return { ok: false, code: RESULT.INVALID_INPUT, message: "password_too_short" };
  }

  const tokenHash = hashToken(rawToken);

  const tokenRow = await db.query(
    `SELECT id, platform_identity_id, expires_at, consumed_at, revoked_at
     FROM platform.identity_action_tokens
     WHERE token_hash = $1 AND purpose = 'activeclinic_patient_password_reset'
     LIMIT 1`,
    [tokenHash]
  );

  if (!tokenRow.rows[0]) {
    return { ok: false, code: RESULT.TOKEN_INVALID };
  }

  const token = tokenRow.rows[0];

  if (token.consumed_at) {
    return { ok: false, code: RESULT.TOKEN_ALREADY_USED };
  }

  if (token.revoked_at) {
    return { ok: false, code: RESULT.TOKEN_INVALID };
  }

  if (new Date(token.expires_at) < new Date()) {
    return { ok: false, code: RESULT.TOKEN_EXPIRED };
  }

  const client =
    typeof db.connect === "function" && typeof db.release !== "function"
      ? await db.connect()
      : null;
  const q = client || db;

  try {
    if (client) await client.query("BEGIN");

    const updated = await setPlatformIdentityPassword(q, {
      identityId: token.platform_identity_id,
      password: newPassword,
      clearMustChangePassword: true,
    });

    if (!updated.ok) {
      if (client) await client.query("ROLLBACK");
      return { ok: false, code: RESULT.TRANSACTION_ERROR };
    }

    await q.query(
      `UPDATE platform.identity_action_tokens
       SET consumed_at = now()
       WHERE id = $1`,
      [token.id]
    );

    if (client) await client.query("COMMIT");

    return { ok: true, code: RESULT.OK };
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  RESULT,
  requestPatientPasswordReset,
  resetPatientPassword,
};
