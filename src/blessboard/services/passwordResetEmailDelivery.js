"use strict";

/**
 * Password-reset email delivery (transactional). Default: unavailable stub.
 */

const {
  liveEmailTransportDecision,
  readResendSenderConfig,
} = require("../../platform/email/outboundEmailTransport");
const { createResendAdapter } = require("../../platform/email/resendEmailAdapter");

const BB_SENDER_ENV_KEYS = Object.freeze({
  adapterKeys: ["BLESSBOARD_EMAIL_DELIVERY_ADAPTER", "EMAIL_DELIVERY_ADAPTER"],
  fromEmailKeys: ["BLESSBOARD_EMAIL_FROM", "EMAIL_FROM"],
  fromNameKeys: ["BLESSBOARD_EMAIL_FROM_NAME", "EMAIL_FROM_NAME"],
  replyToKeys: ["BLESSBOARD_EMAIL_REPLY_TO", "EMAIL_REPLY_TO"],
});

const DELIVERY_CODE = Object.freeze({
  EMAIL_SENDING_UNAVAILABLE: "email_sending_unavailable",
  INVALID_INPUT: "invalid_input",
  SENT: "sent",
  FAILED: "email_send_failed",
});

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createUnavailablePasswordResetEmailAdapter() {
  return Object.freeze({
    id: "password_reset_email_unavailable",
    sendingAvailable: false,
    async send() {
      return {
        accepted_for_processing: false,
        sendingAvailable: false,
        delivered: false,
        code: DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE,
        message: "Outbound email delivery is not configured for password reset.",
      };
    },
  });
}

function resolvePasswordResetEmailAdapter(env, deps) {
  if (deps && deps.adapter && typeof deps.adapter.send === "function") {
    return deps.adapter;
  }
  const source = env && typeof env === "object" ? env : process.env;
  const decision = liveEmailTransportDecision(source, BB_SENDER_ENV_KEYS);
  if (!decision.allowed || decision.adapterName !== "resend") {
    return createUnavailablePasswordResetEmailAdapter();
  }
  const config = readResendSenderConfig(source, BB_SENDER_ENV_KEYS);
  if (!config.ok) return createUnavailablePasswordResetEmailAdapter();
  return createResendAdapter({
    id: "blessboard_password_reset_resend",
    apiKey: config.apiKey,
    from: config.fromHeader,
    replyTo: config.replyTo || null,
    fetchImpl: deps && deps.fetchImpl,
    log: deps && deps.log,
  });
}

/**
 * @param {{
 *   recipientEmail: string,
 *   publicBaseUrl: string,
 *   resetUrl: string,
 *   expiresAt: Date|string,
 *   env?: object,
 * }} input
 * @param {{ adapter?: object, fetchImpl?: Function, log?: Function }} [deps]
 */
async function sendPasswordResetEmail(input, deps = {}) {
  const src = input && typeof input === "object" ? input : {};
  const recipient = String(src.recipientEmail || "").trim().toLowerCase();
  const resetUrl = String(src.resetUrl || "").trim();
  if (!recipient || !resetUrl) {
    return {
      ok: false,
      code: DELIVERY_CODE.INVALID_INPUT,
      accepted_for_processing: false,
      delivered: false,
    };
  }
  const expires = src.expiresAt instanceof Date ? src.expiresAt : new Date(src.expiresAt);
  const expiresLabel = Number.isNaN(expires.getTime())
    ? ""
    : `${expires.toISOString().replace("T", " ").slice(0, 19)} UTC`;

  const subject = "Reset your BlessBoard password";
  const text = [
    "We received a request to reset your BlessBoard password.",
    "",
    `Reset password: ${resetUrl}`,
    expiresLabel ? `This link expires on ${expiresLabel}.` : "",
    "This link can be used only once. If you did not request a reset, you can ignore this email.",
    "",
    "— BlessBoard",
  ]
    .filter(Boolean)
    .join("\n");
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1c1929">
<p>We received a request to reset your BlessBoard password.</p>
<p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;background:#6C5CE7;color:#fff;text-decoration:none;border-radius:8px">Reset password</a></p>
${expiresLabel ? `<p style="font-size:13px;color:#5c566e">This link expires on ${escapeHtml(expiresLabel)}.</p>` : ""}
<p style="font-size:13px;color:#5c566e">This link can be used only once. If you did not request a reset, you can ignore this email.</p>
</body></html>`;

  const adapter = resolvePasswordResetEmailAdapter(src.env, deps);
  try {
    const result = await adapter.send({
      recipient,
      subject,
      text,
      html,
      resetUrl,
      templateKey: "blessboard_password_reset",
    });
    const accepted = Boolean(
      result &&
        (result.accepted_for_processing === true ||
          result.accepted === true ||
          result.status === "queued" ||
          result.status === "sent")
    );
    if (accepted) {
      return {
        ok: true,
        code: DELIVERY_CODE.SENT,
        accepted_for_processing: true,
        delivered: Boolean(result.delivered),
      };
    }
    return {
      ok: false,
      code:
        (result && result.code) || DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE,
      accepted_for_processing: false,
      delivered: false,
    };
  } catch {
    return {
      ok: false,
      code: DELIVERY_CODE.FAILED,
      accepted_for_processing: false,
      delivered: false,
    };
  }
}

module.exports = {
  DELIVERY_CODE,
  BB_SENDER_ENV_KEYS,
  createUnavailablePasswordResetEmailAdapter,
  resolvePasswordResetEmailAdapter,
  sendPasswordResetEmail,
};
