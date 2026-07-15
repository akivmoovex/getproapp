"use strict";

/**
 * Growth billing collection / restricted-mode helpers.
 *
 * Automated dunning MUST NOT run until payment provider is integrated and
 * billing_dunning_enabled + billing_payment_provider_enabled are true.
 */

const {
  DUNNING_SCHEDULE,
  COLLECTION_STATES,
  RESTRICTED_MODE_PRESERVE,
  RESTRICTED_MODE_PAUSE,
} = require("../../church/blessBoardBillingCatalogue");

function normalizeCollectionState(state) {
  const s = String(state || "ok")
    .trim()
    .toLowerCase();
  return COLLECTION_STATES.includes(s) ? s : "ok";
}

function isBillingRestricted(organization) {
  return normalizeCollectionState(organization && organization.billing_collection_state) === "restricted";
}

function isBillingSuspendedCollection(organization) {
  return normalizeCollectionState(organization && organization.billing_collection_state) === "suspended";
}

/**
 * Whether automated failed-payment sequence may run.
 * Explicit dual flag — never on by default.
 */
function isDunningAutomationEnabled(organization) {
  return (
    organization &&
    organization.billing_payment_provider_enabled === true &&
    organization.billing_dunning_enabled === true
  );
}

/**
 * Resolve the dunning state for a given day offset after payment failure.
 * Does not mutate anything — readiness model only.
 */
function resolveDunningStateForDay(dayOffset) {
  const day = Math.max(0, Math.floor(Number(dayOffset) || 0));
  let matched = { day: 0, state: "ok", label: "No failure" };
  for (const step of DUNNING_SCHEDULE) {
    if (day >= step.day) matched = step;
  }
  return { ...matched, dayOffset: day };
}

/**
 * Capabilities guide for restricted mode (documentation + gate helpers).
 */
function restrictedModePolicy() {
  return {
    preserve: [...RESTRICTED_MODE_PRESERVE],
    pause: [...RESTRICTED_MODE_PAUSE],
  };
}

function mayCreateNewBranch(organization) {
  if (isBillingRestricted(organization) || isBillingSuspendedCollection(organization)) {
    return {
      allowed: false,
      code: "BILLING_RESTRICTED",
      message: "New branch creation is paused while billing is restricted.",
    };
  }
  return { allowed: true };
}

function mayRunGrowthAutomation(organization) {
  if (isBillingRestricted(organization) || isBillingSuspendedCollection(organization)) {
    return {
      allowed: false,
      code: "BILLING_RESTRICTED",
      message: "Growth automation is paused while billing is restricted.",
    };
  }
  return { allowed: true };
}

function maySendExternalMessaging(organization) {
  if (isBillingRestricted(organization) || isBillingSuspendedCollection(organization)) {
    return {
      allowed: false,
      code: "BILLING_RESTRICTED",
      message: "External messaging is paused while billing is restricted.",
    };
  }
  return { allowed: true };
}

/** Always allowed in restricted mode (preserve list). */
function mayAccessBilling(organization) {
  void organization;
  return { allowed: true };
}

function mayMemberLogin(organization) {
  // Restricted/collection flags never replace operational org status gates.
  // Restricted mode explicitly preserves member login.
  void organization;
  return { allowed: true };
}

/**
 * Advance collection state ONLY when automation flags are explicitly enabled.
 * Never auto-suspend existing orgs when provider is off.
 */
function evaluateDunningTransition(organization, opts = {}) {
  if (!isDunningAutomationEnabled(organization)) {
    return {
      advanced: false,
      reason: "Dunning automation is not enabled (payment provider required).",
      currentState: normalizeCollectionState(organization && organization.billing_collection_state),
    };
  }
  if (!organization.billing_payment_failed_at) {
    return {
      advanced: false,
      reason: "No payment failure timestamp.",
      currentState: normalizeCollectionState(organization.billing_collection_state),
    };
  }
  const failedAt = new Date(organization.billing_payment_failed_at);
  const now = opts.at instanceof Date ? opts.at : new Date();
  const dayOffset = Math.floor((now.getTime() - failedAt.getTime()) / 86400000);
  const resolved = resolveDunningStateForDay(dayOffset);
  return {
    advanced: true,
    dayOffset,
    proposedState: resolved.state,
    label: resolved.label,
    currentState: normalizeCollectionState(organization.billing_collection_state),
  };
}

module.exports = {
  DUNNING_SCHEDULE,
  normalizeCollectionState,
  isBillingRestricted,
  isBillingSuspendedCollection,
  isDunningAutomationEnabled,
  resolveDunningStateForDay,
  restrictedModePolicy,
  mayCreateNewBranch,
  mayRunGrowthAutomation,
  maySendExternalMessaging,
  mayAccessBilling,
  mayMemberLogin,
  evaluateDunningTransition,
};
