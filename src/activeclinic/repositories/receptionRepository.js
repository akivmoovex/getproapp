"use strict";

/**
 * Persistence for ActiveClinic reception/queue (HCO scoped).
 */

async function insertServicePoint(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.service_points (
       organization_id, healthcare_organization_id, facility_id, service_point_key,
       display_name, description, service_type, status, accepts_walk_in,
       accepts_scheduled, max_queue_capacity
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.facilityId,
      row.servicePointKey,
      row.displayName,
      row.description || null,
      row.serviceType || "general",
      row.status || "active",
      row.acceptsWalkIn !== false,
      row.acceptsScheduled !== false,
      row.maxQueueCapacity || null,
    ]
  );
  return result.rows[0];
}

async function findServicePointByOrgAndId(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.service_points
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      LIMIT 1`,
    [input.id, input.organizationId, input.healthcareOrganizationId]
  );
  return result.rows[0] || null;
}

async function listServicePointsByFacility(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.service_points
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND facility_id = $3
        AND ($4::boolean = true OR status = 'active')
      ORDER BY display_name ASC`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.facilityId,
      input.includeInactive === true,
    ]
  );
  return result.rows;
}

async function insertQueuePriority(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.queue_priorities (
       organization_id, healthcare_organization_id, priority_key,
       display_name, priority_level, color_code, description
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.priorityKey,
      row.displayName,
      row.priorityLevel,
      row.colorCode || null,
      row.description || null,
    ]
  );
  return result.rows[0];
}

async function listQueuePrioritiesByHCO(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.queue_priorities
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
      ORDER BY priority_level ASC`,
    [input.organizationId, input.healthcareOrganizationId]
  );
  return result.rows;
}

async function insertReceptionArrival(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.reception_arrivals (
       organization_id, healthcare_organization_id, facility_id, patient_id,
       appointment_id, arrival_source, arrived_at, checked_in_by_staff_id,
       check_in_note
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.facilityId,
      row.patientId,
      row.appointmentId || null,
      row.arrivalSource,
      row.arrivedAt || new Date(),
      row.checkedInByStaffId || null,
      row.checkInNote || null,
    ]
  );
  return result.rows[0];
}

async function findReceptionArrivalById(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.reception_arrivals
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      LIMIT 1`,
    [input.id, input.organizationId, input.healthcareOrganizationId]
  );
  return result.rows[0] || null;
}

async function listReceptionArrivalsByFacility(db, input) {
  const params = [input.organizationId, input.healthcareOrganizationId, input.facilityId];
  const where = [
    "organization_id = $1",
    "healthcare_organization_id = $2",
    "facility_id = $3",
  ];
  let i = 4;
  if (input.from) {
    where.push(`arrived_at >= $${i++}`);
    params.push(input.from);
  }
  if (input.to) {
    where.push(`arrived_at < $${i++}`);
    params.push(input.to);
  }
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
  const offset = Math.max(Number(input.offset) || 0, 0);
  params.push(limit, offset);
  const result = await db.query(
    `SELECT * FROM activeclinic.reception_arrivals
      WHERE ${where.join(" AND ")}
      ORDER BY arrived_at DESC
      LIMIT $${i++} OFFSET $${i++}`,
    params
  );
  return result.rows;
}

async function allocateQueueNumber(db, input) {
  await db.query(
    `SELECT 1 FROM activeclinic.service_points
      WHERE id = $1 FOR UPDATE`,
    [input.servicePointId]
  );
  const result = await db.query(
    `SELECT COALESCE(MAX(queue_number), 0) + 1 AS next_number
       FROM activeclinic.queue_entries
      WHERE service_point_id = $1
        AND created_at >= CURRENT_DATE`,
    [input.servicePointId]
  );
  return result.rows[0].next_number;
}

async function insertQueueEntry(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.queue_entries (
       organization_id, healthcare_organization_id, facility_id, service_point_id,
       patient_id, arrival_id, appointment_id, priority_id, queue_number,
       queue_position, status, estimated_wait_minutes, patient_note,
       created_by_staff_id, updated_by_staff_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.facilityId,
      row.servicePointId,
      row.patientId,
      row.arrivalId,
      row.appointmentId || null,
      row.priorityId || null,
      row.queueNumber,
      row.queuePosition,
      row.status || "waiting",
      row.estimatedWaitMinutes || null,
      row.patientNote || null,
      row.createdByStaffId || null,
      row.updatedByStaffId || null,
    ]
  );
  return result.rows[0];
}

async function findQueueEntryByOrgAndId(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.queue_entries
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      LIMIT 1`,
    [input.id, input.organizationId, input.healthcareOrganizationId]
  );
  return result.rows[0] || null;
}

async function updateQueueEntryByOrgAndId(db, input) {
  const sets = [];
  const params = [];
  let i = 1;
  const patch = input.patch || {};
  function set(col, val) {
    sets.push(`${col} = $${i++}`);
    params.push(val);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "status")) set("status", patch.status);
  if (Object.prototype.hasOwnProperty.call(patch, "queuePosition")) {
    set("queue_position", patch.queuePosition);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "calledAt")) set("called_at", patch.calledAt);
  if (Object.prototype.hasOwnProperty.call(patch, "servingStartedAt")) {
    set("serving_started_at", patch.servingStartedAt);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "servingStaffId")) {
    set("serving_staff_id", patch.servingStaffId);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "completedAt")) {
    set("completed_at", patch.completedAt);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "completionOutcome")) {
    set("completion_outcome", patch.completionOutcome);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "assignedRoom")) {
    set("assigned_room", patch.assignedRoom);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "estimatedWaitMinutes")) {
    set("estimated_wait_minutes", patch.estimatedWaitMinutes);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "patientNote")) {
    set("patient_note", patch.patientNote);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "updatedByStaffId")) {
    set("updated_by_staff_id", patch.updatedByStaffId);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "version")) set("version", patch.version);
  if (!sets.length) return findQueueEntryByOrgAndId(db, input);

  params.push(input.id, input.organizationId, input.healthcareOrganizationId);
  let sql = `UPDATE activeclinic.queue_entries SET ${sets.join(", ")}
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

async function listQueueEntriesByServicePoint(db, input) {
  const params = [input.organizationId, input.healthcareOrganizationId, input.servicePointId];
  const where = [
    "organization_id = $1",
    "healthcare_organization_id = $2",
    "service_point_id = $3",
  ];
  let i = 4;
  if (input.status) {
    where.push(`status = $${i++}`);
    params.push(input.status);
  }
  if (input.statuses && input.statuses.length) {
    where.push(`status = ANY($${i++}::text[])`);
    params.push(input.statuses);
  }
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
  const offset = Math.max(Number(input.offset) || 0, 0);
  params.push(limit, offset);
  const result = await db.query(
    `SELECT * FROM activeclinic.queue_entries
      WHERE ${where.join(" AND ")}
      ORDER BY queue_position ASC, created_at ASC
      LIMIT $${i++} OFFSET $${i++}`,
    params
  );
  return result.rows;
}

async function listQueueEntriesByFacility(db, input) {
  const params = [input.organizationId, input.healthcareOrganizationId, input.facilityId];
  const where = [
    "organization_id = $1",
    "healthcare_organization_id = $2",
    "facility_id = $3",
  ];
  let i = 4;
  if (input.status) {
    where.push(`status = $${i++}`);
    params.push(input.status);
  }
  if (input.statuses && input.statuses.length) {
    where.push(`status = ANY($${i++}::text[])`);
    params.push(input.statuses);
  }
  if (input.servicePointIds && input.servicePointIds.length) {
    where.push(`service_point_id = ANY($${i++}::uuid[])`);
    params.push(input.servicePointIds);
  }
  if (input.from) {
    where.push(`created_at >= $${i++}`);
    params.push(input.from);
  }
  if (input.to) {
    where.push(`created_at < $${i++}`);
    params.push(input.to);
  }
  const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 500);
  const offset = Math.max(Number(input.offset) || 0, 0);
  params.push(limit, offset);
  const result = await db.query(
    `SELECT * FROM activeclinic.queue_entries
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${i++} OFFSET $${i++}`,
    params
  );
  return result.rows;
}

async function findActiveQueueEntryForPatient(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.queue_entries
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND patient_id = $3
        AND service_point_id = $4
        AND status IN ('waiting', 'called', 'serving', 'paused')
      LIMIT 1`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.patientId,
      input.servicePointId,
    ]
  );
  return result.rows[0] || null;
}

async function insertQueueStatusEvent(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.queue_status_events (
       organization_id, healthcare_organization_id, queue_entry_id,
       from_status, to_status, reason_code, note, actor_staff_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.queueEntryId,
      row.fromStatus || null,
      row.toStatus,
      row.reasonCode || null,
      row.note || null,
      row.actorStaffId || null,
    ]
  );
  return result.rows[0];
}

async function listQueueStatusEvents(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.queue_status_events
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND queue_entry_id = $3
      ORDER BY created_at ASC`,
    [input.organizationId, input.healthcareOrganizationId, input.queueEntryId]
  );
  return result.rows;
}

async function insertReceptionNote(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.reception_notes (
       organization_id, healthcare_organization_id, arrival_id, queue_entry_id,
       patient_id, note_text, note_category, is_alert, created_by_staff_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.arrivalId || null,
      row.queueEntryId || null,
      row.patientId,
      row.noteText,
      row.noteCategory || "general",
      row.isAlert === true,
      row.createdByStaffId,
    ]
  );
  return result.rows[0];
}

async function listReceptionNotesByPatient(db, input) {
  const params = [input.organizationId, input.healthcareOrganizationId, input.patientId];
  let i = 4;
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 100);
  params.push(limit);
  const result = await db.query(
    `SELECT * FROM activeclinic.reception_notes
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND patient_id = $3
      ORDER BY created_at DESC
      LIMIT $${i++}`,
    params
  );
  return result.rows;
}

module.exports = {
  insertServicePoint,
  findServicePointByOrgAndId,
  listServicePointsByFacility,
  insertQueuePriority,
  listQueuePrioritiesByHCO,
  insertReceptionArrival,
  findReceptionArrivalById,
  listReceptionArrivalsByFacility,
  allocateQueueNumber,
  insertQueueEntry,
  findQueueEntryByOrgAndId,
  updateQueueEntryByOrgAndId,
  listQueueEntriesByServicePoint,
  listQueueEntriesByFacility,
  findActiveQueueEntryForPatient,
  insertQueueStatusEvent,
  listQueueStatusEvents,
  insertReceptionNote,
  listReceptionNotesByPatient,
};
