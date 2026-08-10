"use strict";

/**
 * ActiveClinic Prompt 10 — financial segregation of duties.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const crypto = require("node:crypto");

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
  resolveEffectivePermissions,
  BILLING_OFFICER,
  CASHIER,
  FINANCE_SUPERVISOR,
  ORGANIZATION_ADMIN,
  AUDITOR,
  CLINIC_MANAGER,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createPatientCharge,
  createInvoice,
  postInvoice,
  recordPayment,
  refundPayment,
  reversePayment,
  voidInvoice,
  amendPostedInvoice,
  RESULT: BILLING_RESULT,
  PAYMENT_METHOD,
  PERM: BILLING_PERM,
} = require("../src/activeclinic/services/activeClinicBillingService");
const {
  openCashierSession,
  closeCashierSession,
  reconcileCashierSession,
  RESULT: CASHIER_RESULT,
} = require("../src/activeclinic/services/activeClinicCashierSessionService");
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
const {
  seedActiveClinicDemoClinics,
  DEMO_CLINIC_KEY,
} = require("../src/activeclinic/services/activeClinicDemoClinicSeedService");
const {
  ACTIVECLINIC_DEMO,
} = require("../src/activeclinic/services/activeClinicDemoClinicSpec");
const {
  evaluateStaffEligibility,
} = require("../src/activeclinic/services/activeClinicLoginEligibility");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");

const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 920000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

async function seedTenant(stamp, keyPrefix) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `Fin ${keyPrefix}`,
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
    primaryEmail: `fin.${phone.slice(-8)}@example.test`,
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
    firstName: opts.firstName || "Fin",
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

async function permsFor(user, ac) {
  const perms = await resolveEffectivePermissions(pool, {
    organizationId: ac.orgId,
    staffMemberId: user.staffMemberId,
    platformIdentityId: user.identityId,
    facilityId: ac.facilityId,
  });
  assert.equal(perms.ok, true, JSON.stringify(perms));
  return perms.permissions;
}

async function sessionCookie(identityId, orgId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
    contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

async function seedPatient(ac) {
  const stamp = Date.now().toString(36);
  const patientId = (
    await pool.query(
      `INSERT INTO activeclinic.patients (
         organization_id, healthcare_organization_id, patient_number,
         first_name, last_name, date_of_birth, sex_at_registration
       ) VALUES ($1, $2, $3, 'Fin', 'Patient', '1990-01-01', 'female')
       RETURNING id`,
      [ac.orgId, ac.hcoId, `AC-2026-${String(Date.now()).slice(-6)}`]
    )
  ).rows[0].id;
  return { patientId, stamp };
}

describe("ActiveClinic finance SoD RBAC (Prompt 10)", () => {
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

  it("cashier may collect; refund/reverse/override/manage denied", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedTenant(stamp, "cash");
    const cashier = await seedRoleUser(ac, {
      firstName: "Cash",
      roles: [{ roleKey: CASHIER }],
    });
    const keys = await permsFor(cashier, ac);
    assert.ok(keys.includes(BILLING_PERM.PAYMENT_COLLECT));
    assert.ok(keys.includes("activeclinic.cashier.open_session"));
    assert.equal(keys.includes(BILLING_PERM.PAYMENT_REFUND), false);
    assert.equal(keys.includes(BILLING_PERM.PAYMENT_REVERSE), false);
    assert.equal(keys.includes(BILLING_PERM.PRICE_OVERRIDE), false);
    assert.equal(keys.includes("activeclinic.cashier.manage"), false);
    assert.equal(keys.includes("activeclinic.cashier.reconcile"), false);

    const { patientId } = await seedPatient(ac);
    const opened = await openCashierSession({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: cashier.staffMemberId,
      openingCashMinor: 0,
    });
    assert.equal(opened.result, CASHIER_RESULT.CREATED);

    const pay = await recordPayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: cashier.staffMemberId,
      patientId,
      amountMinor: 5000,
      paymentMethod: PAYMENT_METHOD.CASH,
      cashierSessionId: opened.session.id,
    });
    assert.equal(pay.result, BILLING_RESULT.CREATED);

    const refund = await refundPayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: cashier.staffMemberId,
      paymentId: pay.payment.id,
      amountMinor: 1000,
      reason: "should deny",
    });
    assert.equal(refund.result, BILLING_RESULT.ACCESS_DENIED);

    const reverse = await reversePayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: cashier.staffMemberId,
      paymentId: pay.payment.id,
      reason: "should deny",
    });
    assert.equal(reverse.result, BILLING_RESULT.ACCESS_DENIED);

    const app = makeApp();
    const cookie = await sessionCookie(cashier.identityId, ac.orgId, ac.facilityId);
    const csrf = issueCsrfToken(MINIMAL_AC);
    assert.equal(
      (
        await request(app)
          .post(`/app/cashier/payments/${pay.payment.id}/refund`)
          .set("Cookie", cookie)
          .type("form")
          .send({ [CSRF_FIELD]: csrf, amount: "10.00", reason: "nope" })
      ).status,
      403
    );
  });

  it("billing officer may charge; refund/reverse/cashier collect denied", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}b`;
    const ac = await seedTenant(stamp, "bill");
    const billing = await seedRoleUser(ac, {
      firstName: "Bill",
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const keys = await permsFor(billing, ac);
    assert.ok(keys.includes(BILLING_PERM.BILLING_CHARGE));
    assert.ok(keys.includes(BILLING_PERM.INVOICE_CREATE));
    assert.equal(keys.includes(BILLING_PERM.PAYMENT_REFUND), false);
    assert.equal(keys.includes(BILLING_PERM.PAYMENT_REVERSE), false);
    assert.equal(keys.includes(BILLING_PERM.PAYMENT_COLLECT), false);
    assert.equal(keys.includes(BILLING_PERM.PRICE_OVERRIDE), false);
    assert.equal(keys.includes("activeclinic.cashier.open_session"), false);

    const { patientId } = await seedPatient(ac);
    const charge = await createPatientCharge({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      patientId,
      chargeType: "consultation",
      description: "Consult",
      unitAmountMinor: 10000,
      quantity: 1,
    });
    assert.equal(charge.result, BILLING_RESULT.CREATED);

    const refund = await refundPayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      paymentId: crypto.randomUUID(),
      amountMinor: 100,
      reason: "nope",
    });
    assert.equal(refund.result, BILLING_RESULT.ACCESS_DENIED);

    const app = makeApp();
    const cookie = await sessionCookie(billing.identityId, ac.orgId, ac.facilityId);
    assert.equal(
      (await request(app).get("/app/cashier").set("Cookie", cookie)).status,
      403
    );
  });

  it("finance supervisor refund/reverse/void/amend/reconcile allowed", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}f`;
    const ac = await seedTenant(stamp, "sup");
    const supervisor = await seedRoleUser(ac, {
      firstName: "Sup",
      roles: [{ roleKey: FINANCE_SUPERVISOR }],
    });
    const billing = await seedRoleUser(ac, {
      firstName: "Bill",
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const keys = await permsFor(supervisor, ac);
    assert.ok(keys.includes(BILLING_PERM.PAYMENT_REFUND));
    assert.ok(keys.includes(BILLING_PERM.PAYMENT_REVERSE));
    assert.ok(keys.includes(BILLING_PERM.INVOICE_VOID));
    assert.ok(keys.includes(BILLING_PERM.INVOICE_AMEND));
    assert.ok(keys.includes(BILLING_PERM.PRICE_OVERRIDE));
    assert.ok(keys.includes("activeclinic.cashier.reconcile"));
    assert.equal(keys.includes("activeclinic.consultation.record"), false);
    assert.equal(keys.includes("activeclinic.staff.assign_access"), false);

    const { patientId } = await seedPatient(ac);
    const charge = await createPatientCharge({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      patientId,
      chargeType: "procedure",
      description: "Proc",
      unitAmountMinor: 20000,
    });
    assert.equal(charge.result, BILLING_RESULT.CREATED);
    const inv = await createInvoice({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      patientId,
      chargeIds: [charge.charge.id],
    });
    assert.equal(inv.result, BILLING_RESULT.CREATED);
    const posted = await postInvoice({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      invoiceId: inv.invoice.id,
    });
    assert.equal(posted.result, BILLING_RESULT.OK);

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
      amountMinor: 5000,
      paymentMethod: PAYMENT_METHOD.CARD,
    });
    assert.equal(pay.result, BILLING_RESULT.CREATED);

    const refund = await refundPayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      paymentId: pay.payment.id,
      amountMinor: 1000,
      reason: "partial refund",
    });
    assert.equal(refund.result, BILLING_RESULT.OK);

    const pay2 = await recordPayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      patientId,
      amountMinor: 2000,
      paymentMethod: PAYMENT_METHOD.MOBILE_MONEY,
    });
    assert.equal(pay2.result, BILLING_RESULT.CREATED);
    const reverse = await reversePayment({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      paymentId: pay2.payment.id,
      reason: "duplicate",
    });
    assert.equal(reverse.result, BILLING_RESULT.OK);

    const voided = await voidInvoice({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      invoiceId: inv.invoice.id,
      reason: "posted in error",
    });
    assert.equal(voided.result, BILLING_RESULT.OK);

    // Second posted invoice for amend
    const charge2 = await createPatientCharge({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      patientId,
      chargeType: "consultation",
      description: "Follow-up",
      unitAmountMinor: 8000,
    });
    const inv2 = await createInvoice({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      patientId,
      chargeIds: [charge2.charge.id],
    });
    await postInvoice({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      invoiceId: inv2.invoice.id,
    });
    const amended = await amendPostedInvoice({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      invoiceId: inv2.invoice.id,
      notes: "Adjusted",
      adjustmentMinor: -500,
      reason: "courtesy",
    });
    assert.equal(amended.result, BILLING_RESULT.OK);

    const closed = await closeCashierSession({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      sessionId: opened.session.id,
      actualCashMinor: 0,
    });
    assert.equal(closed.result, CASHIER_RESULT.OK);
    const reconciled = await reconcileCashierSession({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: supervisor.staffMemberId,
      sessionId: opened.session.id,
      approvalNotes: "ok",
    });
    assert.equal(reconciled.result, CASHIER_RESULT.OK);
  });

  it("org admin and auditor transactional finance writes denied", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}a`;
    const ac = await seedTenant(stamp, "adm");
    const admin = await seedRoleUser(ac, {
      firstName: "Adm",
      roles: [{ roleKey: ORGANIZATION_ADMIN, scopeType: "organisation", facilityId: null }],
    });
    const auditor = await seedRoleUser(ac, {
      firstName: "Aud",
      roles: [{ roleKey: AUDITOR, scopeType: "organisation", facilityId: null }],
    });
    const manager = await seedRoleUser(ac, {
      firstName: "Mgr",
      roles: [{ roleKey: CLINIC_MANAGER }],
    });

    for (const user of [admin, auditor, manager]) {
      const keys = await permsFor(user, ac);
      assert.equal(keys.includes(BILLING_PERM.BILLING_CHARGE), false);
      assert.equal(keys.includes(BILLING_PERM.PAYMENT_COLLECT), false);
      assert.equal(keys.includes(BILLING_PERM.PAYMENT_REFUND), false);
      assert.equal(keys.includes(BILLING_PERM.PAYMENT_REVERSE), false);
      assert.equal(keys.includes(BILLING_PERM.PRICE_OVERRIDE), false);
      assert.equal(keys.includes("activeclinic.cashier.open_session"), false);
    }

    const { patientId } = await seedPatient(ac);
    const charge = await createPatientCharge({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: admin.staffMemberId,
      patientId,
      chargeType: "consultation",
      description: "denied",
      unitAmountMinor: 1000,
    });
    assert.equal(charge.result, BILLING_RESULT.ACCESS_DENIED);

    const app = makeApp();
    for (const user of [admin, auditor]) {
      const cookie = await sessionCookie(user.identityId, ac.orgId, ac.facilityId);
      assert.equal(
        (
          await request(app)
            .post(`/app/cashier/payments/${crypto.randomUUID()}/refund`)
            .set("Cookie", cookie)
            .type("form")
            .send({
              [CSRF_FIELD]: issueCsrfToken(MINIMAL_AC),
              amount: "1.00",
              reason: "x",
            })
        ).status,
        403
      );
    }
  });

  it("cross-tenant payment/invoice and foreign facility session denied", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}x`;
    const acA = await seedTenant(stamp, "xa");
    const acB = await seedTenant(`${stamp}b`, "xb");
    const financeA = await seedRoleUser(acA, {
      firstName: "Fa",
      roles: [{ roleKey: FINANCE_SUPERVISOR }],
    });
    const financeB = await seedRoleUser(acB, {
      firstName: "Fb",
      roles: [{ roleKey: FINANCE_SUPERVISOR }],
    });
    const { patientId } = await seedPatient(acB);
    const payB = await recordPayment({
      pool,
      tenantId: acB.orgId,
      facilityId: acB.facilityId,
      staffId: financeB.staffMemberId,
      patientId,
      amountMinor: 3000,
      paymentMethod: PAYMENT_METHOD.CARD,
    });
    assert.equal(payB.result, BILLING_RESULT.CREATED);

    const crossRefund = await refundPayment({
      pool,
      tenantId: acA.orgId,
      facilityId: acA.facilityId,
      staffId: financeA.staffMemberId,
      paymentId: payB.payment.id,
      amountMinor: 1000,
      reason: "cross tenant",
    });
    assert.equal(crossRefund.result, BILLING_RESULT.NOT_FOUND);

    const openedB = await openCashierSession({
      pool,
      tenantId: acB.orgId,
      facilityId: acB.facilityId,
      staffId: financeB.staffMemberId,
      openingCashMinor: 0,
    });
    assert.equal(openedB.result, CASHIER_RESULT.CREATED);
    const crossClose = await closeCashierSession({
      pool,
      tenantId: acA.orgId,
      facilityId: acA.facilityId,
      staffId: financeA.staffMemberId,
      sessionId: openedB.session.id,
      actualCashMinor: 0,
    });
    assert.equal(crossClose.result, CASHIER_RESULT.NOT_FOUND);
  });

  it("cashier cannot close another cashier session without manage", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}o`;
    const ac = await seedTenant(stamp, "own");
    const c1 = await seedRoleUser(ac, {
      firstName: "C1",
      roles: [{ roleKey: CASHIER }],
    });
    const c2 = await seedRoleUser(ac, {
      firstName: "C2",
      roles: [{ roleKey: CASHIER }],
    });
    const opened = await openCashierSession({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: c1.staffMemberId,
      openingCashMinor: 100,
    });
    assert.equal(opened.result, CASHIER_RESULT.CREATED);
    const denied = await closeCashierSession({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: c2.staffMemberId,
      sessionId: opened.session.id,
      actualCashMinor: 100,
    });
    assert.equal(denied.result, CASHIER_RESULT.ACCESS_DENIED);
  });

  it("price override required when catalogue unit price differs", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}p`;
    const ac = await seedTenant(stamp, "po");
    const billing = await seedRoleUser(ac, {
      firstName: "Bill",
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const finance = await seedRoleUser(ac, {
      firstName: "Fin",
      roles: [{ roleKey: FINANCE_SUPERVISOR }],
    });
    const { patientId } = await seedPatient(ac);
    const catalog = await pool.query(
      `INSERT INTO activeclinic.charge_catalogue_items (
         tenant_id, facility_id, code, name, amount_minor, currency_code,
         created_by_staff_id, updated_by_staff_id
       ) VALUES ($1, $2, $3, 'Consult', 15000, 'ZMW', $4, $4)
       RETURNING id`,
      [ac.orgId, ac.facilityId, `C-${stamp.slice(-4)}`, billing.staffMemberId]
    );
    const denied = await createPatientCharge({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffMemberId,
      patientId,
      catalogueItemId: catalog.rows[0].id,
      chargeType: "consultation",
      description: "Override attempt",
      unitAmountMinor: 10000,
    });
    assert.equal(denied.result, BILLING_RESULT.ACCESS_DENIED);
    assert.equal(denied.reason, "price_override_required");

    const allowed = await createPatientCharge({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: finance.staffMemberId,
      patientId,
      catalogueItemId: catalog.rows[0].id,
      chargeType: "consultation",
      description: "Override ok",
      unitAmountMinor: 10000,
    });
    assert.equal(allowed.result, BILLING_RESULT.CREATED);
  });

  it("demo billing/cashier/finance remain login-ready with SoD keys", async () => {
    requireDb();
    const demo = await seedActiveClinicDemoClinics(pool, {
      clinicKeys: [DEMO_CLINIC_KEY],
      requireIdentityKey: "blessboard-platform-v5",
    });
    assert.equal(demo.ok, true, JSON.stringify(demo));
    const org = (
      await pool.query(
        `SELECT id FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
        [DEMO_CLINIC_KEY]
      )
    ).rows[0];
    assert.ok(org);

    const specs = ["billing", "cashier", "finance_supervisor"]
      .map((k) => ACTIVECLINIC_DEMO.roleUsers.find((u) => u.key === k))
      .filter(Boolean);
    assert.equal(specs.length, 3);

    for (const spec of specs) {
      const staff = (
        await pool.query(
          `SELECT sm.*
             FROM activeclinic.staff_members sm
             JOIN platform.identities pi ON pi.id = sm.platform_identity_id
            WHERE sm.organization_id = $1 AND lower(pi.primary_email) = lower($2)
            LIMIT 1`,
          [org.id, spec.email]
        )
      ).rows[0];
      assert.ok(staff, spec.email);
      const identity = (
        await pool.query(`SELECT * FROM platform.identities WHERE id = $1`, [
          staff.platform_identity_id,
        ])
      ).rows[0];
      const elig = await evaluateStaffEligibility(pool, staff, identity);
      assert.equal(elig.ok, true, `${spec.email} ${elig.code}`);

      const facility = (
        await pool.query(
          `SELECT facility_id FROM activeclinic.staff_facility_assignments
            WHERE staff_member_id = $1
            ORDER BY is_primary DESC NULLS LAST LIMIT 1`,
          [staff.id]
        )
      ).rows[0];
      const perms = await resolveEffectivePermissions(pool, {
        organizationId: org.id,
        staffMemberId: staff.id,
        platformIdentityId: identity.id,
        facilityId: facility.facility_id,
      });
      assert.equal(perms.ok, true);
      if (spec.key === "billing") {
        assert.ok(perms.permissions.includes(BILLING_PERM.BILLING_CHARGE));
        assert.equal(perms.permissions.includes(BILLING_PERM.PAYMENT_REFUND), false);
      }
      if (spec.key === "cashier") {
        assert.ok(perms.permissions.includes(BILLING_PERM.PAYMENT_COLLECT));
        assert.equal(perms.permissions.includes(BILLING_PERM.PAYMENT_REVERSE), false);
      }
      if (spec.key === "finance_supervisor") {
        assert.ok(perms.permissions.includes(BILLING_PERM.PAYMENT_REFUND));
        assert.ok(perms.permissions.includes(BILLING_PERM.PAYMENT_REVERSE));
      }
    }
  });
});
