"use strict";

/**
 * V2.05 / V5 — Admin Console Reports smoke (AC Performance + BB HQ Reports).
 *
 * Where Reports is exposed:
 *   AC → /app/performance (Clinic Manager / performance.view)
 *   BB → /hq/reports (HQ organisation.view)
 *
 * Covers: authorized open, tenant context, controlled empty state, seeded own-tenant
 * only, restricted role denied, no 404/500/503 on happy path.
 * Does not redesign report calculations.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { expectIsolationDenied } = require("./helpers/authzNegativeHelpers");
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
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  CLINIC_MANAGER,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
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
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const {
  provisionBlessBoardChurch,
} = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  createBlessBoardUser,
} = require("../src/blessboard/services/createBlessBoardUser");
const {
  assignBlessBoardRole,
} = require("../src/blessboard/services/assignBlessBoardRole");
const {
  ensureChurchSettingsInitialized,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  submitMemberRegistration,
} = require("../src/blessboard/services/memberRegistrationService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "ReportsAdmin-Smoke-99!";
const AC_HOST = "activeclinic.org";

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "a".repeat(48),
});

const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
  [ENV_KEY]: "1",
});

let pool;
let databaseUrl;
let skipReason = null;
let acCases = 0;
let bbCases = 0;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}${crypto.randomBytes(3).toString("hex")}`.slice(0, 16);
}

function nextPhone() {
  return `+26097${String(Date.now()).slice(-7)}${crypto.randomBytes(1).readUInt8(0) % 10}`;
}

function escapeRe(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertNoServerError(res, label) {
  assert.ok(
    ![404, 500, 503].includes(Number(res.status)),
    `${label} must not 404/500/503 (got ${res.status})`
  );
}

async function provisionAc(stamp) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `ac_rpt_${stamp}`,
    displayName: `Reports AC ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `ac-rpt-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: `${stamp} Legal`,
    publicName: `${stamp} Clinic`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `main-${stamp}`,
    displayName: `Main Facility ${stamp}`,
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true);
  return {
    organizationId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    facilityName: facility.facility.displayName || `Main Facility ${stamp}`,
    stamp,
  };
}

async function seedAcStaff(clinic, { roleKey, label }) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `${label}.${phone.slice(-8)}@acrpt.smoke`,
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
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    firstName: label,
    lastName: "Rpt",
    employmentType: "permanent",
    status: "active",
    phone,
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
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(role.ok, true, JSON.stringify(role));
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identity.identity.id,
    organizationId: clinic.organizationId,
    contextJson: { selectedFacilityId: clinic.facilityId },
  });
  assert.equal(session.ok, true);
  return {
    cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`,
    staffId: staff.staffMember.id,
  };
}

/** Seed one in-range appointment with a unique service name (no calc redesign). */
async function seedAcAppointment(clinic, staffId, serviceDisplayName) {
  const patientId = crypto.randomUUID();
  const serviceId = crypto.randomUUID();
  const apptId = crypto.randomUUID();
  const starts = new Date();
  const ends = new Date(starts.getTime() + 30 * 60 * 1000);
  await pool.query(
    `INSERT INTO activeclinic.appointment_service_types
       (id, organization_id, healthcare_organization_id, service_key, display_name,
        default_duration_minutes, status)
     VALUES ($1, $2, $3, $4, $5, 30, 'active')`,
    [
      serviceId,
      clinic.organizationId,
      clinic.hcoId,
      `svc-${clinic.stamp}`.slice(0, 40),
      serviceDisplayName,
    ]
  );
  await pool.query(
    `INSERT INTO activeclinic.patients
       (id, organization_id, healthcare_organization_id, patient_number,
        first_name, last_name, status, country_code)
     VALUES ($1, $2, $3, $4, 'Smoke', 'Patient', 'active', 'ZM')`,
    [
      patientId,
      clinic.organizationId,
      clinic.hcoId,
      `AC-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-6)}`,
    ]
  );
  await pool.query(
    `INSERT INTO activeclinic.appointments
       (id, organization_id, healthcare_organization_id, facility_id, patient_id,
        service_type_id, assigned_staff_id, starts_at, ends_at, timezone, status,
        created_by_staff_id, updated_by_staff_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Africa/Lusaka', 'confirmed', $7, $7)`,
    [
      apptId,
      clinic.organizationId,
      clinic.hcoId,
      clinic.facilityId,
      patientId,
      serviceId,
      staffId,
      starts.toISOString(),
      ends.toISOString(),
    ]
  );
  return { apptId, serviceDisplayName };
}

async function provisionBb(stamp) {
  const orgKey = `bbrpt${String(stamp).replace(/[^a-z0-9]/gi, "")}`.slice(0, 24);
  const host = `${orgKey}.blessboard.org`;
  const displayName = `Reports Church ${stamp}`;
  const tenant = await provisionPlatformTenant(pool, {
    organizationKey: orgKey,
    displayName,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: orgKey,
    hostname: host,
    domainType: "canonical",
    deploymentCode: "blessboard-org-staging",
    isPrimary: true,
  });
  assert.equal(tenant.ok, true, JSON.stringify(tenant));
  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: orgKey,
    churchKey: orgKey,
    displayName,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true, JSON.stringify(church));
  await ensureChurchSettingsInitialized(pool, church.records.church.id);
  const organizationId = (
    await pool.query(`SELECT id FROM platform.organizations WHERE organization_key=$1`, [
      orgKey,
    ])
  ).rows[0].id;
  return {
    orgKey,
    host,
    organizationId,
    churchId: church.records.church.id,
    hqBranchId: church.records.hqBranch.id,
    displayName,
    stamp,
  };
}

async function seedBbUser(church, { email, roleKey, branchKey }) {
  const created = await createBlessBoardUser(pool, {
    email,
    password: PASSWORD,
    displayName: roleKey,
  });
  assert.equal(created.ok, true, created.message || JSON.stringify(created));
  const assigned = await assignBlessBoardRole(pool, {
    email,
    organizationKey: church.orgKey,
    roleKey,
    churchKey: church.orgKey,
    ...(branchKey ? { branchKey } : {}),
  });
  assert.equal(assigned.ok, true, JSON.stringify(assigned));
  const session = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId: created.user.id,
    organizationId: church.organizationId,
    churchId: church.churchId,
    branchId: church.hqBranchId,
  });
  assert.equal(session.ok, true, session.code || JSON.stringify(session));
  return { cookie: `${DEFAULT_V5_COOKIE}=${session.rawToken}`, userId: created.user.id };
}

describe("V2.05 Admin Console Reports smoke (AC Performance + BB HQ Reports)", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("AC: /app/performance open, empty, seeded own-tenant, restricted denied", async () => {
    requireDb();
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      log: () => {},
    });
    const clinic = await provisionAc(uniq("a"));
    const other = await provisionAc(uniq("b"));
    const manager = await seedAcStaff(clinic, {
      roleKey: CLINIC_MANAGER,
      label: "ClinicMgr",
    });
    const restricted = await seedAcStaff(clinic, {
      roleKey: STAFF_ROLE,
      label: "StaffOnly",
    });
    const otherMgr = await seedAcStaff(other, {
      roleKey: CLINIC_MANAGER,
      label: "OtherMgr",
    });

    // Authorized open + tenant context + empty state
    const empty = await request(app)
      .get("/app/performance")
      .set("Host", AC_HOST)
      .set("Cookie", manager.cookie);
    assertNoServerError(empty, "AC GET /app/performance empty");
    assert.equal(empty.status, 200);
    assert.match(empty.text, /data-ac-page-section="performance-dashboard"|Clinic performance/i);
    assert.match(empty.text, new RegExp(escapeRe(clinic.facilityName)));
    assert.match(empty.text, /No bookings in this range/);
    assert.match(
      empty.text,
      /ac-kpi__label">Appointments<\/p>\s*<p class="ac-kpi__value">0<\/p>/
    );
    acCases += 1;

    // Seed own-tenant appointment with unique service label
    const serviceName = `SmokeRptSvc-${clinic.stamp}`;
    await seedAcAppointment(clinic, manager.staffId, serviceName);

    const seeded = await request(app)
      .get("/app/performance")
      .set("Host", AC_HOST)
      .set("Cookie", manager.cookie);
    assertNoServerError(seeded, "AC GET /app/performance seeded");
    assert.equal(seeded.status, 200);
    assert.match(
      seeded.text,
      /ac-kpi__label">Appointments<\/p>\s*<p class="ac-kpi__value">[1-9]\d*<\/p>/
    );
    assert.match(seeded.text, new RegExp(escapeRe(serviceName)));
    assert.doesNotMatch(seeded.text, /No bookings in this range/);
    acCases += 1;

    // Other tenant does not see seeded service
    const otherView = await request(app)
      .get("/app/performance")
      .set("Host", AC_HOST)
      .set("Cookie", otherMgr.cookie);
    assertNoServerError(otherView, "AC other-tenant performance");
    assert.equal(otherView.status, 200);
    assert.doesNotMatch(otherView.text, new RegExp(escapeRe(serviceName)));
    assert.match(otherView.text, new RegExp(escapeRe(other.facilityName)));
    assert.match(otherView.text, /No bookings in this range/);
    acCases += 1;

    // Restricted role denied
    const denied = await request(app)
      .get("/app/performance")
      .set("Host", AC_HOST)
      .set("Cookie", restricted.cookie);
    assert.ok(![500, 503].includes(Number(denied.status)), `restricted 5xx ${denied.status}`);
    expectIsolationDenied(denied, "AC staff /app/performance");
    acCases += 1;
  });

  it("BB: /hq/reports open, empty, seeded own-tenant, restricted denied", async () => {
    requireDb();
    const app = createV5FoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_BB, DATABASE_URL: databaseUrl },
      log: () => {},
    });
    const church = await provisionBb(uniq("c"));
    const other = await provisionBb(uniq("d"));
    const hq = await seedBbUser(church, {
      email: `hq-${church.stamp}@bbrpt.smoke`,
      roleKey: "church_hq_admin",
    });
    const restricted = await seedBbUser(church, {
      email: `br-${church.stamp}@bbrpt.smoke`,
      roleKey: "branch_admin",
      branchKey: "hq",
    });
    const otherHq = await seedBbUser(other, {
      email: `hq-${other.stamp}@bbrpt.smoke`,
      roleKey: "church_hq_admin",
    });

    // Authorized open + tenant context + controlled empty markers
    const empty = await request(app)
      .get("/hq/reports")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(empty, "BB GET /hq/reports empty");
    assert.equal(empty.status, 200);
    assert.match(empty.text, /data-bb-hq-reports="1"/);
    assert.match(empty.text, new RegExp(escapeRe(church.displayName)));
    assert.match(
      empty.text,
      /data-bb-report="giving-empty"|data-bb-report="attendance-empty"|No pending registrations|No submitted/
    );
    assert.match(empty.text, /data-bb-report-stat="pending"/);
    assert.match(
      empty.text,
      /data-bb-report-stat="pending"[\s\S]*?<p class="bb-hq-reports-summary__value">0<\/p>/
    );
    bbCases += 1;

    // Seed pending registration for own tenant
    const pending = await submitMemberRegistration(pool, {
      churchId: church.churchId,
      branchId: church.hqBranchId,
      firstName: "Pending",
      lastName: `Rpt${church.stamp}`,
      preferredName: "Pend",
      email: `pending-${church.stamp}@bbrpt.smoke`,
      phone: nextPhone(),
    });
    assert.equal(pending.ok, true, JSON.stringify(pending));

    const seeded = await request(app)
      .get("/hq/reports")
      .set("Host", church.host)
      .set("Cookie", hq.cookie);
    assertNoServerError(seeded, "BB GET /hq/reports seeded");
    assert.equal(seeded.status, 200);
    assert.match(seeded.text, new RegExp(escapeRe(church.displayName)));
    assert.match(
      seeded.text,
      /data-bb-report-stat="pending"[\s\S]*?<p class="bb-hq-reports-summary__value">[1-9]\d*<\/p>/
    );
    assert.match(
      seeded.text,
      /data-bb-report="registrations-pending"[\s\S]*?data-bb-count="[1-9]\d*"/
    );
    bbCases += 1;

    // Other tenant does not inherit seeded pending / church name
    const otherView = await request(app)
      .get("/hq/reports")
      .set("Host", other.host)
      .set("Cookie", otherHq.cookie);
    assertNoServerError(otherView, "BB other-tenant reports");
    assert.equal(otherView.status, 200);
    assert.match(otherView.text, new RegExp(escapeRe(other.displayName)));
    assert.doesNotMatch(otherView.text, new RegExp(escapeRe(church.displayName)));
    assert.match(
      otherView.text,
      /data-bb-report-stat="pending"[\s\S]*?<p class="bb-hq-reports-summary__value">0<\/p>/
    );
    bbCases += 1;

    // Restricted branch admin denied HQ reports
    const denied = await request(app)
      .get("/hq/reports")
      .set("Host", church.host)
      .set("Cookie", restricted.cookie);
    assert.ok(![500, 503].includes(Number(denied.status)), `restricted 5xx ${denied.status}`);
    expectIsolationDenied(denied, "BB branch_admin /hq/reports");
    bbCases += 1;
  });

  it("reports case counts for FINALs", () => {
    if (skipReason) return;
    assert.ok(acCases >= 4, `AC_CASES=${acCases}`);
    assert.ok(bbCases >= 4, `BB_CASES=${bbCases}`);
    // eslint-disable-next-line no-console
    console.log(
      `ADMIN_CONSOLE_REPORTS_SMOKE ROUTES=/app/performance,/hq/reports AC_CASES=${acCases} BB_CASES=${bbCases} PASS=${acCases + bbCases} FAIL=0`
    );
  });
});
