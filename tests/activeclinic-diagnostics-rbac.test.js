"use strict";

/**
 * ActiveClinic Prompt 9 — laboratory vs radiology authorization split.
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
  resolveEffectivePermissions,
  LAB_TECHNICIAN,
  RADIOLOGY_STAFF,
  ORGANIZATION_ADMIN,
  AUDITOR,
  CLINIC_MANAGER,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  buildActiveClinicNavigation,
} = require("../src/activeclinic/services/activeClinicNavigation");
const {
  canViewLaboratory,
  canViewRadiology,
  canEnterDiagnosticsHub,
  enterLaboratoryResult,
  enterRadiologyReport,
  RESULT: DIAG_RESULT,
  PERM,
} = require("../src/activeclinic/services/activeClinicDiagnosticsService");
const {
  loadActiveClinicLaboratoryQueueScreen,
  loadActiveClinicRadiologyQueueScreen,
} = require("../src/activeclinic/services/loadActiveClinicDiagnosticsScreens");
const {
  groupPermissionKeys,
} = require("../src/activeclinic/services/activeClinicInviteAccessReview");
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
const {
  seedActiveClinicDemoClinics,
  DEMO_CLINIC_KEY,
} = require("../src/activeclinic/services/activeClinicDemoClinicSeedService");
const {
  ACTIVECLINIC_DEMO,
} = require("../src/activeclinic/services/activeClinicDemoClinicSpec");
const {
  evaluateStaffEligibility,
} = require("../src/activeclinic/services/activeClinicLoginEligibility");

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
let phoneSeq = 910000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
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

async function seedTenant(stamp, keyPrefix) {
  const org = await provisionOrg({
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `Diag ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
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
    facilityKey: `${keyPrefix}-a`,
    displayName: "Facility A",
    facilityType: "clinic",
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
  return {
    orgId,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedRoleUser(ac, opts) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `diag.${phone.slice(-8)}@example.test`,
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
    firstName: opts.firstName || "Diag",
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
    facilityId: ac.facilityId,
    isPrimary: true,
  });
  const roles = Array.isArray(opts.roles) ? opts.roles : [];
  for (const role of roles) {
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: role.roleKey,
      scopeType: role.scopeType || "facility",
      facilityId: role.facilityId != null ? role.facilityId : ac.facilityId,
      assignmentOrigin: "system",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
  }
  return {
    identityId: identity.identity.id,
    staffMemberId: staff.staffMember.id,
    staff: staff.staffMember,
  };
}

async function permsFor(user, ac) {
  const perms = await resolveEffectivePermissions(pool, {
    organizationId: ac.orgId,
    staffMemberId: user.staffMemberId,
    platformIdentityId: user.identityId,
    facilityId: ac.facilityId,
  });
  assert.equal(perms.ok, true, JSON.stringify(perms));
  return perms.permissions;
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

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

async function seedDiagnosticRequests(ac, orderedByStaffId) {
  const stamp = Date.now().toString(36);
  const patientId = (
    await pool.query(
      `INSERT INTO activeclinic.patients (
         organization_id, healthcare_organization_id, patient_number,
         first_name, last_name, date_of_birth, sex_at_registration
       ) VALUES ($1, $2, $3, 'Diag', 'Patient', '1990-01-01', 'male')
       RETURNING id`,
      [ac.orgId, ac.hcoId, `AC-2026-${String(Date.now()).slice(-6)}`]
    )
  ).rows[0].id;
  const encounterId = (
    await pool.query(
      `INSERT INTO activeclinic.encounters (
         organization_id, healthcare_organization_id, facility_id, patient_id,
         encounter_number, status, opened_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, 'open', $6)
       RETURNING id`,
      [ac.orgId, ac.hcoId, ac.facilityId, patientId, `ENC-D-${stamp}`, orderedByStaffId]
    )
  ).rows[0].id;

  const labOrderId = (
    await pool.query(
      `INSERT INTO activeclinic.clinical_orders (
         organization_id, healthcare_organization_id, facility_id,
         encounter_id, patient_id, order_type, status, ordered_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, 'laboratory', 'submitted', $6)
       RETURNING id`,
      [ac.orgId, ac.hcoId, ac.facilityId, encounterId, patientId, orderedByStaffId]
    )
  ).rows[0].id;

  const radOrderId = (
    await pool.query(
      `INSERT INTO activeclinic.clinical_orders (
         organization_id, healthcare_organization_id, facility_id,
         encounter_id, patient_id, order_type, status, ordered_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, 'radiology', 'submitted', $6)
       RETURNING id`,
      [ac.orgId, ac.hcoId, ac.facilityId, encounterId, patientId, orderedByStaffId]
    )
  ).rows[0].id;

  const labRequestId = (
    await pool.query(
      `INSERT INTO activeclinic.laboratory_requests (
         organization_id, healthcare_organization_id, facility_id,
         clinical_order_id, encounter_id, patient_id,
         request_number, test_panel_name, status, requested_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CBC', 'pending_collection', $8)
       RETURNING id`,
      [
        ac.orgId,
        ac.hcoId,
        ac.facilityId,
        labOrderId,
        encounterId,
        patientId,
        `LAB-D-${stamp}`,
        orderedByStaffId,
      ]
    )
  ).rows[0].id;

  const radiologyRequestId = (
    await pool.query(
      `INSERT INTO activeclinic.radiology_requests (
         organization_id, healthcare_organization_id, facility_id,
         clinical_order_id, encounter_id, patient_id,
         request_number, study_type, study_description, status, requested_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'x_ray', 'Chest X-Ray', 'pending', $8)
       RETURNING id`,
      [
        ac.orgId,
        ac.hcoId,
        ac.facilityId,
        radOrderId,
        encounterId,
        patientId,
        `RAD-D-${stamp}`,
        orderedByStaffId,
      ]
    )
  ).rows[0].id;

  return { patientId, labRequestId, radiologyRequestId };
}

describe("ActiveClinic diagnostics modality RBAC (Prompt 9)", () => {
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

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("lab role permissions are modality-scoped", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedTenant(stamp, "labp");
    const lab = await seedRoleUser(ac, {
      firstName: "Lab",
      lastName: "Only",
      roles: [{ roleKey: LAB_TECHNICIAN, facilityId: ac.facilityId }],
    });
    const keys = await permsFor(lab, ac);
    for (const k of [
      PERM.LAB_VIEW,
      PERM.LAB_COLLECT,
      PERM.LAB_RESULT,
      PERM.LAB_VERIFY,
    ]) {
      assert.ok(keys.includes(k), `lab missing ${k}`);
    }
    for (const k of [
      PERM.RADIOLOGY_VIEW,
      PERM.RADIOLOGY_RESULT,
      PERM.VIEW,
      PERM.COLLECT,
      PERM.RESULT,
    ]) {
      assert.equal(keys.includes(k), false, `lab must not have ${k}`);
    }
  });

  it("radiology role permissions are modality-scoped (no collect)", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}r`;
    const ac = await seedTenant(stamp, "radp");
    const rad = await seedRoleUser(ac, {
      firstName: "Rad",
      lastName: "Only",
      roles: [{ roleKey: RADIOLOGY_STAFF, facilityId: ac.facilityId }],
    });
    const keys = await permsFor(rad, ac);
    for (const k of [PERM.RADIOLOGY_VIEW, PERM.RADIOLOGY_RESULT, PERM.RADIOLOGY_VERIFY]) {
      assert.ok(keys.includes(k), `radiology missing ${k}`);
    }
    for (const k of [
      PERM.LAB_VIEW,
      PERM.LAB_COLLECT,
      PERM.LAB_RESULT,
      "activeclinic.radiology.collect",
      PERM.COLLECT,
    ]) {
      assert.equal(keys.includes(k), false, `radiology must not have ${k}`);
    }
  });

  it("lab cannot access radiology routes; radiology cannot access lab routes", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}x`;
    const ac = await seedTenant(stamp, "cross");
    const lab = await seedRoleUser(ac, {
      firstName: "Lab",
      lastName: "Cross",
      roles: [{ roleKey: LAB_TECHNICIAN, facilityId: ac.facilityId }],
    });
    const rad = await seedRoleUser(ac, {
      firstName: "Rad",
      lastName: "Cross",
      roles: [{ roleKey: RADIOLOGY_STAFF, facilityId: ac.facilityId }],
    });
    const seeded = await seedDiagnosticRequests(ac, lab.staffMemberId);
    const app = makeApp();
    const labCookie = await sessionCookie(lab.identityId, ac.orgId, ac.facilityId);
    const radCookie = await sessionCookie(rad.identityId, ac.orgId, ac.facilityId);

    assert.equal(
      (await request(app).get("/app/diagnostics/laboratory").set("Cookie", labCookie)).status,
      200
    );
    assert.equal(
      (await request(app).get("/app/diagnostics/laboratory/worklist").set("Cookie", labCookie))
        .status,
      200
    );
    assert.equal(
      (
        await request(app)
          .get(`/app/diagnostics/laboratory/request/${seeded.labRequestId}/collect`)
          .set("Cookie", labCookie)
      ).status,
      200
    );
    assert.equal(
      (
        await request(app)
          .get(`/app/diagnostics/laboratory/request/${seeded.labRequestId}/result`)
          .set("Cookie", labCookie)
      ).status,
      200
    );
    assert.equal(
      (await request(app).get("/app/diagnostics/radiology").set("Cookie", labCookie)).status,
      403
    );
    assert.equal(
      (await request(app).get("/app/diagnostics/radiology/queue").set("Cookie", labCookie)).status,
      403
    );
    assert.equal(
      (
        await request(app)
          .get(`/app/diagnostics/radiology/request/${seeded.radiologyRequestId}/report`)
          .set("Cookie", labCookie)
      ).status,
      403
    );

    assert.equal(
      (await request(app).get("/app/diagnostics/radiology").set("Cookie", radCookie)).status,
      200
    );
    assert.equal(
      (
        await request(app)
          .get(`/app/diagnostics/radiology/request/${seeded.radiologyRequestId}/report`)
          .set("Cookie", radCookie)
      ).status,
      200
    );
    assert.equal(
      (await request(app).get("/app/diagnostics/laboratory").set("Cookie", radCookie)).status,
      403
    );
    assert.equal(
      (await request(app).get("/app/diagnostics/laboratory/worklist").set("Cookie", radCookie))
        .status,
      403
    );
    assert.equal(
      (
        await request(app)
          .get(`/app/diagnostics/laboratory/request/${seeded.labRequestId}/collect`)
          .set("Cookie", radCookie)
      ).status,
      403
    );
    assert.equal(
      (
        await request(app)
          .get(`/app/diagnostics/laboratory/request/${seeded.labRequestId}/result`)
          .set("Cookie", radCookie)
      ).status,
      403
    );
  });

  it("both-role user can access laboratory and radiology", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}b`;
    const ac = await seedTenant(stamp, "both");
    const both = await seedRoleUser(ac, {
      firstName: "Both",
      lastName: "Mods",
      roles: [
        { roleKey: LAB_TECHNICIAN, facilityId: ac.facilityId },
        { roleKey: RADIOLOGY_STAFF, facilityId: ac.facilityId },
      ],
    });
    const keys = await permsFor(both, ac);
    assert.ok(keys.includes(PERM.LAB_VIEW));
    assert.ok(keys.includes(PERM.RADIOLOGY_VIEW));
    const nav = buildActiveClinicNavigation(keys);
    assert.ok(nav.items.some((i) => i.key === "diagnostics"));

    const app = makeApp();
    const cookie = await sessionCookie(both.identityId, ac.orgId, ac.facilityId);
    const hub = await request(app).get("/app/diagnostics").set("Cookie", cookie);
    assert.equal(hub.status, 200);
    assert.match(hub.text, /data-ac-diagnostics-card="laboratory"/);
    assert.match(hub.text, /data-ac-diagnostics-card="radiology"/);
    assert.equal(
      (await request(app).get("/app/diagnostics/laboratory").set("Cookie", cookie)).status,
      200
    );
    assert.equal(
      (await request(app).get("/app/diagnostics/radiology").set("Cookie", cookie)).status,
      200
    );
  });

  it("modality ID tampering is denied (route + service table scope)", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t`;
    const ac = await seedTenant(stamp, "tamp");
    const lab = await seedRoleUser(ac, {
      firstName: "Lab",
      lastName: "Tamp",
      roles: [{ roleKey: LAB_TECHNICIAN, facilityId: ac.facilityId }],
    });
    const rad = await seedRoleUser(ac, {
      firstName: "Rad",
      lastName: "Tamp",
      roles: [{ roleKey: RADIOLOGY_STAFF, facilityId: ac.facilityId }],
    });
    const seeded = await seedDiagnosticRequests(ac, lab.staffMemberId);
    const app = makeApp();
    const labCookie = await sessionCookie(lab.identityId, ac.orgId, ac.facilityId);
    const radCookie = await sessionCookie(rad.identityId, ac.orgId, ac.facilityId);

    // Lab path with radiology UUID: permission may allow path, but request not in lab table.
    const labWrongId = await request(app)
      .get(`/app/diagnostics/laboratory/request/${seeded.radiologyRequestId}/result`)
      .set("Cookie", labCookie);
    assert.ok([403, 404].includes(labWrongId.status), `status=${labWrongId.status}`);

    // Radiology path with lab UUID denied for lab user by permission.
    assert.equal(
      (
        await request(app)
          .get(`/app/diagnostics/radiology/request/${seeded.labRequestId}/report`)
          .set("Cookie", labCookie)
      ).status,
      403
    );

    // Service-level: radiology ID into lab enter → not found (modality table).
    const labSvc = await enterLaboratoryResult(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityId: ac.facilityId,
      laboratoryRequestId: seeded.radiologyRequestId,
      resultSummary: "should fail",
      isCritical: false,
      components: [{ test_name: "Hgb", value_text: "12" }],
      actor: { staffId: lab.staffMemberId },
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(labSvc.ok, false);
    assert.equal(labSvc.code, DIAG_RESULT.REQUEST_NOT_FOUND);

    const radSvc = await enterRadiologyReport(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityId: ac.facilityId,
      radiologyRequestId: seeded.labRequestId,
      findings: "should fail",
      impression: null,
      technique: null,
      isCritical: false,
      actor: { staffId: rad.staffMemberId },
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(radSvc.ok, false);
    assert.equal(radSvc.code, DIAG_RESULT.REQUEST_NOT_FOUND);

    assert.equal(
      (
        await request(app)
          .get(`/app/diagnostics/laboratory/request/${seeded.labRequestId}/result`)
          .set("Cookie", radCookie)
      ).status,
      403
    );
  });

  it("worklists are modality-scoped server-side", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}w`;
    const ac = await seedTenant(stamp, "wl");
    const lab = await seedRoleUser(ac, {
      firstName: "Lab",
      lastName: "Wl",
      roles: [{ roleKey: LAB_TECHNICIAN, facilityId: ac.facilityId }],
    });
    const seeded = await seedDiagnosticRequests(ac, lab.staffMemberId);
    const auth = {
      organization: { id: ac.orgId },
      healthcareOrganization: { id: ac.hcoId },
      selectedFacility: { id: ac.facilityId, name: "A" },
      staffMember: { id: lab.staffMemberId },
    };
    const labQueue = await loadActiveClinicLaboratoryQueueScreen(pool, { auth });
    assert.equal(labQueue.ok, true);
    const labIds = ((labQueue.queue && labQueue.queue.requests) || []).map((r) => r.id);
    assert.ok(labIds.includes(seeded.labRequestId));
    assert.equal(labIds.includes(seeded.radiologyRequestId), false);

    const radQueue = await loadActiveClinicRadiologyQueueScreen(pool, { auth });
    assert.equal(radQueue.ok, true);
    const radIds = ((radQueue.queue && radQueue.queue.requests) || []).map((r) => r.id);
    assert.ok(radIds.includes(seeded.radiologyRequestId));
    assert.equal(radIds.includes(seeded.labRequestId), false);
  });

  it("hub cards are permission-aware; main Diagnostics nav gated correctly", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}h`;
    const ac = await seedTenant(stamp, "hub");
    const lab = await seedRoleUser(ac, {
      firstName: "Lab",
      lastName: "Hub",
      roles: [{ roleKey: LAB_TECHNICIAN, facilityId: ac.facilityId }],
    });
    const rad = await seedRoleUser(ac, {
      firstName: "Rad",
      lastName: "Hub",
      roles: [{ roleKey: RADIOLOGY_STAFF, facilityId: ac.facilityId }],
    });
    const labKeys = await permsFor(lab, ac);
    const radKeys = await permsFor(rad, ac);
    assert.ok(buildActiveClinicNavigation(labKeys).items.some((i) => i.key === "diagnostics"));
    assert.ok(buildActiveClinicNavigation(radKeys).items.some((i) => i.key === "diagnostics"));
    assert.ok(canEnterDiagnosticsHub({ permissions: labKeys }));
    assert.ok(canViewLaboratory({ permissions: labKeys }));
    assert.equal(canViewRadiology({ permissions: labKeys }), false);
    assert.ok(canViewRadiology({ permissions: radKeys }));
    assert.equal(canViewLaboratory({ permissions: radKeys }), false);

    const app = makeApp();
    const labHub = await request(app)
      .get("/app/diagnostics")
      .set("Cookie", await sessionCookie(lab.identityId, ac.orgId, ac.facilityId));
    assert.equal(labHub.status, 200);
    assert.match(labHub.text, /data-ac-diagnostics-card="laboratory"/);
    assert.doesNotMatch(labHub.text, /data-ac-diagnostics-card="radiology"/);

    const radHub = await request(app)
      .get("/app/diagnostics")
      .set("Cookie", await sessionCookie(rad.identityId, ac.orgId, ac.facilityId));
    assert.equal(radHub.status, 200);
    assert.match(radHub.text, /data-ac-diagnostics-card="radiology"/);
    assert.doesNotMatch(radHub.text, /data-ac-diagnostics-card="laboratory"/);
  });

  it("admin/auditor retain read-only diagnostics hub aggregation", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}a`;
    const ac = await seedTenant(stamp, "adm");
    const admin = await seedRoleUser(ac, {
      firstName: "Org",
      lastName: "Admin",
      roles: [{ roleKey: ORGANIZATION_ADMIN, scopeType: "organisation", facilityId: null }],
    });
    const auditor = await seedRoleUser(ac, {
      firstName: "Aud",
      lastName: "Itor",
      roles: [{ roleKey: AUDITOR, scopeType: "organisation", facilityId: null }],
    });
    const manager = await seedRoleUser(ac, {
      firstName: "Mgr",
      lastName: "Clinic",
      roles: [{ roleKey: CLINIC_MANAGER, facilityId: ac.facilityId }],
    });

    for (const user of [admin, auditor, manager]) {
      const keys = await permsFor(user, ac);
      assert.ok(keys.includes(PERM.VIEW), "read aggregation");
      assert.equal(keys.includes(PERM.LAB_RESULT), false);
      assert.equal(keys.includes(PERM.RADIOLOGY_RESULT), false);
      assert.equal(keys.includes(PERM.LAB_COLLECT), false);
      assert.equal(keys.includes(PERM.RESULT), false);
      assert.ok(canViewLaboratory({ permissions: keys }));
      assert.ok(canViewRadiology({ permissions: keys }));
    }

    const app = makeApp();
    const adminHub = await request(app)
      .get("/app/diagnostics")
      .set("Cookie", await sessionCookie(admin.identityId, ac.orgId, ac.facilityId));
    assert.equal(adminHub.status, 200);
    assert.match(adminHub.text, /data-ac-diagnostics-card="laboratory"/);
    assert.match(adminHub.text, /data-ac-diagnostics-card="radiology"/);
    assert.equal(
      (
        await request(app)
          .get("/app/diagnostics/laboratory/worklist")
          .set("Cookie", await sessionCookie(admin.identityId, ac.orgId, ac.facilityId))
      ).status,
      200
    );
    assert.equal(
      (
        await request(app)
          .get(`/app/diagnostics/laboratory/request/${crypto.randomUUID()}/collect`)
          .set("Cookie", await sessionCookie(admin.identityId, ac.orgId, ac.facilityId))
      ).status,
      403
    );
  });

  it("access preview groups Laboratory and Radiology separately", () => {
    const grouped = groupPermissionKeys([
      PERM.LAB_VIEW,
      PERM.LAB_COLLECT,
      PERM.RADIOLOGY_VIEW,
      PERM.VIEW,
    ]);
    const labels = grouped.groups.map((g) => g.label);
    assert.ok(labels.includes("Laboratory"));
    assert.ok(labels.includes("Radiology"));
    assert.ok(labels.includes("Diagnostics"));
  });

  it("demo lab and radiology accounts remain LOGIN_READY with modality perms", async () => {
    requireDb();
    const demo = await seedActiveClinicDemoClinics(pool, {
      clinicKeys: [DEMO_CLINIC_KEY],
      requireIdentityKey: "blessboard-platform-v5",
    });
    assert.equal(demo.ok, true, JSON.stringify(demo));
    const org = (
      await pool.query(
        `SELECT id FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
        [DEMO_CLINIC_KEY]
      )
    ).rows[0];
    assert.ok(org);
    const orgId = org.id;

    const labSpec = ACTIVECLINIC_DEMO.roleUsers.find((u) => u.key === "lab");
    const radSpec = ACTIVECLINIC_DEMO.roleUsers.find((u) => u.key === "radiology");
    assert.ok(labSpec);
    assert.ok(radSpec);

    for (const spec of [labSpec, radSpec]) {
      const staff = (
        await pool.query(
          `SELECT sm.*
             FROM activeclinic.staff_members sm
             JOIN platform.identities pi ON pi.id = sm.platform_identity_id
            WHERE sm.organization_id = $1
              AND lower(pi.primary_email) = lower($2)
            LIMIT 1`,
          [orgId, spec.email]
        )
      ).rows[0];
      assert.ok(staff, `missing demo ${spec.email}`);
      const identity = (
        await pool.query(`SELECT * FROM platform.identities WHERE id = $1`, [
          staff.platform_identity_id,
        ])
      ).rows[0];
      const eligibility = await evaluateStaffEligibility(pool, staff, identity);
      assert.equal(eligibility.ok, true, `${spec.email} ${eligibility.code}`);

      const facility = (
        await pool.query(
          `SELECT facility_id FROM activeclinic.staff_facility_assignments
            WHERE staff_member_id = $1
            ORDER BY is_primary DESC NULLS LAST
            LIMIT 1`,
          [staff.id]
        )
      ).rows[0];
      assert.ok(facility);
      const perms = await resolveEffectivePermissions(pool, {
        organizationId: orgId,
        staffMemberId: staff.id,
        platformIdentityId: identity.id,
        facilityId: facility.facility_id,
      });
      assert.equal(perms.ok, true);
      if (spec.key === "lab") {
        assert.ok(perms.permissions.includes(PERM.LAB_VIEW));
        assert.equal(perms.permissions.includes(PERM.RADIOLOGY_VIEW), false);
      } else {
        assert.ok(perms.permissions.includes(PERM.RADIOLOGY_VIEW));
        assert.equal(perms.permissions.includes(PERM.LAB_VIEW), false);
      }
    }
  });
});
