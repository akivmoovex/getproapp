"use strict";

/**
 * Member portal profile read/update (V2.04 M21–M23).
 * Self-editable fields only; Church ID + official branch are immutable.
 * Phone changes stay pending until OTP verification succeeds.
 */

const {
  requireActiveMemberForTenant,
  STATUS: ACCESS_STATUS,
} = require("./requireActiveMemberForTenant");
const {
  updateMemberProfile,
  RESULT: DOMAIN_RESULT,
} = require("./blessBoardMemberDomainService");
const {
  MARITAL_STATUS,
  MEMBER_SELF_EDITABLE_FIELDS,
} = require("./memberDomainConstants");
const {
  startAccountPhoneVerification,
  completeAccountPhoneVerification,
  STATUS: OTP_WF_STATUS,
} = require("./phoneOtpWorkflowService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: ACCESS_STATUS.FORBIDDEN,
  UNAUTHENTICATED: ACCESS_STATUS.UNAUTHENTICATED,
  NO_MEMBERSHIP: ACCESS_STATUS.NO_MEMBERSHIP,
  WRONG_BRANCH: ACCESS_STATUS.WRONG_BRANCH,
  INACTIVE_USER: ACCESS_STATUS.INACTIVE_USER,
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
  PHONE_VERIFICATION_REQUIRED: "phone_verification_required",
  RATE_LIMITED: "rate_limited",
});

/**
 * @param {object} member
 * @param {object} membership
 * @param {{ branchDisplayName?: string|null }} [extras]
 */
function publicProfile(member, membership, extras) {
  const x = extras || {};
  return {
    memberId: member.id,
    memberNumber: member.memberNumber || null,
    preferredName: member.preferredName,
    firstName: member.firstName,
    lastName: member.lastName,
    emailDisplay: member.emailDisplay,
    emailNormalized: member.emailNormalized,
    phoneDisplay: member.phoneDisplay,
    phoneNormalized: member.phoneNormalized,
    phonePendingDisplay: member.phonePendingDisplay || null,
    phonePendingNormalized: member.phonePendingNormalized || null,
    phoneVerificationRequired: Boolean(member.phoneVerificationRequired),
    dateOfBirth: member.dateOfBirth || null,
    occupation: member.occupation || null,
    maritalStatus: member.maritalStatus || null,
    numberOfChildren: member.numberOfChildren,
    address: member.address || {},
    nextOfKin: member.nextOfKin || {},
    membershipStatus: membership.membershipStatus,
    isPrimaryBranch: Boolean(membership.isPrimary),
    branchId: membership.branchId || null,
    branchDisplayName: x.branchDisplayName || null,
  };
}

async function getMemberPortalProfile(db, input, deps) {
  const requireAccess =
    (deps && typeof deps.requireActiveMemberForTenant === "function"
      ? deps.requireActiveMemberForTenant
      : null) || requireActiveMemberForTenant;
  const access = await requireAccess(db, input);
  if (!access.ok) {
    return {
      ok: false,
      status: access.status,
      reason: access.reason,
      profile: null,
    };
  }
  return {
    ok: true,
    status: STATUS.OK,
    profile: publicProfile(access.member, access.membership, {
      branchDisplayName: input.branchDisplayName || null,
    }),
    memberId: access.member.id,
    member: access.member,
    membership: access.membership,
  };
}

/**
 * Member self-edit via domain profile (never Church ID / official branch).
 */
async function updateMemberPortalProfile(db, input, deps) {
  const raw = input && typeof input === "object" ? input : {};
  const requireAccess =
    (deps && typeof deps.requireActiveMemberForTenant === "function"
      ? deps.requireActiveMemberForTenant
      : null) || requireActiveMemberForTenant;
  const updateProfile =
    (deps && typeof deps.updateMemberProfile === "function"
      ? deps.updateMemberProfile
      : null) || updateMemberProfile;

  const access = await requireAccess(db, {
    userId: raw.userId,
    churchId: raw.churchId,
    branchId: raw.branchId,
  });
  if (!access.ok) {
    return {
      ok: false,
      status: access.status,
      reason: access.reason,
      profile: null,
    };
  }

  // Reject attempts to mutate privileged fields via the profile form payload.
  for (const key of [
    "memberNumber",
    "member_number",
    "churchIdForm",
    "branchIdForm",
    "officialBranchId",
    "portalAccessStatus",
    "status",
    "membershipStatus",
    "role",
    "roles",
  ]) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        reason: `immutable:${key}`,
        profile: null,
      };
    }
  }

  const result = await updateProfile(
    db,
    {
      memberId: access.member.id,
      actorKind: "member_self",
      actorMemberId: access.member.id,
      actorUserId: raw.userId,
      organizationId: raw.organizationId,
      churchId: raw.churchId,
      branchId: raw.branchId,
      firstName: raw.firstName,
      lastName: raw.lastName,
      preferredName: raw.preferredName,
      dateOfBirth: raw.dateOfBirth,
      occupation: raw.occupation,
      maritalStatus: raw.maritalStatus,
      numberOfChildren: raw.numberOfChildren,
      address: raw.address,
      nextOfKin: raw.nextOfKin,
      email: raw.emailDisplay !== undefined ? raw.emailDisplay : raw.email,
      phone: raw.phone,
      phoneNormalized: raw.phoneNormalized,
      phoneDisplay: raw.phoneDisplay,
    },
    deps
  );

  if (!result.ok) {
    if (
      result.code === DOMAIN_RESULT.CHURCH_ID_IMMUTABLE ||
      result.code === DOMAIN_RESULT.BRANCH_NOT_MEMBER_EDITABLE
    ) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        reason: `immutable:${result.code}`,
        profile: null,
      };
    }
    if (result.code === DOMAIN_RESULT.VALIDATION_FAILED) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        reason: "validation",
        detail: result.detail,
        profile: null,
      };
    }
    if (result.code === DOMAIN_RESULT.UNAUTHORIZED) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "unauthorized", profile: null };
    }
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: result.code || "failed",
      profile: null,
    };
  }

  return {
    ok: true,
    status: STATUS.OK,
    profile: publicProfile(result.member, access.membership),
    phoneVerificationRequired: Boolean(result.phoneVerificationRequired),
    member: result.member,
  };
}

/**
 * Start OTP for pending phone change (M23).
 */
async function startMemberPhoneVerification(db, input, env) {
  const access = await requireActiveMemberForTenant(db, {
    userId: input.userId,
    churchId: input.churchId,
    branchId: input.branchId,
  });
  if (!access.ok) {
    return { ok: false, status: access.status, reason: access.reason };
  }
  const pending = access.member.phonePendingNormalized;
  if (!pending) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: "no_pending_phone",
    };
  }

  const started = await startAccountPhoneVerification(
    db,
    {
      userId: input.userId,
      phone: pending,
      changeExisting: Boolean(access.member.phoneNormalized),
      organizationId: input.organizationId,
      requestIp: input.requestIp,
      sessionFingerprint: input.sessionFingerprint,
      country: input.country || "ZM",
    },
    env
  );

  if (!started.ok) {
    if (started.status === OTP_WF_STATUS.RATE_LIMITED) {
      return { ok: false, status: STATUS.RATE_LIMITED, reason: "rate_limited" };
    }
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: started.reason || started.status,
    };
  }

  return {
    ok: true,
    status: STATUS.OK,
    challenge: started.challenge,
    testCode: started.testCode || null,
    pendingPhoneDisplay:
      access.member.phonePendingDisplay || access.member.phonePendingNormalized,
  };
}

/**
 * Complete OTP and promote pending phone to verified contact.
 */
async function completeMemberPhoneVerification(db, input, env, deps) {
  const access = await requireActiveMemberForTenant(db, {
    userId: input.userId,
    churchId: input.churchId,
    branchId: input.branchId,
  });
  if (!access.ok) {
    return { ok: false, status: access.status, reason: access.reason };
  }
  if (!access.member.phonePendingNormalized) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "no_pending_phone" };
  }

  const purpose = access.member.phoneNormalized ? "phone_change" : "phone_verification";
  const completed = await completeAccountPhoneVerification(
    db,
    {
      userId: input.userId,
      verificationId: input.verificationId,
      code: input.code,
      purpose,
    },
    env
  );
  if (!completed.ok) {
    if (completed.status === OTP_WF_STATUS.RATE_LIMITED) {
      return { ok: false, status: STATUS.RATE_LIMITED, reason: "rate_limited" };
    }
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: completed.reason || "otp_failed",
    };
  }

  // Ensure member row matches verified user phone (pending → verified).
  const confirmed = await updateMemberProfile(
    db,
    {
      memberId: access.member.id,
      actorKind: "member_self",
      actorMemberId: access.member.id,
      actorUserId: input.userId,
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: input.branchId,
      confirmPhoneVerification: true,
    },
    deps
  );
  if (!confirmed.ok) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: confirmed.code || "confirm_failed",
    };
  }

  return {
    ok: true,
    status: STATUS.OK,
    profile: publicProfile(confirmed.member, access.membership),
    phoneNormalized: completed.phoneNormalized,
  };
}

module.exports = {
  STATUS,
  MEMBER_SELF_EDITABLE_FIELDS,
  MARITAL_STATUS,
  getMemberPortalProfile,
  updateMemberPortalProfile,
  startMemberPhoneVerification,
  completeMemberPhoneVerification,
  publicProfile,
};
