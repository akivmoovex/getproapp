"use strict";

/**
 * Honest delivery-channel availability for member messaging.
 * Do not claim Email/SMS/Push delivery without a real provider.
 */

function isMemberEmailDeliveryConfigured(env) {
  const source = env && typeof env === "object" ? env : process.env;
  const flag = String(source.BLESSBOARD_MEMBER_EMAIL_DELIVERY_ENABLED || "")
    .trim()
    .toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function isMemberSmsDeliveryConfigured(env) {
  const source = env && typeof env === "object" ? env : process.env;
  const flag = String(source.BLESSBOARD_MEMBER_SMS_DELIVERY_ENABLED || "")
    .trim()
    .toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function isMemberPushDeliveryConfigured(env) {
  const source = env && typeof env === "object" ? env : process.env;
  const flag = String(source.BLESSBOARD_MEMBER_PUSH_DELIVERY_ENABLED || "")
    .trim()
    .toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function getDeliveryChannelAvailability(env) {
  const email = isMemberEmailDeliveryConfigured(env);
  const sms = isMemberSmsDeliveryConfigured(env);
  const push = isMemberPushDeliveryConfigured(env);
  return Object.freeze({
    inApp: Object.freeze({
      available: true,
      label: "In-app",
      reason: null,
    }),
    email: Object.freeze({
      available: email,
      label: email ? "Email" : "Email (not configured)",
      reason: email
        ? null
        : "Outbound email delivery is not configured for member messaging.",
    }),
    sms: Object.freeze({
      available: sms,
      label: sms ? "SMS" : "SMS (not available yet)",
      reason: sms
        ? null
        : "SMS delivery is not configured for member messaging.",
    }),
    push: Object.freeze({
      available: push,
      label: push ? "Push" : "Push (not available yet)",
      reason: push
        ? null
        : "Push notifications are not available yet. No device registrations are supported.",
    }),
  });
}

module.exports = {
  isMemberEmailDeliveryConfigured,
  isMemberSmsDeliveryConfigured,
  isMemberPushDeliveryConfigured,
  getDeliveryChannelAvailability,
};
