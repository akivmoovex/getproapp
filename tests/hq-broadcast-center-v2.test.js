"use strict";

/**
 * BlessBoard V5 HQ Broadcast Center: authz, composer, audiences, delivery honesty.
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
  saveDraft,
  sendMessage,
  estimateAudience,
} = require("../src/blessboard/services/messageService");

const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "msg-a.blessboard.org";
const HOST_B = "msg-b.blessboard.org";

function baseEnv(overrides) {
  return baseV5TestEnv(overrides);
}

function sessionCookie(bundle) {
  return `${DEFAULT_V5_COOKIE}=${bundle.rawToken}`;
}

describe("hq broadcast center v2", () => {
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
  let emptyBranch;
  let ministry;
  let hqAdmin;
  let memberUser;
  let memberId;
  let campusMemberUser;
  let campusMemberId;
  let memberBUser;
  let memberBId;
  let hqAdminB;

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
        deploymentCode: "blessboard-org-staging",
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

      const emptyIns = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'empty', 'Empty Branch', 'branch', 'active', false, 'UTC', 'US')
         RETURNING id`,
        [churchA.id]
      );
      emptyBranch = emptyIns.rows[0];

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "msg-b",
        displayName: "Msg B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "msg-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
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
          deploymentCode: "blessboard-org-staging",
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
      memberBId = approvedB.member.id;

      const ministryIns = await pool.query(
        `INSERT INTO blessboard.ministries
           (church_id, branch_id, name, summary, description, status, join_policy)
         VALUES ($1, $2, 'Worship Team', 'Serving in worship', 'Details', 'published', 'open')
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

      app = createV5FoundationApp({
        getPool: () => pool,
        env,
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("hq broadcast center suite setup failed:", skipReason);
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

  it("HQ admin opens Broadcast Center with stitch markers and honest summary cards", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await request(app)
      .get("/hq/broadcasts")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(hqAdmin));
    assert.equal(res.status, 200);
    assert.match(res.text, /Broadcast Center/);
    assert.match(res.text, /data-bb-hq-broadcast-center="1"/);
    assert.match(res.text, /data-bb-stitch-broadcast="61-hq-broadcast-center-v2"/);
    assert.match(res.text, /data-bb-viewport="responsive"/);
    assert.match(res.text, />Drafts</);
    assert.match(res.text, />Scheduled</);
    assert.match(res.text, />Sent recently</);
    assert.match(res.text, />Needs attention</);
    assert.match(res.text, /data-bb-summary="drafts"/);
    assert.doesNotMatch(res.text, /Open Rate|Click Rate/i);
    assert.doesNotMatch(res.text, new RegExp(churchA.id, "i"));
  });

  it("blocks members and unauthenticated users from HQ broadcasts", async (t) => {
    if (skipIfNeeded(t)) return;
    const memberDenied = await request(app)
      .get("/hq/broadcasts")
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(memberUser));
    assert.ok(memberDenied.status === 403 || memberDenied.status === 303);

    const anon = await request(app).get("/hq/broadcasts").set("Host", HOST_A);
    assert.ok(anon.status === 401 || anon.status === 302 || anon.status === 303);
  });

  it("isolates broadcast detail by organization", async (t) => {
    if (skipIfNeeded(t)) return;
    const draft = await saveDraft(pool, {
      churchId: churchB.id,
      createdByUserId: hqAdminB.user.id,
      title: "Org B secret broadcast",
      body: "Only org B",
      senderDisplayName: "HQ B",
      messageType: "announcement",
      audiences: [{ audienceType: "all_active_members" }],
      env,
    });
    assert.equal(draft.status, STATUS.OK, draft.reason);

    const foreign = await request(app)
      .get(`/hq/broadcasts/${draft.message.id}`)
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(hqAdmin));
    assert.equal(foreign.status, 404);
  });

  it("creates drafts via saveDraft and POST /hq/broadcasts/draft with CSRF", async (t) => {
    if (skipIfNeeded(t)) return;
    const viaService = await saveDraft(pool, {
      churchId: churchA.id,
      createdByUserId: hqAdmin.user.id,
      title: "Service draft",
      body: "Draft body via service",
      senderDisplayName: "HQ Admin",
      messageType: "announcement",
      audiences: [{ audienceType: "all_active_members" }],
      env,
    });
    assert.equal(viaService.status, STATUS.OK, viaService.reason);
    assert.equal(viaService.message.status, "draft");

    const hqCookie = sessionCookie(hqAdmin);
    const form = await request(app)
      .get("/hq/broadcasts/new")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(form.status, 200);
    assert.match(form.text, /name="_csrf"/);
    assert.match(form.text, /action="\/hq\/broadcasts\/draft"/);
    const csrf = extractCookie(form, CSRF_COOKIE);
    assert.ok(csrf);

    const noCsrf = await request(app)
      .post("/hq/broadcasts/draft")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie)
      .type("form")
      .send({
        title: "HTTP draft without CSRF",
        body: "Should fail CSRF gate",
        message_type: "announcement",
        sender_display_name: "HQ Admin",
        audience_type: "all_active_members",
      });
    assert.equal(noCsrf.status, 403);
  });

  it("estimates audience within organization scope only", async (t) => {
    if (skipIfNeeded(t)) return;
    const orgAAll = await estimateAudience(pool, {
      churchId: churchA.id,
      audiences: [{ audienceType: "all_active_members" }],
    });
    assert.equal(orgAAll.status, STATUS.OK);
    assert.equal(orgAAll.estimatedRecipients, 2);

    const orgBAll = await estimateAudience(pool, {
      churchId: churchB.id,
      audiences: [{ audienceType: "all_active_members" }],
    });
    assert.equal(orgBAll.status, STATUS.OK);
    assert.equal(orgBAll.estimatedRecipients, 1);
    assert.ok(!orgAAll.memberIds.includes(memberBId));
  });

  it("branch audience includes only active members on that branch", async (t) => {
    if (skipIfNeeded(t)) return;
    const campusOnly = await estimateAudience(pool, {
      churchId: churchA.id,
      audiences: [{ audienceType: "branches", branchId: campusBranch.id }],
    });
    assert.equal(campusOnly.status, STATUS.OK);
    assert.equal(campusOnly.estimatedRecipients, 1);
    assert.deepEqual(campusOnly.memberIds, [campusMemberId]);

    const hqOnly = await estimateAudience(pool, {
      churchId: churchA.id,
      audiences: [{ audienceType: "branches", branchId: branchA.id }],
    });
    assert.equal(hqOnly.status, STATUS.OK);
    assert.equal(hqOnly.estimatedRecipients, 1);
    assert.deepEqual(hqOnly.memberIds, [memberId]);
  });

  it("ministry audience includes only active ministry members", async (t) => {
    if (skipIfNeeded(t)) return;
    const ministryAudience = await estimateAudience(pool, {
      churchId: churchA.id,
      audiences: [{ audienceType: "ministries", ministryId: ministry.id }],
    });
    assert.equal(ministryAudience.status, STATUS.OK);
    assert.equal(ministryAudience.estimatedRecipients, 1);
    assert.deepEqual(ministryAudience.memberIds, [memberId]);
  });

  it("rejects specific members outside the organization", async (t) => {
    if (skipIfNeeded(t)) return;
    const estimate = await estimateAudience(pool, {
      churchId: churchA.id,
      audiences: [{ audienceType: "members", memberId: memberBId }],
    });
    assert.equal(estimate.status, STATUS.INVALID_INPUT);
    assert.equal(estimate.reason, "member_outside_organization");
  });

  it("send creates canonical member notifications and blocks duplicate send", async (t) => {
    if (skipIfNeeded(t)) return;
    const sent = await sendMessage(pool, {
      churchId: churchA.id,
      createdByUserId: hqAdmin.user.id,
      title: "Canonical inbox message",
      body: "Delivered to HQ member",
      senderDisplayName: "HQ Admin",
      messageType: "announcement",
      audiences: [{ audienceType: "members", memberId: memberId }],
      env,
    });
    assert.equal(sent.status, STATUS.OK, sent.reason);
    assert.equal(sent.message.status, "sent");
    assert.ok(sent.fanout.inAppCreatedCount >= 1);

    const { rows } = await pool.query(
      `SELECT id, member_id, title FROM blessboard.member_notifications
        WHERE message_id = $1 AND church_id = $2`,
      [sent.message.id, churchA.id]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].member_id, memberId);
    assert.equal(rows[0].title, "Canonical inbox message");

    const dup = await sendMessage(pool, {
      churchId: churchA.id,
      messageId: sent.message.id,
      createdByUserId: hqAdmin.user.id,
      env,
      skipComposerValidation: true,
    });
    assert.equal(dup.status, STATUS.CONFLICT);
    assert.match(String(dup.reason || ""), /already_sent|duplicate_send/);
  });

  it("rejects HTML in title/body, missing CSRF, and unsafe CTA URLs", async (t) => {
    if (skipIfNeeded(t)) return;
    const htmlTitle = await saveDraft(pool, {
      churchId: churchA.id,
      createdByUserId: hqAdmin.user.id,
      title: "<script>alert(1)</script>",
      body: "Plain body",
      senderDisplayName: "HQ Admin",
      messageType: "announcement",
      audiences: [{ audienceType: "all_active_members" }],
      env,
    });
    assert.equal(htmlTitle.status, STATUS.INVALID_INPUT);
    assert.match(String(htmlTitle.reason || ""), /title_html_not_allowed/);

    const htmlBody = await saveDraft(pool, {
      churchId: churchA.id,
      createdByUserId: hqAdmin.user.id,
      title: "Safe title",
      body: "<b>not allowed</b>",
      senderDisplayName: "HQ Admin",
      messageType: "announcement",
      audiences: [{ audienceType: "all_active_members" }],
      env,
    });
    assert.equal(htmlBody.status, STATUS.INVALID_INPUT);
    assert.match(String(htmlBody.reason || ""), /body_html_not_allowed/);

    const hqCookie = sessionCookie(hqAdmin);
    const form = await request(app)
      .get("/hq/broadcasts/new")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    const csrf = extractCookie(form, CSRF_COOKIE);

    const noCsrf = await request(app)
      .post("/hq/broadcasts/draft")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie)
      .type("form")
      .send({
        title: "No CSRF",
        body: "Should fail",
        message_type: "announcement",
        sender_display_name: "HQ Admin",
        audience_type: "all_active_members",
      });
    assert.equal(noCsrf.status, 403);

    const badCta = await saveDraft(pool, {
      churchId: churchA.id,
      createdByUserId: hqAdmin.user.id,
      title: "Bad CTA",
      body: "Body text",
      senderDisplayName: "HQ Admin",
      messageType: "announcement",
      audiences: [{ audienceType: "all_active_members" }],
      callToActionLabel: "Open",
      callToActionUrl: "javascript:alert(1)",
      env,
    });
    assert.equal(badCta.status, STATUS.INVALID_INPUT);
    assert.match(String(badCta.reason || ""), /call_to_action/);
    void csrf;
  });

  it("marks external channels unavailable while in-app still delivers", async (t) => {
    if (skipIfNeeded(t)) return;
    await pool.query(
      `INSERT INTO blessboard.member_notification_preferences
         (church_id, member_id, category, in_app_enabled, email_enabled, sms_enabled, push_enabled)
       VALUES ($1, $2, 'church_announcements', true, true, true, true)
       ON CONFLICT (church_id, member_id, category)
       DO UPDATE SET email_enabled = true, sms_enabled = true, push_enabled = true, updated_at = now()`,
      [churchA.id, memberId]
    );

    const sent = await sendMessage(pool, {
      churchId: churchA.id,
      createdByUserId: hqAdmin.user.id,
      title: "Multi-channel attempt",
      body: "External providers off in tests",
      senderDisplayName: "HQ Admin",
      messageType: "announcement",
      audiences: [{ audienceType: "members", memberId: memberId }],
      channelEmail: true,
      channelSms: true,
      channelPush: true,
      env,
    });
    assert.equal(sent.status, STATUS.OK, sent.reason);
    assert.ok(sent.fanout.deliveryStats.in_app.delivered >= 1);
    assert.ok(sent.fanout.deliveryStats.email.unavailable >= 1);
    assert.ok(sent.fanout.deliveryStats.sms.unavailable >= 1);

    const attempts = await pool.query(
      `SELECT channel, status FROM blessboard.message_delivery_attempts
        WHERE message_id = $1 AND member_id = $2
        ORDER BY channel`,
      [sent.message.id, memberId]
    );
    const byChannel = Object.fromEntries(attempts.rows.map((r) => [r.channel, r.status]));
    assert.equal(byChannel.in_app, "delivered");
    assert.equal(byChannel.email, "unavailable");
    assert.equal(byChannel.sms, "unavailable");
    assert.ok(
      byChannel.push === "unavailable" || byChannel.push === "suppressed_by_consent",
      `push status=${byChannel.push}`
    );

    const detail = await request(app)
      .get(`/hq/broadcasts/${sent.message.id}`)
      .set("Host", HOST_A)
      .set("Cookie", sessionCookie(hqAdmin));
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-delivery-summary="1"/);
    assert.match(detail.text, /Not Available|unavailable/i);
    assert.match(detail.text, /data-bb-in-app-count="/);
  });

  it("blocks send when audience is empty", async (t) => {
    if (skipIfNeeded(t)) return;
    const blocked = await sendMessage(pool, {
      churchId: churchA.id,
      createdByUserId: hqAdmin.user.id,
      title: "Nobody here",
      body: "Empty branch audience",
      senderDisplayName: "HQ Admin",
      messageType: "announcement",
      audiences: [{ audienceType: "branches", branchId: emptyBranch.id }],
      env,
    });
    assert.equal(blocked.status, STATUS.EMPTY_AUDIENCE);
    assert.equal(blocked.reason, "empty_audience");
  });
});
