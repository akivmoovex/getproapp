"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

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
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createChargeCatalogItem,
  createPatientCharge,
  createInvoice,
  addCatalogItemToDraftInvoice,
  listPaymentHistory,
  recordPayment,
  requestRefund,
  approveRefund,
  rejectRefund,
  requestPaymentReversal,
  approvePaymentReversal,
  getChargeCatalogItemById,
  RESULT: BILLING_RESULT,
  PAYMENT_METHOD,
} = require("../src/activeclinic/services/activeClinicBillingService");
const {
  openCashierSession,
  RESULT: CASHIER_RESULT,
} = require("../src/activeclinic/services/activeClinicCashierSessionService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const PASSWORD = "activeclinic-p5d-pass";
let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 980000000;
let patientSeq = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

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
    displayName: `P5D ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true);
  const orgId = org.records.organization.id;
  const hco = await createHealthcareOrganization(pool, {
    organizationId: orgId,
    legalName: "Legal",
    publicName: "Public",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
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
  assert.equal(facility.ok, true);
  await ensureDefaultDepartments(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
  return { orgId, hcoId: hco.healthcareOrganization.id, facilityId: facility.facility.id };
}

async function seedRoleUser(ac, roleKeys) {
  const roles = Array.isArray(roleKeys) ? roleKeys : [roleKeys];
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
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
    firstName: "P5D",
    lastName: roles[0].slice(-6),
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
  });
  assert.equal(staff.ok, true);
  await assignStaffToFacility(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: ac.facilityId,
  });
  for (const roleKey of roles) {
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey,
      scopeType: "facility",
      facilityId: ac.facilityId,
    });
  }
  return { staffId: staff.staffMember.id };
}

async function seedPatient(ac) {
  const patientNumber = nextPatientNumber();
  const patientId = (
    await pool.query(
      `INSERT INTO activeclinic.patients (
         organization_id, healthcare_organization_id, patient_number,
         first_name, last_name, date_of_birth, sex_at_registration
       ) VALUES ($1, $2, $3, 'P5D', 'Patient', '1990-01-01', 'female')
       RETURNING id`,
      [ac.orgId, ac.hcoId, patientNumber]
    )
  ).rows[0].id;
  return { patientId, patientNumber };
}

describe("ActiveClinic V7 Phase 5D billing + cashier partial closure", () => {
  describe("wiring", () => {
    it("wires billing partial routes and views", () => {
      const billingRoutes = read("src/activeclinic/http/activeClinicBillingRoutes.js");
      const billingService = read("src/activeclinic/services/activeClinicBillingService.js");
      assert.match(billingRoutes, /\/app\/billing\/invoices\/:invoiceId\/items\/new/);
      assert.match(billingRoutes, /\/app\/billing\/invoices\/:invoiceId\/error/);
      assert.match(billingRoutes, /\/app\/billing\/catalog\/:catalogItemId/);
      assert.match(billingRoutes, /\/app\/billing\/payments\/history/);
      assert.match(billingService, /requestRefund/);
      assert.match(billingService, /approveRefund/);
      assert.match(billingService, /requestPaymentReversal/);
      assert.match(billingService, /addCatalogItemToDraftInvoice/);
      assert.match(billingService, /listPaymentHistory/);
      assert.match(read("views/activeclinic/app/billing-invoice-add-item-content.ejs"), /Add to invoice/);
      assert.match(read("views/activeclinic/app/billing-invoice-error-content.ejs"), /Invoice error/);
      assert.match(read("views/activeclinic/app/billing-catalog-detail-content.ejs"), /catalog-detail/);
      assert.match(read("views/activeclinic/app/billing-payment-history-content.ejs"), /payment-history/);
    });

    it("wires cashier partial routes and multi-step close", () => {
      const cashierRoutes = read("src/activeclinic/http/activeClinicCashierRoutes.js");
      assert.match(cashierRoutes, /\/app\/cashier\/payment\/completed/);
      assert.match(cashierRoutes, /\/app\/cashier\/close\/cash-count/);
      assert.match(cashierRoutes, /\/app\/cashier\/close\/review/);
      assert.match(cashierRoutes, /\/app\/cashier\/close\/variance/);
      assert.match(cashierRoutes, /\/app\/cashier\/refunds\/request/);
      assert.match(cashierRoutes, /\/app\/cashier\/refunds\/:refundId\/review/);
      assert.match(cashierRoutes, /\/app\/cashier\/refunds\/:refundId\/completed/);
      assert.match(cashierRoutes, /\/app\/cashier\/refunds\/:refundId\/rejected/);
      assert.match(cashierRoutes, /\/app\/cashier\/reversals\/request/);
      assert.match(cashierRoutes, /\/app\/cashier\/reversals\/:reversalId\/review/);
      assert.match(read("views/activeclinic/app/cashier-payment-completed-content.ejs"), /Payment completed/);
      assert.match(read("views/activeclinic/app/cashier-close-cash-count-content.ejs"), /Cash count/);
      assert.match(read("views/activeclinic/app/cashier-refund-request-content.ejs"), /Submit refund request/);
    });
  });

  describe("integration", () => {
    before(async () => {
      resetDeploymentProfileWarningsForTests();
      try {
        databaseUrl = await resetFoundationDatabase();
        pool = createFoundationPool(databaseUrl);
        await migrate({ connectionString: databaseUrl });
      } catch (err) {
        skipReason = err && err.message ? err.message : String(err);
        pool = null;
      }
    });

    after(async () => {
      if (pool) await pool.end();
    });

    it("adds catalog item to draft invoice and loads catalog detail", async () => {
      requireDb();
      const stamp = Date.now();
      const ac = await seedTenant(stamp, "p5d_inv");
      const billing = await seedRoleUser(ac, BILLING_OFFICER);
      const { patientId } = await seedPatient(ac);

      const catalog = await createChargeCatalogItem({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: billing.staffId,
        code: `SVC-${stamp}`,
        name: "Consultation",
        category: "consultation",
        amountMinor: 5000,
      });
      assert.equal(catalog.result, BILLING_RESULT.CREATED);

      const charge = await createPatientCharge({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: billing.staffId,
        patientId,
        chargeType: "consultation",
        description: "Initial",
        unitAmountMinor: 3000,
        quantity: 1,
      });
      assert.equal(charge.result, BILLING_RESULT.CREATED);

      const inv = await createInvoice({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: billing.staffId,
        patientId,
        chargeIds: [charge.charge.id],
      });
      assert.equal(inv.result, BILLING_RESULT.CREATED);

      const added = await addCatalogItemToDraftInvoice({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: billing.staffId,
        invoiceId: inv.invoice.id,
        catalogItemId: catalog.item.id,
        quantity: 2,
      });
      assert.equal(added.result, BILLING_RESULT.OK);
      assert.equal(added.invoice.subtotalMinor, 13000);

      const detail = await getChargeCatalogItemById({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: billing.staffId,
        catalogItemId: catalog.item.id,
      });
      assert.equal(detail.result, BILLING_RESULT.OK);
      assert.equal(detail.item.code, `SVC-${stamp}`);
    });

    it("runs refund request → supervisor approve with self-approval blocked", async () => {
      requireDb();
      const stamp = Date.now();
      const ac = await seedTenant(stamp, "p5d_ref");
      const cashier = await seedRoleUser(ac, CASHIER);
      const supervisor = await seedRoleUser(ac, [CASHIER, FINANCE_SUPERVISOR]);
      const { patientId } = await seedPatient(ac);

      const opened = await openCashierSession({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: cashier.staffId,
        openingCashMinor: 0,
      });
      assert.equal(opened.result, CASHIER_RESULT.CREATED);

      const pay = await recordPayment({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: cashier.staffId,
        patientId,
        amountMinor: 8000,
        paymentMethod: PAYMENT_METHOD.CASH,
        cashierSessionId: opened.session.id,
      });
      assert.equal(pay.result, BILLING_RESULT.CREATED);

      const requested = await requestRefund({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: supervisor.staffId,
        paymentId: pay.payment.id,
        amountMinor: 2000,
        reason: "overpayment",
      });
      assert.equal(requested.result, BILLING_RESULT.CREATED);
      assert.equal(requested.refund.status, "pending");

      const selfApprove = await approveRefund({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: supervisor.staffId,
        refundId: requested.refund.id,
      });
      assert.equal(selfApprove.result, BILLING_RESULT.APPROVAL_REQUIRED);

      const otherSupervisor = await seedRoleUser(ac, FINANCE_SUPERVISOR);
      const approved = await approveRefund({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: otherSupervisor.staffId,
        refundId: requested.refund.id,
      });
      assert.equal(approved.result, BILLING_RESULT.OK);
      assert.ok(approved.refundPaymentId);
    });

    it("runs payment reversal request → supervisor approve", async () => {
      requireDb();
      const stamp = Date.now();
      const ac = await seedTenant(stamp, "p5d_rev");
      const cashier = await seedRoleUser(ac, CASHIER);
      const supervisor = await seedRoleUser(ac, FINANCE_SUPERVISOR);
      const { patientId } = await seedPatient(ac);

      const pay = await recordPayment({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: supervisor.staffId,
        patientId,
        amountMinor: 4500,
        paymentMethod: PAYMENT_METHOD.CARD,
      });
      assert.equal(pay.result, BILLING_RESULT.CREATED);

      const requested = await requestPaymentReversal({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: cashier.staffId,
        paymentId: pay.payment.id,
        reason: "duplicate entry",
      });
      assert.equal(requested.result, BILLING_RESULT.CREATED);
      assert.equal(requested.reversal.status, "pending");

      const approved = await approvePaymentReversal({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: supervisor.staffId,
        reversalId: requested.reversal.id,
      });
      assert.equal(approved.result, BILLING_RESULT.OK);
      assert.equal(approved.reversal.status, "completed");
    });

    it("lists payment history and isolates tenants", async () => {
      requireDb();
      const stamp = Date.now();
      const ac = await seedTenant(stamp, "p5d_hist");
      const other = await seedTenant(`${stamp}o`, "p5d_ho");
      const finance = await seedRoleUser(ac, FINANCE_SUPERVISOR);
      const otherFinance = await seedRoleUser(other, FINANCE_SUPERVISOR);
      const { patientId } = await seedPatient(ac);

      const pay = await recordPayment({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: finance.staffId,
        patientId,
        amountMinor: 1200,
        paymentMethod: PAYMENT_METHOD.CARD,
      });
      assert.equal(pay.result, BILLING_RESULT.CREATED);

      const history = await listPaymentHistory({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: finance.staffId,
      });
      assert.equal(history.result, BILLING_RESULT.OK);
      assert.ok(history.payments.length >= 1);

      const cross = await listPaymentHistory({
        pool,
        tenantId: other.orgId,
        facilityId: other.facilityId,
        staffId: otherFinance.staffId,
      });
      assert.equal(cross.result, BILLING_RESULT.OK);
      assert.equal(cross.payments.some((p) => p.amountMinor === 1200), false);
    });

    it("rejects refund with audit trail fields", async () => {
      requireDb();
      const stamp = Date.now();
      const ac = await seedTenant(stamp, "p5d_rej");
      const cashier = await seedRoleUser(ac, CASHIER);
      const supervisor = await seedRoleUser(ac, FINANCE_SUPERVISOR);
      const { patientId } = await seedPatient(ac);

      const opened = await openCashierSession({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: cashier.staffId,
        openingCashMinor: 0,
      });
      assert.equal(opened.result, CASHIER_RESULT.CREATED);

      const pay = await recordPayment({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: cashier.staffId,
        patientId,
        amountMinor: 3000,
        paymentMethod: PAYMENT_METHOD.CASH,
        cashierSessionId: opened.session.id,
      });
      assert.equal(pay.result, BILLING_RESULT.CREATED);

      const requested = await requestRefund({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: cashier.staffId,
        paymentId: pay.payment.id,
        amountMinor: 1000,
        reason: "patient declined",
      });
      assert.equal(requested.result, BILLING_RESULT.CREATED);

      const rejected = await rejectRefund({
        pool,
        tenantId: ac.orgId,
        facilityId: ac.facilityId,
        staffId: supervisor.staffId,
        refundId: requested.refund.id,
        rejectionReason: "Insufficient documentation",
      });
      assert.equal(rejected.result, BILLING_RESULT.OK);
      assert.equal(rejected.refund.status, "rejected");
      assert.equal(rejected.refund.rejectionReason, "Insufficient documentation");
    });
  });
});
