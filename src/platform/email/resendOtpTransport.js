"use strict";

/**
 * OTP email transport over the shared Resend adapter.
 * This sends a message. It does not store, expire, or verify a challenge.
 */

const { createResendAdapter } = require("./resendEmailAdapter");
const { resolveProductSender } = require("./resendSenderCatalog");
const { verificationTemplate } = require("./transactionalTemplates");

const PRODUCT_LABEL = Object.freeze({
  blessboard: "BlessBoard",
  activeclinic: "ActiveClinic",
  pronline: "PROnline",
});

function createResendOtpEmailTransport(env, deps) {
  const source = env || {};
  const options = deps || {};
  const sent = new Set();
  return async function sendResendOtp(payload) {
    const input = payload || {};
    const key = input.idempotencyKey ? String(input.idempotencyKey).slice(0, 256) : "";
    if (key && sent.has(key)) {
      return { ok: true, reason: "duplicate_suppressed", retryable: false };
    }
    const routed = resolveProductSender(input.productCode, source);
    if (!routed.ok) {
      return { ok: false, reason: routed.reason, retryable: false };
    }
    const apiKey = String(source.RESEND_API_KEY || "").trim();
    if (!apiKey) return { ok: false, reason: "missing_api_key", retryable: false };
    const label = PRODUCT_LABEL[routed.product] || "GetPro";
    const branded = verificationTemplate(label, input.text);
    const adapter = createResendAdapter({
      id: `otp_resend_${routed.product}`,
      apiKey,
      from: routed.fromHeader,
      fetchImpl: options.fetchImpl || input.fetchImpl,
      maxAttempts: 3,
      enforceApprovedSender: true,
      verifiedDomains: [routed.sender.domain],
      log: options.log,
    });
    const result = await adapter.send({
      recipient: input.destination,
      subject: branded.subject,
      text: branded.text,
      html: branded.html,
      templateKey: branded.templateKey,
      idempotencyKey: key,
    });
    if (result && result.accepted === true && key) sent.add(key);
    const retryable =
      result &&
      (result.providerCode === "rate_limited" ||
        result.providerCode === "timeout" ||
        result.providerCode === "provider_unavailable");
    return {
      ok: Boolean(result && result.accepted === true),
      reason: (result && result.providerCode) || "delivery_failed",
      retryable: Boolean(retryable) && result.providerCode !== "retry_exhausted",
      attempts: result && result.attempts,
    };
  };
}

module.exports = {
  createResendOtpEmailTransport,
};
