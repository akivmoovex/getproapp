"use strict";

/**
 * ActiveClinic V7 Phase 4 pharmacy ops tests:
 * adjust, transfer, substitution, purchase orders, labels/instructions, tenant isolation.
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
  PHARMACIST,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  addMedication,
  receiveStock,
  createPharmacyPrescription,
  getPrescriptionById,
} = require("../src/activeclinic/services/activeClinicPharmacyService");
const {
  adjustStock,
  transferStock,
  substitutePrescriptionItem,
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  submitPurchaseOrder,
  getMedicineLabel,
  getPatientMedicineInstructions,
  RESULT,
} = require("../src/activeclinic/services/activeClinicPharmacyOpsService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 980000000;

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

async function seedTenant(stamp, tag, options = {}) {
  const org = await provisionOrg({
    organizationKey: `ac_p4_${tag}_${stamp}`,
    displayName: `AC P4 ${tag}`,
    productKey: "activeclinic",
    productTenantKey: `ac-p4-${tag}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "P4 Legal",
    publicName: "P4 Public",
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

  let secondFacility = null;
  if (options.secondFacility) {
    secondFacility = await createFacility(pool, {
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: `sat-${tag}`.slice(0, 64),
      displayName: "Satellite",
      facilityType: "clinic",
      status: "active",
      isPrimary: false,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
    });
    assert.equal(secondFacility.ok, true, JSON.stringify(secondFacility));
  }

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
  if (secondFacility) {
    await assignStaffToFacility(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: staff.staffMember.id,
      facilityId: secondFacility.facility.id,
    });
  }
  for (const roleKey of [PHARMACIST, RECEPTIONIST]) {
    const role = await assignStaffRole(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: staff.staffMember.id,
      roleKey,
      scopeType: "facility",
      facilityId: facility.facility.id,
    });
    assert.equal(role.ok, true, JSON.stringify(role));
    if (secondFacility) {
      const role2 = await assignStaffRole(pool, {
        organizationId: org.records.organization.id,
        staffMemberId: staff.staffMember.id,
        roleKey,
        scopeType: "facility",
        facilityId: secondFacility.facility.id,
      });
      assert.equal(role2.ok, true, JSON.stringify(role2));
    }
  }
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
    secondFacility,
    staff,
    patient,
  };
}

async function seedNoPermStaff(tenant, tag) {
  const staffNoPerm = await createStaffMember(pool, {
    organizationId: tenant.org.records.organization.id,
    healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
    firstName: "No",
    lastName: `Perm${tag}`,
    employmentType: "permanent",
    status: "active",
    phone: nextPhone(),
  });
  assert.equal(staffNoPerm.ok, true, JSON.stringify(staffNoPerm));
  await assignStaffToFacility(pool, {
    organizationId: tenant.org.records.organization.id,
    staffMemberId: staffNoPerm.staffMember.id,
    facilityId: tenant.facility.facility.id,
  });
  return staffNoPerm;
}

describe("ActiveClinic Phase 4 Pharmacy Ops", () => {
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

  it("should adjust stock happily and reject negative stock", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "adj");

    const medication = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });
    assert.equal(medication.ok, true);

    const received = await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: medication.medication.id,
      batchNumber: "ADJ-BATCH-1",
      quantity: 50,
      expiryDate: "2027-12-31",
    });
    assert.equal(received.ok, true);

    const adjusted = await adjustStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      inventoryItemId: received.inventoryItem.id,
      quantityDelta: -10,
      reason: "Cycle count correction",
    });
    assert.equal(adjusted.ok, true);
    assert.equal(adjusted.result, RESULT.OK);
    assert.equal(adjusted.inventoryItem.currentQuantity, 40);

    const negative = await adjustStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      inventoryItemId: received.inventoryItem.id,
      quantityDelta: -100,
      reason: "Would go negative",
    });
    assert.equal(negative.ok, false);
    assert.equal(negative.result, RESULT.NEGATIVE_STOCK);
  });

  it("should deny unauthorized stock adjust", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "adjauth");
    const staffNoPerm = await seedNoPermStaff(tenant, "adjauth");

    const medication = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Ibuprofen",
      strength: "200mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });
    const received = await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: medication.medication.id,
      batchNumber: "ADJ-AUTH-1",
      quantity: 20,
      expiryDate: "2027-12-31",
    });

    const denied = await adjustStock(pool, {
      staffId: staffNoPerm.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      inventoryItemId: received.inventoryItem.id,
      quantityDelta: -1,
      reason: "Unauthorized",
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.result, RESULT.ACCESS_DENIED);
  });

  it("should transfer stock between facilities in the same HCO", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "xfer", { secondFacility: true });

    const medication = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Amoxicillin",
      strength: "250mg",
      dosageForm: "capsule",
      unitOfMeasure: "capsule",
    });
    const received = await receiveStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      medicationCatalogueItemId: medication.medication.id,
      batchNumber: "XFER-1",
      quantity: 100,
      expiryDate: "2027-12-31",
    });
    assert.equal(received.ok, true);

    const transferred = await transferStock(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      sourceFacilityId: tenant.facility.facility.id,
      destinationFacilityId: tenant.secondFacility.facility.id,
      medicationCatalogueItemId: medication.medication.id,
      quantity: 25,
      reason: "Rebalance satellite clinic",
    });
    assert.equal(transferred.ok, true, JSON.stringify(transferred));
    assert.equal(transferred.result, RESULT.OK);
    assert.equal(transferred.sourceInventoryItem.currentQuantity, 75);
    assert.equal(transferred.destinationInventoryItem.currentQuantity, 25);
  });

  it("should reject cross-org transfer and unauthorized transfer", async () => {
    requireDb();
    const stamp = Date.now();
    const tenantA = await seedTenant(stamp, "xa", { secondFacility: true });
    const tenantB = await seedTenant(stamp + 1, "xb");
    const staffNoPerm = await seedNoPermStaff(tenantA, "xauth");

    const medication = await addMedication(pool, {
      staffId: tenantA.staff.staffMember.id,
      organizationId: tenantA.org.records.organization.id,
      healthcareOrganizationId: tenantA.hco.healthcareOrganization.id,
      genericName: "Metformin",
      strength: "500mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });
    await receiveStock(pool, {
      staffId: tenantA.staff.staffMember.id,
      organizationId: tenantA.org.records.organization.id,
      healthcareOrganizationId: tenantA.hco.healthcareOrganization.id,
      facilityId: tenantA.facility.facility.id,
      medicationCatalogueItemId: medication.medication.id,
      batchNumber: "XORG-1",
      quantity: 40,
      expiryDate: "2027-12-31",
    });

    const crossOrg = await transferStock(pool, {
      staffId: tenantA.staff.staffMember.id,
      organizationId: tenantA.org.records.organization.id,
      healthcareOrganizationId: tenantA.hco.healthcareOrganization.id,
      sourceFacilityId: tenantA.facility.facility.id,
      destinationFacilityId: tenantB.facility.facility.id,
      medicationCatalogueItemId: medication.medication.id,
      quantity: 5,
      reason: "Cross org attempt",
    });
    assert.equal(crossOrg.ok, false);
    assert.equal(crossOrg.result, RESULT.FACILITY_MISMATCH);

    const denied = await transferStock(pool, {
      staffId: staffNoPerm.staffMember.id,
      organizationId: tenantA.org.records.organization.id,
      healthcareOrganizationId: tenantA.hco.healthcareOrganization.id,
      sourceFacilityId: tenantA.facility.facility.id,
      destinationFacilityId: tenantA.secondFacility.facility.id,
      medicationCatalogueItemId: medication.medication.id,
      quantity: 5,
      reason: "Unauthorized",
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.result, RESULT.ACCESS_DENIED);
  });

  it("should substitute when allowed and reject when not allowed", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "sub");

    const medA = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "BrandA",
      strength: "10mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });
    const medB = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "GenericB",
      strength: "10mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    const rx = await createPharmacyPrescription(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      patientId: tenant.patient.patient.id,
      prescriberStaffId: tenant.staff.staffMember.id,
      items: [
        {
          medicationCatalogueItemId: medA.medication.id,
          quantityOrdered: 14,
          dosageInstructions: "Take one daily",
        },
      ],
    });
    assert.equal(rx.ok, true);

    const detail = await getPrescriptionById(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      prescriptionId: rx.prescription.id,
    });
    const itemId = detail.items[0].id;

    const rejected = await substitutePrescriptionItem(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      prescriptionId: rx.prescription.id,
      prescriptionItemId: itemId,
      substitutedWithMedicationId: medB.medication.id,
      substitutionReason: "Stock out of brand",
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.result, RESULT.SUBSTITUTION_NOT_ALLOWED);

    await pool.query(
      `UPDATE activeclinic.pharmacy_prescription_items
       SET substitution_allowed = true
       WHERE id = $1`,
      [itemId]
    );

    const allowed = await substitutePrescriptionItem(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      prescriptionId: rx.prescription.id,
      prescriptionItemId: itemId,
      substitutedWithMedicationId: medB.medication.id,
      substitutionReason: "Stock out of brand",
    });
    assert.equal(allowed.ok, true, JSON.stringify(allowed));
    assert.equal(allowed.result, RESULT.OK);
    assert.equal(allowed.item.status, "substituted");
    assert.equal(allowed.item.substitutedWithMedicationId, medB.medication.id);
  });

  it("should create, list, and submit purchase orders", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "po");

    const medication = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "ORS",
      strength: "20.5g",
      dosageForm: "powder",
      unitOfMeasure: "sachet",
    });

    const created = await createPurchaseOrder(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      supplierName: "National Pharma Ltd",
      notes: "Monthly restock",
      items: [
        {
          medicationCatalogueItemId: medication.medication.id,
          quantityOrdered: 200,
          unitCost: 1.5,
        },
      ],
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.purchaseOrder.status, "draft");
    assert.match(created.purchaseOrder.poNumber, /^PO-\d{8}-\d{4}$/);

    const listed = await listPurchaseOrders(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
    });
    assert.equal(listed.ok, true);
    assert.equal(listed.purchaseOrders.some((p) => p.id === created.purchaseOrder.id), true);

    const submitted = await submitPurchaseOrder(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      purchaseOrderId: created.purchaseOrder.id,
      facilityId: tenant.facility.facility.id,
    });
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    assert.equal(submitted.purchaseOrder.status, "submitted");
    assert.ok(submitted.purchaseOrder.submittedAt);

    const detail = await getPurchaseOrder(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      purchaseOrderId: created.purchaseOrder.id,
    });
    assert.equal(detail.ok, true);
    assert.equal(detail.items.length, 1);
    assert.equal(detail.items[0].quantityOrdered, 200);
  });

  it("should isolate purchase orders across tenants", async () => {
    requireDb();
    const stamp = Date.now();
    const tenantA = await seedTenant(stamp, "poa");
    const tenantB = await seedTenant(stamp + 1, "pob");

    const medication = await addMedication(pool, {
      staffId: tenantA.staff.staffMember.id,
      organizationId: tenantA.org.records.organization.id,
      healthcareOrganizationId: tenantA.hco.healthcareOrganization.id,
      genericName: "Zinc",
      strength: "20mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });

    const created = await createPurchaseOrder(pool, {
      staffId: tenantA.staff.staffMember.id,
      organizationId: tenantA.org.records.organization.id,
      healthcareOrganizationId: tenantA.hco.healthcareOrganization.id,
      facilityId: tenantA.facility.facility.id,
      supplierName: "Supplier A",
      items: [
        {
          medicationCatalogueItemId: medication.medication.id,
          quantityOrdered: 50,
        },
      ],
    });
    assert.equal(created.ok, true);

    const listedB = await listPurchaseOrders(pool, {
      staffId: tenantB.staff.staffMember.id,
      organizationId: tenantB.org.records.organization.id,
      healthcareOrganizationId: tenantB.hco.healthcareOrganization.id,
      facilityId: tenantB.facility.facility.id,
    });
    assert.equal(listedB.ok, true);
    assert.equal(
      listedB.purchaseOrders.some((p) => p.id === created.purchaseOrder.id),
      false
    );

    const getB = await getPurchaseOrder(pool, {
      staffId: tenantB.staff.staffMember.id,
      organizationId: tenantB.org.records.organization.id,
      healthcareOrganizationId: tenantB.hco.healthcareOrganization.id,
      purchaseOrderId: created.purchaseOrder.id,
    });
    assert.equal(getB.ok, false);
    assert.equal(getB.result, RESULT.PURCHASE_ORDER_NOT_FOUND);
  });

  it("should return label and instruction payloads and deny unauthorized access", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "lbl");
    const staffNoPerm = await seedNoPermStaff(tenant, "lbl");

    const medication = await addMedication(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      genericName: "Cough Syrup",
      strength: "100ml",
      dosageForm: "syrup",
      unitOfMeasure: "bottle",
    });

    const rx = await createPharmacyPrescription(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      patientId: tenant.patient.patient.id,
      prescriberStaffId: tenant.staff.staffMember.id,
      items: [
        {
          medicationCatalogueItemId: medication.medication.id,
          quantityOrdered: 1,
          dosageInstructions: "Take 5ml three times daily after meals",
        },
      ],
    });
    assert.equal(rx.ok, true);

    const labels = await getMedicineLabel(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      prescriptionId: rx.prescription.id,
    });
    assert.equal(labels.ok, true, JSON.stringify(labels));
    assert.equal(labels.labels.length, 1);
    assert.equal(labels.labels[0].dosageInstructions, "Take 5ml three times daily after meals");
    assert.ok(labels.labels[0].patientDisplayName);

    const instructions = await getPatientMedicineInstructions(pool, {
      staffId: tenant.staff.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      facilityId: tenant.facility.facility.id,
      prescriptionId: rx.prescription.id,
    });
    assert.equal(instructions.ok, true);
    assert.equal(instructions.instructions.length, 1);
    assert.equal(
      instructions.instructions[0].dosageInstructions,
      "Take 5ml three times daily after meals"
    );

    const deniedLabel = await getMedicineLabel(pool, {
      staffId: staffNoPerm.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      prescriptionId: rx.prescription.id,
    });
    assert.equal(deniedLabel.ok, false);
    assert.equal(deniedLabel.result, RESULT.ACCESS_DENIED);

    const deniedInstr = await getPatientMedicineInstructions(pool, {
      staffId: staffNoPerm.staffMember.id,
      organizationId: tenant.org.records.organization.id,
      healthcareOrganizationId: tenant.hco.healthcareOrganization.id,
      prescriptionId: rx.prescription.id,
    });
    assert.equal(deniedInstr.ok, false);
    assert.equal(deniedInstr.result, RESULT.ACCESS_DENIED);
  });
});
