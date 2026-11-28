"use strict";

/**
 * Platform-wide public booking admission.
 *
 * Safe default: closed. A clinic row cannot open it.
 * A future owner can open it only by setting GETPRO_AC_PUBLIC_BOOKING_ADMISSION
 * to the exact value "enabled" on a non-production deployment. This module
 * does not set that value and does not approve setting it.
 * Production deployment signals stay closed even when the value is present.
 * NODE_ENV=production alone does not count as production, because the testing
 * host runs Node in production mode.
 */

const ADMISSION_ENV = "GETPRO_AC_PUBLIC_BOOKING_ADMISSION";
const ADMISSION_VALUE = "enabled";

const PUBLIC_BOOKING_UNAVAILABLE_TITLE = "Booking not available";
const PUBLIC_BOOKING_UNAVAILABLE_LEAD =
  "Online booking is not currently offered. Online booking is not enabled for this clinic yet. Use the contact page to request an appointment — this page does not take live bookings.";

function sourceOf(env) {
  return env && typeof env === "object" ? env : process.env;
}

function normalized(env, key) {
  return String(sourceOf(env)[key] || "").trim().toLowerCase();
}

function isProductionDeployment(env) {
  if (normalized(env, "DEPLOYMENT_ENV") === "production") return true;
  if (normalized(env, "DATABASE_IDENTITY_ENV") === "production") return true;
  if (normalized(env, "EXPECTED_DATABASE_ENV") === "production") return true;
  return normalized(env, "PLATFORM_DEPLOYMENT_CODE") === "moovex-platform-production";
}

function publicBookingAdmissionEnabled(env) {
  if (isProductionDeployment(env)) return false;
  return String(sourceOf(env)[ADMISSION_ENV] || "").trim() === ADMISSION_VALUE;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ publicBookingEnabled?: boolean } | null} [clinic]
 */
function publicBookingAdmissionDecision(env, clinic) {
  if (!publicBookingAdmissionEnabled(env)) {
    return {
      admitted: false,
      reason: "platform_public_booking_disabled",
    };
  }
  if (!clinic || clinic.publicBookingEnabled !== true) {
    return {
      admitted: false,
      reason: "clinic_public_booking_disabled",
    };
  }
  return { admitted: true, reason: null };
}

module.exports = {
  ADMISSION_ENV,
  ADMISSION_VALUE,
  PUBLIC_BOOKING_UNAVAILABLE_TITLE,
  PUBLIC_BOOKING_UNAVAILABLE_LEAD,
  isProductionDeployment,
  publicBookingAdmissionEnabled,
  publicBookingAdmissionDecision,
};
