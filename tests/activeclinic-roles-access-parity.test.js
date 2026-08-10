"use strict";

/**
 * ActiveClinic V6 — roles & access management (AC-V6-S06).
 */

const { describe, it, before, after, beforeEach } = require("node:test");
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
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  assignFoundationalStaffRole,
  revokeFoundationalStaffRole,
  canGrantRole,
  RESULT,
} = require("../src/activeclinic/services/activeClinicAccessManagementService");
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

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 860000000;

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
    publicName: "Access Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${keyPrefix}-main`,
    displayName: "Main Hospital",
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  const facility2 = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${keyPrefix}-clinic`,
    displayName: "Clinic East",
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Ndola",
  });
  assert.equal(facility2.ok, true, JSON.stringify(facility2));
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    facility2Id: facility2.facility.id,
    facilityKey: facility.facility.facilityKey,
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
    firstName: opts.firstName || "Staff",
    lastName: opts.lastName || "Member",
    employmentType: "permanent",
    phone,
    status: opts.status || "active",
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Administrator",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  const facilityIds = opts.facilityIds || [ac.facilityId];
  for (const facilityId of facilityIds) {
    await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId,
      isPrimary: facilityId === facilityIds[0],
    });
  }
  if (opts.roleKey !== null) {
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: opts.roleKey || STAFF_ROLE,
      scopeType: opts.scopeType || "organisation",
      facilityId: opts.scopeType === "facility" ? facilityIds[0] : null,
    });
  }
  return { identity: identity.identity, staff: staff.staffMember, phone };
}

async function sessionCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return { cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}` };
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

function authContext(staffSeed, ac, permissions, roleAssignments) {
  return {
    organization: { id: ac.orgId },
    staffMember: staffSeed.staff,
    platformIdentity: staffSeed.identity,
    permissions,
    roleAssignments,
  };
}

describe("ActiveClinic roles and access parity (AC-V6-S06)", () => {
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

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("access overview renders assignments and hides unauthorized viewers", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sacc");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      firstName: "Net",
      lastName: "Admin",
    });
    const ordinary = await seedStaff(ac, {
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
      firstName: "Ord",
      lastName: "Staff",
    });
    const app = makeApp();
    const { cookie: adminCookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const overview = await request(app).get("/app/access").set("Cookie", adminCookie);
    assert.equal(overview.status, 200);
    assert.match(overview.text, /data-ac-page-section="access-overview"/);
    assert.match(overview.text, /data-ac-visual="stitch-gap"/);
    assert.match(overview.text, /Staff access|Role catalogue/);
    assert.match(overview.text, /Net Admin|Network administrator|Organization administrator/);
    assert.doesNotMatch(overview.text, /BlessBoard/i);

    const { cookie: staffCookie } = await sessionCookie(ordinary.identity.id, ac.orgId);
    const denied = await request(app).get("/app/access").set("Cookie", staffCookie);
    assert.equal(denied.status, 403);
  });

  it("network admin assigns, edits expiry, and revokes with CSRF", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sagr");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId, ac.facility2Id],
      firstName: "Grant",
      lastName: "Admin",
    });
    const target = await seedStaff(ac, {
      roleKey: null,
      facilityIds: [ac.facilityId],
      firstName: "Target",
      lastName: "Nurse",
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();
    const csrf = issueCsrfToken(MINIMAL_AC);
    const csrfCookie = `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`;

    const assignPage = await request(app)
      .get(`/app/access/staff/${target.staff.id}/assign`)
      .set("Cookie", cookie);
    assert.equal(assignPage.status, 200);
    assert.match(assignPage.text, /data-ac-page-section="access-assign"/);
    assert.match(assignPage.text, /name="role_keys"|name="role_key"/);

    const noCsrf = await request(app)
      .post(`/app/access/staff/${target.staff.id}/roles`)
      .set("Cookie", cookie)
      .type("form")
      .send({
        role_key: STAFF_ROLE,
        scope_type: "facility",
        facility_id: ac.facilityId,
      });
    assert.equal(noCsrf.status, 403);

    const assigned = await request(app)
      .post(`/app/access/staff/${target.staff.id}/roles`)
      .set("Cookie", `${cookie}; ${csrfCookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        role_key: STAFF_ROLE,
        scope_type: "facility",
        facility_id: ac.facilityId,
      });
    assert.equal(assigned.status, 303);
    assert.match(assigned.headers.location, new RegExp(`/app/access/staff/${target.staff.id}`));

    const detail = await request(app)
      .get(`/app/access/staff/${target.staff.id}`)
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-ac-page-section="access-staff"/);
    assert.match(detail.text, /Currently effective/);
    assert.match(detail.text, /Staff/);

    const assignmentMatch = detail.text.match(/data-ac-assignment="([^"]+)"/);
    assert.ok(assignmentMatch, "assignment id marker missing");
    const assignmentId = assignmentMatch[1];

    const csrf2 = issueCsrfToken(MINIMAL_AC);
    const revoke = await request(app)
      .post(`/app/access/staff/${target.staff.id}/roles/${assignmentId}/revoke`)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf2}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        reason: "test_revoke",
      });
    assert.equal(revoke.status, 303);

    const after = await request(app)
      .get(`/app/access/staff/${target.staff.id}`)
      .set("Cookie", cookie);
    assert.match(after.text, /Revoked/);
  });

  it("enforces privilege escalation and cross-tenant protections", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sesc");
    const other = await seedAcTenant(`${stamp}b`, "sescb");
    const facilityAdmin = await seedStaff(ac, {
      roleKey: FACILITY_ADMIN,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
      firstName: "Fac",
      lastName: "Admin",
    });
    const target = await seedStaff(ac, {
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityIds: [ac.facilityId, ac.facility2Id],
      firstName: "Scoped",
      lastName: "Target",
    });
    const foreign = await seedStaff(other, {
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityIds: [other.facilityId],
      firstName: "Other",
      lastName: "Org",
    });

    const facAuth = authContext(
      facilityAdmin,
      ac,
      ["activeclinic.staff.assign_access", "activeclinic.access"],
      [
        {
          roleKey: FACILITY_ADMIN,
          status: "active",
          scopeType: "facility",
          facilityId: ac.facilityId,
        },
      ]
    );

    const networkGrant = await canGrantRole(pool, {
      auth: facAuth,
      roleKey: NETWORK_ADMIN,
      scopeType: "organisation",
      targetStaffMemberId: target.staff.id,
    });
    assert.equal(networkGrant.ok, false);
    assert.equal(networkGrant.code, RESULT.GRANT_DENIED);

    const otherFacility = await assignFoundationalStaffRole(pool, {
      auth: facAuth,
      staffMemberId: target.staff.id,
      roleKey: FACILITY_ADMIN,
      scopeType: "facility",
      facilityId: ac.facility2Id,
    });
    assert.equal(otherFacility.ok, false);
    assert.equal(otherFacility.code, RESULT.FACILITY_OUT_OF_SCOPE);

    const blessboard = await assignFoundationalStaffRole(pool, {
      auth: facAuth,
      staffMemberId: target.staff.id,
      roleKey: "church_admin",
      scopeType: "organisation",
    });
    assert.equal(blessboard.ok, false);

    const rawPerms = await assignFoundationalStaffRole(pool, {
      auth: facAuth,
      staffMemberId: target.staff.id,
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityId: ac.facilityId,
      permissionKeys: ["activeclinic.organization.manage"],
    });
    assert.equal(rawPerms.ok, false);
    assert.equal(rawPerms.code, RESULT.RAW_PERMISSIONS);

    const crossOrg = await assignFoundationalStaffRole(pool, {
      auth: facAuth,
      staffMemberId: foreign.staff.id,
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityId: ac.facilityId,
    });
    assert.equal(crossOrg.ok, false);

    const selfEsc = await canGrantRole(pool, {
      auth: authContext(
        facilityAdmin,
        ac,
        ["activeclinic.staff.assign_access"],
        [{ roleKey: NETWORK_ADMIN, status: "active" }]
      ),
      roleKey: NETWORK_ADMIN,
      scopeType: "organisation",
      targetStaffMemberId: facilityAdmin.staff.id,
    });
    assert.equal(selfEsc.ok, false);
    assert.equal(selfEsc.code, RESULT.SELF_ESCALATION);

    const okGrant = await assignFoundationalStaffRole(pool, {
      auth: facAuth,
      staffMemberId: target.staff.id,
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityId: ac.facilityId,
    });
    // May already have staff role at facility — allow duplicate denial or success.
    assert.ok(
      okGrant.ok === true || okGrant.code === RESULT.DUPLICATE,
      JSON.stringify(okGrant)
    );

    const { cookie } = await sessionCookie(facilityAdmin.identity.id, ac.orgId);
    const app = makeApp();
    const csrf = issueCsrfToken(MINIMAL_AC);
    const escalate = await request(app)
      .post(`/app/access/staff/${target.staff.id}/roles`)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        role_key: NETWORK_ADMIN,
        scope_type: "organisation",
      });
    assert.ok([400, 403].includes(escalate.status));
    assert.doesNotMatch(escalate.headers.location || "", /\?ok=1/);
  });

  it("revoked assignment no longer appears as effective", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "srev");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [ac.facilityId],
    });
    const target = await seedStaff(ac, {
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
      firstName: "Revoke",
      lastName: "Me",
    });
    const auth = authContext(
      admin,
      ac,
      ["activeclinic.staff.assign_access"],
      [{ roleKey: NETWORK_ADMIN, status: "active" }]
    );
    const listed = await pool.query(
      `SELECT id FROM activeclinic.staff_role_assignments
        WHERE staff_member_id = $1 AND organization_id = $2 AND status = 'active'
        LIMIT 1`,
      [target.staff.id, ac.orgId]
    );
    assert.ok(listed.rows[0]);
    const revoked = await revokeFoundationalStaffRole(pool, {
      auth,
      staffMemberId: target.staff.id,
      assignmentId: listed.rows[0].id,
      reason: "test",
    });
    assert.equal(revoked.ok, true, JSON.stringify(revoked));
    assert.equal(revoked.assignment.isRevoked, true);

    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();
    const overview = await request(app)
      .get("/app/access?status=effective")
      .set("Cookie", cookie);
    assert.equal(overview.status, 200);
    assert.doesNotMatch(overview.text, /Revoke Me/);
  });
});
