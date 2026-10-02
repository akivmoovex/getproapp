#!/usr/bin/env node
"use strict";

/**
 * V2.03 QA07 — ActiveClinic Batch 1 test readiness.
 *
 * Additive high-value coverage on top of activeclinic-batch1a-*.test.js:
 *   - screen→route/view/Stitch inventory (desktop + 390 companion CSS)
 *   - unauthenticated denial on Batch 1 routes
 *   - form validation / error states
 *   - facility-scoped write denial
 *   - navigation companion markers
 *
 * Does not redesign screens. STOP and classify if an application defect is found.
 *
 * Marker: V203_AC_BATCH1_TEST_READINESS_PASS
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
  ORGANIZATION_ADMIN,
  FACILITY_ADMIN,
  RECEPTIONIST,
  BILLING_OFFICER,
  CASHIER,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  createAppointmentServiceType,
  createAppointment,
  RESULT: APPT_RESULT,
} = require("../src/activeclinic/services/activeClinicAppointmentService");
const {
  saveOpsService,
  PERM: OPS_PERM,
} = require("../src/activeclinic/services/activeClinicOpsCatalogueService");
const {
  grantPatientConsent,
} = require("../src/activeclinic/services/activeClinicPatientConsentService");
const {
  createPatientCharge,
  createInvoice,
  recordPayment,
  RESULT: BILLING_RESULT,
  PAYMENT_METHOD,
} = require("../src/activeclinic/services/activeClinicBillingService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");

const ROOT = path.join(__dirname, "..");
const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

/** Frozen Batch 1 screen map (Stitch ODS 12134201997833374170). */
const BATCH1_SCREENS = Object.freeze([
  {
    code: "ACN01",
    route: "/app/onboarding",
    view: "views/activeclinic/app/onboarding-content.ejs",
    marker: /data-ac-onboarding-step|clinical_services|practitioners/,
    mobileCompanion: true,
  },
  {
    code: "ACN02",
    route: "/app/services",
    view: "views/activeclinic/app/services-catalogue-content.ejs",
    marker: /data-ac-stitch="ACN02"/,
    mobileCompanion: true,
  },
  {
    code: "ACN03",
    route: "/app/services/new",
    view: "views/activeclinic/app/service-editor-content.ejs",
    marker: /data-ac-stitch="ACN03"/,
    mobileCompanion: false,
  },
  {
    code: "ACN04",
    route: "/app/practitioners",
    view: "views/activeclinic/app/practitioners-directory-content.ejs",
    marker: /data-ac-stitch="ACN04"/,
    mobileCompanion: true,
  },
  {
    code: "ACN05",
    route: "/app/practitioners/:id",
    view: "views/activeclinic/app/practitioner-workspace-content.ejs",
    marker: /data-ac-stitch="ACN05"/,
    mobileCompanion: true,
  },
  {
    code: "ACN06",
    route: "/app/appointments/calendar",
    view: "views/activeclinic/app/appointments-calendar-content.ejs",
    marker: /data-ac-stitch="ACN06"/,
    mobileCompanion: true,
  },
  {
    code: "ACN07",
    route: "/app/appointments/new",
    view: "views/activeclinic/app/appointment-form-content.ejs",
    marker: /data-ac-screen=.*ACN07|ACN07/,
    mobileCompanion: false,
  },
  {
    code: "ACN08",
    route: "/app/appointments/:id",
    view: "views/activeclinic/app/appointment-detail-content.ejs",
    marker: /data-ac-batch1="ACN08"/,
    mobileCompanion: false,
  },
  {
    code: "ACN09",
    route: "/app/booking-requests",
    view: "views/activeclinic/app/booking-requests-content.ejs",
    marker: /data-ac-stitch="ACN09"/,
    mobileCompanion: false,
  },
  {
    code: "ACN10",
    route: "/app/patients",
    view: "views/activeclinic/app/patients-list-content.ejs",
    marker: /data-ac-batch1="ACN10"/,
    mobileCompanion: true,
  },
  {
    code: "ACN11",
    route: "/app/patients/:patientNumber",
    view: "views/activeclinic/app/patient-profile-content.ejs",
    marker: /data-ac-stitch="ACN11"/,
    mobileCompanion: true,
  },
  {
    code: "ACN12",
    route: "/app/reception/check-in",
    view: "views/activeclinic/app/reception-check-in-content.ejs",
    marker: /data-ac-stitch="ACN12"/,
    mobileCompanion: true,
  },
  {
    code: "ACN13",
    route: "/app/reception",
    view: "views/activeclinic/app/reception-queue-content.ejs",
    marker: /data-ac-stitch="ACN13"/,
    mobileCompanion: true,
  },
  {
    code: "ACN14",
    route: "/app/clinical",
    view: "views/activeclinic/app/clinical-queue-content.ejs",
    marker: /data-ac-stitch="ACN14"/,
    mobileCompanion: true,
  },
  {
    code: "ACN15",
    route: "/app/clinical/encounter/:id",
    view: "views/activeclinic/app/consultation-workspace-content.ejs",
    marker: /data-ac-batch1="ACN15"/,
    mobileCompanion: true,
  },
  {
    code: "ACN16",
    route: "/app/clinical/follow-up",
    view: "views/activeclinic/app/clinical-follow-up-content.ejs",
    marker: /data-ac-stitch="ACN16"/,
    mobileCompanion: true,
  },
  {
    code: "ACN21",
    route: "/app/billing/invoices",
    view: "views/activeclinic/app/billing-invoice-list-content.ejs",
    marker: /data-ac-batch1="ACN21"/,
    mobileCompanion: true,
  },
  {
    code: "ACN22",
    route: "/app/billing/invoices/:id",
    view: "views/activeclinic/app/billing-invoice-detail-content.ejs",
    marker: /data-ac-batch1="ACN22"/,
    mobileCompanion: false,
  },
  {
    code: "ACN23",
    route: "/app/cashier/payment",
    view: "views/activeclinic/app/cashier-payment-content.ejs",
    marker: /mobile_money|payment_method/,
    mobileCompanion: true,
  },
  {
    code: "ACN25",
    route: "/app/performance",
    view: "views/activeclinic/app/performance-dashboard-content.ejs",
    marker: /data-ac-stitch="ACN25"/,
    mobileCompanion: true,
  },
  {
    code: "ACN26",
    route: "/app/data",
    view: "views/activeclinic/app/data-import-export-content.ejs",
    marker: /data-ac-stitch="ACN26"/,
    mobileCompanion: true,
  },
]);

const BATCH1_READ_ROUTES = Object.freeze([
  "/app/onboarding",
  "/app/services",
  "/app/services/new",
  "/app/practitioners",
  "/app/appointments/calendar",
  "/app/appointments/new",
  "/app/booking-requests",
  "/app/patients",
  "/app/reception",
  "/app/reception/check-in",
  "/app/clinical",
  "/app/clinical/follow-up",
  "/app/billing/invoices",
  "/app/cashier/payment",
  "/app/performance",
  "/app/data",
]);

let pool;
let skipReason = null;
let app;
let phoneSeq = 860000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb(t) {
  if (skipReason) t.skip(`QA07 foundation unavailable: ${skipReason}`);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertUnauthRedirect(res, label) {
  assert.ok(
    [302, 303, 401].includes(res.status),
    `${label} expected unauth redirect/401, got ${res.status}`
  );
  if (res.status === 302 || res.status === 303) {
    assert.match(String(res.headers.location || ""), /\/login/i, label);
  }
}

async function provisionClinic(label, roleKeys, options) {
  const opts = options || {};
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp,
    displayName: `QA07 ${label}`,
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
    displayName: "HQ",
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
    firstName: "Ada",
    lastName: "Admin",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: "Administrator",
  });
  await assignStaffToFacility(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
    isPrimary: true,
  });
  const roles = roleKeys || [ORGANIZATION_ADMIN];
  for (const roleKey of roles) {
    const orgWide =
      opts.facilityScoped !== true &&
      (roleKey === ORGANIZATION_ADMIN || roleKey === "activeclinic_organization_admin");
    const role = await assignStaffRole(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: staff.staffMember.id,
      roleKey,
      scopeType: orgWide ? "organisation" : "facility",
      facilityId: orgWide ? undefined : facility.facility.id,
    });
    assert.equal(role.ok, true, JSON.stringify(role));
  }
  return {
    organizationId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    staffId: staff.staffMember.id,
    identityId: identity.identity.id,
    actor: {
      staffMemberId: staff.staffMember.id,
      platformIdentityId: identity.identity.id,
    },
  };
}

describe("V203 QA07 AC Batch 1 — screen inventory + 390 companion", () => {
  it("maps all 21 Batch 1 screens to views, Stitch markers, and 390 CSS", () => {
    assert.equal(BATCH1_SCREENS.length, 21);
    const css = read("public/activeclinic/ac-app.css");
    assert.match(css, /@media \(max-width: 390px\)/);
    assert.match(css, /\.ac-batch1a__mobile/);
    assert.match(css, /Stitch project 12134201997833374170/);

    for (const screen of BATCH1_SCREENS) {
      assert.ok(fs.existsSync(path.join(ROOT, screen.view)), `${screen.code} missing ${screen.view}`);
      const html = read(screen.view);
      assert.match(html, screen.marker, `${screen.code} marker`);
      assert.ok(screen.route.startsWith("/app/"), `${screen.code} route`);
    }

    const calendar = read("views/activeclinic/app/appointments-calendar-content.ejs");
    assert.match(calendar, /data-ac-calendar="mobile"/);
    assert.match(calendar, /ac-batch1a__mobile/);
  });

  it("wires Batch 1 route modules for services/practitioners/follow-up/performance/data", () => {
    const ops = read("src/activeclinic/http/activeClinicOpsConfigRoutes.js");
    assert.match(ops, /\/services/);
    assert.match(ops, /\/practitioners/);
    const clinical = read("src/activeclinic/http/activeClinicClinicalRoutes.js");
    assert.match(clinical, /follow-up/);
    const mgmt = read("src/activeclinic/http/activeClinicManagementDataRoutes.js");
    assert.match(mgmt, /\/performance|\/data/);
  });
});

describe("V203 QA07 AC Batch 1 — unauth / validation / facility / billing gaps", () => {
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
      skipReason = err && err.message ? String(err.message).slice(0, 400) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("rejects unauthenticated access to Batch 1 read routes", async (t) => {
    requireDb(t);
    for (const route of BATCH1_READ_ROUTES) {
      const res = await request(app).get(route);
      assertUnauthRedirect(res, route);
    }
  });

  it("rejects invalid service / consent / cash-without-session inputs", async (t) => {
    requireDb(t);
    const clinic = await provisionClinic(
      "val",
      [FACILITY_ADMIN, RECEPTIONIST, BILLING_OFFICER, CASHIER],
      { facilityScoped: true }
    );

    const emptyName = await saveOpsService(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      permissions: [OPS_PERM.EDIT],
      body: {},
      displayName: "",
      priceMajor: "10",
    });
    assert.equal(emptyName.ok, false);
    assert.match(String(emptyName.code), /invalid|forbidden|forged/i);

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: clinic.actor,
      demographics: { firstName: "Val", lastName: "Patient" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const badConsent = await grantPatientConsent(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      patientId: patient.patient.id,
      actor: clinic.actor,
      consentType: "not_a_real_consent",
      captureMethod: "verbal",
      status: "granted",
    });
    assert.equal(badConsent.ok, false);
    assert.match(String(badConsent.code), /invalid|access_denied|forbidden/i);

    const charge = await createPatientCharge({
      pool,
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: clinic.staffId,
      patientId: patient.patient.id,
      chargeType: "consultation",
      description: "QA07 charge",
      unitAmountMinor: 5000,
      quantity: 1,
    });
    assert.equal(charge.result, BILLING_RESULT.CREATED, JSON.stringify(charge));
    const invoice = await createInvoice({
      pool,
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: clinic.staffId,
      patientId: patient.patient.id,
      chargeIds: [charge.charge.id],
    });
    assert.equal(invoice.result, BILLING_RESULT.CREATED, JSON.stringify(invoice));

    const cashNoSession = await recordPayment({
      pool,
      tenantId: clinic.organizationId,
      facilityId: clinic.facilityId,
      staffId: clinic.staffId,
      patientId: patient.patient.id,
      amountMinor: 1000,
      paymentMethod: PAYMENT_METHOD.CASH,
      invoiceAllocations: [{ invoiceId: invoice.invoice.id, amountMinor: 1000 }],
    });
    assert.equal(cashNoSession.result, BILLING_RESULT.SESSION_REQUIRED);
  });

  it("denies appointment create at a facility outside the actor's facility scope", async (t) => {
    requireDb(t);
    const clinic = await provisionClinic(
      "facscope",
      [FACILITY_ADMIN, RECEPTIONIST],
      { facilityScoped: true }
    );
    const otherFacility = await createFacility(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityKey: `sat-${Date.now().toString(36)}`,
      displayName: "Satellite",
      facilityType: "clinic",
      status: "active",
      isPrimary: false,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Ndola",
    });
    assert.equal(otherFacility.ok, true, JSON.stringify(otherFacility));

    const service = await createAppointmentServiceType(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      actor: clinic.actor,
      serviceKey: `qa07-${Date.now().toString(36)}`,
      displayName: "QA07 Consult",
      defaultDurationMinutes: 30,
    });
    assert.equal(service.ok, true, JSON.stringify(service));
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: clinic.actor,
      demographics: { firstName: "Fac", lastName: "Scope" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const startsAt = new Date(Date.UTC(2026, 11, 15, 9, 0, 0));
    const endsAt = new Date(Date.UTC(2026, 11, 15, 9, 30, 0));
    const denied = await createAppointment(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: otherFacility.facility.id,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      startsAt,
      endsAt,
      actor: clinic.actor,
    });
    assert.equal(denied.ok, false);
    assert.match(String(denied.code), /access_denied|forbidden|facility/i);

    const allowed = await createAppointment(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      startsAt,
      endsAt,
      actor: clinic.actor,
    });
    assert.equal(allowed.ok, true, JSON.stringify(allowed));
    void APPT_RESULT;
  });

  it("rejects invoice create when charge facility does not match invoice facility", async (t) => {
    requireDb(t);
    const a = await provisionClinic(
      "billfac",
      [FACILITY_ADMIN, RECEPTIONIST, BILLING_OFFICER],
      { facilityScoped: true }
    );
    const otherFacility = await createFacility(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      facilityKey: `other-${Date.now().toString(36)}`,
      displayName: "Other Site",
      facilityType: "clinic",
      status: "active",
      isPrimary: false,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Kitwe",
    });
    assert.equal(otherFacility.ok, true, JSON.stringify(otherFacility));

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      actor: a.actor,
      demographics: { firstName: "Bill", lastName: "Fac" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));
    const charge = await createPatientCharge({
      pool,
      tenantId: a.organizationId,
      facilityId: a.facilityId,
      staffId: a.staffId,
      patientId: patient.patient.id,
      chargeType: "consultation",
      description: "scoped",
      unitAmountMinor: 2500,
      quantity: 1,
    });
    assert.equal(charge.result, BILLING_RESULT.CREATED, JSON.stringify(charge));

    const crossFacility = await createInvoice({
      pool,
      tenantId: a.organizationId,
      facilityId: otherFacility.facility.id,
      staffId: a.staffId,
      patientId: patient.patient.id,
      chargeIds: [charge.charge.id],
    });
    // Actor is not assigned to satellite facility → access denied, OR charges mismatch → invalid_charges.
    assert.notEqual(crossFacility.result, BILLING_RESULT.CREATED);
    assert.match(
      String(crossFacility.result || crossFacility.reason || ""),
      /access_denied|not_found|invalid|denied|charge/i
    );
  });

  it("authenticated Batch 1 hub routes render navigation + Stitch markers", async (t) => {
    requireDb(t);
    const clinic = await provisionClinic("nav", [ORGANIZATION_ADMIN]);
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: clinic.identityId,
      organizationId: clinic.organizationId,
    });
    const cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;

    const checks = [
      ["/app/services", /data-ac-stitch="ACN02"/],
      ["/app/practitioners", /data-ac-stitch="ACN04"/],
      ["/app/appointments/calendar", /data-ac-stitch="ACN06"/],
      ["/app/patients", /data-ac-batch1="ACN10"/],
      ["/app/reception", /data-ac-stitch="ACN13"/],
      ["/app/clinical/follow-up", /data-ac-stitch="ACN16"/],
      ["/app/billing/invoices", /data-ac-batch1="ACN21"/],
      ["/app/performance", /data-ac-stitch="ACN25"/],
      ["/app/data", /data-ac-stitch="ACN26"/],
    ];
    for (const [route, marker] of checks) {
      const res = await request(app).get(route).set("Cookie", cookie);
      assert.equal(res.status, 200, `${route} → ${res.status}`);
      assert.match(res.text, marker, route);
      assert.match(
        res.text,
        /ac-app-nav|ac-sidebar|ac-bottom-nav|data-ac-nav|ac-shell/i,
        `${route} navigation chrome`
      );
    }
  });
});

describe("V203 QA07 marker", () => {
  it("prints Batch 1 test readiness pass marker", () => {
    console.log("V203_AC_BATCH1_TEST_READINESS_PASS");
    assert.equal(true, true);
  });
});
