"use strict";

/**
 * Platform outbound email transport gates + status (product-agnostic).
 * Products supply sender config keys and message builders; transport lives here.
 */

const { getDeploymentProfile } = require("../config/deploymentProfiles");

const PROVIDER = Object.freeze({
  UNAVAILABLE: "email_sending_unavailable",
  INVALID_RECIPIENT: "invalid_recipient",
  INVALID_INPUT: "invalid_input",
  REJECTED: "provider_rejected",
  THROWN: "provider_error",
  DUPLICATE: "duplicate_suppressed",
  CAPTURE: "capture",
  ADAPTER_NOT_SELECTED: "adapter_not_selected",
  ADAPTER_NOT_ENABLED: "adapter_not_enabled",
  NOT_PRODUCTION: "not_production",
  CONFIGURATION_ERROR: "configuration_error",
  AUTHENTICATION_FAILED: "authentication_failed",
  PROVIDER_UNAVAILABLE: "provider_unavailable",
  RATE_LIMITED: "rate_limited",
  REQUEST_REJECTED: "request_rejected",
  UNKNOWN: "unknown_provider_error",
  RESEND: "resend",
});

const REVIEW_DELIVERY = Object.freeze({
  SENDING_UNAVAILABLE: "sending_unavailable",
  QUEUED: "queued",
  SENT: "sent",
  FAILED: "failed",
});

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

/** Default env keys — AC ACTIVECLINIC_* remain supported for compatibility. */
const DEFAULT_SENDER_ENV_KEYS = Object.freeze({
  adapterKeys: ["EMAIL_DELIVERY_ADAPTER", "ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER"],
  fromEmailKeys: ["EMAIL_FROM", "ACTIVECLINIC_EMAIL_FROM"],
  fromNameKeys: ["EMAIL_FROM_NAME", "ACTIVECLINIC_EMAIL_FROM_NAME"],
  replyToKeys: ["EMAIL_REPLY_TO", "ACTIVECLINIC_EMAIL_REPLY_TO"],
});

function envLower(env, key) {
  const source = env && typeof env === "object" ? env : process.env;
  return String((source && source[key]) || "").trim().toLowerCase();
}

function firstEnvValue(source, keys) {
  for (const key of keys || []) {
    const raw = String((source && source[key]) || "").trim();
    if (raw) return raw;
  }
  return "";
}

function adapterNameFromEnv(source, senderKeys) {
  const keys = (senderKeys && senderKeys.adapterKeys) || DEFAULT_SENDER_ENV_KEYS.adapterKeys;
  return firstEnvValue(source, keys).toLowerCase();
}

function databaseUrlLooksLocal(source) {
  const raw = String(
    (source && (source.DATABASE_URL || source.GETPRO_DATABASE_URL)) || ""
  ).trim();
  if (!raw) return false;
  try {
    const host = String(new URL(raw).hostname || "").toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return /@127\.0\.0\.1(?:[:/[]|$)|@localhost(?:[:/[]|$)|@\[::1\]/i.test(raw);
  }
}

function productionIdentityConfirmed(source) {
  const nodeEnv = envLower(source, "NODE_ENV");
  const deploymentEnv = envLower(source, "DEPLOYMENT_ENV");
  const identityEnv = envLower(source, "DATABASE_IDENTITY_ENV");
  if (
    nodeEnv === "test" ||
    nodeEnv === "development" ||
    nodeEnv === "testing"
  ) {
    return false;
  }
  if (nodeEnv !== "production" || deploymentEnv !== "production") {
    return false;
  }
  if (identityEnv && identityEnv !== "production") {
    return false;
  }
  if (databaseUrlLooksLocal(source)) {
    return false;
  }
  const profile = getDeploymentProfile(source);
  if (profile && profile.deploymentEnvironment !== "production") {
    return false;
  }
  const code = String((source && source.PLATFORM_DEPLOYMENT_CODE) || "")
    .trim()
    .toLowerCase();
  if (
    code &&
    (code.includes("testing") ||
      code.includes("staging") ||
      code.includes("rehearsal"))
  ) {
    return false;
  }
  return true;
}

/**
 * @param {object} env
 * @param {typeof DEFAULT_SENDER_ENV_KEYS} [senderKeys]
 */
function readResendSenderConfig(env, senderKeys) {
  const source = env && typeof env === "object" ? env : process.env;
  const keys = { ...DEFAULT_SENDER_ENV_KEYS, ...(senderKeys || {}) };
  const apiKey = String((source && source.RESEND_API_KEY) || "").trim();
  const fromEmail = firstEnvValue(source, keys.fromEmailKeys).toLowerCase();
  const fromName = firstEnvValue(source, keys.fromNameKeys)
    .replace(/[\r\n<>]/g, "")
    .slice(0, 80);
  const replyToRaw = firstEnvValue(source, keys.replyToKeys);
  const replyTo = replyToRaw ? replyToRaw.toLowerCase() : "";
  if (!apiKey || !fromEmail || !EMAIL_RE.test(fromEmail)) {
    return { ok: false, reason: PROVIDER.CONFIGURATION_ERROR };
  }
  if (replyTo && !EMAIL_RE.test(replyTo)) {
    return { ok: false, reason: PROVIDER.CONFIGURATION_ERROR };
  }
  const fromHeader = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  return {
    ok: true,
    apiKey,
    fromEmail,
    fromName: fromName || "",
    fromHeader,
    replyTo: replyTo || "",
  };
}

/**
 * Live transport is allowed only in real hosted production with explicit Resend
 * selection and complete sender config. Credential env vars alone never enable sending.
 *
 * @param {object} env
 * @param {typeof DEFAULT_SENDER_ENV_KEYS} [senderKeys]
 */
function liveEmailTransportDecision(env, senderKeys) {
  const source = env && typeof env === "object" ? env : process.env;
  const adapterName = adapterNameFromEnv(source, senderKeys);

  if (!productionIdentityConfirmed(source)) {
    return { allowed: false, reason: PROVIDER.NOT_PRODUCTION, adapterName: adapterName || null };
  }
  if (!adapterName || adapterName === "none" || adapterName === "unavailable") {
    return { allowed: false, reason: PROVIDER.ADAPTER_NOT_SELECTED, adapterName: adapterName || null };
  }
  if (adapterName !== "resend") {
    return { allowed: false, reason: PROVIDER.ADAPTER_NOT_ENABLED, adapterName };
  }
  const config = readResendSenderConfig(source, senderKeys);
  if (!config.ok) {
    return { allowed: false, reason: PROVIDER.CONFIGURATION_ERROR, adapterName };
  }
  return { allowed: true, reason: null, adapterName: "resend" };
}

function resolveOutboundEmailStatus(env, senderKeys) {
  const source = env && typeof env === "object" ? env : process.env;
  const decision = liveEmailTransportDecision(source, senderKeys);
  if (decision.allowed && decision.adapterName === "resend") {
    return { state: "available", label: "Resend available for production" };
  }
  if (decision.reason === PROVIDER.CONFIGURATION_ERROR) {
    return { state: "incomplete", label: "Resend selected but incomplete" };
  }
  if (decision.reason === PROVIDER.ADAPTER_NOT_ENABLED) {
    return { state: "unavailable", label: "Unavailable (adapter_not_enabled)" };
  }
  if (decision.reason === PROVIDER.ADAPTER_NOT_SELECTED) {
    return { state: "not_configured", label: "Email not configured" };
  }
  return { state: "disabled", label: "Email disabled in this environment" };
}

function createUnavailableAdapter(id) {
  return Object.freeze({
    id: id || "platform_email_unavailable",
    sendingAvailable: false,
    async send() {
      return {
        sendingAvailable: false,
        accepted: false,
        delivered: false,
        status: REVIEW_DELIVERY.SENDING_UNAVAILABLE,
        providerCode: PROVIDER.UNAVAILABLE,
      };
    },
  });
}

function createCaptureAdapter(store, id) {
  const captured = Array.isArray(store) ? store : [];
  const seen = new Set();
  return {
    id: id || "platform_email_capture",
    sendingAvailable: true,
    captured,
    async send(envelope) {
      const key = envelope && envelope.idempotencyKey ? String(envelope.idempotencyKey) : "";
      if (key && seen.has(key)) {
        return {
          sendingAvailable: true,
          accepted: true,
          delivered: false,
          status: REVIEW_DELIVERY.QUEUED,
          providerCode: PROVIDER.DUPLICATE,
          duplicate: true,
        };
      }
      if (key) seen.add(key);
      captured.push({
        templateKey: envelope && envelope.templateKey,
        recipient: envelope && envelope.recipient,
        ctaPath: envelope && envelope.ctaPath,
        ctaUrl: envelope && envelope.ctaUrl,
        idempotencyKey: key || null,
        subject: envelope && envelope.subject,
        activationUrl: envelope && envelope.activationUrl ? String(envelope.activationUrl) : null,
        resetUrl: envelope && envelope.resetUrl ? String(envelope.resetUrl) : null,
      });
      return {
        sendingAvailable: true,
        accepted: true,
        delivered: false,
        status: REVIEW_DELIVERY.QUEUED,
        providerCode: PROVIDER.CAPTURE,
      };
    },
  };
}

function createRejectingAdapter(id) {
  return Object.freeze({
    id: id || "platform_email_rejecting",
    sendingAvailable: true,
    async send() {
      return {
        sendingAvailable: true,
        accepted: false,
        delivered: false,
        status: REVIEW_DELIVERY.FAILED,
        providerCode: PROVIDER.REJECTED,
      };
    },
  });
}

function createThrowingAdapter(id) {
  return Object.freeze({
    id: id || "platform_email_throwing",
    sendingAvailable: true,
    async send() {
      throw new Error("simulated_provider_throw");
    },
  });
}

function mapAdapterResult(result, sendingAvailableFlag) {
  if (!result) {
    return {
      sendingAvailable: Boolean(sendingAvailableFlag),
      accepted: false,
      delivered: false,
      status: sendingAvailableFlag ? REVIEW_DELIVERY.FAILED : REVIEW_DELIVERY.SENDING_UNAVAILABLE,
      providerCode: sendingAvailableFlag ? PROVIDER.THROWN : PROVIDER.UNAVAILABLE,
    };
  }
  const accepted = result.accepted === true || result.accepted_for_processing === true;
  const delivered = result.delivered === true;
  let status = result.status ? String(result.status) : null;
  if (!status) {
    if (delivered) status = REVIEW_DELIVERY.SENT;
    else if (accepted) status = REVIEW_DELIVERY.QUEUED;
    else if (result.sendingAvailable === false) status = REVIEW_DELIVERY.SENDING_UNAVAILABLE;
    else status = REVIEW_DELIVERY.FAILED;
  }
  return {
    sendingAvailable: result.sendingAvailable === true,
    accepted,
    delivered,
    status,
    providerCode: result.providerCode || result.code || PROVIDER.UNAVAILABLE,
    duplicate: result.duplicate === true,
    providerMessageId: result.providerMessageId || null,
  };
}

module.exports = {
  PROVIDER,
  REVIEW_DELIVERY,
  EMAIL_RE,
  DEFAULT_SENDER_ENV_KEYS,
  envLower,
  adapterNameFromEnv,
  productionIdentityConfirmed,
  readResendSenderConfig,
  liveEmailTransportDecision,
  resolveOutboundEmailStatus,
  createUnavailableAdapter,
  createCaptureAdapter,
  createRejectingAdapter,
  createThrowingAdapter,
  mapAdapterResult,
};
