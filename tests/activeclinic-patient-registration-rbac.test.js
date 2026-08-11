"use strict";

/**
 * ActiveClinic patient registration / quick-register / duplicate / RBAC regression.
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
  RECEPTIONIST,
  NURSE,
  CLINICIAN,
  PHARMACIST,
  LAB_TECHNICIAN,
  RADIOLOGY_STAFF,
  CASHIER,
  CLINIC_MANAGER,
  MEDICAL_RECORDS_OFFICER,
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
const {
  registerActiveClinicPatient,
  PERM,
  CREATION_MODES,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  findPotentialPatientDuplicates,
} = require("../src/activeclinic/services/activeClinicPatientDuplicateService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");

const PASSWORD = "DemoStaff-ActiveClinic-2026A";
const MINIMAL_AC = {
  NODE_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "test-session-secret-patient-reg-32chars!!",
};

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 26097000000;

function nextPhone() {
  phoneSeq += 1;
  return `+${phoneSeq}`;
}

async function seedTenant(key) {
  const stamp = Date.now().toString(36);
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${key}_${stamp}`,
    displayName: `Reg ${key}`,
    productKey: "activeclinic",
    productTenantKey: `${key}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const orgId = org.records.organization.id;
  const hco = await createHealthcareOrganization(pool, {
    organizationId: orgId,
    legalName: `Legal ${key}`,
    publicName: `Public ${key}`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${key}-main`,
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
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
  return {
    orgId,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedUser(tenant, roleKey, scopeType) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `${roleKey}.${phone.slice(-8)}@example.test`,
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
    firstName: "Reg",
    lastName: roleKey,
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: roleKey,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: tenant.facilityId,
    isPrimary: true,
  });
  await assignStaffRole(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType: scopeType || "facility",
    facilityId: scopeType === "organisation" ? null : tenant.facilityId,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  return {
    identityId: identity.identity.id,
    staffMemberId: staff.staffMember.id,
  };
}

async function makeSessionCookie(identityId, orgId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
    contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
  });
  assert.equal(session.ok, true);
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

function csrfPair() {
  const token = issueCsrfToken(MINIMAL_AC);
  return {
    cookie: `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${token}`,
    field: { [CSRF_FIELD]: token },
  };
}

describe("ActiveClinic patient registration RBAC + workflows", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await pool.query(
        `INSERT INTO platform.database_identity
           (id, database_instance_id, environment_code, database_name, host_fingerprint, identity_key)
         VALUES
           (1, $1, 'testing', 'getpro_test', 'localhost', 'blessboard-platform-v5')
         ON CONFLICT (id) DO UPDATE SET
           environment_code = EXCLUDED.environment_code,
           identity_key = EXCLUDED.identity_key,
           updated_at = now()`,
        ["11111111-1111-4111-8111-111111111111"]
      );
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("quick_register permission exists and is assigned to nurse/clinician only by default", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const perm = await pool.query(
      `SELECT permission_key FROM blessboard.permissions WHERE permission_key=$1`,
      [PERM.QUICK_REGISTER]
    );
    assert.equal(perm.rowCount, 1);
    const roles = await pool.query(
      `SELECT r.role_key
         FROM blessboard.role_permissions rp
         JOIN blessboard.roles r ON r.id = rp.role_id
         JOIN blessboard.permissions p ON p.id = rp.permission_id
        WHERE p.permission_key = $1
        ORDER BY 1`,
      [PERM.QUICK_REGISTER]
    );
    const keys = roles.rows.map((r) => r.role_key);
    assert.ok(keys.includes("activeclinic_nurse"));
    assert.ok(keys.includes("activeclinic_clinician"));
    assert.ok(!keys.includes("activeclinic_receptionist"));
  });

  it("receptionist lacks manage_identifiers; medical records officer has it", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const rows = await pool.query(
      `SELECT r.role_key
         FROM blessboard.role_permissions rp
         JOIN blessboard.roles r ON r.id = rp.role_id
         JOIN blessboard.permissions p ON p.id = rp.permission_id
        WHERE p.permission_key = $1
          AND r.role_key IN (
            'activeclinic_receptionist',
            'activeclinic_clinic_manager',
            'activeclinic_medical_records_officer'
          )`,
      [PERM.MANAGE_IDENTIFIERS]
    );
    const keys = rows.rows.map((r) => r.role_key);
    assert.ok(keys.includes("activeclinic_medical_records_officer"));
    assert.ok(!keys.includes("activeclinic_receptionist"));
    assert.ok(!keys.includes("activeclinic_clinic_manager"));
  });

  it("receptionist can full-register; pharmacist/lab/radiology/cashier cannot create", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("rbac");
    const receptionist = await seedUser(tenant, RECEPTIONIST);
    const pharmacist = await seedUser(tenant, PHARMACIST);
    const lab = await seedUser(tenant, LAB_TECHNICIAN);
    const rad = await seedUser(tenant, RADIOLOGY_STAFF);
    const cashier = await seedUser(tenant, CASHIER);
    const app = makeApp();

    const csrf = csrfPair();
    const recCookie = await makeSessionCookie(
      receptionist.identityId,
      tenant.orgId,
      tenant.facilityId
    );
    const ok = await request(app)
      .get("/app/patients/new")
      .set("Cookie", [recCookie, csrf.cookie]);
    assert.equal(ok.status, 200);
    assert.match(ok.text, /Find existing patient|Register patient/i);

    for (const user of [pharmacist, lab, rad, cashier]) {
      const cookie = await makeSessionCookie(
        user.identityId,
        tenant.orgId,
        tenant.facilityId
      );
      const denied = await request(app)
        .get("/app/patients/new")
        .set("Cookie", [cookie, csrf.cookie]);
      assert.equal(denied.status, 403, `expected 403 for create`);
    }
  });

  it("nurse can quick-register but not full-register; creates incomplete status", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("nurse");
    const nurse = await seedUser(tenant, NURSE);
    const app = makeApp();
    const csrf = csrfPair();
    const cookie = await makeSessionCookie(
      nurse.identityId,
      tenant.orgId,
      tenant.facilityId
    );

    const full = await request(app)
      .get("/app/patients/new")
      .set("Cookie", [cookie, csrf.cookie]);
    assert.equal(full.status, 403);

    const quickGet = await request(app)
      .get("/app/patients/quick-register")
      .set("Cookie", [cookie, csrf.cookie]);
    assert.equal(quickGet.status, 200);
    assert.match(quickGet.text, /Quick Register/i);

    const created = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      creationMode: CREATION_MODES.QUICK,
      registrationStatus: "incomplete",
      demographics: {
        firstName: "Quick",
        lastName: "NurseCase",
        sexAtRegistration: "female",
        dateOfBirth: "1995-04-01",
      },
      contacts: {},
      address: {},
      actor: {
        staffMemberId: nurse.staffMemberId,
        platformIdentityId: nurse.identityId,
        organizationId: tenant.orgId,
      },
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.patient.registrationStatus, "incomplete");
  });

  it("clinician can quick-register", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("clin");
    const clinician = await seedUser(tenant, CLINICIAN);
    const csrf = csrfPair();
    const cookie = await makeSessionCookie(
      clinician.identityId,
      tenant.orgId,
      tenant.facilityId
    );
    const app = makeApp();
    const res = await request(app)
      .get("/app/patients/quick-register")
      .set("Cookie", [cookie, csrf.cookie]);
    assert.equal(res.status, 200);
  });

  it("clinic manager can open full registration", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("mgr");
    const manager = await seedUser(tenant, CLINIC_MANAGER);
    const csrf = csrfPair();
    const cookie = await makeSessionCookie(
      manager.identityId,
      tenant.orgId,
      tenant.facilityId
    );
    const app = makeApp();
    const res = await request(app)
      .get("/app/patients/new")
      .set("Cookie", [cookie, csrf.cookie]);
    assert.equal(res.status, 200);
  });

  it("duplicate phone exact is strong warning; shared phone allowed with override; org-scoped", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const a = await seedTenant("dupA");
    const b = await seedTenant("dupB");
    const receptionistA = await seedUser(a, RECEPTIONIST);
    const phone = nextPhone();

    const created = await registerActiveClinicPatient(pool, {
      organizationId: a.orgId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      demographics: {
        firstName: "John",
        lastName: "Banda",
        dateOfBirth: "1988-03-12",
        sexAtRegistration: "male",
      },
      contacts: { phone },
      address: {},
      actor: {
        staffMemberId: receptionistA.staffMemberId,
        platformIdentityId: receptionistA.identityId,
        organizationId: a.orgId,
      },
    });
    assert.equal(created.ok, true, JSON.stringify(created));

    const dupSameOrg = await findPotentialPatientDuplicates(pool, {
      organizationId: a.orgId,
      healthcareOrganizationId: a.hcoId,
      phoneNormalized: created.patient.phoneNormalized,
      firstName: "Other",
      lastName: "Person",
    });
    assert.equal(dupSameOrg.blocking, true);
    assert.ok(dupSameOrg.matches.some((m) => m.matchStrength === "strong"));
    assert.ok(
      dupSameOrg.matches.some((m) => (m.reasons || []).includes("phone_exact"))
    );

    const blocked = await registerActiveClinicPatient(pool, {
      organizationId: a.orgId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      demographics: {
        firstName: "Child",
        lastName: "Banda",
        dateOfBirth: "2015-01-02",
        sexAtRegistration: "female",
      },
      contacts: { phone },
      address: {},
      actor: {
        staffMemberId: receptionistA.staffMemberId,
        platformIdentityId: receptionistA.identityId,
        organizationId: a.orgId,
      },
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "duplicate_warning");

    const shared = await registerActiveClinicPatient(pool, {
      organizationId: a.orgId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      demographics: {
        firstName: "Child",
        lastName: "Banda",
        dateOfBirth: "2015-01-02",
        sexAtRegistration: "female",
      },
      contacts: { phone },
      address: {},
      duplicateOverride: true,
      duplicateOverrideReason: "child_uses_parent_phone",
      actor: {
        staffMemberId: receptionistA.staffMemberId,
        platformIdentityId: receptionistA.identityId,
        organizationId: a.orgId,
      },
    });
    assert.equal(shared.ok, true, JSON.stringify(shared));
    assert.notEqual(shared.patient.id, created.patient.id);
    assert.equal(shared.patient.phoneNormalized, created.patient.phoneNormalized);

    const dupOtherOrg = await findPotentialPatientDuplicates(pool, {
      organizationId: b.orgId,
      healthcareOrganizationId: b.hcoId,
      phoneNormalized: created.patient.phoneNormalized,
      firstName: "John",
      lastName: "Banda",
      dateOfBirth: "1988-03-12",
    });
    assert.equal(dupOtherOrg.matches.length, 0);
  });

  it("receptionist cannot submit authoritative identifiers; medical records can", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("idn");
    const receptionist = await seedUser(tenant, RECEPTIONIST);
    const records = await seedUser(tenant, MEDICAL_RECORDS_OFFICER);
    const nrc = `NRC-${Date.now().toString(36).toUpperCase()}`;

    const denied = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      demographics: {
        firstName: "No",
        lastName: "IdPerm",
        dateOfBirth: "1990-01-01",
        sexAtRegistration: "female",
      },
      contacts: { phone: nextPhone() },
      address: {},
      identifiers: [{ identifierType: "national_id", identifierValue: nrc }],
      actor: {
        staffMemberId: receptionist.staffMemberId,
        platformIdentityId: receptionist.identityId,
        organizationId: tenant.orgId,
      },
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "identifier_management_required");

    const ok = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      demographics: {
        firstName: "Has",
        lastName: "IdPerm",
        dateOfBirth: "1990-01-01",
        sexAtRegistration: "female",
      },
      contacts: { phone: nextPhone() },
      address: {},
      identifiers: [{ identifierType: "national_id", identifierValue: nrc }],
      actor: {
        staffMemberId: records.staffMemberId,
        platformIdentityId: records.identityId,
        organizationId: tenant.orgId,
      },
    });
    assert.equal(ok.ok, true, JSON.stringify(ok));

    const conflict = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      demographics: {
        firstName: "Dup",
        lastName: "Id",
        dateOfBirth: "1991-02-02",
        sexAtRegistration: "male",
      },
      contacts: { phone: nextPhone() },
      address: {},
      identifiers: [{ identifierType: "national_id", identifierValue: nrc }],
      duplicateOverride: true,
      duplicateOverrideReason: "should_not_bypass_nrc",
      actor: {
        staffMemberId: records.staffMemberId,
        platformIdentityId: records.identityId,
        organizationId: tenant.orgId,
      },
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, "identifier_conflict");
  });

  it("multi-role receptionist + medical records unions identifier management", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("union");
    const user = await seedUser(tenant, RECEPTIONIST);
    await assignStaffRole(pool, {
      organizationId: tenant.orgId,
      staffMemberId: user.staffMemberId,
      roleKey: MEDICAL_RECORDS_OFFICER,
      scopeType: "facility",
      facilityId: tenant.facilityId,
      assignmentOrigin: "system",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const nrc = `UNION-${Date.now().toString(36).toUpperCase()}`;
    const created = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      demographics: {
        firstName: "Union",
        lastName: "Role",
        dateOfBirth: "1985-05-05",
        sexAtRegistration: "male",
      },
      contacts: { phone: nextPhone() },
      address: {},
      identifiers: [{ identifierType: "national_id", identifierValue: nrc }],
      actor: {
        staffMemberId: user.staffMemberId,
        platformIdentityId: user.identityId,
        organizationId: tenant.orgId,
      },
    });
    assert.equal(created.ok, true, JSON.stringify(created));
  });

  it("cashier cannot open patient directory or create patients", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("cash");
    const cashier = await seedUser(tenant, CASHIER);
    const app = makeApp();
    const csrf = csrfPair();
    const cookie = await makeSessionCookie(
      cashier.identityId,
      tenant.orgId,
      tenant.facilityId
    );
    const list = await request(app)
      .get("/app/patients")
      .set("Cookie", [cookie, csrf.cookie]);
    assert.equal(list.status, 403);
    const create = await request(app)
      .get("/app/patients/new")
      .set("Cookie", [cookie, csrf.cookie]);
    assert.equal(create.status, 403);
  });

  it("walk-in and appointment forms expose register link for receptionist", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("flow");
    const receptionist = await seedUser(tenant, RECEPTIONIST);
    const app = makeApp();
    const csrf = csrfPair();
    const cookie = await makeSessionCookie(
      receptionist.identityId,
      tenant.orgId,
      tenant.facilityId
    );

    const walkIn = await request(app)
      .get("/app/reception/walk-in")
      .set("Cookie", [cookie, csrf.cookie]);
    assert.equal(walkIn.status, 200);
    assert.match(walkIn.text, /Register new patient/i);
    assert.match(walkIn.text, /return_to/);

    const appt = await request(app)
      .get("/app/appointments/new")
      .set("Cookie", [cookie, csrf.cookie]);
    assert.equal(appt.status, 200);
    assert.match(appt.text, /Register new patient/i);
  });

  it("directory shows Register patient for receptionist without Quick Register", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("dir");
    const receptionist = await seedUser(tenant, RECEPTIONIST);
    const nurse = await seedUser(tenant, NURSE);
    const app = makeApp();
    const csrf = csrfPair();

    const rec = await request(app)
      .get("/app/patients")
      .set(
        "Cookie",
        [
          await makeSessionCookie(
            receptionist.identityId,
            tenant.orgId,
            tenant.facilityId
          ),
          csrf.cookie,
        ]
      );
    assert.equal(rec.status, 200);
    assert.match(rec.text, /Register patient/i);
    assert.doesNotMatch(rec.text, /Quick Register/i);

    const nurseList = await request(app)
      .get("/app/patients")
      .set(
        "Cookie",
        [
          await makeSessionCookie(nurse.identityId, tenant.orgId, tenant.facilityId),
          csrf.cookie,
        ]
      );
    assert.equal(nurseList.status, 200);
    assert.match(nurseList.text, /Quick Register/i);
    assert.doesNotMatch(nurseList.text, />Register patient</);
  });
});
