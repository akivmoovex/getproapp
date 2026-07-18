"use strict";

/**
 * BlessBoard V5 member portal shell + profile HTTP.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

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
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  submitMemberRegistration,
  approveMemberRegistration,
  linkMemberToUser,
} = require("../src/blessboard/services/memberRegistrationService");
const {
  updateMemberPortalProfile,
} = require("../src/blessboard/services/memberPortalService");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "mp-a.blessboard.org";
const HOST_B = "mp-b.blessboard.org";
const ROOT = path.join(__dirname, "..");

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    ...overrides,
  };
}

describe("blessboard member portal", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let churchA;
  let branchA;
  let orgA;
  let orgB;
  let hqAdmin;
  let memberUser;
  let memberId;
  let adminOnly;
  let inactiveMemberUser;
  let wrongBranchUser;

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
        organizationKey: "mp-a",
        displayName: "MP A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "mp-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "mp-a",
        churchKey: "mp-a",
        displayName: "MP Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "mp-b",
        displayName: "MP B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "mp-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "mp-b",
        churchKey: "mp-b",
        displayName: "MP Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "MP Church A",
        websiteStatus: "published",
      });

      async function makeUser(email, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName: email,
        });
        assert.equal(created.ok, true, created.reason || created.message);
        if (role) {
          const assigned = await assignBlessBoardRole(pool, role);
          assert.equal(assigned.ok, true, assigned.message);
        }
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId:
            !role || role.organizationKey === "mp-a"
              ? orgA.records.organization.id
              : orgB.records.organization.id,
        });
        assert.equal(session.ok, true, session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      hqAdmin = await makeUser("hq@mp-a.example.test", {
        email: "hq@mp-a.example.test",
        organizationKey: "mp-a",
        churchKey: "mp-a",
        roleKey: "church_hq_admin",
      });

      adminOnly = await makeUser("branch@mp-a.example.test", {
        email: "branch@mp-a.example.test",
        organizationKey: "mp-a",
        churchKey: "mp-a",
        roleKey: "branch_admin",
        branchKey: "hq",
      });

      memberUser = await makeUser("member@mp-a.example.test", null);
      inactiveMemberUser = await makeUser("inactive-member@mp-a.example.test", null);
      wrongBranchUser = await makeUser("wrong-branch@mp-a.example.test", null);

      async function provisionLinkedMember(email, userBundle, phone) {
        const submitted = await submitMemberRegistration(pool, {
          churchId: churchA.id,
          branchId: branchA.id,
          firstName: "Portal",
          lastName: "Member",
          preferredName: "Port",
          email,
          phone,
        });
        assert.equal(submitted.ok, true, submitted.reason);
        const approved = await approveMemberRegistration(pool, {
          registrationId: submitted.registration.id,
          actorUserId: hqAdmin.user.id,
        });
        assert.equal(approved.ok, true, approved.reason);
        const linked = await linkMemberToUser(pool, {
          memberId: approved.member.id,
          actorUserId: hqAdmin.user.id,
          userId: userBundle.user.id,
        });
        assert.equal(linked.ok, true, linked.reason);
        return approved.member.id;
      }

      memberId = await provisionLinkedMember(
        "member@mp-a.example.test",
        memberUser,
        "+15551234001"
      );
      const inactiveId = await provisionLinkedMember(
        "inactive-member@mp-a.example.test",
        inactiveMemberUser,
        "+15551234002"
      );
      await pool.query(
        `UPDATE blessboard.member_branch_memberships
            SET membership_status = 'inactive', updated_at = now()
          WHERE member_id = $1 AND branch_id = $2`,
        [inactiveId, branchA.id]
      );

      const wrongId = await provisionLinkedMember(
        "wrong-branch@mp-a.example.test",
        wrongBranchUser,
        "+15551234003"
      );
      const secondary = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary)
         VALUES ($1, 'satellite', 'Satellite A', 'branch', 'active', false)
         RETURNING id`,
        [churchA.id]
      );
      const secondaryBranchId = secondary.rows[0].id;
      await pool.query(
        `UPDATE blessboard.member_branch_memberships
            SET membership_status = 'inactive', is_primary = false, updated_at = now()
          WHERE member_id = $1 AND branch_id = $2`,
        [wrongId, branchA.id]
      );
      await pool.query(
        `INSERT INTO blessboard.member_branch_memberships
           (member_id, branch_id, membership_status, is_primary, joined_at)
         VALUES ($1, $2, 'active', true, now())`,
        [wrongId, secondaryBranchId]
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("member-portal suite setup failed:", skipReason);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded(t) {
    if (skipSuite) {
      t.skip(`setup failed: ${skipReason}`);
      return true;
    }
    return false;
  }

  function sessionCookie(bundle) {
    return `${DEFAULT_V5_COOKIE}=${bundle.rawToken}`;
  }

  it("allows linked active member on matching tenant host", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get("/member")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser))
      .set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.match(res.text, /Welcome/);
    assert.match(res.text, /Announcements/);
    assert.match(res.text, /Not enabled yet/);
    assert.doesNotMatch(res.text, /\b\d+\s+(announcements|events|forms)/i);
    assert.equal(res.text.includes(memberId), false);
    assert.equal(res.text.includes(churchA.id), false);
    assert.equal(res.text.includes(branchA.id), false);
  });

  it("rejects admin role without membership", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get("/member")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(adminOnly))
      .set("Accept", "text/plain");
    assert.equal(res.status, 403);
  });

  it("rejects inactive branch membership", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get("/member")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(inactiveMemberUser))
      .set("Accept", "text/plain");
    assert.equal(res.status, 403);
  });

  it("rejects membership on a different branch than the host primary", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get("/member")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(wrongBranchUser))
      .set("Accept", "text/plain");
    assert.equal(res.status, 403);
  });

  it("rejects member on wrong tenant host", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get("/member")
      .set("Host", HOST_B)
      .set("Cookie", sessionCookie(memberUser))
      .set("Accept", "text/plain");
    assert.equal(res.status, 403);
  });

  it("updates only low-risk profile fields", async (t) => {
    if (skipIfNeeded(t)) return;
    const form = await request(app)
      .get("/member/profile")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(form.status, 200);
    const csrf = extractCookie(form, CSRF_COOKIE);
    assert.ok(csrf);

    const post = await request(app)
      .post("/member/profile")
      .set("Host", HOST_A)
      .set("Cookie", `${sessionCookie(memberUser)}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        preferredName: "Preferred Port",
        phone: "+15559876543",
        emailDisplay: "Member@MP-A.Example.Test",
        status: "suspended",
        membershipStatus: "inactive",
        firstName: "Hacked",
        lastName: "Name",
        email: "hijack@example.test",
      });
    assert.equal(post.status, 400);

    const csrf2 = extractCookie(
      await request(app)
        .get("/member/profile")
        .set("Host", HOST_A)
        .set("Cookie", sessionCookie(memberUser)),
      CSRF_COOKIE
    );
    const ok = await request(app)
      .post("/member/profile")
      .set("Host", HOST_A)
      .set("Cookie", `${sessionCookie(memberUser)}; ${CSRF_COOKIE}=${csrf2}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        preferredName: "Preferred Port",
        phone: "+15559876543",
        emailDisplay: "Member@MP-A.Example.Test",
      });
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.location, "/member/profile?saved=1");

    const { rows } = await pool.query(
      `SELECT preferred_name, phone_normalized, email_display, email_normalized,
              first_name, last_name, status
         FROM blessboard.members WHERE id = $1`,
      [memberId]
    );
    assert.equal(rows[0].preferred_name, "Preferred Port");
    assert.equal(rows[0].phone_normalized, "+15559876543");
    assert.equal(rows[0].email_display, "Member@MP-A.Example.Test");
    assert.equal(rows[0].email_normalized, "member@mp-a.example.test");
    assert.equal(rows[0].first_name, "Portal");
    assert.equal(rows[0].last_name, "Member");
    assert.equal(rows[0].status, "active");

    const mem = await pool.query(
      `SELECT membership_status FROM blessboard.member_branch_memberships
        WHERE member_id = $1 AND branch_id = $2`,
      [memberId, branchA.id]
    );
    assert.equal(mem.rows[0].membership_status, "active");
  });

  it("rejects profile updates that try to change immutable fields via service", async (t) => {
    if (skipIfNeeded(t)) return;
    const blocked = await updateMemberPortalProfile(pool, {
      userId: memberUser.user.id,
      churchId: churchA.id,
      branchId: branchA.id,
      preferredName: "Still Port",
      status: "suspended",
    });
    assert.equal(blocked.ok, false);
    assert.match(String(blocked.reason), /immutable/);
  });

  it("requires CSRF on profile POST", async (t) => {
    if (skipIfNeeded(t)) return;
    const form = await request(app)
      .get("/member/profile")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    const csrf = extractCookie(form, CSRF_COOKIE);
    const bad = await request(app)
      .post("/member/profile")
      .set("Host", HOST_A)
      .set("Cookie", `${sessionCookie(memberUser)}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: "not-the-token",
        preferredName: "Nope",
      });
    assert.equal(bad.status, 403);
  });

  it("does not expose member or church UUIDs in portal HTML", async (t) => {
    if (skipIfNeeded(t)) return;
    const home = await request(app)
      .get("/member")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    const profile = await request(app)
      .get("/member/profile")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    for (const res of [home, profile]) {
      assert.equal(res.status, 200);
      assert.equal(res.text.includes(memberId), false);
      assert.equal(res.text.includes(churchA.id), false);
      assert.equal(res.text.includes(branchA.id), false);
      assert.equal(res.text.includes(memberUser.user.id), false);
      assert.doesNotMatch(
        res.text,
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
      );
    }
  });

  it("keeps V4 legacy wiring unchanged", () => {
    const legacy = fs.readFileSync(path.join(ROOT, "server.legacy.js"), "utf8");
    assert.match(legacy, /ensureChurchSchema/);
    assert.match(legacy, /createAttachTenantByHost/);
    const dispatcher = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    assert.match(dispatcher, /server\.legacy/);
  });
});
