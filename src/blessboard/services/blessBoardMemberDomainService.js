"use strict";

/**
 * BlessBoard V2.04 member domain foundation (Phase 4).
 *
 * Rules enforced here (no Stitch UI):
 * - Membership created only by authorized staff (never self-create)
 * - Church ID church-controlled, unique per church, immutable for members
 * - Membership status ≠ portal access status
 * - Member may exist without portal activation
 * - Visitor conversion never auto-creates membership
 * - Reuse platform Person when safely identified
 */

const memberRepo = require("../repositories/memberIdentityRepository");
const {
  MEMBERSHIP_STATUS,
  CANONICAL_MEMBERSHIP_STATUSES,
  PORTAL_ACCESS_STATUS,
  MEMBER_PERMISSION,
  MARITAL_STATUS,
} = require("./memberDomainConstants");
const {
  isMembershipTransitionAllowed,
  isPortalAdminTransitionAllowed,
  membershipAllowsOrdinaryPortalAccess,
  portalStatusAfterMembershipChange,
} = require("./membershipPortalLifecycle");
const {
  runStaffManagedPersonWorkflow,
  STAFF_PERSON_WORKFLOW_CODE,
} = require("../../platform/person/workflow");
const {
  createBlessBoardStaffMemberAdapter,
} = require("./blessBoardStaffMemberWorkflowAdapter");
const {
  normalizePersonPhone,
  normalizePersonEmail,
  normalizePersonDateOfBirth,
} = require("../../platform/person/personNormalization");
const {
  SHARED_AUDIT_ACTION,
  SHARED_AUDIT_OUTCOME,
  recordSharedPlatformAudit,
} = require("../../platform/audit");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  UNAUTHORIZED: "unauthorized",
  NOT_FOUND: "member_not_found",
  DUPLICATE_CHURCH_ID: "duplicate_church_id",
  CHURCH_ID_IMMUTABLE: "church_id_immutable",
  BRANCH_NOT_MEMBER_EDITABLE: "branch_not_member_editable",
  SELF_CREATE_FORBIDDEN: "self_create_forbidden",
  VISITOR_AUTO_MEMBERSHIP_FORBIDDEN: "visitor_auto_membership_forbidden",
  PHONE_VERIFICATION_REQUIRED: "phone_verification_required",
  VALIDATION_FAILED: "validation_failed",
  TENANT_MISMATCH: "tenant_mismatch",
  REASON_REQUIRED: "reason_required",
  INVALID_TRANSITION: "invalid_transition",
});

function requireReason(raw, { min = 3, max = 1000 } = {}) {
  const reason = raw == null ? "" : String(raw).trim();
  if (!reason || reason.length < min) {
    return { ok: false, code: RESULT.REASON_REQUIRED };
  }
  if (reason.length > max) {
    return { ok: false, code: RESULT.VALIDATION_FAILED, detail: "reason_too_long" };
  }
  return { ok: true, reason };
}

function createAuthorize(deps) {
  return (
    (deps && deps.authorize) ||
    ((db, input) =>
      require("./blessBoardRbacAuthorizationService").authorize(db, {
        permission: input.permission,
        actor: { userId: input.actorUserId },
        tenantContext: {
          organizationId: input.organizationId,
          churchId: input.churchId,
          primaryBranchId: input.branchId || null,
        },
        resourceContext: {
          organizationId: input.organizationId,
          churchId: input.churchId,
          branchId: input.branchId != null ? input.branchId : null,
        },
      }))
  );
}

async function requirePerm(db, authorize, input, permission) {
  const authz = await authorize(db, {
    permission,
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    churchId: input.churchId,
    branchId: input.branchId,
  });
  if (!authz || authz.allowed !== true) {
    return {
      ok: false,
      code: RESULT.UNAUTHORIZED,
      reasonCode: (authz && authz.reasonCode) || "unauthorized",
    };
  }
  return { ok: true, authz };
}

function assertStaffActor(input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!actorUserId || !organizationId || !churchId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  // Members cannot self-create church membership.
  if (input.selfCreate === true || input.actorKind === "member_self") {
    return { ok: false, code: RESULT.SELF_CREATE_FORBIDDEN };
  }
  if (input.source === "visitor_conversion_auto") {
    return { ok: false, code: RESULT.VISITOR_AUTO_MEMBERSHIP_FORBIDDEN };
  }
  return { ok: true, actorUserId, organizationId, churchId };
}

/**
 * Visitor / New Convert / Membership Preparation must never auto-create membership.
 * Explicit staff action only.
 */
function assertVisitorConversionDoesNotCreateMembership(input) {
  const src = String((input && input.source) || "").trim().toLowerCase();
  if (
    src === "visitor_conversion_auto" ||
    src === "new_convert_auto" ||
    src === "membership_preparation_auto"
  ) {
    return { ok: false, code: RESULT.VISITOR_AUTO_MEMBERSHIP_FORBIDDEN };
  }
  return { ok: true };
}

async function auditMemberChange(db, payload) {
  return recordSharedPlatformAudit(db, {
    actionKey: payload.actionKey || SHARED_AUDIT_ACTION.STAFF_PERSON_WORKFLOW_COMPLETED,
    outcome: payload.outcome || SHARED_AUDIT_OUTCOME.SUCCESS,
    productCode: "blessboard",
    organizationId: payload.organizationId,
    churchId: payload.churchId,
    branchId: payload.branchId || null,
    actorUserId: payload.actorUserId || null,
    actorIdentityId: payload.actorIdentityId || null,
    entityType: "member",
    entityId: payload.memberId || null,
    metadata: payload.metadata || {},
  });
}

/**
 * Staff create member — uses Phase 3 workflow + person reuse.
 */
async function createStaffManagedMember(db, input, deps) {
  const gate = assertStaffActor(input);
  if (!gate.ok) return gate;
  const visitorGate = assertVisitorConversionDoesNotCreateMembership(input);
  if (!visitorGate.ok) return visitorGate;

  const authorize = createAuthorize(deps);
  const authz = await requirePerm(db, authorize, input, MEMBER_PERMISSION.CREATE);
  if (!authz.ok) return authz;

  const branchId = String((input && input.branchId) || "").trim();
  if (!branchId) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: "branch_required" };
  }

  let memberNumber =
    input.memberNumber != null && String(input.memberNumber).trim()
      ? String(input.memberNumber).trim()
      : null;
  if (!memberNumber) {
    const allocated = await memberRepo.allocateNextChurchId(db, {
      churchId: gate.churchId,
    });
    if (!allocated || !allocated.ok) {
      return {
        ok: false,
        code: RESULT.VALIDATION_FAILED,
        detail: (allocated && allocated.code) || "church_id_allocate_failed",
      };
    }
    memberNumber = allocated.memberNumber;
  }
  if (memberNumber) {
    const existing = await memberRepo.findMemberByChurchAndNumber(db, {
      churchId: gate.churchId,
      memberNumber,
    });
    if (existing) {
      return {
        ok: false,
        code: RESULT.DUPLICATE_CHURCH_ID,
        existingMemberId: existing.id,
      };
    }
  }

  const requestedMembershipStatus = String(
    (input && (input.membershipStatus || input.initialMembershipStatus)) ||
      MEMBERSHIP_STATUS.ACTIVE
  )
    .trim()
    .toLowerCase();
  const membershipStatus = CANONICAL_MEMBERSHIP_STATUSES.includes(
    requestedMembershipStatus
  )
    ? requestedMembershipStatus
    : requestedMembershipStatus === MEMBERSHIP_STATUS.PENDING
      ? MEMBERSHIP_STATUS.PENDING
      : MEMBERSHIP_STATUS.ACTIVE;

  const adapter =
    (deps && deps.adapter) ||
    createBlessBoardStaffMemberAdapter({ authorize: async () => ({ allowed: true }) });

  // Authorization already checked; adapter authorize is short-circuited for create path.
  const workflow = await runStaffManagedPersonWorkflow(db, {
    productCode: "blessboard",
    adapter: {
      ...adapter,
      authorize: async () => ({ ok: true }),
      async createProductRelationship(innerDb, ctx) {
        const created = await adapter.createProductRelationship(innerDb, {
          ...ctx,
          product: {
            ...ctx.product,
            portalAccessStatus: PORTAL_ACCESS_STATUS.NOT_ACTIVATED,
            membershipStatus,
          },
        });
        if (created.ok && input.reusePersonId && created.subjectRef) {
          await memberRepo.setMemberPlatformPersonId(innerDb, {
            memberId: created.subjectRef,
            platformPersonId: input.reusePersonId,
          });
        }
        return created;
      },
    },
    trusted: {
      organizationId: gate.organizationId,
      churchId: gate.churchId,
      branchId,
    },
    actor: { userId: gate.actorUserId },
    demographics: input.demographics || {},
    product: {
      churchId: gate.churchId,
      branchId,
      memberNumber,
      membershipStatus,
      portalAccessStatus: PORTAL_ACCESS_STATUS.NOT_ACTIVATED,
      ...normalizeProfileProduct(input.profile || {}),
    },
    reusePersonId: input.reusePersonId || null,
    duplicateOverride: input.duplicateOverride === true,
    duplicateOverrideReason: input.duplicateOverrideReason || null,
    source: input.source || "staff_api",
    hooks: deps && deps.hooks,
  });

  if (!workflow.ok) {
    if (workflow.code === STAFF_PERSON_WORKFLOW_CODE.DUPLICATE_BLOCKED) {
      return {
        ok: false,
        code: RESULT.DUPLICATE_CHURCH_ID,
        matches: workflow.matches,
      };
    }
    return {
      ok: false,
      code: workflow.code || RESULT.VALIDATION_FAILED,
      detail: workflow,
    };
  }

  await auditMemberChange(db, {
    actionKey: "members.create",
    organizationId: gate.organizationId,
    churchId: gate.churchId,
    branchId,
    actorUserId: gate.actorUserId,
    memberId: workflow.subjectRef,
    metadata: {
      source: input.source || "staff_api",
      person_id: workflow.person && workflow.person.id,
      person_reused: Boolean(input.reusePersonId) || !workflow.personCreated,
      church_id_number: workflow.productIdentifier || null,
      membership_status: membershipStatus,
      portal_access_status: PORTAL_ACCESS_STATUS.NOT_ACTIVATED,
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    memberId: workflow.subjectRef,
    person: workflow.person,
    personCreated: workflow.personCreated,
    productIdentifier: workflow.productIdentifier,
    membershipStatus,
    portalAccessStatus: PORTAL_ACCESS_STATUS.NOT_ACTIVATED,
    workflow,
  };
}

function normalizeProfileProduct(profile) {
  const p = profile && typeof profile === "object" ? profile : {};
  return {
    dateOfBirth: p.dateOfBirth || null,
    occupation: p.occupation || null,
    maritalStatus: p.maritalStatus || null,
    numberOfChildren: p.numberOfChildren,
    addressLine1: p.address && p.address.line1,
    addressLine2: p.address && p.address.line2,
    addressCity: p.address && p.address.city,
    addressDistrict: p.address && p.address.district,
    addressProvince: p.address && p.address.province,
    addressCountryCode: p.address && p.address.countryCode,
    addressPostalCode: p.address && p.address.postalCode,
    nextOfKinName: p.nextOfKin && p.nextOfKin.name,
    nextOfKinRelationship: p.nextOfKin && p.nextOfKin.relationship,
    nextOfKinPhoneDisplay: p.nextOfKin && p.nextOfKin.phoneDisplay,
    nextOfKinPhoneNormalized: p.nextOfKin && p.nextOfKin.phoneNormalized,
  };
}

/**
 * Update profile fields. Member actors cannot change Church ID or official branch.
 */
async function updateMemberProfile(db, input, deps) {
  const memberId = String((input && input.memberId) || "").trim();
  if (!memberId) return { ok: false, code: RESULT.INVALID_INPUT };

  const member = await memberRepo.findMemberById(db, memberId);
  if (!member) return { ok: false, code: RESULT.NOT_FOUND };

  const churchId = String((input && input.churchId) || member.churchId).trim();
  if (churchId !== member.churchId) {
    return { ok: false, code: RESULT.TENANT_MISMATCH };
  }

  const isMemberSelf = input.actorKind === "member_self";
  const authorize = createAuthorize(deps);

  if (isMemberSelf) {
    if (input.memberNumber !== undefined) {
      return { ok: false, code: RESULT.CHURCH_ID_IMMUTABLE };
    }
    // Tenant/portal `branchId` is authorization scope, not a membership-branch mutation.
    // Only an explicit officialBranchId (or similar) attempt is blocked for member self-edit.
    if (input.officialBranchId !== undefined) {
      return { ok: false, code: RESULT.BRANCH_NOT_MEMBER_EDITABLE };
    }
    if (String(input.actorMemberId || "") !== memberId) {
      return { ok: false, code: RESULT.UNAUTHORIZED };
    }
  } else {
    const authz = await requirePerm(
      db,
      authorize,
      {
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        churchId,
        branchId: input.branchId,
      },
      MEMBER_PERMISSION.EDIT
    );
    if (!authz.ok) return authz;
  }

  if (input.memberNumber !== undefined && !isMemberSelf) {
    return {
      ok: false,
      code: RESULT.CHURCH_ID_IMMUTABLE,
      detail: "use_manageChurchId",
    };
  }

  const patch = {};
  if (input.firstName != null) patch.firstName = String(input.firstName).trim();
  if (input.lastName != null) patch.lastName = String(input.lastName).trim();
  if (input.preferredName !== undefined) {
    if (input.preferredName == null || String(input.preferredName).trim() === "") {
      patch.preferredName = null;
    } else {
      const preferred = String(input.preferredName).trim();
      if (preferred.length > 100) {
        return { ok: false, code: RESULT.VALIDATION_FAILED, detail: "preferred_name" };
      }
      patch.preferredName = preferred;
    }
  }

  if (input.dateOfBirth !== undefined) {
    const dob = normalizePersonDateOfBirth(input.dateOfBirth);
    if (!dob.ok) return { ok: false, code: RESULT.VALIDATION_FAILED, detail: dob };
    patch.dateOfBirth = dob.dateOfBirth;
  }

  if (input.occupation !== undefined) {
    patch.occupation =
      input.occupation == null || String(input.occupation).trim() === ""
        ? null
        : String(input.occupation).trim();
  }

  if (input.maritalStatus !== undefined) {
    if (
      input.maritalStatus != null &&
      !MARITAL_STATUS.includes(String(input.maritalStatus))
    ) {
      return { ok: false, code: RESULT.VALIDATION_FAILED, detail: "marital_status" };
    }
    patch.maritalStatus = input.maritalStatus;
  }

  if (input.numberOfChildren !== undefined) {
    if (
      input.numberOfChildren != null &&
      (Number(input.numberOfChildren) < 0 || Number(input.numberOfChildren) > 50)
    ) {
      return { ok: false, code: RESULT.VALIDATION_FAILED, detail: "children" };
    }
    patch.numberOfChildren = input.numberOfChildren;
  }

  if (input.address && typeof input.address === "object") {
    patch.addressLine1 = input.address.line1;
    patch.addressLine2 = input.address.line2;
    patch.addressCity = input.address.city;
    patch.addressDistrict = input.address.district;
    patch.addressProvince = input.address.province;
    patch.addressCountryCode = input.address.countryCode;
    patch.addressPostalCode = input.address.postalCode;
  }

  if (input.nextOfKin && typeof input.nextOfKin === "object") {
    patch.nextOfKinName = input.nextOfKin.name;
    patch.nextOfKinRelationship = input.nextOfKin.relationship;
    if (input.nextOfKin.phone != null || input.nextOfKin.phoneNormalized) {
      const phone = normalizePersonPhone({
        phone: input.nextOfKin.phone,
        phoneNormalized: input.nextOfKin.phoneNormalized,
        phoneDisplay: input.nextOfKin.phoneDisplay,
      });
      if (!phone.ok) {
        return { ok: false, code: RESULT.VALIDATION_FAILED, detail: phone };
      }
      patch.nextOfKinPhoneDisplay = phone.display;
      patch.nextOfKinPhoneNormalized = phone.normalized;
    }
  }

  if (input.email !== undefined) {
    const email = normalizePersonEmail(input.email);
    if (!email.ok) return { ok: false, code: RESULT.VALIDATION_FAILED, detail: email };
    patch.emailDisplay = email.display;
  }

  // Phone recovery / change preserves verification requirements.
  if (input.phone !== undefined || input.phoneNormalized !== undefined) {
    const phone = normalizePersonPhone({
      phone: input.phone,
      phoneNormalized: input.phoneNormalized,
      phoneDisplay: input.phoneDisplay,
    });
    if (!phone.ok) return { ok: false, code: RESULT.VALIDATION_FAILED, detail: phone };
    const current = member.phoneNormalized || null;
    if (phone.normalized && phone.normalized !== current) {
      if (input.phoneVerified === true && !isMemberSelf) {
        // Staff with verified evidence may apply immediately.
        patch.phoneNormalized = phone.normalized;
        patch.phoneDisplay = phone.display;
        patch.phonePendingNormalized = null;
        patch.phonePendingDisplay = null;
        patch.phoneVerificationRequired = false;
      } else {
        patch.phonePendingNormalized = phone.normalized;
        patch.phonePendingDisplay = phone.display;
        patch.phoneVerificationRequired = true;
      }
    }
  }

  if (input.confirmPhoneVerification === true && member.phonePendingNormalized) {
    patch.phoneNormalized = member.phonePendingNormalized;
    patch.phoneDisplay = member.phonePendingDisplay;
    patch.phonePendingNormalized = null;
    patch.phonePendingDisplay = null;
    patch.phoneVerificationRequired = false;
  }

  const updated = await memberRepo.updateMemberDomainProfile(db, {
    memberId,
    ...patch,
  });

  await auditMemberChange(db, {
    actionKey: "members.edit",
    organizationId: input.organizationId,
    churchId,
    branchId: input.branchId || null,
    actorUserId: input.actorUserId || null,
    memberId,
    metadata: {
      actor_kind: isMemberSelf ? "member_self" : "staff",
      phone_verification_required: updated.phoneVerificationRequired,
      fields: Object.keys(patch),
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    member: updated,
    phoneVerificationRequired: updated.phoneVerificationRequired,
  };
}

/**
 * Church-controlled Church ID assign/change — requires members.manage_church_id.
 * Reason is required and audited. Org/church uniqueness enforced.
 */
async function manageChurchId(db, input, deps) {
  const gate = assertStaffActor(input);
  if (!gate.ok) return gate;
  const authorize = createAuthorize(deps);
  const authz = await requirePerm(
    db,
    authorize,
    input,
    MEMBER_PERMISSION.CHURCH_ID_MANAGE
  );
  if (!authz.ok) return authz;

  const reasonGate = requireReason(input && input.reason);
  if (!reasonGate.ok) return reasonGate;

  const memberId = String((input && input.memberId) || "").trim();
  const memberNumber = String((input && input.memberNumber) || "").trim();
  if (!memberId || !memberNumber) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const member = await memberRepo.findMemberById(db, memberId);
  if (!member || member.churchId !== gate.churchId) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }

  const clash = await memberRepo.findMemberByChurchAndNumber(db, {
    churchId: gate.churchId,
    memberNumber,
  });
  if (clash && clash.id !== memberId) {
    return { ok: false, code: RESULT.DUPLICATE_CHURCH_ID, existingMemberId: clash.id };
  }

  const updated = await memberRepo.updateMemberNumber(db, {
    memberId,
    memberNumber,
  });

  await auditMemberChange(db, {
    actionKey: "members.manage_church_id",
    organizationId: gate.organizationId,
    churchId: gate.churchId,
    branchId: input.branchId || null,
    actorUserId: gate.actorUserId,
    memberId,
    metadata: {
      previous_church_id: member.memberNumber,
      new_church_id: memberNumber,
      reason: reasonGate.reason,
    },
  });

  return { ok: true, code: RESULT.OK, member: updated };
}

/**
 * Block / unblock portal access — does not change membership status.
 * Admin may only transition ACTIVE ↔ BLOCKED (PD-V204-BB-04).
 * Blocking requires a reason and invalidates relevant member sessions.
 */
async function setPortalAccessStatus(db, input, deps) {
  const gate = assertStaffActor(input);
  if (!gate.ok) return gate;
  const authorize = createAuthorize(deps);
  const authz = await requirePerm(db, authorize, input, MEMBER_PERMISSION.BLOCK);
  if (!authz.ok) return authz;

  const status = String((input && input.portalAccessStatus) || "")
    .trim()
    .toLowerCase();
  if (!Object.values(PORTAL_ACCESS_STATUS).includes(status)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  let reason = null;
  if (status === PORTAL_ACCESS_STATUS.BLOCKED) {
    const reasonGate = requireReason(input && input.reason);
    if (!reasonGate.ok) return reasonGate;
    reason = reasonGate.reason;
  } else if (input && input.reason != null && String(input.reason).trim()) {
    reason = String(input.reason).trim().slice(0, 1000);
  }

  const memberId = String((input && input.memberId) || "").trim();
  const member = await memberRepo.findMemberById(db, memberId);
  if (!member || member.churchId !== gate.churchId) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }

  if (
    !isPortalAdminTransitionAllowed(member.portalAccessStatus, status)
  ) {
    return {
      ok: false,
      code: RESULT.INVALID_TRANSITION,
      detail: {
        from: member.portalAccessStatus,
        to: status,
        axis: "portal",
      },
    };
  }

  if (
    status === PORTAL_ACCESS_STATUS.ACTIVE &&
    !membershipAllowsOrdinaryPortalAccess(member.status)
  ) {
    return {
      ok: false,
      code: RESULT.INVALID_TRANSITION,
      detail: {
        reason: "membership_not_active",
        membershipStatus: member.status,
      },
    };
  }

  const updated = await memberRepo.updatePortalAccessStatus(db, {
    memberId,
    portalAccessStatus: status,
  });

  let sessionsRevoked = 0;
  if (status === PORTAL_ACCESS_STATUS.BLOCKED && member.userId) {
    const revoke =
      (deps && typeof deps.revokeSessionsByBlessBoardUser === "function"
        ? deps.revokeSessionsByBlessBoardUser
        : null) ||
      require("../../platform/session/revokeV5Session").revokeSessionsByBlessBoardUser;
    const deployment =
      (deps && deps.deploymentCode) ||
      (() => {
        const resolved = require("../../platform/config/platformDeploymentCode").getPlatformDeploymentCode(
          (deps && deps.env) || process.env
        );
        return resolved && resolved.ok ? resolved.code : null;
      })();
    if (deployment) {
      const revoked = await revoke(db, {
        userId: member.userId,
        deploymentCode: deployment,
      });
      sessionsRevoked = (revoked && revoked.revokedCount) || 0;
    }
  }

  await auditMemberChange(db, {
    actionKey: "members.block",
    organizationId: gate.organizationId,
    churchId: gate.churchId,
    branchId: input.branchId || null,
    actorUserId: gate.actorUserId,
    memberId,
    metadata: {
      previous_portal_access_status: member.portalAccessStatus,
      portal_access_status: status,
      membership_status_unchanged: member.status,
      reason,
      sessions_revoked: sessionsRevoked,
      lifecycle_audit: true,
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    member: updated,
    sessionsRevoked,
    membershipStatusUnchanged: true,
  };
}

async function setMembershipStatus(db, input, deps) {
  const gate = assertStaffActor(input);
  if (!gate.ok) return gate;
  const authorize = createAuthorize(deps);
  const authz = await requirePerm(db, authorize, input, MEMBER_PERMISSION.EDIT);
  if (!authz.ok) return authz;

  const status = String((input && input.membershipStatus) || "")
    .trim()
    .toLowerCase();
  if (!CANONICAL_MEMBERSHIP_STATUSES.includes(status)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const memberId = String((input && input.memberId) || "").trim();
  const member = await memberRepo.findMemberById(db, memberId);
  if (!member || member.churchId !== gate.churchId) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }

  if (!isMembershipTransitionAllowed(member.status, status)) {
    return {
      ok: false,
      code: RESULT.INVALID_TRANSITION,
      detail: {
        from: member.status,
        to: status,
        axis: "membership",
      },
    };
  }

  let updated = await memberRepo.updateMembershipLifecycleStatus(db, {
    memberId,
    status,
  });

  const nextPortal = portalStatusAfterMembershipChange(
    status,
    member.portalAccessStatus
  );
  let portalAdjusted = false;
  let sessionsRevoked = 0;
  if (nextPortal !== normalizePortal(member.portalAccessStatus)) {
    updated = await memberRepo.updatePortalAccessStatus(db, {
      memberId,
      portalAccessStatus: nextPortal,
    });
    // Preserve membership status on the returned member object.
    if (updated) {
      updated = { ...updated, status };
    }
    portalAdjusted = true;

    if (
      member.userId &&
      normalizePortal(member.portalAccessStatus) === PORTAL_ACCESS_STATUS.ACTIVE
    ) {
      const revoke =
        (deps && typeof deps.revokeSessionsByBlessBoardUser === "function"
          ? deps.revokeSessionsByBlessBoardUser
          : null) ||
        require("../../platform/session/revokeV5Session").revokeSessionsByBlessBoardUser;
      const deployment =
        (deps && deps.deploymentCode) ||
        (() => {
          const resolved = require("../../platform/config/platformDeploymentCode").getPlatformDeploymentCode(
            (deps && deps.env) || process.env
          );
          return resolved && resolved.ok ? resolved.code : null;
        })();
      if (deployment) {
        const revoked = await revoke(db, {
          userId: member.userId,
          deploymentCode: deployment,
        });
        sessionsRevoked = (revoked && revoked.revokedCount) || 0;
      }
    }
  }

  await auditMemberChange(db, {
    actionKey: "members.edit",
    organizationId: gate.organizationId,
    churchId: gate.churchId,
    branchId: input.branchId || null,
    actorUserId: gate.actorUserId,
    memberId,
    metadata: {
      previous_membership_status: member.status,
      membership_status: status,
      previous_portal_access_status: member.portalAccessStatus,
      portal_access_status: nextPortal,
      portal_adjusted_for_lifecycle: portalAdjusted,
      sessions_revoked: sessionsRevoked,
      reason: input.reason || null,
      lifecycle_audit: true,
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    member: updated,
    portalAdjusted,
    sessionsRevoked,
  };
}

function normalizePortal(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/**
 * Safe person reuse lookup: exact org-scoped phone or email on platform.persons.
 * Does not invent fuzzy merges.
 */
async function findReusablePersonForMember(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId) return { ok: false, code: RESULT.INVALID_INPUT };

  const phone = input.phoneNormalized
    ? String(input.phoneNormalized).trim()
    : null;
  const email = input.emailNormalized
    ? String(input.emailNormalized).trim().toLowerCase()
    : null;
  if (!phone && !email) {
    return { ok: true, person: null, reason: "no_safe_signal" };
  }

  const params = [organizationId];
  const clauses = [];
  let i = 2;
  if (phone) {
    clauses.push(`phone_normalized = $${i++}`);
    params.push(phone);
  }
  if (email) {
    clauses.push(`email_normalized = $${i++}`);
    params.push(email);
  }

  const { rows } = await db.query(
    `SELECT id, organization_id, phone_normalized, email_normalized, status
       FROM platform.persons
      WHERE organization_id = $1
        AND status = 'active'
        AND (${clauses.join(" OR ")})
      ORDER BY created_at ASC
      LIMIT 5`,
    params
  );

  if (!rows.length) return { ok: true, person: null, reason: "no_match" };
  if (rows.length > 1) {
    return { ok: true, person: null, reason: "ambiguous", candidates: rows.length };
  }
  return {
    ok: true,
    person: {
      id: rows[0].id,
      organizationId: rows[0].organization_id,
      phoneNormalized: rows[0].phone_normalized,
      emailNormalized: rows[0].email_normalized,
    },
    reason: "exact_match",
  };
}

/**
 * Human-readable member history (no technical/DB field dumps).
 */
async function listMemberAdminHistory(db, input, deps) {
  const gate = assertStaffActor(input);
  if (!gate.ok) return gate;
  const authorize = createAuthorize(deps);
  const authz = await requirePerm(db, authorize, input, MEMBER_PERMISSION.VIEW);
  if (!authz.ok) return authz;

  const memberId = String((input && input.memberId) || "").trim();
  const member = await memberRepo.findMemberById(db, memberId);
  if (!member || member.churchId !== gate.churchId) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }

  const listFn =
    (deps && typeof deps.listAuditEvents === "function" && deps.listAuditEvents) ||
    require("../../platform/repositories/auditEventRepository").listAuditEvents;

  const page = await listFn(db, {
    organizationId: gate.organizationId,
    churchId: gate.churchId,
    productCode: "blessboard",
    entityType: "member",
    entityId: memberId,
    limit: Math.min(Math.max(Number(input.limit) || 40, 1), 100),
  });

  const events = Array.isArray(page && page.events)
    ? page.events
    : Array.isArray(page)
      ? page
      : [];

  return {
    ok: true,
    code: RESULT.OK,
    memberId,
    events: events.map(presentMemberHistoryEvent).filter(Boolean),
  };
}

function presentMemberHistoryEvent(event) {
  if (!event) return null;
  const meta = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
  const actionKey = String(event.actionKey || "").toLowerCase();
  let title = "Member record updated";
  let detail = null;

  if (actionKey === "members.create") {
    title = "Membership created";
    detail = meta.church_id_number
      ? `Church ID ${meta.church_id_number} assigned. Portal not activated.`
      : "Portal access was not activated.";
  } else if (actionKey === "members.manage_church_id") {
    title = "Church ID changed";
    detail = [
      meta.previous_church_id && meta.new_church_id
        ? `From ${meta.previous_church_id} to ${meta.new_church_id}`
        : null,
      meta.reason ? `Reason: ${meta.reason}` : null,
    ]
      .filter(Boolean)
      .join(". ");
  } else if (actionKey === "members.block") {
    const portal = String(meta.portal_access_status || "").toLowerCase();
    if (portal === "blocked") {
      title = "Portal access blocked";
      detail = [
        "Digital access disabled. Membership was not removed.",
        meta.reason ? `Reason: ${meta.reason}` : null,
      ]
        .filter(Boolean)
        .join(" ");
    } else if (portal === "active") {
      title = "Portal access restored";
      detail = meta.reason ? `Reason: ${meta.reason}` : null;
    } else {
      title = "Portal access updated";
      detail = portal ? `Portal status set to ${portal.replace(/_/g, " ")}.` : null;
    }
  } else if (actionKey === "members.edit") {
    if (meta.membership_status) {
      title = "Membership status updated";
      detail = [
        meta.previous_membership_status && meta.membership_status
          ? `From ${meta.previous_membership_status} to ${meta.membership_status}`
          : null,
        meta.reason ? `Reason: ${meta.reason}` : null,
      ]
        .filter(Boolean)
        .join(". ");
    } else if (Array.isArray(meta.fields) && meta.fields.length) {
      title = "Profile details updated";
      detail = "Staff updated member profile information.";
    } else {
      title = "Member profile updated";
    }
  } else if (actionKey === "members.transfer" || actionKey.indexOf("transfer") >= 0) {
    title = "Branch transfer recorded";
    detail = [
      meta.from_branch_name || meta.from_branch_id
        ? `From ${meta.from_branch_name || "previous branch"}`
        : null,
      meta.to_branch_name || meta.to_branch_id
        ? `to ${meta.to_branch_name || "destination branch"}`
        : null,
      "Historical attendance was left unchanged.",
      meta.reason ? `Reason: ${meta.reason}` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return {
    id: event.id,
    title,
    detail,
    occurredAt: event.createdAt || null,
    // Never expose action keys, entity UUIDs, or raw metadata to the UI layer.
  };
}

/**
 * Authorized same-church branch transfer request.
 * Historical attendance remains unchanged; transfer is audited.
 */
async function requestAuthorizedBranchTransfer(db, input, deps) {
  const gate = assertStaffActor(input);
  if (!gate.ok) return gate;
  const authorize = createAuthorize(deps);
  const authz = await requirePerm(db, authorize, input, MEMBER_PERMISSION.EDIT);
  if (!authz.ok) return authz;

  const reasonGate = requireReason(input && input.reason);
  if (!reasonGate.ok) return reasonGate;

  const {
    requestMemberBranchTransfer,
  } = require("./membershipWorkflowService");

  const result = await requestMemberBranchTransfer(db, {
    actorUserId: gate.actorUserId,
    churchId: gate.churchId,
    memberId: input.memberId,
    toBranchId: input.toBranchId,
    reason: reasonGate.reason,
    tenant: input.tenant || {
      organization: { id: gate.organizationId },
      church: { id: gate.churchId },
    },
  });

  if (!result || !result.ok) {
    return {
      ok: false,
      code:
        result && result.status === "forbidden"
          ? RESULT.UNAUTHORIZED
          : RESULT.VALIDATION_FAILED,
      detail: result,
    };
  }

  await auditMemberChange(db, {
    actionKey: "members.transfer",
    organizationId: gate.organizationId,
    churchId: gate.churchId,
    branchId: input.branchId || null,
    actorUserId: gate.actorUserId,
    memberId: input.memberId,
    metadata: {
      transfer_id: result.transfer && result.transfer.id,
      from_branch_id: result.transfer && result.transfer.fromBranchId,
      to_branch_id: result.transfer && result.transfer.toBranchId,
      reason: reasonGate.reason,
      historical_attendance_unchanged: true,
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    transfer: result.transfer,
    historicalAttendanceUnchanged: true,
  };
}

module.exports = {
  RESULT,
  MEMBERSHIP_STATUS,
  PORTAL_ACCESS_STATUS,
  MEMBER_PERMISSION,
  createStaffManagedMember,
  updateMemberProfile,
  manageChurchId,
  setPortalAccessStatus,
  setMembershipStatus,
  findReusablePersonForMember,
  listMemberAdminHistory,
  requestAuthorizedBranchTransfer,
  presentMemberHistoryEvent,
  assertVisitorConversionDoesNotCreateMembership,
  assertStaffActor,
  requireReason,
};
