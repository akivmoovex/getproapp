"use strict";

/**
 * V2.03 Batch 3 — AC-P06 patient invoices/receipts portal projection.
 * Does not reuse staff billing EJS; no payment mutation.
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
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const { createFacility } = require("../src/activeclinic/services/facilityService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  linkIdentityToProductProfile,
} = require("../src/platform/services/identityProductProfileService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  RECEPTIONIST,
  BILLING_OFFICER,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createPatientCharge,
  createInvoice,
  postInvoice,
  RESULT,
} = require("../src/activeclinic/services/activeClinicBillingService");

const ROOT = path.join(__dirname, "..");
const PATIENT_PASSWORD = "PortalPass1!";
const STAFF_PASSWORD = "DemoStaff-ActiveClinic-2026A";

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 984100000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function extractCookie(res, name) {
  const cookies = [].concat(res.headers["set-cookie"] || []);
  const raw = cookies.find((c) => String(c).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

async function seedPublishedClinic(stamp) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `ac_b3i_${stamp}`,
    displayName: "B3 Invoice Clinic",
    productKey: "activeclinic",
    productTenantKey: `ac-b3i-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true);
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "B3 Invoice Legal",
    publicName: "B3 Invoice Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  await pool.query(
    `UPDATE activeclinic.healthcare_organizations
     SET website_published = true, public_booking_enabled = true
     WHERE id = $1`,
    [hco.healthcareOrganization.id]
  );
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true);
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
  return {
    clinicKey: `ac_b3i_${stamp}`,
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedStaff(clinic, roleKey, label) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `${label}.${phone.slice(-8)}@example.test`,
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true);
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: STAFF_PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: clinic.orgId,
    healthcareOrganizationId: clinic.hcoId,
    firstName: label,
    lastName: "Staff",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: label,
  });
  assert.equal(staff.ok, true);
  await assignStaffToFacility(pool, {
    organizationId: clinic.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: clinic.facilityId,
    isPrimary: true,
  });
  await assignStaffRole(pool, {
    organizationId: clinic.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType: "facility",
    facilityId: clinic.facilityId,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  return {
    identityId: identity.identity.id,
    staffMemberId: staff.staffMember.id,
  };
}

function appWithEnv() {
  return createActiveClinicFoundationApp({
    env: {
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: "a".repeat(40),
    },
    getPool: () => pool,
    isProduction: false,
  });
}

describe("V2.03 Batch 3 AC-P06 portal invoices leaf", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("portal invoices view is AC-P06 leaf and never mounts staff billing chrome", () => {
    const html = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/patient/invoices.ejs"),
      "utf8"
    );
    assert.match(html, /data-ac-batch3="AC-P06"/);
    assert.match(html, /a493b33db83c4873ab2964391ee088b9/);
    assert.match(html, /5b381b193b6643d09cbc317b55fd5f32/);
    assert.match(html, /data-ac-invoices-desktop/);
    assert.match(html, /data-ac-invoices-mobile/);
    assert.doesNotMatch(html, /data-ac-stitch="AC-B2-09"|Collect payment|Open cashier/i);
    assert.match(html, /does not collect money/);
    assert.match(html, /online payment CTA/);

    const staffBilling = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/billing-invoice-list-content.ejs"),
      "utf8"
    );
    assert.match(staffBilling, /data-ac-stitch="AC-B2-09"/);
    assert.doesNotMatch(staffBilling, /data-ac-batch3="AC-P06"/);

    const nav = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/partials/patient-nav.ejs"),
      "utf8"
    );
    assert.match(nav, /\/patient\/invoices/);

    const css = fs.readFileSync(path.join(ROOT, "public/activeclinic/ac-patient.css"), "utf8");
    assert.match(css, /\.acp-portal-leaf--billing/);
  });

  it("renders owned invoices only; staff billing chrome stays separate", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const stamp = `${Date.now().toString(36)}i`;
    const clinic = await seedPublishedClinic(stamp);
    const other = await seedPublishedClinic(`${stamp}x`);
    const receptionist = await seedStaff(clinic, RECEPTIONIST, "Recv");
    const billing = await seedStaff(clinic, BILLING_OFFICER, "Bill");
    const otherBilling = await seedStaff(other, BILLING_OFFICER, "OtherBill");
    const phone = nextPhone();

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: {
        staffMemberId: receptionist.staffMemberId,
        platformIdentityId: receptionist.identityId,
        organizationId: clinic.orgId,
      },
      demographics: { firstName: "Bill", lastName: "Owner" },
      contacts: { phone },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const identity = await createPlatformIdentity(pool, {
      status: "active",
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
      requireContact: true,
    });
    assert.equal(identity.ok, true, JSON.stringify(identity));
    await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: PATIENT_PASSWORD,
    });
    await linkIdentityToProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "activeclinic",
      profileType: "activeclinic_patient",
      productProfileId: patient.patient.id,
    });
    await pool.query(
      `UPDATE activeclinic.patients SET platform_identity_id = $1 WHERE id = $2`,
      [identity.identity.id, patient.patient.id]
    );

    const charge = await createPatientCharge({
      pool,
      tenantId: clinic.orgId,
      facilityId: clinic.facilityId,
      staffId: billing.staffMemberId,
      patientId: patient.patient.id,
      chargeType: "consultation",
      description: "Portal visible consult",
      unitAmountMinor: 25000,
      quantity: 1,
    });
    assert.equal(charge.result, RESULT.CREATED, JSON.stringify(charge));
    const invoice = await createInvoice({
      pool,
      tenantId: clinic.orgId,
      facilityId: clinic.facilityId,
      staffId: billing.staffMemberId,
      patientId: patient.patient.id,
      chargeIds: [charge.charge.id],
    });
    assert.equal(invoice.result, RESULT.CREATED, JSON.stringify(invoice));
    const posted = await postInvoice({
      pool,
      tenantId: clinic.orgId,
      facilityId: clinic.facilityId,
      staffId: billing.staffMemberId,
      invoiceId: invoice.invoice.id,
    });
    assert.equal(posted.result, RESULT.OK, JSON.stringify(posted));

    const foreignPhone = nextPhone();
    const foreignRecv = await seedStaff(other, RECEPTIONIST, "FRecv");
    const foreignPatient = await registerActiveClinicPatient(pool, {
      organizationId: other.orgId,
      healthcareOrganizationId: other.hcoId,
      facilityId: other.facilityId,
      actor: {
        staffMemberId: foreignRecv.staffMemberId,
        platformIdentityId: foreignRecv.identityId,
        organizationId: other.orgId,
      },
      demographics: { firstName: "Foreign", lastName: "Patient" },
      contacts: { phone: foreignPhone },
      registrationMethod: "walk_in",
    });
    assert.equal(foreignPatient.ok, true, JSON.stringify(foreignPatient));
    const foreignCharge = await createPatientCharge({
      pool,
      tenantId: other.orgId,
      facilityId: other.facilityId,
      staffId: otherBilling.staffMemberId,
      patientId: foreignPatient.patient.id,
      chargeType: "consultation",
      description: "Foreign secret invoice",
      unitAmountMinor: 99000,
      quantity: 1,
    });
    assert.equal(foreignCharge.result, RESULT.CREATED, JSON.stringify(foreignCharge));
    const foreignInvoice = await createInvoice({
      pool,
      tenantId: other.orgId,
      facilityId: other.facilityId,
      staffId: otherBilling.staffMemberId,
      patientId: foreignPatient.patient.id,
      chargeIds: [foreignCharge.charge.id],
    });
    assert.equal(foreignInvoice.result, RESULT.CREATED, JSON.stringify(foreignInvoice));
    await postInvoice({
      pool,
      tenantId: other.orgId,
      facilityId: other.facilityId,
      staffId: otherBilling.staffMemberId,
      invoiceId: foreignInvoice.invoice.id,
    });

    const app = appWithEnv();
    const loginPage = await request(app).get(`/clinics/${clinic.clinicKey}/patient/login`);
    const csrf = extractCookie(loginPage, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const login = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/login`)
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        identifier: phone,
        password: PATIENT_PASSWORD,
      });
    const sid = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid);

    const invoicesRes = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/invoices`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(invoicesRes.status, 200);
    assert.match(invoicesRes.text, /data-ac-batch3="AC-P06"/);
    assert.match(invoicesRes.text, /Invoices &amp; Receipts|Invoices & Receipts/);
    assert.match(invoicesRes.text, new RegExp(invoice.invoice.invoiceNumber));
    assert.match(invoicesRes.text, /Portal visible consult|ZMW 250/);
    assert.match(invoicesRes.text, /ac-patient\.css\?v=v2-03-b3-acp06-01/);
    assert.doesNotMatch(invoicesRes.text, /Foreign secret invoice|Collect payment|data-ac-stitch="AC-B2-09"/);
    assert.doesNotMatch(invoicesRes.text, new RegExp(String(foreignInvoice.invoice.id)));

    const staffBilling = await request(app)
      .get("/app/billing/invoices")
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.ok([302, 303, 401, 403].includes(staffBilling.status));
  });
});
