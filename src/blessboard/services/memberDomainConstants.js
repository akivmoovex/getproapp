"use strict";

/**
 * BlessBoard V2.04 member domain constants.
 * Membership lifecycle and portal access are independent.
 */

const MEMBERSHIP_STATUS = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
  TRANSFERRED: "transferred",
  FORMER: "former",
  DECEASED: "deceased",
  // Legacy / intake (not self-serve membership):
  PENDING: "pending",
  SUSPENDED: "suspended",
  ARCHIVED: "archived",
});

const CANONICAL_MEMBERSHIP_STATUSES = Object.freeze([
  MEMBERSHIP_STATUS.ACTIVE,
  MEMBERSHIP_STATUS.INACTIVE,
  MEMBERSHIP_STATUS.TRANSFERRED,
  MEMBERSHIP_STATUS.FORMER,
  MEMBERSHIP_STATUS.DECEASED,
]);

const PORTAL_ACCESS_STATUS = Object.freeze({
  NOT_ACTIVATED: "not_activated",
  ACTIVE: "active",
  BLOCKED: "blocked",
});

const MEMBER_PERMISSION = Object.freeze({
  VIEW: "members.view",
  CREATE: "members.create",
  EDIT: "members.edit",
  BLOCK: "members.block",
  CHURCH_ID_MANAGE: "members.manage_church_id",
  ARCHIVE: "members.archive",
});

const MARITAL_STATUS = Object.freeze([
  "single",
  "married",
  "divorced",
  "widowed",
  "separated",
  "other",
  "prefer_not_to_say",
]);

/** Fields members may edit on their own profile (not Church ID, not official branch). */
const MEMBER_SELF_EDITABLE_FIELDS = Object.freeze([
  "preferredName",
  "dateOfBirth",
  "occupation",
  "maritalStatus",
  "numberOfChildren",
  "address",
  "nextOfKin",
  "phone",
  "email",
  "firstName",
  "lastName",
]);

module.exports = {
  MEMBERSHIP_STATUS,
  CANONICAL_MEMBERSHIP_STATUSES,
  PORTAL_ACCESS_STATUS,
  MEMBER_PERMISSION,
  MARITAL_STATUS,
  MEMBER_SELF_EDITABLE_FIELDS,
};
