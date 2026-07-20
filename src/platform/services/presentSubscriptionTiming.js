"use strict";

/**
 * Shared subscription timing labels for platform-admin (trial / grace).
 * Grace = Growth past_due with future ends_at (see growthTrialExpiryService).
 */

const ACTIVE_FOR_ENTITLEMENT = Object.freeze(["active", "trialing", "past_due"]);

/**
 * @param {{
 *   status?: string|null,
 *   planKey?: string|null,
 *   endsAt?: Date|string|null,
 *   startsAt?: Date|string|null,
 *   at?: Date|string|null,
 * }} input
 */
function presentSubscriptionTiming(input) {
  const status = String((input && input.status) || "")
    .trim()
    .toLowerCase();
  const planKey = String((input && input.planKey) || "")
    .trim()
    .toLowerCase();
  const at = parseDate(input && input.at) || new Date();
  const endsAt = parseDate(input && input.endsAt);
  const startsAt = parseDate(input && input.startsAt);

  const entitled =
    ACTIVE_FOR_ENTITLEMENT.includes(status) &&
    (!startsAt || startsAt.getTime() <= at.getTime()) &&
    (!endsAt || endsAt.getTime() > at.getTime());

  let timingKind = null;
  let timingLabel = null;
  let timingEndsAt = endsAt ? endsAt.toISOString() : null;

  if (status === "trialing" && endsAt && endsAt.getTime() > at.getTime()) {
    timingKind = "trial";
    timingLabel = "Trial ends";
  } else if (
    status === "past_due" &&
    planKey === "growth" &&
    endsAt &&
    endsAt.getTime() > at.getTime()
  ) {
    timingKind = "grace";
    timingLabel = "Grace ends";
  } else if (status === "past_due" && endsAt && endsAt.getTime() > at.getTime()) {
    timingKind = "past_due_window";
    timingLabel = "Window ends";
  } else if (endsAt && status === "active") {
    timingKind = "scheduled_end";
    timingLabel = "Ends";
  }

  let statusLabel = status.replace(/_/g, " ") || null;
  if (status === "past_due" && timingKind === "grace") {
    statusLabel = "Grace";
  } else if (status === "trialing") {
    statusLabel = "Trialing";
  } else if (status === "past_due") {
    statusLabel = "Past due";
  } else if (status === "active") {
    statusLabel = "Active";
  }

  return {
    status,
    statusLabel,
    planKey: planKey || null,
    entitled: Boolean(entitled),
    entitlementState: entitled ? "entitled" : "not_entitled",
    timingKind,
    timingLabel,
    timingEndsAt,
    endsAt: timingEndsAt,
    startsAt: startsAt ? startsAt.toISOString() : null,
  };
}

function parseDate(raw) {
  if (raw == null || raw === "") return null;
  const d = raw instanceof Date ? new Date(raw.getTime()) : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = {
  ACTIVE_FOR_ENTITLEMENT,
  presentSubscriptionTiming,
};
