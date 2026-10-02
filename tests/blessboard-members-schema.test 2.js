"use strict";

/**
 * BlessBoard V5 member identity schema + registration services.
 * No public portal routes; privacy-limited profile fields only.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  STATUS,
  PRIVACY_FORBIDDEN_KEYS,
  submitMemberRegistration,
  reviewMemberRegistration,
  approveMemberRegistration,
  rejectMemberRegistration,
  linkMemberToUser,
} = require("../src/blessboard/services/memberRegistrationService");

const { APPROVED_PRODUCT_TABLES } = require("../db/scripts/lib/foundationVerify");

const EXPECTED_TABLES = [...APPROVED_PRODUCT_TABLES.blessboard];

const PASSWORD = "correct-horse-battery-staple";

async function seedChurch(pool, key) {
  const org = await provisionPlatformTenant(pool, {
    organizationKey: key,
    displayName: `Org ${key}`,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: key,
    hostname: `${key}.blessboard.test`,
    domainType: "canonical",
    deploymentCode: "blessboard-org-staging",
    isPrimary: true,
  });
  assert.equal(org.ok, true, org.message);
  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: key,
    churchKey: key,
    displayName: `Church ${key}`,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true, church.message);
  return {
    organization: org.records.organization,
    church: church.records.church,
    branch: church.records.hqBranch,
  };
}

async function makeUser(pool, { email, organizationKey, churchKey, roleKey, branchKey }) {
  const created = await createBlessBoardUser(pool, {
    email,
    displayName: email,
    password: PASSWORD,
  });
  assert.equal(created.ok, true, created.reason || created.message);
  const assigned = await assignBlessBoardRole(pool, {
    email,
    organizationKey,
    churchKey,
    roleKey,
    branchKey: branchKey || undefined,
  });
  assert.equal(assigned.ok, true, assigned.message);
  return created.user;
}

describe("blessboard members schema", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let churchA;
  let churchB;
  let hqAdmin;
  let branchAdmin;
  let stranger;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      churchA = await seedChurch(pool, "mem-a");
      churchB = await seedChurch(pool, "mem-b");

      // Second branch on church A for multi-membership / ownership tests
      await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, status, branch_type, is_primary)
         VALUES ($1, 'north', 'North', 'active', 'branch', false)`,
        [churchA.church.id]
      );
      const north = await pool.query(
        `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'north'`,
        [churchA.church.id]
      );
      churchA.northBranch = { id: north.rows[0].id };

      hqAdmin = await makeUser(pool, {
        email: "hq@mem-a.example.test",
        organizationKey: "mem-a",
        churchKey: "mem-a",
        roleKey: "church_hq_admin",
      });
      branchAdmin = await makeUser(pool, {
        email: "branch@mem-a.example.test",
        organizationKey: "mem-a",
        churchKey: "mem-a",
        roleKey: "branch_admin",
        branchKey: "hq",
      });
      stranger = await makeUser(pool, {
        email: "hq@mem-b.example.test",
        organizationKey: "mem-b",
        churchKey: "mem-b",
        roleKey: "church_hq_admin",
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("creates member tables and keeps privacy column surface narrow", async () => {
    requireDb();
    const tables = await pool.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'blessboard' AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    );
    assert.deepEqual(
      tables.rows.map((r) => r.table_name),
      EXPECTED_TABLES
    );

    const cols = await pool.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'blessboard'
          AND table_name IN ('members', 'member_registrations')
        ORDER BY table_name, column_name`
    );
    const names = cols.rows.map((r) => r.column_name);
    for (const forbidden of [
      "national_id",
      "ssn",
      "date_of_birth",
      "health",
      "medical",
      "income",
      "bank_account",
      "spouse",
      "password",
      "password_hash",
      "temporary_password",
    ]) {
      assert.equal(names.includes(forbidden), false, forbidden);
    }
    assert.equal(names.includes("first_name"), true);
    assert.equal(names.includes("last_name"), true);
    assert.equal(names.includes("email_normalized"), true);
    assert.equal(names.includes("phone_normalized"), true);
  });

  it("rejects foreign branch ownership on registrations", async () => {
    requireDb();
    const result = await submitMemberRegistration(pool, {
      churchId: churchA.church.id,
      branchId: churchB.branch.id,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada-x@example.test",
      phone: "+260977001001",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "branch_ownership");
  });

  it("enforces uniqueness for open registrations and live members", async () => {
    requireDb();
    const first = await submitMemberRegistration(pool, {
      churchId: churchA.church.id,
      branchId: churchA.branch.id,
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@example.test",
      phone: "+260977001002",
    });
    assert.equal(first.ok, true, first.reason);

    const dupReg = await submitMemberRegistration(pool, {
      churchId: churchA.church.id,
      branchId: churchA.branch.id,
      firstName: "Grace",
      lastName: "Copy",
      email: "grace@example.test",
      phone: "+260977001003",
    });
    assert.equal(dupReg.ok, false);
    assert.equal(dupReg.status, STATUS.DUPLICATE_REGISTRATION);

    const approved = await approveMemberRegistration(pool, {
      registrationId: first.registration.id,
      actorUserId: hqAdmin.id,
    });
    assert.equal(approved.ok, true, approved.reason);
    assert.equal(approved.member.status, "active");
    assert.equal(approved.membership.isPrimary, true);

    const second = await submitMemberRegistration(pool, {
      churchId: churchA.church.id,
      branchId: churchA.northBranch.id,
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@example.test",
      phone: "+260977001002",
    });
    assert.equal(second.ok, true, second.reason);
    assert.equal(second.existingMemberId, approved.member.id);

    const linked = await approveMemberRegistration(pool, {
      registrationId: second.registration.id,
      actorUserId: hqAdmin.id,
    });
    assert.equal(linked.ok, true, linked.reason);
    assert.equal(linked.linkedExistingMember, true);
    assert.equal(linked.member.id, approved.member.id);
    assert.equal(linked.membership.branchId, churchA.northBranch.id);
    assert.equal(linked.membership.isPrimary, false);
  });

  it("rejects privacy-forbidden fields and requires phone", async () => {
    requireDb();
    const forbidden = await submitMemberRegistration(pool, {
      churchId: churchA.church.id,
      branchId: churchA.branch.id,
      firstName: "X",
      lastName: "Y",
      email: "priv@example.test",
      phone: "+260977001004",
      nationalId: "123",
    });
    assert.equal(forbidden.ok, false);
    assert.match(forbidden.reason, /privacy_forbidden/);

    const noPhone = await submitMemberRegistration(pool, {
      churchId: churchA.church.id,
      branchId: churchA.branch.id,
      firstName: "X",
      lastName: "Y",
      email: "nophone@example.test",
    });
    assert.equal(noPhone.ok, false);
    assert.equal(noPhone.reason, "phone_required");

    assert.ok(PRIVACY_FORBIDDEN_KEYS.includes("nationalId"));
  });

  it("approval is transactional and rejection does not create members", async () => {
    requireDb();
    const submitted = await submitMemberRegistration(pool, {
      churchId: churchA.church.id,
      branchId: churchA.branch.id,
      firstName: "Alan",
      lastName: "Turing",
      email: "alan@example.test",
      phone: "+260977001005",
    });
    assert.equal(submitted.ok, true, submitted.reason);

    const reviewed = await reviewMemberRegistration(pool, {
      registrationId: submitted.registration.id,
      actorUserId: hqAdmin.id,
    });
    assert.equal(reviewed.ok, true);
    assert.equal(reviewed.registration.status, "under_review");

    const rejected = await rejectMemberRegistration(pool, {
      registrationId: submitted.registration.id,
      actorUserId: hqAdmin.id,
      reviewNotes: "Incomplete application",
    });
    assert.equal(rejected.ok, true);
    assert.equal(rejected.registration.status, "rejected");

    const members = await pool.query(
      `SELECT id FROM blessboard.members WHERE email_normalized = 'alan@example.test'`
    );
    assert.equal(members.rows.length, 0);

    const again = await submitMemberRegistration(pool, {
      churchId: churchA.church.id,
      branchId: churchA.branch.id,
      firstName: "Alan",
      lastName: "Turing",
      email: "alan@example.test",
      phone: "+260977001005",
    });
    assert.equal(again.ok, true, again.reason);
    const approved = await approveMemberRegistration(pool, {
      registrationId: again.registration.id,
      actorUserId: hqAdmin.id,
    });
    assert.equal(approved.ok, true);
    assert.equal(approved.registration.memberId, approved.member.id);
  });

  it("enforces manager role restrictions", async () => {
    requireDb();
    const submitted = await submitMemberRegistration(pool, {
      churchId: churchA.church.id,
      branchId: churchA.branch.id,
      firstName: "Role",
      lastName: "Check",
      email: "role-check@example.test",
      phone: "+260977001006",
    });
    assert.equal(submitted.ok, true, submitted.reason);

    const denied = await approveMemberRegistration(pool, {
      registrationId: submitted.registration.id,
      actorUserId: stranger.id,
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, STATUS.FORBIDDEN);

    const branchOk = await approveMemberRegistration(pool, {
      registrationId: submitted.registration.id,
      actorUserId: branchAdmin.id,
    });
    assert.equal(branchOk.ok, true, branchOk.reason);
  });

  it("links member to existing user by phone/email without creating accounts", async () => {
    requireDb();
    const login = await createBlessBoardUser(pool, {
      email: "linked-member@example.test",
      displayName: "Linked Member",
      password: PASSWORD,
      phoneNormalized: "+260977001007",
      phoneDisplay: "+260977001007",
    });
    assert.equal(login.ok, true);

    const submitted = await submitMemberRegistration(pool, {
      churchId: churchA.church.id,
      branchId: churchA.branch.id,
      firstName: "Linked",
      lastName: "Member",
      email: "linked-member@example.test",
      phone: "+260977001007",
    });
    assert.equal(submitted.ok, true, submitted.reason);
    const approved = await approveMemberRegistration(pool, {
      registrationId: submitted.registration.id,
      actorUserId: hqAdmin.id,
    });
    assert.equal(approved.ok, true);
    assert.equal(approved.member.userId, null);

    const beforeCount = await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.users`);
    const linked = await linkMemberToUser(pool, {
      memberId: approved.member.id,
      actorUserId: hqAdmin.id,
      email: "linked-member@example.test",
    });
    assert.equal(linked.ok, true, linked.reason);
    assert.equal(linked.member.userId, login.user.id);

    const afterCount = await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.users`);
    assert.equal(afterCount.rows[0].n, beforeCount.rows[0].n);

    // Phone-preferred lookup ignores a mismatched email when the member phone
    // already matches the linked user; force conflict via explicit userId.
    const mismatch = await linkMemberToUser(pool, {
      memberId: approved.member.id,
      actorUserId: hqAdmin.id,
      userId: hqAdmin.id,
    });
    assert.equal(mismatch.ok, false);
    assert.ok(
      mismatch.status === STATUS.IDENTITY_CONFLICT || mismatch.reason === "already_linked"
    );
  });

  it("enforces one primary membership per member at the database layer", async () => {
    requireDb();
    const submitted = await submitMemberRegistration(pool, {
      churchId: churchA.church.id,
      branchId: churchA.branch.id,
      firstName: "Primary",
      lastName: "Rule",
      email: "primary-rule@example.test",
      phone: "+260977001008",
    });
    assert.equal(submitted.ok, true, submitted.reason);
    const approved = await approveMemberRegistration(pool, {
      registrationId: submitted.registration.id,
      actorUserId: hqAdmin.id,
    });
    assert.equal(approved.ok, true);

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.member_branch_memberships
             (member_id, branch_id, membership_status, is_primary)
           VALUES ($1, $2, 'active', true)`,
          [approved.member.id, churchA.northBranch.id]
        ),
      /unique|duplicate/i
    );
  });
});
