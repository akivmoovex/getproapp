"use strict";

/**
 * Shared registration contact → principal matching and reuse authorization.
 *
 * Used by ActiveClinic (platform.identities) and BlessBoard (blessboard.users)
 * so both products enforce one rule set:
 *
 * - One normalized phone maps to at most one login principal.
 * - Email + phone resolving to different principals → conflict (no PII leaked).
 * - Existing principal reuse requires password verification (or explicit ack/admin).
 * - Multi-tenant ownership is membership, not a second login for the same phone.
 */

const bcrypt = require("bcryptjs");

const REGISTRATION_IDENTITY_ACTION = Object.freeze({
  CREATE: "create",
  REUSE: "reuse",
  REJECT_EXISTING_ACCOUNT: "reject_existing_account",
  REJECT_IDENTITY_CONFLICT: "reject_identity_conflict",
});

const REGISTRATION_IDENTITY_REASON = Object.freeze({
  FRESH: "fresh_identity",
  PHONE_AMBIGUOUS: "phone_matches_multiple_identities",
  EMAIL_PHONE_SPLIT: "email_and_phone_resolve_to_different_identities",
  PASSWORD_REQUIRED: "existing_account_requires_sign_in",
  PASSWORD_MISMATCH: "existing_account_password_mismatch",
  ACK_REQUIRED: "existing_identity_acknowledgement_required",
});

/**
 * Match email and phone lookups to a single principal (or a safe conflict).
 *
 * @param {object|null} emailPrincipal row with `id`
 * @param {object[]} phonePrincipals rows with `id` (0–N; >1 is ambiguous)
 */
function matchRegistrationContactPrincipals(emailPrincipal, phonePrincipals) {
  const phones = Array.isArray(phonePrincipals) ? phonePrincipals : [];
  const phonePrincipal = phones.length === 1 ? phones[0] : null;
  const emailMatched = Boolean(emailPrincipal && emailPrincipal.id);
  const phoneMatched = Boolean(phonePrincipal && phonePrincipal.id);

  if (phones.length > 1) {
    return {
      ok: false,
      action: REGISTRATION_IDENTITY_ACTION.REJECT_IDENTITY_CONFLICT,
      reason: REGISTRATION_IDENTITY_REASON.PHONE_AMBIGUOUS,
      emailMatched,
      phoneMatched: true,
      principal: null,
      matchOn: null,
      diagnostics: {
        identityResolution: "phone_ambiguous",
        emailMatched,
        phoneMatched: true,
        phoneMatchCount: phones.length,
      },
    };
  }

  if (
    emailMatched &&
    phoneMatched &&
    String(emailPrincipal.id) !== String(phonePrincipal.id)
  ) {
    return {
      ok: false,
      action: REGISTRATION_IDENTITY_ACTION.REJECT_IDENTITY_CONFLICT,
      reason: REGISTRATION_IDENTITY_REASON.EMAIL_PHONE_SPLIT,
      emailMatched: true,
      phoneMatched: true,
      principal: null,
      matchOn: null,
      diagnostics: {
        identityResolution: "email_phone_split",
        emailMatched: true,
        phoneMatched: true,
      },
    };
  }

  const principal = emailPrincipal || phonePrincipal || null;
  if (!principal || !principal.id) {
    return {
      ok: true,
      action: REGISTRATION_IDENTITY_ACTION.CREATE,
      reason: REGISTRATION_IDENTITY_REASON.FRESH,
      emailMatched: false,
      phoneMatched: false,
      principal: null,
      matchOn: null,
      diagnostics: {
        identityResolution: "create",
        emailMatched: false,
        phoneMatched: false,
      },
    };
  }

  return {
    ok: true,
    action: null,
    reason: null,
    emailMatched,
    phoneMatched,
    principal,
    matchOn:
      emailMatched && phoneMatched
        ? "email_and_phone"
        : emailMatched
          ? "email"
          : phoneMatched
            ? "phone"
            : null,
    diagnostics: {
      identityResolution: "matched",
      emailMatched,
      phoneMatched,
    },
  };
}

/**
 * Authorize attaching a new tenant membership to an existing login principal.
 * Does not reveal whether email or phone matched.
 *
 * @param {{
 *   passwordHash?: string|null,
 *   password?: string|null,
 *   multiTenant?: boolean,
 * }} input
 */
async function authorizeExistingPrincipalReuse(input = {}) {
  const hash = input.passwordHash != null ? String(input.passwordHash) : "";
  const password = input.password != null ? String(input.password) : "";
  const multiTenant = input.multiTenant === true;

  if (!hash) {
    return {
      ok: false,
      action: REGISTRATION_IDENTITY_ACTION.REJECT_EXISTING_ACCOUNT,
      reason: REGISTRATION_IDENTITY_REASON.PASSWORD_REQUIRED,
    };
  }
  if (!password) {
    return {
      ok: false,
      action: REGISTRATION_IDENTITY_ACTION.REJECT_EXISTING_ACCOUNT,
      reason: multiTenant
        ? REGISTRATION_IDENTITY_REASON.ACK_REQUIRED
        : REGISTRATION_IDENTITY_REASON.PASSWORD_REQUIRED,
    };
  }

  let passwordOk = false;
  try {
    passwordOk = await bcrypt.compare(password, hash);
  } catch {
    passwordOk = false;
  }
  if (!passwordOk) {
    return {
      ok: false,
      action: REGISTRATION_IDENTITY_ACTION.REJECT_EXISTING_ACCOUNT,
      reason: REGISTRATION_IDENTITY_REASON.PASSWORD_MISMATCH,
    };
  }

  return {
    ok: true,
    action: REGISTRATION_IDENTITY_ACTION.REUSE,
    reason: "password_verified_reuse",
  };
}

/**
 * Safe field errors for registration forms (no cross-account PII).
 * @param {string} reason
 * @returns {Record<string, string>}
 */
function registrationIdentityFieldErrors(reason) {
  const code = String(reason || "");
  if (code === REGISTRATION_IDENTITY_REASON.EMAIL_PHONE_SPLIT) {
    return {
      contactEmail: "Email and phone belong to different accounts.",
      contactPhone: "Email and phone belong to different accounts.",
    };
  }
  if (code === REGISTRATION_IDENTITY_REASON.PASSWORD_MISMATCH) {
    return { password: "That password does not match the existing account." };
  }
  if (code === REGISTRATION_IDENTITY_REASON.ACK_REQUIRED) {
    return {
      password:
        "This phone or email is already registered. Sign in with your existing password to add another clinic.",
    };
  }
  if (
    code === REGISTRATION_IDENTITY_REASON.PASSWORD_REQUIRED ||
    code === REGISTRATION_IDENTITY_REASON.PHONE_AMBIGUOUS
  ) {
    return {
      password: "An account already exists for this contact. Sign in with your existing password.",
    };
  }
  return {};
}

module.exports = {
  REGISTRATION_IDENTITY_ACTION,
  REGISTRATION_IDENTITY_REASON,
  matchRegistrationContactPrincipals,
  authorizeExistingPrincipalReuse,
  registrationIdentityFieldErrors,
};
