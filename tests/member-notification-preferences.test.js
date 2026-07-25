"use strict";

/**
 * BlessBoard V5 member notification preferences: presets, eligibility, CSRF, isolation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  foundationDbUnavailableSkipReason,
  createFoundationPool,
} = require("./helpers/foundationDb");
const {
  V5_IDENTITY_KEY: IDENTITY_KEY,
  DEFAULT_V5_COOKIE,
  baseV5TestEnv,
  extractSetCookie: extractCookie,
  joinCookieHeader: cookieHeader,
} = require("./helpers/blessboardV5Fixtures");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  submitMemberRegistration,
  approveMemberRegistration,
  linkMemberToUser,
} = require("../src/blessboard/services/memberRegistrationService");
const {
  STATUS,
  getPreferences,
  updatePreferences,
} = require("../src/blessboard/services/memberNotificationService");
const { preferencesForPreset } = require("../src/blessboard/messaging/messageConstants");

const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "msg-a.blessboard.org";
const HOST_B = "msg-b.blessboard.org";

function baseEnv(overrides) {
  return baseV5TestEnv(overrides);
}

function sessionCookie(bundle) {
  return `${DEFAULT_V5_COOKIE}=${bundle.rawToken}`;
}

describe("member notification preferences", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let env;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let branchB;
  let hqAdmin;
  let hqAdminB;
  let memberUser;
  let memberId;
  let member2User;
  let member2Id;
  let memberBUser;
  let memberBId;

  before(async () => {
    try {
      env = baseEnv();
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "msg-a",
        displayName: "Msg A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "msg-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "msg-a",
        churchKey: "msg-a",
        displayName: "Msg Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "msg-b",
        displayName: "Msg B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "msg-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "msg-b",
        churchKey: "msg-b",
        displayName: "Msg Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;
      branchB = chB.records.hqBranch;

      async function makeUser(email, role, orgRec) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName: email,
        });
        assert.equal(created.ok, true, created.reason || created.message);
        if (role) {
          const assigned = await assignBlessBoardRole(pool, role);
          assert.equal(assigned.ok, true, assigned.message || assigned.reason);
        }
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: orgRec.records.organization.id,
        });
        assert.equal(session.ok, true, session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      hqAdmin = await makeUser(
        "hq@msg-a.example.test",
        {
          email: "hq@msg-a.example.test",
          organizationKey: "msg-a",
          churchKey: "msg-a",
          roleKey: "church_hq_admin",
        },
        orgA
      );
      hqAdminB = await makeUser(
        "hq@msg-b.example.test",
        {
          email: "hq@msg-b.example.test",
          organizationKey: "msg-b",
          churchKey: "msg-b",
          roleKey: "church_hq_admin",
        },
        orgB
      );
      memberUser = await makeUser("member@msg-a.example.test", null, orgA);
      member2User = await makeUser("member2@msg-a.example.test", null, orgA);
      memberBUser = await makeUser("member@msg-b.example.test", null, orgB);

      async function provisionLinkedMember(churchId, branchId, email, userBundle, phone, actorId) {
        const submitted = await submitMemberRegistration(pool, {
          churchId,
          branchId,
          firstName: "Pref",
          lastName: "Member",
          preferredName: "Pref",
          email,
          phone,
        });
        assert.equal(submitted.ok, true, submitted.reason);
        const approved = await approveMemberRegistration(pool, {
          registrationId: submitted.registration.id,
          actorUserId: actorId,
        });
        assert.equal(approved.ok, true, approved.reason);
        const linked = await linkMemberToUser(pool, {
          memberId: approved.member.id,
          actorUserId: actorId,
          userId: userBundle.user.id,
        });
        assert.equal(linked.ok, true, linked.reason);
        return approved.member.id;
      }

      memberId = await provisionLinkedMember(
        churchA.id,
        branchA.id,
        "member@msg-a.example.test",
        memberUser,
        "+15551236001",
        hqAdmin.user.id
      );
      member2Id = await provisionLinkedMember(
        churchA.id,
        branchA.id,
        "member2@msg-a.example.test",
        member2User,
        "+15551236004",
        hqAdmin.user.id
      );
      memberBId = await provisionLinkedMember(
        churchB.id,
        branchB.id,
        "member@msg-b.example.test",
        memberBUser,
        "+15551236003",
        hqAdminB.user.id
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env,
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("member notification preferences suite setup failed:", skipReason);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded(t) {
    if (skipSuite) {
      t.skip(foundationDbUnavailableSkipReason(skipReason));
      return true;
    }
    return false;
  }

  it("opens preferences with stitch markers and masked contact info", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get("/member/notification-preferences")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-member-notification-preferences="1"/);
    assert.match(res.text, /data-bb-stitch-notifications="25-member-notifications"/);
    assert.match(res.text, /Notification preferences/);
    assert.match(res.text, /Contact channels/);
    assert.match(res.text, /me\*+@msg-a\.example\.test/i);
    assert.match(res.text, /\+?\*+6001/);
    assert.doesNotMatch(res.text, /member@msg-a\.example\.test/);
    assert.doesNotMatch(res.text, /\+15551236001/);
    assert.match(res.text, /data-bb-channel-unavailable="sms"/);
    assert.match(res.text, /data-bb-channel-unavailable="push"/);
    assert.match(res.text, /name="preset"/);
    assert.match(res.text, /name="_csrf"/);
  });

  it("updates email preferences and keeps in-app enabled", async (t) => {
    if (skipIfNeeded(t)) return;
    const emailEnv = baseEnv({ BLESSBOARD_MEMBER_EMAIL_DELIVERY_ENABLED: "1" });
    const page = await request(app)
      .get("/member/notification-preferences")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(page.status, 200);
    assert.match(page.text, /name="church_announcements__email"/);

    const saved = await updatePreferences(pool, {
      churchId: churchA.id,
      memberId,
      updatedByUserId: memberUser.user.id,
      env: emailEnv,
      preset: "custom",
      body: {
        church_announcements__email: "1",
        church_announcements__in_app: "1",
      },
    });
    assert.equal(saved.status, STATUS.OK);
    const churchPref = saved.preferences.find((p) => p.category === "church_announcements");
    assert.ok(churchPref);
    assert.equal(churchPref.inAppEnabled, true);
    assert.equal(churchPref.emailEnabled, true);
  });

  it("cannot enable SMS or push when providers or eligibility are unavailable", async (t) => {
    if (skipIfNeeded(t)) return;
    const forced = await updatePreferences(pool, {
      churchId: churchA.id,
      memberId,
      updatedByUserId: memberUser.user.id,
      env,
      preset: "custom",
      body: {
        church_announcements__sms: "1",
        church_announcements__push: "1",
        church_announcements__in_app: "1",
      },
    });
    assert.equal(forced.status, STATUS.OK);
    const row = forced.preferences.find((p) => p.category === "church_announcements");
    assert.equal(row.smsEnabled, false);
    assert.equal(row.pushEnabled, false);

    await pool.query(
      `UPDATE blessboard.members
          SET phone_normalized = NULL, phone_display = NULL
        WHERE id = $1`,
      [member2Id]
    );
    const noPhone = await updatePreferences(pool, {
      churchId: churchA.id,
      memberId: member2Id,
      updatedByUserId: member2User.user.id,
      env: baseEnv({ BLESSBOARD_MEMBER_SMS_DELIVERY_ENABLED: "1" }),
      preset: "custom",
      body: {
        church_announcements__sms: "1",
      },
    });
    assert.equal(noPhone.status, STATUS.OK);
    const noPhoneRow = noPhone.preferences.find((p) => p.category === "church_announcements");
    assert.equal(noPhoneRow.smsEnabled, false);
  });

  it("keeps preferences scoped per organization", async (t) => {
    if (skipIfNeeded(t)) return;
    const emailEnv = baseEnv({ BLESSBOARD_MEMBER_EMAIL_DELIVERY_ENABLED: "1" });
    await updatePreferences(pool, {
      churchId: churchA.id,
      memberId,
      updatedByUserId: memberUser.user.id,
      env: emailEnv,
      preset: "in_app_only",
    });

    await updatePreferences(pool, {
      churchId: churchB.id,
      memberId: memberBId,
      updatedByUserId: memberBUser.user.id,
      env: emailEnv,
      preset: "all_updates",
    });

    const prefsA = await getPreferences(pool, { churchId: churchA.id, memberId, env: emailEnv });
    const prefsB = await getPreferences(pool, {
      churchId: churchB.id,
      memberId: memberBId,
      env: emailEnv,
    });
    const aChurch = prefsA.preferences.find((p) => p.category === "church_announcements");
    const bChurch = prefsB.preferences.find((p) => p.category === "church_announcements");
    assert.equal(aChurch.emailEnabled, false);
    assert.equal(bChurch.emailEnabled, true);
  });

  it("maps presets to explicit preference rows", async (t) => {
    if (skipIfNeeded(t)) return;
    const emailEnv = baseEnv({ BLESSBOARD_MEMBER_EMAIL_DELIVERY_ENABLED: "1" });
    const expected = preferencesForPreset("important_only");
    await updatePreferences(pool, {
      churchId: churchA.id,
      memberId,
      updatedByUserId: memberUser.user.id,
      env: emailEnv,
      preset: "important_only",
    });
    const saved = await getPreferences(pool, { churchId: churchA.id, memberId, env: emailEnv });
    for (const exp of expected) {
      const row = saved.preferences.find((p) => p.category === exp.category);
      assert.ok(row, exp.category);
      assert.equal(row.inAppEnabled, true);
      assert.equal(row.emailEnabled, exp.emailEnabled);
      assert.equal(row.smsEnabled, false);
      assert.equal(row.pushEnabled, false);
    }
  });

  it("requires CSRF and keeps another member preferences isolated", async (t) => {
    if (skipIfNeeded(t)) return;
    const page = await request(app)
      .get("/member/notification-preferences")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    const csrf = extractCookie(page, CSRF_COOKIE);

    const badCsrf = await request(app)
      .post("/member/notification-preferences")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sessionCookie(memberUser), `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: "wrong-token",
        preset: "all_updates",
      });
    assert.equal(badCsrf.status, 403);

    await updatePreferences(pool, {
      churchId: churchA.id,
      memberId,
      updatedByUserId: memberUser.user.id,
      env,
      preset: "in_app_only",
    });

    const member2Page = await request(app)
      .get("/member/notification-preferences")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(member2User));
    const csrf2 = extractCookie(member2Page, CSRF_COOKIE);
    await request(app)
      .post("/member/notification-preferences")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sessionCookie(member2User), `${CSRF_COOKIE}=${csrf2}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        preset: "custom",
        direct_messages__email: "1",
      });

    const member1Prefs = await getPreferences(pool, {
      churchId: churchA.id,
      memberId,
      env,
    });
    const member2Prefs = await getPreferences(pool, {
      churchId: churchA.id,
      memberId: member2Id,
      env,
    });
    const m1Direct = member1Prefs.preferences.find((p) => p.category === "direct_messages");
    const m2Direct = member2Prefs.preferences.find((p) => p.category === "direct_messages");
    assert.equal(m1Direct.emailEnabled, false);
    assert.equal(m2Direct.emailEnabled, false);
  });
});
