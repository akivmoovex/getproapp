"use strict";

/**
 * Persistence for platform.identities and identity_product_profiles.
 */

const IDENTITY_STATUSES = Object.freeze(["active", "inactive", "suspended"]);
const PROFILE_STATUSES = Object.freeze(["active", "inactive", "revoked"]);

/**
 * @param {{ query: Function }} db
 * @param {object} row
 */
async function insertIdentity(db, row) {
  // Use DB now() for suspended_at when suspending so it cannot precede created_at.
  const result = await db.query(
    `INSERT INTO platform.identities (
       status, primary_phone, phone_normalized, phone_verified_at,
       primary_email, email_normalized, email_verified_at,
       password_hash, must_change_password, locked_at, suspended_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
       CASE WHEN $1 = 'suspended' THEN COALESCE($11::timestamptz, now()) ELSE $11::timestamptz END
     )
     RETURNING *`,
    [
      row.status,
      row.primaryPhone,
      row.phoneNormalized,
      row.phoneVerifiedAt,
      row.primaryEmail,
      row.emailNormalized,
      row.emailVerifiedAt,
      row.passwordHash,
      row.mustChangePassword === true,
      row.lockedAt,
      row.status === "suspended" ? null : row.suspendedAt,
    ]
  );
  return result.rows[0];
}

/**
 * @param {{ query: Function }} db
 * @param {string} identityId
 */
async function findIdentityById(db, identityId) {
  const result = await db.query(
    `SELECT * FROM platform.identities WHERE id = $1 LIMIT 1`,
    [identityId]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ phoneNormalized?: string|null, emailNormalized?: string|null }} input
 */
async function findIdentityByVerifiedContact(db, input) {
  if (input.phoneNormalized) {
    const byPhone = await db.query(
      `SELECT * FROM platform.identities
        WHERE phone_normalized = $1
          AND phone_verified_at IS NOT NULL
        LIMIT 2`,
      [input.phoneNormalized]
    );
    if (byPhone.rowCount > 0) return byPhone.rows;
  }
  if (input.emailNormalized) {
    const byEmail = await db.query(
      `SELECT * FROM platform.identities
        WHERE email_normalized = $1
          AND email_verified_at IS NOT NULL
        LIMIT 2`,
      [input.emailNormalized]
    );
    if (byEmail.rowCount > 0) return byEmail.rows;
  }
  return [];
}

/**
 * Login lookup by normalized contact (verified not required). Caller must
 * treat rowCount > 1 as ambiguous.
 * @param {{ query: Function }} db
 * @param {{ phoneNormalized?: string|null, emailNormalized?: string|null }} input
 */
async function findIdentitiesByNormalizedContact(db, input) {
  if (input.phoneNormalized) {
    const byPhone = await db.query(
      `SELECT * FROM platform.identities
        WHERE phone_normalized = $1
        LIMIT 3`,
      [input.phoneNormalized]
    );
    return byPhone.rows;
  }
  if (input.emailNormalized) {
    const byEmail = await db.query(
      `SELECT * FROM platform.identities
        WHERE email_normalized = $1
        LIMIT 3`,
      [input.emailNormalized]
    );
    return byEmail.rows;
  }
  return [];
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   identityId: string,
 *   passwordHash: string,
 *   mustChangePassword?: boolean,
 * }} input
 */
async function updateIdentityPasswordHash(db, input) {
  const result = await db.query(
    `UPDATE platform.identities
        SET password_hash = $2,
            must_change_password = COALESCE($3, must_change_password),
            credentials_updated_at = now(),
            failed_sign_in_count = 0,
            sign_in_locked_until = NULL,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [
      input.identityId,
      input.passwordHash,
      input.mustChangePassword === undefined ? null : Boolean(input.mustChangePassword),
    ]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ identityId: string, failedSignInCount: number, signInLockedUntil?: Date|string|null }} input
 */
async function updateIdentitySignInFailure(db, input) {
  const result = await db.query(
    `UPDATE platform.identities
        SET failed_sign_in_count = $2,
            sign_in_locked_until = $3,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [
      input.identityId,
      input.failedSignInCount,
      input.signInLockedUntil
        ? input.signInLockedUntil instanceof Date
          ? input.signInLockedUntil.toISOString()
          : input.signInLockedUntil
        : null,
    ]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {string} identityId
 */
async function recordIdentitySignInSuccess(db, identityId) {
  const result = await db.query(
    `UPDATE platform.identities
        SET failed_sign_in_count = 0,
            sign_in_locked_until = NULL,
            last_sign_in_at = now(),
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [identityId]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ identityId: string, mustChangePassword: boolean }} input
 */
async function setMustChangePassword(db, input) {
  const result = await db.query(
    `UPDATE platform.identities
        SET must_change_password = $2,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [input.identityId, Boolean(input.mustChangePassword)]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {object} row
 */
async function insertProductProfile(db, row) {
  const result = await db.query(
    `INSERT INTO platform.identity_product_profiles (
       identity_id, product_key, profile_type, product_profile_id, status
     ) VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [
      row.identityId,
      row.productKey,
      row.profileType,
      row.productProfileId,
      row.status || "active",
    ]
  );
  return result.rows[0];
}

/**
 * @param {{ query: Function }} db
 * @param {string} identityId
 */
async function listProductProfilesByIdentity(db, identityId) {
  const result = await db.query(
    `SELECT * FROM platform.identity_product_profiles
      WHERE identity_id = $1
      ORDER BY product_key ASC, created_at ASC`,
    [identityId]
  );
  return result.rows;
}

/**
 * @param {{ query: Function }} db
 * @param {{ identityId: string, productKey: string }} input
 */
async function findProductProfile(db, input) {
  const result = await db.query(
    `SELECT * FROM platform.identity_product_profiles
      WHERE identity_id = $1 AND product_key = $2
      LIMIT 1`,
    [input.identityId, input.productKey]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ productKey: string, productProfileId: string }} input
 */
async function findProductProfileByProductProfile(db, input) {
  const result = await db.query(
    `SELECT * FROM platform.identity_product_profiles
      WHERE product_key = $1 AND product_profile_id = $2
      LIMIT 1`,
    [input.productKey, input.productProfileId]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {string} blessBoardUserId
 */
async function findBlessBoardUserById(db, blessBoardUserId) {
  const result = await db.query(
    `SELECT id, email_normalized, phone_normalized, phone_verified_at,
            status, display_name, password_hash, platform_identity_id,
            created_at, updated_at, last_login_at, password_changed_at
       FROM blessboard.users
      WHERE id = $1
      LIMIT 1`,
    [blessBoardUserId]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ userId: string, identityId: string }} input
 */
async function setBlessBoardUserPlatformIdentity(db, input) {
  const result = await db.query(
    `UPDATE blessboard.users
        SET platform_identity_id = $2,
            updated_at = now()
      WHERE id = $1
        AND (platform_identity_id IS NULL OR platform_identity_id = $2)
      RETURNING id, platform_identity_id`,
    [input.userId, input.identityId]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {string} identityId
 */
async function clearBlessBoardUserPlatformIdentity(db, identityId) {
  await db.query(
    `UPDATE blessboard.users
        SET platform_identity_id = NULL,
            updated_at = now()
      WHERE platform_identity_id = $1`,
    [identityId]
  );
}

/**
 * @param {{ query: Function }} db
 * @param {string} profileLinkId
 * @param {string} status
 */
async function updateProductProfileStatus(db, profileLinkId, status) {
  const result = await db.query(
    `UPDATE platform.identity_product_profiles
        SET status = $2,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [profileLinkId, status]
  );
  return result.rows[0] || null;
}

module.exports = {
  IDENTITY_STATUSES,
  PROFILE_STATUSES,
  insertIdentity,
  findIdentityById,
  findIdentityByVerifiedContact,
  findIdentitiesByNormalizedContact,
  updateIdentityPasswordHash,
  updateIdentitySignInFailure,
  recordIdentitySignInSuccess,
  setMustChangePassword,
  insertProductProfile,
  listProductProfilesByIdentity,
  findProductProfile,
  findProductProfileByProductProfile,
  findBlessBoardUserById,
  setBlessBoardUserPlatformIdentity,
  clearBlessBoardUserPlatformIdentity,
  updateProductProfileStatus,
};
