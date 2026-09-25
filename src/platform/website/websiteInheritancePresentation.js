"use strict";

/**
 * Thin shared wording adapter for product inheritance UIs (E1).
 * Does not invent a new inheritance model — only labels + action copy.
 */

const LABELS = Object.freeze({
  fromHeadquarters: "From Headquarters",
  returnToHeadquartersDefault: "Return to Headquarters Default",
  useDifferentVersion: "Use a different version for this branch",
  branchCustomizationActive: "Branch customization active",
  inheritedFromChurch: "Inherited from church",
  overriddenForBranch: "Overridden for this branch",
  notSupported: "Inheritance controls are not available for this field.",
});

/**
 * Map BlessBoard settings editor states onto Screen 7 wording.
 * @param {string} state
 * @param {{ parentChurchLabel?: string|null }} [ctx]
 */
function presentInheritanceState(state, ctx) {
  const raw = String(state || "").trim().toLowerCase();
  if (raw === "inherited") {
    return {
      supported: true,
      state: "inherited",
      badgeLabel: LABELS.fromHeadquarters,
      detail:
        ctx && ctx.parentChurchLabel
          ? `${LABELS.fromHeadquarters}: ${ctx.parentChurchLabel}`
          : LABELS.fromHeadquarters,
      primaryActionLabel: LABELS.useDifferentVersion,
      resetActionLabel: null,
    };
  }
  if (raw === "overridden") {
    return {
      supported: true,
      state: "overridden",
      badgeLabel: LABELS.branchCustomizationActive,
      detail: LABELS.overriddenForBranch,
      primaryActionLabel: null,
      resetActionLabel: LABELS.returnToHeadquartersDefault,
    };
  }
  if (raw === "hidden" || raw === "locked" || raw === "branch_record" || raw === "platform" || raw === "missing") {
    return {
      supported: true,
      state: raw,
      badgeLabel: null,
      detail: null,
      primaryActionLabel: null,
      resetActionLabel: raw === "hidden" ? LABELS.returnToHeadquartersDefault : null,
    };
  }
  return {
    supported: false,
    state: raw || "unsupported",
    badgeLabel: null,
    detail: LABELS.notSupported,
    primaryActionLabel: null,
    resetActionLabel: null,
  };
}

/**
 * ActiveClinic has no HQ→facility public-website inheritance model today.
 */
function presentActiveClinicInheritance() {
  return {
    supported: false,
    state: "not_supported",
    badgeLabel: null,
    detail: "Facility portals are not separate public websites on ActiveClinic.",
    primaryActionLabel: null,
    resetActionLabel: null,
  };
}

module.exports = {
  LABELS,
  presentInheritanceState,
  presentActiveClinicInheritance,
};
