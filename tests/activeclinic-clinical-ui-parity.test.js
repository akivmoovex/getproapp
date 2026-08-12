"use strict";

/**
 * ActiveClinic P04 clinical UI parity — view markers + HTTP smoke.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
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

const VIEWS_DIR = path.join(__dirname, "..", "views", "activeclinic", "app");
const EXPECTED = [
  ["clinical-escalation-alert-content.ejs", "99757cfd7d3747d490f00ac342faa519"],
  ["clinical-queue-content.ejs", "b8d47f05a83c4959ac2d3d6ca83c7dfb"],
  ["consultation-workspace-content.ejs", "5e4dbc7265ad4e17b060b1f641996db3"],
  ["create-laboratory-request-content.ejs", "969bbfbdf9634dbc8af598ec2277e92f"],
  ["create-prescription-content.ejs", "ee9bf2322b924cd79e86619a4635f702"],
  ["create-radiology-request-content.ejs", "bc4ffd8f0e8c44f48f38cc15a069656a"],
  ["diagnosis-entry-content.ejs", "33a522e2f4eb45c9bdbede9ba34e0bee"],
  ["nursing-intake-content.ejs", "7959616d1673403ba3bf6ff71d18a77b"],
  ["triage-assessment-content.ejs", "3c8f7b43b7984718acf661e381c1e6f7"],
  ["vital-signs-entry-content.ejs", "dede5e72277d413497e1f870f6b4a0e1"],
];

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 970000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

async function seedTenant(stamp) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `ac_clinui_${stamp}`,
    displayName: "AC Clin UI",
    productKey: "activeclinic",
    productTenantKey: `ac-clinui-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true);
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Clin UI Legal",
    publicName: "Clin UI Public",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `main-${stamp}`.slice(0, 64),
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
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedAdmin(tenant) {
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
    firstName: "Clin",
    lastName: "Admin",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
  });
  assert.equal(staff.ok, true);
  await assignStaffToFacility(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: tenant.facilityId,
    isPrimary: true,
  });
  await assignStaffRole(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: NETWORK_ADMIN,
    scopeType: "organisation",
  });
  return { identity: identity.identity, staff: staff.staffMember };
}

async function sessionCookie(identityId, organizationId) {
  const session = await createPlatformIdentitySession(pool, {
    platformIdentityId: identityId,
    organizationId,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(session.ok, true);
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

function withCsrf(cookie) {
  const csrf = issueCsrfToken(MINIMAL_AC);
  return {
    cookie: `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`,
    csrf,
  };
}

describe("ActiveClinic P04 clinical UI parity", () => {
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

  beforeEach(() => resetDeploymentProfileWarningsForTests());

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("clinical views exist with exact Stitch IDs", () => {
    for (const [file, id] of EXPECTED) {
      const full = path.join(VIEWS_DIR, file);
      assert.ok(fs.existsSync(full), `missing ${file}`);
      const body = fs.readFileSync(full, "utf8");
      assert.match(body, new RegExp(id));
    }
  });

  it("clinical queue HTTP smoke + CSRF denial", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const tenant = await seedTenant(stamp);
    const admin = await seedAdmin(tenant);
    const app = createActiveClinicFoundationApp({
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      getPool: () => pool,
      isProduction: false,
    });
    const cookie = await sessionCookie(admin.identity.id, tenant.orgId);
    const { cookie: selectCookie, csrf: selectCsrf } = withCsrf(cookie);
    const facilitySelect = await request(app)
      .post("/app/select-facility")
      .set("Cookie", selectCookie)
      .type("form")
      .send({ [CSRF_FIELD]: selectCsrf, facility_id: tenant.facilityId });
    assert.equal(facilitySelect.status, 303);

    const queue = await request(app).get("/app/clinical").set("Cookie", cookie);
    assert.equal(queue.status, 200);
    assert.match(queue.text, /b8d47f05a83c4959ac2d3d6ca83c7dfb|clinical-queue|No open encounters/i);

    const csrfDenied = await request(app)
      .post("/app/clinical/start-encounter")
      .set("Cookie", cookie)
      .type("form")
      .send({});
    assert.equal(csrfDenied.status, 403);
  });
});
