"use strict";

/**
 * Platform identity credential ownership (AC-V6-08).
 * ActiveClinic passwords live on platform.identities — never on staff_members
 * or blessboard.users. Does not copy BlessBoard hashes.
 */

const bcrypt = require("bcryptjs");
const repo = require("../repositories/platformIdentityRepository");
const {
  mapIdentity,
  isIdentityUsable,
} = require("./platformIdentityService");

const BCRYPT_ROUNDS = 12;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;
const LOCKOUT_THRESHOLD = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

const DUMMY_HASH =
  "$2a$12$C6UzMDM.H6dfI/f/IKxGhuR.Vo5.1qHqGhuR.Vo5.1qHqGhuR.Vo5.";

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  WEAK_PASSWORD: "weak_password",
  IDENTITY_NOT_FOUND: "identity_not_found",
  IDENTITY_DISABLED: "identity_disabled",
  INVALID_PASSWORD: "invalid_password",
  LOCKED: "identity_locked",
  MISSING_CREDENTIAL: "missing_credential",
});

function validatePasswordPolicy(password) {
  const value = password != null ? String(password) : "";
  if (!value || value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
    return { ok: false, code: RESULT.WEAK_PASSWORD };
  }
  return { ok: true, value };
}

async function burnCompare(password) {
  try {
    await bcrypt.compare(password, DUMMY_HASH);
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ query: Function }} db
 * @param {{ identityId: string, password: string, mustChangePassword?: boolean }} input
 */
async function setPlatformIdentityPassword(db, input) {
  const identityId = String((input && input.identityId) || "").trim();
  const policy = validatePasswordPolicy(input && input.password);
  if (!identityId || !policy.ok) {
    return {
      ok: false,
      code: !identityId ? RESULT.INVALID_INPUT : RESULT.WEAK_PASSWORD,
      identity: null,
    };
  }
  const row = await repo.findIdentityById(db, identityId);
  if (!row) {
    return { ok: false, code: RESULT.IDENTITY_NOT_FOUND, identity: null };
  }
  const passwordHash = await bcrypt.hash(policy.value, BCRYPT_ROUNDS);
  const updated = await repo.updateIdentityPasswordHash(db, {
    identityId,
    passwordHash,
    mustChangePassword:
      input.mustChangePassword === undefined ? false : Boolean(input.mustChangePassword),
  });
  return {
    ok: true,
    code: RESULT.OK,
    identity: mapIdentity(updated),
  };
}

/**
 * Verify platform password. Never returns hash. Generic failure codes for callers
 * that must not enumerate.
 *
 * @param {{ query: Function }} db
 * @param {{ identityId: string, password: string, recordFailure?: boolean }} input
 */
async function verifyPlatformIdentityPassword(db, input) {
  const identityId = String((input && input.identityId) || "").trim();
  const password = input && input.password != null ? String(input.password) : "";
  if (!identityId || !password) {
    await burnCompare(password || "x");
    return { ok: false, code: RESULT.INVALID_INPUT, identity: null };
  }

  const row = await repo.findIdentityById(db, identityId);
  if (!row) {
    await burnCompare(password);
    return { ok: false, code: RESULT.IDENTITY_NOT_FOUND, identity: null };
  }

  if (
    row.sign_in_locked_until &&
    new Date(row.sign_in_locked_until).getTime() > Date.now()
  ) {
    await burnCompare(password);
    return {
      ok: false,
      code: RESULT.LOCKED,
      identity: mapIdentity(row),
      failureCategory: "account_locked",
    };
  }

  if (!isIdentityUsable(row) && row.status !== "active") {
    await burnCompare(password);
    return {
      ok: false,
      code: RESULT.IDENTITY_DISABLED,
      identity: mapIdentity(row),
      failureCategory: "account_inactive",
    };
  }
  if (row.locked_at || row.suspended_at || row.status !== "active") {
    await burnCompare(password);
    return {
      ok: false,
      code: RESULT.IDENTITY_DISABLED,
      identity: mapIdentity(row),
      failureCategory: "account_inactive",
    };
  }

  if (!row.password_hash) {
    await burnCompare(password);
    return {
      ok: false,
      code: RESULT.MISSING_CREDENTIAL,
      identity: mapIdentity(row),
      failureCategory: "missing_credential",
    };
  }

  const passwordOk = await bcrypt.compare(password, row.password_hash);
  if (!passwordOk) {
    if (input.recordFailure !== false) {
      const nextCount = (Number(row.failed_sign_in_count) || 0) + 1;
      const lockedUntil =
        nextCount >= LOCKOUT_THRESHOLD
          ? new Date(Date.now() + LOCKOUT_MS)
          : null;
      await repo.updateIdentitySignInFailure(db, {
        identityId,
        failedSignInCount: nextCount,
        signInLockedUntil: lockedUntil,
      });
    }
    return {
      ok: false,
      code: RESULT.INVALID_PASSWORD,
      identity: mapIdentity(row),
      failureCategory: "password_rejected",
    };
  }

  return {
    ok: true,
    code: RESULT.OK,
    identity: mapIdentity(row),
    mustChangePassword: row.must_change_password === true,
  };
}

module.exports = {
  RESULT,
  BCRYPT_ROUNDS,
  PASSWORD_MIN,
  PASSWORD_MAX,
  LOCKOUT_THRESHOLD,
  LOCKOUT_MS,
  validatePasswordPolicy,
  setPlatformIdentityPassword,
  verifyPlatformIdentityPassword,
  burnCompare,
};
