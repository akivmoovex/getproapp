"use strict";

/**
 * ActiveClinic V2.03 Batch 2 — patient workspace (AC-B2-02 list; AC-B2-03 absent).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

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
  NETWORK_ADMIN,
  RECEPTIONIST,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
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
let phoneSeq = 850000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

async function provisionOrg(input) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    ...input,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

async function seedAcTenant(stamp, keyPrefix) {
  const org = await provisionOrg({
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Legal Hospital",
    publicName: "Batch2 Patient Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main Facility",
    facilityType: "hospital",
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
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedStaff(ac, opts) {
  const phone = opts.phone || nextPhone();
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
    firstName: opts.firstName || "Pat",
    lastName: opts.lastName || "Staff",
    employmentType: "permanent",
    phone,
    status: "active",
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
    roleKey: opts.roleKey || NETWORK_ADMIN,
    scopeType: opts.scopeType || "organisation",
    facilityId: opts.scopeType === "facility" ? ac.facilityId : null,
  });
  return { identity: identity.identity, staff: staff.staffMember };
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

describe("ActiveClinic V2.03 Batch 2 patient workspace", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("CSS and views ship B2 list composition; profile remains Batch1 functional", () => {
    const css = fs.readFileSync(
      path.join(__dirname, "../public/activeclinic/ac-app.css"),
      "utf8"
    );
    assert.match(css, /\.ac-patients--b2/);
    assert.match(css, /\.ac-patients-card/);
    assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.ac-patients--b2/);

    const list = fs.readFileSync(
      path.join(__dirname, "../views/activeclinic/app/patients-list-content.ejs"),
      "utf8"
    );
    assert.match(list, /data-ac-stitch="AC-B2-02"/);
    assert.match(list, /ac-patients-desktop/);
    assert.match(list, /ac-patients-mobile/);
    assert.match(list, /gp-ops-pagination|gp-ops-status-badge/);
    assert.match(list, /data-ac-unsupported-registry/);

    const profile = fs.readFileSync(
      path.join(__dirname, "../views/activeclinic/app/patient-profile-content.ejs"),
      "utf8"
    );
    assert.match(profile, /data-ac-stitch="ACN11"/);
    assert.match(profile, /data-ac-b2-stitch="absent"/);
  });

  it("list/search/open respect tenant isolation and role access", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const a = await seedAcTenant(stamp, "b2pa");
    const b = await seedAcTenant(stamp, "b2pb");

    const adminA = await seedStaff(a, {
      firstName: "Alpha",
      lastName: "Admin",
      roleKey: NETWORK_ADMIN,
    });
    const receptionA = await seedStaff(a, {
      firstName: "Front",
      lastName: "Desk",
      roleKey: RECEPTIONIST,
      scopeType: "facility",
    });
    const restrictedA = await seedStaff(a, {
      firstName: "No",
      lastName: "Patients",
      roleKey: STAFF_ROLE,
    });
    const adminB = await seedStaff(b, {
      firstName: "Beta",
      lastName: "Admin",
      roleKey: NETWORK_ADMIN,
    });

    const patientA = await registerActiveClinicPatient(pool, {
      organizationId: a.orgId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      actor: {
        staffMemberId: adminA.staff.id,
        organizationId: a.orgId,
      },
      demographics: {
        firstName: "Isolated",
        lastName: "Alpha",
        dateOfBirth: "1991-04-05",
        sexAtRegistration: "female",
      },
      contacts: { phone: nextPhone() },
      registrationMethod: "walk_in",
    });
    assert.equal(patientA.ok, true, JSON.stringify(patientA));

    const patientB = await registerActiveClinicPatient(pool, {
      organizationId: b.orgId,
      healthcareOrganizationId: b.hcoId,
      facilityId: b.facilityId,
      actor: {
        staffMemberId: adminB.staff.id,
        organizationId: b.orgId,
      },
      demographics: {
        firstName: "Isolated",
        lastName: "Beta",
        dateOfBirth: "1992-06-07",
      },
      contacts: { phone: nextPhone() },
      registrationMethod: "walk_in",
    });
    assert.equal(patientB.ok, true, JSON.stringify(patientB));

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });

    const cookieA = await sessionCookie(adminA.identity.id, a.orgId, a.facilityId);
    const cookieRec = await sessionCookie(
      receptionA.identity.id,
      a.orgId,
      a.facilityId
    );
    const cookieStaff = await sessionCookie(
      restrictedA.identity.id,
      a.orgId,
      a.facilityId
    );
    const cookieB = await sessionCookie(adminB.identity.id, b.orgId, b.facilityId);

    const denied = await request(app).get("/app/patients").set("Cookie", cookieStaff);
    assert.equal(denied.status, 403);

    const listA = await request(app).get("/app/patients").set("Cookie", cookieA);
    assert.equal(listA.status, 200);
    assert.match(listA.text, /data-ac-stitch="AC-B2-02"/);
    assert.match(listA.text, /ac-patients--b2/);
    assert.match(listA.text, /data-ac-table="patients"/);
    assert.match(listA.text, /data-ac-cards="patients"/);
    assert.match(listA.text, /Isolated Alpha/);
    assert.doesNotMatch(listA.text, /Isolated Beta/);
    assert.match(listA.text, /data-ac-unsupported="last_visit"/);
    assert.doesNotMatch(listA.text, /<th[^>]*>\s*Primary Care Provider/i);
    assert.doesNotMatch(listA.text, /<th[^>]*>\s*Last Visit/i);
    assert.doesNotMatch(listA.text, /<th[^>]*>\s*Next Appointment/i);

    const search = await request(app)
      .get("/app/patients?q=alp")
      .set("Cookie", cookieRec);
    assert.equal(search.status, 200);
    assert.match(search.text, /Isolated Alpha/);
    assert.doesNotMatch(search.text, /Isolated Beta/);
    assert.doesNotMatch(search.text, /\+2609\d{8}/);

    const open = await request(app)
      .get(`/app/patients/${encodeURIComponent(patientA.patient.patientNumber)}`)
      .set("Cookie", cookieRec);
    assert.equal(open.status, 200);
    assert.match(open.text, /data-ac-page-section="patient-profile"/);
    assert.match(open.text, /data-ac-stitch="ACN11"/);
    assert.match(open.text, /data-ac-b2-stitch="absent"/);
    assert.match(open.text, /Isolated Alpha/);

    const crossTenant = await request(app)
      .get(`/app/patients/${encodeURIComponent(patientA.patient.patientNumber)}`)
      .set("Cookie", cookieB);
    // Numbers are HCO-scoped; colliding numbers must still never leak the other tenant's patient.
    assert.doesNotMatch(crossTenant.text, /Isolated Alpha/);
    if (![200, 403, 404].includes(crossTenant.status)) {
      assert.fail(`Unexpected cross-tenant status ${crossTenant.status}`);
    }

    const listB = await request(app).get("/app/patients").set("Cookie", cookieB);
    assert.equal(listB.status, 200);
    assert.match(listB.text, /Isolated Beta/);
    assert.doesNotMatch(listB.text, /Isolated Alpha/);
  });
});
