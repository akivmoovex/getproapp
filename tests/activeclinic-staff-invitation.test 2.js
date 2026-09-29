"use strict";

/**
 * ActiveClinic Prompt 6 — staff invitation governance, multi-role, activation.
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
  linkStaffMemberToIdentity,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
  FACILITY_ADMIN,
  CLINICIAN,
  RECEPTIONIST,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  inviteActiveClinicStaff,
  revokeStaffInvitation,
  RESULT: INVITE_RESULT,
} = require("../src/activeclinic/services/activeClinicStaffInvitationService");
const {
  activateActiveClinicStaff,
  previewActivationToken,
} = require("../src/activeclinic/services/activateActiveClinicStaff");
const {
  evaluateStaffEligibility,
} = require("../src/activeclinic/services/activeClinicLoginEligibility");
const {
  canGrantRole,
  assignFoundationalStaffRole,
} = require("../src/activeclinic/services/activeClinicAccessManagementService");
const {
  summarizePermissionsForRoleKeys,
} = require("../src/activeclinic/services/activeClinicInviteAccessReview");
const {
  parseStaffFormBody,
  buildInviteRoleAssignments,
} = require("../src/activeclinic/services/loadActiveClinicStaffFormScreens");
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
const staffRepo = require("../src/activeclinic/repositories/staffMemberRepository");
const identityRepo = require("../src/platform/repositories/platformIdentityRepository");

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
let phoneSeq = 890000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function extractCookie(res, name) {
  const cookies = [].concat(res.headers["set-cookie"] || []);
  for (const line of cookies) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
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
    displayName: `Invite ${keyPrefix}`,
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
    facilityKey: `${keyPrefix}-main`,
    displayName: "Main",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  const facilityB = await createFacility(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${keyPrefix}-b`,
    displayName: "Site B",
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facilityB.ok, true, JSON.stringify(facilityB));
  return {
    orgId,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    facilityBId: facilityB.facility.id,
  };
}

async function seedAdmin(ac, opts = {}) {
  const phone = opts.phone || nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: opts.email || `admin.${phone.slice(-8)}@example.test`,
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
    firstName: opts.firstName || "Org",
    lastName: opts.lastName || "Admin",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: "Administrator",
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
    roleKey: opts.roleKey || ORGANIZATION_ADMIN,
    scopeType: opts.scopeType || "organisation",
    facilityId: opts.facilityId || null,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  return {
    identityId: identity.identity.id,
    staffMemberId: staff.staffMember.id,
    staff: staff.staffMember,
    identity: identity.identity,
  };
}

function authContext(ac, admin) {
  return {
    organization: { id: ac.orgId },
    staffMember: { id: admin.staffMemberId, status: "active" },
    platformIdentity: { id: admin.identityId },
    permissions: [
      "activeclinic.access",
      "activeclinic.staff.create",
      "activeclinic.staff.invite",
      "activeclinic.staff.assign_facility",
      "activeclinic.staff.assign_access",
      "activeclinic.staff.view",
      "activeclinic.staff.update",
    ],
    roleAssignments: [
      {
        roleKey: ORGANIZATION_ADMIN,
        status: "active",
        scopeType: "organisation",
      },
    ],
  };
}

describe("ActiveClinic staff invitation (Prompt 6)", () => {
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

  it("parses multi-role form values and builds scoped assignments", () => {
    const values = parseStaffFormBody({
      first_name: "A",
      last_name: "B",
      phone: "+260971000001",
      facility_ids: ["fac-1"],
      primary_facility_id: "fac-1",
      role_keys: [CLINICIAN, FACILITY_ADMIN],
      role_scope: "facility",
      issue_invitation: ["0", "1"],
    });
    assert.deepEqual(values.roleKeys, [CLINICIAN, FACILITY_ADMIN]);
    assert.equal(values.issueInvitation, true);
    const roles = buildInviteRoleAssignments(values);
    assert.equal(roles.length, 2);
    assert.ok(roles.every((r) => r.scopeType === "facility"));
    assert.ok(roles.every((r) => r.facilityId === "fac-1"));

    const off = parseStaffFormBody({
      first_name: "A",
      last_name: "B",
      phone: "+260971000001",
      issue_invitation: "0",
    });
    assert.equal(off.issueInvitation, false);
  });

  it("summarizes effective permissions by capability group", async () => {
    requireDb();
    const summary = await summarizePermissionsForRoleKeys(pool, [
      CLINICIAN,
      FACILITY_ADMIN,
    ]);
    assert.ok(summary.permissionCount > 10);
    assert.ok(summary.groups.some((g) => g.key === "clinical"));
    assert.ok(summary.groups.some((g) => g.key === "staff"));
    assert.ok(summary.permissions.includes("activeclinic.consultation.record"));
    assert.ok(summary.permissions.includes("activeclinic.facility.update"));
  });

  it("org admin can invite multi-role staff to LOGIN_READY", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedTenant(stamp, "inv1");
    const admin = await seedAdmin(ac);
    const phone = nextPhone();

    const invited = await inviteActiveClinicStaff(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityIds: [ac.facilityId],
      firstName: "Multi",
      lastName: "Invite",
      phone,
      email: `multi.${stamp}@example.test`,
      employmentType: "permanent",
      roleAssignments: [
        { roleKey: CLINICIAN, scopeType: "facility", facilityId: ac.facilityId },
        {
          roleKey: FACILITY_ADMIN,
          scopeType: "facility",
          facilityId: ac.facilityId,
        },
      ],
      auth: authContext(ac, admin),
      actorPlatformIdentityId: admin.identityId,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(invited.ok, true, JSON.stringify(invited));
    assert.ok(invited.rawToken);

    const activated = await activateActiveClinicStaff(pool, {
      rawToken: invited.rawToken,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(activated.ok, true, JSON.stringify(activated));

    const staff = await staffRepo.findByIdAndOrganization(pool, {
      id: invited.staffMember.id,
      organizationId: ac.orgId,
    });
    assert.equal(staff.status, "active");
    const identity = await identityRepo.findIdentityById(
      pool,
      invited.identity.id
    );
    const elig = await evaluateStaffEligibility(pool, staff, identity);
    assert.equal(elig.ok, true);
    assert.ok(elig.permissions.includes("activeclinic.consultation.record"));
    assert.ok(elig.permissions.includes("activeclinic.facility.update"));
  });

  it("rejects prohibited role grants via canGrantRole during invite", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}g`;
    const ac = await seedTenant(stamp, "invg");
    const facAdmin = await seedAdmin(ac, {
      roleKey: FACILITY_ADMIN,
      scopeType: "facility",
      facilityId: ac.facilityId,
      firstName: "Fac",
      lastName: "Admin",
    });
    const auth = {
      ...authContext(ac, facAdmin),
      roleAssignments: [
        {
          roleKey: FACILITY_ADMIN,
          status: "active",
          scopeType: "facility",
          facilityId: ac.facilityId,
        },
      ],
    };
    const grant = await canGrantRole(pool, {
      auth,
      roleKey: ORGANIZATION_ADMIN,
      scopeType: "organisation",
      targetStaffMemberId: "00000000-0000-4000-8000-000000000001",
    });
    assert.equal(grant.ok, false);

    const invited = await inviteActiveClinicStaff(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityIds: [ac.facilityId],
      firstName: "Denied",
      lastName: "Grant",
      phone: nextPhone(),
      employmentType: "permanent",
      roleAssignments: [
        {
          roleKey: ORGANIZATION_ADMIN,
          scopeType: "organisation",
          facilityId: null,
        },
      ],
      auth,
      actorPlatformIdentityId: facAdmin.identityId,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(invited.ok, false);
    assert.equal(invited.code, INVITE_RESULT.GRANT_DENIED);
  });

  it("rejects cross-organization facility and staff tampering", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}x`;
    const a = await seedTenant(stamp, "inva");
    const b = await seedTenant(`${stamp}b`, "invb");
    const admin = await seedAdmin(a);

    const invited = await inviteActiveClinicStaff(pool, {
      organizationId: a.orgId,
      healthcareOrganizationId: a.hcoId,
      facilityIds: [b.facilityId],
      firstName: "Cross",
      lastName: "Facility",
      phone: nextPhone(),
      employmentType: "permanent",
      roleAssignments: [
        { roleKey: STAFF_ROLE, scopeType: "facility", facilityId: b.facilityId },
      ],
      auth: authContext(a, admin),
      actorPlatformIdentityId: admin.identityId,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(invited.ok, false);
    assert.ok(
      [INVITE_RESULT.FACILITY_ASSIGNMENT_FAILED, INVITE_RESULT.GRANT_DENIED].includes(
        invited.code
      ),
      JSON.stringify(invited)
    );
  });

  it("denies expired, revoked, and replayed invitations", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t`;
    const ac = await seedTenant(stamp, "invt");
    const admin = await seedAdmin(ac);

    const invited = await inviteActiveClinicStaff(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityIds: [ac.facilityId],
      firstName: "Token",
      lastName: "Tests",
      phone: nextPhone(),
      employmentType: "permanent",
      roleAssignments: [
        {
          roleKey: RECEPTIONIST,
          scopeType: "facility",
          facilityId: ac.facilityId,
        },
      ],
      auth: authContext(ac, admin),
      actorPlatformIdentityId: admin.identityId,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(invited.ok, true, JSON.stringify(invited));

    const revoked = await revokeStaffInvitation(pool, {
      invitationId: invited.invitation.id,
      organizationId: ac.orgId,
      actorPlatformIdentityId: admin.identityId,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(revoked.ok, true, JSON.stringify(revoked));
    const afterRevoke = await activateActiveClinicStaff(pool, {
      rawToken: invited.rawToken,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(afterRevoke.ok, false);

    const invited2 = await inviteActiveClinicStaff(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityIds: [ac.facilityId],
      firstName: "Replay",
      lastName: "Tests",
      phone: nextPhone(),
      employmentType: "permanent",
      roleAssignments: [
        {
          roleKey: RECEPTIONIST,
          scopeType: "facility",
          facilityId: ac.facilityId,
        },
      ],
      auth: authContext(ac, admin),
      actorPlatformIdentityId: admin.identityId,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(invited2.ok, true);
    const first = await activateActiveClinicStaff(pool, {
      rawToken: invited2.rawToken,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(first.ok, true, JSON.stringify(first));
    const replay = await activateActiveClinicStaff(pool, {
      rawToken: invited2.rawToken,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(replay.ok, false);

    const invited3 = await inviteActiveClinicStaff(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityIds: [ac.facilityId],
      firstName: "Expire",
      lastName: "Tests",
      phone: nextPhone(),
      employmentType: "permanent",
      roleAssignments: [
        {
          roleKey: RECEPTIONIST,
          scopeType: "facility",
          facilityId: ac.facilityId,
        },
      ],
      auth: authContext(ac, admin),
      actorPlatformIdentityId: admin.identityId,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(invited3.ok, true);
    await pool.query(
      `UPDATE platform.identity_action_tokens
          SET created_at = now() - interval '2 hours',
              expires_at = now() - interval '1 hour'
        WHERE id = $1`,
      [invited3.tokenId]
    );
    const expired = await activateActiveClinicStaff(pool, {
      rawToken: invited3.rawToken,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(expired.ok, false);
    const preview = await previewActivationToken(pool, {
      rawToken: invited3.rawToken,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(preview.ok, false);
  });

  it("promotes invited staff to active when role assigned after password set", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}p`;
    const ac = await seedTenant(stamp, "invp");
    const admin = await seedAdmin(ac);
    const invited = await inviteActiveClinicStaff(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityIds: [ac.facilityId],
      firstName: "Late",
      lastName: "Role",
      phone: nextPhone(),
      employmentType: "permanent",
      roleAssignments: [],
      actorPlatformIdentityId: admin.identityId,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(invited.ok, true);
    const activated = await activateActiveClinicStaff(pool, {
      rawToken: invited.rawToken,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(activated.ok, true, JSON.stringify(activated));
    let staff = await staffRepo.findByIdAndOrganization(pool, {
      id: invited.staffMember.id,
      organizationId: ac.orgId,
    });
    assert.equal(staff.status, "invited");

    const assigned = await assignFoundationalStaffRole(pool, {
      auth: authContext(ac, admin),
      staffMemberId: invited.staffMember.id,
      roleKey: RECEPTIONIST,
      scopeType: "facility",
      facilityId: ac.facilityId,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(assigned.ok, true, JSON.stringify(assigned));
    staff = await staffRepo.findByIdAndOrganization(pool, {
      id: invited.staffMember.id,
      organizationId: ac.orgId,
    });
    assert.equal(staff.status, "active");
  });

  it("HTTP: departmental user cannot open invite form; org admin can", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}h`;
    const ac = await seedTenant(stamp, "invh");
    const admin = await seedAdmin(ac);
    const clinPhone = nextPhone();
    const clinId = await createPlatformIdentity(pool, {
      primaryEmail: `clin.${stamp}@example.test`,
      primaryPhone: clinPhone,
      phoneNormalized: clinPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: clinId.identity.id,
      password: PASSWORD,
    });
    const clinStaff = await createStaffMember(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      firstName: "Doc",
      lastName: "Only",
      employmentType: "permanent",
      status: "active",
      phone: clinPhone,
      platformIdentityId: clinId.identity.id,
    });
    await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: clinStaff.staffMember.id,
      facilityId: ac.facilityId,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: clinStaff.staffMember.id,
      roleKey: CLINICIAN,
      scopeType: "facility",
      facilityId: ac.facilityId,
      assignmentOrigin: "system",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
    });

    async function sessionCookie(identityId, organizationId) {
      const session = await createPlatformIdentitySession(pool, {
        platformIdentityId: identityId,
        organizationId,
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        applicationCode: "activeclinic",
      });
      assert.equal(session.ok, true, JSON.stringify(session));
      return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
    }

    const clinCookie = await sessionCookie(clinId.identity.id, ac.orgId);
    const denied = await request(app)
      .get("/app/staff/new")
      .set("Cookie", clinCookie);
    assert.equal(denied.status, 403);

    const adminCookie = await sessionCookie(admin.identityId, ac.orgId);
    const allowed = await request(app)
      .get("/app/staff/new")
      .set("Cookie", adminCookie);
    assert.equal(allowed.status, 200);
    assert.match(allowed.text, /name="role_keys"/);
    assert.match(allowed.text, /Effective access preview|Roles/);
  });
});
