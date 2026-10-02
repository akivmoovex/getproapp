"use strict";

/**
 * ActiveClinic V7 Phase 12 — empty / loading / error / success / permission states.
 * Does not invent fake production API failures.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
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
  ORGANIZATION_ADMIN,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  STATE,
  buildFullPageState,
} = require("../src/activeclinic/services/activeClinicStateTaxonomy");
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

const ROOT = path.join(__dirname, "..");
const PASSWORD = "activeclinic-phase12-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

const EMPTY_MARKERS = [
  ["views/activeclinic/app/clinical-queue-content.ejs", "clinical-queue-empty"],
  ["views/activeclinic/app/clinical-escalation-alert-content.ejs", "clinical-alerts-empty"],
  ["views/activeclinic/app/diagnostics-laboratory-queue-content.ejs", "lab-queue-empty"],
  ["views/activeclinic/app/diagnostics-laboratory-worklist-content.ejs", "lab-worklist-empty"],
  ["views/activeclinic/app/diagnostics-radiology-queue-content.ejs", "radiology-queue-empty"],
  ["views/activeclinic/app/pharmacy-purchase-orders-content.ejs", "pharmacy-po-empty"],
  ["views/activeclinic/app/billing-payment-history-content.ejs", "payment-history-empty"],
  ["views/activeclinic/app/booking-requests-content.ejs", "booking-requests"],
  ["views/activeclinic/app/patients-list-content.ejs", "patients-none"],
  ["views/activeclinic/app/reception-queue-content.ejs", "reception-queue-empty"],
  ["views/activeclinic/app/select-facility-content.ejs", "facility_unavailable"],
];

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 912000000;
let app;
let tenant;
let admin;
let reception;
let unassigned;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

async function seedStaff(opts) {
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
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    firstName: opts.firstName,
    lastName: opts.lastName,
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  if (opts.assignFacility !== false) {
    await assignStaffToFacility(pool, {
      organizationId: tenant.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: tenant.facilityId,
      isPrimary: true,
    });
  }
  await assignStaffRole(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey,
    scopeType: opts.scopeType || "organisation",
    facilityId: opts.scopeType === "facility" ? tenant.facilityId : null,
  });
  return { identity: identity.identity, staff: staff.staffMember };
}

async function sessionCookie(identityId, organizationId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId,
    contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic V7 Phase 12 state completeness", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
      return;
    }

    const stamp = Date.now().toString(36);
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `ac_p12_${stamp}`,
      displayName: "Phase 12 Clinic",
      productKey: "activeclinic",
      productTenantKey: `ac-p12-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(org.ok, true);
    const hco = await createHealthcareOrganization(pool, {
      organizationId: org.records.organization.id,
      legalName: "Phase 12 Legal",
      publicName: "Phase 12 Public",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(hco.ok, true);
    const facility = await createFacility(pool, {
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: `p12-${stamp}`.slice(0, 64),
      displayName: "Main",
      facilityType: "hospital",
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
    tenant = {
      orgId: org.records.organization.id,
      hcoId: hco.healthcareOrganization.id,
      facilityId: facility.facility.id,
    };
    admin = await seedStaff({
      firstName: "Org",
      lastName: "Admin",
      roleKey: ORGANIZATION_ADMIN,
    });
    reception = await seedStaff({
      firstName: "Rina",
      lastName: "Desk",
      roleKey: RECEPTIONIST,
      scopeType: "facility",
    });
    const emptyOrg = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `ac_p12e_${stamp}`,
      displayName: "Phase 12 Empty Facilities",
      productKey: "activeclinic",
      productTenantKey: `ac-p12e-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(emptyOrg.ok, true);
    const emptyHco = await createHealthcareOrganization(pool, {
      organizationId: emptyOrg.records.organization.id,
      legalName: "Empty Facilities Legal",
      publicName: "Empty Facilities Public",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(emptyHco.ok, true);
    const emptyPhone = nextPhone();
    const emptyIdentity = await createPlatformIdentity(pool, {
      primaryPhone: emptyPhone,
      phoneNormalized: emptyPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: emptyIdentity.identity.id,
      password: PASSWORD,
    });
    const emptyStaff = await createStaffMember(pool, {
      organizationId: emptyOrg.records.organization.id,
      healthcareOrganizationId: emptyHco.healthcareOrganization.id,
      firstName: "No",
      lastName: "Facility",
      employmentType: "permanent",
      status: "active",
      phone: emptyPhone,
      platformIdentityId: emptyIdentity.identity.id,
    });
    assert.equal(emptyStaff.ok, true, JSON.stringify(emptyStaff));
    await assignStaffRole(pool, {
      organizationId: emptyOrg.records.organization.id,
      staffMemberId: emptyStaff.staffMember.id,
      roleKey: ORGANIZATION_ADMIN,
      scopeType: "organisation",
    });
    unassigned = {
      identity: emptyIdentity.identity,
      orgId: emptyOrg.records.organization.id,
    };
    app = createActiveClinicFoundationApp({
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      getPool: () => pool,
      isProduction: false,
    });
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("taxonomy includes facility_unavailable and offline presets", () => {
    const facility = buildFullPageState(STATE.FACILITY_UNAVAILABLE);
    assert.equal(facility.pageId, "facility-unavailable");
    assert.equal(facility.httpStatus, 403);
    const offline = buildFullPageState(STATE.OFFLINE);
    assert.equal(offline.pageId, "offline");
  });

  it("major list views use canonical empty markers", () => {
    for (const [rel, marker] of EMPTY_MARKERS) {
      const body = fs.readFileSync(path.join(ROOT, rel), "utf8");
      assert.match(body, new RegExp(marker), `${rel} missing ${marker}`);
      assert.match(body, /ac-inline-state|stateKey/, `${rel} should use canonical state`);
    }
  });

  it("GET /app/offline is the supported offline presentation", async () => {
    const res = await request(app).get("/app/offline").set("Host", "activeclinic.org");
    assert.equal(res.status, 503);
    assert.match(res.text, /data-ac-state-key="offline"/);
  });

  it("unknown clinic is NOT_FOUND, not a 500", async () => {
    requireDb();
    const res = await request(app).get("/clinics/no-such-clinic-xyz");
    assert.equal(res.status, 404);
    assert.match(res.text, /data-ac-state-key="not_found"|Clinic not found/i);
  });

  it("directory loading presentation exists without faking production failures", async () => {
    requireDb();
    const res = await request(app).get("/clinics?_directoryLoading=1");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-ac-state-key="loading"/);
    assert.match(res.text, /data-ac-directory-state="loading"/);
  });

  it("clinic registration empty POST is VALIDATION_ERROR", async () => {
    requireDb();
    const csrf = issueCsrfToken(MINIMAL_AC);
    const res = await request(app)
      .post("/register-clinic")
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.ok(res.status === 400 || res.status === 200);
    assert.match(res.text, /data-ac-form-state="validation_error"|Please fix the following/i);
  });

  it("clinical / patients / reception empty lists use canonical EMPTY", async () => {
    requireDb();
    const cookie = await sessionCookie(admin.identity.id, tenant.orgId, tenant.facilityId);
    const clinical = await request(app).get("/app/clinical").set("Cookie", cookie);
    assert.equal(clinical.status, 200);
    assert.match(clinical.text, /data-ac-empty="clinical-queue-empty"/);
    assert.match(clinical.text, /data-ac-state-key="empty"/);

    const patients = await request(app).get("/app/patients").set("Cookie", cookie);
    assert.equal(patients.status, 200);
    assert.match(patients.text, /data-ac-empty="patients-none"/);

    const receptionQueue = await request(app).get("/app/reception").set("Cookie", cookie);
    assert.equal(receptionQueue.status, 200);
    assert.match(receptionQueue.text, /data-ac-empty="reception-queue-empty"/);
  });

  it("PERMISSION_DENIED is 403 access-restricted, not a 500", async () => {
    requireDb();
    const cookie = await sessionCookie(
      reception.identity.id,
      tenant.orgId,
      tenant.facilityId
    );
    const pharmacy = await request(app).get("/app/pharmacy").set("Cookie", cookie);
    assert.equal(pharmacy.status, 403);
    assert.match(pharmacy.text, /data-ac-state-key="access_restricted"|You do not have access/i);
  });

  it("FACILITY_UNAVAILABLE is shown on select-facility with no assignments", async () => {
    requireDb();
    const cookie = await sessionCookie(unassigned.identity.id, unassigned.orgId, null);
    const res = await request(app).get("/app/select-facility").set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-ac-state-key="facility_unavailable"/);
    assert.match(res.text, /data-ac-empty="facility-select"/);
  });

  it("DEPARTMENT_DISABLED is 403 department-unavailable, not a 500", async () => {
    requireDb();
    await pool.query(
      `UPDATE activeclinic.departments
          SET status = 'inactive'
        WHERE facility_id = $1
          AND department_type = 'pharmacy'`,
      [tenant.facilityId]
    );
    const cookie = await sessionCookie(admin.identity.id, tenant.orgId, tenant.facilityId);
    const res = await request(app).get("/app/pharmacy").set("Cookie", cookie);
    assert.equal(res.status, 403);
    assert.match(res.text, /data-ac-state-key="department_not_configured"|department is not available/i);
  });
});
