"use strict";

/**
 * ActiveClinic V6 — patient identity and registration foundation (AC-V6-C01).
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
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
  assignStaffRole,
  RECEPTIONIST,
  FACILITY_ADMIN,
  ORGANIZATION_ADMIN,
  MEDICAL_RECORDS_OFFICER,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  registerActiveClinicPatient,
  updateActiveClinicPatient,
  setPatientStatus,
  searchActiveClinicPatients,
  resolvePatientForActor,
  addPatientIdentifier,
  listPatientIdentifiers,
  archivePatientIdentifier,
  addEmergencyContact,
  listEmergencyContacts,
  archiveEmergencyContact,
  mergeActiveClinicPatients,
  RESULT,
  PERM,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  findPotentialPatientDuplicates,
} = require("../src/activeclinic/services/activeClinicPatientDuplicateService");
const {
  generateActiveClinicPatientNumber,
  isValidPatientNumberFormat,
} = require("../src/activeclinic/services/generateActiveClinicPatientNumber");
const {
  maskPhone,
  maskIdentifier,
  toPatientSearchSummary,
} = require("../src/activeclinic/services/patientPrivacyHelpers");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

let pool;
let databaseUrl;
let skipReason = null;

async function provisionOrg(input) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    ...input,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

async function seedAcTenant(stamp, tag) {
  const org = await provisionOrg({
    organizationKey: `ac_pat_${tag}_${stamp}`,
    displayName: `AC Patient ${tag}`,
    productKey: "activeclinic",
    productTenantKey: `ac-pat-${tag}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: `Legal ${tag}`,
    publicName: `Public ${tag}`,
    organizationType: "faith_based_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `main-${tag}`.slice(0, 64),
    displayName: "Main Hospital",
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: "+260971111001",
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    facilityKey: facility.facility.facilityKey,
  };
}

async function seedSecondFacility(tenant, key) {
  const facility = await createFacility(pool, {
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    facilityKey: key,
    displayName: `Facility ${key}`,
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: "+260971111002",
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  return facility.facility;
}

async function seedNetworkActor(tenant, phone) {
  const staff = await createStaffMember(pool, {
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    firstName: "Net",
    lastName: "Admin",
    employmentType: "permanent",
    status: "active",
    phone,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: tenant.facilityId,
    isPrimary: true,
  });
  // Org admin (archive/audit) + receptionist (demographics) + medical records
  // (authoritative identifiers). Identifier writes are not granted to org admin.
  const orgRole = await assignStaffRole(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: ORGANIZATION_ADMIN,
    scopeType: "organisation",
  });
  assert.equal(orgRole.ok, true, JSON.stringify(orgRole));
  for (const roleKey of [RECEPTIONIST, MEDICAL_RECORDS_OFFICER]) {
    const role = await assignStaffRole(pool, {
      organizationId: tenant.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey,
      scopeType: "facility",
      facilityId: tenant.facilityId,
    });
    assert.equal(role.ok, true, JSON.stringify(role));
  }
  return {
    staffMemberId: staff.staffMember.id,
    organizationId: tenant.orgId,
  };
}

async function seedFacilityActor(tenant, facilityId, phone) {
  const staff = await createStaffMember(pool, {
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    firstName: "Fac",
    lastName: "Admin",
    employmentType: "permanent",
    status: "active",
    phone,
  });
  assert.equal(staff.ok, true);
  await assignStaffToFacility(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId,
    isPrimary: true,
  });
  // Facility admin (ops) + receptionist (patient writes) for facility-scoped patient tests.
  for (const roleKey of [FACILITY_ADMIN, RECEPTIONIST]) {
    const role = await assignStaffRole(pool, {
      organizationId: tenant.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey,
      scopeType: "facility",
      facilityId,
    });
    assert.equal(role.ok, true, JSON.stringify(role));
  }
  return {
    staffMemberId: staff.staffMember.id,
    organizationId: tenant.orgId,
  };
}

async function seedUnauthorizedStaff(tenant, phone) {
  const staff = await createStaffMember(pool, {
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    firstName: "Plain",
    lastName: "Staff",
    employmentType: "permanent",
    status: "active",
    phone,
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
    roleKey: STAFF_ROLE,
    scopeType: "organisation",
  });
  return {
    staffMemberId: staff.staffMember.id,
    organizationId: tenant.orgId,
  };
}

describe("ActiveClinic patient identity foundation (AC-V6-C01)", () => {
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

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) {
      assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
    }
  }

  it("schema: patient tables, constraints, and permissions exist", async () => {
    requireDb();
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'activeclinic'
          AND table_name IN (
            'patients', 'patient_identifiers', 'patient_registrations',
            'patient_facility_links', 'patient_emergency_contacts',
            'patient_number_counters'
          )
        ORDER BY table_name`
    );
    assert.equal(tables.rows.length, 6);

    const perms = await pool.query(
      `SELECT permission_key FROM blessboard.permissions
        WHERE permission_key LIKE 'activeclinic.patient.%'
        ORDER BY permission_key`
    );
    assert.ok(perms.rows.length >= 9);
    assert.ok(perms.rows.some((r) => r.permission_key === PERM.CREATE));
    assert.ok(perms.rows.some((r) => r.permission_key === "activeclinic.patient.merge"));

    const mergeGrant = await pool.query(
      `SELECT 1
         FROM blessboard.role_permissions rp
         JOIN blessboard.permissions p ON p.id = rp.permission_id
         JOIN blessboard.roles r ON r.id = rp.role_id
        WHERE p.permission_key = 'activeclinic.patient.merge'
          AND r.role_key LIKE 'activeclinic_%'
        LIMIT 1`
    );
    assert.equal(mergeGrant.rows.length, 0, "merge must remain unassigned");

    const staffGrant = await pool.query(
      `SELECT 1
         FROM blessboard.role_permissions rp
         JOIN blessboard.permissions p ON p.id = rp.permission_id
         JOIN blessboard.roles r ON r.id = rp.role_id
        WHERE r.role_key = 'activeclinic_staff'
          AND p.permission_key LIKE 'activeclinic.patient.%'
        LIMIT 1`
    );
    assert.equal(staffGrant.rows.length, 0, "staff role has no patient perms");
  });

  it("registers patients across required fixture shapes", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const tenant = await seedAcTenant(stamp, "reg");
    const other = await seedAcTenant(`${stamp}x`, "oth");
    const actor = await seedNetworkActor(tenant, "+260972000001");
    const unauthorized = await seedUnauthorizedStaff(tenant, "+260972000002");
    const facilityB = await seedSecondFacility(tenant, "clinic-b");
    await assignStaffToFacility(pool, {
      organizationId: tenant.orgId,
      staffMemberId: actor.staffMemberId,
      facilityId: facilityB.id,
    });
    // Least-privilege: patient.create is facility-scoped via receptionist — grant at B too.
    const receptionAtB = await assignStaffRole(pool, {
      organizationId: tenant.orgId,
      staffMemberId: actor.staffMemberId,
      roleKey: RECEPTIONIST,
      scopeType: "facility",
      facilityId: facilityB.id,
    });
    assert.equal(receptionAtB.ok, true, JSON.stringify(receptionAtB));

    const base = {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      registrationMethod: "walk_in",
    };

    const phoneOnly = await registerActiveClinicPatient(pool, {
      ...base,
      demographics: { firstName: "Phone", lastName: "Only" },
      contacts: { phone: "+260973000001" },
    });
    assert.equal(phoneOnly.ok, true, JSON.stringify(phoneOnly));
    assert.ok(isValidPatientNumberFormat(phoneOnly.patient.patientNumber));
    assert.match(phoneOnly.patient.patientNumber, /^AC-\d{4}-\d{6}$/);
    assert.equal(phoneOnly.patient.phoneNormalized, "+260973000001");

    const emailOnly = await registerActiveClinicPatient(pool, {
      ...base,
      demographics: { firstName: "Email", lastName: "Only" },
      contacts: { email: "email.only@example.test" },
    });
    assert.equal(emailOnly.ok, true, JSON.stringify(emailOnly));

    const noContact = await registerActiveClinicPatient(pool, {
      ...base,
      demographics: { firstName: "No", lastName: "Contact" },
      contacts: {},
    });
    assert.equal(noContact.ok, true, JSON.stringify(noContact));

    const withNationalId = await registerActiveClinicPatient(pool, {
      ...base,
      demographics: { firstName: "Nat", lastName: "Id", dateOfBirth: "1990-05-01" },
      identifiers: [
        {
          identifierType: "national_id",
          identifierValue: "ZM-123456/78/1",
          isPrimary: true,
          verificationStatus: "verified",
        },
      ],
    });
    assert.equal(withNationalId.ok, true, JSON.stringify(withNationalId));

    const withPassport = await registerActiveClinicPatient(pool, {
      ...base,
      demographics: { firstName: "Pass", lastName: "Port" },
      identifiers: [{ identifierType: "passport", identifierValue: "ZP1234567" }],
    });
    assert.equal(withPassport.ok, true);

    const noId = await registerActiveClinicPatient(pool, {
      ...base,
      demographics: { firstName: "No", lastName: "Identifier" },
    });
    assert.equal(noId.ok, true);

    const estimatedDob = await registerActiveClinicPatient(pool, {
      ...base,
      demographics: {
        firstName: "Est",
        lastName: "Dob",
        dateOfBirth: "1985-01-01",
        estimatedDateOfBirth: true,
      },
    });
    assert.equal(estimatedDob.ok, true);
    assert.equal(estimatedDob.patient.estimatedDateOfBirth, true);

    const withEmergency = await registerActiveClinicPatient(pool, {
      ...base,
      demographics: { firstName: "Has", lastName: "Emergency" },
      emergencyContacts: [
        {
          fullName: "Jane Contact",
          relationship: "spouse",
          phone: "+260973000099",
          isPrimary: true,
          consentToContact: true,
        },
      ],
    });
    assert.equal(withEmergency.ok, true, JSON.stringify(withEmergency));

    const multiFacility = await registerActiveClinicPatient(pool, {
      ...base,
      facilityId: facilityB.id,
      demographics: { firstName: "Multi", lastName: "Facility" },
    });
    assert.equal(multiFacility.ok, true);

    // Link multi-facility patient also to main (second association via registration at main).
    await pool.query(
      `INSERT INTO activeclinic.patient_facility_links (
         organization_id, healthcare_organization_id, patient_id, facility_id,
         relationship_type, status
       ) VALUES ($1,$2,$3,$4,'seen_at','active')`,
      [tenant.orgId, tenant.hcoId, multiFacility.patient.id, tenant.facilityId]
    );

    const otherHcoPatient = await registerActiveClinicPatient(pool, {
      organizationId: other.orgId,
      healthcareOrganizationId: other.hcoId,
      facilityId: other.facilityId,
      actor: await seedNetworkActor(other, "+260972000010"),
      demographics: { firstName: "Other", lastName: "HCO" },
      identifiers: [
        {
          identifierType: "national_id",
          identifierValue: "ZM-123456/78/1",
          verificationStatus: "verified",
        },
      ],
    });
    assert.equal(otherHcoPatient.ok, true, "same national ID allowed in other HCO");

    const denied = await registerActiveClinicPatient(pool, {
      ...base,
      actor: unauthorized,
      demographics: { firstName: "Denied", lastName: "Staff" },
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, RESULT.ACCESS_DENIED);

    // No platform identity created for patients.
    const identities = await pool.query(
      `SELECT COUNT(*)::int AS c FROM platform.identities i
        WHERE i.primary_email ILIKE '%phone.only%' OR i.primary_email ILIKE '%email.only%'`
    );
    assert.equal(identities.rows[0].c, 0);

    // Registration + facility link rows exist.
    const regs = await pool.query(
      `SELECT COUNT(*)::int AS c FROM activeclinic.patient_registrations
        WHERE patient_id = $1 AND is_initial = true`,
      [phoneOnly.patient.id]
    );
    assert.equal(regs.rows[0].c, 1);

    const futureDob = await registerActiveClinicPatient(pool, {
      ...base,
      demographics: {
        firstName: "Future",
        lastName: "Dob",
        dateOfBirth: "2099-01-01",
      },
    });
    assert.equal(futureDob.ok, false);
    assert.equal(futureDob.code, "date_of_birth_future");
  });

  it("patient numbers are unique, immutable, and concurrent-safe", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}n`;
    const tenant = await seedAcTenant(stamp, "num");
    const actor = await seedNetworkActor(tenant, "+260972000020");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const a = await generateActiveClinicPatientNumber(client, {
        healthcareOrganizationId: tenant.hcoId,
      });
      const b = await generateActiveClinicPatientNumber(client, {
        healthcareOrganizationId: tenant.hcoId,
      });
      await client.query("COMMIT");
      assert.notEqual(a, b);
      assert.ok(isValidPatientNumberFormat(a));
      assert.ok(!a.includes("-") || !/[0-9a-f]{8}-[0-9a-f]{4}/i.test(a));
    } finally {
      client.release();
    }

    const created = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Immutable", lastName: "Number" },
    });
    assert.equal(created.ok, true);
    await assert.rejects(
      () =>
        pool.query(
          `UPDATE activeclinic.patients SET patient_number = $1 WHERE id = $2`,
          ["AC-1999-999999", created.patient.id]
        ),
      /immutable/i
    );
  });

  it("duplicate detection, override audit, and no auto-merge", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}d`;
    const tenant = await seedAcTenant(stamp, "dup");
    const actor = await seedNetworkActor(tenant, "+260972000030");
    const base = {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
    };

    const original = await registerActiveClinicPatient(pool, {
      ...base,
      demographics: {
        firstName: "Dup",
        lastName: "Candidate",
        dateOfBirth: "1991-02-03",
      },
      contacts: { phone: "+260973000111" },
      identifiers: [
        {
          identifierType: "national_id",
          identifierValue: "NID-DUP-001",
          verificationStatus: "verified",
        },
      ],
    });
    assert.equal(original.ok, true, JSON.stringify(original));

    const strong = await registerActiveClinicPatient(pool, {
      ...base,
      demographics: { firstName: "Other", lastName: "Person" },
      identifiers: [
        { identifierType: "national_id", identifierValue: "NID-DUP-001" },
      ],
    });
    assert.equal(strong.ok, false);
    assert.ok(
      [RESULT.DUPLICATE_WARNING, RESULT.IDENTIFIER_CONFLICT].includes(strong.code),
      strong.code
    );

    const nameDob = await registerActiveClinicPatient(pool, {
      ...base,
      demographics: {
        firstName: "Dup",
        lastName: "Candidate",
        dateOfBirth: "1991-02-03",
      },
    });
    assert.equal(nameDob.ok, false);
    assert.equal(nameDob.code, RESULT.DUPLICATE_WARNING);
    assert.ok(nameDob.matches.some((m) => m.matchStrength === "moderate"));

    const nameOnly = await findPotentialPatientDuplicates(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      firstName: "Dup",
      lastName: "Candidate",
    });
    assert.equal(nameOnly.ok, true);
    assert.equal(nameOnly.blocking, false);
    assert.ok(nameOnly.matches.every((m) => m.matchStrength === "weak" || m.matchStrength === "moderate"));

    const override = await registerActiveClinicPatient(pool, {
      ...base,
      demographics: {
        firstName: "Dup",
        lastName: "Candidate",
        dateOfBirth: "1991-02-03",
      },
      contacts: { phone: "+260973000222" },
      duplicateOverride: true,
      duplicateOverrideReason: "confirmed_distinct_person",
    });
    assert.equal(override.ok, true, JSON.stringify(override));

    const audit = await pool.query(
      `SELECT action_key FROM platform.audit_events
        WHERE organization_id = $1
          AND action_key IN (
            'activeclinic.patient.duplicate_warning',
            'activeclinic.patient.duplicate_override'
          )`,
      [tenant.orgId]
    );
    assert.ok(audit.rows.some((r) => r.action_key.includes("duplicate_warning")));
    assert.ok(audit.rows.some((r) => r.action_key.includes("duplicate_override")));

    const merge = await mergeActiveClinicPatients();
    assert.equal(merge.ok, false);
    assert.equal(merge.code, "merge_deferred");
  });

  it("search is HCO scoped, facility scoped, minimized, and paginated", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}s`;
    const tenant = await seedAcTenant(stamp, "sea");
    const other = await seedAcTenant(`${stamp}o`, "seo");
    const network = await seedNetworkActor(tenant, "+260972000040");
    const facilityB = await seedSecondFacility(tenant, "site-b");
    await assignStaffToFacility(pool, {
      organizationId: tenant.orgId,
      staffMemberId: network.staffMemberId,
      facilityId: facilityB.id,
    });
    const receptionAtB = await assignStaffRole(pool, {
      organizationId: tenant.orgId,
      staffMemberId: network.staffMemberId,
      roleKey: RECEPTIONIST,
      scopeType: "facility",
      facilityId: facilityB.id,
    });
    assert.equal(receptionAtB.ok, true, JSON.stringify(receptionAtB));
    const facActor = await seedFacilityActor(tenant, tenant.facilityId, "+260972000041");
    const otherActor = await seedNetworkActor(other, "+260972000042");

    const p1 = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor: network,
      demographics: { firstName: "Search", lastName: "Alpha", dateOfBirth: "2000-01-15" },
      contacts: { phone: "+260973000301" },
    });
    assert.equal(p1.ok, true);

    const p2 = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: facilityB.id,
      actor: network,
      demographics: { firstName: "Search", lastName: "Beta" },
    });
    assert.equal(p2.ok, true);

    await registerActiveClinicPatient(pool, {
      organizationId: other.orgId,
      healthcareOrganizationId: other.hcoId,
      facilityId: other.facilityId,
      actor: otherActor,
      demographics: { firstName: "Search", lastName: "Alpha" },
    });

    const byNumber = await searchActiveClinicPatients(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      actor: network,
      patientNumber: p1.patient.patientNumber,
    });
    assert.equal(byNumber.ok, true);
    assert.equal(byNumber.results.length, 1);
    assert.equal(byNumber.results[0].patientNumber, p1.patient.patientNumber);
    assert.ok(byNumber.results[0].phoneMasked);
    assert.ok(!JSON.stringify(byNumber.results).includes("+260973000301"));

    const byName = await searchActiveClinicPatients(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      actor: network,
      nameQuery: "alp",
    });
    assert.equal(byName.ok, true);
    assert.ok(byName.results.some((r) => r.patientNumber === p1.patient.patientNumber));
    assert.ok(!byName.results.some((r) => r.displayName.includes("Other")));

    const short = await searchActiveClinicPatients(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      actor: network,
      nameQuery: "a",
    });
    assert.equal(short.ok, false);
    assert.equal(short.code, "query_too_short");

    const facScoped = await searchActiveClinicPatients(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      actor: facActor,
      facilityId: tenant.facilityId,
      nameQuery: "sea",
    });
    assert.equal(facScoped.ok, true);
    assert.ok(facScoped.results.some((r) => r.patientNumber === p1.patient.patientNumber));
    assert.ok(!facScoped.results.some((r) => r.patientNumber === p2.patient.patientNumber));

    const cross = await resolvePatientForActor(pool, {
      organizationId: other.orgId,
      healthcareOrganizationId: other.hcoId,
      patientId: p1.patient.id,
      actor: otherActor,
    });
    assert.equal(cross.ok, false);

    const page = await searchActiveClinicPatients(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      actor: network,
      nameQuery: "sea",
      limit: 1,
      offset: 0,
    });
    assert.equal(page.results.length, 1);
    assert.equal(page.limit, 1);

    const archived = await setPatientStatus(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      patientId: p1.patient.id,
      actor: network,
      status: "archived",
      reason: "duplicate_record",
    });
    assert.equal(archived.ok, true);
    const hideArchived = await searchActiveClinicPatients(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      actor: network,
      patientNumber: p1.patient.patientNumber,
    });
    assert.equal(hideArchived.results.length, 0);

    const deceased = await setPatientStatus(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      patientId: p2.patient.id,
      actor: network,
      status: "deceased",
      deceasedAt: new Date(),
    });
    assert.equal(deceased.ok, true);
    assert.equal(deceased.patient.status, "deceased");
  });

  it("identifiers and emergency contacts enforce scope and masking", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}i`;
    const tenant = await seedAcTenant(stamp, "idn");
    const actor = await seedNetworkActor(tenant, "+260972000050");
    const created = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Id", lastName: "Case" },
    });
    assert.equal(created.ok, true);

    const added = await addPatientIdentifier(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      patientId: created.patient.id,
      actor,
      identifierType: "passport",
      identifierValue: "AB998877",
      isPrimary: true,
    });
    assert.equal(added.ok, true, JSON.stringify(added));
    assert.equal(added.identifier.identifierMasked.slice(-4), "8877");

    const listed = await listPatientIdentifiers(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      patientId: created.patient.id,
      actor,
    });
    assert.equal(listed.ok, true);
    assert.equal(listed.identifiers.length, 1);

    const conflict = await addPatientIdentifier(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      patientId: created.patient.id,
      actor,
      identifierType: "passport",
      identifierValue: "AB998877",
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, RESULT.IDENTIFIER_CONFLICT);

    const archivedId = await archivePatientIdentifier(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      identifierId: added.identifier.id,
      actor,
    });
    assert.equal(archivedId.ok, true);
    assert.equal(archivedId.identifier.status, "archived");

    const ec = await addEmergencyContact(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      patientId: created.patient.id,
      actor,
      fullName: "Guardian Adjacent",
      relationship: "parent",
      phone: "+260973000555",
      isPrimary: true,
    });
    assert.equal(ec.ok, true, JSON.stringify(ec));
    assert.ok(ec.contact.phoneMasked);

    const contacts = await listEmergencyContacts(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      patientId: created.patient.id,
      actor,
    });
    assert.equal(contacts.ok, true);
    assert.equal(contacts.contacts.length, 1);

    const archivedEc = await archiveEmergencyContact(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      contactId: ec.contact.id,
      actor,
    });
    assert.equal(archivedEc.ok, true);

    const summary = toPatientSearchSummary(created.patient);
    assert.equal(summary.phoneMasked, null);
    assert.ok(!Object.prototype.hasOwnProperty.call(summary, "addressLine1"));
    assert.equal(maskPhone("+260973000555"), "+260***55");
    assert.ok(maskIdentifier("AB998877").endsWith("8877"));
  });

  it("updates normalize contacts, deny ownership/number changes, audit status", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}u`;
    const tenant = await seedAcTenant(stamp, "upd");
    const other = await seedAcTenant(`${stamp}o`, "upo");
    const actor = await seedNetworkActor(tenant, "+260972000060");
    const otherActor = await seedNetworkActor(other, "+260972000061");

    const created = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Up", lastName: "Date" },
    });
    assert.equal(created.ok, true);
    const number = created.patient.patientNumber;

    const updated = await updateActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      patientId: created.patient.id,
      actor,
      contacts: { phone: "+260973000777", email: "up.date@example.test" },
      demographics: { firstName: "Updated", lastName: "Date", sexAtRegistration: "female" },
    });
    assert.equal(updated.ok, true, JSON.stringify(updated));
    assert.equal(updated.patient.patientNumber, number);
    assert.equal(updated.patient.phoneNormalized, "+260973000777");
    assert.equal(updated.patient.emailNormalized, "up.date@example.test");
    assert.equal(updated.patient.firstName, "Updated");

    const cross = await updateActiveClinicPatient(pool, {
      organizationId: other.orgId,
      healthcareOrganizationId: other.hcoId,
      patientId: created.patient.id,
      actor: otherActor,
      demographics: { firstName: "Hack", lastName: "Attempt" },
    });
    assert.equal(cross.ok, false);

    await assert.rejects(
      () =>
        pool.query(
          `UPDATE activeclinic.patients
              SET organization_id = $1
            WHERE id = $2`,
          [other.orgId, created.patient.id]
        ),
      /immutable|ownership|foreign key|enrolment/i
    );
  });

  it("transaction rolls back when identifier conflicts mid-registration", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t`;
    const tenant = await seedAcTenant(stamp, "txn");
    const actor = await seedNetworkActor(tenant, "+260972000070");

    const first = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "First", lastName: "Idn" },
      identifiers: [{ identifierType: "national_id", identifierValue: "TXN-LOCK-1" }],
    });
    assert.equal(first.ok, true);

    const before = await pool.query(
      `SELECT COUNT(*)::int AS c FROM activeclinic.patients
        WHERE healthcare_organization_id = $1 AND first_name = 'Second'`,
      [tenant.hcoId]
    );

    const second = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Second", lastName: "Idn" },
      identifiers: [{ identifierType: "national_id", identifierValue: "TXN-LOCK-1" }],
    });
    assert.equal(second.ok, false);

    const after = await pool.query(
      `SELECT COUNT(*)::int AS c FROM activeclinic.patients
        WHERE healthcare_organization_id = $1 AND first_name = 'Second'`,
      [tenant.hcoId]
    );
    assert.equal(after.rows[0].c, before.rows[0].c);
  });
});
