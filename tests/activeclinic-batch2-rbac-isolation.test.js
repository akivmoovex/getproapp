"use strict";

/**
 * ActiveClinic V2.03 Batch 2 — RBAC / tenant / facility isolation (server-side).
 * UI hiding is not sufficient; these checks assert HTTP denials and scope.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
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
  CLINIC_MANAGER,
  FACILITY_ADMIN,
  LAB_TECHNICIAN,
  PHARMACIST,
  RADIOLOGY_STAFF,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  startEncounter,
} = require("../src/activeclinic/services/activeClinicClinicalService");
const {
  createPatientCharge,
  createInvoice,
  postInvoice,
  RESULT,
} = require("../src/activeclinic/services/activeClinicBillingService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");

const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

const FOREIGN_FACILITY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const FOREIGN_ORG = "11111111-2222-4333-8444-555555555555";

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

function withCsrf(sessionCookie) {
  const csrf = issueCsrfToken(MINIMAL_AC);
  return {
    csrf,
    cookie: `${sessionCookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`,
  };
}

function assertDenied(status) {
  assert.ok([403, 404].includes(status), `expected 403/404, got ${status}`);
}

function assertUnauthRedirect(res) {
  assert.ok(
    [302, 303, 401].includes(res.status),
    `expected unauth redirect/401, got ${res.status}`
  );
  if (res.status === 302 || res.status === 303) {
    assert.match(String(res.headers.location || ""), /\/login/i);
  }
}

async function seedTenant(stamp, keyPrefix) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Legal RBAC",
    publicName: "RBAC Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main Campus",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedRole(ac, { firstName, lastName, roleKey }) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true, JSON.stringify(identity));
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: ac.orgId,
    healthcareOrganizationId: ac.hcoId,
    firstName: firstName || "Staff",
    lastName: lastName || "Member",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: "Staff",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: ac.facilityId,
    isPrimary: true,
  });
  const role = await assignStaffRole(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType: "facility",
    facilityId: ac.facilityId,
  });
  assert.equal(role.ok, true, JSON.stringify(role));
  return {
    identityId: identity.identity.id,
    staffId: staff.staffMember.id,
  };
}

async function seedPatient(ac, names) {
  phoneSeq += 1;
  const patientNumber = `AC-2026-${String(phoneSeq).slice(-6).padStart(6, "0")}`;
  const firstName = (names && names.firstName) || "Nova";
  const lastName = (names && names.lastName) || "Patient";
  const row = await pool.query(
    `INSERT INTO activeclinic.patients (
       organization_id, healthcare_organization_id, patient_number,
       first_name, last_name, date_of_birth, sex_at_registration
     ) VALUES ($1, $2, $3, $4, $5, '1991-03-12', 'female')
     RETURNING id, patient_number`,
    [ac.orgId, ac.hcoId, patientNumber, firstName, lastName]
  );
  return row.rows[0];
}

async function sessionCookie(identityId, orgId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
    contextJson: { selectedFacilityId: facilityId },
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic V2.03 Batch 2 RBAC / tenant / facility isolation", () => {
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
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("requires authentication for Batch 2 sensitive routes", async () => {
    requireDb();
    const routes = [
      "/app/clinical",
      "/app/pharmacy",
      "/app/pharmacy/queue",
      "/app/diagnostics",
      "/app/diagnostics/laboratory/queue",
      "/app/diagnostics/radiology/queue",
      "/app/billing",
      "/app/billing/invoices",
      "/app/cashier",
      "/app/cashier/payment",
      "/app/settings/clinic-setup/departments",
      "/app/facilities",
    ];
    for (const path of routes) {
      const res = await request(app).get(path);
      assertUnauthRedirect(res);
    }
  });

  it("enforces billing/cashier SoD on cashier collect routes (server-side)", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedTenant(stamp, "b2sod");
    const billing = await seedRole(ac, {
      firstName: "Billie",
      lastName: "Billing",
      roleKey: BILLING_OFFICER,
    });
    const cashier = await seedRole(ac, {
      firstName: "Cash",
      lastName: "Desk",
      roleKey: CASHIER,
    });

    const patient = await seedPatient(ac, { firstName: "Pay", lastName: "Patient" });
    const charge = await createPatientCharge({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      chargeType: "consultation",
      description: "SoD charge",
      unitAmountMinor: 10000,
      quantity: 1,
    });
    assert.equal(charge.result, RESULT.CREATED);
    const invoice = await createInvoice({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      chargeIds: [charge.charge.id],
    });
    assert.equal(invoice.result, RESULT.CREATED);
    const posted = await postInvoice({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffId,
      invoiceId: invoice.invoice.id,
    });
    assert.equal(posted.result, RESULT.OK);

    const billCookie = await sessionCookie(billing.identityId, ac.orgId, ac.facilityId);
    const cashCookie = await sessionCookie(cashier.identityId, ac.orgId, ac.facilityId);

    assert.equal(
      (await request(app).get("/app/cashier").set("Cookie", billCookie)).status,
      403
    );
    assert.equal(
      (
        await request(app)
          .get(`/app/cashier/payment?invoice=${invoice.invoice.id}`)
          .set("Cookie", billCookie)
      ).status,
      403
    );

    const cashPay = await request(app)
      .get(`/app/cashier/payment?invoice=${invoice.invoice.id}`)
      .set("Cookie", cashCookie);
    // Cashier may need an open session; still must not be a permission denial.
    assert.ok(
      [200, 302, 303].includes(cashPay.status),
      `cashier payment unexpected ${cashPay.status}`
    );
    assert.notEqual(cashPay.status, 403);

    const csrfBill = withCsrf(billCookie);
    const forgedCollect = await request(app)
      .post("/app/cashier/payment")
      .set("Cookie", csrfBill.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrfBill.csrf,
        invoice_id: invoice.invoice.id,
        amount: "100.00",
        payment_method: "cash",
      });
    assert.equal(forgedCollect.status, 403);
  });

  it("rejects forged org/facility identifiers and foreign facility department create", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const a = await seedTenant(stamp, "b2fa");
    const b = await seedTenant(stamp, "b2fb");
    const manager = await seedRole(a, {
      firstName: "Mgr",
      lastName: "One",
      roleKey: CLINIC_MANAGER,
    });
    const cookie = await sessionCookie(manager.identityId, a.orgId, a.facilityId);

    const forgedQuery = await request(app)
      .get(`/app/billing/invoices?organization_id=${FOREIGN_ORG}`)
      .set("Cookie", cookie);
    assert.equal(forgedQuery.status, 403);

    const forgedFacilityQuery = await request(app)
      .get(`/app/settings/clinic-setup/departments?facility_id=${b.facilityId}`)
      .set("Cookie", cookie);
    assert.equal(forgedFacilityQuery.status, 403);

    const csrf = withCsrf(cookie);
    const forgedBody = await request(app)
      .post("/app/settings/clinic-setup/departments")
      .set("Cookie", csrf.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.csrf,
        facility_id: b.facilityId,
        department_type: "pharmacy",
        display_name: "Forged Pharmacy",
      });
    assert.equal(forgedBody.status, 403);

    const csrf2 = withCsrf(cookie);
    const forgedOrgBody = await request(app)
      .post("/app/settings/clinic-setup/departments")
      .set("Cookie", csrf2.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2.csrf,
        organization_id: FOREIGN_ORG,
        facility_id: a.facilityId,
        department_type: "pharmacy",
        display_name: "Forged Org Dept",
      });
    assert.equal(forgedOrgBody.status, 403);

    const csrf3 = withCsrf(cookie);
    const unknownFacility = await request(app)
      .post("/app/settings/clinic-setup/departments")
      .set("Cookie", csrf3.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf3.csrf,
        facility_id: FOREIGN_FACILITY,
        department_type: "pharmacy",
        display_name: "Ghost Facility",
      });
    assert.equal(unknownFacility.status, 403);
  });

  it("isolates clinical/pharmacy/diagnostics/billing across tenants and restricts roles", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const a = await seedTenant(stamp, "b2xa");
    const b = await seedTenant(stamp, "b2xb");

    const clinicianA = await seedRole(a, {
      firstName: "Clin",
      lastName: "Alpha",
      roleKey: CLINICIAN,
    });
    // Encounter start also needs facility clinical manage in some catalogues; grant admin scope.
    await assignStaffRole(pool, {
      organizationId: a.orgId,
      staffMemberId: clinicianA.staffId,
      roleKey: FACILITY_ADMIN,
      scopeType: "facility",
      facilityId: a.facilityId,
    });
    const pharmA = await seedRole(a, {
      firstName: "Pharm",
      lastName: "Alpha",
      roleKey: PHARMACIST,
    });
    const labA = await seedRole(a, {
      firstName: "Lab",
      lastName: "Alpha",
      roleKey: LAB_TECHNICIAN,
    });
    const radA = await seedRole(a, {
      firstName: "Rad",
      lastName: "Alpha",
      roleKey: RADIOLOGY_STAFF,
    });
    const billingA = await seedRole(a, {
      firstName: "Bill",
      lastName: "Alpha",
      roleKey: BILLING_OFFICER,
    });
    const receptionA = await seedRole(a, {
      firstName: "Recv",
      lastName: "Alpha",
      roleKey: RECEPTIONIST,
    });
    const facilityAdminA = await seedRole(a, {
      firstName: "Fac",
      lastName: "Alpha",
      roleKey: FACILITY_ADMIN,
    });
    const clinicianB = await seedRole(b, {
      firstName: "Clin",
      lastName: "Beta",
      roleKey: CLINICIAN,
    });
    const pharmB = await seedRole(b, {
      firstName: "Pharm",
      lastName: "Beta",
      roleKey: PHARMACIST,
    });
    const billingB = await seedRole(b, {
      firstName: "Bill",
      lastName: "Beta",
      roleKey: BILLING_OFFICER,
    });

    const patient = await seedPatient(a, { firstName: "Secret", lastName: "Encounter" });

    const started = await startEncounter(pool, {
      organizationId: a.orgId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      patientId: patient.id,
      actor: {
        staffMemberId: clinicianA.staffId,
        platformIdentityId: clinicianA.identityId,
      },
      encounterType: "outpatient",
    });
    assert.equal(started.ok, true, JSON.stringify(started));

    const charge = await createPatientCharge({
      pool,
      tenantId: a.orgId,
      facilityId: a.facilityId,
      staffId: billingA.staffId,
      patientId: patient.id,
      chargeType: "consultation",
      description: "TENANT_A_SECRET_INVOICE",
      unitAmountMinor: 7500,
      quantity: 1,
    });
    const invoice = await createInvoice({
      pool,
      tenantId: a.orgId,
      facilityId: a.facilityId,
      staffId: billingA.staffId,
      patientId: patient.id,
      chargeIds: [charge.charge.id],
    });
    assert.equal(invoice.result, RESULT.CREATED);

    const cookieClinA = await sessionCookie(clinicianA.identityId, a.orgId, a.facilityId);
    const cookieClinB = await sessionCookie(clinicianB.identityId, b.orgId, b.facilityId);
    const cookiePharmA = await sessionCookie(pharmA.identityId, a.orgId, a.facilityId);
    const cookiePharmB = await sessionCookie(pharmB.identityId, b.orgId, b.facilityId);
    const cookieLabA = await sessionCookie(labA.identityId, a.orgId, a.facilityId);
    const cookieRadA = await sessionCookie(radA.identityId, a.orgId, a.facilityId);
    const cookieBillA = await sessionCookie(billingA.identityId, a.orgId, a.facilityId);
    const cookieBillB = await sessionCookie(billingB.identityId, b.orgId, b.facilityId);
    const cookieRecvA = await sessionCookie(receptionA.identityId, a.orgId, a.facilityId);
    const cookieFacA = await sessionCookie(facilityAdminA.identityId, a.orgId, a.facilityId);

    const open = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", cookieClinA);
    assert.equal(open.status, 200);

    assertDenied(
      (
        await request(app)
          .get(`/app/clinical/encounter/${started.encounter.id}`)
          .set("Cookie", cookieClinB)
      ).status
    );
    assertDenied(
      (
        await request(app)
          .get(`/app/clinical/encounter/${started.encounter.id}`)
          .set("Cookie", cookieRecvA)
      ).status
    );
    assertDenied(
      (
        await request(app)
          .get(`/app/clinical/encounter/${started.encounter.id}`)
          .set("Cookie", cookieBillA)
      ).status
    );
    assertDenied(
      (
        await request(app)
          .get(`/app/clinical/encounter/${started.encounter.id}`)
          .set("Cookie", cookiePharmA)
      ).status
    );

    assert.equal(
      (await request(app).get("/app/pharmacy").set("Cookie", cookiePharmA)).status,
      200
    );
    assert.equal(
      (await request(app).get("/app/pharmacy").set("Cookie", cookieRecvA)).status,
      403
    );
    assert.equal(
      (await request(app).get("/app/pharmacy/queue").set("Cookie", cookieBillA)).status,
      403
    );

    const pharmBQueue = await request(app)
      .get("/app/pharmacy/queue")
      .set("Cookie", cookiePharmB);
    assert.equal(pharmBQueue.status, 200);
    assert.doesNotMatch(pharmBQueue.text, /Secret Encounter|TENANT_A_SECRET/);

    assert.equal(
      (await request(app).get("/app/diagnostics/laboratory/queue").set("Cookie", cookieLabA))
        .status,
      200
    );
    assertDenied(
      (
        await request(app)
          .get("/app/diagnostics/radiology/queue")
          .set("Cookie", cookieLabA)
      ).status
    );
    assert.equal(
      (await request(app).get("/app/diagnostics/radiology/queue").set("Cookie", cookieRadA))
        .status,
      200
    );
    assertDenied(
      (
        await request(app)
          .get("/app/diagnostics/laboratory/queue")
          .set("Cookie", cookieRadA)
      ).status
    );
    assert.equal(
      (await request(app).get("/app/diagnostics").set("Cookie", cookieRecvA)).status,
      403
    );

    const invA = await request(app)
      .get(`/app/billing/invoices/${invoice.invoice.id}`)
      .set("Cookie", cookieBillA);
    assert.equal(invA.status, 200);
    assert.match(invA.text, /TENANT_A_SECRET_INVOICE/);

    const invCross = await request(app)
      .get(`/app/billing/invoices/${invoice.invoice.id}`)
      .set("Cookie", cookieBillB);
    assertDenied(invCross.status);
    assert.doesNotMatch(invCross.text, /TENANT_A_SECRET_INVOICE/);

    assert.equal(
      (
        await request(app)
          .get("/app/settings/clinic-setup/departments")
          .set("Cookie", cookieFacA)
      ).status,
      200
    );
    assert.equal(
      (
        await request(app)
          .get("/app/settings/clinic-setup/departments")
          .set("Cookie", cookieRecvA)
      ).status,
      403
    );
    assert.equal(
      (
        await request(app)
          .get("/app/settings/clinic-setup/departments")
          .set("Cookie", cookieBillA)
      ).status,
      403
    );

    const facilitiesB = await request(app)
      .get("/app/facilities")
      .set("Cookie", cookieBillB);
    if (facilitiesB.status === 200) {
      assert.doesNotMatch(facilitiesB.text, new RegExp(a.orgId, "i"));
    }
  });
});
