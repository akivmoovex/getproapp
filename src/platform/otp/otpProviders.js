"use strict";

/**
 * OTP delivery adapters.
 * Paid gateways are not selected. No network client is loaded.
 * The fake adapter accepts 1234 only for a verified testing deployment.
 */

const { OTP_POLICY } = require("./otpPolicy");
const { isFixedOtpPermitted, isProductionSignal } = require("./otpEnvironment");
const { buildOtpMessage, deliverWithPolicy } = require("./otpDelivery");
const { createResendOtpEmailTransport } = require("../email/resendOtpTransport");
const {
  qaOtpObserverFixtureAuthorized,
  rememberLoginOtpCode,
} = require("./otpQaLoginObserver");

const UNAPPROVED_PROVIDERS = new Set([
  "twilio",
  "infobip",
  "africas_talking",
  "africastalking",
  "zamtel",
  "mtn",
  "airtel",
  "sendgrid",
  "mailgun",
  "ses",
  "postmark",
  "smtp",
  "nexmo",
  "messagebird",
]);

function createInactiveOtpProvider() {
  return Object.freeze({
    name: "inactive",
    deliveryActivated: false,
    contactsNetwork: false,
    async dispatch() {
      return {
        ok: false,
        publicStatus: "not_activated",
        reason: "delivery_not_activated",
        providerName: "inactive",
        retryable: false,
      };
    },
  });
}

function createQaObserverOtpProvider(env) {
  return Object.freeze({
    name: "qa-observer",
    deliveryActivated: false,
    contactsNetwork: false,
    async dispatch(input) {
      const source = (input && input.env) || env || {};
      const attemptId = String((input && input.idempotencyKey) || "");
      const code = String((input && input.code) || "");
      if (!qaOtpObserverFixtureAuthorized(source) || !rememberLoginOtpCode(attemptId, code, source)) {
        return {
          ok: false,
          publicStatus: "failed",
          reason: "delivery_not_activated",
          providerName: "qa-observer",
          retryable: false,
        };
      }
      return {
        ok: true,
        publicStatus: "accepted",
        reason: "qa_observer_accepted",
        providerName: "qa-observer",
        retryable: false,
      };
    },
  });
}

function createFakeOtpProvider() {
  return Object.freeze({
    name: "fake",
    deliveryActivated: false,
    contactsNetwork: false,
    async dispatch(input) {
      const env = input && input.env;
      if (!isFixedOtpPermitted(env) || isProductionSignal(env)) {
        return {
          ok: false,
          publicStatus: "failed",
          reason: "fake_forbidden",
          providerName: "fake",
          retryable: false,
        };
      }
      if (String((input && input.code) || "") !== OTP_POLICY.testingCode) {
        return {
          ok: false,
          publicStatus: "failed",
          reason: "fake_code_rejected",
          providerName: "fake",
          retryable: false,
        };
      }
      return {
        ok: true,
        publicStatus: "accepted",
        reason: "fake_accepted",
        providerName: "fake",
        retryable: false,
      };
    },
  });
}

function adapterName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function createChannelAdapter(channel, configuredName, transport, env, deps) {
  const name = adapterName(configuredName) || "unconfigured";
  const sendTransport =
    channel === "email" && name === "resend" && typeof transport !== "function"
      ? createResendOtpEmailTransport(env, deps)
      : transport;
  return {
    name,
    channel,
    deliveryActivated: false,
    contactsNetwork: false,
    async send(input) {
      if (UNAPPROVED_PROVIDERS.has(name)) {
        return {
          ok: false,
          reason: "provider_not_selected",
          providerName: name,
          publicStatus: "failed",
          retryable: false,
        };
      }
      if ((name !== "interface" && name !== "resend") || typeof sendTransport !== "function") {
        return {
          ok: false,
          reason: "provider_not_configured",
          providerName: name || "unconfigured",
          publicStatus: "failed",
          retryable: false,
        };
      }
      if (channel === "sms" && !/^\+260[1-9]\d{8}$/.test(String((input && input.destination) || ""))) {
        return {
          ok: false,
          reason: "zambia_destination_required",
          providerName: "interface",
          publicStatus: "failed",
          retryable: false,
        };
      }
      const message = buildOtpMessage(input && input.code);
      const response = await sendTransport({
        channel,
        destination: input.destination,
        subject: message.subject,
        text: message.text,
        productCode: input.productCode,
        purpose: input.purpose,
        idempotencyKey: input.idempotencyKey,
        timeoutMs: OTP_POLICY.deliveryTimeoutMs,
        attempt: input.attempt,
      });
      return {
        ok: Boolean(response && response.ok),
        reason: (response && response.reason) || (response && response.ok ? "accepted" : "delivery_failed"),
        providerName: "interface",
        publicStatus: response && response.ok ? "accepted" : "failed",
        retryable: Boolean(response && response.retryable),
      };
    },
  };
}

function createConfigurableOtpProvider(env, deps) {
  const source = env || {};
  const options = deps || {};
  const email = createChannelAdapter(
    "email",
    source.GETPRO_OTP_EMAIL_PROVIDER,
    options.emailTransport,
    source,
    options
  );
  const sms = createChannelAdapter(
    "sms",
    source.GETPRO_OTP_SMS_GATEWAY,
    options.smsTransport
  );
  return {
    name: "interface",
    deliveryActivated: false,
    contactsNetwork: false,
    emailName: email.name,
    smsName: sms.name,
    async dispatch(input) {
      const channel = String((input && input.channel) || "");
      const adapter = channel === "sms" ? sms : channel === "email" ? email : null;
      if (!adapter) {
        return {
          ok: false,
          publicStatus: "failed",
          reason: "channel",
          providerName: "interface",
          retryable: false,
        };
      }
      return deliverWithPolicy((attempt) => adapter.send({ ...input, attempt }));
    },
  };
}

function resolveOtpProvider(env, deps) {
  const requested = adapterName(env && env.GETPRO_OTP_PROVIDER) || "inactive";
  if (requested === "qa-observer") {
    if (!qaOtpObserverFixtureAuthorized(env) || isProductionSignal(env)) return createInactiveOtpProvider();
    return createQaObserverOtpProvider(env);
  }
  if (requested === "fake" || requested === "test" || requested === "fixed") {
    if (!isFixedOtpPermitted(env) || isProductionSignal(env)) return createInactiveOtpProvider();
    return createFakeOtpProvider();
  }
  if (requested === "interface" || requested === "resend") {
    const source = { ...(env || {}) };
    if (requested === "resend" && !adapterName(source.GETPRO_OTP_EMAIL_PROVIDER)) {
      source.GETPRO_OTP_EMAIL_PROVIDER = "resend";
    }
    return createConfigurableOtpProvider(source, deps);
  }
  return createInactiveOtpProvider();
}

function createOtpProvider(env, deps) {
  if (!env) return createInactiveOtpProvider();
  return resolveOtpProvider(env, deps);
}

module.exports = {
  UNAPPROVED_PROVIDERS,
  createInactiveOtpProvider,
  createQaObserverOtpProvider,
  createFakeOtpProvider,
  createConfigurableOtpProvider,
  resolveOtpProvider,
  createOtpProvider,
};
