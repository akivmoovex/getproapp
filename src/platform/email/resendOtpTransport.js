"use strict";

/**
 * OTP email transport over the shared Resend adapter.
 * This sends a message. It does not store, expire, or verify a challenge.
 */

const { createResendAdapter } = require("./resendEmailAdapter");
const { resolveProductSender, senderProfile } = require("./resendSenderCatalog");
const { verificationTemplate } = require("./transactionalTemplates");

const PRODUCT_LABEL = Object.freeze({
  blessboard: "BlessBoard",
  activeclinic: "ActiveClinic",
  pronline: "PROnline",
});

function qaRecipientAllowlist(env) {
  return new Set(
    String((env && env.GETPRO_RESEND_QA_RECIPIENTS) || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function assertQaRecipientAllowed(env, destination) {
  const profile = senderProfile(env);
  if (profile !== "hosted-qa") return { ok: true, reason: "production_profile" };
  const allow = qaRecipientAllowlist(env);
  if (allow.size === 0) {
    return { ok: false, reason: "qa_recipient_allowlist_missing" };
  }
  const email = String(destination || "")
    .trim()
    .toLowerCase();
  if (!email || !allow.has(email)) {
    return { ok: false, reason: "qa_recipient_not_allowlisted" };
  }
  return { ok: true, reason: "allowlisted" };
}

/**
 * Fail-closed Resend OTP preflight. Does not call the network and does not
 * invent dashboard verification — only reports configured allowlist state.
 */
function diagnoseResendOtpTransport(env, productCode) {
  const source = env || {};
  const routed = resolveProductSender(productCode, source);
  const apiKeyConfigured = Boolean(String(source.RESEND_API_KEY || "").trim());
  const profile = senderProfile(source);
  const qaAllowlistConfigured = qaRecipientAllowlist(source).size > 0;
  const blockers = [];
  if (!routed.ok) blockers.push(routed.reason || "sender_not_ready");
  if (!apiKeyConfigured) blockers.push("missing_api_key");
  if (profile === "hosted-qa" && !qaAllowlistConfigured) {
    blockers.push("qa_recipient_allowlist_missing");
  }
  return Object.freeze({
    ok: blockers.length === 0,
    productCode: routed.product || String(productCode || "").trim().toLowerCase() || "missing",
    apiKeyConfigured,
    senderOk: routed.ok === true,
    senderReason: routed.reason || "unknown",
    senderProfile: routed.profile || profile,
    senderDomain: routed.sender ? routed.sender.domain : null,
    qaRecipientAllowlistConfigured: qaAllowlistConfigured,
    blockers: Object.freeze(blockers),
    liveSendAuthorized: false,
  });
}

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
    const preflight = diagnoseResendOtpTransport(source, input.productCode);
    if (!preflight.ok) {
      return {
        ok: false,
        reason: preflight.blockers[0] || "resend_preflight_failed",
        retryable: false,
        diagnostic: {
          apiKeyConfigured: preflight.apiKeyConfigured,
          senderReason: preflight.senderReason,
          senderDomain: preflight.senderDomain,
        },
      };
    }
    const routed = resolveProductSender(input.productCode, source);
    if (!routed.ok) {
      return { ok: false, reason: routed.reason, retryable: false };
    }
    const apiKey = String(source.RESEND_API_KEY || "").trim();
    if (!apiKey) return { ok: false, reason: "missing_api_key", retryable: false };
    const recipientGate = assertQaRecipientAllowed(source, input.destination);
    if (!recipientGate.ok) {
      return { ok: false, reason: recipientGate.reason, retryable: false };
    }
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
  diagnoseResendOtpTransport,
  assertQaRecipientAllowed,
  qaRecipientAllowlist,
};
