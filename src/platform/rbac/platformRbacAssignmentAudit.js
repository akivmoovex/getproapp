"use strict";

/**
 * Platform RBAC assignment audit primitives.
 * Normalizes event payloads and appends to product audit stores.
 * Does not change assignment write paths or login.
 *
 * Near-term storage:
 * - BlessBoard → blessboard.user_role_assignment_events
 * - ActiveClinic → structured payload only (no dedicated AC assignment events
 *   table yet); callers may persist via platform.audit_events separately.
 */

const {
  RBAC_PRODUCT,
  RBAC_ASSIGNMENT_EVENT,
  RBAC_ASSIGNMENT_STATUSES,
  BB_ASSIGNMENT_EVENTS_TABLE,
} = require("./platformRbacConstants");

const ALLOWED_EVENTS = new Set(Object.values(RBAC_ASSIGNMENT_EVENT));
const ALLOWED_STATUSES = new Set(RBAC_ASSIGNMENT_STATUSES);

/**
 * @param {object} input
 */
function buildAssignmentAuditEvent(input) {
  const src = input || {};
  const product = String(src.product || "").trim().toLowerCase() || RBAC_PRODUCT.SHARED;
  const eventKey = String(src.eventKey || "").trim();
  if (!ALLOWED_EVENTS.has(eventKey)) {
    return {
      ok: false,
      reason: "invalid_event_key",
      event: null,
    };
  }
  const previousStatus = src.previousStatus == null ? null : String(src.previousStatus);
  const newStatus = src.newStatus == null ? null : String(src.newStatus);
  if (previousStatus && !ALLOWED_STATUSES.has(previousStatus)) {
    return { ok: false, reason: "invalid_previous_status", event: null };
  }
  if (newStatus && !ALLOWED_STATUSES.has(newStatus)) {
    return { ok: false, reason: "invalid_new_status", event: null };
  }

  const metadata =
    src.metadata && typeof src.metadata === "object" && !Array.isArray(src.metadata)
      ? { ...src.metadata }
      : {};

  return {
    ok: true,
    reason: null,
    event: {
      product,
      assignmentId: src.assignmentId || null,
      organizationId: src.organizationId || null,
      actorUserId: src.actorUserId || null,
      actorPlatformIdentityId: src.actorPlatformIdentityId || null,
      eventKey,
      previousStatus,
      newStatus,
      reason: src.reason || null,
      metadata,
      roleKey: src.roleKey || null,
      scopeType: src.scopeType || null,
      scopeId: src.scopeId || null,
    },
  };
}

/**
 * Persist a BlessBoard assignment event (append-only table).
 * @param {{ query: Function }} client
 * @param {object} input
 */
async function recordBlessBoardAssignmentAudit(client, input) {
  const built = buildAssignmentAuditEvent({
    ...input,
    product: RBAC_PRODUCT.BLESSBOARD,
  });
  if (!built.ok) return built;
  const event = built.event;
  if (!event.assignmentId || !event.organizationId) {
    return {
      ok: false,
      reason: "assignment_id_and_organization_id_required",
      event,
      row: null,
    };
  }

  const metadata = {
    ...event.metadata,
    roleKey: event.roleKey || event.metadata.roleKey || null,
    scopeType: event.scopeType || event.metadata.scopeType || null,
    scopeId: event.scopeId || event.metadata.scopeId || null,
    product: RBAC_PRODUCT.BLESSBOARD,
  };

  const r = await client.query(
    `INSERT INTO ${BB_ASSIGNMENT_EVENTS_TABLE} (
       assignment_id, organization_id, actor_user_id, event_key,
       previous_status, new_status, reason, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     RETURNING id, created_at`,
    [
      event.assignmentId,
      event.organizationId,
      event.actorUserId || null,
      event.eventKey,
      event.previousStatus,
      event.newStatus,
      event.reason,
      JSON.stringify(metadata),
    ]
  );
  return {
    ok: true,
    reason: null,
    event,
    row: r.rows[0] || null,
  };
}

/**
 * Record assignment audit for a product.
 * AC returns normalized payload without DB write (no dedicated table yet).
 * @param {{ query: Function }} client
 * @param {object} input
 */
async function recordAssignmentAudit(client, input) {
  const product = String((input && input.product) || "")
    .trim()
    .toLowerCase();
  if (product === RBAC_PRODUCT.BLESSBOARD) {
    return recordBlessBoardAssignmentAudit(client, input);
  }
  const built = buildAssignmentAuditEvent(input);
  if (!built.ok) return { ...built, row: null, persisted: false };
  return {
    ok: true,
    reason: null,
    event: built.event,
    row: null,
    persisted: false,
    note:
      product === RBAC_PRODUCT.ACTIVECLINIC
        ? "activeclinic_assignment_audit_payload_only"
        : "assignment_audit_not_persisted",
  };
}

module.exports = {
  buildAssignmentAuditEvent,
  recordBlessBoardAssignmentAudit,
  recordAssignmentAudit,
  RBAC_ASSIGNMENT_EVENT,
};
