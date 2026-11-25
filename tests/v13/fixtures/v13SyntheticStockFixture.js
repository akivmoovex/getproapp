"use strict";

/**
 * Synthetic stocked-dispense fixture for the disposable G78 database.
 * Uses the existing catalogue, stock, encounter, and prescription contracts.
 * The compound name is synthetic. No real medicine is created.
 */

const CLINIC_KEY = "v13-d19-clinic-a";

function stampValue() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function phoneFor(seed) {
  let n = 0;
  for (const ch of String(seed)) n = (n * 33 + ch.charCodeAt(0)) >>> 0;
  return `+260977${String(n % 1000000).padStart(6, "0")}`;
}

function fail(step, code) {
  const detail = code == null || code === "" ? "failed" : String(code);
  throw new Error(`G177_${step}:${detail}`);
}

async function staffForRole(pool, organizationId, facilityId, roleKey, preferredEmail) {
  const found = await pool.query(
    `SELECT sm.id,
            sm.platform_identity_id,
            COALESCE(sm.email_normalized, i.email_normalized) AS email_normalized
       FROM activeclinic.staff_members sm
       JOIN activeclinic.staff_role_assignments a
         ON a.staff_member_id = sm.id
        AND a.organization_id = sm.organization_id
        AND a.status = 'active'
       JOIN blessboard.roles r ON r.id = a.role_id
       LEFT JOIN platform.identities i ON i.id = sm.platform_identity_id
      WHERE sm.organization_id = $1
        AND r.role_key = $2
        AND COALESCE(sm.email_normalized, i.email_normalized) IS NOT NULL
      ORDER BY CASE
                 WHEN COALESCE(sm.email_normalized, i.email_normalized) = $4 THEN 0
                 ELSE 1
               END,
               CASE WHEN a.facility_id = $3 THEN 0 ELSE 1 END,
               sm.created_at ASC
      LIMIT 1`,
    [organizationId, roleKey, facilityId, preferredEmail]
  );
  const row = found.rows[0] || null;
  if (row && typeof row.email_normalized !== "string") return null;
  return row;
}

async function provisionSyntheticStockedDispense(pool, input) {
  const password = input && input.password;
  const env = (input && input.env) || process.env;
  if (!password) fail("PASSWORD", "missing");
  const stamp = stampValue();
  const genericName = `SyntheticCompound ${stamp}`;
  const { createPlatformIdentity } = require("../../../src/platform/services/platformIdentityService");
  const { createStaffMember } = require("../../../src/activeclinic/services/activeClinicStaffService");
  const { assignStaffToFacility } = require("../../../src/activeclinic/services/activeClinicStaffFacilityService");
  const {
    assignStaffRole,
    PHARMACIST,
    CLINICIAN,
    RECEPTIONIST,
    ORGANIZATION_ADMIN,
  } = require("../../../src/activeclinic/services/activeClinicAuthorizationService");
  const { createFacility } = require("../../../src/activeclinic/services/facilityService");
  const {
    addMedication,
    receiveStock,
  } = require("../../../src/activeclinic/services/activeClinicPharmacyService");
  const {
    startEncounter,
    createClinicalOrder,
  } = require("../../../src/activeclinic/services/activeClinicClinicalService");
  const bcrypt = require("bcryptjs");

  const clinic = await pool.query(
    `SELECT o.id AS organization_id,
            h.id AS healthcare_organization_id,
            h.country_code,
            h.timezone,
            h.public_booking_enabled,
            f.id AS facility_id
       FROM platform.organizations o
       JOIN activeclinic.healthcare_organizations h ON h.organization_id = o.id
       JOIN activeclinic.facilities f
         ON f.organization_id = o.id
        AND f.healthcare_organization_id = h.id
        AND f.status = 'active'
      WHERE o.organization_key = $1
      ORDER BY f.is_primary DESC, f.created_at ASC
      LIMIT 1`,
    [CLINIC_KEY]
  );
  const scope = clinic.rows[0];
  if (!scope) fail("CLINIC", "missing");
  if (scope.public_booking_enabled === true) fail("BOOKING", "enabled");

  const admin = await staffForRole(pool, scope.organization_id, scope.facility_id, ORGANIZATION_ADMIN, "admin-a@v13d19.example");
  const clinician = await staffForRole(pool, scope.organization_id, scope.facility_id, CLINICIAN, "clinical-a@v13d19.example");
  const receptionist = await staffForRole(pool, scope.organization_id, scope.facility_id, RECEPTIONIST, "reception-a@v13d19.example");
  if (!admin) fail("ADMIN", "missing");
  if (!clinician) fail("CLINICIAN", "missing");
  if (!receptionist) fail("RECEPTIONIST", "missing");

  const patient = await pool.query(
    `SELECT p.id
       FROM activeclinic.patients p
      WHERE p.organization_id = $1
        AND p.healthcare_organization_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM activeclinic.encounters e
           WHERE e.patient_id = p.id
             AND e.organization_id = p.organization_id
             AND e.facility_id = $3
             AND e.status = 'open'
        )
      ORDER BY p.created_at DESC
      LIMIT 1`,
    [scope.organization_id, scope.healthcare_organization_id, scope.facility_id]
  );
  if (!patient.rows[0]) fail("PATIENT", "missing");

  const pharmacistEmail = `pharm-${stamp}@v13d19.example`;
  const passwordHash = await bcrypt.hash(String(password), 12);
  const identity = await createPlatformIdentity(pool, {
    status: "active",
    primaryEmail: pharmacistEmail,
    passwordHash,
    emailVerifiedAt: new Date().toISOString(),
  });
  const identityId = identity.ok && identity.identity ? identity.identity.id : identity.existingIdentityId;
  if (!identityId) fail("IDENTITY", identity.code);

  const staff = await createStaffMember(pool, {
    organizationId: scope.organization_id,
    healthcareOrganizationId: scope.healthcare_organization_id,
    platformIdentityId: identityId,
    staffNumber: `G177${stamp}`.slice(0, 64),
    firstName: "Synthetic",
    lastName: "Pharmacist",
    preferredName: "Synthetic",
    displayName: `Synthetic Pharmacist ${stamp}`,
    email: pharmacistEmail,
    phone: phoneFor(`${stamp}a`),
    jobTitle: "Pharmacist",
    employmentType: "permanent",
    status: "active",
  });
  if (!staff.ok) fail("STAFF", staff.code);

  const primaryAssignment = await assignStaffToFacility(pool, {
    organizationId: scope.organization_id,
    staffMemberId: staff.staffMember.id,
    facilityId: scope.facility_id,
    isPrimary: true,
  });
  if (!primaryAssignment.ok && primaryAssignment.code !== "facility_assignment_exists") {
    fail("FACILITY_ASSIGNMENT", primaryAssignment.code);
  }
  const primaryRole = await assignStaffRole(pool, {
    organizationId: scope.organization_id,
    staffMemberId: staff.staffMember.id,
    roleKey: PHARMACIST,
    scopeType: "facility",
    facilityId: scope.facility_id,
    assignmentOrigin: "system",
    env,
  });
  if (!primaryRole.ok && primaryRole.code !== "role_assignment_exists") {
    fail("ROLE", primaryRole.code);
  }

  const otherFacility = await createFacility(pool, {
    healthcareOrganizationId: scope.healthcare_organization_id,
    organizationId: scope.organization_id,
    facilityKey: `g177${stamp}`.slice(0, 64),
    displayName: `Synthetic facility ${stamp}`,
    facilityType: "clinic",
    status: "active",
    countryCode: scope.country_code,
    timezone: scope.timezone,
    phone: phoneFor(`${stamp}b`),
    email: `fac-${stamp}@v13d19.example`,
  });
  if (!otherFacility.ok) fail("OTHER_FACILITY", otherFacility.code);

  const otherAssignment = await assignStaffToFacility(pool, {
    organizationId: scope.organization_id,
    staffMemberId: staff.staffMember.id,
    facilityId: otherFacility.facility.id,
    isPrimary: false,
  });
  if (!otherAssignment.ok && otherAssignment.code !== "facility_assignment_exists") {
    fail("OTHER_ASSIGNMENT", otherAssignment.code);
  }
  const otherRole = await assignStaffRole(pool, {
    organizationId: scope.organization_id,
    staffMemberId: staff.staffMember.id,
    roleKey: PHARMACIST,
    scopeType: "facility",
    facilityId: otherFacility.facility.id,
    assignmentOrigin: "system",
    env,
  });
  if (!otherRole.ok && otherRole.code !== "role_assignment_exists") fail("OTHER_ROLE", otherRole.code);

  const medication = await addMedication(pool, {
    staffId: staff.staffMember.id,
    organizationId: scope.organization_id,
    healthcareOrganizationId: scope.healthcare_organization_id,
    facilityId: scope.facility_id,
    genericName,
    strength: "1 mg",
    dosageForm: "tablet",
    unitOfMeasure: "tablet",
  });
  if (!medication.ok) fail("MEDICATION", medication.result);

  const received = await receiveStock(pool, {
    staffId: staff.staffMember.id,
    organizationId: scope.organization_id,
    healthcareOrganizationId: scope.healthcare_organization_id,
    facilityId: scope.facility_id,
    medicationCatalogueItemId: medication.medication.id,
    batchNumber: `SYN-${stamp}-A`,
    quantity: 5,
    expiryDate: "2027-12-31",
    supplierName: "Synthetic supplier",
  });
  if (!received.ok) fail("STOCK", received.result);
  const otherStock = await receiveStock(pool, {
    staffId: staff.staffMember.id,
    organizationId: scope.organization_id,
    healthcareOrganizationId: scope.healthcare_organization_id,
    facilityId: otherFacility.facility.id,
    medicationCatalogueItemId: medication.medication.id,
    batchNumber: `SYN-${stamp}-B`,
    quantity: 4,
    expiryDate: "2027-12-31",
    supplierName: "Synthetic supplier",
  });
  if (!otherStock.ok) fail("OTHER_STOCK", otherStock.result);

  const encounter = await startEncounter(pool, {
    organizationId: scope.organization_id,
    healthcareOrganizationId: scope.healthcare_organization_id,
    facilityId: scope.facility_id,
    patientId: patient.rows[0].id,
    encounterType: "outpatient",
    actor: {
      staffMemberId: admin.id,
      platformIdentityId: admin.platform_identity_id,
    },
  });
  if (!encounter.ok) fail("ENCOUNTER", encounter.code);

  const actor = {
    staffMemberId: clinician.id,
    platformIdentityId: clinician.platform_identity_id,
  };
  const orderInput = {
    organizationId: scope.organization_id,
    healthcareOrganizationId: scope.healthcare_organization_id,
    facilityId: scope.facility_id,
    encounterId: encounter.encounter.id,
    orderType: "prescription",
    actor,
  };
  const blank = await createClinicalOrder(pool, {
    ...orderInput,
    orderDetails: {
      drug_name: genericName,
      dose: "1",
      frequency: "once",
      duration: "1 day",
      quantity: 1,
    },
  });
  if (!blank.ok) fail("BLANK_ORDER", blank.code);
  if (!blank.diagnosticRequest || blank.diagnosticRequest.created !== false) {
    fail("BLANK_ORDER", "entered_queue");
  }

  async function orderQuantity(quantity) {
    const ordered = await createClinicalOrder(pool, {
      ...orderInput,
      orderDetails: {
        drug_name: genericName,
        dose: "1",
        frequency: "once",
        duration: "1 day",
        quantity,
        medication_catalogue_item_id: medication.medication.id,
      },
    });
    if (!ordered.ok || !ordered.diagnosticRequest || ordered.diagnosticRequest.created !== true) {
      fail("ORDER", ordered.code || (ordered.diagnosticRequest && ordered.diagnosticRequest.created));
    }
    const item = await pool.query(
      `SELECT id, quantity_ordered
         FROM activeclinic.pharmacy_prescription_items
        WHERE pharmacy_prescription_id = $1
          AND organization_id = $2`,
      [ordered.diagnosticRequest.id, scope.organization_id]
    );
    if (item.rowCount !== 1) fail("ORDER_ITEM", item.rowCount);
    return {
      clinicalOrderId: ordered.order.id,
      prescriptionId: ordered.diagnosticRequest.id,
      itemId: item.rows[0].id,
      quantityOrdered: Number(item.rows[0].quantity_ordered),
    };
  }

  const overflow = await orderQuantity(10);
  const stocked = await orderQuantity(2);
  const booking = await pool.query(
    `SELECT public_booking_enabled
       FROM activeclinic.healthcare_organizations
      WHERE id = $1 AND organization_id = $2`,
    [scope.healthcare_organization_id, scope.organization_id]
  );
  if (!booking.rows[0] || booking.rows[0].public_booking_enabled === true) fail("BOOKING", "enabled");

  return {
    stamp,
    genericName,
    organizationId: scope.organization_id,
    healthcareOrganizationId: scope.healthcare_organization_id,
    facilityId: scope.facility_id,
    otherFacilityId: otherFacility.facility.id,
    patientId: patient.rows[0].id,
    clinicianId: clinician.id,
    receptionistId: receptionist.id,
    receptionistEmail: receptionist.email_normalized,
    pharmacistId: staff.staffMember.id,
    pharmacistEmail,
    medicationId: medication.medication.id,
    inventoryItemId: received.inventoryItem.id,
    otherInventoryItemId: otherStock.inventoryItem.id,
    batchId: received.batch.id,
    otherBatchId: otherStock.batch.id,
    encounterId: encounter.encounter.id,
    blankClinicalOrderId: blank.order.id,
    overflow,
    stocked,
    prescriptionId: stocked.prescriptionId,
    itemId: stocked.itemId,
  };
}

module.exports = {
  provisionSyntheticStockedDispense,
};
