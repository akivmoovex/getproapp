"use strict";

/**
 * Password-reset email delivery (transactional). Default: unavailable stub.
 */

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

const defaultAdapter = createUnavailablePasswordResetEmailAdapter();

/**
 * @param {{
 *   recipientEmail: string,
 *   publicBaseUrl: string,
 *   resetUrl: string,
 *   expiresAt: Date|string,
 * }} input
 * @param {{ adapter?: object }} [deps]
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

  const adapter = (deps && deps.adapter) || defaultAdapter;
  try {
    const result = await adapter.send({
      recipient,
      subject,
      text,
      html,
    });
    if (result && result.accepted_for_processing === true) {
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
  createUnavailablePasswordResetEmailAdapter,
  sendPasswordResetEmail,
};
