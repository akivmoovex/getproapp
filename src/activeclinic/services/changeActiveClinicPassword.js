"use strict";

/**
 * ActiveClinic password-change-required flow (AC-V6-08).
 */

const {
  verifyPlatformIdentityPassword,
  setPlatformIdentityPassword,
  validatePasswordPolicy,
  RESULT: CRED_RESULT,
} = require("../../platform/services/platformIdentityCredentialService");
const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const {
  revokeSessionsByPlatformIdentity,
} = require("../../platform/session/revokeV5Session");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  WEAK_PASSWORD: "weak_password",
  INVALID_CURRENT: "invalid_current_password",
  MISMATCH: "confirmation_mismatch",
  IDENTITY_DISABLED: "identity_disabled",
});

/**
 * @param {{ query: Function }} db
 * @param {{
 *   platformIdentityId: string,
 *   currentPassword: string,
 *   newPassword: string,
 *   confirmPassword: string,
 *   deploymentCode: string,
 *   organizationId?: string|null,
 *   keepSessionId?: string|null,
 * }} input
 */
async function changeActiveClinicPassword(db, input) {
  const identityId = String((input && input.platformIdentityId) || "").trim();
  const currentPassword = String((input && input.currentPassword) || "");
  const newPassword = String((input && input.newPassword) || "");
  const confirmPassword = String((input && input.confirmPassword) || "");
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();

  if (!identityId || !currentPassword || !newPassword || !deploymentCode) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, code: RESULT.MISMATCH };
  }
  const policy = validatePasswordPolicy(newPassword);
  if (!policy.ok) {
    return { ok: false, code: RESULT.WEAK_PASSWORD };
  }

  const verified = await verifyPlatformIdentityPassword(db, {
    identityId,
    password: currentPassword,
    recordFailure: false,
  });
  if (!verified.ok) {
    return { ok: false, code: RESULT.INVALID_CURRENT };
  }

  const set = await setPlatformIdentityPassword(db, {
    identityId,
    password: newPassword,
    mustChangePassword: false,
  });
  if (!set.ok) {
    return { ok: false, code: set.code };
  }

  // Revoke other ActiveClinic sessions for this identity in this deployment.
  await revokeSessionsByPlatformIdentity(db, {
    platformIdentityId: identityId,
    deploymentCode,
  });

  if (input.organizationId) {
    await recordAuditEventSafe(db, {
      deploymentCode: deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
      organizationId: input.organizationId,
      actorUserId: null,
      actionKey: "activeclinic.password.changed",
      entityType: "platform_identity",
      entityId: identityId,
      outcome: "success",
      metadata: {
        category: "auth",
        product_key: "activeclinic",
        status: "password_changed",
        actor_type: "platform_identity",
        source: "activeclinic_password_change",
      },
    });
  }

  // Clear flag explicitly (setPlatformIdentityPassword already clears when mustChangePassword false)
  await identityRepo.setMustChangePassword(db, {
    identityId,
    mustChangePassword: false,
  });

  return { ok: true, code: RESULT.OK, identity: set.identity };
}

module.exports = {
  RESULT,
  changeActiveClinicPassword,
};
