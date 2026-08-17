"use strict";

/**
 * Persistence for activeclinic.facilities (always organization-scoped).
 */

/**
 * @param {{ query: Function }} db
 * @param {object} row
 */
async function insertFacility(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.facilities (
       organization_id, healthcare_organization_id, facility_key,
       display_name, legal_name, facility_type, status, is_primary,
       country_code, province, district, city,
       address_line_1, address_line_2, postal_code,
       phone_normalized, phone_display, email_normalized, email_display, timezone,
       public_hours_json
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
     )
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.facilityKey,
      row.displayName,
      row.legalName,
      row.facilityType,
      row.status,
      row.isPrimary === true,
      row.countryCode,
      row.province,
      row.district,
      row.city,
      row.addressLine1,
      row.addressLine2,
      row.postalCode,
      row.phoneNormalized,
      row.phoneDisplay,
      row.emailNormalized,
      row.emailDisplay,
      row.timezone,
      row.publicHoursJson != null ? JSON.stringify(row.publicHoursJson) : null,
    ]
  );
  return result.rows[0];
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string }} input
 */
async function findByIdAndOrganization(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.facilities
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [input.id, input.organizationId]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, facilityKey: string }} input
 */
async function findByOrganizationAndKey(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.facilities
      WHERE organization_id = $1 AND facility_key = $2
      LIMIT 1`,
    [input.organizationId, input.facilityKey]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ healthcareOrganizationId: string, facilityKey: string, organizationId: string }} input
 */
async function findByHealthcareOrganizationAndKey(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.facilities
      WHERE healthcare_organization_id = $1
        AND facility_key = $2
        AND organization_id = $3
      LIMIT 1`,
    [input.healthcareOrganizationId, input.facilityKey, input.organizationId]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, status?: string|null }} input
 */
async function listByOrganization(db, input) {
  if (input.status) {
    const result = await db.query(
      `SELECT * FROM activeclinic.facilities
        WHERE organization_id = $1 AND status = $2
        ORDER BY is_primary DESC, facility_key ASC`,
      [input.organizationId, input.status]
    );
    return result.rows;
  }
  const result = await db.query(
    `SELECT * FROM activeclinic.facilities
      WHERE organization_id = $1
      ORDER BY is_primary DESC, facility_key ASC`,
    [input.organizationId]
  );
  return result.rows;
}

/**
 * @param {{ query: Function }} db
 * @param {{ healthcareOrganizationId: string, organizationId: string, status?: string|null }} input
 */
async function listByHealthcareOrganization(db, input) {
  if (input.status) {
    const result = await db.query(
      `SELECT * FROM activeclinic.facilities
        WHERE healthcare_organization_id = $1
          AND organization_id = $2
          AND status = $3
        ORDER BY is_primary DESC, facility_key ASC`,
      [input.healthcareOrganizationId, input.organizationId, input.status]
    );
    return result.rows;
  }
  const result = await db.query(
    `SELECT * FROM activeclinic.facilities
      WHERE healthcare_organization_id = $1
        AND organization_id = $2
      ORDER BY is_primary DESC, facility_key ASC`,
    [input.healthcareOrganizationId, input.organizationId]
  );
  return result.rows;
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string, patch: object }} input
 */
async function updateFacility(db, input) {
  const p = input.patch || {};
  const result = await db.query(
    `UPDATE activeclinic.facilities
        SET display_name = COALESCE($3, display_name),
            legal_name = COALESCE($4, legal_name),
            facility_type = COALESCE($5, facility_type),
            status = COALESCE($6, status),
            is_primary = COALESCE($7, is_primary),
            country_code = COALESCE($8, country_code),
            province = COALESCE($9, province),
            district = COALESCE($10, district),
            city = COALESCE($11, city),
            address_line_1 = COALESCE($12, address_line_1),
            address_line_2 = COALESCE($13, address_line_2),
            postal_code = COALESCE($14, postal_code),
            phone_normalized = COALESCE($15, phone_normalized),
            phone_display = COALESCE($16, phone_display),
            email_normalized = COALESCE($17, email_normalized),
            email_display = COALESCE($18, email_display),
            timezone = COALESCE($19, timezone),
            public_hours_json = COALESCE($20::jsonb, public_hours_json),
            updated_at = now()
      WHERE id = $1 AND organization_id = $2
      RETURNING *`,
    [
      input.id,
      input.organizationId,
      p.displayName != null ? p.displayName : null,
      p.legalName !== undefined ? p.legalName : null,
      p.facilityType != null ? p.facilityType : null,
      p.status != null ? p.status : null,
      p.isPrimary != null ? p.isPrimary : null,
      p.countryCode != null ? p.countryCode : null,
      p.province !== undefined ? p.province : null,
      p.district !== undefined ? p.district : null,
      p.city !== undefined ? p.city : null,
      p.addressLine1 !== undefined ? p.addressLine1 : null,
      p.addressLine2 !== undefined ? p.addressLine2 : null,
      p.postalCode !== undefined ? p.postalCode : null,
      p.phoneNormalized != null ? p.phoneNormalized : null,
      p.phoneDisplay != null ? p.phoneDisplay : null,
      p.emailNormalized !== undefined ? p.emailNormalized : null,
      p.emailDisplay !== undefined ? p.emailDisplay : null,
      p.timezone != null ? p.timezone : null,
      p.publicHoursJson !== undefined && p.publicHoursJson != null
        ? JSON.stringify(p.publicHoursJson)
        : null,
    ]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string }} input
 */
async function archiveFacility(db, input) {
  const result = await db.query(
    `UPDATE activeclinic.facilities
        SET status = 'archived',
            is_primary = false,
            updated_at = now()
      WHERE id = $1 AND organization_id = $2
      RETURNING *`,
    [input.id, input.organizationId]
  );
  return result.rows[0] || null;
}

/**
 * Clear active primary flags for an HCO, then set the target facility primary+active.
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string, healthcareOrganizationId: string }} input
 */
async function setPrimaryFacility(db, input) {
  await db.query(
    `UPDATE activeclinic.facilities
        SET is_primary = false,
            updated_at = now()
      WHERE healthcare_organization_id = $1
        AND organization_id = $2
        AND is_primary = true
        AND status = 'active'
        AND id IS DISTINCT FROM $3`,
    [input.healthcareOrganizationId, input.organizationId, input.id]
  );
  const result = await db.query(
    `UPDATE activeclinic.facilities
        SET is_primary = true,
            status = 'active',
            updated_at = now()
      WHERE id = $1 AND organization_id = $2
      RETURNING *`,
    [input.id, input.organizationId]
  );
  return result.rows[0] || null;
}

module.exports = {
  insertFacility,
  findByIdAndOrganization,
  findByOrganizationAndKey,
  findByHealthcareOrganizationAndKey,
  listByOrganization,
  listByHealthcareOrganization,
  updateFacility,
  archiveFacility,
  setPrimaryFacility,
};
