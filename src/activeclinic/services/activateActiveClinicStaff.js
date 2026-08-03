"use strict";

/**
 * ActiveClinic staff activation via one-time hashed token (AC-V6-09).
 * Prefer redirect to /login after success (no session fixation from token).
 */

const tokenRepo = require("../../platform/repositories/platformIdentityActionTokenRepository");
const invitationRepo = require("../repositories/staffInvitationRepository");
const staffRepo = require("../repositories/staffMemberRepository");
const { hashSessionToken } = require("../../platform/session/sessionToken");
const {
  setPlatformIdentityPassword,
  validatePasswordPolicy,
  RESULT: CRED_RESULT,
} = require("../../platform/services/platformIdentityCredentialService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { mapStaff } = require("./activeClinicStaffService");
const {
  listStaffRoleAssignments,
} = require("./activeClinicAuthorizationService");
const {
  getHealthcareOrganizationByOrganizationId,
} = require("./healthcareOrganizationService");
const PURPOSE_ACTIVATION = "activeclinic_staff_activation";

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_TOKEN: "invalid_token",
  EXPIRED: "expired",
  REVOKED: "revoked",
  CONSUMED: "consumed",
  WEAK_PASSWORD: "weak_password",
  MISMATCH: "mismatch",
  FORBIDDEN: "forbidden",
  STAFF_NOT_FOUND: "staff_not_found",
});

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

function classifyToken(token, expectedDeploymentCode) {
  if (!token) return { ok: false, code: RESULT.INVALID_TOKEN };
  if (token.purpose !== PURPOSE_ACTIVATION) {
    return { ok: false, code: RESULT.INVALID_TOKEN };
  }
  if (token.productKey !== "activeclinic") {
    return { ok: false, code: RESULT.INVALID_TOKEN };
  }
  if (
    expectedDeploymentCode &&
    token.deploymentCode !== expectedDeploymentCode
  ) {
    return { ok: false, code: RESULT.FORBIDDEN };
  }
  if (token.revokedAt) return { ok: false, code: RESULT.REVOKED, token };
  if (token.consumedAt) return { ok: false, code: RESULT.CONSUMED, token };
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
    return { ok: false, code: RESULT.EXPIRED, token };
  }
  return { ok: true, code: RESULT.OK, token };
}

/**
 * Safe public preview for activation page (no sensitive internals).
 */
async function previewActivationToken(db, input) {
  const rawToken = String((input && input.rawToken) || "").trim();
  const deploymentCode =
    (input && input.deploymentCode) || CODE_ACTIVECLINIC_ORG_V6;
  if (!rawToken) {
    return { ok: false, code: RESULT.INVALID_TOKEN, preview: null };
  }
  const token = await tokenRepo.findByTokenHash(db, hashSessionToken(rawToken));
  const classified = classifyToken(token, deploymentCode);
  if (!classified.ok) {
    return { ok: false, code: classified.code, preview: null };
  }

  const invitation = await invitationRepo.findByCurrentTokenId(db, token.id);
  if (!invitation || invitation.status !== "pending") {
    const statusCode =
      invitation && invitation.status === "revoked"
        ? RESULT.REVOKED
        : invitation && invitation.status === "accepted"
          ? RESULT.CONSUMED
          : RESULT.INVALID_TOKEN;
    return { ok: false, code: statusCode, preview: null };
  }

  const staffRow = await staffRepo.findByIdAndOrganization(db, {
    id: invitation.staffMemberId,
    organizationId: invitation.organizationId,
  });
  if (!staffRow) {
    return { ok: false, code: RESULT.STAFF_NOT_FOUND, preview: null };
  }

  const hco = await getHealthcareOrganizationByOrganizationId(db, {
    organizationId: invitation.organizationId,
  });

  return {
    ok: true,
    code: RESULT.OK,
    preview: {
      staffDisplayName: staffRow.display_name,
      healthcareOrganizationName:
        (hco.ok &&
          hco.healthcareOrganization &&
          hco.healthcareOrganization.publicName) ||
        "ActiveClinic",
      purpose: "Activate your ActiveClinic staff account",
      expiresAt: token.expiresAt,
    },
  };
}

/**
 * Consume activation token and set password.
 */
async function activateActiveClinicStaff(db, input) {
  const src = input && typeof input === "object" ? input : {};
  const rawToken = String(src.rawToken || "").trim();
  const deploymentCode = src.deploymentCode || CODE_ACTIVECLINIC_ORG_V6;
  const password = src.password;
  const passwordConfirm = src.passwordConfirm;

  if (!rawToken) {
    return { ok: false, code: RESULT.INVALID_TOKEN };
  }
  if (password !== passwordConfirm) {
    return { ok: false, code: RESULT.MISMATCH };
  }
  const policy = validatePasswordPolicy(password);
  if (!policy.ok) {
    return { ok: false, code: RESULT.WEAK_PASSWORD };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const token = await tokenRepo.findByTokenHash(
        client,
        hashSessionToken(rawToken)
      );
      const classified = classifyToken(token, deploymentCode);
      if (!classified.ok) {
        await client.query("ROLLBACK");
        return { ok: false, code: classified.code };
      }

      const invitation = await invitationRepo.findByCurrentTokenId(
        client,
        token.id
      );
      if (!invitation || invitation.status !== "pending") {
        await client.query("ROLLBACK");
        return {
          ok: false,
          code:
            invitation && invitation.status === "revoked"
              ? RESULT.REVOKED
              : RESULT.INVALID_TOKEN,
        };
      }
      if (
        String(invitation.platformIdentityId) !==
        String(token.platformIdentityId)
      ) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.FORBIDDEN };
      }
      if (
        token.staffMemberId &&
        String(token.staffMemberId) !== String(invitation.staffMemberId)
      ) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.FORBIDDEN };
      }

      const consumed = await tokenRepo.markConsumed(client, token.id);
      if (!consumed) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.CONSUMED };
      }

      const pw = await setPlatformIdentityPassword(client, {
        identityId: token.platformIdentityId,
        password: policy.value,
        mustChangePassword: false,
      });
      if (!pw.ok) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          code:
            pw.code === CRED_RESULT.WEAK_PASSWORD
              ? RESULT.WEAK_PASSWORD
              : RESULT.INVALID_INPUT,
        };
      }

      const staffRow = await staffRepo.findByIdAndOrganization(client, {
        id: invitation.staffMemberId,
        organizationId: invitation.organizationId,
      });
      if (!staffRow) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.STAFF_NOT_FOUND };
      }

      const roles = await listStaffRoleAssignments(client, {
        staffMemberId: invitation.staffMemberId,
        organizationId: invitation.organizationId,
      });
      const activeRoles = (roles.assignments || []).filter((r) => {
        if (r.status && r.status !== "active") return false;
        if (r.expiresAt && new Date(r.expiresAt).getTime() <= Date.now()) {
          return false;
        }
        return true;
      });

      // Activate staff only when an active role assignment exists.
      let staffStatus = staffRow.status;
      if (staffRow.status === "invited" && activeRoles.length > 0) {
        const updated = await staffRepo.updateStaffMember(client, {
          id: invitation.staffMemberId,
          organizationId: invitation.organizationId,
          patch: { status: "active" },
        });
        staffStatus = updated ? updated.status : "active";
      }

      await invitationRepo.updateInvitation(client, {
        id: invitation.id,
        patch: {
          status: "accepted",
          acceptedAt: new Date().toISOString(),
        },
      });

      await recordAuditEventSafe(client, {
        deploymentCode,
        organizationId: invitation.organizationId,
        actorUserId: null,
        actionKey: "activeclinic.staff.invitation_accepted",
        entityType: "staff_invitation",
        entityId: invitation.id,
        outcome: "success",
        metadataJson: {
          actor_kind: "invitee",
          staff_status: staffStatus,
          roles_active: activeRoles.length,
        },
      });
      await recordAuditEventSafe(client, {
        deploymentCode,
        organizationId: invitation.organizationId,
        actorUserId: null,
        actionKey: "activeclinic.password.activated",
        entityType: "platform_identity",
        entityId: token.platformIdentityId,
        outcome: "success",
        metadataJson: { actor_kind: "invitee" },
      });

      await client.query("COMMIT");

      return {
        ok: true,
        code: RESULT.OK,
        staffMember: mapStaff({
          ...staffRow,
          status: staffStatus,
        }),
        identity: pw.identity,
        redirectTo: "/login?activated=1",
        staffActivated: staffStatus === "active",
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

module.exports = {
  RESULT,
  previewActivationToken,
  activateActiveClinicStaff,
  classifyToken,
};
