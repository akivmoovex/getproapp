"use strict";

/**
 * BlessBoard V5 member notification inbox: scoping, reads, categories, safety.
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
  STATUS: MSG_STATUS,
  saveDraft,
  sendMessage,
} = require("../src/blessboard/services/messageService");
const {
  STATUS,
  listInbox,
  getNotification,
  markRead,
  markUnread,
  markAllRead,
  archiveNotification,
} = require("../src/blessboard/services/memberNotificationService");

const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "msg-a.blessboard.org";
const HOST_B = "msg-b.blessboard.org";

function baseEnv(overrides) {
  return baseV5TestEnv(overrides);
}

function sessionCookie(bundle) {
  return `${DEFAULT_V5_COOKIE}=${bundle.rawToken}`;
}

describe("member notifications inbox", () => {
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
  let campusBranch;
  let ministry;
  let hqAdmin;
  let hqAdminB;
  let memberUser;
  let memberId;
  let member2User;
  let member2Id;
  let campusMemberUser;
  let campusMemberId;
  let memberBUser;
  let notificationIds;

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

      const campusIns = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus', 'Campus A', 'branch', 'active', false, 'UTC', 'US')
         RETURNING id`,
        [churchA.id]
      );
      campusBranch = campusIns.rows[0];

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
      campusMemberUser = await makeUser("campus-member@msg-a.example.test", null, orgA);
      memberBUser = await makeUser("member@msg-b.example.test", null, orgB);

      async function provisionLinkedMember(email, userBundle, phone, branch) {
        const submitted = await submitMemberRegistration(pool, {
          churchId: churchA.id,
          branchId: branch.id,
          firstName: "Msg",
          lastName: "Member",
          preferredName: "Msg",
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
        "member@msg-a.example.test",
        memberUser,
        "+15551236001",
        branchA
      );
      member2Id = await provisionLinkedMember(
        "member2@msg-a.example.test",
        member2User,
        "+15551236004",
        branchA
      );
      campusMemberId = await provisionLinkedMember(
        "campus-member@msg-a.example.test",
        campusMemberUser,
        "+15551236002",
        campusBranch
      );

      const submittedB = await submitMemberRegistration(pool, {
        churchId: churchB.id,
        branchId: branchB.id,
        firstName: "Other",
        lastName: "Member",
        email: "member@msg-b.example.test",
        phone: "+15551236003",
      });
      assert.equal(submittedB.ok, true, submittedB.reason);
      const approvedB = await approveMemberRegistration(pool, {
        registrationId: submittedB.registration.id,
        actorUserId: hqAdminB.user.id,
      });
      assert.equal(approvedB.ok, true, approvedB.reason);
      await linkMemberToUser(pool, {
        memberId: approvedB.member.id,
        actorUserId: hqAdminB.user.id,
        userId: memberBUser.user.id,
      });

      const ministryIns = await pool.query(
        `INSERT INTO blessboard.ministries
           (church_id, branch_id, name, summary, description, status, join_policy)
         VALUES ($1, $2, 'Youth Group', 'Youth ministry', 'Details', 'published', 'open')
         RETURNING id`,
        [churchA.id, branchA.id]
      );
      ministry = ministryIns.rows[0];
      await pool.query(
        `INSERT INTO blessboard.ministry_memberships
           (church_id, ministry_id, member_id, status, joined_at)
         VALUES ($1, $2, $3, 'active', now())`,
        [churchA.id, ministry.id, memberId]
      );

      async function deliver(title, extra) {
        const result = await sendMessage(pool, {
          churchId: churchA.id,
          createdByUserId: hqAdmin.user.id,
          title,
          body: `${title} body`,
          senderDisplayName: "HQ Admin",
          messageType: "announcement",
          audiences: [{ audienceType: "all_active_members" }],
          env,
          ...extra,
        });
        assert.equal(result.status, MSG_STATUS.OK, result.reason);
        return result.message.id;
      }

      notificationIds = {};
      await deliver("Church-wide notice");
      await sendMessage(pool, {
        churchId: churchA.id,
        createdByUserId: hqAdmin.user.id,
        title: "Direct to member one",
        body: "Private note",
        senderDisplayName: "HQ Admin",
        messageType: "direct_message",
        audiences: [{ audienceType: "members", memberId: memberId }],
        env,
      });
      await sendMessage(pool, {
        churchId: churchA.id,
        createdByUserId: hqAdmin.user.id,
        title: "Campus branch only",
        body: "Campus scoped",
        senderDisplayName: "HQ Admin",
        messageType: "announcement",
        audiences: [{ audienceType: "branches", branchId: campusBranch.id }],
        env,
      });
      await sendMessage(pool, {
        churchId: churchA.id,
        createdByUserId: hqAdmin.user.id,
        title: "Ministry update",
        body: "Ministry scoped",
        senderDisplayName: "HQ Admin",
        messageType: "ministry_announcement",
        audiences: [{ audienceType: "ministries", ministryId: ministry.id }],
        env,
      });

      const inboxRows = await pool.query(
        `SELECT id, member_id, title, category
           FROM blessboard.member_notifications
          WHERE church_id = $1 AND member_id = $2
          ORDER BY created_at ASC`,
        [churchA.id, memberId]
      );
      for (const row of inboxRows.rows) {
        notificationIds[row.title] = row.id;
      }

      app = createV5FoundationApp({
        getPool: () => pool,
        env,
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("member notifications suite setup failed:", skipReason);
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

  it("member opens inbox with stitch markers and only own notifications", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get("/member/notifications")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-member-notifications="1"/);
    assert.match(res.text, /data-bb-stitch-notifications="25-member-notifications"/);
    assert.match(res.text, /data-bb-viewport="responsive"/);
    assert.match(res.text, /Church-wide notice/);
    assert.match(res.text, /Direct to member one/);
    assert.match(res.text, /Ministry update/);
    assert.doesNotMatch(res.text, /Campus branch only/);
    assert.doesNotMatch(res.text, new RegExp(memberId, "i"));
    assert.doesNotMatch(res.text, new RegExp(churchA.id, "i"));

    const serviceList = await listInbox(pool, {
      churchId: churchA.id,
      memberId,
      category: "all",
    });
    assert.equal(serviceList.status, STATUS.OK);
    assert.ok(serviceList.items.every((item) => item.title !== "Campus branch only"));
  });

  it("returns 404 for another member notification and cross-tenant access", async (t) => {
    if (skipIfNeeded(t)) return;
    const otherMemberNote = await pool.query(
      `SELECT id FROM blessboard.member_notifications
        WHERE church_id = $1 AND member_id = $2
        LIMIT 1`,
      [churchA.id, member2Id]
    );
    assert.ok(otherMemberNote.rows[0]);

    const crossMember = await request(app)
      .get(`/member/notifications/${otherMemberNote.rows[0].id}`)
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(crossMember.status, 404);

    const ownId = notificationIds["Church-wide notice"];
    const crossTenant = await request(app)
      .get(`/member/notifications/${ownId}`)
      .set("Host", HOST_B)
      .set("Cookie", sessionCookie(memberBUser));
    assert.ok(crossTenant.status === 403 || crossTenant.status === 404);
  });

  it("shows unread markers and supports mark read, unread, all read, and archive", async (t) => {
    if (skipIfNeeded(t)) return;
    const noteId = notificationIds["Direct to member one"];
    assert.ok(noteId);

    const unreadList = await request(app)
      .get("/member/notifications")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(unreadList.status, 200);
    assert.match(unreadList.text, /is-unread/);
    assert.match(unreadList.text, /bb-mp-notification-card__dot/);

    const detail = await request(app)
      .get(`/member/notifications/${noteId}`)
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-member-notification-detail="1"/);

    const markedUnread = await markUnread(pool, {
      churchId: churchA.id,
      memberId,
      notificationId: noteId,
    });
    assert.equal(markedUnread.status, STATUS.OK);

    const markedRead = await markRead(pool, {
      churchId: churchA.id,
      memberId,
      notificationId: noteId,
    });
    assert.equal(markedRead.status, STATUS.OK);
    assert.ok(markedRead.item.readAt);

    const allRead = await markAllRead(pool, { churchId: churchA.id, memberId });
    assert.equal(allRead.status, STATUS.OK);

    const listForCsrf = await request(app)
      .get("/member/notifications")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    const csrf = extractCookie(listForCsrf, CSRF_COOKIE);
    const badCsrf = await request(app)
      .post("/member/notifications/read-all")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sessionCookie(memberUser), `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: "wrong-token" });
    assert.equal(badCsrf.status, 403);

    const archiveSent = await sendMessage(pool, {
      churchId: churchA.id,
      createdByUserId: hqAdmin.user.id,
      title: "Archive target notice",
      body: "Temporary row for archive test",
      senderDisplayName: "HQ Admin",
      messageType: "administrative_notice",
      audiences: [{ audienceType: "members", memberId: memberId }],
      env,
    });
    assert.equal(archiveSent.status, MSG_STATUS.OK, archiveSent.reason);
    const archiveRow = await pool.query(
      `SELECT id FROM blessboard.member_notifications
        WHERE message_id = $1 AND member_id = $2`,
      [archiveSent.message.id, memberId]
    );
    const archiveTarget = archiveRow.rows[0].id;
    const archived = await archiveNotification(pool, {
      churchId: churchA.id,
      memberId,
      notificationId: archiveTarget,
    });
    assert.equal(archived.status, STATUS.OK);

    const afterArchive = await listInbox(pool, {
      churchId: churchA.id,
      memberId,
      category: "all",
    });
    assert.ok(!afterArchive.items.some((item) => item.id === archiveTarget));
  });

  it("filters inbox by category", async (t) => {
    if (skipIfNeeded(t)) return;
    const ministries = await request(app)
      .get("/member/notifications?category=ministries")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(ministries.status, 200);
    assert.match(ministries.text, /Ministry update/);
    assert.doesNotMatch(ministries.text, /Church-wide notice/);

    const direct = await request(app)
      .get("/member/notifications?category=direct")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(direct.status, 200);
    assert.match(direct.text, /Direct to member one/);
    assert.doesNotMatch(direct.text, /Ministry update/);
  });

  it("scopes direct, branch, and org-wide audiences correctly", async (t) => {
    if (skipIfNeeded(t)) return;
    const directOnly = await getNotification(pool, {
      churchId: churchA.id,
      memberId,
      notificationId: notificationIds["Direct to member one"],
    });
    assert.equal(directOnly.status, STATUS.OK);

    const member2Direct = await getNotification(pool, {
      churchId: churchA.id,
      memberId: member2Id,
      notificationId: notificationIds["Direct to member one"],
    });
    assert.equal(member2Direct.status, STATUS.NOT_FOUND);

    const campusInbox = await listInbox(pool, {
      churchId: churchA.id,
      memberId: campusMemberId,
      category: "all",
    });
    const campusTitles = campusInbox.items.map((i) => i.title);
    assert.ok(campusTitles.includes("Campus branch only"));
    assert.ok(!campusTitles.includes("Direct to member one"));

    const hqInbox = await listInbox(pool, {
      churchId: churchA.id,
      memberId,
      category: "all",
    });
    assert.ok(hqInbox.items.some((i) => i.title === "Church-wide notice"));
    assert.ok(!hqInbox.items.some((i) => i.title === "Campus branch only"));
  });

  it("does not allow HQ to manually create giving_receipt broadcasts", async (t) => {
    if (skipIfNeeded(t)) return;
    const blocked = await saveDraft(pool, {
      churchId: churchA.id,
      createdByUserId: hqAdmin.user.id,
      title: "Fake receipt",
      body: "Should not compose",
      senderDisplayName: "HQ Admin",
      messageType: "giving_receipt",
      audiences: [{ audienceType: "members", memberId: memberId }],
      env,
    });
    assert.equal(blocked.status, MSG_STATUS.INVALID_INPUT);
    assert.match(String(blocked.reason || ""), /message_type/);

    const compose = await request(app)
      .get("/hq/broadcasts/new")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(hqAdmin));
    assert.equal(compose.status, 200);
    assert.doesNotMatch(compose.text, /value="giving_receipt"/);
  });

  it("escapes unsafe body content and keeps CTA URLs safe", async (t) => {
    if (skipIfNeeded(t)) return;
    const sent = await sendMessage(pool, {
      churchId: churchA.id,
      createdByUserId: hqAdmin.user.id,
      title: "Safe render check",
      body: "Initial body",
      senderDisplayName: "HQ Admin",
      messageType: "announcement",
      audiences: [{ audienceType: "members", memberId: memberId }],
      callToActionLabel: "Open giving",
      callToActionUrl: "/member/giving",
      env,
    });
    assert.equal(sent.status, MSG_STATUS.OK, sent.reason);

    const note = await pool.query(
      `SELECT id FROM blessboard.member_notifications
        WHERE message_id = $1 AND member_id = $2`,
      [sent.message.id, memberId]
    );
    const noteId = note.rows[0].id;

    await pool.query(
      `UPDATE blessboard.member_notifications
          SET body = $1
        WHERE id = $2`,
      ["Hello <script>alert(1)</script>", noteId]
    );

    const detail = await request(app)
      .get(`/member/notifications/${noteId}`)
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.equal(detail.status, 200);
    assert.doesNotMatch(detail.text, /<script>alert\(1\)<\/script>/);
    assert.match(detail.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(detail.text, /href="\/member\/giving"/);

    const badCta = await saveDraft(pool, {
      churchId: churchA.id,
      createdByUserId: hqAdmin.user.id,
      title: "Bad CTA inbox",
      body: "Body",
      senderDisplayName: "HQ Admin",
      messageType: "announcement",
      audiences: [{ audienceType: "members", memberId: memberId }],
      callToActionLabel: "Evil",
      callToActionUrl: "javascript:alert(1)",
      env,
    });
    assert.equal(badCta.status, MSG_STATUS.INVALID_INPUT);
    assert.match(String(badCta.reason || ""), /call_to_action/);
  });
});
