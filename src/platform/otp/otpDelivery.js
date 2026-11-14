"use strict";

/**
 * Delivery message and retry policy.
 * The message is a verification code only. It must not carry church or clinical data.
 */

const { OTP_POLICY } = require("./otpPolicy");

const MESSAGE_RE = /^Your verification code is \d{4,6}\. It expires in 5 minutes\.$/;

function buildOtpMessage(code) {
  const value = String(code || "");
  if (!/^\d{4,6}$/.test(value)) {
    throw Object.assign(new Error("otp_message_rejected"), { code: "otp_message_rejected" });
  }
  const text = `Your verification code is ${value}. It expires in 5 minutes.`;
  if (!MESSAGE_RE.test(text)) {
    throw Object.assign(new Error("otp_message_rejected"), { code: "otp_message_rejected" });
  }
  return {
    subject: "Verification code",
    text,
  };
}

function sanitizeDelivery(raw) {
  const status = raw && raw.publicStatus;
  const publicStatus = status === "not_activated" || status === "accepted" || status === "failed"
    ? status
    : "failed";
  const reason = String((raw && raw.reason) || "delivery_failed")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .replace(/\d{4,6}/g, "")
    .slice(0, 64);
  return {
    ok: raw && raw.ok === true && publicStatus === "accepted",
    publicStatus,
    reason: reason || "delivery_failed",
    attempts: Math.max(1, Number(raw && raw.attempts) || 1),
    providerName: String((raw && raw.providerName) || "unconfigured")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 32) || "unconfigured",
  };
}

/**
 * Retry timeout and unavailable responses. Do not retry a definite rejection.
 * @param {(attempt: number) => Promise<object>} send
 */
async function deliverWithPolicy(send) {
  let last = { ok: false, reason: "delivery_failed", publicStatus: "failed", retryable: false };
  for (let attempt = 1; attempt <= OTP_POLICY.deliveryAttempts; attempt += 1) {
    try {
      const result = await send(attempt);
      last = result || last;
      if (last.ok === true) {
        return sanitizeDelivery({ ...last, attempts: attempt, publicStatus: "accepted" });
      }
      if (last.retryable !== true) {
        return sanitizeDelivery({ ...last, attempts: attempt, publicStatus: "failed" });
      }
    } catch (err) {
      const retryable = Boolean(err && (err.code === "timeout" || err.name === "TimeoutError"));
      last = {
        ok: false,
        reason: retryable ? "timeout" : "delivery_failed",
        publicStatus: "failed",
        retryable,
        providerName: last.providerName,
      };
      if (!retryable) return sanitizeDelivery({ ...last, attempts: attempt });
    }
  }
  return sanitizeDelivery({ ...last, attempts: OTP_POLICY.deliveryAttempts, publicStatus: "failed" });
}

module.exports = {
  MESSAGE_RE,
  buildOtpMessage,
  sanitizeDelivery,
  deliverWithPolicy,
};
