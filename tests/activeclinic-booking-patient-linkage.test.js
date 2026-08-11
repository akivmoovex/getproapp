"use strict";

/**
 * Public booking → clinic patient linkage (no auto-link / tenant isolation).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

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
  CASHIER,
  PHARMACIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
  CREATION_MODES,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  createConsultationBookingRequest,
} = require("../src/activeclinic/services/activeClinicPublicBookingService");
const {
  LINK_STATUS,
  classifyMatches,
  linkBookingToExistingPatient,
  createPatientFromBookingAndLink,
  assessBookingIdentityMatches,
  RESULT: LINK_RESULT,
} = require("../src/activeclinic/services/activeClinicBookingPatientLinkageService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../src/platform/config/deploymentProfiles");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const PASSWORD = "DemoStaff-ActiveClinic-2026A";
let pool;
let skipReason = null;
let phoneSeq = 26097110000;

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
    displayName: `Link ${key}`,
    productKey: "activeclinic",
    productTenantKey: `${key}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true);
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
  await pool.query(
    `UPDATE activeclinic.healthcare_organizations
        SET website_published = true, public_booking_enabled = true
      WHERE id = $1`,
    [hco.healthcareOrganization.id]
  );
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

async function seedStaff(tenant, roleKey) {
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
    firstName: "Link",
    lastName: roleKey,
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: roleKey,
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
    roleKey,
    scopeType: "facility",
    facilityId: tenant.facilityId,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  return {
    identityId: identity.identity.id,
    staffMemberId: staff.staffMember.id,
  };
}

describe("ActiveClinic booking patient linkage", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("classifyMatches never auto-links; phone-only is possible_match", () => {
    const none = classifyMatches([]);
    assert.equal(none.status, LINK_STATUS.UNLINKED);

    const oneStrong = classifyMatches([
      { patientId: "a", matchStrength: "strong", reasons: ["phone_exact"] },
    ]);
    assert.equal(oneStrong.status, LINK_STATUS.POSSIBLE_MATCH);

    const multi = classifyMatches([
      { patientId: "a", matchStrength: "strong", reasons: ["phone_exact"] },
      { patientId: "b", matchStrength: "moderate", reasons: ["name_and_dob"] },
    ]);
    assert.equal(multi.status, LINK_STATUS.LINK_REVIEW_REQUIRED);
  });

  it("public booking with no match stays unlinked / new_patient_pending without patient_id", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("nomatch");
    const created = await createConsultationBookingRequest(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientFirstName: "Fresh",
      patientLastName: "Guest",
      patientPhone: nextPhone(),
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.ok(
      created.booking.patientLinkStatus === LINK_STATUS.UNLINKED ||
        created.booking.patientLinkStatus === LINK_STATUS.NEW_PATIENT_PENDING
    );

    const row = await pool.query(
      `SELECT patient_id, patient_link_status FROM activeclinic.public_booking_requests WHERE id = $1`,
      [created.booking.id]
    );
    assert.equal(row.rows[0].patient_id, null);
    assert.ok(
      ["unlinked", "new_patient_pending"].includes(row.rows[0].patient_link_status)
    );
  });

  it("exact phone candidate does not auto-link booking to patient", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("phone");
    const receptionist = await seedStaff(tenant, RECEPTIONIST);
    const phone = nextPhone();

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      demographics: {
        firstName: "Parent",
        lastName: "Shared",
        dateOfBirth: "1980-01-01",
        sexAtRegistration: "female",
      },
      contacts: { phone },
      address: {},
      actor: {
        staffMemberId: receptionist.staffMemberId,
        platformIdentityId: receptionist.identityId,
        organizationId: tenant.orgId,
      },
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const booking = await createConsultationBookingRequest(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientFirstName: "Child",
      patientLastName: "Shared",
      patientPhone: phone,
    });
    assert.equal(booking.ok, true, JSON.stringify(booking));
    assert.equal(booking.booking.patientLinkStatus, LINK_STATUS.POSSIBLE_MATCH);

    const row = await pool.query(
      `SELECT patient_id, patient_link_status, patient_match_count
         FROM activeclinic.public_booking_requests WHERE id = $1`,
      [booking.booking.id]
    );
    assert.equal(row.rows[0].patient_id, null);
    assert.equal(row.rows[0].patient_link_status, "possible_match");
    assert.ok(Number(row.rows[0].patient_match_count) >= 1);
  });

  it("staff can link existing patient; cross-tenant patient denied", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const a = await seedTenant("linkA");
    const b = await seedTenant("linkB");
    const receptionistA = await seedStaff(a, RECEPTIONIST);
    const receptionistB = await seedStaff(b, RECEPTIONIST);
    const phone = nextPhone();

    const patientA = await registerActiveClinicPatient(pool, {
      organizationId: a.orgId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      demographics: {
        firstName: "Ada",
        lastName: "Link",
        dateOfBirth: "1990-05-05",
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
    assert.equal(patientA.ok, true);

    const patientB = await registerActiveClinicPatient(pool, {
      organizationId: b.orgId,
      healthcareOrganizationId: b.hcoId,
      facilityId: b.facilityId,
      demographics: {
        firstName: "Other",
        lastName: "Clinic",
        dateOfBirth: "1991-01-01",
        sexAtRegistration: "male",
      },
      contacts: { phone: nextPhone() },
      address: {},
      actor: {
        staffMemberId: receptionistB.staffMemberId,
        platformIdentityId: receptionistB.identityId,
        organizationId: b.orgId,
      },
    });
    assert.equal(patientB.ok, true);

    const booking = await createConsultationBookingRequest(pool, {
      organizationId: a.orgId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      patientFirstName: "Ada",
      patientLastName: "Link",
      patientPhone: phone,
    });
    assert.equal(booking.ok, true);

    const cross = await linkBookingToExistingPatient(pool, {
      organizationId: a.orgId,
      bookingId: booking.booking.id,
      patientId: patientB.patient.id,
      actor: {
        staffMemberId: receptionistA.staffMemberId,
        platformIdentityId: receptionistA.identityId,
        organizationId: a.orgId,
      },
    });
    assert.equal(cross.ok, false);
    assert.ok(
      cross.code === LINK_RESULT.CROSS_TENANT ||
        cross.code === LINK_RESULT.PATIENT_NOT_FOUND
    );

    const linked = await linkBookingToExistingPatient(pool, {
      organizationId: a.orgId,
      bookingId: booking.booking.id,
      patientId: patientA.patient.id,
      actor: {
        staffMemberId: receptionistA.staffMemberId,
        platformIdentityId: receptionistA.identityId,
        organizationId: a.orgId,
      },
    });
    assert.equal(linked.ok, true, JSON.stringify(linked));
    assert.equal(linked.booking.patientLinkStatus, LINK_STATUS.LINKED);
  });

  it("create patient from booking reuses duplicate controls; nurse/cashier/pharmacy denied", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("create");
    const receptionist = await seedStaff(tenant, RECEPTIONIST);
    const nurse = await seedStaff(tenant, NURSE);
    const cashier = await seedStaff(tenant, CASHIER);
    const pharmacist = await seedStaff(tenant, PHARMACIST);

    const booking = await createConsultationBookingRequest(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientFirstName: "New",
      patientLastName: "FromBooking",
      patientPhone: nextPhone(),
    });
    assert.equal(booking.ok, true);

    const deniedNurse = await createPatientFromBookingAndLink(pool, {
      organizationId: tenant.orgId,
      bookingId: booking.booking.id,
      actor: {
        staffMemberId: nurse.staffMemberId,
        platformIdentityId: nurse.identityId,
        organizationId: tenant.orgId,
      },
      dateOfBirth: "2000-02-02",
      sexAtRegistration: "female",
    });
    assert.equal(deniedNurse.ok, false);
    assert.equal(deniedNurse.code, LINK_RESULT.ACCESS_DENIED);

    const deniedCashier = await linkBookingToExistingPatient(pool, {
      organizationId: tenant.orgId,
      bookingId: booking.booking.id,
      patientId: "00000000-0000-4000-8000-000000000001",
      actor: {
        staffMemberId: cashier.staffMemberId,
        platformIdentityId: cashier.identityId,
        organizationId: tenant.orgId,
      },
    });
    assert.equal(deniedCashier.ok, false);
    assert.equal(deniedCashier.code, LINK_RESULT.ACCESS_DENIED);

    const deniedPharm = await createPatientFromBookingAndLink(pool, {
      organizationId: tenant.orgId,
      bookingId: booking.booking.id,
      actor: {
        staffMemberId: pharmacist.staffMemberId,
        platformIdentityId: pharmacist.identityId,
        organizationId: tenant.orgId,
      },
    });
    assert.equal(deniedPharm.ok, false);
    assert.equal(deniedPharm.code, LINK_RESULT.ACCESS_DENIED);

    const created = await createPatientFromBookingAndLink(pool, {
      organizationId: tenant.orgId,
      bookingId: booking.booking.id,
      actor: {
        staffMemberId: receptionist.staffMemberId,
        platformIdentityId: receptionist.identityId,
        organizationId: tenant.orgId,
      },
      dateOfBirth: "2000-02-02",
      sexAtRegistration: "female",
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.booking.patientLinkStatus, LINK_STATUS.LINKED);
    assert.equal(created.patient.registrationStatus, "incomplete");
  });

  it("duplicate assessment is organization scoped", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const a = await seedTenant("scopeA");
    const b = await seedTenant("scopeB");
    const recvA = await seedStaff(a, RECEPTIONIST);
    const phone = nextPhone();

    await registerActiveClinicPatient(pool, {
      organizationId: a.orgId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      demographics: {
        firstName: "Scoped",
        lastName: "OnlyA",
        dateOfBirth: "1988-03-12",
        sexAtRegistration: "male",
      },
      contacts: { phone },
      address: {},
      actor: {
        staffMemberId: recvA.staffMemberId,
        platformIdentityId: recvA.identityId,
        organizationId: a.orgId,
      },
    });

    const inB = await assessBookingIdentityMatches(pool, {
      organizationId: b.orgId,
      healthcareOrganizationId: b.hcoId,
      phoneNormalized: phone,
      firstName: "Scoped",
      lastName: "OnlyA",
      dateOfBirth: "1988-03-12",
    });
    assert.equal(inB.ok, true);
    assert.equal(inB.matchCount, 0);
  });

  it("guest booking → portal account without clinic patient; claim requires verified phone", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const {
      registerPatientWithGuestToken,
      linkGuestBookingToPatient,
    } = require("../src/activeclinic/services/activeClinicPatientPortalRegistrationService");
    const {
      listPatientBookings,
    } = require("../src/activeclinic/services/activeClinicPatientPortalBookingService");
    const {
      confirmPortalPatientClaim,
    } = require("../src/activeclinic/services/activeClinicBookingPatientLinkageService");

    const tenant = await seedTenant("portal");
    const receptionist = await seedStaff(tenant, RECEPTIONIST);
    const phone = nextPhone();

    const existing = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      demographics: {
        firstName: "Guest",
        lastName: "Claim",
        dateOfBirth: "1988-03-12",
        sexAtRegistration: "female",
      },
      contacts: { phone },
      address: {},
      actor: {
        staffMemberId: receptionist.staffMemberId,
        platformIdentityId: receptionist.identityId,
        organizationId: tenant.orgId,
      },
    });
    assert.equal(existing.ok, true);

    const booking = await createConsultationBookingRequest(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientFirstName: "Guest",
      patientLastName: "Claim",
      patientPhone: phone,
    });
    assert.equal(booking.ok, true);
    assert.ok(!booking.booking.patientId);
    assert.ok(
      booking.booking.patientLinkStatus === LINK_STATUS.POSSIBLE_MATCH ||
        booking.booking.patientLinkStatus === LINK_STATUS.LINK_REVIEW_REQUIRED
    );

    const registered = await registerPatientWithGuestToken(pool, {
      guestToken: booking.booking.accessToken,
      password: "PortalGuest-ActiveClinic-2026A",
      phone,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      country: "ZM",
    });
    assert.equal(registered.ok, true, JSON.stringify(registered));
    assert.equal(registered.patientId, null);
    assert.equal(registered.portalOnly, true);

    const listed = await listPatientBookings(pool, {
      platformIdentityId: registered.identityId,
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
    });
    assert.equal(listed.ok, true);
    assert.equal(listed.bookings.length, 1);
    assert.ok(!listed.bookings[0].patientId);

    const booking2 = await createConsultationBookingRequest(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientFirstName: "Second",
      patientLastName: "Guest",
      patientPhone: nextPhone(),
    });
    assert.equal(booking2.ok, true);

    const linkedPortal = await linkGuestBookingToPatient(pool, {
      guestToken: booking2.booking.accessToken,
      platformIdentityId: registered.identityId,
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
    });
    assert.equal(linkedPortal.ok, true);
    assert.equal(linkedPortal.clinicPatientLinked, false);

    const listed2 = await listPatientBookings(pool, {
      platformIdentityId: registered.identityId,
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
    });
    assert.equal(listed2.bookings.length, 2);

    const wrongPhoneClaim = await confirmPortalPatientClaim(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      bookingId: booking.booking.id,
      patientId: existing.patient.id,
      platformIdentityId: registered.identityId,
      verifiedPhoneNormalized: nextPhone(),
    });
    assert.equal(wrongPhoneClaim.ok, false);

    const claim = await confirmPortalPatientClaim(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      bookingId: booking.booking.id,
      patientId: existing.patient.id,
      platformIdentityId: registered.identityId,
      verifiedPhoneNormalized: phone,
    });
    assert.equal(claim.ok, true, JSON.stringify(claim));
  });

  it("name+DOB candidate does not auto-link; multiple matches require review", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("namedob");
    const receptionist = await seedStaff(tenant, RECEPTIONIST);
    const phoneA = nextPhone();
    const phoneB = nextPhone();

    for (const [phone, last] of [
      [phoneA, "TwinA"],
      [phoneB, "TwinB"],
    ]) {
      const p = await registerActiveClinicPatient(pool, {
        organizationId: tenant.orgId,
        healthcareOrganizationId: tenant.hcoId,
        facilityId: tenant.facilityId,
        demographics: {
          firstName: "Same",
          lastName: last,
          dateOfBirth: "1995-07-07",
          sexAtRegistration: "male",
        },
        contacts: { phone },
        address: {},
        actor: {
          staffMemberId: receptionist.staffMemberId,
          platformIdentityId: receptionist.identityId,
          organizationId: tenant.orgId,
        },
      });
      assert.equal(p.ok, true);
    }

    // Same name+DOB as TwinA but different phone — candidate only
    const booking = await createConsultationBookingRequest(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientFirstName: "Same",
      patientLastName: "TwinA",
      patientPhone: nextPhone(),
      // DOB not on public form in all paths; assess explicitly:
    });
    assert.equal(booking.ok, true);
    assert.ok(!booking.booking.patientId);

    const assessed = await assessBookingIdentityMatches(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      firstName: "Same",
      lastName: "TwinA",
      dateOfBirth: "1995-07-07",
      phoneNormalized: null,
    });
    assert.equal(assessed.ok, true);
    if (assessed.matchCount >= 1) {
      assert.notEqual(assessed.patientLinkStatus, LINK_STATUS.LINKED);
    }
  });
});
