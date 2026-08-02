"use strict";

/**
 * Prompt 10B: Platform Admin global users/members directory (ephemeral Postgres).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  listPlatformUsers,
  getPlatformUserDetail,
  listPlatformMembers,
  getPlatformMemberSupportProfile,
  normalizeUserListInput,
  normalizeMemberListInput,
  MAX_LIMIT,
  ALLOWED_LIMITS,
} = require("../src/platform/services/platformAdminDirectoryService");
const { PLATFORM_ADMIN_PERMISSIONS } = require("../src/blessboard/rbac/legacyCompatibilityPermissions");
const { PLATFORM_ADMIN_NAV } = require("../src/platform/http/platformAdminNav");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

describe("platform admin directory input normalization", () => {
  it("snaps pagination and ignores malformed filters", () => {
    const users = normalizeUserListInput({
      page: "0",
      limit: "999",
      status: "not-a-status",
      role: "!!bad!!",
      organizationId: "not-uuid",
      churchId: "abc",
      q: "a%_b",
    });
    assert.equal(users.ok, true);
    assert.equal(users.value.page, 1);
    assert.equal(users.value.limit, MAX_LIMIT);
    assert.equal(users.value.status, null);
    assert.equal(users.value.roleKey, null);
    assert.equal(users.value.organizationId, null);
    assert.equal(users.value.churchId, null);
    assert.equal(users.value.q, "ab");
    assert.ok(ALLOWED_LIMITS.includes(users.value.limit));

    const members = normalizeMemberListInput({
      page: "-3",
      limit: "30",
      status: "bogus",
      memberNumber: "  x  ",
    });
    assert.equal(members.value.page, 1);
    assert.equal(members.value.limit, 25);
    assert.equal(members.value.status, null);
    assert.equal(members.value.memberNumber, "x");
  });
});

describe("platform admin directory permissions catalogue", () => {
  it("includes explicit platform directory permissions for PA compatibility", () => {
    for (const key of [
      "platform.users.view",
      "platform.members.search",
      "platform.members.view_support_profile",
    ]) {
      assert.ok(PLATFORM_ADMIN_PERMISSIONS.includes(key), `missing ${key}`);
    }
    assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("pastoral.notes.read"));
    assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("finance.transactions.view"));
  });

  it("exposes Users and Members nav entries", () => {
    const keys = PLATFORM_ADMIN_NAV.map((i) => i.key);
    assert.ok(keys.includes("users"));
    assert.ok(keys.includes("members"));
  });

  it("ships migration 068 for directory permissions", () => {
    const mig = fs.readFileSync(
      path.join(
        __dirname,
        "../db/migrations/blessboard/068_platform_admin_directory_permissions.sql"
      ),
      "utf8"
    );
    assert.match(mig, /platform\.users\.view/);
    assert.match(mig, /platform\.members\.search/);
    assert.match(mig, /platform\.members\.view_support_profile/);
    assert.match(mig, /platform_administrator/);
  });
});

describe("blessboard platform-admin directory HTTP", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let branchB;
  let users = {};
  let members = {};

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

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "dir-org-a",
        displayName: "Directory Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "dir-org-a",
        hostname: "dir-a.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "dir-org-b",
        displayName: "Directory Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "dir-org-b",
        hostname: "dir-b.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const churchProvA = await provisionBlessBoardChurch(pool, {
        organizationKey: "dir-org-a",
        churchKey: "dir-org-a",
        displayName: "Directory Church A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(churchProvA.ok, true, churchProvA.message);
      churchA = churchProvA.records.church;
      branchA = churchProvA.records.hqBranch;

      const churchProvB = await provisionBlessBoardChurch(pool, {
        organizationKey: "dir-org-b",
        churchKey: "dir-org-b",
        displayName: "Directory Church B",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(churchProvB.ok, true, churchProvB.message);
      churchB = churchProvB.records.church;
      branchB = churchProvB.records.hqBranch;

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.platform = await makeUser("dir-pa@example.org", "Directory Platform Admin");
      users.hq = await makeUser("dir-hq@example.org", "Directory HQ Admin");
      users.staffA = await makeUser("dir-staff-a@example.org", "Staff Alpha");
      users.staffB = await makeUser("dir-staff-b@example.org", "Staff Beta");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "dir-pa@example.org",
            organizationKey: "dir-org-a",
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "dir-hq@example.org",
            organizationKey: "dir-org-a",
            roleKey: "church_hq_admin",
            churchKey: "dir-org-a",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "dir-staff-a@example.org",
            organizationKey: "dir-org-a",
            roleKey: "branch_admin",
            churchKey: "dir-org-a",
            branchKey: "hq",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "dir-staff-b@example.org",
            organizationKey: "dir-org-b",
            roleKey: "branch_admin",
            churchKey: "dir-org-b",
            branchKey: "hq",
          })
        ).ok,
        true
      );

      const memA = await pool.query(
        `INSERT INTO blessboard.members
           (church_id, user_id, first_name, last_name, preferred_name,
            email_normalized, email_display, phone_normalized, phone_display, status)
         VALUES
           ($1, $2, 'Ada', 'Membera', 'Ada',
            'ada.membera@example.org', 'ada.membera@example.org',
            '+15551110001', '+1 555 111 0001', 'active')
         RETURNING id`,
        [churchA.id, users.staffA.id]
      );
      members.a = { id: memA.rows[0].id };
      await pool.query(
        `INSERT INTO blessboard.member_branch_memberships
           (member_id, branch_id, membership_status, is_primary, joined_at)
         VALUES ($1, $2, 'active', true, now())`,
        [members.a.id, branchA.id]
      );

      const memB = await pool.query(
        `INSERT INTO blessboard.members
           (church_id, user_id, first_name, last_name, preferred_name,
            email_normalized, email_display, phone_normalized, phone_display, status)
         VALUES
           ($1, NULL, 'Ben', 'Memberb', 'Ben',
            'ben.memberb@example.org', 'ben.memberb@example.org',
            '+15552220002', '+1 555 222 0002', 'active')
         RETURNING id`,
        [churchB.id]
      );
      members.b = { id: memB.rows[0].id };
      await pool.query(
        `INSERT INTO blessboard.member_branch_memberships
           (member_id, branch_id, membership_status, is_primary, joined_at)
         VALUES ($1, $2, 'active', true, now())`,
        [members.b.id, branchB.id]
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
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

  async function cookieFor(user, org, church) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: user.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: null,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("Platform Admin can open global users and members directories", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform, orgA, churchA);

    const usersRes = await request(app)
      .get("/admin/users")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(usersRes.status, 200);
    assert.match(usersRes.text, /data-bb-pa-users="1"/);
    assert.match(usersRes.text, /Staff Alpha/);
    assert.match(usersRes.text, /Staff Beta/);
    assert.match(usersRes.text, /dir-org-a/);
    assert.match(usersRes.text, /dir-org-b/);
    assert.doesNotMatch(usersRes.text, /password_hash|passwordHash|secret_token/i);

    const membersRes = await request(app)
      .get("/admin/members")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(membersRes.status, 200);
    assert.match(membersRes.text, /data-bb-pa-members="1"/);
    assert.match(membersRes.text, /Ada/);
    assert.match(membersRes.text, /Ben/);
    assert.doesNotMatch(membersRes.text, /data-bb-pastoral|data-bb-welfare|data-bb-safeguarding|data-bb-giving/);
    assert.doesNotMatch(membersRes.text, /password_hash|case_notes|confidential_notes/i);
  });

  it("church HQ admin is denied direct directory URLs", async () => {
    requireDb();
    const cookie = await cookieFor(users.hq, orgA, churchA);
    for (const pathUrl of [
      "/admin/users",
      `/admin/users/${users.staffA.id}`,
      "/admin/members",
      `/admin/members/${members.a.id}`,
      "/admin/organizations/dir-org-a/users",
      "/admin/organizations/dir-org-a/members",
    ]) {
      const res = await request(app)
        .get(pathUrl)
        .set("Host", "blessboard.org")
        .set("Cookie", cookie);
      assert.equal(res.status, 403, pathUrl);
    }
  });

  it("organisation filter isolates cross-org staff search", async () => {
    requireDb();
    const listA = await listPlatformUsers(pool, {
      actorUserId: users.platform.id,
      filters: { organizationKey: "dir-org-a" },
      auditOrganizationId: orgA.id,
      env: baseEnv(),
    });
    assert.equal(listA.ok, true, listA.reason);
    const namesA = listA.users.map((u) => u.displayName);
    assert.ok(namesA.includes("Staff Alpha"));
    assert.ok(!namesA.includes("Staff Beta"));

    const listB = await listPlatformUsers(pool, {
      actorUserId: users.platform.id,
      filters: { organizationKey: "dir-org-b" },
      auditOrganizationId: orgA.id,
      env: baseEnv(),
    });
    assert.equal(listB.ok, true, listB.reason);
    const namesB = listB.users.map((u) => u.displayName);
    assert.ok(namesB.includes("Staff Beta"));
    assert.ok(!namesB.includes("Staff Alpha"));
  });

  it("user detail projects safe fields and role summaries", async () => {
    requireDb();
    const detail = await getPlatformUserDetail(pool, {
      actorUserId: users.platform.id,
      userId: users.staffA.id,
      env: baseEnv(),
    });
    assert.equal(detail.ok, true, detail.reason);
    assert.equal(detail.user.displayName, "Staff Alpha");
    assert.ok(detail.user.legacyAssignments.some((a) => a.roleKey === "branch_admin"));
    assert.equal(detail.user.supportContextAvailable, false);
    assert.equal(detail.user.enterChurchAdminHref, null);
    const raw = JSON.stringify(detail.user);
    assert.doesNotMatch(raw, /password_hash|passwordHash|session_token|csrf/i);
    assert.doesNotMatch(raw, /pastoral|welfare|transaction/i);
  });

  it("member detail is a support profile without pastoral or Finance fields", async () => {
    requireDb();
    const detail = await getPlatformMemberSupportProfile(pool, {
      actorUserId: users.platform.id,
      memberId: members.a.id,
      env: baseEnv(),
    });
    assert.equal(detail.ok, true, detail.reason);
    assert.equal(detail.member.displayName, "Ada");
    assert.equal(detail.member.organizationKey, "dir-org-a");
    assert.equal(detail.member.accountLinked, true);
    assert.ok(detail.member.technical);
    assert.equal(detail.member.supportContextAvailable, false);
    const keys = Object.keys(detail.member).join(",");
    assert.doesNotMatch(keys, /pastoral|welfare|safeguarding|giving|finance|notes/i);
    const raw = JSON.stringify(detail.member);
    assert.doesNotMatch(raw, /case_notes|confidential|transaction|donation/i);
  });

  it("HTTP user and member detail pages render for Platform Admin", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform, orgA, churchA);
    const userPage = await request(app)
      .get(`/admin/users/${users.staffB.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(userPage.status, 200);
    assert.match(userPage.text, /Staff Beta/);
    assert.match(userPage.text, /data-bb-pa-user-detail="1"/);
    assert.match(userPage.text, /data-bb-pa-user-recovery="1"/);
    assert.match(userPage.text, /Account recovery/);
    assert.doesNotMatch(userPage.text, /password_hash|session_token|rawToken/i);

    const memberPage = await request(app)
      .get(`/admin/members/${members.b.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(memberPage.status, 200);
    assert.match(memberPage.text, /Ben/);
    assert.match(memberPage.text, /data-bb-pa-member-detail="1"/);
    assert.match(memberPage.text, /Unlinked|No/);
  });

  it("org-scoped routes resolve by key and UUID", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform, orgA, churchA);
    const byKey = await request(app)
      .get("/admin/organizations/dir-org-b/users")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(byKey.status, 200);
    assert.match(byKey.text, /Staff Beta/);
    assert.doesNotMatch(byKey.text, /Staff Alpha/);

    const byId = await request(app)
      .get(`/admin/organizations/${orgA.id}/members`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(byId.status, 200);
    assert.match(byId.text, /Ada/);
    assert.doesNotMatch(byId.text, /Ben/);
  });

  it("pagination and result limits are enforced", async () => {
    requireDb();
    const page1 = await listPlatformUsers(pool, {
      actorUserId: users.platform.id,
      filters: { limit: 10, page: 1 },
      auditOrganizationId: orgA.id,
      env: baseEnv(),
    });
    assert.equal(page1.ok, true);
    assert.ok(page1.limit <= MAX_LIMIT);
    assert.ok(page1.users.length <= page1.limit);

    const oversized = await listPlatformMembers(pool, {
      actorUserId: users.platform.id,
      filters: { limit: 500, page: 1 },
      auditOrganizationId: orgA.id,
      env: baseEnv(),
    });
    assert.equal(oversized.limit, MAX_LIMIT);
  });

  it("malformed ids return controlled errors", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform, orgA, churchA);
    const badUser = await request(app)
      .get("/admin/users/not-a-uuid")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(badUser.status, 400);

    const badMember = await request(app)
      .get("/admin/members/also-bad")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(badMember.status, 400);

    const missing = await request(app)
      .get("/admin/users/00000000-0000-4000-8000-000000000099")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(missing.status, 404);
  });

  it("records audit events for user/member detail and filtered search", async () => {
    requireDb();
    await getPlatformUserDetail(pool, {
      actorUserId: users.platform.id,
      userId: users.staffA.id,
      env: baseEnv(),
    });
    await getPlatformMemberSupportProfile(pool, {
      actorUserId: users.platform.id,
      memberId: members.a.id,
      env: baseEnv(),
    });
    await listPlatformUsers(pool, {
      actorUserId: users.platform.id,
      filters: { organizationKey: "dir-org-a" },
      auditOrganizationId: orgA.id,
      env: baseEnv(),
    });
    await listPlatformMembers(pool, {
      actorUserId: users.platform.id,
      filters: { organizationKey: "dir-org-a" },
      auditOrganizationId: orgA.id,
      env: baseEnv(),
    });

    const audits = await pool.query(
      `SELECT action_key, entity_type, outcome
         FROM platform.audit_events
        WHERE actor_user_id = $1
          AND action_key IN (
            'platform.users.view_detail',
            'platform.members.view_support_profile',
            'platform.users.search',
            'platform.members.search'
          )
        ORDER BY created_at DESC
        LIMIT 20`,
      [users.platform.id]
    );
    const keys = new Set(audits.rows.map((r) => r.action_key));
    assert.ok(keys.has("platform.users.view_detail"));
    assert.ok(keys.has("platform.members.view_support_profile"));
    assert.ok(keys.has("platform.users.search"));
    assert.ok(keys.has("platform.members.search"));
    assert.ok(audits.rows.every((r) => r.outcome === "success"));
  });

  it("church user cannot call directory services even with forged filters", async () => {
    requireDb();
    const deniedUsers = await listPlatformUsers(pool, {
      actorUserId: users.hq.id,
      filters: { organizationKey: "dir-org-b" },
      env: baseEnv(),
    });
    assert.equal(deniedUsers.ok, false);
    assert.equal(deniedUsers.status, "forbidden");

    const deniedMembers = await listPlatformMembers(pool, {
      actorUserId: users.hq.id,
      filters: { organizationId: orgB.id },
      env: baseEnv(),
    });
    assert.equal(deniedMembers.ok, false);
    assert.equal(deniedMembers.status, "forbidden");
  });
});
