"use strict";

/**
 * Deterministic administrator identity resolution for BlessBoard church registration.
 *
 * Rules (self-service + invitation):
 * - Prefer reuse of a compatible existing blessboard.users row (never duplicate).
 * - Never overwrite an existing password hash.
 * - SAME_CHURCH → already_provisioned (idempotent).
 * - OTHER_CHURCH / ORPHAN → reuse when invitation mode or password verifies.
 * - Email and phone resolving to different users → identity_conflict.
 */

const authRepo = require("../repositories/blessBoardAuthRepository");
const {
  IDENTITY_KIND,
  classifyBlessBoardRegistrationIdentity,
  isSuspendedUser,
} = require("./classifyBlessBoardRegistrationIdentity");
const { normalizeEmail } = require("./createBlessBoardUser");
const {
  REGISTRATION_IDENTITY_ACTION,
  matchRegistrationContactPrincipals,
  authorizeExistingPrincipalReuse,
} = require("../../platform/registration/resolveRegistrationContactIdentity");

const ACTION = Object.freeze({
  CREATE: REGISTRATION_IDENTITY_ACTION.CREATE,
  REUSE: REGISTRATION_IDENTITY_ACTION.REUSE,
  ALREADY_PROVISIONED: "already_provisioned",
  REJECT_EXISTING_ACCOUNT: REGISTRATION_IDENTITY_ACTION.REJECT_EXISTING_ACCOUNT,
  REJECT_IDENTITY_CONFLICT: REGISTRATION_IDENTITY_ACTION.REJECT_IDENTITY_CONFLICT,
  REJECT_SUSPENDED: "reject_suspended",
});

/**
 * @param {unknown} err
 */
function extractPgDiagnostics(err) {
  if (!err || typeof err !== "object") {
    return {
      underlyingErrorClass: null,
      postgresCode: null,
      constraint: null,
      table: null,
      schema: null,
    };
  }
  const pgCode =
    err.code != null && /^[0-9A-Z]{5}$/.test(String(err.code)) ? String(err.code) : null;
  return {
    underlyingErrorClass: err.name != null ? String(err.name).slice(0, 80) : null,
    postgresCode: pgCode,
    constraint: err.constraint != null ? String(err.constraint).slice(0, 120) : null,
    table: err.table != null ? String(err.table).slice(0, 120) : null,
    schema: err.schema != null ? String(err.schema).slice(0, 64) : null,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string|null|undefined} phoneNormalized
 */
async function findUsersByPhone(client, phoneNormalized) {
  const phone = phoneNormalized != null ? String(phoneNormalized).trim() : "";
  if (!phone) return [];
  const r = await client.query(
    `SELECT id, email_normalized, email_display, password_hash, status, display_name,
            phone_normalized, phone_display, created_at
       FROM blessboard.users
      WHERE phone_normalized = $1
      ORDER BY created_at ASC
      LIMIT 3`,
    [phone]
  );
  return r.rows || [];
}

/**
 * @param {object|null} emailUser
 * @param {object[]} phoneUsers
 */
function resolveMatchedUser(emailUser, phoneUsers) {
  const matched = matchRegistrationContactPrincipals(emailUser, phoneUsers);
  if (!matched.ok) {
    return {
      ok: false,
      action: matched.action,
      reason:
        matched.reason === "phone_matches_multiple_identities"
          ? "phone_matches_multiple_users"
          : matched.reason,
      emailMatched: matched.emailMatched,
      phoneMatched: matched.phoneMatched,
      user: null,
      diagnostics: matched.diagnostics,
    };
  }
  if (!matched.principal) {
    return {
      ok: true,
      user: null,
      emailMatched: false,
      phoneMatched: false,
      matchOn: null,
    };
  }
  return {
    ok: true,
    user: matched.principal,
    emailMatched: matched.emailMatched,
    phoneMatched: matched.phoneMatched,
    matchOn: matched.matchOn,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   email?: string|null,
 *   phoneNormalized?: string|null,
 *   churchName?: string|null,
 *   country?: string|null,
 *   organizationKey?: string|null,
 *   applicationOrganizationId?: string|null,
 *   administratorPassword?: string|null,
 *   administratorViaInvitation?: boolean,
 * }} input
 */
async function resolveBlessBoardRegistrationAdministrator(client, input = {}) {
  const emailNormalized = normalizeEmail(input.email);
  const phoneNormalized =
    input.phoneNormalized != null && String(input.phoneNormalized).trim()
      ? String(input.phoneNormalized).trim()
      : null;
  const administratorViaInvitation = Boolean(input.administratorViaInvitation);
  const password =
    input.administratorPassword != null ? String(input.administratorPassword) : "";

  const emailUser = emailNormalized
    ? await authRepo.findUserByEmail(client, emailNormalized)
    : null;
  const phoneUsers = await findUsersByPhone(client, phoneNormalized);
  const matched = resolveMatchedUser(emailUser, phoneUsers);
  if (!matched.ok) {
    return matched;
  }

  const user = matched.user;
  if (!user || !user.id) {
    return {
      ok: true,
      action: ACTION.CREATE,
      reason: "fresh_identity",
      user: null,
      userId: null,
      emailMatched: false,
      phoneMatched: false,
      matchOn: null,
      identityKind: IDENTITY_KIND.FRESH,
      diagnostics: {
        identityResolution: "create",
        emailMatched: false,
        phoneMatched: false,
      },
    };
  }

  if (isSuspendedUser(user)) {
    return {
      ok: false,
      action: ACTION.REJECT_SUSPENDED,
      reason: "suspended_identity",
      user,
      userId: String(user.id),
      emailMatched: matched.emailMatched,
      phoneMatched: matched.phoneMatched,
      matchOn: matched.matchOn,
      identityKind: IDENTITY_KIND.SUSPENDED,
      diagnostics: {
        identityResolution: "suspended",
        emailMatched: matched.emailMatched,
        phoneMatched: matched.phoneMatched,
        matchOn: matched.matchOn,
      },
    };
  }

  if (administratorViaInvitation) {
    const status = String(user.status || "").trim().toLowerCase();
    if (status !== "active" && status !== "invited") {
      return {
        ok: false,
        action: ACTION.REJECT_IDENTITY_CONFLICT,
        reason: "invitation_incompatible_status",
        user,
        userId: String(user.id),
        emailMatched: matched.emailMatched,
        phoneMatched: matched.phoneMatched,
        matchOn: matched.matchOn,
        diagnostics: {
          identityResolution: "invitation_status_conflict",
          emailMatched: matched.emailMatched,
          phoneMatched: matched.phoneMatched,
          userStatus: status,
        },
      };
    }
    return {
      ok: true,
      action: ACTION.REUSE,
      reason: "invitation_reuse",
      user,
      userId: String(user.id),
      emailMatched: matched.emailMatched,
      phoneMatched: matched.phoneMatched,
      matchOn: matched.matchOn,
      identityKind: null,
      diagnostics: {
        identityResolution: "reuse_invitation",
        emailMatched: matched.emailMatched,
        phoneMatched: matched.phoneMatched,
        matchOn: matched.matchOn,
      },
    };
  }

  const identity = await classifyBlessBoardRegistrationIdentity(client, {
    email: emailNormalized || user.email_normalized,
    churchName: input.churchName,
    country: input.country,
    organizationKey: input.organizationKey,
    applicationOrganizationId: input.applicationOrganizationId,
  });

  if (identity.kind === IDENTITY_KIND.SAME_CHURCH) {
    return {
      ok: true,
      action: ACTION.ALREADY_PROVISIONED,
      reason: "same_church_identity",
      user,
      userId: String(user.id),
      organizationId: identity.organizationId || null,
      emailMatched: matched.emailMatched,
      phoneMatched: matched.phoneMatched,
      matchOn: matched.matchOn,
      identityKind: IDENTITY_KIND.SAME_CHURCH,
      diagnostics: {
        identityResolution: "already_provisioned",
        emailMatched: matched.emailMatched,
        phoneMatched: matched.phoneMatched,
        matchOn: matched.matchOn,
        identityKind: IDENTITY_KIND.SAME_CHURCH,
      },
    };
  }

  if (
    identity.kind === IDENTITY_KIND.ORPHAN_USER ||
    identity.kind === IDENTITY_KIND.OTHER_CHURCH ||
    identity.kind === IDENTITY_KIND.FRESH
  ) {
    // Phone-only match still reuses when the password verifies — never create a duplicate login.
    const authorized = await authorizeExistingPrincipalReuse({
      passwordHash: user.password_hash,
      password,
      // BlessBoard public copy uses the generic existing-account message (not AC ack copy).
      multiTenant: false,
    });
    if (!authorized.ok) {
      return {
        ok: false,
        action: authorized.action,
        reason: authorized.reason,
        user,
        userId: String(user.id),
        emailMatched: matched.emailMatched,
        phoneMatched: matched.phoneMatched,
        matchOn: matched.matchOn,
        identityKind: identity.kind,
        diagnostics: {
          identityResolution:
            authorized.reason === "existing_account_password_mismatch"
              ? "existing_account_password_mismatch"
              : "existing_account",
          emailMatched: matched.emailMatched,
          phoneMatched: matched.phoneMatched,
          matchOn: matched.matchOn,
          identityKind: identity.kind,
          passwordPresent: Boolean(password),
          hashPresent: Boolean(user.password_hash),
        },
      };
    }
    return {
      ok: true,
      action: ACTION.REUSE,
      reason:
        identity.kind === IDENTITY_KIND.OTHER_CHURCH
          ? "multi_org_reuse"
          : identity.kind === IDENTITY_KIND.ORPHAN_USER
            ? "orphan_reuse"
            : "phone_matched_reuse",
      user,
      userId: String(user.id),
      emailMatched: matched.emailMatched,
      phoneMatched: matched.phoneMatched,
      matchOn: matched.matchOn,
      identityKind: identity.kind,
      diagnostics: {
        identityResolution: "reuse",
        emailMatched: matched.emailMatched,
        phoneMatched: matched.phoneMatched,
        matchOn: matched.matchOn,
        identityKind: identity.kind,
      },
    };
  }

  return {
    ok: false,
    action: ACTION.REJECT_IDENTITY_CONFLICT,
    reason: "unclassified_identity",
    user,
    userId: String(user.id),
    emailMatched: matched.emailMatched,
    phoneMatched: matched.phoneMatched,
    matchOn: matched.matchOn,
    identityKind: identity.kind,
    diagnostics: {
      identityResolution: "unclassified",
      emailMatched: matched.emailMatched,
      phoneMatched: matched.phoneMatched,
      identityKind: identity.kind,
    },
  };
}

module.exports = {
  ACTION,
  resolveBlessBoardRegistrationAdministrator,
  extractPgDiagnostics,
  findUsersByPhone,
};
