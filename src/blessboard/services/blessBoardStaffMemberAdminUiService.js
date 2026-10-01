"use strict";

/**
 * V2.04 BB staff Member Admin Profile UI orchestration (M06–M12).
 * Authorization decisions are computed for UI gating; routes/services re-check.
 */

const {
  MEMBER_PERMISSION,
  PORTAL_ACCESS_STATUS,
  CANONICAL_MEMBERSHIP_STATUSES,
  MARITAL_STATUS,
} = require("./memberDomainConstants");
const {
  RESULT,
  updateMemberProfile,
  manageChurchId,
  setPortalAccessStatus,
  setMembershipStatus,
  listMemberAdminHistory,
  requestAuthorizedBranchTransfer,
} = require("./blessBoardMemberDomainService");

async function resolveAdminCapabilities(db, input, deps) {
  const authorize =
    (deps && deps.authorize) ||
    ((client, payload) =>
      require("./blessBoardRbacAuthorizationService").authorize(client, {
        permission: payload.permission,
        actor: { userId: payload.actorUserId },
        tenantContext: {
          organizationId: payload.organizationId,
          churchId: payload.churchId,
          primaryBranchId: payload.branchId || null,
        },
        resourceContext: {
          organizationId: payload.organizationId,
          churchId: payload.churchId,
          branchId: payload.branchId != null ? payload.branchId : null,
        },
      }));

  async function can(permission) {
    const authz = await authorize(db, {
      permission,
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: input.branchId || null,
    });
    return Boolean(authz && authz.allowed === true);
  }

  const [view, edit, block, manageChurchIdPerm, create] = await Promise.all([
    can(MEMBER_PERMISSION.VIEW),
    can(MEMBER_PERMISSION.EDIT),
    can(MEMBER_PERMISSION.BLOCK),
    can(MEMBER_PERMISSION.CHURCH_ID_MANAGE),
    can(MEMBER_PERMISSION.CREATE),
  ]);

  return {
    view,
    edit,
    block,
    manageChurchId: manageChurchIdPerm,
    create,
    // UI action visibility (routes still enforce).
    canEditMember: edit,
    canManageAccess: block,
    canChangeChurchId: manageChurchIdPerm,
    canTransferBranch: edit,
    canViewHistory: view,
    canDeactivateMembership: edit,
  };
}

function membershipLabel(status) {
  const key = String(status || "").toLowerCase();
  if (key === "active") return "Active Member";
  if (key === "inactive") return "Inactive";
  if (key === "transferred") return "Transferred";
  if (key === "former") return "Former Member";
  if (key === "deceased") return "Deceased";
  if (key === "pending") return "Probationary";
  if (key === "suspended") return "Suspended";
  return key || "—";
}

function portalLabel(status) {
  const key = String(status || PORTAL_ACCESS_STATUS.NOT_ACTIVATED).toLowerCase();
  if (key === "active") return "Portal Active";
  if (key === "blocked") return "Blocked";
  return "Not Activated";
}

function buildProfileModel(member, capabilities, extras) {
  const m = member || {};
  return {
    member: m,
    displayName:
      [m.firstName, m.lastName].filter(Boolean).join(" ").trim() || "Member",
    churchId: m.memberNumber || null,
    membershipStatus: m.status || m.membershipStatus || null,
    membershipLabel: membershipLabel(m.status || m.membershipStatus),
    portalAccessStatus: m.portalAccessStatus || PORTAL_ACCESS_STATUS.NOT_ACTIVATED,
    portalLabel: portalLabel(m.portalAccessStatus),
    capabilities: capabilities || {},
    maritalOptions: MARITAL_STATUS.slice(),
    membershipStatusOptions: CANONICAL_MEMBERSHIP_STATUSES.slice(),
    ...(extras || {}),
  };
}

async function submitEditMember(db, input, deps) {
  return updateMemberProfile(
    db,
    {
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: input.branchId,
      memberId: input.memberId,
      firstName: input.firstName,
      lastName: input.lastName,
      preferredName: input.preferredName,
      email: input.email,
      phone: input.phone,
      phoneVerified: input.phoneVerified === true,
      dateOfBirth: input.dateOfBirth,
      occupation: input.occupation,
      maritalStatus: input.maritalStatus,
      numberOfChildren: input.numberOfChildren,
      address: input.address,
      nextOfKin: input.nextOfKin,
    },
    deps
  );
}

async function submitChurchIdChange(db, input, deps) {
  return manageChurchId(
    db,
    {
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: input.branchId,
      memberId: input.memberId,
      memberNumber: input.memberNumber,
      reason: input.reason,
    },
    deps
  );
}

async function submitPortalAccess(db, input, deps) {
  return setPortalAccessStatus(
    db,
    {
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: input.branchId,
      memberId: input.memberId,
      portalAccessStatus: input.portalAccessStatus,
      reason: input.reason,
    },
    deps
  );
}

async function submitMembershipStatus(db, input, deps) {
  return setMembershipStatus(
    db,
    {
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: input.branchId,
      memberId: input.memberId,
      membershipStatus: input.membershipStatus,
      reason: input.reason,
    },
    deps
  );
}

async function submitBranchTransfer(db, input, deps) {
  return requestAuthorizedBranchTransfer(
    db,
    {
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: input.branchId,
      memberId: input.memberId,
      toBranchId: input.toBranchId,
      reason: input.reason,
      tenant: input.tenant,
    },
    deps
  );
}

async function loadMemberHistory(db, input, deps) {
  return listMemberAdminHistory(db, input, deps);
}

module.exports = {
  RESULT,
  MEMBER_PERMISSION,
  resolveAdminCapabilities,
  buildProfileModel,
  membershipLabel,
  portalLabel,
  submitEditMember,
  submitChurchIdChange,
  submitPortalAccess,
  submitMembershipStatus,
  submitBranchTransfer,
  loadMemberHistory,
};
