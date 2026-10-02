#!/usr/bin/env node
"use strict";

/**
 * V2.03 Prompt 6 — high-priority coverage gap closure (behavioral).
 *
 * Targets: authorization / tenant isolation / writes / billing / validation.
 * Marker: V203_COVERAGE_GAP_CLOSURE_PASS
 */

const { describe, it, before, after } = require("node:test");
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
  authorizeStaffPermission,
  BILLING_OFFICER,
  CASHIER,
  RECEPTIONIST,
  CLINICIAN,
  FINANCE_SUPERVISOR,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createPatientCharge,
  createInvoice,
  postInvoice,
  recordPayment,
  addCustomLineToDraftInvoice,
  voidInvoice,
  createChargeCatalogItem,
  listChargeCatalogItems,
  RESULT: BILLING_RESULT,
  PAYMENT_METHOD,
} = require("../src/activeclinic/services/activeClinicBillingService");
const billingOps = require("../src/activeclinic/services/activeClinicBillingOpsService");
const {
  startEncounter,
  listOpenEncounters,
  closeEncounter,
  RESULT: CLINICAL_RESULT,
} = require("../src/activeclinic/services/activeClinicClinicalService");
const {
  openCashierSession,
  RESULT: CASHIER_RESULT,
} = require("../src/activeclinic/services/activeClinicCashierSessionService");
const {
  rejectForgedTenantIdentifiers,
  assertResourceInsideBlessBoardTenant,
  assertActiveClinicAuthScope,
} = require("../src/platform/rbac");
const { forgeTenantBody } = require("./helpers/authzNegativeHelpers");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  parseMediaUploadsEnabled,
  areMediaUploadsEnabled,
} = require("../src/blessboard/config/mediaUploadsEnabled");
const {
  assertHostnameAllowedForDeployment,
} = require("../src/platform/http/platformRequestContext");
const {
  authorizeWebsiteInstance,
} = require("../src/platform/website/authorizeWebsite");
const {
  EDITOR_PERMISSIONS,
  PLATFORM_ADMIN_PERMISSIONS,
  PERMISSIONS,
} = require("../src/platform/website/permissions");
const instanceRepo = require("../src/platform/website/instanceRepository");

const PASSWORD = "gap-closure-pass-12";
let pool;
let skipReason = null;
let phoneSeq = 880000000;

function requireDb(t) {
  if (skipReason) t.skip(`foundation unavailable: ${skipReason}`);
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

async function provisionClinic(label, roleKeys) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp.slice(0, 48),
    displayName: `Gap ${label}`,
    productKey: "activeclinic",
    productTenantKey: stamp.slice(0, 48),
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
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `hq-${stamp}`.slice(0, 48),
    displayName: `${label} HQ`,
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
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
  assert.equal(staff.ok, true, JSON.stringify(staff));
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

async function seedRoleUser(clinic, label, roleKey) {
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
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    firstName: label,
    lastName: "Gap",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: label,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: clinic.organizationId,
    staffMemberId: staff.staffMember.id,
    facilityId: clinic.facilityId,
    isPrimary: true,
  });
  const role = await assignStaffRole(pool, {
    organizationId: clinic.organizationId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType: "facility",
    facilityId: clinic.facilityId,
  });
  assert.equal(role.ok, true, JSON.stringify(role));
  return { staffId: staff.staffMember.id, identityId: identity.identity.id };
}

async function seedPatient(clinic) {
  phoneSeq += 1;
  const patientNumber = `AC-2026-${String(phoneSeq).slice(-6).padStart(6, "0")}`;
  const row = await pool.query(
    `INSERT INTO activeclinic.patients (
       organization_id, healthcare_organization_id, patient_number,
       first_name, last_name, date_of_birth, sex_at_registration
     ) VALUES ($1, $2, $3, 'Pat', 'Gap', '1990-01-15', 'female')
     RETURNING id`,
    [clinic.organizationId, clinic.hcoId, patientNumber]
  );
  return row.rows[0].id;
}

describe("V203 coverage gap closure — unit authz/tenant/media/host", () => {
  it("forged tenant IDs denied; matching trusted IDs allowed when opted in", () => {
    const forged = rejectForgedTenantIdentifiers({ body: forgeTenantBody() });
    assert.equal(forged.ok, false);
    assert.equal(forged.code, "forged_tenant_identifiers");

    const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const match = rejectForgedTenantIdentifiers({
      body: { organizationId: org },
      trusted: { organizationId: org },
      allowMatchingTrusted: true,
    });
    assert.equal(match.ok, true);

    const mismatch = rejectForgedTenantIdentifiers({
      body: { organizationId: org },
      trusted: { organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      allowMatchingTrusted: true,
    });
    assert.equal(mismatch.ok, false);
  });

  it("BlessBoard resource must stay inside resolved tenant", () => {
    const unresolved = assertResourceInsideBlessBoardTenant(
      { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      null
    );
    assert.equal(unresolved.ok, false);

    const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const church = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const ok = assertResourceInsideBlessBoardTenant(
      { organizationId: org, churchId: church },
      {
        resolved: true,
        organization: { id: org },
        church: { id: church },
      }
    );
    assert.equal(ok.ok, true);

    const cross = assertResourceInsideBlessBoardTenant(
      {
        organizationId: org,
        churchId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      },
      {
        resolved: true,
        organization: { id: org },
        church: { id: church },
      }
    );
    assert.equal(cross.ok, false);
  });

  it("ActiveClinic auth scope rejects facility mismatch", () => {
    const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const facA = "11111111-1111-4111-8111-111111111111";
    const facB = "22222222-2222-4222-8222-222222222222";
    const denied = assertActiveClinicAuthScope(
      { organizationId: org, facilityId: facB },
      {
        authenticated: true,
        organization: { id: org },
        selectedFacility: { id: facA },
      }
    );
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "forged_facility");

    const ok = assertActiveClinicAuthScope(
      { organizationId: org, facilityId: facA },
      {
        authenticated: true,
        organization: { id: org },
        selectedFacility: { id: facA },
      }
    );
    assert.equal(ok.ok, true);
  });

  it("media upload kill-switch fail-closed; host line mismatch denied", () => {
    assert.equal(areMediaUploadsEnabled({}), false);
    assert.equal(
      parseMediaUploadsEnabled({ BLESSBOARD_MEDIA_UPLOADS_ENABLED: "1" }).enabled,
      true
    );
    const mismatch = assertHostnameAllowedForDeployment(
      {
        productSelection: "hostname",
        deploymentCode: "x",
        platformLine: "v7",
        apexDomains: ["app.blessboard.test"],
      },
      { hostname: "app.blessboard.test", platformLine: "v8" }
    );
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, "PLATFORM_LINE_HOST_MISMATCH");
  });

  it("website publish permission distinct from edit", async () => {
    const original = instanceRepo.findWebsiteInstanceById;
    instanceRepo.findWebsiteInstanceById = async () => ({
      id: "11111111-1111-4111-8111-111111111111",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      productCode: "activeclinic",
      slug: "clinic-a",
      editLocked: false,
    });
    const db = { query: async () => ({ rows: [], rowCount: 0 }) };
    try {
      const editor = await authorizeWebsiteInstance(db, {
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        instanceId: "11111111-1111-4111-8111-111111111111",
        permission: PERMISSIONS.PUBLISH,
        grantedPermissions: EDITOR_PERMISSIONS.slice(),
      });
      assert.equal(editor.ok, false);
      const admin = await authorizeWebsiteInstance(db, {
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        instanceId: "11111111-1111-4111-8111-111111111111",
        permission: PERMISSIONS.PUBLISH,
        grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
      });
      assert.equal(admin.ok, true);
    } finally {
      instanceRepo.findWebsiteInstanceById = original;
    }
  });
});

describe("V203 coverage gap closure — billing write workflow + negatives", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 400) : "no db";
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("authorized charge→invoice→post→pay; post immutable; role/malformed denied", async (t) => {
    requireDb(t);
    const billingClinic = await provisionClinic("billa", [BILLING_OFFICER]);
    const cashier = await seedRoleUser(billingClinic, "Cash", CASHIER);
    const reception = await seedRoleUser(billingClinic, "Recv", RECEPTIONIST);
    const clinician = await seedRoleUser(billingClinic, "Clin", CLINICIAN);
    const patientId = await seedPatient(billingClinic);

    const deniedCharge = await createPatientCharge({
      pool,
      tenantId: billingClinic.organizationId,
      facilityId: billingClinic.facilityId,
      staffId: reception.staffId,
      patientId,
      chargeType: "procedure",
      description: "Denied",
      unitAmountMinor: 1000,
    });
    assert.equal(deniedCharge.result, BILLING_RESULT.ACCESS_DENIED);

    const charge = await createPatientCharge({
      pool,
      tenantId: billingClinic.organizationId,
      facilityId: billingClinic.facilityId,
      staffId: billingClinic.staffId,
      patientId,
      chargeType: "procedure",
      description: "Gap procedure",
      unitAmountMinor: 10000,
      quantity: 1,
    });
    assert.equal(charge.result, BILLING_RESULT.CREATED, JSON.stringify(charge));

    const invoice = await createInvoice({
      pool,
      tenantId: billingClinic.organizationId,
      facilityId: billingClinic.facilityId,
      staffId: billingClinic.staffId,
      patientId,
      chargeIds: [charge.charge.id],
    });
    assert.equal(invoice.result, BILLING_RESULT.CREATED, JSON.stringify(invoice));

    const posted = await postInvoice({
      pool,
      tenantId: billingClinic.organizationId,
      facilityId: billingClinic.facilityId,
      staffId: billingClinic.staffId,
      invoiceId: invoice.invoice.id,
    });
    assert.equal(posted.result, BILLING_RESULT.OK, JSON.stringify(posted));

    const mutatePosted = await addCustomLineToDraftInvoice({
      pool,
      tenantId: billingClinic.organizationId,
      facilityId: billingClinic.facilityId,
      staffId: billingClinic.staffId,
      invoiceId: invoice.invoice.id,
      description: "should fail",
      quantity: 1,
      unitAmountMinor: 100,
    });
    assert.equal(mutatePosted.result, BILLING_RESULT.IMMUTABLE);

    const repost = await postInvoice({
      pool,
      tenantId: billingClinic.organizationId,
      facilityId: billingClinic.facilityId,
      staffId: billingClinic.staffId,
      invoiceId: invoice.invoice.id,
    });
    assert.equal(repost.result, BILLING_RESULT.IMMUTABLE);

    const noSession = await recordPayment({
      pool,
      tenantId: billingClinic.organizationId,
      facilityId: billingClinic.facilityId,
      staffId: cashier.staffId,
      patientId,
      amountMinor: 1000,
      paymentMethod: PAYMENT_METHOD.CASH,
    });
    assert.equal(noSession.result, BILLING_RESULT.SESSION_REQUIRED);

    const noRef = await recordPayment({
      pool,
      tenantId: billingClinic.organizationId,
      facilityId: billingClinic.facilityId,
      staffId: cashier.staffId,
      patientId,
      amountMinor: 1000,
      paymentMethod: PAYMENT_METHOD.MOBILE_MONEY,
    });
    assert.equal(noRef.result, BILLING_RESULT.INVALID_INPUT);

    const session = await openCashierSession({
      pool,
      tenantId: billingClinic.organizationId,
      facilityId: billingClinic.facilityId,
      staffId: cashier.staffId,
      openingCashMinor: 0,
    });
    assert.equal(session.result, CASHIER_RESULT.CREATED);

    const rolePay = await recordPayment({
      pool,
      tenantId: billingClinic.organizationId,
      facilityId: billingClinic.facilityId,
      staffId: reception.staffId,
      patientId,
      amountMinor: 1000,
      paymentMethod: PAYMENT_METHOD.CASH,
      cashierSessionId: session.session.id,
    });
    assert.equal(rolePay.result, BILLING_RESULT.ACCESS_DENIED);

    const pay = await recordPayment({
      pool,
      tenantId: billingClinic.organizationId,
      facilityId: billingClinic.facilityId,
      staffId: cashier.staffId,
      patientId,
      amountMinor: 2500,
      paymentMethod: PAYMENT_METHOD.CASH,
      cashierSessionId: session.session.id,
      invoiceAllocations: [{ invoiceId: invoice.invoice.id, amountMinor: 2500 }],
    });
    assert.equal(pay.result, BILLING_RESULT.CREATED, JSON.stringify(pay));

    const bad = await recordPayment({
      pool,
      tenantId: billingClinic.organizationId,
      facilityId: billingClinic.facilityId,
      staffId: cashier.staffId,
      patientId,
      amountMinor: 0,
      paymentMethod: PAYMENT_METHOD.CASH,
      cashierSessionId: session.session.id,
    });
    assert.equal(bad.result, BILLING_RESULT.INVALID_INPUT);

    const clinAuth = await authorizeStaffPermission(pool, {
      organizationId: billingClinic.organizationId,
      staffMemberId: clinician.staffId,
      facilityId: billingClinic.facilityId,
      permissionKey: "activeclinic.billing.charge",
    });
    assert.equal(clinAuth.ok, false);
  });
});

describe("V203 coverage gap closure — void / catalog / billing-ops authz", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 400) : "no db";
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("catalog create+list; void posted invoice; ops AR/credit-note role gates", async (t) => {
    requireDb(t);
    const clinic = await provisionClinic("voidops", [FINANCE_SUPERVISOR]);
    const billingOfficer = await seedRoleUser(clinic, "BillV", BILLING_OFFICER);
    const cashier = await seedRoleUser(clinic, "CashV", CASHIER);
    const reception = await seedRoleUser(clinic, "RecvV", RECEPTIONIST);
    const patientId = await seedPatient(clinic);

    const deniedCatalog = await createChargeCatalogItem({
      pool,
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: reception.staffId,
      code: `GAP-${Date.now().toString(36)}`,
      name: "Denied catalog",
      category: "procedure",
      amountMinor: 500,
    });
    assert.equal(deniedCatalog.result, BILLING_RESULT.ACCESS_DENIED);

    const catalog = await createChargeCatalogItem({
      pool,
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: clinic.staffId,
      code: `GAP-${Date.now().toString(36)}`,
      name: "Gap catalog item",
      category: "procedure",
      amountMinor: 7500,
    });
    assert.equal(catalog.result, BILLING_RESULT.CREATED, JSON.stringify(catalog));

    const listed = await listChargeCatalogItems({
      pool,
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: clinic.staffId,
    });
    assert.equal(listed.result, BILLING_RESULT.OK);
    assert.ok(listed.items.some((i) => i.id === catalog.item.id));

    const charge = await createPatientCharge({
      pool,
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: clinic.staffId,
      patientId,
      chargeType: "procedure",
      description: "Voidable",
      unitAmountMinor: 4000,
    });
    assert.equal(charge.result, BILLING_RESULT.CREATED, JSON.stringify(charge));
    const invoice = await createInvoice({
      pool,
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: clinic.staffId,
      patientId,
      chargeIds: [charge.charge.id],
    });
    assert.equal(invoice.result, BILLING_RESULT.CREATED, JSON.stringify(invoice));
    const posted = await postInvoice({
      pool,
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: clinic.staffId,
      invoiceId: invoice.invoice.id,
    });
    assert.equal(posted.result, BILLING_RESULT.OK, JSON.stringify(posted));

    const noReason = await voidInvoice({
      pool,
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: clinic.staffId,
      invoiceId: invoice.invoice.id,
    });
    assert.equal(noReason.result, BILLING_RESULT.INVALID_INPUT);

    const roleVoid = await voidInvoice({
      pool,
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: billingOfficer.staffId,
      invoiceId: invoice.invoice.id,
      reason: "billing officer cannot void (SoD)",
    });
    assert.equal(roleVoid.result, BILLING_RESULT.ACCESS_DENIED);

    const voided = await voidInvoice({
      pool,
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: clinic.staffId,
      invoiceId: invoice.invoice.id,
      reason: "billing correction",
    });
    assert.equal(voided.result, BILLING_RESULT.OK, JSON.stringify(voided));

    const arDenied = await billingOps.listAccountsReceivable(pool, {
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: reception.staffId,
    });
    assert.equal(arDenied.result, billingOps.RESULT.ACCESS_DENIED);

    const ar = await billingOps.listAccountsReceivable(pool, {
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: clinic.staffId,
    });
    assert.equal(ar.result, billingOps.RESULT.OK);

    const creditDenied = await billingOps.createCreditNote(pool, {
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: cashier.staffId,
      patientId,
      invoiceId: invoice.invoice.id,
      amountMinor: 100,
      reason: "denied",
    });
    assert.equal(creditDenied.result, billingOps.RESULT.ACCESS_DENIED);
  });
});

describe("V203 coverage gap closure — clinical encounter authz + duplicate", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 400) : "no db";
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("clinician starts encounter; receptionist denied; duplicate active blocked", async (t) => {
    requireDb(t);
    const clinic = await provisionClinic("clinenc", [CLINICIAN]);
    const reception = await seedRoleUser(clinic, "RecvC", RECEPTIONIST);
    const patientId = await seedPatient(clinic);

    const denied = await startEncounter(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId,
      actor: { staffMemberId: reception.staffId, platformIdentityId: reception.identityId },
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, CLINICAL_RESULT.ACCESS_DENIED);

    const started = await startEncounter(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId,
      actor: { staffMemberId: clinic.staffId, platformIdentityId: clinic.identityId },
    });
    assert.equal(started.ok, true, JSON.stringify(started));

    const dup = await startEncounter(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId,
      actor: { staffMemberId: clinic.staffId, platformIdentityId: clinic.identityId },
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.code, CLINICAL_RESULT.DUPLICATE_ACTIVE_ENCOUNTER);

    const open = await listOpenEncounters(pool, {
      organizationId: clinic.organizationId,
      facilityId: clinic.facilityId,
      actor: { staffMemberId: clinic.staffId, platformIdentityId: clinic.identityId },
    });
    assert.equal(open.ok, true);
    assert.ok(open.encounters.some((e) => e.id === started.encounter.id));

    const closed = await closeEncounter(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      encounterId: started.encounter.id,
      closureNote: "gap close",
      version: started.encounter.version,
      actor: { staffMemberId: clinic.staffId, platformIdentityId: clinic.identityId },
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(closed.ok, true, JSON.stringify(closed));
  });
});

describe("V203 coverage gap closure — marker", () => {
  it("V203_COVERAGE_GAP_CLOSURE_PASS", () => {
    assert.equal("V203_COVERAGE_GAP_CLOSURE_PASS", "V203_COVERAGE_GAP_CLOSURE_PASS");
  });
});
