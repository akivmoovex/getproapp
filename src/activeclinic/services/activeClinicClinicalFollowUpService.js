"use strict";

/**
 * ActiveClinic clinical follow-up / recall worklist (ACN16).
 * AC-owned clinical data — not platform PA registration follow-up or billing collections.
 */

const {
  authorizeStaffPermission,
  RESULT: AUTHZ_RESULT,
} = require("./activeClinicAuthorizationService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { rejectForgedTenantIdentifiers } = require("../../platform/rbac/sharedTenantScope");

const CLINICAL_VIEW = "activeclinic.encounter.view";
const CLINICAL_RECORD = "activeclinic.consultation.record";

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  ACCESS_DENIED: "access_denied",
  NOT_FOUND: "follow_up_not_found",
  STALE_VERSION: "stale_version",
  FORGED_TENANT: "forged_tenant",
  PATIENT_NOT_FOUND: "patient_not_found",
});

const ITEM_TYPES = Object.freeze([
  "due_review",
  "missed_appointment",
  "pending_referral",
  "incomplete_notes",
  "outstanding_action",
]);

const STATUSES = Object.freeze([
  "open",
  "action_required",
  "contact_attempted",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);

const URGENCIES = Object.freeze(["routine", "priority", "critical"]);

const TYPE_LABELS = Object.freeze({
  due_review: "Due for review",
  missed_appointment: "Missed appointment",
  pending_referral: "Pending referral",
  incomplete_notes: "Incomplete notes",
  outstanding_action: "Outstanding action",
});

const STATUS_LABELS = Object.freeze({
  open: "Open",
  action_required: "Action required",
  contact_attempted: "Contact attempted",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    patientId: row.patient_id,
    encounterId: row.encounter_id || null,
    appointmentId: row.appointment_id || null,
    itemType: row.item_type,
    itemTypeLabel: TYPE_LABELS[row.item_type] || row.item_type,
    title: row.title,
    reason: row.reason || null,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    urgency: row.urgency,
    dueAt: row.due_at || null,
    ownerStaffId: row.owner_staff_id || null,
    originatingStaffId: row.originating_staff_id || null,
    completedAt: row.completed_at || null,
    completedByStaffId: row.completed_by_staff_id || null,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    patientDisplayName: row.patient_display_name || null,
    patientNumber: row.patient_number || null,
    ownerDisplayName: row.owner_display_name || null,
    originatingDisplayName: row.originating_display_name || null,
  };
}

function assertTrusted(input) {
  const forged = rejectForgedTenantIdentifiers({
    body: input.body,
    query: input.query,
    trusted: {
      organizationId: input.organizationId,
      facilityId: input.facilityId || null,
    },
    allowMatchingTrusted: true,
  });
  if (!forged.ok) return { ok: false, code: RESULT.FORGED_TENANT };
  return { ok: true };
}

async function authorize(db, input, permissionKey) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey,
    facilityId: input.facilityId || null,
  });
  if (!authz.ok) {
    return {
      ok: false,
      code:
        authz.code === AUTHZ_RESULT.DENIED
          ? RESULT.ACCESS_DENIED
          : authz.code || RESULT.ACCESS_DENIED,
    };
  }
  return { ok: true };
}

async function createClinicalFollowUpItem(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  const authz = await authorize(db, input, CLINICAL_RECORD);
  if (!authz.ok) return { ...authz, item: null };

  const patientId = String(input.patientId || "").trim();
  const itemType = String(input.itemType || "").trim();
  const title = String(input.title || "").trim().slice(0, 200);
  const reason = input.reason ? String(input.reason).trim().slice(0, 2000) : null;
  const status = String(input.status || "open").trim();
  const urgency = String(input.urgency || "routine").trim();
  if (
    !UUID_RE.test(patientId) ||
    !ITEM_TYPES.includes(itemType) ||
    !title ||
    !STATUSES.includes(status) ||
    !URGENCIES.includes(urgency)
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, item: null };
  }

  const patient = await db.query(
    `SELECT id FROM activeclinic.patients
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      LIMIT 1`,
    [patientId, input.organizationId, input.healthcareOrganizationId]
  );
  if (!patient.rows[0]) {
    return { ok: false, code: RESULT.PATIENT_NOT_FOUND, item: null };
  }

  let dueAt = null;
  if (input.dueAt) {
    const d = new Date(input.dueAt);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, code: RESULT.INVALID_INPUT, item: null };
    }
    dueAt = d.toISOString();
  }

  const inserted = await db.query(
    `INSERT INTO activeclinic.clinical_follow_up_items (
       organization_id, healthcare_organization_id, facility_id, patient_id,
       encounter_id, appointment_id, item_type, title, reason, status, urgency,
       due_at, owner_staff_id, originating_staff_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.facilityId,
      patientId,
      input.encounterId || null,
      input.appointmentId || null,
      itemType,
      title,
      reason,
      status,
      urgency,
      dueAt,
      input.ownerStaffId || input.actor.staffMemberId,
      input.actor.staffMemberId,
    ]
  );
  const row = inserted.rows[0];
  await db.query(
    `INSERT INTO activeclinic.clinical_follow_up_events (
       organization_id, healthcare_organization_id, follow_up_item_id,
       from_status, to_status, note, actor_staff_id
     ) VALUES ($1,$2,$3,NULL,$4,$5,$6)`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      row.id,
      status,
      reason,
      input.actor.staffMemberId,
    ]
  );
  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.clinical_follow_up.created",
    entityType: "clinical_follow_up_item",
    entityId: row.id,
    outcome: "success",
    metadata: { item_type: itemType, patient_id: patientId },
  });
  return { ok: true, code: RESULT.OK, item: mapItem(row) };
}

async function listClinicalFollowUpItems(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  const authz = await authorize(db, input, CLINICAL_VIEW);
  if (!authz.ok) return { ...authz, items: [] };

  const params = [input.organizationId, input.healthcareOrganizationId, input.facilityId];
  const clauses = [
    "f.organization_id = $1",
    "f.healthcare_organization_id = $2",
    "f.facility_id = $3",
  ];

  if (input.itemType && ITEM_TYPES.includes(String(input.itemType))) {
    params.push(String(input.itemType));
    clauses.push(`f.item_type = $${params.length}`);
  }
  if (input.status && STATUSES.includes(String(input.status))) {
    params.push(String(input.status));
    clauses.push(`f.status = $${params.length}`);
  } else if (input.includeCompleted !== true) {
    clauses.push(`f.status NOT IN ('completed', 'cancelled')`);
  }
  if (input.ownerStaffId && UUID_RE.test(String(input.ownerStaffId))) {
    params.push(String(input.ownerStaffId));
    clauses.push(`f.owner_staff_id = $${params.length}`);
  }

  const result = await db.query(
    `SELECT f.*,
            (p.first_name || ' ' || p.last_name) AS patient_display_name,
            p.patient_number,
            os.display_name AS owner_display_name,
            og.display_name AS originating_display_name
       FROM activeclinic.clinical_follow_up_items f
       JOIN activeclinic.patients p ON p.id = f.patient_id
       LEFT JOIN activeclinic.staff_members os ON os.id = f.owner_staff_id
       LEFT JOIN activeclinic.staff_members og ON og.id = f.originating_staff_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY
        CASE f.urgency WHEN 'critical' THEN 0 WHEN 'priority' THEN 1 ELSE 2 END,
        f.due_at ASC NULLS LAST,
        f.created_at DESC
      LIMIT 100`,
    params
  );
  return { ok: true, code: RESULT.OK, items: result.rows.map(mapItem) };
}

async function updateClinicalFollowUpStatus(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  const authz = await authorize(db, input, CLINICAL_RECORD);
  if (!authz.ok) return { ...authz, item: null };

  const itemId = String(input.itemId || "").trim();
  const toStatus = String(input.status || "").trim();
  const note = input.note ? String(input.note).trim().slice(0, 500) : null;
  if (!UUID_RE.test(itemId) || !STATUSES.includes(toStatus)) {
    return { ok: false, code: RESULT.INVALID_INPUT, item: null };
  }

  const existing = await db.query(
    `SELECT * FROM activeclinic.clinical_follow_up_items
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
        AND facility_id = $4
      LIMIT 1`,
    [itemId, input.organizationId, input.healthcareOrganizationId, input.facilityId]
  );
  const row = existing.rows[0];
  if (!row) return { ok: false, code: RESULT.NOT_FOUND, item: null };

  const expectedVersion =
    input.version != null ? Number(input.version) : Number(row.version);
  const completedAt = toStatus === "completed" ? new Date() : null;
  const completedBy =
    toStatus === "completed" ? input.actor.staffMemberId : null;

  const updated = await db.query(
    `UPDATE activeclinic.clinical_follow_up_items
        SET status = $1,
            completed_at = CASE WHEN $1 = 'completed' THEN COALESCE($2, now()) ELSE completed_at END,
            completed_by_staff_id = CASE WHEN $1 = 'completed' THEN $3 ELSE completed_by_staff_id END,
            version = version + 1,
            updated_at = now()
      WHERE id = $4
        AND version = $5
      RETURNING *`,
    [toStatus, completedAt, completedBy, itemId, expectedVersion]
  );
  if (!updated.rows[0]) {
    return { ok: false, code: RESULT.STALE_VERSION, item: mapItem(row) };
  }

  await db.query(
    `INSERT INTO activeclinic.clinical_follow_up_events (
       organization_id, healthcare_organization_id, follow_up_item_id,
       from_status, to_status, note, actor_staff_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      itemId,
      row.status,
      toStatus,
      note,
      input.actor.staffMemberId,
    ]
  );
  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.clinical_follow_up.status_changed",
    entityType: "clinical_follow_up_item",
    entityId: itemId,
    outcome: "success",
    metadata: { from_status: row.status, to_status: toStatus },
  });
  return { ok: true, code: RESULT.OK, item: mapItem(updated.rows[0]) };
}

module.exports = {
  RESULT,
  ITEM_TYPES,
  STATUSES,
  URGENCIES,
  TYPE_LABELS,
  STATUS_LABELS,
  createClinicalFollowUpItem,
  listClinicalFollowUpItems,
  updateClinicalFollowUpStatus,
};
