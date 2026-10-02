"use strict";

/**
 * Persistence for activeclinic.healthcare_organizations.
 */

/**
 * @param {{ query: Function }} db
 * @param {object} row
 */
async function insertHealthcareOrganization(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.healthcare_organizations (
       organization_id, legal_name, public_name, organization_type,
       country_code, registration_number, license_number, status, timezone
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      row.organizationId,
      row.legalName,
      row.publicName,
      row.organizationType,
      row.countryCode,
      row.registrationNumber,
      row.licenseNumber,
      row.status,
      row.timezone,
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
    `SELECT * FROM activeclinic.healthcare_organizations
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [input.id, input.organizationId]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {string} organizationId
 */
async function findByOrganizationId(db, organizationId) {
  const result = await db.query(
    `SELECT * FROM activeclinic.healthcare_organizations
      WHERE organization_id = $1
      LIMIT 1`,
    [organizationId]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string, patch: object }} input
 */
async function updateHealthcareOrganization(db, input) {
  const p = input.patch || {};
  const hasRegistration = Object.prototype.hasOwnProperty.call(p, "registrationNumber");
  const hasLicense = Object.prototype.hasOwnProperty.call(p, "licenseNumber");
  const result = await db.query(
    `UPDATE activeclinic.healthcare_organizations
        SET legal_name = COALESCE($3, legal_name),
            public_name = COALESCE($4, public_name),
            organization_type = COALESCE($5, organization_type),
            country_code = COALESCE($6, country_code),
            registration_number = CASE
              WHEN $11::boolean THEN $7
              ELSE registration_number
            END,
            license_number = CASE
              WHEN $12::boolean THEN $8
              ELSE license_number
            END,
            status = COALESCE($9, status),
            timezone = COALESCE($10, timezone),
            updated_at = now()
      WHERE id = $1 AND organization_id = $2
      RETURNING *`,
    [
      input.id,
      input.organizationId,
      p.legalName != null ? p.legalName : null,
      p.publicName != null ? p.publicName : null,
      p.organizationType != null ? p.organizationType : null,
      p.countryCode != null ? p.countryCode : null,
      hasRegistration ? p.registrationNumber : null,
      hasLicense ? p.licenseNumber : null,
      p.status != null ? p.status : null,
      p.timezone != null ? p.timezone : null,
      hasRegistration,
      hasLicense,
    ]
  );
  return result.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string }} input
 */
async function archiveHealthcareOrganization(db, input) {
  const result = await db.query(
    `UPDATE activeclinic.healthcare_organizations
        SET status = 'archived',
            updated_at = now()
      WHERE id = $1 AND organization_id = $2
      RETURNING *`,
    [input.id, input.organizationId]
  );
  return result.rows[0] || null;
}

module.exports = {
  insertHealthcareOrganization,
  findByIdAndOrganization,
  findByOrganizationId,
  updateHealthcareOrganization,
  archiveHealthcareOrganization,
};
