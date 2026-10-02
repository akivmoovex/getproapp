"use strict";

/**
 * ActiveClinic staff account administration (AC-V6-09).
 * Credential actions require activeclinic.staff.manage_credentials.
 * Suspension uses staff.archive / staff.update per caller authorization.
 */

const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const staffRepo = require("../repositories/staffMemberRepository");
const accessRepo = require("../repositories/staffAccessRepository");
const {
  revokeSessionsByPlatformIdentity,
} = require("../../platform/session/revokeV5Session");
const {
  mapIdentity,
} = require("../../platform/services/platformIdentityService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const {
  getStaffMemberByIdAndOrganization,
  suspendStaffMember,
  mapStaff,
  RESULT: STAFF_RESULT,
} = require("./activeClinicStaffService");
const {
  assertNotLastOrgAdminRemoval,
  RESULT: ACCESS_RESULT,
} = require("./activeClinicAccessManagementService");
const {
  issueAdminPasswordResetLink,
} = require("./activeClinicPasswordRecoveryService");
const {
  reissueStaffInvitation,
  revokeStaffInvitation,
} = require("./activeClinicStaffInvitationService");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  STAFF_NOT_FOUND: "staff_not_found",
  IDENTITY_MISSING: "identity_missing",
  NOT_ELIGIBLE: "not_eligible",
  LAST_ORG_ADMIN: ACCESS_RESULT.LAST_ORG_ADMIN,
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

async function revokeActiveClinicStaffSessions(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const staffMemberId = String((input && input.staffMemberId) || "").trim();
  const deploymentCode =
    (input && input.deploymentCode) || CODE_ACTIVECLINIC_ORG_V6;
  const staff = await getStaffMemberByIdAndOrganization(db, {
    id: staffMemberId,
    organizationId,
  });
  if (!staff.ok) return { ok: false, code: RESULT.STAFF_NOT_FOUND };
  if (!staff.staffMember.platformIdentityId) {
    return { ok: false, code: RESULT.IDENTITY_MISSING };
  }

  const revoked = await revokeSessionsByPlatformIdentity(db, {
    platformIdentityId: staff.staffMember.platformIdentityId,
    deploymentCode,
  });

  await recordAuditEventSafe(db, {
    deploymentCode,
    organizationId,
    actorUserId: null,
    actionKey: "activeclinic.sessions.revoked",
    entityType: "staff_member",
    entityId: staffMemberId,
    outcome: "success",
    metadataJson: {
      actor_kind: "admin",
      revoked_count: revoked.revokedCount || 0,
      reason: (input && input.reason) || "admin_revoke",
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    revokedCount: revoked.revokedCount || 0,
    staffMember: staff.staffMember,
  };
}

async function requireStaffPasswordChange(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const staffMemberId = String((input && input.staffMemberId) || "").trim();
  const deploymentCode =
    (input && input.deploymentCode) || CODE_ACTIVECLINIC_ORG_V6;
  const staff = await getStaffMemberByIdAndOrganization(db, {
    id: staffMemberId,
    organizationId,
  });
  if (!staff.ok) return { ok: false, code: RESULT.STAFF_NOT_FOUND };
  if (!staff.staffMember.platformIdentityId) {
    return { ok: false, code: RESULT.IDENTITY_MISSING };
  }

  const updated = await identityRepo.setMustChangePassword(db, {
    identityId: staff.staffMember.platformIdentityId,
    mustChangePassword: true,
  });
  if (!updated) return { ok: false, code: RESULT.NOT_ELIGIBLE };

  await recordAuditEventSafe(db, {
    deploymentCode,
    organizationId,
    actorUserId: null,
    actionKey: "activeclinic.password_change.required",
    entityType: "platform_identity",
    entityId: staff.staffMember.platformIdentityId,
    outcome: "success",
    metadataJson: { actor_kind: "admin", staff_member_id: staffMemberId },
  });

  return {
    ok: true,
    code: RESULT.OK,
    identity: mapIdentity(updated),
    staffMember: staff.staffMember,
  };
}

async function unlockStaffTemporaryLock(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const staffMemberId = String((input && input.staffMemberId) || "").trim();
  const deploymentCode =
    (input && input.deploymentCode) || CODE_ACTIVECLINIC_ORG_V6;
  const staff = await getStaffMemberByIdAndOrganization(db, {
    id: staffMemberId,
    organizationId,
  });
  if (!staff.ok) return { ok: false, code: RESULT.STAFF_NOT_FOUND };
  if (!staff.staffMember.platformIdentityId) {
    return { ok: false, code: RESULT.IDENTITY_MISSING };
  }

  const updated = await identityRepo.updateIdentitySignInFailure(db, {
    identityId: staff.staffMember.platformIdentityId,
    failedSignInCount: 0,
    signInLockedUntil: null,
  });

  await recordAuditEventSafe(db, {
    deploymentCode,
    organizationId,
    actorUserId: null,
    actionKey: "activeclinic.account.temporarily_unlocked",
    entityType: "platform_identity",
    entityId: staff.staffMember.platformIdentityId,
    outcome: "success",
    metadataJson: { actor_kind: "admin", staff_member_id: staffMemberId },
  });

  return {
    ok: true,
    code: RESULT.OK,
    identity: mapIdentity(updated),
    staffMember: staff.staffMember,
  };
}

async function suspendStaffAccess(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const staffMemberId = String((input && input.staffMemberId) || "").trim();
  const deploymentCode =
    (input && input.deploymentCode) || CODE_ACTIVECLINIC_ORG_V6;
  const revokeSessions = input && input.revokeSessions !== false;

  const lastAdmin = await assertNotLastOrgAdminRemoval(db, {
    organizationId,
    staffMemberId,
  });
  if (!lastAdmin.ok) {
    return { ok: false, code: lastAdmin.code };
  }

  const suspended = await suspendStaffMember(db, {
    id: staffMemberId,
    organizationId,
    deploymentCode,
  });
  if (!suspended.ok) {
    return {
      ok: false,
      code:
        suspended.code === STAFF_RESULT.NOT_FOUND
          ? RESULT.STAFF_NOT_FOUND
          : suspended.code,
    };
  }

  let revokedCount = 0;
  if (revokeSessions && suspended.staffMember.platformIdentityId) {
    const revoked = await revokeSessionsByPlatformIdentity(db, {
      platformIdentityId: suspended.staffMember.platformIdentityId,
      deploymentCode,
    });
    revokedCount = revoked.revokedCount || 0;
  }

  await recordAuditEventSafe(db, {
    deploymentCode,
    organizationId,
    actorUserId: null,
    actionKey: "activeclinic.staff.suspended",
    entityType: "staff_member",
    entityId: staffMemberId,
    outcome: "success",
    metadataJson: {
      actor_kind: "admin",
      sessions_revoked: revokedCount,
      identity_unchanged: true,
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    staffMember: suspended.staffMember,
    sessionsRevoked: revokedCount,
  };
}

/**
 * Restore staff eligibility only. Does not revive expired roles or archived
 * facility assignments. Does not recreate invitations.
 */
async function restoreStaffAccess(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const staffMemberId = String((input && input.staffMemberId) || "").trim();
  const deploymentCode =
    (input && input.deploymentCode) || CODE_ACTIVECLINIC_ORG_V6;

  const existing = await getStaffMemberByIdAndOrganization(db, {
    id: staffMemberId,
    organizationId,
  });
  if (!existing.ok) return { ok: false, code: RESULT.STAFF_NOT_FOUND };
  if (existing.staffMember.status !== "suspended") {
    return {
      ok: false,
      code: RESULT.INVALID_INPUT,
      staffMember: existing.staffMember,
    };
  }

  let nextStatus = "active";
  if (existing.staffMember.platformIdentityId) {
    const identity = await identityRepo.findIdentityById(
      db,
      existing.staffMember.platformIdentityId
    );
    if (!identity || !identity.password_hash) {
      nextStatus = "invited";
    }
  } else {
    nextStatus = "invited";
  }

  const row = await staffRepo.updateStaffMember(db, {
    id: staffMemberId,
    organizationId,
    patch: { status: nextStatus },
  });

  await recordAuditEventSafe(db, {
    deploymentCode,
    organizationId,
    actorUserId: null,
    actionKey: "activeclinic.staff.restored",
    entityType: "staff_member",
    entityId: staffMemberId,
    outcome: "success",
    metadataJson: {
      actor_kind: "admin",
      restored_status: nextStatus,
      roles_not_auto_restored: true,
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    staffMember: mapStaff(row),
  };
}

async function revokeStaffRoleAssignment(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const staffMemberId = String((input && input.staffMemberId) || "").trim();
  const assignmentId = String((input && input.assignmentId) || "").trim();
  const deploymentCode =
    (input && input.deploymentCode) || CODE_ACTIVECLINIC_ORG_V6;
  if (!organizationId || !staffMemberId || !assignmentId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const staff = await getStaffMemberByIdAndOrganization(db, {
    id: staffMemberId,
    organizationId,
  });
  if (!staff.ok) return { ok: false, code: RESULT.STAFF_NOT_FOUND };

  const revoked = await accessRepo.revokeRoleAssignment(db, {
    id: assignmentId,
    organizationId,
    revokedByPlatformIdentityId: input.actorPlatformIdentityId || null,
    revocationReason: input.reason || "admin_revoke",
  });
  if (!revoked) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  if (String(revoked.staff_member_id) !== staffMemberId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  await recordAuditEventSafe(db, {
    deploymentCode,
    organizationId,
    actorUserId: null,
    actionKey: "activeclinic.staff.role_revoked",
    entityType: "staff_role_assignment",
    entityId: assignmentId,
    outcome: "success",
    metadataJson: { actor_kind: "admin", staff_member_id: staffMemberId },
  });

  return { ok: true, code: RESULT.OK, assignment: revoked };
}

module.exports = {
  RESULT,
  revokeActiveClinicStaffSessions,
  requireStaffPasswordChange,
  unlockStaffTemporaryLock,
  suspendStaffAccess,
  restoreStaffAccess,
  revokeStaffRoleAssignment,
  issueAdminPasswordResetLink,
  reissueStaffInvitation,
  revokeStaffInvitation,
};
