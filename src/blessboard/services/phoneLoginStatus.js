"use strict";

/**
 * Phone verification / migration status for BlessBoard users (Prompt 11E).
 * Administrators must not mark phones verified; only OTP/provider success sets phone_verified_at.
 */

const STATUS = Object.freeze({
  PHONE_MISSING: "phone_missing",
  PHONE_UNVERIFIED: "phone_unverified",
  PHONE_VERIFIED: "phone_verified",
});

/**
 * @param {{ phone_normalized?: string|null, phoneNormalized?: string|null, phone_verified_at?: Date|string|null, phoneVerifiedAt?: Date|string|null } | null | undefined} user
 * @returns {'phone_missing'|'phone_unverified'|'phone_verified'}
 */
function resolvePhoneLoginStatus(user) {
  if (!user) return STATUS.PHONE_MISSING;
  const phone =
    user.phone_normalized != null
      ? user.phone_normalized
      : user.phoneNormalized != null
        ? user.phoneNormalized
        : null;
  if (!phone || String(phone).trim() === "") return STATUS.PHONE_MISSING;
  const verified =
    user.phone_verified_at != null
      ? user.phone_verified_at
      : user.phoneVerifiedAt != null
        ? user.phoneVerifiedAt
        : null;
  if (verified) return STATUS.PHONE_VERIFIED;
  return STATUS.PHONE_UNVERIFIED;
}

/**
 * Soft prompt after successful login for email-only accounts.
 * @param {string} phoneStatus
 */
function phoneMigrationPrompt(phoneStatus) {
  if (phoneStatus === STATUS.PHONE_MISSING) {
    return {
      code: "add_phone",
      message:
        "Add a mobile phone number to your profile for login, verification and invitations. Email sign-in remains available.",
    };
  }
  if (phoneStatus === STATUS.PHONE_UNVERIFIED) {
    return {
      code: "verify_phone",
      message:
        "Verify your mobile phone number when SMS verification is available. Email sign-in remains available.",
    };
  }
  return null;
}

module.exports = {
  PHONE_LOGIN_STATUS: STATUS,
  resolvePhoneLoginStatus,
  phoneMigrationPrompt,
};
