"use strict";

/**
 * Product-neutral platform identity create/resolve helpers.
 * Does not grant product or organization access.
 */

const repo = require("../repositories/platformIdentityRepository");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_STATUS: "invalid_status",
  DUPLICATE_VERIFIED_PHONE: "duplicate_verified_phone",
  DUPLICATE_VERIFIED_EMAIL: "duplicate_verified_email",
  NOT_FOUND: "identity_not_found",
  DISABLED: "identity_disabled",
});

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const PHONE_RE = /^\+[1-9][0-9]{6,14}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeEmail(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  return value || null;
}

function normalizePhone(raw) {
  const value = String(raw || "").trim();
  return value || null;
}

function mapIdentity(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    primaryPhone: row.primary_phone || null,
    phoneNormalized: row.phone_normalized || null,
    phoneVerifiedAt: row.phone_verified_at || null,
    primaryEmail: row.primary_email || null,
    emailNormalized: row.email_normalized || null,
    emailVerifiedAt: row.email_verified_at || null,
    hasPasswordHash: Boolean(row.password_hash),
    mustChangePassword: row.must_change_password === true,
    lockedAt: row.locked_at || null,
    suspendedAt: row.suspended_at || null,
    failedSignInCount: Number(row.failed_sign_in_count) || 0,
    signInLockedUntil: row.sign_in_locked_until || null,
    lastSignInAt: row.last_sign_in_at || null,
    credentialsUpdatedAt: row.credentials_updated_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isIdentityUsable(row) {
  if (!row) return false;
  if (row.status !== "active") return false;
  if (row.locked_at) return false;
  if (row.suspended_at) return false;
  if (
    row.sign_in_locked_until &&
    new Date(row.sign_in_locked_until).getTime() > Date.now()
  ) {
    return false;
  }
  return true;
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   status?: string,
 *   primaryPhone?: string|null,
 *   phoneNormalized?: string|null,
 *   phoneVerifiedAt?: string|Date|null,
 *   primaryEmail?: string|null,
 *   emailNormalized?: string|null,
 *   emailVerifiedAt?: string|Date|null,
 *   passwordHash?: string|null,
 *   mustChangePassword?: boolean,
 *   requireContact?: boolean,
 * }} input
 */
async function createPlatformIdentity(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const status = String(raw.status || "active").trim().toLowerCase();
  if (!repo.IDENTITY_STATUSES.includes(status)) {
    return { ok: false, code: RESULT.INVALID_STATUS, identity: null };
  }

  let emailNormalized = normalizeEmail(raw.emailNormalized || raw.primaryEmail);
  let phoneNormalized = normalizePhone(raw.phoneNormalized || raw.primaryPhone);
  const primaryEmail =
    raw.primaryEmail != null ? String(raw.primaryEmail).trim() || null : emailNormalized;
  const primaryPhone =
    raw.primaryPhone != null ? String(raw.primaryPhone).trim() || null : phoneNormalized;

  if (emailNormalized && !EMAIL_RE.test(emailNormalized)) {
    return { ok: false, code: RESULT.INVALID_INPUT, identity: null };
  }
  if (phoneNormalized && (!PHONE_RE.test(phoneNormalized) || phoneNormalized.length > 20)) {
    return { ok: false, code: RESULT.INVALID_INPUT, identity: null };
  }

  const requireContact = raw.requireContact === true;
  if (requireContact && !emailNormalized && !phoneNormalized) {
    return { ok: false, code: RESULT.INVALID_INPUT, identity: null };
  }

  const phoneVerifiedAt = raw.phoneVerifiedAt || null;
  const emailVerifiedAt = raw.emailVerifiedAt || null;
  if (phoneVerifiedAt && !phoneNormalized) {
    return { ok: false, code: RESULT.INVALID_INPUT, identity: null };
  }
  if (emailVerifiedAt && !emailNormalized) {
    return { ok: false, code: RESULT.INVALID_INPUT, identity: null };
  }

  const passwordHash =
    raw.passwordHash != null && String(raw.passwordHash).trim() !== ""
      ? String(raw.passwordHash)
      : null;
  if (passwordHash && (passwordHash.length < 20 || passwordHash.length > 200)) {
    return { ok: false, code: RESULT.INVALID_INPUT, identity: null };
  }

  const suspendedAt = status === "suspended" ? raw.suspendedAt || new Date().toISOString() : null;

  try {
    const row = await repo.insertIdentity(db, {
      status,
      primaryPhone,
      phoneNormalized,
      phoneVerifiedAt,
      primaryEmail,
      emailNormalized,
      emailVerifiedAt,
      passwordHash,
      mustChangePassword: raw.mustChangePassword === true,
      lockedAt: raw.lockedAt || null,
      suspendedAt,
    });
    return { ok: true, code: RESULT.OK, identity: mapIdentity(row) };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/identities_verified_phone_uidx/i.test(msg)) {
      return { ok: false, code: RESULT.DUPLICATE_VERIFIED_PHONE, identity: null };
    }
    if (/identities_verified_email_uidx/i.test(msg)) {
      return { ok: false, code: RESULT.DUPLICATE_VERIFIED_EMAIL, identity: null };
    }
    throw err;
  }
}

/**
 * @param {{ query: Function }} db
 * @param {{ identityId: string, requireActive?: boolean }} input
 */
async function resolvePlatformIdentity(db, input) {
  const identityId = String((input && input.identityId) || "").trim();
  if (!identityId || !UUID_RE.test(identityId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, identity: null };
  }
  const row = await repo.findIdentityById(db, identityId);
  if (!row) {
    return { ok: false, code: RESULT.NOT_FOUND, identity: null };
  }
  if (input && input.requireActive !== false && !isIdentityUsable(row)) {
    return { ok: false, code: RESULT.DISABLED, identity: mapIdentity(row) };
  }
  return { ok: true, code: RESULT.OK, identity: mapIdentity(row) };
}

module.exports = {
  RESULT,
  mapIdentity,
  isIdentityUsable,
  normalizeEmail,
  normalizePhone,
  createPlatformIdentity,
  resolvePlatformIdentity,
};
