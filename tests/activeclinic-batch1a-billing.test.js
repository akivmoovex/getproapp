"use strict";

/**
 * V2.03 ACN21–23 invoices, payment recording & receipt.
 * Calculations, partial/overpay rules, RBAC, isolation, no clinical leak to finance.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");

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
const { createFacility } = require("../src/activeclinic/services/facilityService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  BILLING_OFFICER,
  CASHIER,
  CLINICIAN,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createPatientCharge,
  createInvoice,
  addCustomLineToDraftInvoice,
  setDraftInvoiceAdjustment,
  attachInvoicePaidBalances,
  postInvoice,
  recordPayment,
  RESULT,
  PAYMENT_METHOD,
} = require("../src/activeclinic/services/activeClinicBillingService");
const {
  openCashierSession,
  RESULT: CASHIER_RESULT,
} = require("../src/activeclinic/services/activeClinicCashierSessionService");
const {
  startEncounter,
  recordConsultationNote,
} = require("../src/activeclinic/services/activeClinicClinicalService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});
const ROOT = path.join(__dirname, "..");

let pool;
let skipReason = null;
let phoneSeq = 760000000;
let app;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

async function provisionClinic(label, roleKeys) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp,
    displayName: `Bill ${label}`,
    productKey: "activeclinic",
    productTenantKey: stamp,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: `${label} Legal`,
    publicName: `${label} Clinic`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `hq-${stamp}`,
    displayName: `${label} HQ`,
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    firstName: "Staff",
    lastName: label,
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: label,
  });
  await assignStaffToFacility(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
    isPrimary: true,
  });
  for (const roleKey of roleKeys) {
    const role = await assignStaffRole(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: staff.staffMember.id,
      roleKey,
      scopeType: "facility",
      facilityId: facility.facility.id,
    });
    assert.equal(role.ok, true, JSON.stringify(role));
  }
  return {
    organizationId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    staffId: staff.staffMember.id,
    identityId: identity.identity.id,
  };
}

async function sessionCookie(clinic) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: clinic.identityId,
    organizationId: clinic.organizationId,
  });
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

async function seedPatient(clinic) {
  phoneSeq += 1;
  const patientNumber = `AC-2026-${String(phoneSeq).slice(-6).padStart(6, "0")}`;
  const row = await pool.query(
    `INSERT INTO activeclinic.patients (
       organization_id, healthcare_organization_id, patient_number,
       first_name, last_name, date_of_birth, sex_at_registration
     ) VALUES ($1, $2, $3, 'Pat', 'Bill', '1990-01-15', 'female')
     RETURNING id, patient_number`,
    [clinic.organizationId, clinic.hcoId, patientNumber]
  );
  return row.rows[0];
}

describe("ActiveClinic V2.03 ACN21–23 billing", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      app = createActiveClinicFoundationApp({
        getPool: () => pool,
        env: MINIMAL_AC,
        log: () => {},
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("wires Stitch ACN21–23 markers and Receipt (not Statutory)", () => {
    const billingRoutes = read("src/activeclinic/http/activeClinicBillingRoutes.js");
    const cashierRoutes = read("src/activeclinic/http/activeClinicCashierRoutes.js");
    assert.match(billingRoutes, /0886c0c2471d4744aa0101aed17abd22/);
    assert.match(billingRoutes, /3af2006929ff463eaea366b3e5086091/);
    assert.match(billingRoutes, /25af03d4c3724841a33fb03415ec1b4d/);
    assert.match(billingRoutes, /29257b0d01c64fa4896a369efd3f6417/);
    assert.match(billingRoutes, /24632347e4ab4c89937b611457d94730/);
    assert.match(cashierRoutes, /9288cc1e473941f4905d69b2393f066b/);
    assert.match(cashierRoutes, /9d872ffd29954df9affe648916b2497f/);
    assert.match(cashierRoutes, /normalizePaymentMethod/);
    assert.doesNotMatch(read("views/activeclinic/app/cashier-receipt-content.ejs"), /Statutory/);
    assert.match(read("views/activeclinic/app/cashier-receipt-content.ejs"), />Receipt</);
    assert.match(read("views/activeclinic/app/cashier-payment-content.ejs"), /mobile_money/);
    assert.match(read("views/activeclinic/app/billing-invoice-add-item-content.ejs"), /line_type/);
  });

  it("calculates custom lines, adjustment, paid and balance", async () => {
    requireDb();
    const billing = await provisionClinic("billcalc", [BILLING_OFFICER]);
    const patient = await seedPatient(billing);

    const charge = await createPatientCharge({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      chargeType: "consultation",
      description: "Consult",
      unitAmountMinor: 10000,
      quantity: 1,
    });
    assert.equal(charge.result, RESULT.CREATED);

    const invoice = await createInvoice({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      chargeIds: [charge.charge.id],
    });
    assert.equal(invoice.result, RESULT.CREATED);

    const custom = await addCustomLineToDraftInvoice({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      invoiceId: invoice.invoice.id,
      description: "Private room",
      quantity: 2,
      unitAmountMinor: 2500,
    });
    assert.equal(custom.result, RESULT.OK);
    // 10000 + (2*2500) = 15000 before adjustment
    assert.equal(custom.invoice.totalAmountMinor, 15000);

    const adjusted = await setDraftInvoiceAdjustment({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      invoiceId: invoice.invoice.id,
      adjustmentMinor: -1500,
    });
    assert.equal(adjusted.result, RESULT.OK);
    assert.equal(adjusted.invoice.totalAmountMinor, 13500);

    const posted = await postInvoice({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      invoiceId: invoice.invoice.id,
    });
    assert.equal(posted.result, RESULT.OK);

    const [bal0] = await attachInvoicePaidBalances(pool, {
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      invoices: [adjusted.invoice],
    });
    assert.equal(bal0.paidMinor, 0);
    assert.equal(bal0.balanceMinor, 13500);
  });

  it("supports partial payment and clamps overpayment allocation", async () => {
    requireDb();
    const billing = await provisionClinic("billpart", [BILLING_OFFICER, CASHIER]);
    const patient = await seedPatient(billing);

    const charge = await createPatientCharge({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      chargeType: "procedure",
      description: "Dressing",
      unitAmountMinor: 10000,
      quantity: 1,
    });
    const invoice = await createInvoice({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      chargeIds: [charge.charge.id],
    });
    await postInvoice({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      invoiceId: invoice.invoice.id,
    });

    const session = await openCashierSession({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      openingCashMinor: 0,
    });
    assert.equal(session.result, CASHIER_RESULT.CREATED);

    const partial = await recordPayment({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      amountMinor: 4000,
      paymentMethod: PAYMENT_METHOD.CASH,
      cashierSessionId: session.session.id,
      invoiceAllocations: [{ invoiceId: invoice.invoice.id, amountMinor: 4000 }],
    });
    assert.equal(partial.result, RESULT.CREATED);
    assert.ok(partial.receiptNumber);

    const [afterPartial] = await attachInvoicePaidBalances(pool, {
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      invoices: [{ id: invoice.invoice.id, total_amount_minor: 10000 }],
    });
    assert.equal(afterPartial.paidMinor, 4000);
    assert.equal(afterPartial.balanceMinor, 6000);

    const overAlloc = await recordPayment({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      amountMinor: 9000,
      paymentMethod: PAYMENT_METHOD.CASH,
      cashierSessionId: session.session.id,
      invoiceAllocations: [{ invoiceId: invoice.invoice.id, amountMinor: 9000 }],
    });
    assert.equal(overAlloc.result, RESULT.INSUFFICIENT_BALANCE);

    const overpay = await recordPayment({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      amountMinor: 9000,
      paymentMethod: PAYMENT_METHOD.CASH,
      cashierSessionId: session.session.id,
      invoiceAllocations: [{ invoiceId: invoice.invoice.id, amountMinor: 6000 }],
    });
    assert.equal(overpay.result, RESULT.CREATED);
    assert.equal(overpay.unappliedMinor, 3000);

    const [afterFull] = await attachInvoicePaidBalances(pool, {
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      invoices: [{ id: invoice.invoice.id, total_amount_minor: 10000 }],
    });
    assert.equal(afterFull.paidMinor, 10000);
    assert.equal(afterFull.balanceMinor, 0);
  });

  it("records external Bank/Mobile Money without cashier session; cash requires session", async () => {
    requireDb();
    const billing = await provisionClinic("billext", [BILLING_OFFICER, CASHIER]);
    const patient = await seedPatient(billing);

    const cashDenied = await recordPayment({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      amountMinor: 1000,
      paymentMethod: PAYMENT_METHOD.CASH,
      cashierSessionId: null,
    });
    assert.equal(cashDenied.result, RESULT.SESSION_REQUIRED);

    const bankNoRef = await recordPayment({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      amountMinor: 1500,
      paymentMethod: PAYMENT_METHOD.BANK_TRANSFER,
      referenceNumber: null,
      paymentDate: "2026-09-20",
    });
    assert.equal(bankNoRef.result, RESULT.INVALID_INPUT);
    assert.equal(bankNoRef.reason, "reference_required");

    const bank = await recordPayment({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      amountMinor: 1500,
      paymentMethod: "bank",
      referenceNumber: "FT-99881",
      paymentDate: "2026-09-20",
    });
    assert.equal(bank.result, RESULT.CREATED);
    assert.equal(bank.payment.paymentMethod, PAYMENT_METHOD.BANK_TRANSFER);
    assert.ok(bank.receiptNumber);

    const momo = await recordPayment({
      pool,
      tenantId: billing.organizationId,
      facilityId: billing.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      amountMinor: 2000,
      paymentMethod: "mobile_money",
      referenceNumber: "MM-4421",
      paymentDate: "2026-09-21",
    });
    assert.equal(momo.result, RESULT.CREATED);
    assert.equal(momo.payment.paymentMethod, PAYMENT_METHOD.MOBILE_MONEY);
  });

  it("isolates invoices across tenants and blocks clinical narratives from finance UI", async () => {
    requireDb();
    const a = await provisionClinic("billisoa", [BILLING_OFFICER, CASHIER, CLINICIAN]);
    const b = await provisionClinic("billisob", [BILLING_OFFICER]);
    const patientA = await seedPatient(a);

    const charge = await createPatientCharge({
      pool,
      tenantId: a.organizationId,
      facilityId: a.facilityId,
      staffId: a.staffId,
      patientId: patientA.id,
      chargeType: "consultation",
      description: "Isolation charge",
      unitAmountMinor: 5000,
      quantity: 1,
    });
    const invoice = await createInvoice({
      pool,
      tenantId: a.organizationId,
      facilityId: a.facilityId,
      staffId: a.staffId,
      patientId: patientA.id,
      chargeIds: [charge.charge.id],
    });
    assert.equal(invoice.result, RESULT.CREATED);

    const cookieB = await sessionCookie(b);
    const cross = await request(app)
      .get(`/app/billing/invoices/${invoice.invoice.id}`)
      .set("Cookie", cookieB);
    assert.ok([403, 404].includes(cross.status));
    assert.doesNotMatch(cross.text, /Isolation charge/);

    const actorA = {
      staffMemberId: a.staffId,
      platformIdentityId: a.identityId,
    };
    const started = await startEncounter(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      patientId: patientA.id,
      actor: actorA,
      encounterType: "outpatient",
    });
    assert.equal(started.ok, true, JSON.stringify(started));

    await recordConsultationNote(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      encounterId: started.encounter.id,
      actor: actorA,
      chiefComplaint: "SECRET_CLINICAL_NARRATIVE_XYZ",
      diagnosis: "SECRET_DIAGNOSIS_ABC",
    });

    const cookieFinance = await sessionCookie(a);
    const list = await request(app).get("/app/billing/invoices").set("Cookie", cookieFinance);
    if (list.status === 200) {
      assert.doesNotMatch(list.text, /SECRET_CLINICAL_NARRATIVE_XYZ|SECRET_DIAGNOSIS_ABC/);
    }

    const clinical = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", cookieFinance);
    // Combined roles include clinician; still assert billing invoice HTML never embeds notes
    const detail = await request(app)
      .get(`/app/billing/invoices/${invoice.invoice.id}`)
      .set("Cookie", cookieFinance);
    if (detail.status === 200) {
      assert.doesNotMatch(detail.text, /SECRET_CLINICAL_NARRATIVE_XYZ|SECRET_DIAGNOSIS_ABC/);
      assert.match(detail.text, /Isolation charge|Invoice/);
    }

    // Pure finance user must not open clinical encounter
    const financeOnly = await provisionClinic("billfin", [BILLING_OFFICER]);
    const finCookie = await sessionCookie(financeOnly);
    const denied = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", finCookie);
    assert.equal(denied.status, 403);
    assert.doesNotMatch(denied.text, /SECRET_CLINICAL_NARRATIVE_XYZ|SECRET_DIAGNOSIS_ABC/);

    const reception = await provisionClinic("billrecv", [RECEPTIONIST]);
    const recvCookie = await sessionCookie(reception);
    const recvClinical = await request(app).get("/app/clinical").set("Cookie", recvCookie);
    assert.equal(recvClinical.status, 403);

    // silence unused when clinician path returns 200
    assert.ok(clinical.status === 200 || clinical.status === 403);
  });
});
