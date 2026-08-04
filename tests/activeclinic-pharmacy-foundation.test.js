"use strict";

/**
 * ActiveClinic P05 pharmacy foundation tests.
 * Medication catalogue, inventory, stock movements, prescriptions, dispensing, batch/expiry, authz, tenant isolation.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const {
  createFacility,
} = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  addMedication,
  listMedications,
  getMedicationById,
  receiveStock,
  listInventoryItems,
  listLowStockItems,
  listExpiringBatches,
  listPrescriptionQueue,
  getPrescriptionById,
  dispensePrescription,
  createPharmacyPrescription,
  RESULT,
  PERM,
} = require("../src/activeclinic/services/activeClinicPharmacyService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 970000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

async function provisionOrg(input) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    ...input,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

async function seedTenant(stamp, tag) {
  const org = await provisionOrg({
    organizationKey: `ac_pharm_${tag}_${stamp}`,
    displayName: `AC Pharm ${tag}`,
    productKey: "activeclinic",
    productTenantKey: `ac-pharm-${tag}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Pharm Legal",
    publicName: "Pharm Public",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `main-${tag}`.slice(0, 64),
    displayName: "Main",
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  const staff = await createStaffMember(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    firstName: "Pharm",
    lastName: `Staff${tag}`,
    employmentType: "permanent",
    status: "active",
    phone: nextPhone(),
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
  });
  const role = await assignStaffRole(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    roleKey: NETWORK_ADMIN,
    scopeType: "organisation",
  });
  assert.equal(role.ok, true, JSON.stringify(role));
  const patient = await registerActiveClinicPatient(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    actor: { staffMemberId: staff.staffMember.id },
    demographics: { firstName: "Test", lastName: "Patient", dateOfBirth: "1990-01-01" },
    registrationMethod: "walk_in",
  });
  assert.equal(patient.ok, true, JSON.stringify(patient));

  return {
    org,
    hco,
    facility,
    staff,
    patient,
  };
}

describe("ActiveClinic P05 Pharmacy Foundation", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("should add medication to catalogue", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "addmed");

    const medicationResult = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
      standardCost: 0.5,
      reorderLevel: 100,
      storageConditions: "room temperature",
      notes: "Common analgesic",
    });

    assert.equal(medicationResult.ok, true);
    assert.equal(medicationResult.result, RESULT.OK);
    assert.equal(medicationResult.medication.genericName, "Paracetamol");
    assert.equal(medicationResult.medication.strength, "500mg");
    assert.equal(medicationResult.medication.dosageForm, "tablet");
    assert.equal(medicationResult.medication.status, "active");
  });

  it("should prevent duplicate medication in catalogue", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "dupmed");

    const firstResult = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Amoxicillin",
      strength: "250mg",
      dosageForm: "capsule",
      unitOfMeasure: "capsule",
    });

    assert.equal(firstResult.ok, true);

    const duplicateResult = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Amoxicillin",
      strength: "250mg",
      dosageForm: "capsule",
      unitOfMeasure: "capsule",
    });

    assert.equal(duplicateResult.ok, false);
    assert.equal(duplicateResult.result, RESULT.DUPLICATE_MEDICATION);
  });

  it("should list medications in catalogue", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "listmed");

    await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Ibuprofen",
      strength: "400mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Amoxicillin",
      strength: "500mg",
      dosageForm: "capsule",
      unitOfMeasure: "capsule",
    });

    const listResult = await listMedications(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      status: "active",
    });

    assert.equal(listResult.ok, true);
    assert.equal(listResult.result, RESULT.OK);
    assert.equal(listResult.medications.length >= 2, true);
  });

  it("should receive stock and create inventory item, batch, and movement", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "recvstock");

    const medicationResult = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    assert.equal(medicationResult.ok, true);

    const receiveResult = await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: medicationResult.medication.id,
      batchNumber: "BATCH001",
      quantity: 500,
      expiryDate: "2027-12-31",
      supplierName: "MedSupply Inc",
      costPerUnit: 0.45,
    });

    assert.equal(receiveResult.ok, true);
    assert.equal(receiveResult.result, RESULT.OK);
    assert.equal(receiveResult.inventoryItem.currentQuantity, 500);
    assert.equal(receiveResult.batch.batchNumber, "BATCH001");
    assert.equal(receiveResult.batch.quantityInBatch, 500);
    assert.equal(receiveResult.movement.movementType, "receive");
    assert.equal(receiveResult.movement.quantityDelta, 500);
  });

  it("should prevent negative stock", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "negstock");

    const medicationResult = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Aspirin",
      strength: "300mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: medicationResult.medication.id,
      batchNumber: "BATCH002",
      quantity: 100,
      expiryDate: "2027-12-31",
    });

    // Attempt to insert a negative stock movement manually.
    try {
      await pool.query(
        `INSERT INTO activeclinic.stock_movements (
          organization_id, healthcare_organization_id, facility_id, inventory_item_id,
          movement_type, quantity_delta, performed_by_staff_id
        )
        SELECT $1, $2, $3, ii.id, 'adjustment', -200, $4
        FROM activeclinic.inventory_items ii
        WHERE ii.medication_catalogue_item_id = $5 AND ii.facility_id = $3`,
        [
          tenant.org.records.organization.id,
          tenant.hco.healthcareOrganization.id,
          tenant.facility.facility.id,
          tenant.staff.staffMember.id,
          medicationResult.medication.id,
        ]
      );
      assert.fail("Should have thrown error for negative stock");
    } catch (err) {
      assert.match(err.message, /negative inventory/i);
    }
  });

  it("should list inventory items for a facility", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "listinv");

    const med1 = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    const med2 = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Ibuprofen",
      strength: "400mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: med1.medication.id,
      batchNumber: "BATCH003",
      quantity: 300,
      expiryDate: "2027-12-31",
    });

    await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: med2.medication.id,
      batchNumber: "BATCH004",
      quantity: 150,
      expiryDate: "2027-12-31",
    });

    const listResult = await listInventoryItems(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      facilityId: tenant.facility.facility.id,
    });

    assert.equal(listResult.ok, true);
    assert.equal(listResult.result, RESULT.OK);
    assert.equal(listResult.inventoryItems.length >= 2, true);
  });

  it("should list low stock items", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "lowstock");

    const medicationResult = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
      reorderLevel: 100,
    });

    const receiveResult = await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: medicationResult.medication.id,
      batchNumber: "BATCH005",
      quantity: 50,
      expiryDate: "2027-12-31",
    });

    // Set reorder level on inventory item.
    await pool.query(
      `UPDATE activeclinic.inventory_items SET reorder_level = 100 WHERE id = $1`,
      [receiveResult.inventoryItem.id]
    );

    const lowStockResult = await listLowStockItems(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      facilityId: tenant.facility.facility.id,
    });

    assert.equal(lowStockResult.ok, true);
    assert.equal(lowStockResult.result, RESULT.OK);
    assert.equal(lowStockResult.lowStockItems.length >= 1, true);
    assert.equal(lowStockResult.lowStockItems[0].currentQuantity <= 100, true);
  });

  it("should list expiring batches", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "expiry");

    const medicationResult = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    const nearExpiry = new Date();
    nearExpiry.setDate(nearExpiry.getDate() + 30);

    await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: medicationResult.medication.id,
      batchNumber: "BATCH006",
      quantity: 200,
      expiryDate: nearExpiry.toISOString().split("T")[0],
    });

    const expiringResult = await listExpiringBatches(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      facilityId: tenant.facility.facility.id,
    });

    assert.equal(expiringResult.ok, true);
    assert.equal(expiringResult.result, RESULT.OK);
    assert.equal(expiringResult.expiringBatches.length >= 1, true);
  });

  it("should create pharmacy prescription and list in queue", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "prescr");

    const medicationResult = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    const prescriptionResult = await createPharmacyPrescription(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      patientId: tenant.patient.patient.id,
      prescriberStaffId: tenant.staff.staffMember.id,
      priority: "normal",
      reviewRequired: false,
      items: [
        {
          medicationCatalogueItemId: medicationResult.medication.id,
          quantityOrdered: 20,
          dosageInstructions: "Take 1 tablet twice daily",
        },
      ],
    });

    assert.equal(prescriptionResult.ok, true);
    assert.equal(prescriptionResult.result, RESULT.OK);
    assert.match(prescriptionResult.prescription.prescriptionNumber, /^RX/);
    assert.equal(prescriptionResult.prescription.status, "pending");

    const queueResult = await listPrescriptionQueue(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      facilityId: tenant.facility.facility.id,
      status: "pending",
    });

    assert.equal(queueResult.ok, true);
    assert.equal(queueResult.result, RESULT.OK);
    assert.equal(queueResult.prescriptions.length >= 1, true);
  });

  it("should dispense prescription (full) and decrement stock", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "disp");

    const medicationResult = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    const receiveResult = await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: medicationResult.medication.id,
      batchNumber: "BATCH007",
      quantity: 500,
      expiryDate: "2027-12-31",
    });

    const prescriptionResult = await createPharmacyPrescription(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      patientId: tenant.patient.patient.id,
      prescriberStaffId: tenant.staff.staffMember.id,
      priority: "normal",
      items: [
        {
          medicationCatalogueItemId: medicationResult.medication.id,
          quantityOrdered: 30,
          dosageInstructions: "Take 1 tablet twice daily",
        },
      ],
    });

    const prescriptionDetailResult = await getPrescriptionById(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      prescriptionId: prescriptionResult.prescription.id,
    });

    assert.equal(prescriptionDetailResult.ok, true);
    assert.equal(prescriptionDetailResult.items.length, 1);

    const dispenseResult = await dispensePrescription(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      prescriptionId: prescriptionResult.prescription.id,
      itemDispenses: [
        {
          prescriptionItemId: prescriptionDetailResult.items[0].id,
          quantityToDispense: 30,
          batchId: receiveResult.batch.id,
        },
      ],
      dispenseType: "full",
      patientAcknowledged: true,
      counselingProvided: true,
      counselingNotes: "Patient counseled on dosage",
    });

    assert.equal(dispenseResult.ok, true);
    assert.equal(dispenseResult.result, RESULT.OK);
    assert.equal(dispenseResult.dispenseEvent.dispenseType, "full");

    // Verify stock decremented.
    const inventoryAfter = await pool.query(
      `SELECT current_quantity FROM activeclinic.inventory_items WHERE id = $1`,
      [receiveResult.inventoryItem.id]
    );

    assert.equal(inventoryAfter.rows[0].current_quantity, 470);

    // Verify prescription status.
    const prescriptionAfter = await pool.query(
      `SELECT status FROM activeclinic.pharmacy_prescriptions WHERE id = $1`,
      [prescriptionResult.prescription.id]
    );

    assert.equal(prescriptionAfter.rows[0].status, "dispensed");
  });

  it("should dispense prescription (partial)", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "partial");

    const medicationResult = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    const receiveResult = await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: medicationResult.medication.id,
      batchNumber: "BATCH008",
      quantity: 50,
      expiryDate: "2027-12-31",
    });

    const prescriptionResult = await createPharmacyPrescription(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      patientId: tenant.patient.patient.id,
      prescriberStaffId: tenant.staff.staffMember.id,
      priority: "normal",
      items: [
        {
          medicationCatalogueItemId: medicationResult.medication.id,
          quantityOrdered: 100,
          dosageInstructions: "Take 1 tablet twice daily",
        },
      ],
    });

    const prescriptionDetailResult = await getPrescriptionById(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      prescriptionId: prescriptionResult.prescription.id,
    });

    const dispenseResult = await dispensePrescription(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      prescriptionId: prescriptionResult.prescription.id,
      itemDispenses: [
        {
          prescriptionItemId: prescriptionDetailResult.items[0].id,
          quantityToDispense: 50,
          batchId: receiveResult.batch.id,
        },
      ],
      dispenseType: "partial",
      patientAcknowledged: true,
      counselingProvided: true,
    });

    assert.equal(dispenseResult.ok, true);
    assert.equal(dispenseResult.result, RESULT.OK);
    assert.equal(dispenseResult.dispenseEvent.dispenseType, "partial");

    // Verify prescription status is partially_dispensed.
    const prescriptionAfter = await pool.query(
      `SELECT status FROM activeclinic.pharmacy_prescriptions WHERE id = $1`,
      [prescriptionResult.prescription.id]
    );

    assert.equal(prescriptionAfter.rows[0].status, "partially_dispensed");

    // Verify item status.
    const itemAfter = await pool.query(
      `SELECT status, quantity_dispensed FROM activeclinic.pharmacy_prescription_items WHERE id = $1`,
      [prescriptionDetailResult.items[0].id]
    );

    assert.equal(itemAfter.rows[0].status, "partially_dispensed");
    assert.equal(itemAfter.rows[0].quantity_dispensed, 50);
  });

  it("should reject dispense when insufficient stock", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "insuffic");

    const medicationResult = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    const receiveResult = await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: medicationResult.medication.id,
      batchNumber: "BATCH009",
      quantity: 10,
      expiryDate: "2027-12-31",
    });

    const prescriptionResult = await createPharmacyPrescription(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      patientId: tenant.patient.patient.id,
      prescriberStaffId: tenant.staff.staffMember.id,
      priority: "normal",
      items: [
        {
          medicationCatalogueItemId: medicationResult.medication.id,
          quantityOrdered: 50,
          dosageInstructions: "Take 1 tablet twice daily",
        },
      ],
    });

    const prescriptionDetailResult = await getPrescriptionById(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      prescriptionId: prescriptionResult.prescription.id,
    });

    const dispenseResult = await dispensePrescription(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      prescriptionId: prescriptionResult.prescription.id,
      itemDispenses: [
        {
          prescriptionItemId: prescriptionDetailResult.items[0].id,
          quantityToDispense: 50,
          batchId: receiveResult.batch.id,
        },
      ],
      dispenseType: "full",
      patientAcknowledged: true,
      counselingProvided: true,
    });

    assert.equal(dispenseResult.ok, false);
    assert.equal(dispenseResult.result, RESULT.INSUFFICIENT_STOCK);
  });

  it("should reject dispense from expired batch", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "expired");

    const medicationResult = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    const pastExpiry = new Date();
    pastExpiry.setFullYear(pastExpiry.getFullYear() - 1);

    const receiveResult = await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: medicationResult.medication.id,
      batchNumber: "BATCH010",
      quantity: 100,
      expiryDate: pastExpiry.toISOString().split("T")[0],
    });

    const prescriptionResult = await createPharmacyPrescription(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      patientId: tenant.patient.patient.id,
      prescriberStaffId: tenant.staff.staffMember.id,
      priority: "normal",
      items: [
        {
          medicationCatalogueItemId: medicationResult.medication.id,
          quantityOrdered: 10,
          dosageInstructions: "Take 1 tablet twice daily",
        },
      ],
    });

    const prescriptionDetailResult = await getPrescriptionById(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      prescriptionId: prescriptionResult.prescription.id,
    });

    const dispenseResult = await dispensePrescription(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      prescriptionId: prescriptionResult.prescription.id,
      itemDispenses: [
        {
          prescriptionItemId: prescriptionDetailResult.items[0].id,
          quantityToDispense: 10,
          batchId: receiveResult.batch.id,
        },
      ],
      dispenseType: "full",
      patientAcknowledged: true,
      counselingProvided: true,
    });

    assert.equal(dispenseResult.ok, false);
    assert.equal(dispenseResult.result, RESULT.EXPIRED_BATCH);
  });

  it("should enforce tenant isolation for prescriptions", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant1 = await seedTenant(stamp, "iso1");
    const tenant2 = await seedTenant(stamp + 1, "iso2");

    const med1 = await addMedication(pool, {
      staffId: tenant1.staff.staffMember.id,
      organizationId: tenant1.org.records.organization.id,
      healthcareOrganizationId: tenant1.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    const prescriptionResult = await createPharmacyPrescription(pool, {
      staffId: tenant1.staff.staffMember.id,
      organizationId: tenant1.org.records.organization.id,
      healthcareOrganizationId: tenant1.hco.healthcareOrganization.id,
      facilityId: tenant1.facility.facility.id,
      patientId: tenant1.patient.patient.id,
      prescriberStaffId: tenant1.staff.staffMember.id,
      priority: "normal",
      items: [
        {
          medicationCatalogueItemId: med1.medication.id,
          quantityOrdered: 20,
          dosageInstructions: "Take 1 tablet twice daily",
        },
      ],
    });

    // Tenant2 staff should not see tenant1 prescriptions.
    const queueResult = await listPrescriptionQueue(pool, {
      staffId: tenant2.staff.staffMember.id,
      organizationId: tenant2.org.records.organization.id,
      facilityId: tenant2.facility.facility.id,
      status: "pending",
    });

    assert.equal(queueResult.ok, true);
    assert.equal(queueResult.prescriptions.length, 0);

    // Tenant2 staff should not be able to get tenant1 prescription.
    const getResult = await getPrescriptionById(pool, {
      staffId: tenant2.staff.staffMember.id,
      organizationId: tenant2.org.records.organization.id,
      prescriptionId: prescriptionResult.prescription.id,
    });

    assert.equal(getResult.ok, false);
    assert.equal(getResult.result, RESULT.PRESCRIPTION_NOT_FOUND);
  });

  it("should enforce tenant isolation for inventory", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant1 = await seedTenant(stamp, "inviso1");
    const tenant2 = await seedTenant(stamp + 1, "inviso2");

    const med1 = await addMedication(pool, {
      staffId: tenant1.staff.staffMember.id,
      organizationId: tenant1.org.records.organization.id,
      healthcareOrganizationId: tenant1.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    await receiveStock(pool, {
      staffId: tenant1.staff.staffMember.id,
      organizationId: tenant1.org.records.organization.id,
      healthcareOrganizationId: tenant1.hco.healthcareOrganization.id,
      facilityId: tenant1.facility.facility.id,
      medicationCatalogueItemId: med1.medication.id,
      batchNumber: "BATCH011",
      quantity: 100,
      expiryDate: "2027-12-31",
    });

    // Tenant2 staff should not see tenant1 inventory.
    const inventoryResult = await listInventoryItems(pool, {
      staffId: tenant2.staff.staffMember.id,
      organizationId: tenant2.org.records.organization.id,
      facilityId: tenant2.facility.facility.id,
    });

    assert.equal(inventoryResult.ok, true);
    assert.equal(inventoryResult.inventoryItems.length, 0);
  });

  it("should reject dispense without permission", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "noperm");

    // Create staff without pharmacy permissions.
    const staffNoPerm = await createStaffMember(pool, {
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      firstName: "No",
      lastName: "Perm",
      employmentType: "permanent",
      status: "active",
      phone: nextPhone(),
    });

    await assignStaffToFacility(pool, {
      organizationId: tenant.org.records.organization.id,
      staffMemberId: staffNoPerm.staffMember.id,
      facilityId: tenant.facility.facility.id,
    });

    const medicationResult = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    const receiveResult = await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: medicationResult.medication.id,
      batchNumber: "BATCH012",
      quantity: 100,
      expiryDate: "2027-12-31",
    });

    const prescriptionResult = await createPharmacyPrescription(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      patientId: tenant.patient.patient.id,
      prescriberStaffId: tenant.staff.staffMember.id,
      priority: "normal",
      items: [
        {
          medicationCatalogueItemId: medicationResult.medication.id,
          quantityOrdered: 20,
          dosageInstructions: "Take 1 tablet twice daily",
        },
      ],
    });

    const prescriptionDetailResult = await getPrescriptionById(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      prescriptionId: prescriptionResult.prescription.id,
    });

    const dispenseResult = await dispensePrescription(pool, {
      staffId: staffNoPerm.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      prescriptionId: prescriptionResult.prescription.id,
      itemDispenses: [
        {
          prescriptionItemId: prescriptionDetailResult.items[0].id,
          quantityToDispense: 20,
          batchId: receiveResult.batch.id,
        },
      ],
      dispenseType: "full",
      patientAcknowledged: true,
      counselingProvided: true,
    });

    assert.equal(dispenseResult.ok, false);
    assert.equal(dispenseResult.result, RESULT.ACCESS_DENIED);
  });

  it("should not mutate BlessBoard church data", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "bbiso");

    // Check no churches exist in this tenant.
    const churchCheck = await pool.query(
      `SELECT COUNT(*) FROM blessboard.churches WHERE organization_id = $1`,
      [tenant.org.records.organization.id]
    );

    assert.equal(churchCheck.rows[0].count, "0");

    // Perform pharmacy operations.
    await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    // Verify still no churches.
    const churchCheckAfter = await pool.query(
      `SELECT COUNT(*) FROM blessboard.churches WHERE organization_id = $1`,
      [tenant.org.records.organization.id]
    );

    assert.equal(churchCheckAfter.rows[0].count, "0");
  });
});
