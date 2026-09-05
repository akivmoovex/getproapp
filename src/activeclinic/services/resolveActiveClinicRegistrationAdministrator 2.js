"use strict";

/**
 * Deterministic administrator identity resolution for ActiveClinic clinic registration.
 *
 * Uses platform.identities (not blessboard.users). Mirrors BlessBoard correctness:
 * - Prefer reuse of a compatible existing identity (never duplicate).
 * - Never overwrite an existing password hash.
 * - SAME_CLINIC → already_provisioned (idempotent).
 * - OTHER_CLINIC / ORPHAN → reuse when invitation/ack mode or password verifies.
 * - Email and phone resolving to different identities → identity_conflict.
 */

const bcrypt = require("bcryptjs");

const IDENTITY_KIND = Object.freeze({
  FRESH: "fresh",
  ORPHAN: "orphan",
  SAME_CLINIC: "same_clinic",
  OTHER_CLINIC: "other_clinic",
  SUSPENDED: "suspended",
});

const ACTION = Object.freeze({
  CREATE: "create",
  REUSE: "reuse",
  ALREADY_PROVISIONED: "already_provisioned",
  REJECT_EXISTING_ACCOUNT: "reject_existing_account",
  REJECT_IDENTITY_CONFLICT: "reject_identity_conflict",
  REJECT_SUSPENDED: "reject_suspended",
});

function normalizeEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  return value || null;
}

function normalizeClinicName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isSuspendedIdentity(identity) {
  const status = String((identity && identity.status) || "").toLowerCase();
  return ["suspended", "disabled", "blocked", "inactive", "locked"].includes(status);
}

/**
 * @param {{ query: Function }} client
 * @param {string|null} emailNormalized
 */
async function findIdentityByEmail(client, emailNormalized) {
  if (!emailNormalized) return null;
  const r = await client.query(
    `SELECT id, status, email_normalized, phone_normalized, password_hash, created_at
       FROM platform.identities
      WHERE email_normalized = $1
      ORDER BY created_at ASC
      LIMIT 1`,
    [emailNormalized]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string|null} phoneNormalized
 */
async function findIdentitiesByPhone(client, phoneNormalized) {
  const phone = phoneNormalized != null ? String(phoneNormalized).trim() : "";
  if (!phone) return [];
  const r = await client.query(
    `SELECT id, status, email_normalized, phone_normalized, password_hash, created_at
       FROM platform.identities
      WHERE phone_normalized = $1
      ORDER BY created_at ASC
      LIMIT 3`,
    [phone]
  );
  return r.rows || [];
}

/**
 * @param {{ query: Function }} client
 * @param {string} identityId
 */
async function listLiveClinicMemberships(client, identityId) {
  const r = await client.query(
    `SELECT sm.id AS staff_member_id,
            sm.status AS staff_status,
            sm.organization_id,
            o.organization_key,
            o.display_name
       FROM activeclinic.staff_members sm
       JOIN platform.organizations o ON o.id = sm.organization_id
      WHERE sm.platform_identity_id = $1
        AND sm.status <> 'archived'
      ORDER BY o.display_name ASC`,
    [identityId]
  );
  return r.rows || [];
}

/**
 * @param {object|null} emailIdentity
 * @param {object[]} phoneIdentities
 */
function resolveMatchedIdentity(emailIdentity, phoneIdentities) {
  const phoneIdentity = phoneIdentities.length === 1 ? phoneIdentities[0] : null;
  const emailMatched = Boolean(emailIdentity && emailIdentity.id);
  const phoneMatched = Boolean(phoneIdentity && phoneIdentity.id);

  if (phoneIdentities.length > 1) {
    return {
      ok: false,
      action: ACTION.REJECT_IDENTITY_CONFLICT,
      reason: "phone_matches_multiple_identities",
      emailMatched,
      phoneMatched: true,
      identity: null,
      diagnostics: {
        identityResolution: "phone_ambiguous",
        emailMatched,
        phoneMatched: true,
        phoneMatchCount: phoneIdentities.length,
      },
    };
  }

  if (
    emailMatched &&
    phoneMatched &&
    String(emailIdentity.id) !== String(phoneIdentity.id)
  ) {
    return {
      ok: false,
      action: ACTION.REJECT_IDENTITY_CONFLICT,
      reason: "email_and_phone_resolve_to_different_identities",
      emailMatched: true,
      phoneMatched: true,
      identity: null,
      diagnostics: {
        identityResolution: "email_phone_split",
        emailMatched: true,
        phoneMatched: true,
      },
    };
  }

  const identity = emailIdentity || phoneIdentity || null;
  return {
    ok: true,
    identity,
    emailMatched,
    phoneMatched,
    matchOn:
      emailMatched && phoneMatched
        ? "email_and_phone"
        : emailMatched
          ? "email"
          : phoneMatched
            ? "phone"
            : null,
  };
}

/**
 * @param {object} identity
 * @param {object[]} memberships
 * @param {{ clinicName?: string|null, applicationOrganizationId?: string|null }} opts
 */
function classifyIdentity(identity, memberships, opts = {}) {
  if (!identity || !identity.id) return { kind: IDENTITY_KIND.FRESH, organizationId: null };
  if (isSuspendedIdentity(identity)) {
    return { kind: IDENTITY_KIND.SUSPENDED, organizationId: null };
  }
  const applicationOrgId = opts.applicationOrganizationId
    ? String(opts.applicationOrganizationId)
    : null;
  const clinicName = normalizeClinicName(opts.clinicName);
  const same = memberships.find((row) => {
    if (applicationOrgId && String(row.organization_id) === applicationOrgId) return true;
    if (clinicName && normalizeClinicName(row.display_name) === clinicName) return true;
    return false;
  });
  if (same) {
    return { kind: IDENTITY_KIND.SAME_CLINIC, organizationId: String(same.organization_id) };
  }
  if (memberships.length > 0) {
    return {
      kind: IDENTITY_KIND.OTHER_CLINIC,
      organizationId: String(memberships[0].organization_id),
    };
  }
  return { kind: IDENTITY_KIND.ORPHAN, organizationId: null };
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   email?: string|null,
 *   phoneNormalized?: string|null,
 *   clinicName?: string|null,
 *   applicationOrganizationId?: string|null,
 *   administratorPassword?: string|null,
 *   acknowledgeExistingIdentity?: boolean,
 *   actorKind?: string|null,
 * }} input
 */
async function resolveActiveClinicRegistrationAdministrator(client, input = {}) {
  const emailNormalized = normalizeEmail(input.email);
  const phoneNormalized =
    input.phoneNormalized != null && String(input.phoneNormalized).trim()
      ? String(input.phoneNormalized).trim()
      : null;
  const password =
    input.administratorPassword != null ? String(input.administratorPassword) : "";
  const acknowledged =
    input.acknowledgeExistingIdentity === true ||
    input.acknowledgeExistingIdentity === "1" ||
    input.acknowledgeExistingIdentity === "on";
  const actorKind = String(input.actorKind || "");

  const emailIdentity = await findIdentityByEmail(client, emailNormalized);
  const phoneIdentities = await findIdentitiesByPhone(client, phoneNormalized);
  const matched = resolveMatchedIdentity(emailIdentity, phoneIdentities);
  if (!matched.ok) {
    return matched;
  }

  const identity = matched.identity;
  if (!identity || !identity.id) {
    return {
      ok: true,
      action: ACTION.CREATE,
      reason: "fresh_identity",
      identity: null,
      identityId: null,
      emailMatched: false,
      phoneMatched: false,
      matchOn: null,
      identityKind: IDENTITY_KIND.FRESH,
      memberships: [],
      diagnostics: {
        identityResolution: "create",
        emailMatched: false,
        phoneMatched: false,
      },
    };
  }

  const memberships = await listLiveClinicMemberships(client, identity.id);
  const classified = classifyIdentity(identity, memberships, {
    clinicName: input.clinicName,
    applicationOrganizationId: input.applicationOrganizationId,
  });

  if (classified.kind === IDENTITY_KIND.SUSPENDED) {
    return {
      ok: false,
      action: ACTION.REJECT_SUSPENDED,
      reason: "suspended_identity",
      identity,
      identityId: String(identity.id),
      emailMatched: matched.emailMatched,
      phoneMatched: matched.phoneMatched,
      matchOn: matched.matchOn,
      identityKind: IDENTITY_KIND.SUSPENDED,
      memberships,
      diagnostics: {
        identityResolution: "suspended",
        emailMatched: matched.emailMatched,
        phoneMatched: matched.phoneMatched,
      },
    };
  }

  if (classified.kind === IDENTITY_KIND.SAME_CLINIC) {
    return {
      ok: true,
      action: ACTION.ALREADY_PROVISIONED,
      reason: "same_clinic_identity",
      identity,
      identityId: String(identity.id),
      organizationId: classified.organizationId,
      emailMatched: matched.emailMatched,
      phoneMatched: matched.phoneMatched,
      matchOn: matched.matchOn,
      identityKind: IDENTITY_KIND.SAME_CLINIC,
      memberships,
      diagnostics: {
        identityResolution: "already_provisioned",
        emailMatched: matched.emailMatched,
        phoneMatched: matched.phoneMatched,
        identityKind: IDENTITY_KIND.SAME_CLINIC,
      },
    };
  }

  // Platform Admin ack path may reuse without password.
  if (acknowledged || actorKind === "platform_admin") {
    if (acknowledged || classified.kind === IDENTITY_KIND.ORPHAN) {
      return {
        ok: true,
        action: ACTION.REUSE,
        reason:
          classified.kind === IDENTITY_KIND.OTHER_CLINIC
            ? "multi_clinic_ack_reuse"
            : "orphan_ack_reuse",
        identity,
        identityId: String(identity.id),
        emailMatched: matched.emailMatched,
        phoneMatched: matched.phoneMatched,
        matchOn: matched.matchOn,
        identityKind: classified.kind,
        memberships,
        diagnostics: {
          identityResolution: "reuse_acknowledged",
          emailMatched: matched.emailMatched,
          phoneMatched: matched.phoneMatched,
          identityKind: classified.kind,
        },
      };
    }
  }

  if (!identity.password_hash) {
    return {
      ok: false,
      action: ACTION.REJECT_EXISTING_ACCOUNT,
      reason: "existing_account_requires_sign_in",
      identity,
      identityId: String(identity.id),
      emailMatched: matched.emailMatched,
      phoneMatched: matched.phoneMatched,
      matchOn: matched.matchOn,
      identityKind: classified.kind,
      memberships,
      diagnostics: {
        identityResolution: "existing_without_password",
        emailMatched: matched.emailMatched,
        phoneMatched: matched.phoneMatched,
        identityKind: classified.kind,
      },
    };
  }

  if (!password) {
    return {
      ok: false,
      action: ACTION.REJECT_EXISTING_ACCOUNT,
      reason:
        classified.kind === IDENTITY_KIND.OTHER_CLINIC
          ? "existing_identity_acknowledgement_required"
          : "existing_account_requires_sign_in",
      identity,
      identityId: String(identity.id),
      emailMatched: matched.emailMatched,
      phoneMatched: matched.phoneMatched,
      matchOn: matched.matchOn,
      identityKind: classified.kind,
      memberships,
      requiresSecondClinicAcknowledgement: classified.kind === IDENTITY_KIND.OTHER_CLINIC,
      diagnostics: {
        identityResolution: "password_required",
        emailMatched: matched.emailMatched,
        phoneMatched: matched.phoneMatched,
        identityKind: classified.kind,
      },
    };
  }

  const passwordOk = await bcrypt.compare(password, String(identity.password_hash));
  if (!passwordOk) {
    return {
      ok: false,
      action: ACTION.REJECT_EXISTING_ACCOUNT,
      reason: "existing_account_password_mismatch",
      identity,
      identityId: String(identity.id),
      emailMatched: matched.emailMatched,
      phoneMatched: matched.phoneMatched,
      matchOn: matched.matchOn,
      identityKind: classified.kind,
      memberships,
      diagnostics: {
        identityResolution: "password_mismatch",
        emailMatched: matched.emailMatched,
        phoneMatched: matched.phoneMatched,
        identityKind: classified.kind,
      },
    };
  }

  return {
    ok: true,
    action: ACTION.REUSE,
    reason:
      classified.kind === IDENTITY_KIND.OTHER_CLINIC
        ? "multi_clinic_reuse"
        : classified.kind === IDENTITY_KIND.ORPHAN
          ? "orphan_reuse"
          : "phone_matched_reuse",
    identity,
    identityId: String(identity.id),
    emailMatched: matched.emailMatched,
    phoneMatched: matched.phoneMatched,
    matchOn: matched.matchOn,
    identityKind: classified.kind,
    memberships,
    diagnostics: {
      identityResolution: "reuse",
      emailMatched: matched.emailMatched,
      phoneMatched: matched.phoneMatched,
      identityKind: classified.kind,
    },
  };
}

module.exports = {
  IDENTITY_KIND,
  ACTION,
  normalizeClinicName,
  resolveActiveClinicRegistrationAdministrator,
  classifyIdentity,
  resolveMatchedIdentity,
  listLiveClinicMemberships,
};
