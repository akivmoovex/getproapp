"use strict";

/**
 * Service ↔ practitioner assignments and availability persistence (Batch 1A).
 */

async function listAssignmentsForService(db, input) {
  const result = await db.query(
    `SELECT a.*, s.display_name, s.status AS staff_status, s.job_title
       FROM activeclinic.service_staff_assignments a
       JOIN activeclinic.staff_members s
         ON s.id = a.staff_member_id
        AND s.healthcare_organization_id = a.healthcare_organization_id
      WHERE a.organization_id = $1
        AND a.healthcare_organization_id = $2
        AND a.service_type_id = $3
        AND ($4::boolean = true OR a.status = 'active')
      ORDER BY s.display_name ASC`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.serviceTypeId,
      input.includeInactive === true,
    ]
  );
  return result.rows;
}

async function replaceServiceStaffAssignments(db, input) {
  const staffIds = Array.isArray(input.staffMemberIds)
    ? [...new Set(input.staffMemberIds.map(String).filter(Boolean))]
    : [];
  await db.query(
    `UPDATE activeclinic.service_staff_assignments
        SET status = 'inactive', updated_at = now()
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND service_type_id = $3
        AND status = 'active'`,
    [input.organizationId, input.healthcareOrganizationId, input.serviceTypeId]
  );
  for (const staffMemberId of staffIds) {
    await db.query(
      `INSERT INTO activeclinic.service_staff_assignments (
         organization_id, healthcare_organization_id, service_type_id,
         staff_member_id, status
       ) VALUES ($1,$2,$3,$4,'active')
       ON CONFLICT (service_type_id, staff_member_id)
       DO UPDATE SET status = 'active', updated_at = now()`,
      [
        input.organizationId,
        input.healthcareOrganizationId,
        input.serviceTypeId,
        staffMemberId,
      ]
    );
  }
  return listAssignmentsForService(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    serviceTypeId: input.serviceTypeId,
  });
}

async function listWeeklyAvailability(db, input) {
  const result = await db.query(
    `SELECT *
       FROM activeclinic.staff_weekly_availability
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND staff_member_id = $3
        AND ($4::boolean = true OR status = 'active')
      ORDER BY day_of_week ASC, starts_at_local ASC`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.staffMemberId,
      input.includeInactive === true,
    ]
  );
  return result.rows;
}

async function replaceWeeklyAvailability(db, input) {
  const slots = Array.isArray(input.slots) ? input.slots : [];
  await db.query(
    `UPDATE activeclinic.staff_weekly_availability
        SET status = 'inactive', updated_at = now()
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND staff_member_id = $3
        AND status = 'active'`,
    [input.organizationId, input.healthcareOrganizationId, input.staffMemberId]
  );
  const inserted = [];
  for (const slot of slots) {
    const day = Number(slot.dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const starts = String(slot.startsAtLocal || "").trim();
    const ends = String(slot.endsAtLocal || "").trim();
    if (!starts || !ends) continue;
    const result = await db.query(
      `INSERT INTO activeclinic.staff_weekly_availability (
         organization_id, healthcare_organization_id, staff_member_id,
         facility_id, day_of_week, starts_at_local, ends_at_local, status
       ) VALUES ($1,$2,$3,$4,$5,$6::time,$7::time,'active')
       RETURNING *`,
      [
        input.organizationId,
        input.healthcareOrganizationId,
        input.staffMemberId,
        slot.facilityId || null,
        day,
        starts,
        ends,
      ]
    );
    inserted.push(result.rows[0]);
  }
  return inserted;
}

async function listAvailabilityBlocks(db, input) {
  const result = await db.query(
    `SELECT *
       FROM activeclinic.staff_availability_blocks
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND staff_member_id = $3
        AND ($4::boolean = true OR status = 'active')
      ORDER BY starts_at ASC`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.staffMemberId,
      input.includeCancelled === true,
    ]
  );
  return result.rows;
}

async function insertAvailabilityBlock(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.staff_availability_blocks (
       organization_id, healthcare_organization_id, staff_member_id,
       facility_id, block_kind, starts_at, ends_at, reason,
       status, created_by_staff_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9)
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.staffMemberId,
      row.facilityId || null,
      row.blockKind || "leave",
      row.startsAt,
      row.endsAt,
      row.reason || null,
      row.createdByStaffId || null,
    ]
  );
  return result.rows[0];
}

async function cancelAvailabilityBlock(db, input) {
  const result = await db.query(
    `UPDATE activeclinic.staff_availability_blocks
        SET status = 'cancelled', updated_at = now()
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
        AND staff_member_id = $4
      RETURNING *`,
    [
      input.id,
      input.organizationId,
      input.healthcareOrganizationId,
      input.staffMemberId,
    ]
  );
  return result.rows[0] || null;
}

async function countActiveServices(db, input) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM activeclinic.appointment_service_types
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND status = 'active'`,
    [input.organizationId, input.healthcareOrganizationId]
  );
  return Number(result.rows[0] && result.rows[0].n) || 0;
}

async function countPublicBookablePractitioners(db, input) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM activeclinic.staff_members
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND status = 'active'
        AND public_bookable = true`,
    [input.organizationId, input.healthcareOrganizationId]
  );
  return Number(result.rows[0] && result.rows[0].n) || 0;
}

module.exports = {
  listAssignmentsForService,
  replaceServiceStaffAssignments,
  listWeeklyAvailability,
  replaceWeeklyAvailability,
  listAvailabilityBlocks,
  insertAvailabilityBlock,
  cancelAvailabilityBlock,
  countActiveServices,
  countPublicBookablePractitioners,
};
