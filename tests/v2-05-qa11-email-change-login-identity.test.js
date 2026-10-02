"use strict";

/**
 * V2.05 / QA11 — Email change must update canonical BlessBoard login identity.
 *
 * After changing profile email old@ → new@:
 * 1) new email + existing password logs in
 * 2) old email no longer logs in
 * 3) password hash unchanged
 * 4) phone login unaffected
 * 5) forgot-password resolves the new email
 * 6) duplicate email is rejected
 * 7) tenant/product isolation preserved (other org user email untouched)
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  provisionPlatformTenant,
} = require("../src/platform/services/provisionPlatformTenant");
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
  submitMemberRegistration,
  approveMemberRegistration,
  linkMemberToUser,
} = require("../src/blessboard/services/memberRegistrationService");
const {
  updateMemberPortalProfile,
} = require("../src/blessboard/services/memberPortalService");
const {
  authenticateBlessBoardUser,
} = require("../src/blessboard/services/authenticateBlessBoardUser");
const {
  requestPasswordReset,
} = require("../src/blessboard/services/passwordResetService");
const authRepo = require("../src/blessboard/repositories/blessBoardAuthRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT = "blessboard-org-staging";
const PASSWORD = "correct-horse-battery-staple";
const OLD_EMAIL = "old@qa11.example.test";
const NEW_EMAIL = "new@qa11.example.test";
const OTHER_EMAIL = "other@qa11.example.test";
const PHONE = "+260977011101";

let pool;
let skipReason = null;
let orgA;
let churchA;
let branchA;
let hqAdmin;
let memberUser;
let memberId;
let otherUser;
let passwordHashBefore;

function requireDb() {
  if (skipReason) {
    assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }
}

describe("V2.05 QA11 email change login identity", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "qa11-a",
        displayName: "QA11 A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "qa11-a",
        hostname: "qa11-a.blessboard.org",
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "qa11-a",
        churchKey: "qa11-a",
        displayName: "QA11 Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      const orgB = await provisionPlatformTenant(pool, {
        organizationKey: "qa11-b",
        displayName: "QA11 B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "qa11-b",
        hostname: "qa11-b.blessboard.org",
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "qa11-b",
        churchKey: "qa11-b",
        displayName: "QA11 Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);

      const hqCreated = await createBlessBoardUser(pool, {
        email: "hq@qa11.example.test",
        password: PASSWORD,
        displayName: "HQ QA11",
      });
      assert.equal(hqCreated.ok, true, hqCreated.reason || hqCreated.message);
      const hqRole = await assignBlessBoardRole(pool, {
        email: "hq@qa11.example.test",
        organizationKey: "qa11-a",
        churchKey: "qa11-a",
        roleKey: "church_hq_admin",
      });
      assert.equal(hqRole.ok, true, hqRole.message);
      hqAdmin = hqCreated.user;

      const memberCreated = await createBlessBoardUser(pool, {
        email: OLD_EMAIL,
        password: PASSWORD,
        displayName: "QA11 Member",
        phoneNormalized: PHONE,
        phoneDisplay: PHONE,
      });
      assert.equal(memberCreated.ok, true, memberCreated.reason || memberCreated.message);
      memberUser = memberCreated.user;

      // Ensure phone is on the login user for phone-login coverage.
      await pool.query(
        `UPDATE blessboard.users
            SET phone_normalized = $2,
                phone_display = $2,
                phone_verified_at = now(),
                updated_at = now()
          WHERE id = $1`,
        [memberUser.id, PHONE]
      );

      const otherCreated = await createBlessBoardUser(pool, {
        email: OTHER_EMAIL,
        password: PASSWORD,
        displayName: "QA11 Other",
      });
      assert.equal(otherCreated.ok, true, otherCreated.reason || otherCreated.message);
      otherUser = otherCreated.user;

      const submitted = await submitMemberRegistration(pool, {
        churchId: churchA.id,
        branchId: branchA.id,
        firstName: "QA11",
        lastName: "Member",
        preferredName: "QA",
        email: OLD_EMAIL,
        phone: PHONE,
      });
      assert.equal(submitted.ok, true, submitted.reason);
      const approved = await approveMemberRegistration(pool, {
        registrationId: submitted.registration.id,
        actorUserId: hqAdmin.id,
      });
      assert.equal(approved.ok, true, approved.reason);
      const linked = await linkMemberToUser(pool, {
        memberId: approved.member.id,
        actorUserId: hqAdmin.id,
        userId: memberUser.id,
      });
      assert.equal(linked.ok, true, linked.reason);
      memberId = approved.member.id;

      const before = await authRepo.findUserById(pool, memberUser.id);
      passwordHashBefore = before.password_hash;
      assert.ok(passwordHashBefore);
    } catch (err) {
      skipReason =
        err && err.message
          ? String(err.message).slice(0, 200)
          : "foundation setup failed";
      // eslint-disable-next-line no-console
      console.log("QA11 suite setup skip:", skipReason);
    }
  });

  after(async () => {
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
  });

  it("changes email and updates canonical login identity atomically", async () => {
    requireDb();
    const updated = await updateMemberPortalProfile(pool, {
      userId: memberUser.id,
      churchId: churchA.id,
      branchId: branchA.id,
      organizationId: orgA.records.organization.id,
      emailDisplay: NEW_EMAIL,
    });
    assert.equal(updated.ok, true, updated.reason || updated.status);
    assert.equal(updated.profile.emailNormalized, NEW_EMAIL);
    assert.equal(updated.profile.emailDisplay, NEW_EMAIL);

    const memberRow = await pool.query(
      `SELECT email_normalized, email_display, user_id FROM blessboard.members WHERE id = $1`,
      [memberId]
    );
    assert.equal(memberRow.rows[0].email_normalized, NEW_EMAIL);
    assert.equal(String(memberRow.rows[0].user_id), String(memberUser.id));

    const userRow = await authRepo.findUserById(pool, memberUser.id);
    assert.equal(userRow.email_normalized, NEW_EMAIL);
    assert.equal(userRow.email_display, NEW_EMAIL);
  });

  it("1) new email + existing password logs in", async () => {
    requireDb();
    const auth = await authenticateBlessBoardUser(pool, {
      email: NEW_EMAIL,
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
      requireOrganizationId: orgA.records.organization.id,
    });
    assert.equal(auth.ok, true, auth.message || auth.status);
    assert.equal(String(auth.user.id), String(memberUser.id));
  });

  it("2) old email no longer logs in", async () => {
    requireDb();
    const auth = await authenticateBlessBoardUser(pool, {
      email: OLD_EMAIL,
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
      requireOrganizationId: orgA.records.organization.id,
    });
    assert.equal(auth.ok, false);
    assert.equal(auth.status, "invalid_credentials");
    const byOld = await authRepo.findUserByEmail(pool, OLD_EMAIL);
    assert.equal(byOld, null);
  });

  it("3) password hash is unchanged", async () => {
    requireDb();
    const userRow = await authRepo.findUserById(pool, memberUser.id);
    assert.equal(userRow.password_hash, passwordHashBefore);
    assert.equal(await bcrypt.compare(PASSWORD, userRow.password_hash), true);
  });

  it("4) phone login remains unaffected", async () => {
    requireDb();
    const auth = await authenticateBlessBoardUser(pool, {
      identifier: PHONE,
      password: PASSWORD,
      deploymentCode: DEPLOYMENT,
      country: "ZM",
      requireOrganizationId: orgA.records.organization.id,
    });
    assert.equal(auth.ok, true, auth.message || auth.status);
    assert.equal(String(auth.user.id), String(memberUser.id));
    const userRow = await authRepo.findUserById(pool, memberUser.id);
    assert.equal(userRow.phone_normalized, PHONE);
  });

  it("5) forgot-password resolves the new email, not the old", async () => {
    requireDb();
    const deliveries = [];
    const captureAdapter = {
      send: async (payload) => {
        deliveries.push(payload);
        return { accepted_for_processing: true, delivered: true, status: "sent" };
      },
    };
    const byNew = await requestPasswordReset(
      pool,
      {
        email: NEW_EMAIL,
        publicBaseUrl: "https://blessboard.org",
        requestIp: "127.0.0.1",
        source: "qa11_test",
        env: { BLESSBOARD_APEX_ORIGIN: "https://blessboard.org" },
      },
      { emailAdapter: captureAdapter }
    );
    assert.equal(byNew.ok, true);
    assert.equal(byNew.sent, true);
    assert.equal(deliveries.length, 1);
    assert.equal(String(deliveries[0].recipient).toLowerCase(), NEW_EMAIL);

    const byOld = await requestPasswordReset(
      pool,
      {
        email: OLD_EMAIL,
        publicBaseUrl: "https://blessboard.org",
        requestIp: "127.0.0.1",
        source: "qa11_test",
        env: { BLESSBOARD_APEX_ORIGIN: "https://blessboard.org" },
      },
      {
        emailAdapter: {
          send: async () => {
            throw new Error("must not deliver to old email");
          },
        },
      }
    );
    assert.equal(byOld.ok, true);
    assert.equal(byOld.sent, false);
  });

  it("6) duplicate email change is rejected cleanly", async () => {
    requireDb();
    const conflict = await updateMemberPortalProfile(pool, {
      userId: memberUser.id,
      churchId: churchA.id,
      branchId: branchA.id,
      organizationId: orgA.records.organization.id,
      emailDisplay: OTHER_EMAIL,
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.reason, "email_in_use");

    const userRow = await authRepo.findUserById(pool, memberUser.id);
    assert.equal(userRow.email_normalized, NEW_EMAIL);

    const other = await authRepo.findUserById(pool, otherUser.id);
    assert.equal(other.email_normalized, OTHER_EMAIL);
  });

  it("7) BB tenant isolation: other account email remains intact after change", async () => {
    requireDb();
    const other = await authRepo.findUserByEmail(pool, OTHER_EMAIL);
    assert.ok(other);
    assert.equal(String(other.id), String(otherUser.id));
    assert.notEqual(String(other.id), String(memberUser.id));
    assert.equal(await bcrypt.compare(PASSWORD, other.password_hash), true);

    // Member profile email stays scoped to the linked member row for this church.
    const memberRow = await pool.query(
      `SELECT church_id, email_normalized FROM blessboard.members WHERE id = $1`,
      [memberId]
    );
    assert.equal(String(memberRow.rows[0].church_id), String(churchA.id));
    assert.equal(memberRow.rows[0].email_normalized, NEW_EMAIL);
  });
});
