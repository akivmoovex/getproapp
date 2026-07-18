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
const { createGivingMethod } = require("../src/blessboard/services/publicContentAdminService");

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
    assert.match(res.text, /data-bb-stitch-dashboard="14-member-dashboard"/);
    assert.match(res.text, /data-bb-dash-hero="1"/);
    assert.match(res.text, /Quick actions/);
    assert.match(res.text, /Upcoming events/);
    assert.match(res.text, /Announcements/);
    assert.match(res.text, /data-bb-dash-empty="events"/);
    assert.match(res.text, /data-bb-dash-empty="announcements"/);
    assert.match(res.text, /data-bb-dash-empty="ministries"/);
    assert.match(res.text, /Not enabled yet/);
    assert.match(res.text, /data-bb-quick-action="prayer"[^>]*data-bb-quick-enabled="0"|data-bb-quick-enabled="0"[^>]*data-bb-quick-action="prayer"/);
    assert.match(res.text, /href="\/member\/events"/);
    assert.match(res.text, /href="\/member\/giving"/);
    assert.doesNotMatch(res.text, /href="\/member\/prayer"/);
    assert.doesNotMatch(res.text, /Check-in|Member Directory|View Calendar/i);
    assert.doesNotMatch(res.text, /\b\d+\s+(announcements|events|forms|ministries)/i);
    assert.doesNotMatch(res.text, /attendance|spots remaining|registered count/i);
    assert.equal(res.text.includes(memberId), false);
    assert.equal(res.text.includes(churchA.id), false);
    assert.equal(res.text.includes(branchA.id), false);
  });

  it("renders dashboard empty states and implemented quick actions only", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get("/member")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser))
      .set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-dash-quick-actions="1"/);
    assert.match(res.text, /data-bb-quick-action="giving"/);
    assert.match(res.text, /data-bb-quick-action="ministries"/);
    assert.match(res.text, /data-bb-quick-action="events"/);
    assert.match(res.text, /role="status"/);
    assert.match(res.text, /No upcoming events published yet/);
    assert.match(res.text, /No announcements right now/);
    assert.match(res.text, /No published ministries to show yet/);
    assert.doesNotMatch(res.text, /href="\/member\/check-in"|href="\/member\/directory"/i);
  });

  it("renders shared member shell chrome with implemented nav only", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get("/member")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser))
      .set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-shell="member"/);
    assert.match(res.text, /data-bb-stitch-shell="14-member-dashboard"/);
    assert.match(res.text, /data-bb-nav="desktop-sidebar"/);
    assert.match(res.text, /data-bb-nav="mobile-tabs"/);
    assert.match(res.text, /data-bb-nav="mobile-header"/);
    assert.match(res.text, /data-bb-nav="mobile-drawer"/);
    assert.match(res.text, /data-bb-member-dashboard="1"/);
    assert.match(res.text, /data-bb-member-role="1"/);
    assert.match(res.text, /data-bb-page-area="1"/);
    assert.match(res.text, /Verified member/);
    assert.match(res.text, /id="bb-mp-main"/);
    assert.match(res.text, /tabindex="-1"/);
    assert.match(res.text, /role="dialog"/);
    assert.match(res.text, /aria-modal="true"/);
    assert.match(res.text, /\binert\b/);
    assert.match(res.text, /bb-mp-drawer__close/);
    assert.match(res.text, /href="\/member\/profile"/);
    assert.match(res.text, /aria-label="Profile"/);
    assert.match(res.text, /href="\/member\/announcements"/);
    assert.match(res.text, /href="\/member\/events"/);
    assert.match(res.text, /href="\/member\/ministries"/);
    assert.match(res.text, /href="\/member\/resources"/);
    assert.match(res.text, /href="\/member\/forms"/);
    assert.match(res.text, /href="\/member\/requests"/);
    assert.match(res.text, /href="\/member\/giving"/);
    assert.match(res.text, />Dashboard</);
    assert.doesNotMatch(res.text, /href="\/member\/prayer"/);
    assert.doesNotMatch(res.text, /href="\/member\/prayer-request"/);
    assert.doesNotMatch(res.text, /notifications/i);
    assert.match(
      res.text,
      /data-bb-module="giving"[^>]*data-bb-module-enabled="1"|data-bb-module-enabled="1"[^>]*data-bb-module="giving"/
    );
    assert.match(
      res.text,
      /data-bb-module="prayer"[^>]*data-bb-module-enabled="0"|data-bb-module-enabled="0"[^>]*data-bb-module="prayer"/
    );
    assert.match(res.text, /action="\/member\/logout"/);
    assert.match(res.text, /name="_csrf"/);
    assert.match(res.text, /Powered by|bb-powered-by/);
  });

  it("carries shared shell nav onto other member module pages", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get("/member/announcements")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser))
      .set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-shell="member"/);
    assert.match(res.text, /data-bb-nav="desktop-sidebar"/);
    assert.match(res.text, /href="\/member"/);
    assert.match(res.text, /href="\/member\/profile"/);
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

  it("renders profile GUI with approved editable fields and accessible validation", async (t) => {
    if (skipIfNeeded(t)) return;
    const form = await request(app)
      .get("/member/profile")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(form.status, 200);
    assert.match(form.text, /data-bb-member-profile="1"/);
    assert.match(form.text, /data-bb-stitch-profile="15-member-profile"/);
    assert.match(form.text, /data-bb-profile-header="1"/);
    assert.match(form.text, /data-bb-profile-readonly="1"/);
    assert.match(form.text, /data-bb-profile-form="1"/);
    assert.match(form.text, /Verified Member/);
    assert.match(form.text, /Read-only/);
    assert.match(form.text, /Editable/);
    assert.match(form.text, /name="preferredName"/);
    assert.match(form.text, /name="emailDisplay"/);
    assert.match(form.text, /name="phone"/);
    assert.match(form.text, /name="_csrf"/);
    assert.match(form.text, /Legal Name/);
    assert.match(form.text, /Sign-in email/);
    assert.doesNotMatch(form.text, /name="firstName"/);
    assert.doesNotMatch(form.text, /name="status"/);
    assert.doesNotMatch(form.text, /name="membershipStatus"/);
    assert.doesNotMatch(form.text, /type="file"|avatar upload|change password|notification prefer/i);
    assert.doesNotMatch(form.text, /Date of Birth|Residential Address|Emergency Contact|Medical Notes|Member Digital ID/i);

    const csrf = extractCookie(form, CSRF_COOKIE);
    const bad = await request(app)
      .post("/member/profile")
      .set("Host", HOST_A)
      .set("Cookie", `${sessionCookie(memberUser)}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        preferredName: "<bad>",
        phone: "+15559876543",
        emailDisplay: "Member@MP-A.Example.Test",
      });
    assert.equal(bad.status, 400);
    assert.match(bad.text, /id="err-preferredName"/);
    assert.match(bad.text, /aria-invalid="true"/);
    assert.match(bad.text, /role="alert"/);
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

  it("renders giving information without payment collection", async (t) => {
    if (skipIfNeeded(t)) return;
    const empty = await request(app)
      .get("/member/giving")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(empty.status, 200);
    assert.match(empty.text, /data-bb-member-giving="1"/);
    assert.match(empty.text, /data-bb-stitch-giving="24-member-giving-information"/);
    assert.match(empty.text, /data-bb-giving-info-only="1"/);
    assert.match(empty.text, /data-bb-giving-empty="catalog"/);
    assert.match(empty.text, /Information only|instructional/i);
    assert.doesNotMatch(empty.text, /card number|cvv|iban|name="card"|name="amount"/i);
    assert.doesNotMatch(empty.text, /Scan to Give|Generate One-Time Link|85%|Merchant Code/i);
    assert.doesNotMatch(empty.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(empty.text, new RegExp(branchA.id, "i"));
    assert.doesNotMatch(empty.text, new RegExp(memberId, "i"));

    const draft = await createGivingMethod(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      methodType: "mobile_money",
      label: "Draft Mobile Money",
      instructions: "Should stay unpublished.",
      status: "draft",
    });
    assert.equal(draft.ok, true, draft.reason);

    const stillEmpty = await request(app)
      .get("/member/giving")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(stillEmpty.status, 200);
    assert.match(stillEmpty.text, /data-bb-giving-empty="catalog"/);
    assert.doesNotMatch(stillEmpty.text, /Draft Mobile Money/);

    const published = await createGivingMethod(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      methodType: "bank_transfer",
      label: "Member Bank Transfer",
      instructions: "Use the published bank details from the church office.",
      externalUrl: "https://example.org/give",
      status: "published",
    });
    assert.equal(published.ok, true, published.reason);

    const live = await request(app)
      .get("/member/giving")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(live.status, 200);
    assert.match(live.text, /data-bb-giving-methods="1"/);
    assert.match(live.text, /data-bb-giving-method="bank_transfer"/);
    assert.match(live.text, /Member Bank Transfer/);
    assert.match(live.text, /Bank transfer/);
    assert.match(live.text, /data-bb-giving-instructions="1"/);
    assert.match(live.text, /Use the published bank details from the church office/);
    assert.match(live.text, /data-bb-giving-link="1"/);
    assert.match(live.text, /Open published link/);
    assert.match(live.text, /href="https:\/\/example\.org\/give"/);
    assert.match(live.text, /data-bb-giving-disclaimer="1"/);
    assert.doesNotMatch(live.text, /Draft Mobile Money/);
    assert.doesNotMatch(live.text, /card number|cvv|name="card"|name="amount"/i);
    assert.doesNotMatch(live.text, /85%|Generate One-Time Link|Scan to Give|donation history|Your balance|Account balance/i);
    assert.doesNotMatch(live.text, /action="\/member\/giving"|method="post"[^>]*giving/i);
    assert.doesNotMatch(live.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(live.text, new RegExp(published.item ? published.item.id : "never", "i"));

    const denied = await request(app).get("/member/giving").set("Host", HOST_A);
    assert.ok(denied.status === 401 || denied.status === 302 || denied.status === 303);

    const otherChurch = await request(app)
      .get("/member/giving")
      .set("Host", HOST_B)
      .set("Cookie", sessionCookie(memberUser));
    assert.ok(otherChurch.status === 403 || otherChurch.status === 401 || otherChurch.status === 302);
  });

  it("requires CSRF on member logout", async (t) => {
    if (skipIfNeeded(t)) return;
    const home = await request(app)
      .get("/member")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(home.status, 200);
    const csrf = extractCookie(home, CSRF_COOKIE);
    assert.ok(csrf);

    const bad = await request(app)
      .post("/member/logout")
      .set("Host", HOST_A)
      .set("Cookie", `${sessionCookie(memberUser)}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({ [CSRF_FIELD]: "not-the-token" });
    assert.equal(bad.status, 403);

    const ok = await request(app)
      .post("/member/logout")
      .set("Host", HOST_A)
      .set("Cookie", `${sessionCookie(memberUser)}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.location, "/");
  });

  it("keeps V4 legacy wiring unchanged", () => {
    const legacy = fs.readFileSync(path.join(ROOT, "server.legacy.js"), "utf8");
    assert.match(legacy, /ensureChurchSchema/);
    assert.match(legacy, /createAttachTenantByHost/);
    const dispatcher = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    assert.match(dispatcher, /server\.legacy/);
  });
});
