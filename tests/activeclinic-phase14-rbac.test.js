"use strict";

/**
 * ActiveClinic V7 Phase 14 — RBAC, facility, and department revalidation.
 * HTTP negative tests for Phase 4+ screens. Server auth remains authoritative.
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
  BILLING_OFFICER,
  CASHIER,
  FINANCE_SUPERVISOR,
  ORGANIZATION_ADMIN,
  AUDITOR,
  PHARMACIST,
  NURSE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  addMedication,
} = require("../src/activeclinic/services/activeClinicPharmacyService");
const {
  createPurchaseOrder,
} = require("../src/activeclinic/services/activeClinicPharmacyOpsService");
const {
  assertNotLastOrgAdminRemoval,
  RESULT: ACCESS_RESULT,
} = require("../src/activeclinic/services/activeClinicAccessManagementService");
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

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 940000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

async function seedTenant(stamp, keyPrefix, options = {}) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `P14 ${keyPrefix}`,
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
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  await ensureDefaultDepartments(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });

  let facilityBId = null;
  if (options.secondFacility) {
    const facilityB = await createFacility(pool, {
      organizationId: orgId,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: `${keyPrefix}-b`.slice(0, 64),
      displayName: "Facility B",
      facilityType: "clinic",
      status: "active",
      isPrimary: false,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
    });
    assert.equal(facilityB.ok, true, JSON.stringify(facilityB));
    await ensureDefaultDepartments(pool, {
      organizationId: orgId,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityId: facilityB.facility.id,
    });
    facilityBId = facilityB.facility.id;
  }

  return {
    orgId,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    facilityBId,
  };
}

async function seedRoleUser(ac, opts) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `p14.${phone.slice(-8)}@example.test`,
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true);
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const homeFacilityId = opts.facilityId || ac.facilityId;
  const staff = await createStaffMember(pool, {
    organizationId: ac.orgId,
    healthcareOrganizationId: ac.hcoId,
    firstName: opts.firstName || "P14",
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
    facilityId: homeFacilityId,
    isPrimary: true,
  });
  for (const role of opts.roles || []) {
    const scopeType = role.scopeType || "facility";
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: role.roleKey,
      scopeType,
      facilityId: scopeType === "organisation" ? null : role.facilityId != null ? role.facilityId : homeFacilityId,
      assignmentOrigin: "system",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
  }
  return {
    identityId: identity.identity.id,
    staffMemberId: staff.staffMember.id,
  };
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

async function getStatus(app, cookie, path) {
  const res = await request(app).get(path).set("Cookie", cookie);
  return res;
}

describe("ActiveClinic V7 Phase 14 RBAC", () => {
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

  it("unauthenticated Phase 4 screens redirect to login", async () => {
    requireDb();
    const app = makeApp();
    const paths = [
      "/app/billing/credit-notes/new",
      "/app/billing/reports/revenue",
      "/app/pharmacy/inventory/adjust",
      "/app/pharmacy/purchase-orders/new",
      "/app/cashier/refunds/request",
    ];
    for (const path of paths) {
      const res = await request(app).get(path);
      assert.equal(res.status, 303, path);
      assert.match(String(res.headers.location || ""), /login/i, path);
    }
  });

  it("missing permission is 403 for finance and pharmacy mutations", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}m`;
    const ac = await seedTenant(stamp, "p14m");
    const cashier = await seedRoleUser(ac, {
      firstName: "Cash",
      roles: [{ roleKey: CASHIER }],
    });
    const billing = await seedRoleUser(ac, {
      firstName: "Bill",
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const finance = await seedRoleUser(ac, {
      firstName: "Fin",
      roles: [{ roleKey: FINANCE_SUPERVISOR }],
    });
    const nurse = await seedRoleUser(ac, {
      firstName: "Nia",
      roles: [{ roleKey: NURSE }],
    });
    const pharmacist = await seedRoleUser(ac, {
      firstName: "Pam",
      roles: [{ roleKey: PHARMACIST }],
    });
    const app = makeApp();
    const cashierCookie = await sessionCookie(cashier.identityId, ac.orgId, ac.facilityId);
    const billingCookie = await sessionCookie(billing.identityId, ac.orgId, ac.facilityId);
    const financeCookie = await sessionCookie(finance.identityId, ac.orgId, ac.facilityId);
    const nurseCookie = await sessionCookie(nurse.identityId, ac.orgId, ac.facilityId);
    const pharmCookie = await sessionCookie(pharmacist.identityId, ac.orgId, ac.facilityId);

    assert.equal((await getStatus(app, cashierCookie, "/app/billing/credit-notes/new")).status, 403);
    assert.equal((await getStatus(app, cashierCookie, "/app/billing/reports/revenue")).status, 403);
    assert.equal((await getStatus(app, cashierCookie, "/app/billing/corrections")).status, 403);
    assert.equal((await getStatus(app, cashierCookie, "/app/billing/charges/review")).status, 403);
    assert.equal((await getStatus(app, billingCookie, "/app/billing/credit-notes/new")).status, 403);
    assert.equal((await getStatus(app, billingCookie, "/app/cashier")).status, 403);
    assert.equal((await getStatus(app, nurseCookie, "/app/pharmacy/inventory/adjust")).status, 403);
    assert.equal((await getStatus(app, nurseCookie, "/app/pharmacy/purchase-orders/new")).status, 403);
    assert.equal((await getStatus(app, nurseCookie, "/app/pharmacy/inventory/receive")).status, 403);
    assert.equal((await getStatus(app, nurseCookie, "/app/pharmacy/inventory/transfer")).status, 403);

    assert.equal((await getStatus(app, financeCookie, "/app/billing/credit-notes/new")).status, 200);
    assert.equal((await getStatus(app, financeCookie, "/app/billing/reports/revenue")).status, 200);
    assert.equal((await getStatus(app, financeCookie, "/app/billing/corrections")).status, 200);
    assert.equal((await getStatus(app, pharmCookie, "/app/pharmacy/inventory/adjust")).status, 200);
    assert.equal((await getStatus(app, pharmCookie, "/app/pharmacy/purchase-orders/new")).status, 200);
    assert.equal((await getStatus(app, cashierCookie, "/app/billing")).status, 200);
  });

  it("wrong tenant conceals credit notes; wrong facility conceals purchase orders", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}x`;
    const tenantA = await seedTenant(`${stamp}a`, "p14xa", { secondFacility: true });
    const tenantB = await seedTenant(`${stamp}b`, "p14xb");
    const financeA = await seedRoleUser(tenantA, {
      firstName: "FinA",
      roles: [{ roleKey: FINANCE_SUPERVISOR }],
    });
    const billingB = await seedRoleUser(tenantB, {
      firstName: "BillB",
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const pharmacistA = await seedRoleUser(tenantA, {
      firstName: "PhA",
      roles: [{ roleKey: PHARMACIST }],
    });
    const pharmacistB = await seedRoleUser(tenantA, {
      firstName: "PhB",
      facilityId: tenantA.facilityBId,
      roles: [{ roleKey: PHARMACIST, facilityId: tenantA.facilityBId }],
    });

    const patientA = (
      await pool.query(
        `INSERT INTO activeclinic.patients (
           organization_id, healthcare_organization_id, patient_number,
           first_name, last_name, date_of_birth, sex_at_registration
         ) VALUES ($1, $2, $3, 'Iso', 'Patient', '1990-01-01', 'female')
         RETURNING id`,
        [tenantA.orgId, tenantA.hcoId, `AC-2026-${String(Date.now()).slice(-6)}`]
      )
    ).rows[0].id;
    const creditNoteId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO activeclinic.credit_notes (
         id, tenant_id, facility_id, patient_id, credit_note_number,
         amount_minor, reason, created_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, 1000, 'Isolation fixture', $6)`,
      [creditNoteId, tenantA.orgId, tenantA.facilityId, patientA, `CN-${stamp}`, financeA.staffMemberId]
    );

    const medication = await addMedication(pool, {
      staffId: pharmacistB.staffMemberId,
      organizationId: tenantA.orgId,
      healthcareOrganizationId: tenantA.hcoId,
      genericName: "Amoxicillin",
      strength: "500mg",
      dosageForm: "capsule",
      unitOfMeasure: "capsule",
    });
    assert.equal(medication.ok, true, JSON.stringify(medication));
    const po = await createPurchaseOrder(pool, {
      staffId: pharmacistB.staffMemberId,
      organizationId: tenantA.orgId,
      healthcareOrganizationId: tenantA.hcoId,
      facilityId: tenantA.facilityBId,
      supplierName: "Facility B Supplier",
      items: [
        {
          medicationCatalogueItemId: medication.medication.id,
          quantityOrdered: 10,
        },
      ],
    });
    assert.equal(po.ok, true, JSON.stringify(po));

    const app = makeApp();
    const billingBCookie = await sessionCookie(billingB.identityId, tenantB.orgId, tenantB.facilityId);
    const pharmACookie = await sessionCookie(pharmacistA.identityId, tenantA.orgId, tenantA.facilityId);
    const pharmBCookie = await sessionCookie(pharmacistB.identityId, tenantA.orgId, tenantA.facilityBId);
    const financeACookie = await sessionCookie(financeA.identityId, tenantA.orgId, tenantA.facilityId);

    const foreignCredit = await getStatus(
      app,
      billingBCookie,
      `/app/billing/credit-notes/${creditNoteId}`
    );
    assert.equal(foreignCredit.status, 404);

    const ownCredit = await getStatus(
      app,
      financeACookie,
      `/app/billing/credit-notes/${creditNoteId}`
    );
    assert.equal(ownCredit.status, 200);

    const leakedPo = await getStatus(
      app,
      pharmACookie,
      `/app/pharmacy/purchase-orders/${po.purchaseOrder.id}`
    );
    assert.equal(leakedPo.status, 404);

    const ownPo = await getStatus(
      app,
      pharmBCookie,
      `/app/pharmacy/purchase-orders/${po.purchaseOrder.id}`
    );
    assert.equal(ownPo.status, 200);
  });

  it("inactive pharmacy department and inactive staff are denied", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}d`;
    const ac = await seedTenant(stamp, "p14d");
    const pharmacist = await seedRoleUser(ac, {
      firstName: "Dept",
      roles: [{ roleKey: PHARMACIST }],
    });
    await pool.query(
      `UPDATE activeclinic.departments
          SET status = 'inactive'
        WHERE facility_id = $1 AND department_type = 'pharmacy'`,
      [ac.facilityId]
    );
    const app = makeApp();
    const cookie = await sessionCookie(pharmacist.identityId, ac.orgId, ac.facilityId);
    const inactiveDept = await getStatus(app, cookie, "/app/pharmacy/inventory/adjust");
    assert.equal(inactiveDept.status, 403);

    const staff = await seedRoleUser(ac, {
      firstName: "Gone",
      roles: [{ roleKey: PHARMACIST }],
    });
    await pool.query(
      `UPDATE activeclinic.departments
          SET status = 'active'
        WHERE facility_id = $1 AND department_type = 'pharmacy'`,
      [ac.facilityId]
    );
    await pool.query(
      `UPDATE activeclinic.staff_members SET status = 'inactive' WHERE id = $1`,
      [staff.staffMemberId]
    );
    const inactiveCookie = await sessionCookie(staff.identityId, ac.orgId, ac.facilityId);
    const inactiveStaff = await getStatus(app, inactiveCookie, "/app/pharmacy/inventory/adjust");
    assert.equal(inactiveStaff.status, 403);
  });

  it("billing and pharmacy dashboard links agree with server permissions", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}n`;
    const ac = await seedTenant(stamp, "p14n");
    const cashier = await seedRoleUser(ac, {
      firstName: "NavC",
      roles: [{ roleKey: CASHIER }],
    });
    const billing = await seedRoleUser(ac, {
      firstName: "NavB",
      roles: [{ roleKey: BILLING_OFFICER }],
    });
    const pharmacist = await seedRoleUser(ac, {
      firstName: "NavP",
      roles: [{ roleKey: PHARMACIST }],
    });
    const auditor = await seedRoleUser(ac, {
      firstName: "NavA",
      roles: [{ roleKey: AUDITOR, scopeType: "organisation" }],
    });
    const app = makeApp();
    const cashierHtml = (
      await getStatus(
        app,
        await sessionCookie(cashier.identityId, ac.orgId, ac.facilityId),
        "/app/billing"
      )
    ).text;
    assert.equal(cashierHtml.includes("/app/billing/reports/revenue"), false);
    assert.equal(cashierHtml.includes("/app/billing/corrections"), false);
    assert.equal(cashierHtml.includes("/app/billing/charges/review"), false);
    assert.equal(cashierHtml.includes('href="/app/cashier"'), true);

    const billingHtml = (
      await getStatus(
        app,
        await sessionCookie(billing.identityId, ac.orgId, ac.facilityId),
        "/app/billing"
      )
    ).text;
    assert.equal(billingHtml.includes("/app/billing/reports/revenue"), true);
    assert.equal(billingHtml.includes("/app/billing/corrections"), true);
    assert.equal(billingHtml.includes("/app/billing/charges/review"), true);
    assert.equal(billingHtml.includes('href="/app/cashier"'), false);

    const pharmHtml = (
      await getStatus(
        app,
        await sessionCookie(pharmacist.identityId, ac.orgId, ac.facilityId),
        "/app/pharmacy"
      )
    ).text;
    assert.equal(pharmHtml.includes("/app/pharmacy/inventory/receive"), true);
    assert.equal(pharmHtml.includes("/app/pharmacy/inventory/adjust"), true);
    assert.equal(pharmHtml.includes("/app/pharmacy/purchase-orders"), true);

    const auditorHtml = (
      await getStatus(
        app,
        await sessionCookie(auditor.identityId, ac.orgId, ac.facilityId),
        "/app/pharmacy"
      )
    ).text;
    assert.equal(auditorHtml.includes("/app/pharmacy/inventory"), true);
    assert.equal(auditorHtml.includes("/app/pharmacy/purchase-orders"), true);
    assert.equal(auditorHtml.includes("/app/pharmacy/inventory/receive"), false);
    assert.equal(auditorHtml.includes("/app/pharmacy/inventory/adjust"), false);
    assert.equal(auditorHtml.includes("/app/pharmacy/inventory/transfer"), false);
  });

  it("last organization admin cannot be removed", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}l`;
    const ac = await seedTenant(stamp, "p14l");
    const admin = await seedRoleUser(ac, {
      firstName: "Only",
      lastName: "Admin",
      roles: [{ roleKey: ORGANIZATION_ADMIN, scopeType: "organisation" }],
    });
    const blocked = await assertNotLastOrgAdminRemoval(pool, {
      organizationId: ac.orgId,
      staffMemberId: admin.staffMemberId,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, ACCESS_RESULT.LAST_ORG_ADMIN);
  });
});
