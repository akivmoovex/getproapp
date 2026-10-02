"use strict";

/**
 * ActiveClinic transactional email — product templates + branding over platform transport.
 * Transport / Resend / production gates live in src/platform/email/*.
 */

const { buildActiveClinicEmailMessage, TEMPLATE } = require("./activeClinicEmailMessages");
const { resolvePublicOrigin } = require("./activeClinicShareLinks");
const {
  PROVIDER,
  REVIEW_DELIVERY,
  EMAIL_RE,
  liveEmailTransportDecision,
  resolveOutboundEmailStatus,
  createUnavailableAdapter,
  createCaptureAdapter,
  createRejectingAdapter,
  createThrowingAdapter,
  readResendSenderConfig,
  mapAdapterResult,
  adapterNameFromEnv,
} = require("../../platform/email/outboundEmailTransport");
const { createResendAdapter } = require("../../platform/email/resendEmailAdapter");

/** AC-preferred sender env keys (platform also accepts generic EMAIL_*). */
const AC_SENDER_ENV_KEYS = Object.freeze({
  adapterKeys: ["ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER", "EMAIL_DELIVERY_ADAPTER"],
  fromEmailKeys: ["ACTIVECLINIC_EMAIL_FROM", "EMAIL_FROM"],
  fromNameKeys: ["ACTIVECLINIC_EMAIL_FROM_NAME", "EMAIL_FROM_NAME"],
  replyToKeys: ["ACTIVECLINIC_EMAIL_REPLY_TO", "EMAIL_REPLY_TO"],
});

const INVITE_DELIVERY = Object.freeze({
  LINK_GENERATED: "link_generated",
  QUEUED: "queued",
  SENT: "sent",
  FAILED: "failed",
  UNAVAILABLE: "unavailable",
});

function liveActiveClinicEmailTransportDecision(env) {
  return liveEmailTransportDecision(env, AC_SENDER_ENV_KEYS);
}

function resolveActiveClinicOutboundEmailStatus(env) {
  return resolveOutboundEmailStatus(env, AC_SENDER_ENV_KEYS);
}

function readActiveClinicResendSenderConfig(env) {
  return readResendSenderConfig(env, AC_SENDER_ENV_KEYS);
}

function createAcUnavailableAdapter() {
  return createUnavailableAdapter("activeclinic_email_unavailable");
}

function createAcCaptureAdapter(store) {
  return createCaptureAdapter(store, "activeclinic_email_capture");
}

function createAcRejectingAdapter() {
  return createRejectingAdapter("activeclinic_email_rejecting");
}

function createAcThrowingAdapter() {
  return createThrowingAdapter("activeclinic_email_throwing");
}

function resolveActiveClinicEmailAdapter(env, deps) {
  if (deps && deps.adapter && typeof deps.adapter.send === "function") {
    return deps.adapter;
  }
  const source = env && typeof env === "object" ? env : process.env;
  const decision = liveActiveClinicEmailTransportDecision(source);
  if (!decision.allowed || decision.adapterName !== "resend") {
    const {
      isTestingDeliveryEnv,
    } = require("./activeClinicTestingDeliveryOutbox");
    if (isTestingDeliveryEnv(source) && adapterNameFromEnv(source, AC_SENDER_ENV_KEYS) === "capture") {
      if (!global.__activeClinicTestingEmailCaptureStore) {
        global.__activeClinicTestingEmailCaptureStore = [];
      }
      return createAcCaptureAdapter(global.__activeClinicTestingEmailCaptureStore);
    }
    return createAcUnavailableAdapter();
  }
  const config = readActiveClinicResendSenderConfig(source);
  if (!config.ok) {
    return createAcUnavailableAdapter();
  }
  return createResendAdapter({
    id: "activeclinic_email_resend",
    apiKey: config.apiKey,
    from: config.fromHeader,
    replyTo: config.replyTo || null,
    fetchImpl: deps && deps.fetchImpl,
    log: deps && deps.log,
  });
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
    resetUrl: templateKey === TEMPLATE.PASSWORD_RESET ? message.ctaUrl : null,
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

function createActiveClinicResendAdapter(opts) {
  return createResendAdapter({
    id: "activeclinic_email_resend",
    ...(opts && typeof opts === "object" ? opts : {}),
  });
}

module.exports = {
  TEMPLATE,
  PROVIDER,
  REVIEW_DELIVERY,
  INVITE_DELIVERY,
  AC_SENDER_ENV_KEYS,
  liveEmailTransportDecision: liveActiveClinicEmailTransportDecision,
  resolveOutboundEmailStatus: resolveActiveClinicOutboundEmailStatus,
  createUnavailableAdapter: createAcUnavailableAdapter,
  createCaptureAdapter: createAcCaptureAdapter,
  createRejectingAdapter: createAcRejectingAdapter,
  createThrowingAdapter: createAcThrowingAdapter,
  resolveActiveClinicEmailAdapter,
  readResendSenderConfig: readActiveClinicResendSenderConfig,
  createResendAdapter: createActiveClinicResendAdapter,
  sendActiveClinicEmail,
  toInviteDeliveryStatus,
  emailClaimedSent,
  formatReviewDeliveryHint,
};
