"use strict";

/**
 * ActiveClinic V7 Phase 13 — domain integrity (patients/scheduling/pharmacy/finance).
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
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
  BILLING_OFFICER,
  FINANCE_SUPERVISOR,
  PHARMACIST,
  RECEPTIONIST,
  FACILITY_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  createAppointmentServiceType,
  createAppointment,
  checkInAppointment,
  cancelAppointment,
  appendAppointmentStatusEvent,
  RESULT: APPT_RESULT,
} = require("../src/activeclinic/services/activeClinicAppointmentService");
const {
  addMedication,
  receiveStock,
  createPharmacyPrescription,
  getPrescriptionById,
  RESULT: PHARM_RESULT,
} = require("../src/activeclinic/services/activeClinicPharmacyService");
const {
  substitutePrescriptionItem,
  createPurchaseOrder,
  submitPurchaseOrder,
  receivePurchaseOrder,
  getPurchaseOrder,
  RESULT: PHARM_OPS_RESULT,
} = require("../src/activeclinic/services/activeClinicPharmacyOpsService");
const {
  createPatientCharge,
  createInvoice,
  postInvoice,
  recordPayment,
  refundPayment,
  RESULT: BILLING_RESULT,
  PAYMENT_METHOD,
} = require("../src/activeclinic/services/activeClinicBillingService");
const billingOps = require("../src/activeclinic/services/activeClinicBillingOpsService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const PASSWORD = "activeclinic-pass-12";
let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 130000000;
let patientSeq = 0;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function nextPatientNumber() {
  patientSeq += 1;
  return `AC-2026-${String(patientSeq).padStart(6, "0")}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

async function seedTenant(stamp, keyPrefix) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `P13 ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const orgId = org.records.organization.id;
  const hco = await createHealthcareOrganization(pool, {
    organizationId: orgId,
    legalName: `Legal ${keyPrefix}`,
    publicName: `Public ${keyPrefix}`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${keyPrefix}-a`.slice(0, 64),
    displayName: "Facility A",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  return {
    orgId,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedRoleUser(ac, opts) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `p13.${phone.slice(-8)}@example.test`,
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true);
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: ac.orgId,
    healthcareOrganizationId: ac.hcoId,
    firstName: opts.firstName || "P13",
    lastName: opts.lastName || "User",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Staff",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: ac.facilityId,
    isPrimary: true,
  });
  for (const role of opts.roles || []) {
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: role.roleKey,
      scopeType: role.scopeType || "facility",
      facilityId: role.facilityId != null ? role.facilityId : ac.facilityId,
      assignmentOrigin: "system",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
  }
  return {
    identityId: identity.identity.id,
    staffMemberId: staff.staffMember.id,
  };
}

async function seedPatient(ac) {
  const patientNumber = nextPatientNumber();
  const patientId = (
    await pool.query(
      `INSERT INTO activeclinic.patients (
         organization_id, healthcare_organization_id, patient_number,
         first_name, last_name, date_of_birth, sex_at_registration
       ) VALUES ($1, $2, $3, 'P13', 'Patient', '1990-01-01', 'female')
       RETURNING id`,
      [ac.orgId, ac.hcoId, patientNumber]
    )
  ).rows[0].id;
  return { patientId, patientNumber };
}

async function seedPostedInvoice(ac, billingStaffId, patientId, amountMinor) {
  const charge = await createPatientCharge({
    pool,
    tenantId: ac.orgId,
    facilityId: ac.facilityId,
    staffId: billingStaffId,
    patientId,
    chargeType: "consultation",
    description: "Consult",
    unitAmountMinor: amountMinor,
    quantity: 1,
  });
  assert.equal(charge.result, BILLING_RESULT.CREATED);
  const inv = await createInvoice({
    pool,
    tenantId: ac.orgId,
    facilityId: ac.facilityId,
    staffId: billingStaffId,
    patientId,
    chargeIds: [charge.charge.id],
  });
  assert.equal(inv.result, BILLING_RESULT.CREATED);
  const posted = await postInvoice({
    pool,
    tenantId: ac.orgId,
    facilityId: ac.facilityId,
    staffId: billingStaffId,
    invoiceId: inv.invoice.id,
  });
  assert.equal(posted.result, BILLING_RESULT.OK);
  return { charge, invoice: inv.invoice };
}

describe("ActiveClinic Phase 13 domain integrity", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await pool.query(
        `INSERT INTO platform.database_identity
           (id, database_instance_id, environment_code, database_name, host_fingerprint, identity_key)
         VALUES
           (1, $1, 'testing', 'getpro_test', 'localhost', 'blessboard-platform-v5')
         ON CONFLICT (id) DO UPDATE SET
           environment_code = EXCLUDED.environment_code,
           identity_key = EXCLUDED.identity_key,
           updated_at = now()`,
        ["11111111-1111-4111-8111-111111111111"]
      );
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  it("rejects credit notes that exceed remaining invoice balance", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}cn`;
    const ac = await seedTenant(stamp, "p13cn");
    const billing = await seedRoleUser(ac, { roles: [{ roleKey: BILLING_OFFICER }] });
    const supervisor = await seedRoleUser(ac, { roles: [{ roleKey: FINANCE_SUPERVISOR }] });
    const { patientId } = await seedPatient(ac);
    const { invoice } = await seedPostedInvoice(ac, billing.staffMemberId, patientId, 20000);

    const first = await billingOps.createCreditNote(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      patientId,
      invoiceId: invoice.id,
      amountMinor: 15000,
      reason: "partial goodwill",
    });
    assert.equal(first.result, billingOps.RESULT.CREATED);

    const over = await billingOps.createCreditNote(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      patientId,
      invoiceId: invoice.id,
      amountMinor: 6000,
      reason: "would over-credit",
    });
    assert.equal(over.result, billingOps.RESULT.CREDIT_EXCEEDS_BALANCE);
    assert.equal(over.remainingMinor, 5000);
  });

  it("rejects payment allocations above remaining invoice balance and is idempotent", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}pay`;
    const ac = await seedTenant(stamp, "p13pay");
    const billing = await seedRoleUser(ac, { roles: [{ roleKey: BILLING_OFFICER }] });
    const supervisor = await seedRoleUser(ac, { roles: [{ roleKey: FINANCE_SUPERVISOR }] });
    const { patientId } = await seedPatient(ac);
    const { invoice } = await seedPostedInvoice(ac, billing.staffMemberId, patientId, 10000);

    const first = await recordPayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      patientId,
      amountMinor: 6000,
      paymentMethod: PAYMENT_METHOD.CARD,
      invoiceAllocations: [{ invoiceId: invoice.id, amountMinor: 6000 }],
    });
    assert.equal(first.result, BILLING_RESULT.CREATED);

    const over = await recordPayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      patientId,
      amountMinor: 5000,
      paymentMethod: PAYMENT_METHOD.CARD,
      invoiceAllocations: [{ invoiceId: invoice.id, amountMinor: 5000 }],
    });
    assert.equal(over.result, BILLING_RESULT.INSUFFICIENT_BALANCE);

    const idempotencyKey = randomUUID();
    const payOnce = await recordPayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      patientId,
      amountMinor: 4000,
      paymentMethod: PAYMENT_METHOD.CARD,
      invoiceAllocations: [{ invoiceId: invoice.id, amountMinor: 4000 }],
      idempotencyKey,
    });
    assert.equal(payOnce.result, BILLING_RESULT.CREATED);
    const payTwice = await recordPayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      patientId,
      amountMinor: 4000,
      paymentMethod: PAYMENT_METHOD.CARD,
      invoiceAllocations: [{ invoiceId: invoice.id, amountMinor: 4000 }],
      idempotencyKey,
    });
    assert.equal(payTwice.result, BILLING_RESULT.DUPLICATE_SUBMISSION);
    assert.equal(payTwice.payment.id, payOnce.payment.id);
  });

  it("counts refunds once in net collections", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}rev`;
    const ac = await seedTenant(stamp, "p13rev");
    const billing = await seedRoleUser(ac, { roles: [{ roleKey: BILLING_OFFICER }] });
    const supervisor = await seedRoleUser(ac, { roles: [{ roleKey: FINANCE_SUPERVISOR }] });
    const { patientId } = await seedPatient(ac);
    await seedPostedInvoice(ac, billing.staffMemberId, patientId, 8000);

    const pay = await recordPayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      patientId,
      amountMinor: 4000,
      paymentMethod: PAYMENT_METHOD.CARD,
    });
    assert.equal(pay.result, BILLING_RESULT.CREATED);
    const refund = await refundPayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      paymentId: pay.payment.id,
      amountMinor: 1500,
      reason: "partial refund",
    });
    assert.equal(refund.result, BILLING_RESULT.OK);

    const today = new Date().toISOString().slice(0, 10);
    const summary = await billingOps.getRevenueReportSummary(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      dateFrom: today,
      dateTo: today,
    });
    assert.equal(summary.result, billingOps.RESULT.OK);
    assert.equal(summary.summary.payments.totalMinor, 4000);
    assert.equal(summary.summary.refunds.totalMinor, 1500);
    assert.equal(summary.summary.netCollectionsMinor, 2500);
  });

  it("blocks impossible appointment transitions including requested", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}ap`;
    const ac = await seedTenant(stamp, "p13ap");
    const actorUser = await seedRoleUser(ac, {
      roles: [{ roleKey: FACILITY_ADMIN }, { roleKey: RECEPTIONIST }],
    });
    const actor = { staffMemberId: actorUser.staffMemberId };
    const service = await createAppointmentServiceType(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      actor,
      serviceKey: "p13-consult",
      displayName: "P13 consult",
      defaultDurationMinutes: 20,
      requiresAssignedStaff: false,
    });
    assert.equal(service.ok, true, JSON.stringify(service));
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityId: ac.facilityId,
      actor,
      demographics: { firstName: "Appt", lastName: "Domain" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));
    const created = await createAppointment(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityId: ac.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      startsAt: new Date("2026-11-01T10:00:00+02:00"),
      endsAt: new Date("2026-11-01T10:20:00+02:00"),
      timezone: "Africa/Lusaka",
      actor,
    });
    assert.equal(created.ok, true, JSON.stringify(created));

    const requested = await appendAppointmentStatusEvent(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      appointmentId: created.appointment.id,
      actor,
      toStatus: "requested",
    });
    assert.equal(requested.ok, false);
    assert.equal(requested.code, APPT_RESULT.INVALID_TRANSITION);

    const cancelled = await cancelAppointment(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      appointmentId: created.appointment.id,
      actor,
      reason: "patient_request",
    });
    assert.equal(cancelled.ok, true, JSON.stringify(cancelled));

    const checkedIn = await checkInAppointment(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      appointmentId: created.appointment.id,
      actor,
    });
    assert.equal(checkedIn.ok, false);
    assert.equal(checkedIn.code, APPT_RESULT.INVALID_TRANSITION);
  });

  it("rejects a second substitution and expired stock receive", async () => {
    requireDb();
    const stamp = Date.now();
    const ac = await seedTenant(`${stamp}`, "p13ph");
    const pharmacist = await seedRoleUser(ac, {
      roles: [{ roleKey: PHARMACIST }, { roleKey: RECEPTIONIST }],
    });
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityId: ac.facilityId,
      actor: { staffMemberId: pharmacist.staffMemberId },
      demographics: { firstName: "Rx", lastName: "Domain" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const medA = await addMedication(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      genericName: "BrandA",
      strength: "10mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });
    const medB = await addMedication(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      genericName: "GenericB",
      strength: "10mg",
      dosageForm: "tablet",
      unitOfMeasure: "tablet",
    });
    const expired = await receiveStock(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityId: ac.facilityId,
      medicationCatalogueItemId: medA.medication.id,
      batchNumber: "EXP-1",
      quantity: 10,
      expiryDate: "2020-01-01",
    });
    assert.equal(expired.ok, false);
    assert.equal(expired.result, PHARM_RESULT.EXPIRED_BATCH);

    const rx = await createPharmacyPrescription(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityId: ac.facilityId,
      patientId: patient.patient.id,
      prescriberStaffId: pharmacist.staffMemberId,
      items: [
        {
          medicationCatalogueItemId: medA.medication.id,
          quantityOrdered: 14,
          dosageInstructions: "Take one daily",
        },
      ],
    });
    assert.equal(rx.ok, true, JSON.stringify(rx));
    const detail = await getPrescriptionById(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      prescriptionId: rx.prescription.id,
    });
    const itemId = detail.items[0].id;
    await pool.query(
      `UPDATE activeclinic.pharmacy_prescription_items
          SET substitution_allowed = true
        WHERE id = $1`,
      [itemId]
    );

    const first = await substitutePrescriptionItem(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityId: ac.facilityId,
      prescriptionId: rx.prescription.id,
      prescriptionItemId: itemId,
      substitutedWithMedicationId: medB.medication.id,
      substitutionReason: "Stock out of brand",
    });
    assert.equal(first.ok, true, JSON.stringify(first));

    const second = await substitutePrescriptionItem(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityId: ac.facilityId,
      prescriptionId: rx.prescription.id,
      prescriptionItemId: itemId,
      substitutedWithMedicationId: medB.medication.id,
      substitutionReason: "Tried again",
    });
    assert.equal(second.ok, false);
    assert.equal(second.result, PHARM_OPS_RESULT.INVALID_TRANSITION);
  });

  it("receives purchase orders through movements without over-receive", async () => {
    requireDb();
    const stamp = Date.now();
    const ac = await seedTenant(`${stamp}`, "p13po");
    const pharmacist = await seedRoleUser(ac, {
      roles: [{ roleKey: PHARMACIST }],
    });
    const medication = await addMedication(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      genericName: "ORS",
      strength: "20.5g",
      dosageForm: "powder",
      unitOfMeasure: "sachet",
    });
    const created = await createPurchaseOrder(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityId: ac.facilityId,
      supplierName: "National Pharma Ltd",
      items: [
        {
          medicationCatalogueItemId: medication.medication.id,
          quantityOrdered: 10,
          unitCost: 1.5,
        },
      ],
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    const submitted = await submitPurchaseOrder(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      purchaseOrderId: created.purchaseOrder.id,
      facilityId: ac.facilityId,
    });
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    const poItemId = created.items[0].id;

    const expired = await receivePurchaseOrder(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      purchaseOrderId: created.purchaseOrder.id,
      facilityId: ac.facilityId,
      items: [
        {
          purchaseOrderItemId: poItemId,
          quantity: 4,
          batchNumber: "PO-EXP",
          expiryDate: "2020-06-01",
        },
      ],
    });
    assert.equal(expired.ok, false);
    assert.equal(expired.result, PHARM_OPS_RESULT.EXPIRED_BATCH);

    const partial = await receivePurchaseOrder(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      purchaseOrderId: created.purchaseOrder.id,
      facilityId: ac.facilityId,
      items: [
        {
          purchaseOrderItemId: poItemId,
          quantity: 6,
          batchNumber: "PO-A",
          expiryDate: "2027-12-31",
        },
      ],
    });
    assert.equal(partial.ok, true, JSON.stringify(partial));
    assert.equal(partial.purchaseOrder.status, "partially_received");

    const over = await receivePurchaseOrder(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      purchaseOrderId: created.purchaseOrder.id,
      facilityId: ac.facilityId,
      items: [
        {
          purchaseOrderItemId: poItemId,
          quantity: 5,
          batchNumber: "PO-B",
          expiryDate: "2027-12-31",
        },
      ],
    });
    assert.equal(over.ok, false);

    const rest = await receivePurchaseOrder(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      purchaseOrderId: created.purchaseOrder.id,
      facilityId: ac.facilityId,
      items: [
        {
          purchaseOrderItemId: poItemId,
          quantity: 4,
          batchNumber: "PO-C",
          expiryDate: "2027-12-31",
        },
      ],
    });
    assert.equal(rest.ok, true, JSON.stringify(rest));
    assert.equal(rest.purchaseOrder.status, "received");

    const detail = await getPurchaseOrder(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      purchaseOrderId: created.purchaseOrder.id,
      facilityId: ac.facilityId,
    });
    assert.equal(detail.items[0].quantityReceived, 10);

    const stock = await pool.query(
      `SELECT current_quantity FROM activeclinic.inventory_items
        WHERE facility_id = $1 AND medication_catalogue_item_id = $2`,
      [ac.facilityId, medication.medication.id]
    );
    assert.equal(Number(stock.rows[0].current_quantity), 10);

    const movements = await pool.query(
      `SELECT COUNT(*)::int AS n FROM activeclinic.stock_movements
        WHERE reference_type = 'purchase' AND reference_id = $1`,
      [created.purchaseOrder.id]
    );
    assert.equal(movements.rows[0].n, 2);

    const afterReceived = await receivePurchaseOrder(pool, {
      staffId: pharmacist.staffMemberId,
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      purchaseOrderId: created.purchaseOrder.id,
      facilityId: ac.facilityId,
      items: [
        {
          purchaseOrderItemId: poItemId,
          quantity: 1,
          batchNumber: "PO-D",
          expiryDate: "2027-12-31",
        },
      ],
    });
    assert.equal(afterReceived.ok, false);
    assert.equal(afterReceived.result, PHARM_OPS_RESULT.INVALID_PO_STATUS);
  });
});
