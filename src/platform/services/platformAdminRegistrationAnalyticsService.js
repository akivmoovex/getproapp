"use strict";

/**
 * Privacy-safe registration and onboarding analytics for the platform-admin dashboard.
 * Aggregate counts only — no PII, cookies, fingerprinting, or third-party tracking.
 * Time windows use UTC calendar days (platform canonical timezone).
 */

const repo = require("../repositories/platformAdminRepository");
const { planDisplayLabel } = require("../../blessboard/services/registrationPlanMapping");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
});

const ALLOWED_ANALYTICS_RANGES = Object.freeze([7, 30, 90]);
const DEFAULT_ANALYTICS_RANGE_DAYS = 7;
const TIMEZONE = "UTC";

/**
 * @param {unknown} raw
 * @returns {{ ok: true, days: number } | { ok: false, reason: string }}
 */
function normalizeAnalyticsRangeDays(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, days: DEFAULT_ANALYTICS_RANGE_DAYS };
  }
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || !ALLOWED_ANALYTICS_RANGES.includes(n)) {
    return { ok: false, reason: "analytics_range" };
  }
  return { ok: true, days: n };
}

/**
 * Half-open UTC window ending at the start of the next UTC day after "now".
 * rangeEndExclusive = start of tomorrow UTC; rangeStart = end - days.
 * @param {number} days
 * @param {Date} [now]
 */
function buildUtcRangeWindow(days, now = new Date()) {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
  );
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    rangeDays: days,
    rangeStart: start.toISOString(),
    rangeEndExclusive: end.toISOString(),
    timezone: TIMEZONE,
  };
}

/**
 * @param {number|null|undefined} seconds
 */
function formatMedianDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return { seconds: null, durationLabel: null };
  }
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return { seconds, durationLabel: `${totalMinutes} min` };
  }
  const hours = Math.round(totalMinutes / 60);
  if (hours < 48) {
    return { seconds, durationLabel: `${hours} h` };
  }
  const days = Math.round(hours / 24);
  return { seconds, durationLabel: `${days} d` };
}

/**
 * @param {number|null|undefined} rate
 */
function formatCompletionRate(rate) {
  if (rate == null || !Number.isFinite(rate)) return null;
  return Math.round(rate * 1000) / 10; // one decimal percent
}

/**
 * Map repository aggregates into privacy-safe dashboard metrics.
 * @param {object} raw
 * @param {{ rangeDays: number, rangeStart: string, rangeEndExclusive: string, timezone: string }} window
 */
function mapAnalyticsMetrics(raw, window) {
  const byPlan = raw.submissionsByPlan || {};
  const completionRate = formatCompletionRate(raw.registrationCompletionRate);

  return {
    window,
    empty: Number(raw.submissionsTotal || 0) === 0 &&
      Number(raw.growthTrialStarts || 0) === 0 &&
      Number(raw.onboardingStarted || 0) === 0 &&
      Number(raw.onboardingCompleted || 0) === 0 &&
      Number(raw.growthDowngrades || 0) === 0 &&
      Number(raw.growthTrialConversionsRecorded || 0) === 0,
    metrics: {
      submissionsByPlan: {
        key: "submissions_by_plan",
        available: true,
        label: "Registration submissions by plan",
        definition:
          "Applications created in the window, grouped by public selected_plan (Foundation, Growth, Network).",
        values: [
          {
            plan: "foundation",
            planLabel: planDisplayLabel("foundation") || "Foundation",
            count: Number(byPlan.foundation) || 0,
          },
          {
            plan: "growth",
            planLabel: planDisplayLabel("growth") || "Growth",
            count: Number(byPlan.growth) || 0,
          },
          {
            plan: "network",
            planLabel: planDisplayLabel("network") || "Network",
            count: Number(byPlan.network) || 0,
          },
        ],
        total: Number(raw.submissionsTotal) || 0,
      },
      registrationCompletionRate: {
        key: "registration_completion_rate",
        available: true,
        label: "Registration completion rate",
        definition:
          "Among Foundation and Growth applications created in the window, share with provisioning_status=provisioned. Network contact requests are excluded (not an automatic completion path).",
        valuePercent: completionRate,
        numerator: Number(raw.autoProvisionSuccess) || 0,
        denominator: Number(raw.autoPlanSubmissions) || 0,
      },
      autoProvisionOutcomes: {
        key: "auto_provision_outcomes",
        available: true,
        label: "Automatic provision outcomes",
        definition:
          "Foundation/Growth applications created in the window that are currently provisioned or provisioning_failed.",
        success: Number(raw.autoProvisionSuccess) || 0,
        failed: Number(raw.autoProvisionFailed) || 0,
      },
      reviewRequired: {
        key: "review_required",
        available: true,
        label: "Review-required count",
        definition:
          "Applications created in the window with application_status=duplicate_review or risk_decision=review_required.",
        value: Number(raw.reviewRequired) || 0,
      },
      networkContactRequests: {
        key: "network_contact_requests",
        available: true,
        label: "Network contact-request count",
        definition:
          "Applications created in the window with selected_plan=network and support_requested=true.",
        value: Number(raw.networkContactRequests) || 0,
      },
      growthTrialStarts: {
        key: "growth_trial_starts",
        available: true,
        label: "Growth trial starts",
        definition:
          "BlessBoard Growth subscriptions whose starts_at falls in the window (trial start timestamp).",
        value: Number(raw.growthTrialStarts) || 0,
      },
      growthTrialConversions: {
        key: "growth_trial_conversions",
        available: true,
        label: "Growth trial conversions (recorded)",
        definition:
          "Count of billing.paid_activated audit events in the window with source/reason_code=trial_conversion.",
        value: Number(raw.growthTrialConversionsRecorded) || 0,
        note:
          "Only platform-admin recorded trial_conversion activations. Provider payment-processor conversions are not tracked.",
      },
      providerBillingConversions: {
        key: "provider_billing_conversions",
        available: false,
        label: "Provider billing conversions",
        definition: "Card/processor webhook conversions.",
        value: null,
        unavailableReason:
          "BlessBoard V5 does not ingest payment-provider conversion webhooks. This metric is unavailable.",
      },
      growthDowngrades: {
        key: "growth_downgrades",
        available: true,
        label: "Growth downgrades",
        definition:
          "Count of subscription.trial_downgraded_to_foundation audit events in the window.",
        value: Number(raw.growthDowngrades) || 0,
      },
      onboardingStarted: {
        key: "onboarding_started",
        available: true,
        label: "Onboarding started",
        definition:
          "organization_onboarding rows with onboarding_started_at in the window.",
        value: Number(raw.onboardingStarted) || 0,
      },
      onboardingCompleted: {
        key: "onboarding_completed",
        available: true,
        label: "Onboarding completed",
        definition:
          "organization_onboarding rows with onboarding_completed_at in the window.",
        value: Number(raw.onboardingCompleted) || 0,
      },
      medianRegistrationToOnboardingComplete: {
        key: "median_registration_to_onboarding_complete",
        available: true,
        label: "Median time registration → onboarding complete",
        definition:
          "Median (onboarding_completed_at − application.created_at) for linked applications whose onboarding completed in the window.",
        ...formatMedianDuration(raw.medianSecondsRegistrationToOnboardingComplete),
      },
      medianNetworkRequestToFirstContact: {
        key: "median_network_request_to_first_contact",
        available: true,
        label: "Median time Network request → first support contact",
        definition:
          "Median (first_contacted_at − created_at) for Network support applications whose first_contacted_at falls in the window.",
        ...formatMedianDuration(raw.medianSecondsNetworkRequestToFirstContact),
      },
    },
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{ analyticsRange?: unknown }} [input]
 */
async function getPlatformAdminRegistrationAnalytics(db, input = {}) {
  const normalized = normalizeAnalyticsRangeDays(
    input.analyticsRange != null ? input.analyticsRange : input.analytics_range
  );
  if (!normalized.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      analytics: null,
      reason: normalized.reason,
    };
  }
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      analytics: null,
      reason: "database required",
    };
  }

  try {
    const window = buildUtcRangeWindow(normalized.days);
    const raw = await repo.countRegistrationOnboardingAnalytics(db, {
      rangeStart: window.rangeStart,
      rangeEndExclusive: window.rangeEndExclusive,
    });
    return {
      ok: true,
      status: STATUS.OK,
      analytics: mapAnalyticsMetrics(raw, window),
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      analytics: null,
      reason: "lookup_error",
    };
  }
}

module.exports = {
  STATUS,
  ALLOWED_ANALYTICS_RANGES,
  DEFAULT_ANALYTICS_RANGE_DAYS,
  TIMEZONE,
  normalizeAnalyticsRangeDays,
  buildUtcRangeWindow,
  formatMedianDuration,
  formatCompletionRate,
  mapAnalyticsMetrics,
  getPlatformAdminRegistrationAnalytics,
};
