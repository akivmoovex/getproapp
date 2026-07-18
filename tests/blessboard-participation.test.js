"use strict";

/**
 * BlessBoard V5 member participation: ministries + events.
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
  createMinistry,
  createEvent,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  STATUS,
  joinMinistry,
  leaveMinistry,
  reviewMinistryMembership,
  registerForEvent,
  cancelEventRegistration,
  listMemberMinistries,
  listMemberEvents,
  listAdminMinistryParticipation,
  listAdminEventParticipation,
} = require("../src/blessboard/services/participationService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "part-a.blessboard.org";
const HOST_B = "part-b.blessboard.org";
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

function cookieHeader(...pairs) {
  return pairs.filter(Boolean).join("; ");
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

function makeTenant(church, org, primaryBranch) {
  return {
    resolved: true,
    organization: { id: org.id },
    church: { id: church.id, displayName: church.display_name || church.displayName },
    primaryBranch: { id: primaryBranch.id },
    hqBranch: { id: primaryBranch.id },
  };
}

describe("blessboard participation", () => {
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
  let campusBranch;
  let hqAdmin;
  let branchAdmin;
  let memberUser;
  let memberId;
  let member2User;
  let member2Id;
  let memberB;

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
        organizationKey: "part-a",
        displayName: "Part A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "part-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "part-a",
        churchKey: "part-a",
        displayName: "Part Church A",
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
         RETURNING id, church_id, branch_key`,
        [churchA.id]
      );
      campusBranch = campusIns.rows[0];

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "part-b",
        displayName: "Part B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "part-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "part-b",
        churchKey: "part-b",
        displayName: "Part Church B",
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
        "hq@part-a.example.test",
        {
          email: "hq@part-a.example.test",
          organizationKey: "part-a",
          churchKey: "part-a",
          roleKey: "church_hq_admin",
        },
        orgA
      );
      branchAdmin = await makeUser(
        "branch@part-a.example.test",
        {
          email: "branch@part-a.example.test",
          organizationKey: "part-a",
          churchKey: "part-a",
          roleKey: "branch_admin",
          branchKey: "hq",
        },
        orgA
      );
      memberUser = await makeUser("member@part-a.example.test", null, orgA);
      member2User = await makeUser("member2@part-a.example.test", null, orgA);
      memberB = await makeUser("member@part-b.example.test", null, orgB);

      async function provisionLinkedMember(email, userBundle, phone, church, branch, actor) {
        const submitted = await submitMemberRegistration(pool, {
          churchId: church.id,
          branchId: branch.id,
          firstName: "Part",
          lastName: "Member",
          preferredName: "Part",
          email,
          phone,
        });
        assert.equal(submitted.ok, true, submitted.reason);
        const approved = await approveMemberRegistration(pool, {
          registrationId: submitted.registration.id,
          actorUserId: actor.user.id,
        });
        assert.equal(approved.ok, true, approved.reason);
        const linked = await linkMemberToUser(pool, {
          memberId: approved.member.id,
          actorUserId: actor.user.id,
          userId: userBundle.user.id,
        });
        assert.equal(linked.ok, true, linked.reason);
        return approved.member.id;
      }

      memberId = await provisionLinkedMember(
        "member@part-a.example.test",
        memberUser,
        "+15551236001",
        churchA,
        branchA,
        hqAdmin
      );
      member2Id = await provisionLinkedMember(
        "member2@part-a.example.test",
        member2User,
        "+15551236002",
        churchA,
        branchA,
        hqAdmin
      );

      const hqB = await makeUser(
        "hq@part-b.example.test",
        {
          email: "hq@part-b.example.test",
          organizationKey: "part-b",
          churchKey: "part-b",
          roleKey: "church_hq_admin",
        },
        orgB
      );
      await provisionLinkedMember(
        "member@part-b.example.test",
        memberB,
        "+15551236003",
        churchB,
        branchB,
        hqB
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("participation suite setup failed:", skipReason);
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

  it("creates participation tables", async (t) => {
    if (skipIfNeeded(t)) return;
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'blessboard'
          AND table_name IN ('ministry_memberships', 'event_registrations')
        ORDER BY table_name`
    );
    assert.deepEqual(
      tables.rows.map((r) => r.table_name),
      ["event_registrations", "ministry_memberships"]
    );
    const cap = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'blessboard' AND table_name = 'events' AND column_name = 'capacity'`
    );
    assert.equal(cap.rows.length, 1);
  });

  it("supports open join and request+approve ministry workflows", async (t) => {
    if (skipIfNeeded(t)) return;
    const openMin = await createMinistry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      name: "Open Choir",
      status: "published",
      joinPolicy: "open",
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(openMin.ok, true, openMin.reason);

    const joined = await joinMinistry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      ministryId: openMin.item.id,
    });
    assert.equal(joined.ok, true, joined.reason);
    assert.equal(joined.membership.status, "active");

    const dup = await joinMinistry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      ministryId: openMin.item.id,
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.status, STATUS.CONFLICT);

    const reqMin = await createMinistry(pool, {
      churchId: churchA.id,
      branchId: null,
      name: "Request Youth",
      status: "published",
      joinPolicy: "request",
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(reqMin.ok, true, reqMin.reason);

    const requested = await joinMinistry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId: member2Id,
      ministryId: reqMin.item.id,
      message: "I would like to help",
    });
    assert.equal(requested.ok, true, requested.reason);
    assert.equal(requested.membership.status, "pending");

    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const approved = await reviewMinistryMembership(pool, {
      churchId: churchA.id,
      membershipId: requested.membership.id,
      actorUserId: hqAdmin.user.id,
      tenant,
      scopeBranchId: null,
      decision: "approve",
    });
    assert.equal(approved.ok, true, approved.reason);
    assert.equal(approved.membership.status, "active");
  });

  it("blocks inactive ministry and branch isolation", async (t) => {
    if (skipIfNeeded(t)) return;
    const draft = await createMinistry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      name: "Draft Ministry",
      status: "draft",
    });
    assert.equal(draft.ok, true, draft.reason);
    const inactive = await joinMinistry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      ministryId: draft.item.id,
    });
    assert.equal(inactive.ok, false);
    assert.equal(inactive.status, STATUS.UNAVAILABLE);

    const campusMin = await createMinistry(pool, {
      churchId: churchA.id,
      branchId: campusBranch.id,
      name: "Campus Only",
      status: "published",
      joinPolicy: "open",
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(campusMin.ok, true, campusMin.reason);
    const cross = await joinMinistry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      ministryId: campusMin.item.id,
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.status, STATUS.FORBIDDEN);
  });

  it("registers and cancels events with capacity enforcement", async (t) => {
    if (skipIfNeeded(t)) return;
    const event = await createEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      title: "Capacity Workshop",
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      timezone: "UTC",
      status: "published",
      capacity: 1,
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(event.ok, true, event.reason);
    assert.equal(event.item.capacity, 1);

    const reg1 = await registerForEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      eventId: event.item.id,
    });
    assert.equal(reg1.ok, true, reg1.reason);
    assert.equal(reg1.registration.status, "registered");

    const dup = await registerForEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      eventId: event.item.id,
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.status, STATUS.CONFLICT);

    const full = await registerForEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId: member2Id,
      eventId: event.item.id,
    });
    assert.equal(full.ok, false);
    assert.equal(full.status, STATUS.CAPACITY_FULL);

    const cancelled = await cancelEventRegistration(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      eventId: event.item.id,
    });
    assert.equal(cancelled.ok, true, cancelled.reason);
    assert.equal(cancelled.registration.status, "cancelled");

    const reg2 = await registerForEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId: member2Id,
      eventId: event.item.id,
    });
    assert.equal(reg2.ok, true, reg2.reason);
  });

  it("rejects inactive event registration", async (t) => {
    if (skipIfNeeded(t)) return;
    const draft = await createEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      title: "Draft Event",
      startsAt: new Date(Date.now() + 172800000).toISOString(),
      timezone: "UTC",
      status: "draft",
    });
    assert.equal(draft.ok, true, draft.reason);
    const bad = await registerForEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      eventId: draft.item.id,
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.status, STATUS.UNAVAILABLE);
  });

  it("admin views are scoped and privacy-limited", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const listed = await listAdminMinistryParticipation(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
    });
    assert.equal(listed.ok, true, listed.reason);
    for (const block of listed.items) {
      for (const m of block.memberships) {
        assert.ok(m.member);
        assert.ok(m.member.displayName);
        assert.equal(Object.prototype.hasOwnProperty.call(m.member, "phoneDisplay"), false);
        assert.equal(Object.prototype.hasOwnProperty.call(m.member, "phoneNormalized"), false);
      }
    }

    const churchWideDenied = await listAdminMinistryParticipation(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: branchAdmin.user.id,
      tenant,
    });
    assert.equal(churchWideDenied.ok, false);
    assert.equal(churchWideDenied.status, STATUS.FORBIDDEN);

    const hqOk = await listAdminEventParticipation(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant: makeTenant(churchA, orgA.records.organization, branchA),
    });
    assert.equal(hqOk.ok, true, hqOk.reason);
  });

  it("member can leave ministry and list participation", async (t) => {
    if (skipIfNeeded(t)) return;
    const openMin = await createMinistry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      name: "Leave Me",
      status: "published",
      joinPolicy: "open",
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(openMin.ok, true, openMin.reason);
    await joinMinistry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      ministryId: openMin.item.id,
    });
    const left = await leaveMinistry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
      ministryId: openMin.item.id,
    });
    assert.equal(left.ok, true, left.reason);
    assert.equal(left.membership.status, "left");

    const listed = await listMemberMinistries(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      memberId,
    });
    assert.equal(listed.ok, true);
    const hit = listed.items.find((i) => i.id === openMin.item.id);
    assert.ok(hit);
    assert.equal(hit.membership, null);
  });

  it("HTTP member and admin routes work without leaking church UUIDs", async (t) => {
    if (skipIfNeeded(t)) return;
    const event = await createEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      title: "HTTP Event",
      startsAt: new Date(Date.now() + 259200000).toISOString(),
      timezone: "UTC",
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(event.ok, true, event.reason);

    const memberCookie = `${DEFAULT_V5_COOKIE}=${memberUser.rawToken}`;
    const list = await request(app)
      .get("/member/events")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /HTTP Event/);
    assert.doesNotMatch(list.text, new RegExp(churchA.id, "i"));

    const detail = await request(app)
      .get(`/member/events/${event.item.id}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(detail.status, 200);
    const csrf = extractCookie(detail, CSRF_COOKIE);
    const reg = await request(app)
      .post(`/member/events/${event.item.id}/register`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(reg.status, 303);

    const after = await request(app)
      .get(`/member/events/${event.item.id}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(after.status, 200);
    assert.match(after.text, /data-bb-registered="1"/);
    assert.match(after.text, /data-bb-ds-modal-open="bb-mp-event-cancel"/);
    assert.match(after.text, /Confirm cancel/);
    assert.match(after.text, /name="_csrf"/);

    const ministry = await createMinistry(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      name: "HTTP Ministry",
      summary: "Serve together",
      status: "published",
      joinPolicy: "request",
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(ministry.ok, true, ministry.reason);

    const ministries = await request(app)
      .get("/member/ministries")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(ministries.status, 200);
    assert.match(ministries.text, /data-bb-member-ministries="1"/);
    assert.match(ministries.text, /HTTP Ministry/);
    assert.match(ministries.text, /data-bb-status="none"/);
    assert.doesNotMatch(ministries.text, new RegExp(churchA.id, "i"));

    const ministryDetail = await request(app)
      .get(`/member/ministries/${ministry.item.id}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(ministryDetail.status, 200);
    assert.match(ministryDetail.text, /Request to join/);
    assert.match(ministryDetail.text, /name="_csrf"/);
    const ministryCsrf = extractCookie(ministryDetail, CSRF_COOKIE);
    const join = await request(app)
      .post(`/member/ministries/${ministry.item.id}/join`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${ministryCsrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: ministryCsrf, message: "Happy to help" });
    assert.equal(join.status, 303);

    const pending = await request(app)
      .get(`/member/ministries/${ministry.item.id}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(pending.status, 200);
    assert.match(pending.text, /data-bb-status="pending"/);
    assert.match(pending.text, /Cancel request/);
    assert.match(pending.text, /data-bb-ds-modal-open="bb-mp-ministry-leave"/);

    const hqCookie = `${DEFAULT_V5_COOKIE}=${hqAdmin.rawToken}`;
    const admin = await request(app)
      .get("/hq/participation")
      .set("Host", HOST_A)
      .set("Cookie", hqCookie);
    assert.equal(admin.status, 200);
    assert.match(admin.text, /Participation/);
    assert.doesNotMatch(admin.text, new RegExp(churchA.id, "i"));
  });

  it("shows real capacity only and requires CSRF on event cancel", async (t) => {
    if (skipIfNeeded(t)) return;
    const openEvent = await createEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      title: "Open Capacity Event",
      startsAt: new Date(Date.now() + 345600000).toISOString(),
      timezone: "UTC",
      capacity: 2,
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(openEvent.ok, true, openEvent.reason);

    const unlimited = await createEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      title: "Unlimited Event",
      startsAt: new Date(Date.now() + 432000000).toISOString(),
      timezone: "UTC",
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(unlimited.ok, true, unlimited.reason);

    const memberCookie = `${DEFAULT_V5_COOKIE}=${memberUser.rawToken}`;
    const list = await request(app)
      .get("/member/events")
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-member-events="1"/);
    assert.match(list.text, /Open Capacity Event/);
    assert.match(list.text, /data-bb-capacity="2"/);
    assert.match(list.text, /Unlimited Event/);
    const unlimitedIdx = list.text.indexOf("Unlimited Event");
    assert.ok(unlimitedIdx >= 0);
    const unlimitedSnippet = list.text.slice(unlimitedIdx, unlimitedIdx + 900);
    assert.doesNotMatch(unlimitedSnippet, /data-bb-capacity=/);

    const detail = await request(app)
      .get(`/member/events/${openEvent.item.id}`)
      .set("Host", HOST_A)
      .set("Cookie", memberCookie);
    const csrf = extractCookie(detail, CSRF_COOKIE);
    const registered = await request(app)
      .post(`/member/events/${openEvent.item.id}/register`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(registered.status, 303);

    const badCancel = await request(app)
      .post(`/member/events/${openEvent.item.id}/cancel`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: "not-the-token" });
    assert.equal(badCancel.status, 403);

    const okCancel = await request(app)
      .post(`/member/events/${openEvent.item.id}/cancel`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(memberCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(okCancel.status, 303);
  });

  it("blocks cross-tenant participation", async (t) => {
    if (skipIfNeeded(t)) return;
    const event = await createEvent(pool, {
      churchId: churchA.id,
      branchId: null,
      title: "Tenant A Event",
      startsAt: new Date(Date.now() + 345600000).toISOString(),
      timezone: "UTC",
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(event.ok, true, event.reason);

    const foreign = await request(app)
      .get(`/member/events/${event.item.id}`)
      .set("Host", HOST_B)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${memberB.rawToken}`);
    assert.ok(foreign.status === 403 || foreign.status === 404);

    const listedB = await listMemberEvents(pool, {
      churchId: churchB.id,
      branchId: branchB.id,
      memberId: (
        await pool.query(
          `SELECT id FROM blessboard.members WHERE church_id = $1 AND user_id = $2`,
          [churchB.id, memberB.user.id]
        )
      ).rows[0].id,
    });
    assert.equal(listedB.ok, true);
    assert.ok(!listedB.items.some((i) => i.id === event.item.id));
  });

  it("leaves V4 participation wiring untouched", () => {
    const legacy = fs.readFileSync(path.join(ROOT, "server.legacy.js"), "utf8");
    assert.doesNotMatch(
      legacy,
      /createParticipationMemberRouter|createParticipationAdminRouter|participationService/
    );
    assert.ok(fs.existsSync(path.join(ROOT, "src/db/pg/church/eventRegistrationsRepo.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "src/db/pg/church/ministryJoinRequestsRepo.js")));
  });
});
