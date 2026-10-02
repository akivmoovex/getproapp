"use strict";

/**
 * Persistence for activeclinic.patient_emergency_contacts.
 */

async function insertContact(db, row) {
  const result = await db.query(
    `INSERT INTO activeclinic.patient_emergency_contacts (
       organization_id, healthcare_organization_id, patient_id,
       full_name, relationship, phone_normalized, phone_display,
       email_normalized, email_display, address_summary,
       is_primary, consent_to_contact, status, created_by_staff_id
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
     )
     RETURNING *`,
    [
      row.organizationId,
      row.healthcareOrganizationId,
      row.patientId,
      row.fullName,
      row.relationship,
      row.phoneNormalized,
      row.phoneDisplay,
      row.emailNormalized,
      row.emailDisplay,
      row.addressSummary,
      row.isPrimary === true,
      row.consentToContact,
      row.status || "active",
      row.createdByStaffId || null,
    ]
  );
  return result.rows[0];
}

async function listByPatient(db, input) {
  const result = await db.query(
    `SELECT * FROM activeclinic.patient_emergency_contacts
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
    `SELECT * FROM activeclinic.patient_emergency_contacts
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      LIMIT 1`,
    [input.id, input.organizationId, input.healthcareOrganizationId]
  );
  return result.rows[0] || null;
}

async function clearPrimaryForPatient(db, input) {
  await db.query(
    `UPDATE activeclinic.patient_emergency_contacts
        SET is_primary = false
      WHERE organization_id = $1
        AND healthcare_organization_id = $2
        AND patient_id = $3
        AND is_primary = true
        AND status = 'active'`,
    [input.organizationId, input.healthcareOrganizationId, input.patientId]
  );
}

async function updateContact(db, input) {
  const sets = [];
  const params = [];
  let i = 1;
  const patch = input.patch || {};

  function set(column, value) {
    sets.push(`${column} = $${i++}`);
    params.push(value);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "fullName")) set("full_name", patch.fullName);
  if (Object.prototype.hasOwnProperty.call(patch, "relationship")) {
    set("relationship", patch.relationship);
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
  if (Object.prototype.hasOwnProperty.call(patch, "addressSummary")) {
    set("address_summary", patch.addressSummary);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "isPrimary")) {
    set("is_primary", patch.isPrimary === true);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "consentToContact")) {
    set("consent_to_contact", patch.consentToContact);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "status")) set("status", patch.status);
  if (Object.prototype.hasOwnProperty.call(patch, "archivedAt")) {
    set("archived_at", patch.archivedAt);
  }

  if (!sets.length) return findByOrgAndId(db, input);

  params.push(input.id, input.organizationId, input.healthcareOrganizationId);
  const result = await db.query(
    `UPDATE activeclinic.patient_emergency_contacts
        SET ${sets.join(", ")}
      WHERE id = $${i++}
        AND organization_id = $${i++}
        AND healthcare_organization_id = $${i++}
      RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

module.exports = {
  insertContact,
  listByPatient,
  findByOrgAndId,
  clearPrimaryForPatient,
  updateContact,
};
