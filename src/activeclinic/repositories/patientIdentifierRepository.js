"use strict";

/**
 * Persistence for activeclinic.patient_identifiers (HCO scoped).
 */

async function insertIdentifier(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.patient_identifiers (
       organization_id, healthcare_organization_id, patient_id,
       identifier_type, identifier_value_normalized, identifier_value_display,
       issuing_country_code, issuer, is_primary, verification_status, verified_at,
       status, created_by_staff_id
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
     )
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.patientId,
      row.identifierType,
      row.identifierValueNormalized,
      row.identifierValueDisplay,
      row.issuingCountryCode,
      row.issuer,
      row.isPrimary === true,
      row.verificationStatus || "unverified",
      row.verifiedAt || null,
      row.status || "active",
      row.createdByStaffId || null,
    ]
  );
  return result.rows[0];
}

async function listByPatient(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.patient_identifiers
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND patient_id = $3
        AND ($4::boolean = true OR status <> 'archived')
      ORDER BY is_primary DESC, created_at ASC`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.patientId,
      input.includeArchived === true,
    ]
  );
  return result.rows;
}

async function findByOrgAndId(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.patient_identifiers
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      LIMIT 1`,
    [input.id, input.organizationId, input.healthcareOrganizationId]
  );
  return result.rows[0] || null;
}

async function findLiveByTypeAndValue(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.patient_identifiers
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND identifier_type = $3
        AND identifier_value_normalized = $4
        AND status <> 'archived'
      LIMIT 1`,
    [
      input.organizationId,
      input.healthcareOrganizationId,
      input.identifierType,
      input.identifierValueNormalized,
    ]
  );
  return result.rows[0] || null;
}

async function updateIdentifier(db, input) {
  const sets = [];
  const params = [];
  let i = 1;
  const patch = input.patch || {};

  function set(column, value) {
    sets.push(`${column} = $${i++}`);
    params.push(value);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "identifierValueNormalized")) {
    set("identifier_value_normalized", patch.identifierValueNormalized);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "identifierValueDisplay")) {
    set("identifier_value_display", patch.identifierValueDisplay);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "issuingCountryCode")) {
    set("issuing_country_code", patch.issuingCountryCode);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "issuer")) set("issuer", patch.issuer);
  if (Object.prototype.hasOwnProperty.call(patch, "isPrimary")) {
    set("is_primary", patch.isPrimary === true);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "verificationStatus")) {
    set("verification_status", patch.verificationStatus);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "verifiedAt")) {
    set("verified_at", patch.verifiedAt);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "status")) set("status", patch.status);
  if (Object.prototype.hasOwnProperty.call(patch, "archivedAt")) {
    set("archived_at", patch.archivedAt);
  }

  if (!sets.length) {
    return findByOrgAndId(db, input);
  }

  params.push(input.id, input.organizationId, input.healthcareOrganizationId);
  const result = await db.query(
    `UPDATE activeclinic.patient_identifiers
        SET ${sets.join(", ")}
      WHERE id = $${i++}
        AND organization_id = $${i++}
        AND healthcare_organization_id = $${i++}
      RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

async function clearPrimaryForPatient(db, input) {
  await db.query(
    `UPDATE activeclinic.patient_identifiers
        SET is_primary = false
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND patient_id = $3
        AND is_primary = true
        AND status = 'active'`,
    [input.organizationId, input.healthcareOrganizationId, input.patientId]
  );
}

module.exports = {
  insertIdentifier,
  listByPatient,
  findByOrgAndId,
  findLiveByTypeAndValue,
  updateIdentifier,
  clearPrimaryForPatient,
};
