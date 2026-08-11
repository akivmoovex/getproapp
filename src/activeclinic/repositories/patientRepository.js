"use strict";

/**
 * Persistence for activeclinic.patients (always HCO + organization scoped).
 */

/**
 * @param {{ query: Function }} db
 * @param {object} row
 */
async function insertPatient(db, row) {
  const registrationStatus =
    row.registrationStatus === "incomplete" ? "incomplete" : "complete";
  const result = await db.query(
    `INSERT INTO activeclinic.patients (
       organization_id, healthcare_organization_id, patient_number,
       first_name, middle_name, last_name, preferred_name,
       date_of_birth, estimated_date_of_birth, sex_at_registration,
       nationality_country_code, primary_language,
       phone_normalized, phone_display, email_normalized, email_display,
       address_line_1, address_line_2, city, district, province,
       country_code, postal_code, preferred_contact_method, allow_admin_reminders,
       status, registration_status, created_by_staff_id, updated_by_staff_id
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
       $21,$22,$23,$24,$25,$26,$27,$28,$29
     )
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.patientNumber,
      row.firstName,
      row.middleName,
      row.lastName,
      row.preferredName,
      row.dateOfBirth,
      row.estimatedDateOfBirth === true,
      row.sexAtRegistration,
      row.nationalityCountryCode,
      row.primaryLanguage,
      row.phoneNormalized,
      row.phoneDisplay,
      row.emailNormalized,
      row.emailDisplay,
      row.addressLine1,
      row.addressLine2,
      row.city,
      row.district,
      row.province,
      row.countryCode,
      row.postalCode,
      row.preferredContactMethod,
      row.allowAdminReminders,
      row.status || "active",
      registrationStatus,
      row.createdByStaffId,
      row.updatedByStaffId,
    ]
  );
  return result.rows[0];
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string, healthcareOrganizationId?: string }} input
 */
async function findByOrgAndId(db, input) {
  const params = [input.id, input.organizationId];
  let sql = `SELECT * FROM activeclinic.patients
              WHERE id = $1 AND organization_id = $2`;
  if (input.healthcareOrganizationId) {
    params.push(input.healthcareOrganizationId);
    sql += ` AND healthcare_organization_id = $3`;
  }
  sql += ` LIMIT 1`;
  const result = await db.query(sql, params);
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, healthcareOrganizationId: string, patientNumber: string }} input
 */
async function findByOrgAndNumber(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.patients
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND patient_number = $3
      LIMIT 1`,
    [input.organizationId, input.healthcareOrganizationId, input.patientNumber]
  );
  return result.rows[0] || null;
}

/**
 * Allocate next patient number under row lock for (HCO, year).
 * @param {{ query: Function }} db
 * @param {{ healthcareOrganizationId: string, yearBucket: number }} input
 * @returns {Promise<number>}
 */
async function allocatePatientNumberSequence(db, input) {
  const upsert = await db.query(
    `INSERT INTO activeclinic.patient_number_counters (
       healthcare_organization_id, year_bucket, last_value
     ) VALUES ($1, $2, 0)
     ON CONFLICT (healthcare_organization_id, year_bucket) DO NOTHING
     RETURNING last_value`,
    [input.healthcareOrganizationId, input.yearBucket]
  );
  void upsert;

  const locked = await db.query(
    `SELECT last_value
       FROM activeclinic.patient_number_counters
      WHERE healthcare_organization_id = $1
        AND year_bucket = $2
      FOR UPDATE`,
    [input.healthcareOrganizationId, input.yearBucket]
  );
  const next = Number(locked.rows[0].last_value) + 1;
  await db.query(
    `UPDATE activeclinic.patient_number_counters
        SET last_value = $3, updated_at = now()
      WHERE healthcare_organization_id = $1
        AND year_bucket = $2`,
    [input.healthcareOrganizationId, input.yearBucket, next]
  );
  return next;
}

/**
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function updatePatientByOrgAndId(db, input) {
  const sets = [];
  const params = [];
  let i = 1;

  function set(column, value) {
    sets.push(`${column} = $${i++}`);
    params.push(value);
  }

  const patch = input.patch || {};
  if (Object.prototype.hasOwnProperty.call(patch, "firstName")) set("first_name", patch.firstName);
  if (Object.prototype.hasOwnProperty.call(patch, "middleName")) set("middle_name", patch.middleName);
  if (Object.prototype.hasOwnProperty.call(patch, "lastName")) set("last_name", patch.lastName);
  if (Object.prototype.hasOwnProperty.call(patch, "preferredName")) {
    set("preferred_name", patch.preferredName);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "dateOfBirth")) {
    set("date_of_birth", patch.dateOfBirth);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "estimatedDateOfBirth")) {
    set("estimated_date_of_birth", patch.estimatedDateOfBirth === true);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "registrationStatus")) {
    const status =
      patch.registrationStatus === "incomplete" ? "incomplete" : "complete";
    set("registration_status", status);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "sexAtRegistration")) {
    set("sex_at_registration", patch.sexAtRegistration);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "nationalityCountryCode")) {
    set("nationality_country_code", patch.nationalityCountryCode);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "primaryLanguage")) {
    set("primary_language", patch.primaryLanguage);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "phoneNormalized")) {
    set("phone_normalized", patch.phoneNormalized);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "phoneDisplay")) {
    set("phone_display", patch.phoneDisplay);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "emailNormalized")) {
    set("email_normalized", patch.emailNormalized);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "emailDisplay")) {
    set("email_display", patch.emailDisplay);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "addressLine1")) {
    set("address_line_1", patch.addressLine1);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "addressLine2")) {
    set("address_line_2", patch.addressLine2);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "city")) set("city", patch.city);
  if (Object.prototype.hasOwnProperty.call(patch, "district")) set("district", patch.district);
  if (Object.prototype.hasOwnProperty.call(patch, "province")) set("province", patch.province);
  if (Object.prototype.hasOwnProperty.call(patch, "countryCode")) {
    set("country_code", patch.countryCode);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "postalCode")) {
    set("postal_code", patch.postalCode);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "preferredContactMethod")) {
    set("preferred_contact_method", patch.preferredContactMethod);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "allowAdminReminders")) {
    set("allow_admin_reminders", patch.allowAdminReminders);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "status")) set("status", patch.status);
  if (Object.prototype.hasOwnProperty.call(patch, "deceasedAt")) {
    set("deceased_at", patch.deceasedAt);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "archivedAt")) {
    set("archived_at", patch.archivedAt);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "archiveReason")) {
    set("archive_reason", patch.archiveReason);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "updatedByStaffId")) {
    set("updated_by_staff_id", patch.updatedByStaffId);
  }

  if (!sets.length) {
    return findByOrgAndId(db, {
      id: input.id,
      organizationId: input.organizationId,
      healthcareOrganizationId: input.healthcareOrganizationId,
    });
  }

  params.push(input.id, input.organizationId);
  let where = `WHERE id = $${i++} AND organization_id = $${i++}`;
  if (input.healthcareOrganizationId) {
    params.push(input.healthcareOrganizationId);
    where += ` AND healthcare_organization_id = $${i++}`;
  }

  const result = await db.query(
    `UPDATE activeclinic.patients
        SET ${sets.join(", ")}
      ${where}
      RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Scoped search with explicit limit/offset. Callers must enforce authz.
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function searchPatientsByOrg(db, input) {
  const params = [input.organizationId, input.healthcareOrganizationId];
  const where = [
    "p.organization_id = $1",
    "p.healthcare_organization_id = $2",
  ];
  let i = 3;

  if (input.patientNumber) {
    where.push(`p.patient_number = $${i++}`);
    params.push(input.patientNumber);
  }
  if (input.phoneNormalized) {
    where.push(`p.phone_normalized = $${i++}`);
    params.push(input.phoneNormalized);
  }
  if (input.phoneDigitsPartial) {
    // Match stored E.164 by digit substring (supports 970000001 / 097… / +260…)
    where.push(
      `regexp_replace(COALESCE(p.phone_normalized, ''), '\\D', '', 'g') LIKE $${i++}`
    );
    params.push(`%${String(input.phoneDigitsPartial)}%`);
  }
  if (input.dateOfBirth) {
    where.push(`p.date_of_birth = $${i++}`);
    params.push(input.dateOfBirth);
  }
  if (input.status) {
    where.push(`p.status = $${i++}`);
    params.push(input.status);
  } else if (input.includeArchived !== true) {
    where.push(`p.status <> 'archived'`);
  }
  if (input.excludeDeceased === true) {
    where.push(`p.status <> 'deceased'`);
  }
  if (input.nameQuery) {
    where.push(
      `(lower(p.last_name) LIKE $${i} OR lower(p.first_name) LIKE $${i} OR lower(concat_ws(' ', p.first_name, p.last_name)) LIKE $${i})`
    );
    params.push(`${String(input.nameQuery).toLowerCase()}%`);
    i += 1;
  }
  if (input.identifierType && input.identifierValueNormalized) {
    where.push(`EXISTS (
      SELECT 1 FROM activeclinic.patient_identifiers pi
       WHERE pi.patient_id = p.id
         AND pi.healthcare_organization_id = p.healthcare_organization_id
         AND pi.status <> 'archived'
         AND pi.identifier_type = $${i++}
         AND pi.identifier_value_normalized = $${i++}
    )`);
    params.push(input.identifierType, input.identifierValueNormalized);
  }
  if (input.facilityIds && input.facilityIds.length) {
    where.push(`EXISTS (
      SELECT 1 FROM activeclinic.patient_facility_links l
       WHERE l.patient_id = p.id
         AND l.healthcare_organization_id = p.healthcare_organization_id
         AND l.status = 'active'
         AND l.facility_id = ANY($${i++}::uuid[])
    )`);
    params.push(input.facilityIds);
  }

  const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 100);
  const offset = Math.max(Number(input.offset) || 0, 0);
  params.push(limit, offset);

  const result = await db.query(
    `SELECT p.*
       FROM activeclinic.patients p
      WHERE ${where.join(" AND ")}
      ORDER BY p.last_name ASC, p.first_name ASC, p.patient_number ASC
      LIMIT $${i++} OFFSET $${i++}`,
    params
  );
  return result.rows;
}

/**
 * Duplicate candidates within HCO (bounded).
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function findDuplicateCandidates(db, input) {
  const params = [input.organizationId, input.healthcareOrganizationId];
  const clauses = [];
  let i = 3;

  if (input.identifiers && input.identifiers.length) {
    for (const idn of input.identifiers) {
      clauses.push(`(
        EXISTS (
          SELECT 1 FROM activeclinic.patient_identifiers pi
           WHERE pi.patient_id = p.id
             AND pi.healthcare_organization_id = p.healthcare_organization_id
             AND pi.status <> 'archived'
             AND pi.identifier_type = $${i}
             AND pi.identifier_value_normalized = $${i + 1}
        )
      )`);
      params.push(idn.type, idn.valueNormalized);
      i += 2;
    }
  }
  if (input.phoneNormalized) {
    clauses.push(`p.phone_normalized = $${i++}`);
    params.push(input.phoneNormalized);
  }
  if (input.emailNormalized) {
    clauses.push(`p.email_normalized = $${i++}`);
    params.push(input.emailNormalized);
  }
  if (input.dateOfBirth && input.lastName) {
    clauses.push(`(p.date_of_birth = $${i} AND lower(p.last_name) = lower($${i + 1}))`);
    params.push(input.dateOfBirth, input.lastName);
    i += 2;
  }
  if (input.firstName && input.lastName) {
    clauses.push(`(lower(p.first_name) = lower($${i}) AND lower(p.last_name) = lower($${i + 1}))`);
    params.push(input.firstName, input.lastName);
    i += 2;
  }

  if (!clauses.length) return [];

  params.push(Math.min(Number(input.limit) || 20, 50));
  const result = await db.query(
    `SELECT p.*
       FROM activeclinic.patients p
      WHERE p.organization_id = $1
        AND p.healthcare_organization_id = $2
        AND p.status <> 'archived'
        AND (${clauses.join(" OR ")})
      ORDER BY p.created_at DESC
      LIMIT $${i}`,
    params
  );
  return result.rows;
}

module.exports = {
  insertPatient,
  findByOrgAndId,
  findByOrgAndNumber,
  allocatePatientNumberSequence,
  updatePatientByOrgAndId,
  searchPatientsByOrg,
  findDuplicateCandidates,
};
