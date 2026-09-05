"use strict";

/**
 * Persistence for ActiveClinic appointments (HCO scoped).
 */

async function insertServiceType(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.appointment_service_types (
       organization_id, healthcare_organization_id, service_key, display_name,
       description, default_duration_minutes, requires_assigned_staff, status,
       public_summary, public_bookable, public_website_visible
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.serviceKey,
      row.displayName,
      row.description || null,
      row.defaultDurationMinutes || 30,
      row.requiresAssignedStaff === true,
      row.status || "active",
      row.publicSummary || null,
      row.publicBookable === true,
      row.publicWebsiteVisible === true,
    ]
  );
  return result.rows[0];
}

async function updateServiceType(db, input) {
  const result = await db.query(
    `UPDATE activeclinic.appointment_service_types
        SET display_name = COALESCE($4, display_name),
            description = CASE WHEN $5::boolean THEN $6 ELSE description END,
            default_duration_minutes = COALESCE($7, default_duration_minutes),
            requires_assigned_staff = COALESCE($8, requires_assigned_staff),
            status = COALESCE($9, status),
            public_summary = CASE WHEN $10::boolean THEN $11 ELSE public_summary END,
            public_bookable = COALESCE($12, public_bookable),
            public_website_visible = COALESCE($13, public_website_visible),
            updated_at = now()
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      RETURNING *`,
    [
      input.id,
      input.organizationId,
      input.healthcareOrganizationId,
      input.displayName != null ? String(input.displayName).trim() : null,
      Object.prototype.hasOwnProperty.call(input, "description"),
      input.description == null || String(input.description).trim() === ""
        ? null
        : String(input.description).trim(),
      input.defaultDurationMinutes != null ? Number(input.defaultDurationMinutes) : null,
      typeof input.requiresAssignedStaff === "boolean" ? input.requiresAssignedStaff : null,
      input.status != null ? String(input.status).trim() : null,
      Object.prototype.hasOwnProperty.call(input, "publicSummary"),
      input.publicSummary == null || String(input.publicSummary).trim() === ""
        ? null
        : String(input.publicSummary).trim(),
      typeof input.publicBookable === "boolean" ? input.publicBookable : null,
      typeof input.publicWebsiteVisible === "boolean" ? input.publicWebsiteVisible : null,
    ]
  );
  return result.rows[0] || null;
}

async function findServiceTypeByOrgAndId(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.appointment_service_types
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      LIMIT 1`,
    [input.id, input.organizationId, input.healthcareOrganizationId]
  );
  return result.rows[0] || null;
}

async function listServiceTypesByOrg(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.appointment_service_types
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND ($3::boolean = true OR status = 'active')
      ORDER BY display_name ASC`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.includeInactive === true,
    ]
  );
  return result.rows;
}

async function insertAppointment(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.appointments (
       organization_id, healthcare_organization_id, facility_id, patient_id,
       service_type_id, assigned_staff_id, starts_at, ends_at, timezone,
       status, scheduling_note, rescheduled_from_appointment_id,
       created_by_staff_id, updated_by_staff_id
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
     )
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.facilityId,
      row.patientId,
      row.serviceTypeId,
      row.assignedStaffId || null,
      row.startsAt,
      row.endsAt,
      row.timezone,
      row.status || "scheduled",
      row.schedulingNote || null,
      row.rescheduledFromAppointmentId || null,
      row.createdByStaffId || null,
      row.updatedByStaffId || null,
    ]
  );
  return result.rows[0];
}

async function findAppointmentByOrgAndId(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.appointments
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      LIMIT 1`,
    [input.id, input.organizationId, input.healthcareOrganizationId]
  );
  return result.rows[0] || null;
}

async function updateAppointmentByOrgAndId(db, input) {
  const sets = [];
  const params = [];
  let i = 1;
  const patch = input.patch || {};
  function set(col, val) {
    sets.push(`${col} = $${i++}`);
    params.push(val);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "startsAt")) set("starts_at", patch.startsAt);
  if (Object.prototype.hasOwnProperty.call(patch, "endsAt")) set("ends_at", patch.endsAt);
  if (Object.prototype.hasOwnProperty.call(patch, "timezone")) set("timezone", patch.timezone);
  if (Object.prototype.hasOwnProperty.call(patch, "assignedStaffId")) {
    set("assigned_staff_id", patch.assignedStaffId);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "status")) set("status", patch.status);
  if (Object.prototype.hasOwnProperty.call(patch, "schedulingNote")) {
    set("scheduling_note", patch.schedulingNote);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "cancellationReason")) {
    set("cancellation_reason", patch.cancellationReason);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "updatedByStaffId")) {
    set("updated_by_staff_id", patch.updatedByStaffId);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "version")) set("version", patch.version);
  if (!sets.length) return findAppointmentByOrgAndId(db, input);

  params.push(input.id, input.organizationId, input.healthcareOrganizationId);
  let sql = `UPDATE activeclinic.appointments SET ${sets.join(", ")}
              WHERE id = $${i++} AND organization_id = $${i++}
                AND healthcare_organization_id = $${i++}`;
  if (input.expectedVersion != null) {
    params.push(input.expectedVersion);
    sql += ` AND version = $${i++}`;
  }
  sql += ` RETURNING *`;
  const result = await db.query(sql, params);
  return result.rows[0] || null;
}

async function findStaffCollision(db, input) {
  if (!input.assignedStaffId) return null;
  const result = await db.query(
    `SELECT id FROM activeclinic.appointments
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND assigned_staff_id = $3
        AND status IN ('scheduled', 'confirmed', 'checked_in', 'in_progress')
        AND starts_at < $5
        AND ends_at > $4
        AND ($6::uuid IS NULL OR id <> $6)
      LIMIT 1`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.assignedStaffId,
      input.startsAt,
      input.endsAt,
      input.excludeAppointmentId || null,
    ]
  );
  return result.rows[0] || null;
}

async function listAppointmentsByOrg(db, input) {
  const params = [input.organizationId, input.healthcareOrganizationId];
  const where = [
    "a.organization_id = $1",
    "a.healthcare_organization_id = $2",
  ];
  let i = 3;
  if (input.facilityId) {
    where.push(`a.facility_id = $${i++}`);
    params.push(input.facilityId);
  }
  if (input.facilityIds && input.facilityIds.length) {
    where.push(`a.facility_id = ANY($${i++}::uuid[])`);
    params.push(input.facilityIds);
  }
  if (input.patientId) {
    where.push(`a.patient_id = $${i++}`);
    params.push(input.patientId);
  }
  if (input.assignedStaffId) {
    where.push(`a.assigned_staff_id = $${i++}`);
    params.push(input.assignedStaffId);
  }
  if (input.serviceTypeId) {
    where.push(`a.service_type_id = $${i++}`);
    params.push(input.serviceTypeId);
  }
  if (input.status) {
    where.push(`a.status = $${i++}`);
    params.push(input.status);
  }
  if (input.startsFrom) {
    where.push(`a.starts_at >= $${i++}`);
    params.push(input.startsFrom);
  }
  if (input.startsTo) {
    where.push(`a.starts_at < $${i++}`);
    params.push(input.startsTo);
  }
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
  const offset = Math.max(Number(input.offset) || 0, 0);
  params.push(limit, offset);
  const result = await db.query(
    `SELECT a.* FROM activeclinic.appointments a
      WHERE ${where.join(" AND ")}
      ORDER BY a.starts_at ASC
      LIMIT $${i++} OFFSET $${i++}`,
    params
  );
  return result.rows;
}

async function insertStatusEvent(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.appointment_status_events (
       organization_id, healthcare_organization_id, appointment_id,
       from_status, to_status, reason_code, note, actor_staff_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.appointmentId,
      row.fromStatus || null,
      row.toStatus,
      row.reasonCode || null,
      row.note || null,
      row.actorStaffId || null,
    ]
  );
  return result.rows[0];
}

async function listStatusEvents(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.appointment_status_events
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND appointment_id = $3
      ORDER BY created_at ASC`,
    [input.organizationId, input.healthcareOrganizationId, input.appointmentId]
  );
  return result.rows;
}

async function insertReminderRequest(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.appointment_reminder_requests (
       organization_id, healthcare_organization_id, appointment_id,
       preferred_channel, scheduled_for, delivery_state
     ) VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.appointmentId,
      row.preferredChannel,
      row.scheduledFor,
      row.deliveryState || "not_requested",
    ]
  );
  return result.rows[0];
}

async function listRemindersForAppointment(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.appointment_reminder_requests
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND appointment_id = $3
      ORDER BY created_at ASC`,
    [input.organizationId, input.healthcareOrganizationId, input.appointmentId]
  );
  return result.rows;
}

module.exports = {
  insertServiceType,
  updateServiceType,
  findServiceTypeByOrgAndId,
  listServiceTypesByOrg,
  insertAppointment,
  findAppointmentByOrgAndId,
  updateAppointmentByOrgAndId,
  findStaffCollision,
  listAppointmentsByOrg,
  insertStatusEvent,
  listStatusEvents,
  insertReminderRequest,
  listRemindersForAppointment,
};
