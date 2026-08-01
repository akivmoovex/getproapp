"use strict";

/**
 * Delivery adapter for church administrator invitation emails.
 * Default stub matches registration verification: never claims delivery without a provider.
 */

const {
  buildChurchAdministratorInvitationMessage,
  normalizePublicBaseUrl,
} = require("./churchAdministratorInvitationMessage");

const DELIVERY_CODE = Object.freeze({
  EMAIL_SENDING_UNAVAILABLE: "email_sending_unavailable",
  INVALID_INPUT: "invalid_input",
  SENT: "sent",
  FAILED: "email_send_failed",
});

const UNAVAILABLE_MESSAGE =
  "Outbound email delivery is not configured for BlessBoard invitation messages. Messages are built but not sent.";

function createUnavailableInvitationEmailAdapter() {
  return Object.freeze({
    id: "church_invitation_email_unavailable",
    sendingAvailable: false,
    async send(_envelope) {
      return {
        accepted_for_processing: false,
        sendingAvailable: false,
        delivered: false,
        code: DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE,
        message: UNAVAILABLE_MESSAGE,
      };
    },
  });
}

const defaultAdapter = createUnavailableInvitationEmailAdapter();

/**
 * @param {{
 *   churchName: string,
 *   administratorName?: string|null,
 *   recipientEmail: string,
 *   inviteUrl?: string|null,
 *   publicBaseUrl: string,
 *   expiresAt?: Date|string|null,
 *   kind?: 'setup_invitation'|'access_confirmation',
 * }} input
 * @param {{ adapter?: { send: Function, sendingAvailable?: boolean, id?: string } }} [deps]
 */
async function sendChurchAdministratorInvitationEmail(input, deps = {}) {
  const d = deps && typeof deps === "object" ? deps : {};
  const adapter = d.adapter || defaultAdapter;
  let message;
  try {
    const base = normalizePublicBaseUrl(input && input.publicBaseUrl);
    message = buildChurchAdministratorInvitationMessage({
      ...input,
      loginUrl: `${base}/login`,
    });
  } catch {
    return {
      ok: false,
      accepted_for_processing: false,
      sendingAvailable: Boolean(adapter && adapter.sendingAvailable),
      delivered: false,
      code: DELIVERY_CODE.INVALID_INPUT,
      message: "Invalid invitation email input.",
      recipient: null,
      adapterId: adapter && adapter.id ? String(adapter.id) : null,
      subject: null,
    };
  }

  try {
    const result = await adapter.send({
      recipient: message.recipient,
      subject: message.subject,
      // Adapters must not log bodies/URLs containing tokens.
      text: message.text,
      html: message.html,
    });
    if (result && result.accepted_for_processing === true) {
      return {
        ok: true,
        accepted_for_processing: true,
        sendingAvailable: true,
        delivered: Boolean(result.delivered),
        code: DELIVERY_CODE.SENT,
        message: "Invitation email accepted for delivery.",
        recipient: message.recipient,
        adapterId: adapter && adapter.id ? String(adapter.id) : null,
        subject: message.subject,
        kind: message.kind,
      };
    }
    const code =
      result && result.code != null
        ? String(result.code).slice(0, 80)
        : DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE;
    return {
      ok: false,
      accepted_for_processing: false,
      sendingAvailable: Boolean(adapter && adapter.sendingAvailable),
      delivered: false,
      code,
      message:
        (result && result.message) || UNAVAILABLE_MESSAGE,
      recipient: message.recipient,
      adapterId: adapter && adapter.id ? String(adapter.id) : null,
      subject: message.subject,
      kind: message.kind,
    };
  } catch {
    return {
      ok: false,
      accepted_for_processing: false,
      sendingAvailable: Boolean(adapter && adapter.sendingAvailable),
      delivered: false,
      code: DELIVERY_CODE.FAILED,
      message: "Invitation email send failed.",
      recipient: message.recipient,
      adapterId: adapter && adapter.id ? String(adapter.id) : null,
      subject: message.subject,
      kind: message.kind,
    };
  }
}

module.exports = {
  DELIVERY_CODE,
  createUnavailableInvitationEmailAdapter,
  sendChurchAdministratorInvitationEmail,
};
