"use strict";

/**
 * Deterministic synthetic fixtures for a future disposable V13 database.
 * apply* functions refuse to run unless both write flags are set and the
 * connection string passes the local disposable-database guard.
 */

const { dbWritesAuthorized } = require("../helpers/v13DbWriteGate");
const {
  assertV13CiDatabaseUrl,
  assertV13CiEnvironmentIdentity,
} = require("../helpers/v13CiDatabaseGuard");
const { assertIsolatedBootstrapLaunch } = require("../helpers/v13IsolatedExecutionPlan");

const SYNTHETIC_PASSWORD = "V13-synthetic-qa-password";
let httpChurchSerial = 0;
let httpClinicSerial = 0;
const DEPLOYMENT_CODE = "moovex-platform-testing";

function fixtureSuffix() {
  const suffix = String(process.env.GETPRO_V13_HTTP_FIXTURE_SUFFIX || "").toLowerCase();
  return /^[a-z0-9]{6,16}$/.test(suffix) ? suffix : "";
}

function scopedKey(key) {
  const suffix = fixtureSuffix();
  return suffix ? `${key}-${suffix}` : key;
}

function scopedEmail(email) {
  const suffix = fixtureSuffix();
  if (!suffix) return email;
  const at = String(email).indexOf("@");
  if (at < 1) return email;
  return `${email.slice(0, at)}+${suffix}${email.slice(at)}`;
}

function scopedPhone(phone) {
  const suffix = fixtureSuffix();
  if (!suffix || !phone) return phone;
  let mixed = 0;
  for (const ch of suffix) mixed = (mixed * 33 + ch.charCodeAt(0)) % 1000;
  const original = Number(String(phone).slice(-3)) || 0;
  return String(phone).replace(/(\d{3})$/, String((mixed + original) % 1000).padStart(3, "0"));
}

function churchPlan(suffix, displayName) {
  const key = scopedKey(`v13d19-${suffix}`);
  const phoneNational = scopedPhone(suffix === "church-a" ? "977000111" : "977000112");
  const label = fixtureSuffix() ? `${displayName} ${fixtureSuffix()}` : displayName;
  return {
    key,
    tenant: {
      organizationKey: key,
      displayName: label,
      legalName: displayName,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: key,
      deploymentCode: DEPLOYMENT_CODE,
      skipDomain: true,
      skipDefaultSubscription: fixtureSuffix() ? false : true,
    },
    church: {
      organizationKey: key,
      churchKey: key,
      displayName: label,
      legalName: label,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "Headquarters",
      timezone: "Africa/Lusaka",
      countryCode: "ZM",
    },
    admin: {
      email: scopedEmail(`admin-${suffix}@v13d19.example`),
      displayName: `${displayName} Admin`,
      roleKey: "church_system_administrator",
    },
    member: {
      fullName: `${displayName} Member`,
      email: scopedEmail(`member-${suffix}@v13d19.example`),
      phone: `+260${phoneNational}`,
      phoneCountry: "ZM",
      phoneNational,
      dateOfBirth: "1990-01-15",
    },
    staffInvite: {
      email: scopedEmail(`staff-${suffix}@v13d19.example`),
      displayName: `${displayName} Staff`,
      roleKey: "ministry_leader",
    },
  };
}

function buildBlessBoardFixturePlan() {
  return {
    product: "blessboard",
    synthetic: true,
    password: SYNTHETIC_PASSWORD,
    deploymentCode: DEPLOYMENT_CODE,
    churches: [
      churchPlan("church-a", "V13 D19 Church A"),
      churchPlan("church-b", "V13 D19 Church B"),
    ],
  };
}

function buildActiveClinicFixturePlan() {
  return {
    product: "activeclinic",
    synthetic: true,
    password: SYNTHETIC_PASSWORD,
    deploymentCode: DEPLOYMENT_CODE,
    clinics: [
      {
        key: scopedKey("v13d19-clinic-a"),
        clinicName: "V13 D19 Clinic A",
        facilityName: "V13 D19 Facility A",
        adminEmail: scopedEmail("admin-a@v13d19.example"),
        staffEmail: scopedEmail("staff-a@v13d19.example"),
        receptionistEmail: scopedEmail("reception-a@v13d19.example"),
      },
      {
        key: scopedKey("v13d19-clinic-b"),
        clinicName: "V13 D19 Clinic B",
        facilityName: "V13 D19 Facility B",
        adminEmail: scopedEmail("admin-b@v13d19.example"),
        staffEmail: scopedEmail("staff-b@v13d19.example"),
        receptionistEmail: scopedEmail("reception-b@v13d19.example"),
      },
    ],
    patient: {
      firstName: "Pat",
      lastName: "Ient",
      phone: scopedPhone("+260977000222"),
      email: scopedEmail("patient-a@v13d19.example"),
    },
    service: {
      serviceKey: "v13d19-consult",
      displayName: "V13 D19 Consultation",
      defaultDurationMinutes: 30,
      requiresAssignedStaff: true,
    },
    slot: {
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-01T09:30:00.000Z",
      timezone: "Africa/Lusaka",
    },
    denial: {
      roleKey: "activeclinic_receptionist",
      route: "/app/billing",
      permission: "activeclinic.billing.view",
    },
  };
}

function buildAc05EvidencePlan() {
  return {
    product: "activeclinic",
    synthetic: true,
    persisted: false,
    middleware: ["requireApex", "requirePlatformAdmin"],
    routes: {
      shell: { method: "GET", path: "/admin" },
      page: { method: "GET", path: "/admin/settings/test-database" },
      preview: { method: "GET", path: "/admin/settings/test-database/preview" },
    },
    administrator: {
      email: "platform-admin@v13d19.example",
      userId: "11111111-1111-4111-8111-111111111111",
      roleKey: "platform_administrator",
      scopeType: "platform",
    },
    lowerPrivilege: {
      email: "tenant-reader@v13d19.example",
      userId: "22222222-2222-4222-8222-222222222222",
      roleKey: null,
      scopeType: null,
    },
    refusedAssignment: {
      roleKey: "organisation_administrator",
      organizationKey: "v13d19-clinic-a",
      churchKey: null,
      expected: "invalid_input:church_hq_admin_scope",
    },
    facilityDimension: "none",
  };
}

function buildAppointmentConcurrencyPlan() {
  return {
    product: "activeclinic",
    synthetic: true,
    persisted: false,
    capacity: null,
    slot: {
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-01T09:30:00.000Z",
      timezone: "Africa/Lusaka",
    },
    clinics: [
      { key: "v13d19-clinic-a", facilityName: "V13 D19 Facility A" },
      { key: "v13d19-clinic-b", facilityName: "V13 D19 Facility B" },
    ],
    staffMemberId: "abababab-abab-4aba-8aba-abababababab",
    existingConflict: "assigned_staff_overlap",
    missingProtection: "assigned_staff_non_overlap",
  };
}

function buildV213RegressionFixturePlan() {
  const churchA = scopedKey("v13d19-church-a");
  const churchB = scopedKey("v13d19-church-b");
  const clinicA = scopedKey("v13d19-clinic-a");
  const clinicB = scopedKey("v13d19-clinic-b");
  const facilityA = "v13d19-facility-a";
  const facilityB = "v13d19-facility-b";
  return {
    synthetic: true,
    persisted: false,
    createsDatabaseRecords: false,
    requestedDatabaseName: "getpro_v13_e2e_regression213101",
    blessboard: {
      church: { key: churchA, displayName: "V13 D19 Church A" },
      otherChurch: { key: churchB, displayName: "V13 D19 Church B" },
      branch: { key: "hq", displayName: "Headquarters", churchKey: churchA },
      administrator: {
        email: scopedEmail("admin-church-a@v13d19.example"),
        roleKey: "church_hq_admin",
        churchKey: churchA,
      },
      member: {
        email: scopedEmail("member-church-a@v13d19.example"),
        phoneNational: scopedPhone("977000111"),
        churchKey: churchA,
        otpProvider: "test",
        otpDelivery: "peekTestCode",
        exposeCodeOnPage: false,
      },
      invitation: {
        email: "member-church-a@v13d19.example",
        churchKey: churchA,
        delivery: "testing-only",
        tokenExposed: false,
      },
      staffInvite: {
        email: scopedEmail("staff-church-a@v13d19.example"),
        roleKey: "ministry_leader",
        churchKey: churchA,
        tokenExposed: false,
      },
      theme: { key: "bb.community", churchKey: churchA },
      websiteSection: { pageKey: "home", sectionKey: "welcome", churchKey: churchA },
      publicHost: `${churchA}.local.test`,
      otherPublicHost: `${churchB}.local.test`,
      sermon: { title: "V13 regression sermon", status: "draft", churchKey: churchA },
      event: { title: "V13 regression event", status: "draft", churchKey: churchA },
      announcement: {
        title: "V13 regression announcement",
        status: "draft",
        attachment: "testing-only-png",
        churchKey: churchA,
      },
      publicRoutes: {
        home: "/",
        announcements: "/announcements",
        sermons: "/sermons",
        events: "/events",
      },
    },
    activeclinic: {
      publicBookingEnabled: false,
      coupon: null,
      clinic: {
        key: clinicA,
        displayName: fixtureSuffix() ? `V13 D19 Clinic A ${fixtureSuffix()}` : "V13 D19 Clinic A",
        facilityKey: facilityA,
      },
      otherClinic: {
        key: clinicB,
        displayName: fixtureSuffix() ? `V13 D19 Clinic B ${fixtureSuffix()}` : "V13 D19 Clinic B",
        facilityKey: facilityB,
      },
      staff: { email: scopedEmail("staff-a@v13d19.example"), clinicKey: clinicA },
      receptionist: {
        email: scopedEmail("reception-a@v13d19.example"),
        clinicKey: clinicA,
        facilityKey: facilityA,
        departmentKey: "reception",
        roleKey: "activeclinic_receptionist",
        scopeType: "facility",
      },
      clinician: {
        email: scopedEmail("clinical-a@v13d19.example"),
        clinicKey: clinicA,
        facilityKey: facilityA,
        departmentKey: "opd",
        roleKey: "activeclinic_clinician",
        scopeType: "facility",
      },
      patient: { email: scopedEmail("patient-a@v13d19.example"), clinicKey: clinicA },
      departments: [
        { key: "reception", type: "reception", name: "Reception", clinicKey: clinicA, facilityKey: facilityA },
        { key: "opd", type: "opd", name: "OPD", clinicKey: clinicA, facilityKey: facilityA },
      ],
      clinicalDepartment: { key: "opd", type: "opd", name: "OPD", clinicKey: clinicA },
      walkInService: {
        serviceKey: "v13d19-consult",
        displayName: "V13 D19 Consultation",
        clinicKey: clinicA,
        facilityKey: facilityA,
        servicePointRequired: true,
      },
      servicePoint: {
        servicePointKey: "v13d19-walk-in",
        displayName: "V13 D19 Walk-in",
        serviceType: "general",
        acceptsWalkIn: true,
        acceptsScheduled: false,
        clinicKey: clinicA,
        facilityKey: facilityA,
      },
      theme: { key: "ac.family-wellness-mint", clinicKey: clinicA },
      websiteSection: { pageKey: "home", sectionKey: "welcome", clinicKey: clinicA },
      recovery: { channel: "testing-outbox", liveEmail: false, clinicKey: clinicA },
      publicRoutes: {
        book: "/clinics/:key/book",
        register: "/clinics/:key/patient/register",
      },
    },
  };
}

function buildBlessBoardWebsiteSectionFixture(input) {
  const source = input && typeof input === "object" ? input : {};
  const churchId = source.churchId == null ? "" : String(source.churchId).trim();
  const organizationId = source.organizationId == null ? "" : String(source.organizationId).trim();
  if (!churchId || churchId.toLowerCase() === "null") {
    const error = new Error("V13_FIXTURE: BlessBoard website section requires a church id");
    error.code = "V13_FIXTURE_CHURCH_REQUIRED";
    throw error;
  }
  if (!organizationId) {
    const error = new Error("V13_FIXTURE: BlessBoard website section requires its organization");
    error.code = "V13_FIXTURE_ORGANIZATION_REQUIRED";
    throw error;
  }
  if (source.ownerChurchId != null && String(source.ownerChurchId).trim() !== churchId) {
    const error = new Error("V13_FIXTURE: website section church does not match the owning church");
    error.code = "V13_FIXTURE_CHURCH_MISMATCH";
    throw error;
  }
  if (source.otherChurchId != null && String(source.otherChurchId).trim() === churchId) {
    const error = new Error("V13_FIXTURE: website section must stay on its own church");
    error.code = "V13_FIXTURE_CROSS_CHURCH";
    throw error;
  }
  return {
    action: "add",
    productCode: "blessboard",
    organizationId,
    churchId,
    branchId:
      source.branchId == null || String(source.branchId).trim() === ""
        ? null
        : String(source.branchId).trim(),
    pageKey: source.pageKey || "home",
    type: "plain_text",
    heading: source.heading || "V13 draft welcome",
    bodyText: source.bodyText || "Synthetic draft section",
    published: false,
  };
}

/**
 * Product contract for an existing clinic login. A matching password on another
 * clinic reuses the identity and creates the new clinic. A mismatch does not.
 * This does not change registration policy.
 */
function classifyClinicCredentialReuse(input) {
  const source = input && typeof input === "object" ? input : {};
  const sameEmail = source.sameEmail === true;
  const passwordMatched = source.passwordMatched === true;
  const sameClinic = source.sameClinic === true;
  if (sameEmail && !passwordMatched) {
    return { classification: "REJECTED_PASSWORD_MISMATCH", clinicCreated: false };
  }
  if (sameEmail && passwordMatched && sameClinic) {
    return { classification: "ALREADY_PROVISIONED", clinicCreated: false };
  }
  if (sameEmail && passwordMatched && !sameClinic) {
    return { classification: "EXPECTED_MULTI_CLINIC_REUSE", clinicCreated: true };
  }
  return { classification: "FRESH_IDENTITY", clinicCreated: true };
}

function assertSyntheticPlan(plan) {
  if (!plan || plan.synthetic !== true) {
    throw new Error("V13_FIXTURE: plan is not marked synthetic");
  }
  if (plan.password === "1234" || /sk_live|AKIA|BEGIN PRIVATE KEY/i.test(plan.password)) {
    throw new Error("V13_FIXTURE: refusing a real or fixed OTP secret");
  }
  const blob = JSON.stringify(plan);
  if (/blessboard\.com|pronline\.org|hostinger|amazonaws\.com/i.test(blob)) {
    throw new Error("V13_FIXTURE: plan contains a production host");
  }
  return plan;
}

function assertApplyPermitted(connectionString, env) {
  if (!dbWritesAuthorized(env)) {
    const error = new Error("V13_FIXTURE_HOLD: database apply is not authorized");
    error.code = "V13_FIXTURE_HOLD";
    throw error;
  }
  assertV13CiDatabaseUrl(connectionString);
  assertV13CiEnvironmentIdentity(env);
  const source = env || {};
  if (String(source.E2E_DATABASE_URL || "") !== String(connectionString || "")) {
    throw new Error("V13_FIXTURE: fixture URL must be the isolated E2E_DATABASE_URL");
  }
  assertIsolatedBootstrapLaunch(source);
}

async function applyBlessBoardFixtures(db, connectionString, env) {
  assertApplyPermitted(connectionString, env);
  const plan = assertSyntheticPlan(buildBlessBoardFixturePlan());
  const { provisionPlatformTenant } = require("../../../src/platform/services/provisionPlatformTenant");
  const { provisionBlessBoardChurch } = require("../../../src/blessboard/services/provisionBlessBoardChurch");
  const authRepo = require("../../../src/blessboard/repositories/blessBoardAuthRepository");
  const { assignBlessBoardRole } = require("../../../src/blessboard/services/assignBlessBoardRole");
  const bcrypt = require("bcryptjs");
  const passwordHash = await bcrypt.hash(plan.password, 12);
  const created = [];
  for (const source of plan.churches) {
    httpChurchSerial += 1;
    const serial = httpChurchSerial;
    const church = fixtureSuffix()
      ? {
          ...source,
          key: `${source.key}-r${serial}`,
          tenant: {
            ...source.tenant,
            organizationKey: `${source.key}-r${serial}`,
            productTenantKey: `${source.key}-r${serial}`,
            displayName: `${source.tenant.displayName} ${serial}`,
          },
          church: {
            ...source.church,
            organizationKey: `${source.key}-r${serial}`,
            churchKey: `${source.key}-r${serial}`,
            displayName: `${source.church.displayName} ${serial}`,
            legalName: `${source.church.legalName} ${serial}`,
          },
          admin: {
            ...source.admin,
            email: source.admin.email.replace("@", `+r${serial}@`),
          },
        }
      : source;
    const tenant = await provisionPlatformTenant(db, church.tenant);
    if (!tenant.ok) {
      throw new Error(`tenant ${church.key}: ${tenant.status || ""} ${tenant.message || ""}`);
    }
    const provisioned = await provisionBlessBoardChurch(db, church.church);
    if (!provisioned.ok) {
      throw new Error(`church ${church.key}: ${provisioned.status || ""} ${provisioned.message || ""}`);
    }
    const existingUser = await authRepo.findUserByEmail(db, church.admin.email);
    const user = existingUser || await authRepo.insertUser(db, {
      emailNormalized: church.admin.email,
      emailDisplay: church.admin.email,
      passwordHash,
      displayName: church.admin.displayName,
      status: "active",
    });
    const role = await assignBlessBoardRole(
      db,
      {
        userId: user.id,
        email: church.admin.email,
        organizationKey: church.tenant.organizationKey,
        roleKey: church.admin.roleKey,
        churchKey: church.church.churchKey,
      },
      { env: env || process.env }
    );
    if (!role.ok) {
      throw new Error(`role ${church.key}: ${role.status || ""} ${role.message || ""}`);
    }
    created.push({
      key: source.key,
      organizationId: provisioned.records.organization.id,
      churchId: provisioned.records.church.id,
      branchId: provisioned.records.hqBranch.id,
      adminUserId: user.id,
      adminEmail: church.admin.email,
    });
  }
  return { plan, created };
}

function buildRegressionClinicOperationsPlan() {
  const source = buildV213RegressionFixturePlan();
  const ac = source.activeclinic;
  return {
    synthetic: true,
    persisted: false,
    publicBookingEnabled: false,
    coupon: null,
    clinics: [
      {
        key: ac.clinic.key,
        displayName: ac.clinic.displayName,
        facilityKey: ac.clinic.facilityKey,
        adminEmail: scopedEmail("admin-a@v13d19.example"),
        adminPhone: scopedPhone("+260977100001"),
        receptionist: { ...ac.receptionist, phone: scopedPhone("+260977100002") },
        clinician: { ...ac.clinician, phone: scopedPhone("+260977100003") },
        departments: ac.departments,
        servicePoint: ac.servicePoint,
        walkInService: ac.walkInService,
      },
      {
        key: ac.otherClinic.key,
        displayName: ac.otherClinic.displayName,
        facilityKey: ac.otherClinic.facilityKey,
        adminEmail: scopedEmail("admin-b@v13d19.example"),
        adminPhone: scopedPhone("+260977200001"),
        receptionist: {
          email: scopedEmail("reception-b@v13d19.example"),
          phone: scopedPhone("+260977200002"),
          clinicKey: ac.otherClinic.key,
          facilityKey: ac.otherClinic.facilityKey,
          departmentKey: "reception",
          roleKey: "activeclinic_receptionist",
          scopeType: "facility",
        },
        clinician: {
          email: scopedEmail("clinical-b@v13d19.example"),
          phone: scopedPhone("+260977200003"),
          clinicKey: ac.otherClinic.key,
          facilityKey: ac.otherClinic.facilityKey,
          departmentKey: "opd",
          roleKey: "activeclinic_clinician",
          scopeType: "facility",
        },
        departments: [
          { key: "reception", type: "reception", name: "Reception", clinicKey: ac.otherClinic.key, facilityKey: ac.otherClinic.facilityKey },
          { key: "opd", type: "opd", name: "OPD", clinicKey: ac.otherClinic.key, facilityKey: ac.otherClinic.facilityKey },
        ],
        servicePoint: {
          servicePointKey: "v13d19-walk-in-b",
          displayName: "V13 D19 Walk-in B",
          serviceType: "general",
          acceptsWalkIn: true,
          clinicKey: ac.otherClinic.key,
          facilityKey: ac.otherClinic.facilityKey,
        },
        walkInService: {
          serviceKey: "v13d19-consult-b",
          displayName: "V13 D19 Consultation B",
          clinicKey: ac.otherClinic.key,
          facilityKey: ac.otherClinic.facilityKey,
          servicePointRequired: true,
        },
      },
    ],
  };
}

function assertRegressionClinicOperationsPlan(plan) {
  if (!plan || plan.publicBookingEnabled !== false || plan.coupon != null) {
    throw new Error("V13_FIXTURE: public booking must stay disabled and coupons stay deferred");
  }
  if (!Array.isArray(plan.clinics) || plan.clinics.length < 2) {
    throw new Error("V13_FIXTURE: two isolated clinics are required");
  }
  const [primary, other] = plan.clinics;
  if (primary.key === other.key || primary.facilityKey === other.facilityKey) {
    throw new Error("V13_FIXTURE: clinics must not share a facility");
  }
  for (const clinic of plan.clinics) {
    if (!clinic.receptionist || clinic.receptionist.roleKey !== "activeclinic_receptionist") {
      throw new Error("V13_FIXTURE: receptionist role is missing");
    }
    if (clinic.receptionist.departmentKey !== "reception" || clinic.receptionist.facilityKey !== clinic.facilityKey) {
      throw new Error("V13_FIXTURE: receptionist department membership is missing");
    }
    if (!clinic.clinician || clinic.clinician.roleKey !== "activeclinic_clinician") {
      throw new Error("V13_FIXTURE: clinical staff role is missing");
    }
    if (clinic.clinician.departmentKey !== "opd" || clinic.clinician.facilityKey !== clinic.facilityKey) {
      throw new Error("V13_FIXTURE: clinical department membership is missing");
    }
    const departmentKeys = (clinic.departments || []).map((row) => row.key);
    if (!departmentKeys.includes("reception") || !departmentKeys.includes("opd")) {
      throw new Error("V13_FIXTURE: reception and clinical departments are required");
    }
    if (
      !clinic.servicePoint ||
      clinic.servicePoint.acceptsWalkIn !== true ||
      clinic.servicePoint.facilityKey !== clinic.facilityKey ||
      !clinic.servicePoint.servicePointKey
    ) {
      throw new Error("V13_FIXTURE: walk-in service point is missing");
    }
    if (!clinic.walkInService || clinic.walkInService.servicePointRequired !== true) {
      throw new Error("V13_FIXTURE: walk-in service is missing");
    }
  }
  if (primary.servicePoint.servicePointKey === other.servicePoint.servicePointKey) {
    throw new Error("V13_FIXTURE: service points must not be shared across clinics");
  }
  return plan;
}

function staffName(email) {
  const local = String(email || "staff").split("@")[0];
  return {
    firstName: local.slice(0, 40) || "Staff",
    lastName: "V13",
  };
}

async function requireDisabledBooking(db, organizationId, healthcareOrganizationId) {
  const booking = await db.query(
    `SELECT public_booking_enabled
       FROM activeclinic.healthcare_organizations
      WHERE id = $1 AND organization_id = $2`,
    [healthcareOrganizationId, organizationId]
  );
  if (!booking.rows.length || booking.rows[0].public_booking_enabled === true) {
    throw new Error("V13_FIXTURE: public booking must stay disabled");
  }
}

async function ensureStaffLoginIdentity(db, person) {
  if (!person || !person.password) return null;
  const bcrypt = require("bcryptjs");
  const { createPlatformIdentity } = require("../../../src/platform/services/platformIdentityService");
  const passwordHash = await bcrypt.hash(String(person.password), 12);
  const created = await createPlatformIdentity(db, {
    status: "active",
    primaryEmail: person.email,
    passwordHash,
    emailVerifiedAt: new Date().toISOString(),
  });
  if (created.ok && created.identity) return created.identity.id;
  if (created.existingIdentityId) return created.existingIdentityId;
  throw new Error(`V13_FIXTURE: staff login identity was not created (${created.code || "failed"})`);
}

async function provisionFacilityStaff(db, input, person, roleKey) {
  const { createStaffMember } = require("../../../src/activeclinic/services/activeClinicStaffService");
  const { assignStaffToFacility } = require("../../../src/activeclinic/services/activeClinicStaffFacilityService");
  const { assignStaffRole } = require("../../../src/activeclinic/services/activeClinicAuthorizationService");
  const name = staffName(person.email);
  const platformIdentityId = await ensureStaffLoginIdentity(db, person);
  const staff = await createStaffMember(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    platformIdentityId,
    firstName: name.firstName,
    lastName: name.lastName,
    displayName: person.email,
    email: person.email,
    phone: person.phone,
    employmentType: "permanent",
    status: "active",
  });
  if (!staff.ok) {
    throw new Error(`V13_FIXTURE: staff ${person.email} was not created (${staff.code || "failed"})`);
  }
  const facility = await assignStaffToFacility(db, {
    organizationId: input.organizationId,
    staffMemberId: staff.staffMember.id,
    facilityId: input.facilityId,
    isPrimary: true,
  });
  if (!facility.ok && facility.code !== "facility_assignment_exists") {
    throw new Error(`V13_FIXTURE: facility assignment failed (${facility.code || "failed"})`);
  }
  const role = await assignStaffRole(db, {
    organizationId: input.organizationId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType: "facility",
    facilityId: input.facilityId,
    assignmentOrigin: "system",
    env: input.env,
  });
  if (!role.ok && role.code !== "role_assignment_exists") {
    throw new Error(`V13_FIXTURE: role ${roleKey} was not assigned (${role.code || "failed"})`);
  }
  return staff.staffMember.id;
}

async function attachRegressionClinicOperations(db, input) {
  const spec = input && input.spec;
  if (!spec || spec.publicBookingEnabled !== false) {
    throw new Error("V13_FIXTURE: public booking must stay disabled");
  }
  const organizationId = String(input.organizationId || "");
  const healthcareOrganizationId = String(input.healthcareOrganizationId || "");
  const facilityId = String(input.facilityId || "");
  const adminStaffId = String(input.adminStaffId || "");
  if (!organizationId || !healthcareOrganizationId || !facilityId || !adminStaffId) {
    throw new Error("V13_FIXTURE: clinic, facility, and administrator are required");
  }
  await requireDisabledBooking(db, organizationId, healthcareOrganizationId);
  const { ensureDefaultDepartments } = require("../../../src/activeclinic/services/activeClinicDepartmentService");
  const { assignStaffToFacility } = require("../../../src/activeclinic/services/activeClinicStaffFacilityService");
  const { assignStaffRole, RECEPTIONIST, CLINICIAN, NURSE } = require("../../../src/activeclinic/services/activeClinicAuthorizationService");
  const { createFacilityServicePoint } = require("../../../src/activeclinic/services/activeClinicReceptionService");
  const departments = await ensureDefaultDepartments(db, {
    organizationId,
    healthcareOrganizationId,
    facilityId,
  });
  if (!departments.ok) {
    throw new Error("V13_FIXTURE: default departments were not provisioned");
  }
  const scope = {
    organizationId,
    healthcareOrganizationId,
    facilityId,
    env: input.env,
  };
  let adminFacility = await assignStaffToFacility(db, {
    organizationId,
    staffMemberId: adminStaffId,
    facilityId,
    isPrimary: true,
  });
  if (adminFacility.code === "primary_facility_conflict") {
    adminFacility = await assignStaffToFacility(db, {
      organizationId,
      staffMemberId: adminStaffId,
      facilityId,
      isPrimary: false,
    });
  }
  if (!adminFacility.ok && adminFacility.code !== "facility_assignment_exists") {
    throw new Error(`V13_FIXTURE: administrator facility assignment failed (${adminFacility.code || "failed"})`);
  }
  const receptionistId = await provisionFacilityStaff(db, scope, {
    email: spec.receptionist.email,
    phone: spec.receptionist.phone,
    password: SYNTHETIC_PASSWORD,
  }, RECEPTIONIST);
  const adminReception = await assignStaffRole(db, {
    organizationId,
    staffMemberId: adminStaffId,
    roleKey: RECEPTIONIST,
    scopeType: "facility",
    facilityId,
    assignmentOrigin: "system",
    env: input.env,
  });
  if (!adminReception.ok && adminReception.code !== "role_assignment_exists") {
    throw new Error(`V13_FIXTURE: receptionist role was not assigned (${adminReception.code || "failed"})`);
  }
  const clinicianId = await provisionFacilityStaff(db, scope, {
    email: spec.clinician.email,
    phone: spec.clinician.phone,
    password: SYNTHETIC_PASSWORD,
  }, CLINICIAN);
  const nurse = await assignStaffRole(db, {
    organizationId,
    staffMemberId: clinicianId,
    roleKey: NURSE,
    scopeType: "facility",
    facilityId,
    assignmentOrigin: "system",
    env: input.env,
  });
  if (!nurse.ok && nurse.code !== "role_assignment_exists") {
    throw new Error(`V13_FIXTURE: vitals role was not assigned (${nurse.code || "failed"})`);
  }
  const adminNurse = await assignStaffRole(db, {
    organizationId,
    staffMemberId: adminStaffId,
    roleKey: NURSE,
    scopeType: "facility",
    facilityId,
    assignmentOrigin: "system",
    env: input.env,
  });
  if (!adminNurse.ok && adminNurse.code !== "role_assignment_exists") {
    throw new Error(`V13_FIXTURE: vitals role was not assigned (${adminNurse.code || "failed"})`);
  }
  const point = await createFacilityServicePoint(db, {
    organizationId,
    healthcareOrganizationId,
    facilityId,
    displayName: spec.servicePoint.displayName,
    serviceType: spec.servicePoint.serviceType || "general",
    servicePointKey: spec.servicePoint.servicePointKey,
    actor: {
      staffMemberId: receptionistId,
      organizationId,
    },
  });
  if (!point.ok) {
    throw new Error(`V13_FIXTURE: service point was not provisioned (${point.code || "failed"})`);
  }
  await requireDisabledBooking(db, organizationId, healthcareOrganizationId);
  return {
    publicBookingEnabled: false,
    receptionistId,
    clinicianId,
    servicePointId: point.servicePoint.id,
    servicePointKey: spec.servicePoint.servicePointKey,
  };
}

function uniqueFixturePhone(phone, stamp, serial, offset) {
  const raw = String(phone || "");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9) return raw;
  const head = digits.slice(0, digits.length - 6);
  const tail = String((Number(stamp) + Number(serial) * 97 + Number(offset)) % 1000000).padStart(6, "0");
  const next = `${head}${tail}`;
  return raw.trim().startsWith("+") ? `+${next}` : next;
}

function isolateHttpClinic(clinic) {
  if (!fixtureSuffix()) return clinic;
  httpClinicSerial += 1;
  const n = httpClinicSerial;
  const unique = `${Date.now().toString(36)}${n}`;
  const mail = (email) => String(email || "").replace("@", `+c${unique}@`);
  const phone = (value, offset) => uniqueFixturePhone(value, Date.now(), n, offset);
  return {
    ...clinic,
    key: `${clinic.key}-${unique}`,
    displayName: `${clinic.displayName} ${n}`,
    facilityKey: `${clinic.facilityKey}-${unique}`,
    adminEmail: mail(clinic.adminEmail),
    adminPhone: phone(clinic.adminPhone, 1),
    receptionist: clinic.receptionist
      ? { ...clinic.receptionist, email: mail(clinic.receptionist.email), phone: phone(clinic.receptionist.phone, 2) }
      : clinic.receptionist,
    clinician: clinic.clinician
      ? { ...clinic.clinician, email: mail(clinic.clinician.email), phone: phone(clinic.clinician.phone, 3) }
      : clinic.clinician,
    servicePoint: clinic.servicePoint
      ? { ...clinic.servicePoint, servicePointKey: `${clinic.servicePoint.servicePointKey}-${unique}` }
      : clinic.servicePoint,
  };
}

async function applyActiveClinicFixtures(db, connectionString, env) {
  assertApplyPermitted(connectionString, env);
  const operations = assertRegressionClinicOperationsPlan(buildRegressionClinicOperationsPlan());
  const { submitAndProvisionClinicRegistration } = require("../../../src/activeclinic/services/submitClinicRegistrationService");
  const created = [];
  for (const sourceClinic of operations.clinics) {
    const clinic = isolateHttpClinic(sourceClinic);
    const registered = await submitAndProvisionClinicRegistration(db, {
      clinicName: clinic.displayName,
      contactName: `${clinic.displayName} Admin`,
      contactEmail: clinic.adminEmail,
      contactPhone: clinic.adminPhone,
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Cairo Road",
      countryCode: "ZM",
      password: SYNTHETIC_PASSWORD,
      passwordConfirm: SYNTHETIC_PASSWORD,
      acceptTerms: "on",
      registration_consent: "on",
      deploymentCode: DEPLOYMENT_CODE,
      dataEnvironment: "testing",
      organizationKey: clinic.key,
      env: env || process.env,
    });
    if (!registered.ok || registered.reviewRequired || !registered.organizationId) {
      throw new Error(`clinic ${clinic.key}: ${registered.reason || registered.code || "provision_failed"}`);
    }
    if (!registered.facility || !registered.healthcareOrganization || !registered.staffMemberId) {
      throw new Error(`clinic ${clinic.key}: registration did not return a facility and administrator`);
    }
    const spec = { ...clinic, publicBookingEnabled: false };
    if (spec.publicBookingEnabled !== false) {
      throw new Error("V13_FIXTURE: public booking must stay disabled");
    }
    const attached = await attachRegressionClinicOperations(db, {
      organizationId: registered.organizationId,
      healthcareOrganizationId: registered.healthcareOrganization.id,
      facilityId: registered.facility.id,
      adminStaffId: registered.staffMemberId,
      spec,
      env: env || process.env,
    });
    created.push({
      key: clinic.key,
      organizationId: registered.organizationId,
      organizationKey: registered.slug || clinic.key,
      adminEmail: clinic.adminEmail,
      clinicKey: registered.slug || clinic.key,
      publicBookingEnabled: attached.publicBookingEnabled,
      receptionistId: attached.receptionistId,
      clinicianId: attached.clinicianId,
      servicePointId: attached.servicePointId,
      servicePointKey: attached.servicePointKey,
    });
  }
  const activeClinicPlan = buildActiveClinicFixturePlan();
  return {
    plan: { ...operations, patient: activeClinicPlan.patient, slot: activeClinicPlan.slot },
    created,
  };
}

async function ignoreAppendOnly(client, run) {
  try {
    await client.query("SAVEPOINT fixture_cleanup");
    await run();
    await client.query("RELEASE SAVEPOINT fixture_cleanup");
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT fixture_cleanup");
    if (error.code !== "23000" && error.code !== "23503") throw error;
  }
}

function quoteIdent(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error("V13_FIXTURE: unsafe identifier");
  }
  return `"${value}"`;
}

async function deleteDirectReferences(client, parent, ids) {
  const refs = await client.query(
    `SELECT n.nspname AS schema_name, child.relname AS table_name, a.attname AS column_name
       FROM pg_constraint c
       JOIN pg_class child ON child.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = child.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f'
        AND c.confrelid = $1::regclass
        AND cardinality(c.conkey) = 1`,
    [parent]
  );
  for (let pass = 0; pass < 8; pass += 1) {
    let blocked = false;
    for (const ref of refs.rows) {
      const table = `${quoteIdent(ref.schema_name)}.${quoteIdent(ref.table_name)}`;
      const column = quoteIdent(ref.column_name);
      try {
        await client.query("SAVEPOINT fixture_cleanup");
        await client.query(`DELETE FROM ${table} WHERE ${column} = ANY($1::uuid[])`, [ids]);
        await client.query("RELEASE SAVEPOINT fixture_cleanup");
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT fixture_cleanup");
        blocked = true;
      }
    }
    if (!blocked) return;
  }
}

async function cleanupBlessBoardFixtures(db, connectionString, created, env) {
  assertApplyPermitted(connectionString, env);
  const churchIds = (created || []).map((row) => row.churchId).filter(Boolean);
  const orgIds = (created || []).map((row) => row.organizationId).filter(Boolean);
  if (!churchIds.length && !orgIds.length) return;
  const client = typeof db.connect === "function" ? await db.connect() : db;
  try {
    await client.query("BEGIN");
    if (churchIds.length) {
      await client.query(
        `DELETE FROM blessboard.announcement_reads
          WHERE announcement_id IN (SELECT id FROM blessboard.announcements WHERE church_id = ANY($1::uuid[]))`,
        [churchIds]
      );
      await client.query(
        `DELETE FROM blessboard.announcement_attachments
          WHERE announcement_id IN (SELECT id FROM blessboard.announcements WHERE church_id = ANY($1::uuid[]))`,
        [churchIds]
      );
      await client.query(
        `DELETE FROM blessboard.announcement_audiences
          WHERE announcement_id IN (SELECT id FROM blessboard.announcements WHERE church_id = ANY($1::uuid[]))`,
        [churchIds]
      );
      await client.query(`DELETE FROM blessboard.announcements WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await client.query(
        `DELETE FROM blessboard.page_sections
          WHERE page_id IN (SELECT id FROM blessboard.public_pages WHERE church_id = ANY($1::uuid[]))`,
        [churchIds]
      );
      await client.query(`DELETE FROM blessboard.public_pages WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await client.query(`DELETE FROM blessboard.events WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await client.query(`DELETE FROM blessboard.sermons WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await client.query(`DELETE FROM blessboard.public_contact_submissions WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await client.query(`DELETE FROM blessboard.member_portal_invitations WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await client.query(
        `DELETE FROM blessboard.member_branch_memberships
          WHERE member_id IN (SELECT id FROM blessboard.members WHERE church_id = ANY($1::uuid[]))`,
        [churchIds]
      );
      await client.query(`DELETE FROM blessboard.members WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await client.query(`DELETE FROM blessboard.user_invitations WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await client.query(
        `DELETE FROM platform.deployment_sessions
          WHERE church_id = ANY($1::uuid[])
             OR branch_id IN (SELECT id FROM blessboard.branches WHERE church_id = ANY($1::uuid[]))`,
        [churchIds]
      );
      await client.query(`DELETE FROM blessboard.branches WHERE church_id = ANY($1::uuid[])`, [churchIds]);
      await ignoreAppendOnly(client, () =>
        client.query(`DELETE FROM blessboard.user_role_assignments WHERE church_id = ANY($1::uuid[])`, [churchIds])
      );
      await deleteDirectReferences(client, "blessboard.churches", churchIds);
      await ignoreAppendOnly(client, () =>
        client.query(`DELETE FROM blessboard.churches WHERE id = ANY($1::uuid[])`, [churchIds])
      );
    }
    if (orgIds.length) {
      await client.query(`DELETE FROM platform.organization_products WHERE organization_id = ANY($1::uuid[])`, [orgIds]);
    }
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // The connection may already have left the transaction.
    }
    throw error;
  } finally {
    if (client !== db && typeof client.release === "function") client.release();
  }
}

module.exports = {
  SYNTHETIC_PASSWORD,
  scopedKey,
  uniqueFixturePhone,
  DEPLOYMENT_CODE,
  buildBlessBoardFixturePlan,
  buildActiveClinicFixturePlan,
  buildV213RegressionFixturePlan,
  buildBlessBoardWebsiteSectionFixture,
  classifyClinicCredentialReuse,
  buildRegressionClinicOperationsPlan,
  assertRegressionClinicOperationsPlan,
  attachRegressionClinicOperations,
  provisionFacilityStaff,
  buildAc05EvidencePlan,
  buildAppointmentConcurrencyPlan,
  assertSyntheticPlan,
  assertApplyPermitted,
  applyBlessBoardFixtures,
  applyActiveClinicFixtures,
  cleanupBlessBoardFixtures,
};
