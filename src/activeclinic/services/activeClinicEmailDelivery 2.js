"use strict";

/**
 * ActiveClinic-local transactional email delivery (Phase G + H2).
 * Unavailable by default. Resend HTTPS transport is selected only under full
 * production gates. Never logs mail bodies, activation tokens, or passwords.
 */

const { buildActiveClinicEmailMessage, TEMPLATE } = require("./activeClinicEmailMessages");
const { resolvePublicOrigin } = require("./activeClinicShareLinks");
const { getDeploymentProfile } = require("../../platform/config/deploymentProfiles");
const { createResendAdapter } = require("./activeClinicEmailResendAdapter");

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

const INVITE_DELIVERY = Object.freeze({
  LINK_GENERATED: "link_generated",
  QUEUED: "queued",
  SENT: "sent",
  FAILED: "failed",
  UNAVAILABLE: "unavailable",
});

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

function envLower(env, key) {
  const source = env && typeof env === "object" ? env : process.env;
  return String((source && source[key]) || "").trim().toLowerCase();
}

function adapterNameFromEnv(source) {
  return String(
    (source && (source.ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER || source.EMAIL_DELIVERY_ADAPTER)) || ""
  )
    .trim()
    .toLowerCase();
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

function readResendSenderConfig(env) {
  const source = env && typeof env === "object" ? env : process.env;
  const apiKey = String((source && source.RESEND_API_KEY) || "").trim();
  const fromEmail = String((source && source.ACTIVECLINIC_EMAIL_FROM) || "")
    .trim()
    .toLowerCase();
  const fromName = String((source && source.ACTIVECLINIC_EMAIL_FROM_NAME) || "")
    .trim()
    .replace(/[\r\n<>]/g, "")
    .slice(0, 80);
  const replyToRaw = String((source && source.ACTIVECLINIC_EMAIL_REPLY_TO) || "").trim();
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
 */
function liveEmailTransportDecision(env) {
  const source = env && typeof env === "object" ? env : process.env;
  const adapterName = adapterNameFromEnv(source);

  if (!productionIdentityConfirmed(source)) {
    return { allowed: false, reason: PROVIDER.NOT_PRODUCTION, adapterName: adapterName || null };
  }
  if (!adapterName || adapterName === "none" || adapterName === "unavailable") {
    return { allowed: false, reason: PROVIDER.ADAPTER_NOT_SELECTED, adapterName: adapterName || null };
  }
  if (adapterName !== "resend") {
    return { allowed: false, reason: PROVIDER.ADAPTER_NOT_ENABLED, adapterName };
  }
  const config = readResendSenderConfig(source);
  if (!config.ok) {
    return { allowed: false, reason: PROVIDER.CONFIGURATION_ERROR, adapterName };
  }
  return { allowed: true, reason: null, adapterName: "resend" };
}

function resolveOutboundEmailStatus(env) {
  const source = env && typeof env === "object" ? env : process.env;
  const decision = liveEmailTransportDecision(source);
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

function createUnavailableAdapter() {
  return Object.freeze({
    id: "activeclinic_email_unavailable",
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

function createCaptureAdapter(store) {
  const captured = Array.isArray(store) ? store : [];
  const seen = new Set();
  return {
    id: "activeclinic_email_capture",
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

function createRejectingAdapter() {
  return Object.freeze({
    id: "activeclinic_email_rejecting",
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

function createThrowingAdapter() {
  return Object.freeze({
    id: "activeclinic_email_throwing",
    sendingAvailable: true,
    async send() {
      throw new Error("simulated_provider_throw");
    },
  });
}

function resolveActiveClinicEmailAdapter(env, deps) {
  if (deps && deps.adapter && typeof deps.adapter.send === "function") {
    return deps.adapter;
  }
  const source = env && typeof env === "object" ? env : process.env;
  const decision = liveEmailTransportDecision(source);
  if (!decision.allowed || decision.adapterName !== "resend") {
    return createUnavailableAdapter();
  }
  const config = readResendSenderConfig(source);
  if (!config.ok) {
    return createUnavailableAdapter();
  }
  return createResendAdapter({
    apiKey: config.apiKey,
    from: config.fromHeader,
    replyTo: config.replyTo || null,
    fetchImpl: deps && deps.fetchImpl,
    log: deps && deps.log,
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

function toInviteDeliveryStatus(status) {
  if (status === REVIEW_DELIVERY.QUEUED) return INVITE_DELIVERY.QUEUED;
  if (status === REVIEW_DELIVERY.SENT) return INVITE_DELIVERY.SENT;
  if (status === REVIEW_DELIVERY.FAILED) return INVITE_DELIVERY.FAILED;
  if (status === REVIEW_DELIVERY.SENDING_UNAVAILABLE) return INVITE_DELIVERY.UNAVAILABLE;
  return INVITE_DELIVERY.LINK_GENERATED;
}

/**
 * Attempt one transactional email. Never throws. Never logs secrets.
 */
async function sendActiveClinicEmail(input) {
  const src = input && typeof input === "object" ? input : {};
  const recipient = String(src.recipient || "").trim().toLowerCase();
  const templateKey = String(src.templateKey || "").trim();
  const adapter = resolveActiveClinicEmailAdapter(src.env, {
    adapter: src.adapter,
    fetchImpl: src.fetchImpl,
    log: src.log,
  });
  const publicOrigin =
    src.publicOrigin ||
    resolvePublicOrigin(src.env, src.deploymentCode);

  if (!templateKey) {
    return {
      sendingAvailable: Boolean(adapter.sendingAvailable),
      accepted: false,
      delivered: false,
      status: REVIEW_DELIVERY.FAILED,
      providerCode: PROVIDER.INVALID_INPUT,
      reviewDeliveryStatus: REVIEW_DELIVERY.FAILED,
      inviteDeliveryStatus: INVITE_DELIVERY.FAILED,
    };
  }
  if (!recipient || !EMAIL_RE.test(recipient)) {
    return {
      sendingAvailable: Boolean(adapter.sendingAvailable),
      accepted: false,
      delivered: false,
      status: REVIEW_DELIVERY.FAILED,
      providerCode: PROVIDER.INVALID_RECIPIENT,
      reviewDeliveryStatus: REVIEW_DELIVERY.FAILED,
      inviteDeliveryStatus: INVITE_DELIVERY.FAILED,
    };
  }

  const message = buildActiveClinicEmailMessage(templateKey, {
    ...(src.fields || {}),
    publicOrigin,
  });
  if (!message) {
    return {
      sendingAvailable: Boolean(adapter.sendingAvailable),
      accepted: false,
      delivered: false,
      status: REVIEW_DELIVERY.FAILED,
      providerCode: PROVIDER.INVALID_INPUT,
      reviewDeliveryStatus: REVIEW_DELIVERY.FAILED,
      inviteDeliveryStatus: INVITE_DELIVERY.FAILED,
    };
  }

  const envelope = {
    templateKey: message.templateKey,
    recipient,
    subject: message.subject,
    ctaPath: message.ctaPath,
    ctaUrl: message.ctaUrl,
    idempotencyKey: src.idempotencyKey ? String(src.idempotencyKey) : null,
    activationUrl:
      templateKey === TEMPLATE.STAFF_INVITATION ? message.ctaUrl : null,
  };
  if (adapter.sendingAvailable === true) {
    envelope.text = message.text;
    envelope.html = message.html;
  }

  let raw;
  try {
    raw = await adapter.send(envelope);
  } catch {
    return {
      sendingAvailable: Boolean(adapter.sendingAvailable),
      accepted: false,
      delivered: false,
      status: REVIEW_DELIVERY.FAILED,
      providerCode: PROVIDER.THROWN,
      reviewDeliveryStatus: REVIEW_DELIVERY.FAILED,
      inviteDeliveryStatus: INVITE_DELIVERY.FAILED,
    };
  }
  const mapped = mapAdapterResult(raw, adapter.sendingAvailable);
  return {
    ...mapped,
    reviewDeliveryStatus: mapped.status,
    inviteDeliveryStatus: toInviteDeliveryStatus(mapped.status),
    templateKey: message.templateKey,
    ctaPath: message.ctaPath,
  };
}

function emailClaimedSent(deliveryStatus) {
  return deliveryStatus === REVIEW_DELIVERY.SENT;
}

function formatReviewDeliveryHint(eventType, deliveryStatus) {
  if (
    eventType !== "information_requested" &&
    eventType !== "rejection" &&
    eventType !== "approval"
  ) {
    return null;
  }
  if (eventType === "approval" && (!deliveryStatus || deliveryStatus === "not_applicable")) {
    return null;
  }
  if (deliveryStatus === REVIEW_DELIVERY.SENT) return "Outbound message sent.";
  if (deliveryStatus === REVIEW_DELIVERY.QUEUED) {
    return "Outbound email accepted for processing. Delivery is not confirmed.";
  }
  if (deliveryStatus === REVIEW_DELIVERY.FAILED) {
    return "Email failed. The action was recorded. Contact the applicant another way.";
  }
  return "Recorded only. Email was not sent.";
}

module.exports = {
  TEMPLATE,
  PROVIDER,
  REVIEW_DELIVERY,
  INVITE_DELIVERY,
  liveEmailTransportDecision,
  resolveOutboundEmailStatus,
  createUnavailableAdapter,
  createCaptureAdapter,
  createRejectingAdapter,
  createThrowingAdapter,
  resolveActiveClinicEmailAdapter,
  readResendSenderConfig,
  createResendAdapter,
  sendActiveClinicEmail,
  toInviteDeliveryStatus,
  emailClaimedSent,
  formatReviewDeliveryHint,
};
