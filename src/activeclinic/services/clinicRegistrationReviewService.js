"use strict";

/**
 * ActiveClinic clinic-registration review lifecycle.
 * Follow-up is a separate axis from application status.
 * Does not copy BlessBoard church fields. Reuses the architectural pattern only:
 * status vs follow-up, append-only history, honest delivery, internal notes.
 */

const { withProvisioningTransaction } = require("../../platform/db/provisioningTransaction");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const {
  resolveClinicRegistrationIdentityCollision,
} = require("./clinicRegistrationIdentityCollisionService");
const {
  TEMPLATE,
  sendActiveClinicEmail,
  formatReviewDeliveryHint,
  emailClaimedSent,
} = require("./activeClinicEmailDelivery");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "application_not_found",
  NOT_ELIGIBLE: "application_not_eligible",
  REJECTION_REASON_REQUIRED: "rejection_reason_required",
  REQUEST_TEXT_REQUIRED: "request_text_required",
  NOTE_REQUIRED: "note_required",
  NOT_AWAITING_CUSTOMER: "not_awaiting_customer",
});

const APPLICATION_STATUSES = Object.freeze([
  "submitted",
  "provisioning",
  "review_required",
  "active",
  "rejected",
  "suspended",
  "provision_failed",
  "pending_review",
  "approved",
  "withdrawn",
  "duplicate",
]);

const REVIEW_HOLD_STATUSES = Object.freeze([
  "submitted",
  "pending_review",
  "review_required",
]);

const FOLLOW_UP_STATUSES = Object.freeze([
  "none",
  "under_review",
  "awaiting_customer",
  "returned_for_review",
]);

const PROVISIONING_STATUSES = Object.freeze([
  "not_started",
  "in_progress",
  "website_pending",
  "provisioned",
  "failed",
]);

const EVENT_TYPES = Object.freeze([
  "submitted",
  "review_started",
  "information_requested",
  "information_returned",
  "note",
  "approval",
  "rejection",
  "provisioning_started",
  "provisioning_succeeded",
  "provisioning_failed",
  "follow_up_updated",
]);

const EVENT_LABELS = Object.freeze({
  submitted: "Submitted",
  review_started: "Review started",
  information_requested: "Information requested",
  information_returned: "Information returned",
  note: "Internal note",
  approval: "Approved",
  rejection: "Rejected",
  provisioning_started: "Provisioning started",
  provisioning_succeeded: "Provisioning succeeded",
  provisioning_failed: "Provisioning failed",
  follow_up_updated: "Follow-up updated",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LIST_COLUMNS = `id, application_number, clinic_name, contact_name, contact_email_display,
                contact_email_normalized, contact_phone_display, contact_phone_normalized,
                province, city, address, country_code, notes,
                status, follow_up_status, provisioning_status, created_at, reviewed_at,
                organization_id, last_provision_error, rejection_reason,
                information_requested_at, information_returned_at,
                website_instance_id, clinic_admin_staff_id, duplicate_of_application_id`;

function isPool(db) {
  return Boolean(db && typeof db.connect === "function" && typeof db.release !== "function");
}

async function withTx(db, fn) {
  if (isPool(db)) return withProvisioningTransaction(db, fn);
  return fn(db);
}

function trimBody(raw, max) {
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return "";
  return text.slice(0, max);
}

function presentEvent(row) {
  if (!row) return null;
  const eventType = String(row.event_type || "");
  const deliveryStatus = row.delivery_status != null ? String(row.delivery_status) : null;
  return {
    id: row.id,
    applicationId: row.application_id,
    eventType,
    label: EVENT_LABELS[eventType] || eventType,
    visibility: String(row.visibility || "internal"),
    body: row.body != null ? String(row.body) : null,
    actorId: row.actor_id || null,
    actorLabel: row.actor_label != null ? String(row.actor_label) : null,
    deliveryStatus,
    deliveryClaimedSent: emailClaimedSent(deliveryStatus),
    deliveryHint: formatReviewDeliveryHint(eventType, deliveryStatus),
    createdAt: row.created_at,
    isInternalNote: eventType === "note",
  };
}

async function updateReviewEventDelivery(client, eventId, deliveryStatus) {
  const id = String(eventId || "").trim();
  if (!UUID_RE.test(id)) return null;
  let status = String(deliveryStatus || "");
  if (
    !["not_applicable", "recorded", "sending_unavailable", "queued", "sent", "failed"].includes(
      status
    )
  ) {
    status = "recorded";
  }
  const updated = await client.query(
    `UPDATE activeclinic.clinic_registration_review_events
        SET delivery_status = $2
      WHERE id = $1
      RETURNING id, delivery_status`,
    [id, status]
  );
  return updated.rows[0] || null;
}

async function loadApplication(client, applicationId) {
  const rows = await client.query(
    `SELECT * FROM activeclinic.clinic_registration_applications WHERE id = $1 FOR UPDATE`,
    [applicationId]
  );
  return rows.rows[0] || null;
}

async function updateApplication(client, id, patch) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(patch)) {
    values.push(value);
    fields.push(`${key} = $${values.length}`);
  }
  if (!fields.length) return;
  values.push(id);
  await client.query(
    `UPDATE activeclinic.clinic_registration_applications
        SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $${values.length}`,
    values
  );
}

/**
 * Append a review-history row. Does not claim outbound delivery unless deliveryStatus is sent.
 * @param {{ query: Function }} client
 */
async function appendReviewEvent(client, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const eventType = String((input && input.eventType) || "").trim();
  if (!UUID_RE.test(applicationId) || !EVENT_TYPES.includes(eventType)) {
    return { ok: false, code: RESULT.INVALID_INPUT, event: null };
  }
  const visibility =
    eventType === "note" ? "internal" : String((input && input.visibility) || "history");
  if (visibility !== "internal" && visibility !== "history") {
    return { ok: false, code: RESULT.INVALID_INPUT, event: null };
  }
  const bodyRaw = input && input.body != null ? trimBody(input.body, 8000) : "";
  const body = bodyRaw || null;
  const actorId =
    input && input.actorId && UUID_RE.test(String(input.actorId))
      ? String(input.actorId)
      : null;
  let deliveryStatus = input && input.deliveryStatus != null
    ? String(input.deliveryStatus)
    : eventType === "note"
      ? "not_applicable"
      : null;
  if (
    deliveryStatus &&
    !["not_applicable", "recorded", "sending_unavailable", "queued", "sent", "failed"].includes(
      deliveryStatus
    )
  ) {
    deliveryStatus = "recorded";
  }
  const inserted = await client.query(
    `INSERT INTO activeclinic.clinic_registration_review_events (
       application_id, event_type, visibility, body, actor_id, delivery_status
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, application_id, event_type, visibility, body, actor_id, delivery_status, created_at`,
    [applicationId, eventType, visibility, body, actorId, deliveryStatus]
  );
  return { ok: true, code: RESULT.OK, event: presentEvent(inserted.rows[0]) };
}

async function ensureReviewStarted(client, app, actorId) {
  const existing = await client.query(
    `SELECT 1 FROM activeclinic.clinic_registration_review_events
      WHERE application_id = $1 AND event_type = 'review_started'
      LIMIT 1`,
    [app.id]
  );
  if (existing.rows[0]) return;
  await appendReviewEvent(client, {
    applicationId: app.id,
    eventType: "review_started",
    actorId,
    visibility: "history",
    deliveryStatus: "not_applicable",
  });
  if (String(app.follow_up_status || "none") === "none") {
    await updateApplication(client, app.id, { follow_up_status: "under_review" });
    app.follow_up_status = "under_review";
  }
}

async function maybePlatformAudit(client, app, input) {
  if (!app || !app.organization_id) return;
  await recordAuditEventSafe(client, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: app.organization_id,
    actorUserId: null,
    actionKey: input.actionKey,
    entityType: "clinic_registration_application",
    entityId: app.id,
    outcome: "success",
    metadata: {
      actor_type: "platform_admin",
      source: "admin_clinic_registrations",
      status: input.status || undefined,
      from_status: input.fromStatus || undefined,
      to_status: input.toStatus || undefined,
      reason_code: input.reasonCode || undefined,
    },
  });
}

async function deliverInformationRequestedEmail(client, input) {
  const eventId = input && input.eventId;
  if (!eventId) {
    return { deliveryStatus: "sending_unavailable", emailSent: false };
  }
  const existing = await client.query(
    `SELECT delivery_status FROM activeclinic.clinic_registration_review_events WHERE id = $1`,
    [eventId]
  );
  const current = existing.rows[0] && existing.rows[0].delivery_status;
  if (current === "queued" || current === "sent") {
    return { deliveryStatus: current, emailSent: current === "sent", skipped: true };
  }
  const result = await sendActiveClinicEmail({
    env: input.env,
    adapter: input.emailAdapter,
    publicOrigin: input.publicOrigin,
    deploymentCode: input.deploymentCode,
    templateKey: TEMPLATE.INFORMATION_REQUESTED,
    recipient: input.recipient,
    idempotencyKey: `information_requested:${eventId}`,
    fields: {
      clinicName: input.clinicName,
      applicationNumber: input.applicationNumber,
      requestText: input.requestText,
      requestedAt: input.requestedAt,
    },
  });
  const deliveryStatus = result.reviewDeliveryStatus || "sending_unavailable";
  await updateReviewEventDelivery(client, eventId, deliveryStatus);
  return {
    deliveryStatus,
    emailSent: deliveryStatus === "sent",
    skipped: false,
  };
}

/**
 * Record an information request. Application status stays pending_review.
 * Follow-up becomes awaiting_customer. Email is attempted after the request is recorded.
 */
async function requestClinicRegistrationInformation(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const requestText = trimBody(input && input.requestText, 8000);
  if (!UUID_RE.test(applicationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  if (requestText.length < 3) {
    return { ok: false, code: RESULT.REQUEST_TEXT_REQUIRED };
  }
  return withTx(db, async (client) => {
    const app = await loadApplication(client, applicationId);
    if (!app) return { ok: false, code: RESULT.NOT_FOUND };
    if (!REVIEW_HOLD_STATUSES.includes(String(app.status))) {
      return { ok: false, code: RESULT.NOT_ELIGIBLE, application: app };
    }
    await ensureReviewStarted(client, app, input.actorId);
    const requestedAt = new Date().toISOString();
    await updateApplication(client, app.id, {
      follow_up_status: "awaiting_customer",
      information_requested_at: requestedAt,
      information_requested_by_id: UUID_RE.test(String(input.actorId || ""))
        ? String(input.actorId)
        : null,
    });
    const event = await appendReviewEvent(client, {
      applicationId: app.id,
      eventType: "information_requested",
      body: requestText,
      actorId: input.actorId,
      visibility: "history",
      deliveryStatus: "sending_unavailable",
    });
    const delivered = await deliverInformationRequestedEmail(client, {
      eventId: event.event && event.event.id,
      env: input.env,
      emailAdapter: input.emailAdapter,
      publicOrigin: input.publicOrigin,
      deploymentCode: input.deploymentCode,
      recipient: app.contact_email_normalized,
      clinicName: app.clinic_name,
      applicationNumber: app.application_number,
      requestText,
      requestedAt,
    });
    if (event.event) {
      event.event.deliveryStatus = delivered.deliveryStatus;
      event.event.deliveryClaimedSent = delivered.emailSent;
      event.event.deliveryHint = formatReviewDeliveryHint(
        "information_requested",
        delivered.deliveryStatus
      );
    }
    await maybePlatformAudit(client, app, {
      deploymentCode: input.deploymentCode,
      actionKey: "activeclinic.clinic_registration.information_requested",
      fromStatus: app.follow_up_status,
      toStatus: "awaiting_customer",
    });
    return {
      ok: true,
      code: RESULT.OK,
      applicationStatus: app.status,
      followUpStatus: "awaiting_customer",
      deliveryStatus: delivered.deliveryStatus,
      emailSent: delivered.emailSent,
      event: event.event,
    };
  });
}

/**
 * Mark requested information as returned. Status stays pending_review.
 * Follow-up becomes returned_for_review (normal review queue).
 */
async function markClinicRegistrationInformationReturned(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  if (!UUID_RE.test(applicationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  return withTx(db, async (client) => {
    const app = await loadApplication(client, applicationId);
    if (!app) return { ok: false, code: RESULT.NOT_FOUND };
    if (!REVIEW_HOLD_STATUSES.includes(String(app.status))) {
      return { ok: false, code: RESULT.NOT_ELIGIBLE, application: app };
    }
    if (String(app.follow_up_status) !== "awaiting_customer") {
      return { ok: false, code: RESULT.NOT_AWAITING_CUSTOMER, application: app };
    }
    await updateApplication(client, app.id, {
      follow_up_status: "returned_for_review",
      information_returned_at: new Date().toISOString(),
    });
    const note = trimBody(input && input.note, 8000);
    await appendReviewEvent(client, {
      applicationId: app.id,
      eventType: "information_returned",
      body: note || "Information marked returned for review.",
      actorId: input.actorId,
      visibility: "history",
      deliveryStatus: "not_applicable",
    });
    await maybePlatformAudit(client, app, {
      deploymentCode: input.deploymentCode,
      actionKey: "activeclinic.clinic_registration.information_returned",
      fromStatus: "awaiting_customer",
      toStatus: "returned_for_review",
    });
    return {
      ok: true,
      code: RESULT.OK,
      applicationStatus: app.status,
      followUpStatus: "returned_for_review",
    };
  });
}

/**
 * Append an internal Platform Admin note. Never public. Does not overwrite prior notes.
 */
async function addClinicRegistrationReviewNote(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const body = trimBody(input && input.body, 8000);
  if (!UUID_RE.test(applicationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  if (body.length < 1) {
    return { ok: false, code: RESULT.NOTE_REQUIRED };
  }
  return withTx(db, async (client) => {
    const app = await loadApplication(client, applicationId);
    if (!app) return { ok: false, code: RESULT.NOT_FOUND };
    await ensureReviewStarted(client, app, input.actorId);
    const event = await appendReviewEvent(client, {
      applicationId: app.id,
      eventType: "note",
      body,
      actorId: input.actorId,
      visibility: "internal",
      deliveryStatus: "not_applicable",
    });
    return { ok: true, code: RESULT.OK, event: event.event };
  });
}

async function listClinicRegistrationReviewEvents(db, applicationId) {
  const id = String(applicationId || "").trim();
  if (!UUID_RE.test(id)) return [];
  const rows = await db.query(
    `SELECT e.id, e.application_id, e.event_type, e.visibility, e.body, e.actor_id,
            e.delivery_status, e.created_at,
            COALESCE(u.display_name, u.email_display, i.primary_email) AS actor_label
       FROM activeclinic.clinic_registration_review_events e
       LEFT JOIN platform.identities i ON i.id = e.actor_id
       LEFT JOIN blessboard.users u ON u.id = e.actor_id
      WHERE e.application_id = $1
      ORDER BY e.created_at ASC, e.id ASC`,
    [id]
  );
  return rows.rows.map(presentEvent);
}

function synthesizeSubmitted(application) {
  if (!application) return null;
  return {
    id: `submitted-${application.id}`,
    applicationId: application.id,
    eventType: "submitted",
    label: EVENT_LABELS.submitted,
    visibility: "history",
    body: null,
    actorId: null,
    actorLabel: null,
    deliveryStatus: "not_applicable",
    deliveryClaimedSent: false,
    createdAt: application.created_at,
    isInternalNote: false,
  };
}

async function listClinicRegistrationHistory(db, application) {
  const events = await listClinicRegistrationReviewEvents(db, application.id);
  const hasSubmitted = events.some((e) => e.eventType === "submitted");
  const submitted = hasSubmitted ? [] : [synthesizeSubmitted(application)].filter(Boolean);
  return submitted.concat(events);
}

function listClinicRegistrationNotes(history) {
  return (history || []).filter((e) => e && e.eventType === "note");
}

function normalizeFilter(raw, allowed, fallback) {
  const value = String(raw == null ? "" : raw).trim();
  if (!value || value === "all") return "all";
  if (allowed.includes(value)) return value;
  return fallback;
}

/**
 * Queue search/filter. Preserves status filtering. Does not return password hashes.
 */
async function listClinicRegistrationApplications(db, filters) {
  const src = filters && typeof filters === "object" ? filters : {};
  const status = normalizeFilter(src.status, APPLICATION_STATUSES, "pending_review");
  const followUpStatus = normalizeFilter(src.followUpStatus, FOLLOW_UP_STATUSES, "all");
  const provisioningStatus = normalizeFilter(
    src.provisioningStatus,
    PROVISIONING_STATUSES,
    "all"
  );
  const q = String(src.q || "").trim().slice(0, 200).replace(/[%_]/g, " ");
  const digits = q.replace(/\D/g, "");
  const like = q ? `%${q}%` : null;
  const digitLike = digits.length >= 3 ? `%${digits}%` : null;

  const rows = await db.query(
    `SELECT ${LIST_COLUMNS}
       FROM activeclinic.clinic_registration_applications
      WHERE (
            $1 = 'all'
            OR status = $1
            OR ($1 = 'pending_review' AND status IN ('review_required', 'pending_review', 'submitted'))
            OR ($1 = 'review_required' AND status IN ('review_required', 'pending_review'))
            OR ($1 = 'approved' AND status IN ('approved', 'active'))
            OR ($1 = 'active' AND status IN ('approved', 'active'))
          )
        AND ($2 = 'all' OR follow_up_status = $2)
        AND ($3 = 'all' OR provisioning_status = $3)
        AND (
          $4::text IS NULL
          OR application_number ILIKE $4
          OR clinic_name ILIKE $4
          OR contact_name ILIKE $4
          OR contact_email_display ILIKE $4
          OR contact_email_normalized ILIKE $4
          OR contact_phone_display ILIKE $4
          OR contact_phone_normalized ILIKE $4
          OR ($5::text IS NOT NULL AND regexp_replace(contact_phone_normalized, '[^0-9]', '', 'g') LIKE $5)
        )
      ORDER BY created_at DESC
      LIMIT 100`,
    [status, followUpStatus, provisioningStatus, like, digitLike]
  );
  return {
    applications: rows.rows,
    filters: {
      status,
      followUpStatus,
      provisioningStatus,
      q,
    },
  };
}

function websiteStateFromApplication(application) {
  if (application && application.website_instance_id) {
    return String(application.provisioning_status) === "website_pending"
      ? "pending"
      : "provisioned";
  }
  if (String((application && application.provisioning_status) || "") === "website_pending") {
    return "pending";
  }
  return "not_provisioned";
}

async function getClinicRegistrationDetail(db, applicationId) {
  const id = String(applicationId || "").trim();
  if (!UUID_RE.test(id)) {
    return { ok: false, code: RESULT.INVALID_INPUT, application: null };
  }
  const listed = await db.query(
    `SELECT ${LIST_COLUMNS}
       FROM activeclinic.clinic_registration_applications
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  const application = listed.rows[0] || null;
  if (!application) {
    return { ok: false, code: RESULT.NOT_FOUND, application: null };
  }
  const history = await listClinicRegistrationHistory(db, application);
  const identityCollision = await resolveClinicRegistrationIdentityCollision(db, application);
  return {
    ok: true,
    code: RESULT.OK,
    application,
    history,
    notes: listClinicRegistrationNotes(history),
    identityCollision,
    websiteState: websiteStateFromApplication(application),
  };
}

module.exports = {
  RESULT,
  APPLICATION_STATUSES,
  REVIEW_HOLD_STATUSES,
  FOLLOW_UP_STATUSES,
  PROVISIONING_STATUSES,
  EVENT_TYPES,
  EVENT_LABELS,
  appendReviewEvent,
  updateReviewEventDelivery,
  deliverInformationRequestedEmail,
  requestClinicRegistrationInformation,
  markClinicRegistrationInformationReturned,
  addClinicRegistrationReviewNote,
  listClinicRegistrationHistory,
  listClinicRegistrationNotes,
  listClinicRegistrationApplications,
  getClinicRegistrationDetail,
};
