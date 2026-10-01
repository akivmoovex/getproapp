"use strict";

/**
 * Platform person persistence (V2.04).
 * Products remain source of truth for members/patients until they opt into links.
 */

function mapPerson(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id || null,
    facilityId: row.facility_id || null,
    platformIdentityId: row.platform_identity_id || null,
    status: row.status,
    firstName: row.first_name,
    middleName: row.middle_name || null,
    lastName: row.last_name,
    preferredName: row.preferred_name || null,
    nameNormalized: row.name_normalized,
    dateOfBirth: row.date_of_birth || null,
    phoneDisplay: row.phone_display || null,
    phoneNormalized: row.phone_normalized || null,
    phoneVerifiedAt: row.phone_verified_at || null,
    emailDisplay: row.email_display || null,
    emailNormalized: row.email_normalized || null,
    emailVerifiedAt: row.email_verified_at || null,
    createdByIdentityId: row.created_by_identity_id || null,
    updatedByIdentityId: row.updated_by_identity_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    personId: row.person_id,
    productCode: row.product_code,
    relationshipKey: row.relationship_key,
    subjectRef: row.subject_ref,
    status: row.status,
    branchId: row.branch_id || null,
    facilityId: row.facility_id || null,
    linkedAt: row.linked_at,
    unlinkedAt: row.unlinked_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAddress(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    personId: row.person_id,
    addressKind: row.address_kind,
    isPrimary: row.is_primary === true,
    line1: row.line_1 || null,
    line2: row.line_2 || null,
    city: row.city || null,
    district: row.district || null,
    province: row.province || null,
    postalCode: row.postal_code || null,
    countryCode: row.country_code || null,
    locationId: row.location_id || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRelatedContact(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    personId: row.person_id,
    contactRole: row.contact_role,
    fullName: row.full_name,
    relationshipLabel: row.relationship_label || null,
    phoneDisplay: row.phone_display || null,
    phoneNormalized: row.phone_normalized || null,
    emailDisplay: row.email_display || null,
    emailNormalized: row.email_normalized || null,
    isPrimary: row.is_primary === true,
    consentToContact:
      row.consent_to_contact == null ? null : row.consent_to_contact === true,
    notes: row.notes || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insertPerson(db, row) {
  const result = await db.query(
    `INSERT INTO platform.persons (
       organization_id, branch_id, facility_id, platform_identity_id, status,
       first_name, middle_name, last_name, preferred_name, name_normalized,
       date_of_birth, phone_display, phone_normalized, phone_verified_at,
       email_display, email_normalized, email_verified_at,
       created_by_identity_id, updated_by_identity_id
     ) VALUES (
       $1,$2,$3,$4,$5,
       $6,$7,$8,$9,$10,
       $11,$12,$13,$14,
       $15,$16,$17,
       $18,$19
     )
     RETURNING *`,
    [
      row.organizationId,
      row.branchId || null,
      row.facilityId || null,
      row.platformIdentityId || null,
      row.status || "active",
      row.firstName,
      row.middleName || null,
      row.lastName,
      row.preferredName || null,
      row.nameNormalized,
      row.dateOfBirth || null,
      row.phoneDisplay || null,
      row.phoneNormalized || null,
      row.phoneVerifiedAt || null,
      row.emailDisplay || null,
      row.emailNormalized || null,
      row.emailVerifiedAt || null,
      row.createdByIdentityId || null,
      row.updatedByIdentityId || null,
    ]
  );
  return mapPerson(result.rows[0]);
}

async function findPersonById(db, { organizationId, personId }) {
  const result = await db.query(
    `SELECT * FROM platform.persons
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [personId, organizationId]
  );
  return mapPerson(result.rows[0] || null);
}

async function updatePersonDemographics(db, row) {
  const result = await db.query(
    `UPDATE platform.persons SET
       first_name = $3,
       middle_name = $4,
       last_name = $5,
       preferred_name = $6,
       name_normalized = $7,
       date_of_birth = $8,
       phone_display = $9,
       phone_normalized = $10,
       email_display = $11,
       email_normalized = $12,
       branch_id = COALESCE($13, branch_id),
       facility_id = COALESCE($14, facility_id),
       updated_by_identity_id = $15,
       updated_at = now()
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [
      row.personId,
      row.organizationId,
      row.firstName,
      row.middleName || null,
      row.lastName,
      row.preferredName || null,
      row.nameNormalized,
      row.dateOfBirth || null,
      row.phoneDisplay || null,
      row.phoneNormalized || null,
      row.emailDisplay || null,
      row.emailNormalized || null,
      row.branchId,
      row.facilityId,
      row.updatedByIdentityId || null,
    ]
  );
  return mapPerson(result.rows[0] || null);
}

async function setPersonVerificationState(db, row) {
  const result = await db.query(
    `UPDATE platform.persons SET
       phone_verified_at = CASE WHEN $3::boolean THEN COALESCE(phone_verified_at, now())
                                WHEN $4::boolean THEN NULL
                                ELSE phone_verified_at END,
       email_verified_at = CASE WHEN $5::boolean THEN COALESCE(email_verified_at, now())
                                WHEN $6::boolean THEN NULL
                                ELSE email_verified_at END,
       updated_by_identity_id = $7,
       updated_at = now()
     WHERE id = $1 AND organization_id = $2
     RETURNING *`,
    [
      row.personId,
      row.organizationId,
      row.markPhoneVerified === true,
      row.clearPhoneVerified === true,
      row.markEmailVerified === true,
      row.clearEmailVerified === true,
      row.updatedByIdentityId || null,
    ]
  );
  return mapPerson(result.rows[0] || null);
}

async function linkPersonToProduct(db, row) {
  const result = await db.query(
    `INSERT INTO platform.person_product_links (
       organization_id, person_id, product_code, relationship_key, subject_ref,
       status, branch_id, facility_id, created_by_identity_id, updated_by_identity_id
     ) VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$9)
     RETURNING *`,
    [
      row.organizationId,
      row.personId,
      row.productCode,
      row.relationshipKey,
      row.subjectRef,
      row.branchId || null,
      row.facilityId || null,
      row.createdByIdentityId || null,
      row.updatedByIdentityId || null,
    ]
  );
  return mapLink(result.rows[0]);
}

async function findLiveProductLink(db, {
  organizationId,
  productCode,
  relationshipKey,
  subjectRef,
}) {
  const result = await db.query(
    `SELECT * FROM platform.person_product_links
      WHERE organization_id = $1
        AND product_code = $2
        AND relationship_key = $3
        AND subject_ref = $4
        AND status IN ('active', 'inactive')
      LIMIT 1`,
    [organizationId, productCode, relationshipKey, subjectRef]
  );
  return mapLink(result.rows[0] || null);
}

async function listProductLinksForPerson(db, { organizationId, personId }) {
  const result = await db.query(
    `SELECT * FROM platform.person_product_links
      WHERE organization_id = $1 AND person_id = $2
      ORDER BY linked_at ASC`,
    [organizationId, personId]
  );
  return result.rows.map(mapLink);
}

async function insertAddress(db, row) {
  const result = await db.query(
    `INSERT INTO platform.person_addresses (
       organization_id, person_id, address_kind, is_primary,
       line_1, line_2, city, district, province, postal_code,
       country_code, location_id, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active')
     RETURNING *`,
    [
      row.organizationId,
      row.personId,
      row.addressKind,
      row.isPrimary === true,
      row.line1 || null,
      row.line2 || null,
      row.city || null,
      row.district || null,
      row.province || null,
      row.postalCode || null,
      row.countryCode || null,
      row.locationId || null,
    ]
  );
  return mapAddress(result.rows[0]);
}

async function listAddressesForPerson(db, { organizationId, personId }) {
  const result = await db.query(
    `SELECT * FROM platform.person_addresses
      WHERE organization_id = $1 AND person_id = $2
        AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC`,
    [organizationId, personId]
  );
  return result.rows.map(mapAddress);
}

async function insertRelatedContact(db, row) {
  const result = await db.query(
    `INSERT INTO platform.person_related_contacts (
       organization_id, person_id, contact_role, full_name, relationship_label,
       phone_display, phone_normalized, email_display, email_normalized,
       is_primary, consent_to_contact, notes, status,
       created_by_identity_id, updated_by_identity_id
     ) VALUES (
       $1,$2,$3,$4,$5,
       $6,$7,$8,$9,
       $10,$11,$12,'active',
       $13,$14
     )
     RETURNING *`,
    [
      row.organizationId,
      row.personId,
      row.contactRole,
      row.fullName,
      row.relationshipLabel || null,
      row.phoneDisplay || null,
      row.phoneNormalized || null,
      row.emailDisplay || null,
      row.emailNormalized || null,
      row.isPrimary === true,
      row.consentToContact,
      row.notes || null,
      row.createdByIdentityId || null,
      row.updatedByIdentityId || null,
    ]
  );
  return mapRelatedContact(result.rows[0]);
}

async function listRelatedContactsForPerson(db, { organizationId, personId }) {
  const result = await db.query(
    `SELECT * FROM platform.person_related_contacts
      WHERE organization_id = $1 AND person_id = $2
        AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC`,
    [organizationId, personId]
  );
  return result.rows.map(mapRelatedContact);
}

module.exports = {
  mapPerson,
  mapLink,
  mapAddress,
  mapRelatedContact,
  insertPerson,
  findPersonById,
  updatePersonDemographics,
  setPersonVerificationState,
  linkPersonToProduct,
  findLiveProductLink,
  listProductLinksForPerson,
  insertAddress,
  listAddressesForPerson,
  insertRelatedContact,
  listRelatedContactsForPerson,
};
