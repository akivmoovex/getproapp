"use strict";

/**
 * OTP email transport over the shared Resend adapter.
 * This sends a message. It does not store, expire, or verify a challenge.
 */

const { createResendAdapter } = require("./resendEmailAdapter");
const { resolveProductSender, senderProfile } = require("./resendSenderCatalog");
const { verificationTemplate } = require("./transactionalTemplates");
const {
  QA_SENDER_EMAIL,
  QA_HTTP_ATTEMPT_LIMIT,
  isLiveAttemptBudget,
  classifyQaRecipientAllowlist,
  qaRecipientAllowlist,
  assertQaRecipientMembership,
  evaluateQaLiveDelivery,
  evaluateQaLiveDeliveryConfiguration,
} = require("../otp/otpQaLiveDelivery");

const PRODUCT_LABEL = Object.freeze({
  blessboard: "BlessBoard",
  activeclinic: "ActiveClinic",
  pronline: "PROnline",
});

function assertQaRecipientAllowed(env, destination) {
  const profile = senderProfile(env);
  if (profile !== "hosted-qa") return { ok: true, reason: "production_profile" };
  return assertQaRecipientMembership(env, destination);
}

/**
 * Fail-closed Resend OTP preflight. Does not call the network and does not
 * invent dashboard verification — only reports configured allowlist state.
 */
function diagnoseResendOtpTransport(env, productCode, deps) {
  const source = env || {};
  const options = deps || {};
  const routed = resolveProductSender(productCode, source);
  const apiKeyConfigured = Boolean(String(source.RESEND_API_KEY || "").trim());
  const profile = senderProfile(source);
  const recipients = classifyQaRecipientAllowlist(source);
  const qaAllowlistConfigured = recipients.ok === true;
  const blockers = [];
  if (!routed.ok) blockers.push(routed.reason || "sender_not_ready");
  if (!apiKeyConfigured) blockers.push("missing_api_key");
  if (profile === "hosted-qa" && !recipients.ok) blockers.push(recipients.reason);
  const live = evaluateQaLiveDeliveryConfiguration(source, {
    productCode,
    destination: options.destination,
    databaseIdentity: options.databaseIdentity,
    providerRequestsUsed: options.providerRequestsUsed,
  });
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
    liveSendAuthorized: live.authorized === true,
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
    const decision = await evaluateQaLiveDelivery(source, {
      productCode: input.productCode,
      destination: input.destination,
      purpose: input.purpose,
      databaseIdentityProbe: options.databaseIdentityProbe,
      attemptBudgetStore: options.attemptBudgetStore,
    });
    if (decision.authorized !== true) {
      return {
        ok: false,
        reason: decision.reasons[0] || "qa_live_delivery_not_authorized",
        retryable: false,
      };
    }
    if (!routed.sender || routed.sender.email !== QA_SENDER_EMAIL) {
      return { ok: false, reason: "sender_not_approved", retryable: false };
    }
    const store = options.attemptBudgetStore;
    if (!store || typeof store.tryReserve !== "function") {
      return { ok: false, reason: "provider_budget_missing", retryable: false };
    }
    if (!isLiveAttemptBudget(store)) {
      let reason = "provider_budget_not_durable";
      if (store.backend === "exclusive-slot-file" && typeof store.snapshot === "function") {
        try {
          const snap = store.snapshot();
          if (snap && snap.reason) reason = snap.reason;
        } catch {
          reason = "budget_storage_unavailable";
        }
      }
      return { ok: false, reason, retryable: false };
    }
    if (typeof store.snapshot === "function") {
      let snap = null;
      try {
        snap = store.snapshot();
      } catch {
        snap = { reason: "budget_storage_unavailable" };
      }
      if (!snap || snap.reason || Number(snap.used) >= QA_HTTP_ATTEMPT_LIMIT) {
        return {
          ok: false,
          reason: (snap && snap.reason) || "provider_budget_exhausted",
          retryable: false,
        };
      }
    }
    const impl = options.fetchImpl || globalThis.fetch;
    const fetchImpl = async (url, init) => {
      let reserved = null;
      try {
        reserved = store.tryReserve();
      } catch {
        reserved = { ok: false, reason: "budget_storage_unavailable" };
      }
      if (!reserved || reserved.ok !== true || reserved.confirmed === false) {
        const error = new Error((reserved && reserved.reason) || "provider_budget_exhausted");
        error.code = "provider_budget_exhausted";
        throw error;
      }
      if (typeof impl !== "function") {
        const error = new Error("provider_unavailable");
        error.code = "provider_unavailable";
        throw error;
      }
      return impl(url, init);
    };
    const maxAttempts = QA_HTTP_ATTEMPT_LIMIT;
    const label = PRODUCT_LABEL[routed.product] || "GetPro";
    const branded = verificationTemplate(label, input.text);
    const adapter = createResendAdapter({
      id: `otp_resend_${routed.product}`,
      apiKey,
      from: routed.fromHeader,
      fetchImpl,
      maxAttempts,
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
