"use strict";

/**
 * Deterministic, safe identity matching for ActiveClinic staff invitations.
 *
 * Order:
 * 1. Explicit platform_identity_id (authorized selector)
 * 2. Unique verified normalized phone
 * 3. Unique verified normalized email
 * 4. No match → create
 *
 * Never auto-link on name, unverified contact, or partial match.
 */

const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const {
  createPlatformIdentity,
  resolvePlatformIdentity,
  mapIdentity,
  RESULT: IDENTITY_RESULT,
} = require("../../platform/services/platformIdentityService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");

const RESULT = Object.freeze({
  OK: "ok",
  CREATED: "created",
  LINKED_EXISTING: "linked_existing",
  INVALID_INPUT: "invalid_input",
  IDENTITY_DISABLED: "identity_disabled",
  AMBIGUOUS_MATCH: "ambiguous_identity_match",
  CONFLICT: "identity_match_conflict",
});

/**
 * @param {{ query: Function }} db
 * @param {{
 *   platformIdentityId?: string|null,
 *   phoneNormalized?: string|null,
 *   emailNormalized?: string|null,
 *   primaryPhone?: string|null,
 *   primaryEmail?: string|null,
 *   organizationId?: string|null,
 *   deploymentCode?: string|null,
 *   actorPlatformIdentityId?: string|null,
 * }} input
 */
async function resolveOrCreateInvitationIdentity(db, input) {
  const src = input && typeof input === "object" ? input : {};
  const deploymentCode = src.deploymentCode || CODE_ACTIVECLINIC_ORG_V6;

  if (src.platformIdentityId) {
    const resolved = await resolvePlatformIdentity(db, {
      identityId: src.platformIdentityId,
      requireActive: true,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        code:
          resolved.code === IDENTITY_RESULT.DISABLED
            ? RESULT.IDENTITY_DISABLED
            : RESULT.INVALID_INPUT,
        identity: resolved.identity || null,
        created: false,
      };
    }
    return {
      ok: true,
      code: RESULT.LINKED_EXISTING,
      identity: resolved.identity,
      created: false,
      matchMethod: "explicit_identity_id",
    };
  }

  const phoneNormalized = src.phoneNormalized
    ? String(src.phoneNormalized).trim()
    : null;
  const emailNormalized = src.emailNormalized
    ? String(src.emailNormalized).trim().toLowerCase()
    : null;

  if (!phoneNormalized && !emailNormalized) {
    return { ok: false, code: RESULT.INVALID_INPUT, identity: null, created: false };
  }

  if (phoneNormalized) {
    const phoneMatches = await identityRepo.findIdentityByVerifiedContact(db, {
      phoneNormalized,
    });
    if (phoneMatches.length > 1) {
      await recordAuditEventSafe(db, {
        deploymentCode,
        organizationId: src.organizationId || null,
        actorUserId: null,
        actionKey: "activeclinic.identity.match_ambiguous",
        entityType: "platform_identity",
        entityId: null,
        outcome: "denied",
        metadataJson: {
          match_channel: "verified_phone",
          match_count: phoneMatches.length,
          actor_kind: "system",
        },
      });
      return {
        ok: false,
        code: RESULT.AMBIGUOUS_MATCH,
        identity: null,
        created: false,
        matchChannel: "verified_phone",
      };
    }
    if (phoneMatches.length === 1) {
      const identity = mapIdentity(phoneMatches[0]);
      if (identity.status !== "active" || identity.lockedAt || identity.suspendedAt) {
        return {
          ok: false,
          code: RESULT.IDENTITY_DISABLED,
          identity,
          created: false,
        };
      }
      return {
        ok: true,
        code: RESULT.LINKED_EXISTING,
        identity,
        created: false,
        matchMethod: "verified_phone",
      };
    }
  }

  if (emailNormalized) {
    const emailMatches = await identityRepo.findIdentityByVerifiedContact(db, {
      emailNormalized,
    });
    if (emailMatches.length > 1) {
      await recordAuditEventSafe(db, {
        deploymentCode,
        organizationId: src.organizationId || null,
        actorUserId: null,
        actionKey: "activeclinic.identity.match_ambiguous",
        entityType: "platform_identity",
        entityId: null,
        outcome: "denied",
        metadataJson: {
          match_channel: "verified_email",
          match_count: emailMatches.length,
          actor_kind: "system",
        },
      });
      return {
        ok: false,
        code: RESULT.AMBIGUOUS_MATCH,
        identity: null,
        created: false,
        matchChannel: "verified_email",
      };
    }
    if (emailMatches.length === 1) {
      const identity = mapIdentity(emailMatches[0]);
      if (identity.status !== "active" || identity.lockedAt || identity.suspendedAt) {
        return {
          ok: false,
          code: RESULT.IDENTITY_DISABLED,
          identity,
          created: false,
        };
      }
      return {
        ok: true,
        code: RESULT.LINKED_EXISTING,
        identity,
        created: false,
        matchMethod: "verified_email",
      };
    }
  }

  // Create without password. Contacts are recorded but not auto-verified so
  // invitation matching remains conservative for subsequent invites.
  const created = await createPlatformIdentity(db, {
    status: "active",
    primaryPhone: src.primaryPhone || phoneNormalized,
    phoneNormalized,
    primaryEmail: src.primaryEmail || emailNormalized,
    emailNormalized,
    passwordHash: null,
    mustChangePassword: false,
    requireContact: true,
  });
  if (!created.ok) {
    return {
      ok: false,
      code:
        created.code === IDENTITY_RESULT.DUPLICATE_VERIFIED_PHONE ||
        created.code === IDENTITY_RESULT.DUPLICATE_VERIFIED_EMAIL
          ? RESULT.CONFLICT
          : RESULT.INVALID_INPUT,
      identity: null,
      created: false,
    };
  }

  await recordAuditEventSafe(db, {
    deploymentCode,
    organizationId: src.organizationId || null,
    actorUserId: null,
    actionKey: "activeclinic.identity.created",
    entityType: "platform_identity",
    entityId: created.identity.id,
    outcome: "success",
    metadataJson: {
      has_phone: Boolean(phoneNormalized),
      has_email: Boolean(emailNormalized),
      actor_kind: "system",
    },
  });

  return {
    ok: true,
    code: RESULT.CREATED,
    identity: created.identity,
    created: true,
    matchMethod: "created",
  };
}

module.exports = {
  RESULT,
  resolveOrCreateInvitationIdentity,
};
