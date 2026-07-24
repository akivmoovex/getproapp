"use strict";

/**
 * Registration email-verification delivery (Phase2 Prompt 038).
 *
 * Audit: BlessBoard V5 has no nodemailer / SES / SendGrid / Postmark / Resend /
 * Mailgun (or other) outbound mail adapter. This module uses a safe unavailable
 * stub that never claims delivery and never logs plaintext tokens.
 */

const {
  buildRegistrationVerificationEmailMessage,
} = require("./registrationEmailVerificationMessage");

const DELIVERY_CODE = Object.freeze({
  EMAIL_SENDING_UNAVAILABLE: "email_sending_unavailable",
  INVALID_INPUT: "invalid_input",
});

const UNAVAILABLE_MESSAGE =
  "Outbound email delivery is not configured for BlessBoard registration verification. Messages are built but not sent.";

/**
 * Safe development/testing adapter when no real mail provider exists.
 * Does not claim delivery, does not log plaintext tokens or message bodies.
 */
function createUnavailableRegistrationEmailAdapter() {
  return Object.freeze({
    id: "registration_email_unavailable",
    sendingAvailable: false,
    /**
     * @param {{ recipient?: string, subject?: string }} [_envelope]
     *   Token-bearing bodies/URLs must not be logged by callers or this adapter.
     */
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

const defaultAdapter = createUnavailableRegistrationEmailAdapter();

/**
 * Build a verification message and attempt delivery through the configured adapter.
 * With the default stub, sending is marked unavailable and nothing is persisted.
 *
 * @param {{
 *   churchName?: string,
 *   applicationName?: string,
 *   applicantEmail: string,
 *   plaintextToken: string,
 *   expiresAt: Date|string,
 *   publicBaseUrl: string,
 * }} input
 * @param {{
 *   buildMessage?: Function,
 *   adapter?: { send: Function, sendingAvailable?: boolean, id?: string },
 * }} [deps]
 * @returns {Promise<{
 *   ok: boolean,
 *   accepted_for_processing: boolean,
 *   sendingAvailable: boolean,
 *   delivered: boolean,
 *   code: string,
 *   message: string,
 *   recipient: string|null,
 *   adapterId: string|null,
 * }>}
 */
async function sendRegistrationVerificationEmail(input, deps = {}) {
  const d = deps && typeof deps === "object" ? deps : {};
  const buildMessage =
    typeof d.buildMessage === "function"
      ? d.buildMessage
      : buildRegistrationVerificationEmailMessage;
  const adapter =
    d.adapter && typeof d.adapter === "object" && typeof d.adapter.send === "function"
      ? d.adapter
      : defaultAdapter;

  let message;
  try {
    message = buildMessage(input);
  } catch (err) {
    return {
      ok: false,
      accepted_for_processing: false,
      sendingAvailable: false,
      delivered: false,
      code: DELIVERY_CODE.INVALID_INPUT,
      message: err && err.message ? String(err.message) : "Invalid verification email input.",
      recipient: null,
      adapterId: adapter.id != null ? String(adapter.id) : null,
    };
  }

  // Unavailable adapters never receive token-bearing bodies/URLs.
  // A future real adapter (sendingAvailable: true) receives the full message.
  const adapterSendingAvailable = adapter.sendingAvailable === true;
  const envelope = adapterSendingAvailable
    ? {
        recipient: message.recipient,
        subject: message.subject,
        plainTextBody: message.plainTextBody,
        htmlBody: message.htmlBody,
        verificationUrl: message.verificationUrl,
      }
    : {
        recipient: message.recipient,
        subject: message.subject,
      };

  let result;
  try {
    result = await adapter.send(envelope);
  } catch {
    return {
      ok: false,
      accepted_for_processing: false,
      sendingAvailable: false,
      delivered: false,
      code: DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE,
      message: UNAVAILABLE_MESSAGE,
      recipient: message.recipient,
      adapterId: adapter.id != null ? String(adapter.id) : null,
    };
  }

  const accepted =
    result && result.accepted_for_processing === true ? true : false;
  const delivered = result && result.delivered === true ? true : false;
  const sendingAvailable =
    result && result.sendingAvailable === true
      ? true
      : adapter.sendingAvailable === true;
  const code =
    result && result.code != null
      ? String(result.code)
      : DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE;
  const statusMessage =
    result && result.message != null ? String(result.message) : UNAVAILABLE_MESSAGE;

  return {
    ok: accepted && delivered,
    accepted_for_processing: accepted,
    sendingAvailable: Boolean(sendingAvailable),
    delivered,
    code,
    message: statusMessage,
    recipient: message.recipient,
    adapterId: adapter.id != null ? String(adapter.id) : null,
  };
}

const RESEND_STATUS = Object.freeze({
  SENT: "email_verification_sent",
  COOLDOWN: "cooldown",
  INVALID_EMAIL: "invalid_email",
  SENDING_UNAVAILABLE: "email_sending_unavailable",
  NOT_FOUND: "not_found",
  UNEXPECTED_FAILURE: "email_verification_failed",
});

/**
 * Admin resend orchestration: create token → build message → call sender.
 * Never returns plaintext tokens. Does not change approval state.
 *
 * @param {{
 *   applicationId: string,
 *   actorUserId: string,
 *   publicBaseUrl: string,
 * }} input
 * @param {{
 *   findRegistrationApplicationById?: Function,
 *   createVerificationToken?: Function,
 *   sendRegistrationVerificationEmail?: Function,
 *   client?: { query: Function },
 *   db?: { query: Function },
 *   createTokenDeps?: object,
 *   sendDeps?: object,
 * }} [deps]
 */
async function resendRegistrationVerificationEmail(input, deps = {}) {
  const src = input && typeof input === "object" ? input : {};
  const d = deps && typeof deps === "object" ? deps : {};
  const applicationId = String(src.applicationId || "").trim();
  const actorUserId = String(src.actorUserId || "").trim();
  const publicBaseUrl = String(src.publicBaseUrl || "").trim();

  const findById =
    typeof d.findRegistrationApplicationById === "function"
      ? d.findRegistrationApplicationById
      : require("../repositories/platformChurchRegistrationRepository")
          .getRegistrationApplicationById;
  const createToken =
    typeof d.createVerificationToken === "function"
      ? d.createVerificationToken
      : require("./registrationEmailVerificationService").createVerificationToken;
  const sendEmail =
    typeof d.sendRegistrationVerificationEmail === "function"
      ? d.sendRegistrationVerificationEmail
      : sendRegistrationVerificationEmail;

  const client = d.client != null ? d.client : d.db != null ? d.db : null;
  if (!client) {
    return {
      ok: false,
      code: RESEND_STATUS.UNEXPECTED_FAILURE,
      message: "Database is required.",
    };
  }

  let application;
  try {
    application = await findById(client, applicationId);
  } catch {
    return {
      ok: false,
      code: RESEND_STATUS.UNEXPECTED_FAILURE,
      message: "Application lookup failed.",
    };
  }
  if (!application) {
    return {
      ok: false,
      code: RESEND_STATUS.NOT_FOUND,
      message: "Registration application not found.",
    };
  }

  const email =
    application.contact_email != null
      ? String(application.contact_email).trim()
      : application.contactEmail != null
        ? String(application.contactEmail).trim()
        : "";
  if (!email) {
    return {
      ok: false,
      code: RESEND_STATUS.INVALID_EMAIL,
      message: "Applicant email is missing or invalid.",
    };
  }

  const churchName =
    (application.church_name != null && String(application.church_name).trim()) ||
    (application.churchName != null && String(application.churchName).trim()) ||
    "your church registration";

  let created;
  try {
    const tokenDeps = {
      ...(d.createTokenDeps && typeof d.createTokenDeps === "object"
        ? d.createTokenDeps
        : {}),
      client,
    };
    created = await createToken(
      {
        applicationId,
        email,
        createdByUserId: actorUserId || null,
      },
      tokenDeps
    );
  } catch (err) {
    const code = err && err.code != null ? String(err.code) : "";
    if (code === "resend_cooldown") {
      return {
        ok: false,
        code: RESEND_STATUS.COOLDOWN,
        message: "Please wait before resending another verification email.",
        retryAfterMs: err.retryAfterMs != null ? Number(err.retryAfterMs) : null,
      };
    }
    if (
      code === "invalid_email" ||
      code === "email_required" ||
      code === "invalid_application_id"
    ) {
      return {
        ok: false,
        code:
          code === "invalid_application_id"
            ? RESEND_STATUS.NOT_FOUND
            : RESEND_STATUS.INVALID_EMAIL,
        message: "Applicant email is missing or invalid.",
      };
    }
    return {
      ok: false,
      code: RESEND_STATUS.UNEXPECTED_FAILURE,
      message: "Verification token could not be created.",
    };
  }

  const rawToken =
    created && created.rawToken != null ? String(created.rawToken) : "";
  const expiresAt =
    (created && created.expiresAt) ||
    (created && created.token && created.token.expiresAt) ||
    null;

  if (!rawToken || !expiresAt) {
    return {
      ok: false,
      code: RESEND_STATUS.UNEXPECTED_FAILURE,
      message: "Verification token could not be created.",
    };
  }

  let sendResult;
  try {
    sendResult = await sendEmail(
      {
        churchName,
        applicantEmail: email,
        plaintextToken: rawToken,
        expiresAt,
        publicBaseUrl,
      },
      d.sendDeps && typeof d.sendDeps === "object" ? d.sendDeps : {}
    );
  } catch {
    return {
      ok: false,
      code: RESEND_STATUS.UNEXPECTED_FAILURE,
      message: "Verification email could not be sent.",
    };
  } finally {
    // Drop local reference; never return plaintext token.
    created = null;
  }

  if (
    sendResult &&
    sendResult.accepted_for_processing === true &&
    (sendResult.delivered === true || sendResult.ok === true)
  ) {
    return {
      ok: true,
      code: RESEND_STATUS.SENT,
      message: "Verification email accepted for delivery.",
      recipient: sendResult.recipient || email,
    };
  }

  if (
    sendResult &&
    (sendResult.code === DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE ||
      sendResult.sendingAvailable === false ||
      sendResult.accepted_for_processing === false)
  ) {
    return {
      ok: false,
      code: RESEND_STATUS.SENDING_UNAVAILABLE,
      message:
        sendResult.message ||
        "Outbound email delivery is not configured. The verification token was recorded but not emailed.",
      recipient: sendResult.recipient || email,
    };
  }

  return {
    ok: false,
    code: RESEND_STATUS.UNEXPECTED_FAILURE,
    message: "Verification email could not be sent.",
    recipient: sendResult && sendResult.recipient ? sendResult.recipient : email,
  };
}

module.exports = {
  DELIVERY_CODE,
  UNAVAILABLE_MESSAGE,
  RESEND_STATUS,
  createUnavailableRegistrationEmailAdapter,
  sendRegistrationVerificationEmail,
  resendRegistrationVerificationEmail,
};

