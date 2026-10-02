"use strict";

/**
 * ActiveClinic V2.03 Batch 2 — AC-B2-09 Billing & Invoices workspace.
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
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
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
let phoneSeq = 890000000;

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
    legalName: "Legal Billing",
    publicName: "Billing Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main Facility",
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
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedRole(ac, opts) {
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
    firstName: opts.firstName || "Bill",
    lastName: opts.lastName || "Staff",
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
  await assignStaffRole(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey,
    scopeType: "facility",
    facilityId: ac.facilityId,
  });
  return { identityId: identity.identity.id, staffId: staff.staffMember.id };
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

async function seedPatient(ac) {
  phoneSeq += 1;
  const patientNumber = `AC-2026-${String(phoneSeq).slice(-6).padStart(6, "0")}`;
  const row = await pool.query(
    `INSERT INTO activeclinic.patients (
       organization_id, healthcare_organization_id, patient_number,
       first_name, last_name, date_of_birth, sex_at_registration
     ) VALUES ($1, $2, $3, 'Nova', 'Invoice', '1991-03-12', 'female')
     RETURNING id, patient_number`,
    [ac.orgId, ac.hcoId, patientNumber]
  );
  return row.rows[0];
}

describe("ActiveClinic V2.03 Batch 2 billing (AC-B2-09)", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("ships B2 stitch markers, gp-ops chrome, and 390px invoice cards", () => {
    const routes = read("src/activeclinic/http/activeClinicBillingRoutes.js");
    assert.match(routes, /29257b0d01c64fa4896a369efd3f6417/);
    assert.match(routes, /24632347e4ab4c89937b611457d94730/);
    assert.match(routes, /0886c0c2471d4744aa0101aed17abd22/);
    assert.match(routes, /PAYMENT_COLLECT/);
    assert.match(routes, /canCollectPayment/);

    const list = read("views/activeclinic/app/billing-invoice-list-content.ejs");
    assert.match(list, /data-ac-stitch="AC-B2-09"/);
    assert.match(list, /gp-ops-filter-bar|gp-ops-status-tabs/);
    assert.match(list, /ac-billing-invoice-cards|ac-ops-queue__mobile/);
    assert.match(list, /Collect payment/);
    assert.match(list, /caps\.canCollectPayment/);
    assert.doesNotMatch(list, /Insurance Claims|CMS-1500|Batch Payment Entry/);

    const dash = read("views/activeclinic/app/billing-dashboard-content.ejs");
    assert.match(dash, /data-ac-stitch="AC-B2-09"/);
    assert.match(dash, /data-ac-billing-metrics/);
    assert.match(dash, /caps\.canOpenCashier/);

    const detail = read("views/activeclinic/app/billing-invoice-detail-content.ejs");
    assert.match(detail, /data-ac-stitch="AC-B2-09"/);
    assert.match(detail, /gp-ops-status-badge/);
    assert.match(detail, /caps\.canCollectPayment/);

    const css = read("public/activeclinic/ac-app.css");
    assert.match(css, /AC-B2-09 Billing/);
    assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.ac-billing-workspace--b2/);
  });

  it("billing role sees workspace without collect actions; cashier may collect", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedTenant(stamp, "b209");
    const billing = await seedRole(ac, {
      firstName: "Billie",
      lastName: "Officer",
      roleKey: BILLING_OFFICER,
    });
    const cashier = await seedRole(ac, {
      firstName: "Cash",
      lastName: "Desk",
      roleKey: CASHIER,
    });
    const denied = await seedRole(ac, {
      firstName: "Front",
      lastName: "Desk",
      roleKey: RECEPTIONIST,
    });

    const patient = await seedPatient(ac);
    const charge = await createPatientCharge({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      chargeType: "consultation",
      description: "B2 consult",
      unitAmountMinor: 15000,
      quantity: 1,
    });
    assert.equal(charge.result, RESULT.CREATED, JSON.stringify(charge));
    const invoice = await createInvoice({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffId,
      patientId: patient.id,
      chargeIds: [charge.charge.id],
    });
    assert.equal(invoice.result, RESULT.CREATED, JSON.stringify(invoice));
    const posted = await postInvoice({
      pool,
      tenantId: ac.orgId,
      facilityId: ac.facilityId,
      staffId: billing.staffId,
      invoiceId: invoice.invoice.id,
    });
    assert.equal(posted.result, RESULT.OK, JSON.stringify(posted));

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const billCookie = await sessionCookie(billing.identityId, ac.orgId, ac.facilityId);
    const cashCookie = await sessionCookie(cashier.identityId, ac.orgId, ac.facilityId);
    const deniedCookie = await sessionCookie(denied.identityId, ac.orgId, ac.facilityId);

    const dash = await request(app).get("/app/billing").set("Cookie", billCookie);
    assert.equal(dash.status, 200);
    assert.match(dash.text, /data-ac-stitch="AC-B2-09"/);
    assert.match(dash.text, /29257b0d01c64fa4896a369efd3f6417/);
    assert.match(dash.text, /data-ac-billing-metrics/);
    assert.match(dash.text, /Create invoice|New invoice/);
    assert.doesNotMatch(dash.text, /href="\/app\/cashier"/);

    const listBill = await request(app)
      .get("/app/billing/invoices")
      .set("Cookie", billCookie);
    assert.equal(listBill.status, 200);
    assert.match(listBill.text, /data-ac-stitch="AC-B2-09"/);
    assert.match(listBill.text, /gp-ops-status-tabs|data-gp-ops="status-tabs"/);
    assert.match(listBill.text, /gp-ops-filter-bar|data-gp-ops="filter-bar"/);
    assert.match(listBill.text, /ac-billing-invoice-cards|ac-ops-queue__mobile/);
    assert.match(listBill.text, /Unpaid|Partially paid|Settled/);
    assert.match(listBill.text, /B2 consult|Nova Invoice/);
    assert.doesNotMatch(listBill.text, /Collect payment/);

    const unpaid = await request(app)
      .get("/app/billing/invoices?status=unpaid")
      .set("Cookie", billCookie);
    assert.equal(unpaid.status, 200);
    assert.match(unpaid.text, /data-payment-status="unpaid"|Unpaid/);

    const detailBill = await request(app)
      .get(`/app/billing/invoices/${invoice.invoice.id}`)
      .set("Cookie", billCookie);
    assert.equal(detailBill.status, 200);
    assert.match(detailBill.text, /data-ac-stitch="AC-B2-09"/);
    assert.match(detailBill.text, /Paid|Balance/);
    assert.doesNotMatch(detailBill.text, /Collect payment/);

    const listCash = await request(app)
      .get("/app/billing/invoices")
      .set("Cookie", cashCookie);
    assert.equal(listCash.status, 200);
    assert.match(listCash.text, /Collect payment/);
    assert.doesNotMatch(listCash.text, /Create invoice/);

    const detailCash = await request(app)
      .get(`/app/billing/invoices/${invoice.invoice.id}`)
      .set("Cookie", cashCookie);
    assert.equal(detailCash.status, 200);
    assert.match(detailCash.text, /Collect payment/);
    assert.match(detailCash.text, /\/app\/cashier\/payment\?invoice=/);

    assert.equal(
      (await request(app).get("/app/billing").set("Cookie", deniedCookie)).status,
      403
    );
    assert.equal(
      (await request(app).get("/app/billing/invoices").set("Cookie", deniedCookie))
        .status,
      403
    );
  });
});
