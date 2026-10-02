"use strict";

/**
 * V2.04 temporary-approved membership / portal lifecycle transitions
 * (PD-V204-BB-04 OPTION A). Normative product doc:
 * docs/product/V2_04_BB_MEMBERSHIP_PORTAL_STATUS_MATRIX.md
 */

const {
  MEMBERSHIP_STATUS,
  PORTAL_ACCESS_STATUS,
} = require("./memberDomainConstants");

/** Membership statuses that may not retain ordinary active portal access. */
const MEMBERSHIP_WITHOUT_ORDINARY_PORTAL = Object.freeze([
  MEMBERSHIP_STATUS.INACTIVE,
  MEMBERSHIP_STATUS.FORMER,
  MEMBERSHIP_STATUS.DECEASED,
  MEMBERSHIP_STATUS.TRANSFERRED,
]);

/**
 * Minimal allowed membership transitions (from → to[]).
 * Unlisted edges are forbidden for V2.04 admin setMembershipStatus.
 */
const MEMBERSHIP_TRANSITIONS = Object.freeze({
  [MEMBERSHIP_STATUS.ACTIVE]: Object.freeze([
    MEMBERSHIP_STATUS.INACTIVE,
    MEMBERSHIP_STATUS.FORMER,
    MEMBERSHIP_STATUS.DECEASED,
    MEMBERSHIP_STATUS.TRANSFERRED,
  ]),
  [MEMBERSHIP_STATUS.INACTIVE]: Object.freeze([
    MEMBERSHIP_STATUS.ACTIVE,
    MEMBERSHIP_STATUS.FORMER,
    MEMBERSHIP_STATUS.DECEASED,
  ]),
});

/**
 * Admin portal transitions only (activation owns NOT_ACTIVATED → ACTIVE).
 */
const PORTAL_ADMIN_TRANSITIONS = Object.freeze({
  [PORTAL_ACCESS_STATUS.ACTIVE]: Object.freeze([PORTAL_ACCESS_STATUS.BLOCKED]),
  [PORTAL_ACCESS_STATUS.BLOCKED]: Object.freeze([PORTAL_ACCESS_STATUS.ACTIVE]),
});

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isMembershipTransitionAllowed(fromStatus, toStatus) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (!from || !to || from === to) return false;
  const allowed = MEMBERSHIP_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

function isPortalAdminTransitionAllowed(fromStatus, toStatus) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (!from || !to || from === to) return false;
  const allowed = PORTAL_ADMIN_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

function membershipAllowsOrdinaryPortalAccess(membershipStatus) {
  return normalizeStatus(membershipStatus) === MEMBERSHIP_STATUS.ACTIVE;
}

/**
 * When membership leaves ACTIVE, clear ordinary active portal access.
 * BLOCKED stays BLOCKED; ACTIVE → NOT_ACTIVATED.
 */
function portalStatusAfterMembershipChange(membershipStatus, currentPortalStatus) {
  if (membershipAllowsOrdinaryPortalAccess(membershipStatus)) {
    return normalizeStatus(currentPortalStatus);
  }
  const portal = normalizeStatus(currentPortalStatus);
  if (portal === PORTAL_ACCESS_STATUS.BLOCKED) {
    return PORTAL_ACCESS_STATUS.BLOCKED;
  }
  if (portal === PORTAL_ACCESS_STATUS.ACTIVE) {
    return PORTAL_ACCESS_STATUS.NOT_ACTIVATED;
  }
  return portal || PORTAL_ACCESS_STATUS.NOT_ACTIVATED;
}

module.exports = {
  MEMBERSHIP_TRANSITIONS,
  PORTAL_ADMIN_TRANSITIONS,
  MEMBERSHIP_WITHOUT_ORDINARY_PORTAL,
  isMembershipTransitionAllowed,
  isPortalAdminTransitionAllowed,
  membershipAllowsOrdinaryPortalAccess,
  portalStatusAfterMembershipChange,
};
