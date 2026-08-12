"use strict";

/**
 * ActiveClinic V7 Phase 4 — billing ops gap-closure service tests.
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
  CASHIER,
  FINANCE_SUPERVISOR,
  NURSE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createPatientCharge,
  createInvoice,
  postInvoice,
  recordPayment,
  refundPayment,
  RESULT: BILLING_RESULT,
  PAYMENT_METHOD,
} = require("../src/activeclinic/services/activeClinicBillingService");
const {
  openCashierSession,
  RESULT: CASHIER_RESULT,
} = require("../src/activeclinic/services/activeClinicCashierSessionService");
const billingOps = require("../src/activeclinic/services/activeClinicBillingOpsService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const PASSWORD = "activeclinic-pass-12";
let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 940000000;
let patientSeq = 0;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function nextPatientNumber() {
  patientSeq += 1;
  return `AC-2026-${String(patientSeq).padStart(6, "0")}`;
}

async function seedTenant(stamp, keyPrefix) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `P4 ${keyPrefix}`,
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
    facilityKey: `${keyPrefix}-a`,
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
    primaryEmail: `p4.${phone.slice(-8)}@example.test`,
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
    firstName: opts.firstName || "P4",
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
       ) VALUES ($1, $2, $3, 'P4', 'Patient', '1990-01-01', 'female')
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

describe("ActiveClinic Phase 4 billing ops", () => {
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

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("lists AR with balance; denies unauthorized; isolates tenants", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedTenant(stamp, "ar");
    const other = await seedTenant(`${stamp}x`, "arx");
    const billing = await seedRoleUser(ac, {
      firstName: "Bill",
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const nurse = await seedRoleUser(ac, {
      firstName: "Nurse",
      roles: [{ roleKey: NURSE }],
    });
    const otherBilling = await seedRoleUser(other, {
      firstName: "Other",
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const { patientId } = await seedPatient(ac);
    await seedPostedInvoice(ac, billing.staffMemberId, patientId, 15000);

    const denied = await billingOps.listAccountsReceivable(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: nurse.staffMemberId,
    });
    assert.equal(denied.result, billingOps.RESULT.ACCESS_DENIED);

    const ar = await billingOps.listAccountsReceivable(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
    });
    assert.equal(ar.result, billingOps.RESULT.OK);
    assert.ok(ar.items.length >= 1);
    assert.equal(ar.items[0].balanceMinor, 15000);

    const cross = await billingOps.listAccountsReceivable(pool, {
      tenantId: other.orgId,
      facilityId: other.facilityId,
      staffId: otherBilling.staffMemberId,
    });
    assert.equal(cross.result, billingOps.RESULT.OK);
    assert.equal(cross.items.length, 0);

    const wrongFacility = await billingOps.listAccountsReceivable(pool, {
      tenantId: ac.orgId,
      facilityId: other.facilityId,
      staffId: billing.staffMemberId,
    });
    assert.equal(wrongFacility.result, billingOps.RESULT.ACCESS_DENIED);
  });

  it("creates credit notes; denies billing officer without amend; isolates tenants", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}cn`;
    const ac = await seedTenant(stamp, "cn");
    const other = await seedTenant(`${stamp}o`, "cno");
    const billing = await seedRoleUser(ac, {
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const supervisor = await seedRoleUser(ac, {
      roles: [{ roleKey: FINANCE_SUPERVISOR }],
    });
    const otherSup = await seedRoleUser(other, {
      roles: [{ roleKey: FINANCE_SUPERVISOR }],
    });
    const { patientId } = await seedPatient(ac);
    const { invoice } = await seedPostedInvoice(
      ac,
      billing.staffMemberId,
      patientId,
      20000
    );

    const denied = await billingOps.createCreditNote(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      patientId,
      invoiceId: invoice.id,
      amountMinor: 1000,
      reason: "billing adjustment",
    });
    assert.equal(denied.result, billingOps.RESULT.ACCESS_DENIED);

    const created = await billingOps.createCreditNote(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      patientId,
      invoiceId: invoice.id,
      amountMinor: 2500,
      reason: "goodwill credit",
    });
    assert.equal(created.result, billingOps.RESULT.CREATED);
    assert.ok(created.creditNote.creditNoteNumber);

    const cross = await billingOps.getCreditNote(pool, {
      tenantId: other.orgId,
      facilityId: other.facilityId,
      staffId: otherSup.staffMemberId,
      creditNoteId: created.creditNote.id,
    });
    assert.equal(cross.result, billingOps.RESULT.NOT_FOUND);
  });

  it("lists financial corrections including refunds and credit notes", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}fx`;
    const ac = await seedTenant(stamp, "fx");
    const billing = await seedRoleUser(ac, {
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const supervisor = await seedRoleUser(ac, {
      roles: [{ roleKey: FINANCE_SUPERVISOR }],
    });
    const cashier = await seedRoleUser(ac, {
      roles: [{ roleKey: CASHIER }],
    });
    const { patientId } = await seedPatient(ac);
    await seedPostedInvoice(ac, billing.staffMemberId, patientId, 8000);

    const opened = await openCashierSession({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      openingCashMinor: 0,
    });
    assert.equal(opened.result, CASHIER_RESULT.CREATED);
    const pay = await recordPayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      patientId,
      amountMinor: 3000,
      paymentMethod: PAYMENT_METHOD.CASH,
      cashierSessionId: opened.session.id,
    });
    assert.equal(pay.result, BILLING_RESULT.CREATED);
    const refund = await refundPayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      paymentId: pay.payment.id,
      amountMinor: 500,
      reason: "partial refund",
    });
    assert.equal(refund.result, BILLING_RESULT.OK);

    await billingOps.createCreditNote(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      patientId,
      amountMinor: 1000,
      reason: "credit for correction list",
    });

    const denied = await billingOps.listFinancialCorrections(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: cashier.staffMemberId,
    });
    assert.equal(denied.result, billingOps.RESULT.ACCESS_DENIED);

    const listed = await billingOps.listFinancialCorrections(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
    });
    assert.equal(listed.result, billingOps.RESULT.OK);
    const types = new Set(listed.items.map((i) => i.correctionType));
    assert.ok(types.has("refund"));
    assert.ok(types.has("credit_note"));
  });

  it("creates and approves payment arrangements with auth checks", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}pa`;
    const ac = await seedTenant(stamp, "pa");
    const billing = await seedRoleUser(ac, {
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const supervisor = await seedRoleUser(ac, {
      roles: [{ roleKey: FINANCE_SUPERVISOR }],
    });
    const cashier = await seedRoleUser(ac, {
      roles: [{ roleKey: CASHIER }],
    });
    const { patientId } = await seedPatient(ac);

    const created = await billingOps.createPaymentArrangement(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      patientId,
      totalAmountMinor: 9000,
      numberOfInstallments: 3,
      installmentAmountMinor: 3000,
      installmentFrequency: "monthly",
    });
    assert.equal(created.result, billingOps.RESULT.CREATED);
    assert.equal(created.arrangement.status, "pending");

    const denyReview = await billingOps.reviewPaymentArrangement(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      arrangementId: created.arrangement.id,
      action: "approve",
    });
    assert.equal(denyReview.result, billingOps.RESULT.ACCESS_DENIED);

    const denyCashierCreate = await billingOps.createPaymentArrangement(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: cashier.staffMemberId,
      patientId,
      totalAmountMinor: 1000,
      numberOfInstallments: 1,
      installmentAmountMinor: 1000,
      installmentFrequency: "weekly",
    });
    // Cashier has billing.view so create is allowed; review remains elevated.
    assert.equal(denyCashierCreate.result, billingOps.RESULT.CREATED);

    const approved = await billingOps.reviewPaymentArrangement(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      arrangementId: created.arrangement.id,
      action: "approve",
    });
    assert.equal(approved.result, billingOps.RESULT.OK);
    assert.equal(approved.arrangement.status, "approved");
  });

  it("requests and approves price overrides with permission split", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}po`;
    const ac = await seedTenant(stamp, "po");
    const billing = await seedRoleUser(ac, {
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const supervisor = await seedRoleUser(ac, {
      roles: [{ roleKey: FINANCE_SUPERVISOR }],
    });
    const cashier = await seedRoleUser(ac, {
      roles: [{ roleKey: CASHIER }],
    });
    const { patientId } = await seedPatient(ac);

    const denyRequest = await billingOps.createPriceOverrideRequest(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: cashier.staffMemberId,
      patientId,
      originalAmountMinor: 5000,
      requestedAmountMinor: 3000,
      reason: "hardship",
    });
    assert.equal(denyRequest.result, billingOps.RESULT.ACCESS_DENIED);

    const requested = await billingOps.createPriceOverrideRequest(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      patientId,
      originalAmountMinor: 5000,
      requestedAmountMinor: 3000,
      reason: "hardship discount",
    });
    assert.equal(requested.result, billingOps.RESULT.CREATED);
    assert.equal(requested.request.status, "pending");

    const denyApprove = await billingOps.reviewPriceOverrideRequest(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      requestId: requested.request.id,
      action: "approve",
    });
    assert.equal(denyApprove.result, billingOps.RESULT.ACCESS_DENIED);

    const approved = await billingOps.reviewPriceOverrideRequest(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      requestId: requested.request.id,
      action: "approve",
    });
    assert.equal(approved.result, billingOps.RESULT.OK);
    assert.equal(approved.request.status, "approved");
  });

  it("builds patient statement data scoped to tenant", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}st`;
    const ac = await seedTenant(stamp, "st");
    const other = await seedTenant(`${stamp}o`, "sto");
    const billing = await seedRoleUser(ac, {
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const otherBilling = await seedRoleUser(other, {
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const { patientId, patientNumber } = await seedPatient(ac);
    await seedPostedInvoice(ac, billing.staffMemberId, patientId, 12000);

    const statement = await billingOps.getPatientAccountStatement(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      patientNumber,
    });
    assert.equal(statement.result, billingOps.RESULT.OK);
    assert.equal(statement.statement.patient.patientNumber, patientNumber);
    assert.ok(statement.statement.invoices.length >= 1);
    assert.equal(statement.statement.summary.openBalanceMinor, 12000);

    const cross = await billingOps.getPatientAccountStatement(pool, {
      tenantId: other.orgId,
      facilityId: other.facilityId,
      staffId: otherBilling.staffMemberId,
      patientNumber,
    });
    assert.equal(cross.result, billingOps.RESULT.NOT_FOUND);
  });

  it("loads refund receipt; denies unauthorized; isolates tenants", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}rr`;
    const ac = await seedTenant(stamp, "rr");
    const other = await seedTenant(`${stamp}o`, "rro");
    const billing = await seedRoleUser(ac, {
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const supervisor = await seedRoleUser(ac, {
      roles: [{ roleKey: FINANCE_SUPERVISOR }],
    });
    const otherSup = await seedRoleUser(other, {
      roles: [{ roleKey: FINANCE_SUPERVISOR }],
    });
    const { patientId } = await seedPatient(ac);

    const opened = await openCashierSession({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      openingCashMinor: 0,
    });
    assert.equal(opened.result, CASHIER_RESULT.CREATED);
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
      reason: "receipt test",
    });
    assert.equal(refund.result, BILLING_RESULT.OK);

    // Billing officer has payment.view — should load
    const receipt = await billingOps.getRefundReceipt(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      refundId: refund.refundId,
    });
    assert.equal(receipt.result, billingOps.RESULT.OK);
    assert.equal(receipt.receipt.refundAmountMinor, 1500);

    const cross = await billingOps.getRefundReceipt(pool, {
      tenantId: other.orgId,
      facilityId: other.facilityId,
      staffId: otherSup.staffMemberId,
      refundId: refund.refundId,
    });
    assert.equal(cross.result, billingOps.RESULT.NOT_FOUND);
  });

  it("aggregates revenue report facility-scoped with auth denial", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}rev`;
    const ac = await seedTenant(stamp, "rev");
    const billing = await seedRoleUser(ac, {
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const cashier = await seedRoleUser(ac, {
      roles: [{ roleKey: CASHIER }],
    });
    const { patientId } = await seedPatient(ac);
    await seedPostedInvoice(ac, billing.staffMemberId, patientId, 7000);

    const today = new Date().toISOString().slice(0, 10);
    const denied = await billingOps.getRevenueReportSummary(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: cashier.staffMemberId,
      dateFrom: today,
      dateTo: today,
    });
    assert.equal(denied.result, billingOps.RESULT.ACCESS_DENIED);

    const summary = await billingOps.getRevenueReportSummary(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      dateFrom: today,
      dateTo: today,
    });
    assert.equal(summary.result, billingOps.RESULT.OK);
    assert.ok(summary.summary.postedInvoices.count >= 1);
    assert.ok(summary.summary.postedInvoices.totalMinor >= 7000);

    const detailed = await billingOps.getRevenueReportDetailed(pool, {
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      dateFrom: today,
      dateTo: today,
    });
    assert.equal(detailed.result, billingOps.RESULT.OK);
    assert.ok(detailed.invoices.length >= 1);
  });
});
