"use strict";

/**
 * BlessBoard V5 registration-application communication business rules (Phase2 Prompt 063).
 * Records internal notes, information requests, and applicant messages; loads history.
 * Does not open routes, change application/follow-up status, reject apps, or claim email delivery.
 */

const defaultRepository = require("../repositories/platformChurchRegistrationRepository");
const {
  createUnavailableRegistrationEmailAdapter,
  DELIVERY_CODE,
} = require("./registrationEmailVerificationDelivery");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

const LIMITS = Object.freeze({
  RECIPIENT: 320,
  SUBJECT: 200,
  APPLICANT_MESSAGE: 8000,
  INTERNAL_NOTE: 8000,
  REQUEST_CATEGORY: 80,
  ARRAY_ITEM: 200,
  DELIVERY_ERROR_CODE: 120,
});

const REQUEST_CATEGORIES = Object.freeze([
  "clarify_church_identity",
  "confirm_applicant_authority",
  "upload_registration_document",
  "correct_phone",
  "correct_email",
  "confirm_location",
  "explain_possible_duplicate",
  "confirm_website_name",
  "add_service_times",
  "other",
]);

const OUTBOUND_CHANNELS = Object.freeze(["email", "phone", "other"]);

const TYPE_LABELS = Object.freeze({
  internal_note: "Internal note",
  information_request: "Information request",
  applicant_message: "Applicant message",
  rejection_notice: "Rejection notice",
  applicant_response: "Applicant response",
  system_event: "System event",
});

const CHANNEL_LABELS = Object.freeze({
  internal: "Internal",
  email: "Email",
  phone: "Phone",
  other: "Other",
});

const DIRECTION_LABELS = Object.freeze({
  internal: "Internal",
  outbound: "Outbound",
  inbound: "Inbound",
});

const DELIVERY_STATUS_LABELS = Object.freeze({
  not_applicable: "Not applicable",
  recorded: "Recorded",
  sending_unavailable: "Sending unavailable",
  queued: "Queued",
  sent: "Sent",
  failed: "Failed",
});

const REQUEST_CATEGORY_LABELS = Object.freeze({
  clarify_church_identity: "Clarify church identity",
  confirm_applicant_authority: "Confirm applicant authority",
  upload_registration_document: "Upload registration document",
  correct_phone: "Correct phone",
  correct_email: "Correct email",
  confirm_location: "Confirm location",
  explain_possible_duplicate: "Explain possible duplicate",
  confirm_website_name: "Confirm website name",
  add_service_times: "Add service times",
  other: "Other",
});

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimStr(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {string|null}
 */
function optionalTrimmed(value, max) {
  const s = trimStr(value);
  if (!s) return null;
  return s.slice(0, max);
}

/**
 * @param {unknown} value
 * @param {number} max
 * @param {string} code
 * @returns {string}
 */
function requireTrimmed(value, max, code) {
  const s = trimStr(value);
  if (!s) throw new Error(code);
  return s.slice(0, max);
}

/**
 * @param {unknown} value
 * @returns {Date|null}
 */
function parseDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeStringArray(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("invalid_requested_array");
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (item == null) continue;
    const s = trimStr(item);
    if (!s) continue;
    const clipped = s.slice(0, LIMITS.ARRAY_ITEM);
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
  }
  return out;
}

/**
 * @param {object} [deps]
 */
function resolveDeps(deps) {
  const d = deps && typeof deps === "object" ? deps : {};
  const adapter =
    d.emailAdapter && typeof d.emailAdapter === "object" && typeof d.emailAdapter.send === "function"
      ? d.emailAdapter
      : createUnavailableRegistrationEmailAdapter();
  return {
    repository: d.repository || defaultRepository,
    client: d.client != null ? d.client : d.db != null ? d.db : null,
    emailAdapter: adapter,
    now: typeof d.now === "function" ? d.now : () => new Date(),
    log:
      typeof d.log === "function"
        ? d.log
        : (msg, meta) => {
            try {
              // eslint-disable-next-line no-console
              console.error("[registration-communication]", msg, meta || {});
            } catch {
              /* ignore */
            }
          },
  };
}

/**
 * @param {object} deps
 * @returns {{ query: Function }}
 */
function requireClient(deps) {
  if (!deps.client || typeof deps.client.query !== "function") {
    throw new Error("db_client_required");
  }
  return deps.client;
}

/**
 * Attempt outbound email via safe adapter. Never logs message bodies.
 * @param {{ recipient: string, subject: string }} envelope
 * @param {object} deps
 * @returns {Promise<{
 *   attempted: boolean,
 *   status: string,
 *   providerAvailable: boolean,
 *   safeErrorCode: string|null,
 * }>}
 */
async function resolveOutboundEmailDelivery(envelope, deps) {
  const adapter = deps.emailAdapter;
  const providerAvailable = adapter.sendingAvailable === true;
  try {
    const result = await adapter.send({
      recipient: envelope.recipient,
      subject: envelope.subject,
    });
    if (result && result.accepted_for_processing === true) {
      const raw =
        result.delivery_status != null
          ? String(result.delivery_status)
          : result.status != null
            ? String(result.status)
            : "queued";
      const allow = new Set(["queued", "sent"]);
      return {
        attempted: true,
        status: allow.has(raw) ? raw : "queued",
        providerAvailable: true,
        safeErrorCode: null,
      };
    }
    const code =
      result && result.code != null
        ? String(result.code).slice(0, LIMITS.DELIVERY_ERROR_CODE)
        : DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE;
    return {
      attempted: true,
      status: "sending_unavailable",
      providerAvailable: Boolean(providerAvailable),
      safeErrorCode: code || DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE,
    };
  } catch (err) {
    deps.log("outbound email send failed", {
      code: "email_send_failed",
      message: err && err.message ? String(err.message).slice(0, 200) : "unknown",
    });
    return {
      attempted: true,
      status: "failed",
      providerAvailable: Boolean(providerAvailable),
      safeErrorCode: "email_send_failed",
    };
  }
}

/**
 * @param {string} channel
 * @param {{ recipient: string, subject: string }} envelope
 * @param {object} deps
 */
async function resolveOutboundDelivery(channel, envelope, deps) {
  if (channel === "email") {
    return resolveOutboundEmailDelivery(envelope, deps);
  }
  return {
    attempted: false,
    status: "recorded",
    providerAvailable: false,
    safeErrorCode: null,
  };
}

/**
 * @param {object} row
 */
function presentCommunication(row) {
  const type = row.communication_type != null ? String(row.communication_type) : "";
  const channel = row.channel != null ? String(row.channel) : "";
  const direction = row.direction != null ? String(row.direction) : "";
  const deliveryStatus = row.delivery_status != null ? String(row.delivery_status) : "";
  const requestCategory =
    row.request_category != null ? String(row.request_category) : null;
  return {
    id: row.id != null ? String(row.id) : null,
    applicationId: row.application_id != null ? String(row.application_id) : null,
    communicationType: type,
    channel,
    direction,
    recipient: row.recipient != null ? String(row.recipient) : null,
    subject: row.subject != null ? String(row.subject) : null,
    applicantMessage: row.applicant_message != null ? String(row.applicant_message) : null,
    internalNote: row.internal_note != null ? String(row.internal_note) : null,
    requestCategory,
    requestedFields: Array.isArray(row.requested_fields) ? row.requested_fields : [],
    requestedDocuments: Array.isArray(row.requested_documents)
      ? row.requested_documents
      : [],
    responseDueAt: row.response_due_at || null,
    deliveryStatus,
    deliveryErrorCode:
      row.delivery_error_code != null ? String(row.delivery_error_code) : null,
    createdByUserId:
      row.created_by_user_id != null ? String(row.created_by_user_id) : null,
    createdAt: row.created_at || null,
    labels: {
      communicationType: TYPE_LABELS[type] || type || "Unknown",
      channel: CHANNEL_LABELS[channel] || channel || "Unknown",
      direction: DIRECTION_LABELS[direction] || direction || "Unknown",
      deliveryStatus: DELIVERY_STATUS_LABELS[deliveryStatus] || deliveryStatus || "Unknown",
      requestCategory: requestCategory
        ? REQUEST_CATEGORY_LABELS[requestCategory] || requestCategory
        : null,
    },
  };
}

/**
 * @param {{ applicationId: string, internalNote: string }} input
 * @param {{ platformAdminUserId: string }} context
 * @param {object} [deps]
 */
async function addInternalNote(input, context, deps) {
  const src = input && typeof input === "object" ? { ...input } : {};
  const ctx = context && typeof context === "object" ? { ...context } : {};
  const d = resolveDeps(deps);
  const client = requireClient(d);

  const applicationId = trimStr(src.applicationId);
  const platformAdminUserId = trimStr(ctx.platformAdminUserId);
  if (!UUID_RE.test(applicationId)) throw new Error("invalid_application_id");
  if (!UUID_RE.test(platformAdminUserId)) throw new Error("invalid_administrator_id");

  const internalNote = requireTrimmed(
    src.internalNote,
    LIMITS.INTERNAL_NOTE,
    "internal_note_required"
  );

  const row = await d.repository.createRegistrationApplicationCommunication(client, {
    applicationId,
    createdByUserId: platformAdminUserId,
    communicationType: "internal_note",
    channel: "internal",
    direction: "internal",
    deliveryStatus: "not_applicable",
    internalNote,
    applicantMessage: null,
  });

  return {
    communication: presentCommunication(row),
    delivery: {
      attempted: false,
      status: "not_applicable",
      providerAvailable: false,
      safeErrorCode: null,
    },
    recorded: true,
  };
}

/**
 * @param {object} input
 * @param {{ platformAdminUserId: string }} context
 * @param {object} [deps]
 */
async function recordInformationRequest(input, context, deps) {
  const src = input && typeof input === "object" ? { ...input } : {};
  const ctx = context && typeof context === "object" ? { ...context } : {};
  const d = resolveDeps(deps);
  const client = requireClient(d);

  const applicationId = trimStr(src.applicationId);
  const platformAdminUserId = trimStr(ctx.platformAdminUserId);
  if (!UUID_RE.test(applicationId)) throw new Error("invalid_application_id");
  if (!UUID_RE.test(platformAdminUserId)) throw new Error("invalid_administrator_id");

  const channel = trimStr(src.channel || "email").toLowerCase();
  if (!OUTBOUND_CHANNELS.includes(channel)) throw new Error("invalid_channel");

  const recipient = requireTrimmed(src.recipient, LIMITS.RECIPIENT, "recipient_required");
  const subject = requireTrimmed(src.subject, LIMITS.SUBJECT, "subject_required");
  const applicantMessage = requireTrimmed(
    src.applicantMessage,
    LIMITS.APPLICANT_MESSAGE,
    "applicant_message_required"
  );
  const internalNote = optionalTrimmed(src.internalNote, LIMITS.INTERNAL_NOTE);

  const requestCategory = requireTrimmed(
    src.requestCategory,
    LIMITS.REQUEST_CATEGORY,
    "request_category_required"
  ).toLowerCase();
  if (!REQUEST_CATEGORIES.includes(requestCategory)) {
    throw new Error("invalid_request_category");
  }

  if (channel === "email") {
    const emailNorm = recipient.toLowerCase();
    if (!EMAIL_RE.test(emailNorm)) throw new Error("invalid_email_recipient");
  }

  const requestedFields = normalizeStringArray(src.requestedFields);
  const requestedDocuments = normalizeStringArray(src.requestedDocuments);

  let responseDueAt = null;
  if (src.responseDueAt != null && String(src.responseDueAt).trim() !== "") {
    responseDueAt = parseDate(src.responseDueAt);
    if (!responseDueAt) throw new Error("invalid_response_deadline");
  }

  const delivery = await resolveOutboundDelivery(
    channel,
    { recipient, subject },
    d
  );

  const row = await d.repository.createRegistrationApplicationCommunication(client, {
    applicationId,
    createdByUserId: platformAdminUserId,
    communicationType: "information_request",
    channel,
    direction: "outbound",
    recipient,
    subject,
    applicantMessage,
    internalNote,
    requestCategory,
    requestedFields,
    requestedDocuments,
    responseDueAt,
    deliveryStatus: delivery.status,
    deliveryErrorCode: delivery.safeErrorCode,
  });

  return {
    communication: presentCommunication(row),
    delivery: {
      attempted: delivery.attempted,
      status: delivery.status,
      providerAvailable: delivery.providerAvailable,
      safeErrorCode: delivery.safeErrorCode,
    },
    recorded: true,
  };
}

/**
 * @param {object} input
 * @param {{ platformAdminUserId: string }} context
 * @param {object} [deps]
 */
async function recordApplicantMessage(input, context, deps) {
  const src = input && typeof input === "object" ? { ...input } : {};
  const ctx = context && typeof context === "object" ? { ...context } : {};
  const d = resolveDeps(deps);
  const client = requireClient(d);

  const applicationId = trimStr(src.applicationId);
  const platformAdminUserId = trimStr(ctx.platformAdminUserId);
  if (!UUID_RE.test(applicationId)) throw new Error("invalid_application_id");
  if (!UUID_RE.test(platformAdminUserId)) throw new Error("invalid_administrator_id");

  const channel = trimStr(src.channel || "email").toLowerCase();
  if (!OUTBOUND_CHANNELS.includes(channel)) throw new Error("invalid_channel");

  const recipient = requireTrimmed(src.recipient, LIMITS.RECIPIENT, "recipient_required");
  const subject = requireTrimmed(src.subject, LIMITS.SUBJECT, "subject_required");
  const applicantMessage = requireTrimmed(
    src.applicantMessage,
    LIMITS.APPLICANT_MESSAGE,
    "applicant_message_required"
  );
  const internalNote = optionalTrimmed(src.internalNote, LIMITS.INTERNAL_NOTE);

  if (channel === "email") {
    const emailNorm = recipient.toLowerCase();
    if (!EMAIL_RE.test(emailNorm)) throw new Error("invalid_email_recipient");
  }

  const delivery = await resolveOutboundDelivery(
    channel,
    { recipient, subject },
    d
  );

  const row = await d.repository.createRegistrationApplicationCommunication(client, {
    applicationId,
    createdByUserId: platformAdminUserId,
    communicationType: "applicant_message",
    channel,
    direction: "outbound",
    recipient,
    subject,
    applicantMessage,
    internalNote,
    deliveryStatus: delivery.status,
    deliveryErrorCode: delivery.safeErrorCode,
  });

  return {
    communication: presentCommunication(row),
    delivery: {
      attempted: delivery.attempted,
      status: delivery.status,
      providerAvailable: delivery.providerAvailable,
      safeErrorCode: delivery.safeErrorCode,
    },
    recorded: true,
  };
}

/**
 * Record an applicant-facing rejection notice.
 * When notifyApplicant is true, uses the safe email adapter; otherwise records without claiming send.
 * Does not change application status.
 *
 * @param {object} input
 * @param {{ platformAdminUserId: string }} context
 * @param {object} [deps]
 */
async function recordRejectionNotice(input, context, deps) {
  const src = input && typeof input === "object" ? { ...input } : {};
  const ctx = context && typeof context === "object" ? { ...context } : {};
  const d = resolveDeps(deps);
  const client = requireClient(d);

  const applicationId = trimStr(src.applicationId);
  const platformAdminUserId = trimStr(ctx.platformAdminUserId);
  if (!UUID_RE.test(applicationId)) throw new Error("invalid_application_id");
  if (!UUID_RE.test(platformAdminUserId)) throw new Error("invalid_administrator_id");

  const channel = trimStr(src.channel || "email").toLowerCase();
  if (!OUTBOUND_CHANNELS.includes(channel)) throw new Error("invalid_channel");

  const applicantMessage = requireTrimmed(
    src.applicantMessage,
    LIMITS.APPLICANT_MESSAGE,
    "applicant_message_required"
  );
  const internalNote = optionalTrimmed(src.internalNote, LIMITS.INTERNAL_NOTE);
  const subject =
    optionalTrimmed(src.subject, LIMITS.SUBJECT) ||
    "Your BlessBoard registration application";
  const recipientRaw = optionalTrimmed(src.recipient, LIMITS.RECIPIENT);
  const notifyApplicant = src.notifyApplicant === true;

  let delivery;
  if (!notifyApplicant) {
    delivery = {
      attempted: false,
      status: "recorded",
      providerAvailable: false,
      safeErrorCode: null,
    };
  } else if (channel === "email") {
    if (!recipientRaw || !EMAIL_RE.test(recipientRaw.toLowerCase())) {
      delivery = {
        attempted: false,
        status: "sending_unavailable",
        providerAvailable: false,
        safeErrorCode: "invalid_email_recipient",
      };
    } else {
      delivery = await resolveOutboundEmailDelivery(
        { recipient: recipientRaw, subject },
        d
      );
    }
  } else {
    delivery = await resolveOutboundDelivery(
      channel,
      { recipient: recipientRaw || "n/a", subject },
      d
    );
  }

  const row = await d.repository.createRegistrationApplicationCommunication(client, {
    applicationId,
    createdByUserId: platformAdminUserId,
    communicationType: "rejection_notice",
    channel,
    direction: "outbound",
    recipient: recipientRaw,
    subject,
    applicantMessage,
    internalNote,
    deliveryStatus: delivery.status,
    deliveryErrorCode: delivery.safeErrorCode,
  });

  return {
    communication: presentCommunication(row),
    delivery: {
      attempted: delivery.attempted,
      status: delivery.status,
      providerAvailable: delivery.providerAvailable,
      safeErrorCode: delivery.safeErrorCode,
    },
    recorded: true,
  };
}

/**
 * @param {string} applicationId
 * @param {{ communicationType?: string|null, limit?: number }} [options]
 * @param {object} [deps]
 */
async function getCommunicationHistory(applicationId, options, deps) {
  const d = resolveDeps(deps);
  const client = requireClient(d);
  const id = trimStr(applicationId);
  if (!UUID_RE.test(id)) throw new Error("invalid_application_id");

  const opts = options && typeof options === "object" ? { ...options } : {};
  const rows = await d.repository.listRegistrationApplicationCommunications(client, id, {
    communicationType: opts.communicationType,
    limit: opts.limit,
  });
  const list = Array.isArray(rows) ? rows : [];
  return {
    communications: list.map(presentCommunication),
  };
}

module.exports = {
  LIMITS,
  REQUEST_CATEGORIES,
  OUTBOUND_CHANNELS,
  TYPE_LABELS,
  CHANNEL_LABELS,
  DIRECTION_LABELS,
  DELIVERY_STATUS_LABELS,
  REQUEST_CATEGORY_LABELS,
  addInternalNote,
  recordInformationRequest,
  recordApplicantMessage,
  recordRejectionNotice,
  getCommunicationHistory,
};
