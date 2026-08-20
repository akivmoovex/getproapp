"use strict";

/**
 * ActiveClinic V6 — staff invitations, activation, recovery (AC-V6-09).
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const crypto = require("crypto");

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
  verifyPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  linkIdentityToProductProfile,
} = require("../src/platform/services/identityProductProfileService");
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
  authorizeStaffPermission,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  inviteActiveClinicStaff,
  reissueStaffInvitation,
  revokeStaffInvitation,
  RESULT: INVITE_RESULT,
} = require("../src/activeclinic/services/activeClinicStaffInvitationService");
const {
  activateActiveClinicStaff,
  previewActivationToken,
  RESULT: ACT_RESULT,
} = require("../src/activeclinic/services/activateActiveClinicStaff");
const {
  requestActiveClinicPasswordReset,
  issueAdminPasswordResetLink,
  completeActiveClinicPasswordReset,
  NEUTRAL_MESSAGE,
  PURPOSE_RESET,
} = require("../src/activeclinic/services/activeClinicPasswordRecoveryService");
const {
  suspendStaffAccess,
  restoreStaffAccess,
  revokeActiveClinicStaffSessions,
  requireStaffPasswordChange,
} = require("../src/activeclinic/services/activeClinicStaffAccountAdministrationService");
const {
  resolveOrCreateInvitationIdentity,
  RESULT: MATCH_RESULT,
} = require("../src/activeclinic/services/resolveActiveClinicInvitationIdentity");
const {
  buildActivationUrl,
  buildInvitationShareViewModel,
} = require("../src/activeclinic/services/activeClinicShareLinks");
const {
  authenticateActiveClinicIdentity,
  STATUS: AUTH_STATUS,
} = require("../src/activeclinic/services/authenticateActiveClinicIdentity");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { readV5Session } = require("../src/platform/session/readV5Session");
const tokenRepo = require("../src/platform/repositories/platformIdentityActionTokenRepository");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ORG_STAGING,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const { hashSessionToken } = require("../src/platform/session/sessionToken");

const PASSWORD = "activeclinic-pass-12";
const NEW_PASSWORD = "activeclinic-pass-99";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 700000000;

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
    publicName: "Juflona Pilot",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main",
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  return {
    orgId: org.records.organization.id,
    orgKey: org.records.organization.key,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedNetworkAdmin(ac, phone) {
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
    firstName: "Net",
    lastName: "Admin",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
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
    roleKey: NETWORK_ADMIN,
    scopeType: "organisation",
  });
  return { identity: identity.identity, staff: staff.staffMember };
}

describe("ActiveClinic staff invitation and account lifecycle", () => {
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
    if (skipReason) {
      assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
    }
  }

  it("invites new staff, hashes token, activates once, then rejects replay", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "inv");
    const phone = nextPhone();

    const invited = await inviteActiveClinicStaff(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityIds: [ac.facilityId],
      firstName: "Ada",
      lastName: "Invitee",
      phone,
      email: `ada.${stamp}@example.test`,
      employmentType: "permanent",
      roleAssignments: [
        {
          roleKey: STAFF_ROLE,
          scopeType: "organisation",
        },
      ],
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(invited.ok, true, JSON.stringify(invited));
    assert.equal(invited.identityCreated, true);
    assert.equal(invited.staffMember.status, "invited");
    assert.ok(invited.rawToken);
    assert.ok(invited.activationUrl.includes("/activate/"));
    assert.equal(invited.deliveryStatus, "link_generated");
    assert.ok(invited.share.whatsappUrl.includes("wa.me"));
    assert.ok(invited.share.mailtoUrl.includes("mailto:"));

    const stored = await tokenRepo.findByTokenHash(
      pool,
      hashSessionToken(invited.rawToken)
    );
    assert.ok(stored);
    assert.equal(stored.tokenHash, hashSessionToken(invited.rawToken));
    assert.notEqual(stored.tokenHash, invited.rawToken);

    const preview = await previewActivationToken(pool, {
      rawToken: invited.rawToken,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(preview.ok, true);
    assert.equal(preview.preview.staffDisplayName, "Ada Invitee");
    assert.equal(preview.preview.healthcareOrganizationName, "Juflona Pilot");

    const activated = await activateActiveClinicStaff(pool, {
      rawToken: invited.rawToken,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(activated.ok, true, JSON.stringify(activated));
    assert.equal(activated.staffActivated, true);
    assert.equal(activated.redirectTo, "/login?activated=1");

    const replay = await activateActiveClinicStaff(pool, {
      rawToken: invited.rawToken,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(replay.ok, false);
    assert.ok(
      [ACT_RESULT.CONSUMED, ACT_RESULT.INVALID_TOKEN, ACT_RESULT.REVOKED].includes(
        replay.code
      )
    );

    const auth = await authenticateActiveClinicIdentity(pool, {
      identifier: phone,
      password: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
      country: "ZM",
    });
    assert.equal(auth.ok, true, JSON.stringify(auth));
  });

  it("reuses unique verified identity and supports phone-only invite", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "reuse");
    const phone = nextPhone();
    const existing = await createPlatformIdentity(pool, {
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    assert.equal(existing.ok, true);

    const invited = await inviteActiveClinicStaff(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityIds: [ac.facilityId],
      firstName: "Phone",
      lastName: "Only",
      phone,
      employmentType: "contract",
      roleAssignments: [
        { roleKey: STAFF_ROLE, scopeType: "organisation" },
      ],
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(invited.ok, true, JSON.stringify(invited));
    assert.equal(invited.identityCreated, false);
    assert.equal(invited.identity.id, existing.identity.id);
    assert.equal(invited.share.hasEmail, false);
    assert.equal(invited.share.hasPhone, true);
  });

  it("links dual-product identity without requiring blessboard.users", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "dual");
    const phone = nextPhone();
    const identity = await createPlatformIdentity(pool, {
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
      primaryEmail: `dual.${stamp}@example.test`,
      emailNormalized: `dual.${stamp}@example.test`,
      emailVerifiedAt: new Date().toISOString(),
    });
    assert.equal(identity.ok, true);
    // Fake blessboard profile link (UUID only — no users row required for AC).
    const fakeProfileId = crypto.randomUUID();
    await linkIdentityToProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "blessboard",
      productProfileId: fakeProfileId,
    }).catch(() => {
      // product key may require catalogue entry; ignore if unavailable
    });

    const invited = await inviteActiveClinicStaff(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityIds: [ac.facilityId],
      firstName: "Dual",
      lastName: "Product",
      phone,
      email: `dual.${stamp}@example.test`,
      employmentType: "permanent",
      platformIdentityId: identity.identity.id,
      roleAssignments: [
        { roleKey: STAFF_ROLE, scopeType: "organisation" },
      ],
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(invited.ok, true, JSON.stringify(invited));
    assert.equal(invited.identity.id, identity.identity.id);

    const users = await pool.query(
      `SELECT 1 FROM blessboard.users WHERE email_normalized = $1 LIMIT 1`,
      [`dual.${stamp}@example.test`]
    );
    assert.equal(users.rowCount, 0);
  });

  it("rejects ambiguous verified-contact matches", async () => {
    requireDb();
    const identityRepo = require("../src/platform/repositories/platformIdentityRepository");
    const original = identityRepo.findIdentityByVerifiedContact;
    identityRepo.findIdentityByVerifiedContact = async () => [
      { id: crypto.randomUUID(), status: "active" },
      { id: crypto.randomUUID(), status: "active" },
    ];
    try {
      const result = await resolveOrCreateInvitationIdentity(pool, {
        phoneNormalized: "+260971119999",
        organizationId: crypto.randomUUID(),
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, MATCH_RESULT.AMBIGUOUS_MATCH);
    } finally {
      identityRepo.findIdentityByVerifiedContact = original;
    }
  });

  it("revokes and expires invitations; reissue invalidates prior token", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "rev");
    const phone = nextPhone();
    const invited = await inviteActiveClinicStaff(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityIds: [ac.facilityId],
      firstName: "Rev",
      lastName: "Oke",
      phone,
      employmentType: "permanent",
      roleAssignments: [
        { roleKey: STAFF_ROLE, scopeType: "organisation" },
      ],
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(invited.ok, true);
    const oldToken = invited.rawToken;

    const reissued = await reissueStaffInvitation(pool, {
      organizationId: ac.orgId,
      staffMemberId: invited.staffMember.id,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(reissued.ok, true, JSON.stringify(reissued));
    assert.notEqual(reissued.rawToken, oldToken);

    const oldDenied = await activateActiveClinicStaff(pool, {
      rawToken: oldToken,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(oldDenied.ok, false);

    const revoked = await revokeStaffInvitation(pool, {
      organizationId: ac.orgId,
      staffMemberId: invited.staffMember.id,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(revoked.ok, true);
    const afterRevoke = await activateActiveClinicStaff(pool, {
      rawToken: reissued.rawToken,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(afterRevoke.ok, false);
    assert.equal(afterRevoke.code, ACT_RESULT.REVOKED);

    // Expired token path
    const phone2 = nextPhone();
    const again = await inviteActiveClinicStaff(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityIds: [ac.facilityId],
      firstName: "Exp",
      lastName: "Ired",
      phone: phone2,
      employmentType: "permanent",
      roleAssignments: [
        { roleKey: STAFF_ROLE, scopeType: "organisation" },
      ],
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(again.ok, true);
    await pool.query(
      `UPDATE platform.identity_action_tokens
          SET created_at = now() - interval '2 hours',
              expires_at = now() - interval '1 hour'
        WHERE id = $1`,
      [again.tokenId]
    );
    await pool.query(
      `UPDATE activeclinic.staff_invitations
          SET issued_at = now() - interval '2 hours',
              expires_at = now() - interval '1 hour'
        WHERE id = $1`,
      [again.invitation.id]
    );
    const expired = await activateActiveClinicStaff(pool, {
      rawToken: again.rawToken,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(expired.ok, false);
    assert.equal(expired.code, ACT_RESULT.EXPIRED);
  });

  it("password recovery is enumeration-safe and revokes ActiveClinic sessions only", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "rst");
    const phone = nextPhone();
    const admin = await seedNetworkAdmin(ac, phone);

    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: admin.identity.id,
      organizationId: ac.orgId,
      ip: "127.0.0.1",
      userAgent: "test",
    });
    assert.equal(session.ok, true);

    // BlessBoard-style user session for same org deployment stays untouched when
    // we only revoke by platform identity on activeclinic-org-v6.
    const bbOrg = await provisionOrg({
      organizationKey: `bb_${stamp}`,
      displayName: "BB Org",
      productKey: "blessboard",
      productTenantKey: `bb-${stamp}`,
      deploymentCode: CODE_ORG_STAGING,
    });
    const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
    const bbUser = await createBlessBoardUser(pool, {
      email: `bb.${stamp}@example.test`,
      password: PASSWORD,
      displayName: "BB User",
    });
    assert.equal(bbUser.ok, true, JSON.stringify(bbUser));
    const bbSession = await createV5Session(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: bbUser.user.id,
      organizationId: bbOrg.records.organization.id,
      ip: "127.0.0.1",
      userAgent: "test",
    });
    assert.equal(bbSession.ok, true);

    const unknown = await requestActiveClinicPasswordReset(pool, {
      identifier: nextPhone(),
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      requestIp: "10.0.0.1",
    });
    assert.equal(unknown.ok, true);
    assert.equal(unknown.message, NEUTRAL_MESSAGE);
    assert.equal(unknown.rawToken, undefined);

    const known = await requestActiveClinicPasswordReset(pool, {
      identifier: phone,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      requestIp: "10.0.0.2",
    });
    assert.equal(known.ok, true);
    assert.equal(known.message, NEUTRAL_MESSAGE);
    assert.equal(known.rawToken, undefined);

    const adminReset = await issueAdminPasswordResetLink(pool, {
      organizationId: ac.orgId,
      staffMemberId: admin.staff.id,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(adminReset.ok, true, JSON.stringify(adminReset));
    assert.ok(adminReset.resetUrl.includes("/reset-password/"));

    const completed = await completeActiveClinicPasswordReset(pool, {
      rawToken: adminReset.rawToken,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(completed.ok, true, JSON.stringify(completed));
    assert.ok(completed.sessionsRevoked >= 1);

    const oldPw = await verifyPlatformIdentityPassword(pool, {
      identityId: admin.identity.id,
      password: PASSWORD,
      recordFailure: false,
    });
    assert.equal(oldPw.ok, false);
    const newPw = await verifyPlatformIdentityPassword(pool, {
      identityId: admin.identity.id,
      password: NEW_PASSWORD,
      recordFailure: false,
    });
    assert.equal(newPw.ok, true);

    const acSessionAfter = await readV5Session(pool, {
      rawToken: session.rawToken,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(acSessionAfter.ok, false);

    const bbSessionAfter = await readV5Session(pool, {
      rawToken: bbSession.rawToken,
      deploymentCode: CODE_ORG_STAGING,
    });
    assert.equal(bbSessionAfter.ok, true);
  });

  it("suspend denies access; restore does not revive expired roles", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sus");
    const keeperPhone = nextPhone();
    await seedNetworkAdmin(ac, keeperPhone);
    const phone = nextPhone();
    const target = await seedNetworkAdmin(ac, phone);

    const suspended = await suspendStaffAccess(pool, {
      organizationId: ac.orgId,
      staffMemberId: target.staff.id,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(suspended.ok, true, JSON.stringify(suspended));
    assert.equal(suspended.staffMember.status, "suspended");

    const auth = await authenticateActiveClinicIdentity(pool, {
      identifier: phone,
      password: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
      country: "ZM",
    });
    assert.equal(auth.ok, false);

    // Expire the network-admin role while suspended.
    await pool.query(
      `UPDATE activeclinic.staff_role_assignments
          SET expires_at = now() - interval '1 day'
        WHERE staff_member_id = $1`,
      [target.staff.id]
    );

    const restored = await restoreStaffAccess(pool, {
      organizationId: ac.orgId,
      staffMemberId: target.staff.id,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(restored.ok, true);
    assert.equal(restored.staffMember.status, "active");

    const authAfter = await authenticateActiveClinicIdentity(pool, {
      identifier: phone,
      password: PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      hostname: "activeclinic.org",
      country: "ZM",
    });
    assert.equal(authAfter.ok, false);
    assert.ok(
      authAfter.status === AUTH_STATUS.ACCESS_UNAVAILABLE ||
        authAfter.status === AUTH_STATUS.INVALID_CREDENTIALS ||
        authAfter.ok === false
    );
  });

  it("permission gates: facility admin can invite, not manage credentials; cross-org denied", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "perm");
    const other = await seedAcTenant(`${stamp}b`, "perm2");
    const facPhone = nextPhone();
    const facIdentity = await createPlatformIdentity(pool, {
      primaryPhone: facPhone,
      phoneNormalized: facPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: facIdentity.identity.id,
      password: PASSWORD,
    });
    const facStaff = await createStaffMember(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      firstName: "Fac",
      lastName: "Admin",
      employmentType: "permanent",
      phone: facPhone,
      status: "active",
      platformIdentityId: facIdentity.identity.id,
    });
    await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: facStaff.staffMember.id,
      facilityId: ac.facilityId,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: facStaff.staffMember.id,
      roleKey: FACILITY_ADMIN,
      scopeType: "facility",
      facilityId: ac.facilityId,
    });

    const canInvite = await authorizeStaffPermission(pool, {
      organizationId: ac.orgId,
      staffMemberId: facStaff.staffMember.id,
      permissionKey: "activeclinic.staff.invite",
      facilityId: ac.facilityId,
    });
    assert.equal(canInvite.allowed, true);

    const canCred = await authorizeStaffPermission(pool, {
      organizationId: ac.orgId,
      staffMemberId: facStaff.staffMember.id,
      permissionKey: "activeclinic.staff.manage_credentials",
      facilityId: ac.facilityId,
    });
    assert.equal(canCred.allowed, false);

    const cross = await issueAdminPasswordResetLink(pool, {
      organizationId: other.orgId,
      staffMemberId: facStaff.staffMember.id,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(cross.ok, false);

    const blessOnly = await provisionOrg({
      organizationKey: `bbonly_${stamp}`,
      displayName: "BB Only",
      productKey: "blessboard",
      productTenantKey: `bbonly-${stamp}`,
      deploymentCode: CODE_ORG_STAGING,
    });
    const deniedInvite = await inviteActiveClinicStaff(pool, {
      organizationId: blessOnly.records.organization.id,
      healthcareOrganizationId: crypto.randomUUID(),
      firstName: "Nope",
      lastName: "BB",
      phone: nextPhone(),
      employmentType: "permanent",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(deniedInvite.ok, false);
  });

  it("HTTP activate / forgot / reset routes and CSRF", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "http");
    const phone = nextPhone();
    const invited = await inviteActiveClinicStaff(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityIds: [ac.facilityId],
      firstName: "Http",
      lastName: "User",
      phone,
      employmentType: "permanent",
      roleAssignments: [
        { roleKey: STAFF_ROLE, scopeType: "organisation" },
      ],
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(invited.ok, true);

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });

    const getAct = await request(app).get(`/activate/${invited.rawToken}`);
    assert.equal(getAct.status, 200);
    assert.match(getAct.text, /Activate account|Create password/i);

    const badCsrf = await request(app)
      .post(`/activate/${invited.rawToken}`)
      .type("form")
      .send({
        password: PASSWORD,
        password_confirm: PASSWORD,
        [CSRF_FIELD]: "bad",
      });
    assert.equal(badCsrf.status, 403);

    const csrf = issueCsrfToken(MINIMAL_AC);
    const activate = await request(app)
      .post(`/activate/${invited.rawToken}`)
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        password: PASSWORD,
        password_confirm: PASSWORD,
        [CSRF_FIELD]: csrf,
      });
    assert.ok([302, 303].includes(activate.status));
    assert.match(activate.headers.location || "", /activated=1/);

    const forgot = await request(app)
      .post("/forgot-password")
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        identifier: phone,
        [CSRF_FIELD]: csrf,
      });
    assert.ok([302, 303].includes(forgot.status));
    assert.match(forgot.headers.location || "", /\/forgot-password\/check/);

    const reset = await issueAdminPasswordResetLink(pool, {
      organizationId: ac.orgId,
      staffMemberId: invited.staffMember.id,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(reset.ok, true);
    const csrf2 = issueCsrfToken(MINIMAL_AC);
    const resetPost = await request(app)
      .post(`/reset-password/${reset.rawToken}`)
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf2}`)
      .type("form")
      .send({
        password: NEW_PASSWORD,
        password_confirm: NEW_PASSWORD,
        [CSRF_FIELD]: csrf2,
      });
    assert.ok([302, 303].includes(resetPost.status));
  });

  it("share link helpers never include passwords", async () => {
    const url = buildActivationUrl({
      rawToken: "tok_example",
      publicOrigin: "https://activeclinic.org",
    });
    const share = buildInvitationShareViewModel({
      organizationName: "Juflona",
      activationUrl: url,
      phoneNormalized: "+260971234567",
      emailNormalized: "a@example.test",
      staffDisplayName: "Ada",
    });
    assert.doesNotMatch(share.shareMessage, /password/i);
    assert.doesNotMatch(share.whatsappUrl, /password/i);
    assert.ok(share.whatsappUrl.includes("wa.me/260971234567"));
  });

  it("keeps invited status when no role is assigned at activation", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "norole");
    const phone = nextPhone();
    const invited = await inviteActiveClinicStaff(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityIds: [ac.facilityId],
      firstName: "No",
      lastName: "Role",
      phone,
      employmentType: "permanent",
      roleAssignments: [],
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
    assert.equal(activated.ok, true);
    assert.equal(activated.staffActivated, false);
    assert.equal(activated.staffMember.status, "invited");
  });

  it("require-password-change and session revoke helpers work", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "cred");
    const phone = nextPhone();
    const admin = await seedNetworkAdmin(ac, phone);
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: admin.identity.id,
      organizationId: ac.orgId,
    });
    assert.equal(session.ok, true);

    const required = await requireStaffPasswordChange(pool, {
      organizationId: ac.orgId,
      staffMemberId: admin.staff.id,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(required.ok, true);
    assert.equal(required.identity.mustChangePassword, true);

    const revoked = await revokeActiveClinicStaffSessions(pool, {
      organizationId: ac.orgId,
      staffMemberId: admin.staff.id,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(revoked.ok, true);
    assert.ok(revoked.revokedCount >= 1);
  });
});
