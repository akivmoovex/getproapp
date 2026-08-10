"use strict";

/**
 * ActiveClinic staff invitation orchestration (AC-V6-09).
 * Coordinates identity resolve/create, staff profile, product link,
 * facility/role assignments, and hashed activation tokens.
 */

const crypto = require("crypto");
const tokenRepo = require("../../platform/repositories/platformIdentityActionTokenRepository");
const invitationRepo = require("../repositories/staffInvitationRepository");
const { hashSessionToken } = require("../../platform/session/sessionToken");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const {
  createStaffMember,
  getStaffMemberByIdAndOrganization,
  linkStaffMemberToIdentity,
  RESULT: STAFF_RESULT,
} = require("./activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("./activeClinicStaffFacilityService");
const {
  assignStaffRole,
} = require("./activeClinicAuthorizationService");
const {
  canGrantRole,
  RESULT: ACCESS_RESULT,
} = require("./activeClinicAccessManagementService");
const {
  resolveOrCreateInvitationIdentity,
  RESULT: MATCH_RESULT,
} = require("./resolveActiveClinicInvitationIdentity");
const {
  buildActivationUrl,
  buildInvitationShareViewModel,
  DELIVERY,
} = require("./activeClinicShareLinks");
const {
  getHealthcareOrganizationByOrganizationId,
} = require("./healthcareOrganizationService");

const PURPOSE_ACTIVATION = "activeclinic_staff_activation";
const PRODUCT_KEY = "activeclinic";
const TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  STAFF_NOT_FOUND: "staff_not_found",
  ALREADY_ACTIVE: "staff_already_active",
  ALREADY_ACCEPTED: "invitation_already_accepted",
  NOT_PENDING: "invitation_not_pending",
  NOT_FOUND: "invitation_not_found",
  AMBIGUOUS_IDENTITY: "ambiguous_identity_match",
  IDENTITY_DISABLED: "identity_disabled",
  IDENTITY_CONFLICT: "identity_match_conflict",
  LINK_CONFLICT: "identity_link_conflict",
  PRODUCT_NOT_ENABLED: "activeclinic_product_not_enabled",
  FACILITY_ASSIGNMENT_FAILED: "facility_assignment_failed",
  ROLE_ASSIGNMENT_FAILED: "role_assignment_failed",
  GRANT_DENIED: "grant_denied",
  FORBIDDEN: "forbidden",
});

function generateRawToken() {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashSessionToken(rawToken) };
}

async function withClient(db, fn) {
  if (db && typeof db.query === "function" && typeof db.release === "function") {
    return fn(db);
  }
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(db);
}

function auditMeta(extra) {
  return { actor_kind: "system", ...(extra || {}) };
}

/**
 * Issue a new activation token; invalidates prior active activation tokens
 * for the same identity+staff.
 */
async function issueActivationToken(client, input) {
  await tokenRepo.revokeActiveTokens(client, {
    platformIdentityId: input.platformIdentityId,
    purpose: PURPOSE_ACTIVATION,
    staffMemberId: input.staffMemberId,
    deploymentCode: input.deploymentCode,
  });

  const { rawToken, tokenHash } = generateRawToken();
  const expiresAt = new Date(Date.now() + TTL_MS);
  const token = await tokenRepo.insertActionToken(client, {
    platformIdentityId: input.platformIdentityId,
    purpose: PURPOSE_ACTIVATION,
    tokenHash,
    expiresAt,
    createdByPlatformIdentityId: input.createdByPlatformIdentityId || null,
    deploymentCode: input.deploymentCode,
    productKey: PRODUCT_KEY,
    organizationId: input.organizationId,
    staffMemberId: input.staffMemberId,
    requestIpHash: input.requestIpHash || null,
    metadataJson: {
      invitation_id: input.invitationId || null,
    },
  });

  return { rawToken, token, expiresAt };
}

function buildShareBundle(input) {
  const activationUrl = buildActivationUrl({
    rawToken: input.rawToken,
    env: input.env,
    deploymentCode: input.deploymentCode,
    publicOrigin: input.publicOrigin,
  });
  return {
    activationUrl,
    rawToken: input.rawToken,
    expiresAt: input.expiresAt,
    share: buildInvitationShareViewModel({
      phoneNormalized: input.phoneNormalized,
      emailNormalized: input.emailNormalized,
      organizationName: input.organizationName,
      staffDisplayName: input.staffDisplayName,
      activationUrl,
    }),
  };
}

/**
 * Full invite orchestration.
 *
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function inviteActiveClinicStaff(db, input) {
  const src = input && typeof input === "object" ? input : {};
  const deploymentCode = src.deploymentCode || CODE_ACTIVECLINIC_ORG_V6;
  const organizationId = String(src.organizationId || "").trim();
  const healthcareOrganizationId = String(
    src.healthcareOrganizationId || ""
  ).trim();
  if (!organizationId || !healthcareOrganizationId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const staffCreate = await createStaffMember(client, {
        organizationId,
        healthcareOrganizationId,
        firstName: src.firstName,
        lastName: src.lastName,
        preferredName: src.preferredName,
        displayName: src.displayName,
        phone: src.phone,
        email: src.email,
        employmentType: src.employmentType,
        jobTitle: src.jobTitle,
        staffNumber: src.staffNumber,
        status: "invited",
        startDate: src.startDate,
        endDate: src.endDate,
        platformIdentityId: null,
        deploymentCode,
      });
      if (!staffCreate.ok) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          code:
            staffCreate.code === STAFF_RESULT.PRODUCT_NOT_ENABLED
              ? RESULT.PRODUCT_NOT_ENABLED
              : staffCreate.code,
        };
      }

      const staff = staffCreate.staffMember;
      const identityMatch = await resolveOrCreateInvitationIdentity(client, {
        platformIdentityId: src.platformIdentityId || null,
        phoneNormalized: staff.phoneNormalized,
        emailNormalized: staff.emailNormalized,
        primaryPhone: staff.phoneDisplay,
        primaryEmail: staff.emailDisplay,
        organizationId,
        deploymentCode,
        actorPlatformIdentityId: src.actorPlatformIdentityId || null,
      });
      if (!identityMatch.ok) {
        await client.query("ROLLBACK");
        if (identityMatch.code === MATCH_RESULT.AMBIGUOUS_MATCH) {
          return { ok: false, code: RESULT.AMBIGUOUS_IDENTITY };
        }
        if (identityMatch.code === MATCH_RESULT.IDENTITY_DISABLED) {
          return { ok: false, code: RESULT.IDENTITY_DISABLED };
        }
        if (identityMatch.code === MATCH_RESULT.CONFLICT) {
          return { ok: false, code: RESULT.IDENTITY_CONFLICT };
        }
        return { ok: false, code: RESULT.INVALID_INPUT };
      }

      const linked = await linkStaffMemberToIdentity(client, {
        id: staff.id,
        organizationId,
        platformIdentityId: identityMatch.identity.id,
        deploymentCode,
      });
      if (!linked.ok) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          code:
            linked.code === STAFF_RESULT.LINK_CONFLICT ||
            linked.code === STAFF_RESULT.DUPLICATE_IDENTITY
              ? RESULT.LINK_CONFLICT
              : linked.code,
        };
      }

      const facilityIds = Array.isArray(src.facilityIds) ? src.facilityIds : [];
      for (const facilityId of facilityIds) {
        const assigned = await assignStaffToFacility(client, {
          organizationId,
          staffMemberId: linked.staffMember.id,
          facilityId,
          isPrimary: facilityIds[0] === facilityId,
          deploymentCode,
        });
        if (!assigned.ok) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            code: RESULT.FACILITY_ASSIGNMENT_FAILED,
            detail: assigned.code,
          };
        }
      }

      const roleAssignments = Array.isArray(src.roleAssignments)
        ? src.roleAssignments
        : [];
      for (const role of roleAssignments) {
        if (src.auth) {
          const grant = await canGrantRole(client, {
            auth: src.auth,
            roleKey: role.roleKey,
            scopeType: role.scopeType,
            facilityId: role.facilityId || null,
            targetStaffMemberId: linked.staffMember.id,
          });
          if (!grant.ok) {
            await client.query("ROLLBACK");
            return {
              ok: false,
              code: RESULT.GRANT_DENIED,
              detail: grant.code || ACCESS_RESULT.GRANT_DENIED,
            };
          }
        }
        const assigned = await assignStaffRole(client, {
          organizationId,
          staffMemberId: linked.staffMember.id,
          roleKey: role.roleKey,
          scopeType: role.scopeType,
          facilityId: role.facilityId || null,
          expiresAt: role.expiresAt || null,
          assignedByPlatformIdentityId: src.actorPlatformIdentityId || null,
          deploymentCode,
        });
        if (!assigned.ok) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            code: RESULT.ROLE_ASSIGNMENT_FAILED,
            detail: assigned.code,
          };
        }
      }

      const { rawToken, token, expiresAt } = await issueActivationToken(client, {
        platformIdentityId: identityMatch.identity.id,
        staffMemberId: linked.staffMember.id,
        organizationId,
        deploymentCode,
        createdByPlatformIdentityId: src.actorPlatformIdentityId || null,
      });

      const invitation = await invitationRepo.insertInvitation(client, {
        organizationId,
        healthcareOrganizationId: linked.staffMember.healthcareOrganizationId,
        staffMemberId: linked.staffMember.id,
        platformIdentityId: identityMatch.identity.id,
        status: "pending",
        expiresAt,
        currentTokenId: token.id,
        issuedByPlatformIdentityId: src.actorPlatformIdentityId || null,
        deliveryStatus: DELIVERY.LINK_GENERATED,
        deliveryMethod: "copy_link",
      });

      await client.query(
        `UPDATE platform.identity_action_tokens
            SET metadata_json = COALESCE(metadata_json, '{}'::jsonb) || $2::jsonb
          WHERE id = $1`,
        [token.id, JSON.stringify({ invitation_id: invitation.id })]
      );

      const hco = await getHealthcareOrganizationByOrganizationId(client, {
        organizationId,
      });
      const organizationName =
        (hco.ok &&
          hco.healthcareOrganization &&
          hco.healthcareOrganization.publicName) ||
        "ActiveClinic";

      await recordAuditEventSafe(client, {
        deploymentCode,
        organizationId,
        actorUserId: null,
        actionKey: "activeclinic.staff.invitation_issued",
        entityType: "staff_invitation",
        entityId: invitation.id,
        outcome: "success",
        metadataJson: auditMeta({
          staff_member_id: linked.staffMember.id,
          identity_created: identityMatch.created === true,
          match_method: identityMatch.matchMethod || null,
          facility_count: facilityIds.length,
          role_count: roleAssignments.length,
        }),
      });

      if (identityMatch.created !== true) {
        await recordAuditEventSafe(client, {
          deploymentCode,
          organizationId,
          actorUserId: null,
          actionKey: "activeclinic.identity.linked",
          entityType: "platform_identity",
          entityId: identityMatch.identity.id,
          outcome: "success",
          metadataJson: auditMeta({
            staff_member_id: linked.staffMember.id,
            match_method: identityMatch.matchMethod || null,
          }),
        });
      }

      await client.query("COMMIT");

      const shareBundle = buildShareBundle({
        rawToken,
        expiresAt,
        env: src.env,
        deploymentCode,
        publicOrigin: src.publicOrigin,
        phoneNormalized: linked.staffMember.phoneNormalized,
        emailNormalized: linked.staffMember.emailNormalized,
        organizationName,
        staffDisplayName: linked.staffMember.displayName,
      });

      return {
        ok: true,
        code: RESULT.OK,
        staffMember: linked.staffMember,
        identity: identityMatch.identity,
        identityCreated: identityMatch.created === true,
        invitation,
        tokenId: token.id,
        // Raw token returned only to authorized callers — never logged.
        rawToken: shareBundle.rawToken,
        activationUrl: shareBundle.activationUrl,
        expiresAt,
        share: shareBundle.share,
        deliveryStatus: DELIVERY.LINK_GENERATED,
      };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
  });
}

/**
 * Reissue invitation for an existing invited staff member.
 */
async function reissueStaffInvitation(db, input) {
  const src = input && typeof input === "object" ? input : {};
  const organizationId = String(src.organizationId || "").trim();
  const staffMemberId = String(src.staffMemberId || "").trim();
  const deploymentCode = src.deploymentCode || CODE_ACTIVECLINIC_ORG_V6;
  if (!organizationId || !staffMemberId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const staff = await getStaffMemberByIdAndOrganization(client, {
        id: staffMemberId,
        organizationId,
      });
      if (!staff.ok) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.STAFF_NOT_FOUND };
      }
      if (staff.staffMember.status === "active") {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.ALREADY_ACTIVE };
      }
      if (!staff.staffMember.platformIdentityId) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.INVALID_INPUT };
      }
      if (staff.staffMember.status === "suspended" || staff.staffMember.status === "archived") {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.NOT_PENDING };
      }

      const pending = await invitationRepo.findPendingByStaff(client, {
        staffMemberId,
        organizationId,
      });
      if (pending && pending.status === "accepted") {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.ALREADY_ACCEPTED };
      }

      // Mark prior pending invitation revoked if present, then create fresh pending.
      if (pending) {
        if (pending.currentTokenId) {
          await tokenRepo.markRevoked(client, pending.currentTokenId);
        }
        await invitationRepo.updateInvitation(client, {
          id: pending.id,
          patch: {
            status: "revoked",
            revokedAt: new Date().toISOString(),
          },
        });
        await recordAuditEventSafe(client, {
          deploymentCode,
          organizationId,
          actorUserId: null,
          actionKey: "activeclinic.staff.invitation_reissued",
          entityType: "staff_invitation",
          entityId: pending.id,
          outcome: "success",
          metadataJson: auditMeta({ prior_revoked: true }),
        });
      }

      const { rawToken, token, expiresAt } = await issueActivationToken(client, {
        platformIdentityId: staff.staffMember.platformIdentityId,
        staffMemberId,
        organizationId,
        deploymentCode,
        createdByPlatformIdentityId: src.actorPlatformIdentityId || null,
      });

      const invitation = await invitationRepo.insertInvitation(client, {
        organizationId,
        healthcareOrganizationId: staff.staffMember.healthcareOrganizationId,
        staffMemberId,
        platformIdentityId: staff.staffMember.platformIdentityId,
        status: "pending",
        expiresAt,
        currentTokenId: token.id,
        issuedByPlatformIdentityId: src.actorPlatformIdentityId || null,
        deliveryStatus: DELIVERY.LINK_GENERATED,
        deliveryMethod: "copy_link",
      });

      await client.query(
        `UPDATE platform.identity_action_tokens
            SET metadata_json = COALESCE(metadata_json, '{}'::jsonb) || $2::jsonb
          WHERE id = $1`,
        [token.id, JSON.stringify({ invitation_id: invitation.id })]
      );

      if (!pending) {
        await recordAuditEventSafe(client, {
          deploymentCode,
          organizationId,
          actorUserId: null,
          actionKey: "activeclinic.staff.invitation_reissued",
          entityType: "staff_invitation",
          entityId: invitation.id,
          outcome: "success",
          metadataJson: auditMeta({ prior_revoked: false }),
        });
      }

      const hco = await getHealthcareOrganizationByOrganizationId(client, {
        organizationId,
      });
      const organizationName =
        (hco.ok && hco.healthcareOrganization && hco.healthcareOrganization.publicName) ||
        "ActiveClinic";

      await client.query("COMMIT");

      const shareBundle = buildShareBundle({
        rawToken,
        expiresAt,
        env: src.env,
        deploymentCode,
        publicOrigin: src.publicOrigin,
        phoneNormalized: staff.staffMember.phoneNormalized,
        emailNormalized: staff.staffMember.emailNormalized,
        organizationName,
        staffDisplayName: staff.staffMember.displayName,
      });

      return {
        ok: true,
        code: RESULT.OK,
        staffMember: staff.staffMember,
        invitation,
        tokenId: token.id,
        rawToken: shareBundle.rawToken,
        activationUrl: shareBundle.activationUrl,
        expiresAt,
        share: shareBundle.share,
        deliveryStatus: DELIVERY.LINK_GENERATED,
      };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
  });
}

async function revokeStaffInvitation(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const staffMemberId = String((input && input.staffMemberId) || "").trim();
  const invitationId = input && input.invitationId
    ? String(input.invitationId).trim()
    : null;
  const deploymentCode =
    (input && input.deploymentCode) || CODE_ACTIVECLINIC_ORG_V6;

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      let invitation = null;
      if (invitationId) {
        invitation = await invitationRepo.findByIdAndOrganization(client, {
          id: invitationId,
          organizationId,
        });
      } else {
        invitation = await invitationRepo.findPendingByStaff(client, {
          staffMemberId,
          organizationId,
        });
      }
      if (!invitation) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.NOT_FOUND };
      }
      if (invitation.status !== "pending") {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.NOT_PENDING, invitation };
      }
      if (invitation.currentTokenId) {
        await tokenRepo.markRevoked(client, invitation.currentTokenId);
      }
      await tokenRepo.revokeActiveTokens(client, {
        platformIdentityId: invitation.platformIdentityId,
        purpose: PURPOSE_ACTIVATION,
        staffMemberId: invitation.staffMemberId,
        deploymentCode,
      });
      const updated = await invitationRepo.updateInvitation(client, {
        id: invitation.id,
        patch: {
          status: "revoked",
          revokedAt: new Date().toISOString(),
        },
      });
      await recordAuditEventSafe(client, {
        deploymentCode,
        organizationId,
        actorUserId: null,
        actionKey: "activeclinic.staff.invitation_revoked",
        entityType: "staff_invitation",
        entityId: invitation.id,
        outcome: "success",
        metadataJson: auditMeta({}),
      });
      await client.query("COMMIT");
      return { ok: true, code: RESULT.OK, invitation: updated };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
  });
}

async function getInvitationStatus(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const staffMemberId = String((input && input.staffMemberId) || "").trim();
  if (!organizationId || !staffMemberId) {
    return { ok: false, code: RESULT.INVALID_INPUT, invitations: [] };
  }
  const invitations = await invitationRepo.listByStaff(db, {
    staffMemberId,
    organizationId,
  });
  const now = Date.now();
  const normalized = invitations.map((inv) => {
    let status = inv.status;
    if (
      status === "pending" &&
      inv.expiresAt &&
      new Date(inv.expiresAt).getTime() <= now
    ) {
      status = "expired";
    }
    return { ...inv, effectiveStatus: status };
  });
  return {
    ok: true,
    code: RESULT.OK,
    invitations: normalized,
    pending: normalized.find((i) => i.effectiveStatus === "pending") || null,
  };
}

async function listPendingInvitations(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId) {
    return { ok: false, code: RESULT.INVALID_INPUT, invitations: [] };
  }
  const invitations = await invitationRepo.listByOrganization(db, {
    organizationId,
    status: "pending",
  });
  const now = Date.now();
  return {
    ok: true,
    code: RESULT.OK,
    invitations: invitations.filter(
      (i) => !i.expiresAt || new Date(i.expiresAt).getTime() > now
    ),
  };
}

/**
 * Regenerate activation link for authorized admin (reissue under the hood
 * when pending exists; otherwise fails).
 */
async function regenerateActivationLink(db, input) {
  return reissueStaffInvitation(db, input);
}

module.exports = {
  RESULT,
  PURPOSE_ACTIVATION,
  TTL_MS,
  PRODUCT_KEY,
  inviteActiveClinicStaff,
  reissueStaffInvitation,
  revokeStaffInvitation,
  getInvitationStatus,
  listPendingInvitations,
  regenerateActivationLink,
  issueActivationToken,
  buildShareBundle,
  generateRawToken,
};
