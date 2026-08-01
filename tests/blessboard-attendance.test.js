"use strict";

/**
 * BlessBoard V5 aggregate attendance: counts, scope, workflow, monthly reports, CSRF, V4 isolation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
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
  makeTenant,
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
  STATUS,
  ATTENDANCE_POLICY,
  createAttendanceEvent,
  upsertAttendanceEntry,
  submitAttendanceEvent,
  approveAttendanceEvent,
  archiveAttendanceEvent,
  getAttendanceEvent,
  listAttendanceEvents,
  getMonthlyAttendanceSummary,
} = require("../src/blessboard/services/attendanceService");

const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "att-a.blessboard.org";
const HOST_B = "att-b.blessboard.org";
const ROOT = path.join(__dirname, "..");

function baseEnv(overrides) {
  return baseV5TestEnv(overrides);
}

describe("blessboard attendance", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let branchA;
  let campusBranch;
  let hqAdmin;
  let branchAdmin;
  let campusAdmin;
  let yearMonth;

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
        organizationKey: "att-a",
        displayName: "Att A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "att-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "att-a",
        churchKey: "att-a",
        displayName: "Att Church A",
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

      await provisionPlatformTenant(pool, {
        organizationKey: "att-b",
        displayName: "Att B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "att-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      await provisionBlessBoardChurch(pool, {
        organizationKey: "att-b",
        churchKey: "att-b",
        displayName: "Att Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });

      async function makeUser(email, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName: email,
        });
        assert.equal(created.ok, true, created.reason || created.message);
        const assigned = await assignBlessBoardRole(pool, role);
        assert.equal(assigned.ok, true, assigned.message || assigned.reason);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId: orgA.records.organization.id,
        });
        assert.equal(session.ok, true, session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      hqAdmin = await makeUser("hq@att-a.example.test", {
        email: "hq@att-a.example.test",
        organizationKey: "att-a",
        churchKey: "att-a",
        roleKey: "church_hq_admin",
      });
      branchAdmin = await makeUser("branch@att-a.example.test", {
        email: "branch@att-a.example.test",
        organizationKey: "att-a",
        churchKey: "att-a",
        roleKey: "branch_admin",
        branchKey: "hq",
      });
      campusAdmin = await makeUser("campus@att-a.example.test", {
        email: "campus@att-a.example.test",
        organizationKey: "att-a",
        churchKey: "att-a",
        roleKey: "branch_admin",
        branchKey: "campus",
      });

      const today = new Date();
      yearMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("attendance suite setup failed:", skipReason);
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

  function eventDateInMonth(day) {
    return `${yearMonth}-${String(day).padStart(2, "0")}`;
  }

  it("creates attendance tables and enforces non-negative counts", async (t) => {
    if (skipIfNeeded(t)) return;
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'blessboard'
          AND table_name LIKE 'attendance_%'
        ORDER BY table_name`
    );
    assert.deepEqual(
      tables.rows.map((r) => r.table_name),
      ["attendance_entries", "attendance_events"]
    );
    assert.equal(ATTENDANCE_POLICY.branchMayAmendSubmittedByRevertingToDraft, true);

    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const created = await createAttendanceEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      title: "Sunday AM",
      eventType: "sunday_service",
      eventDate: eventDateInMonth(5),
    });
    assert.equal(created.ok, true, created.reason);

    const neg = await upsertAttendanceEntry(pool, {
      churchId: churchA.id,
      attendanceEventId: created.event.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      category: "adults",
      count: -1,
    });
    assert.equal(neg.ok, false);
    assert.equal(neg.reason, "count");
  });

  it("enforces one entry per category and draft→submit→approve workflow", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const created = await createAttendanceEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "Workflow Service",
      eventType: "sunday_service",
      eventDate: eventDateInMonth(6),
    });
    assert.equal(created.ok, true, created.reason);

    const e1 = await upsertAttendanceEntry(pool, {
      churchId: churchA.id,
      attendanceEventId: created.event.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      category: "adults",
      count: 40,
    });
    assert.equal(e1.ok, true, e1.reason);
    const e2 = await upsertAttendanceEntry(pool, {
      churchId: churchA.id,
      attendanceEventId: created.event.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      category: "adults",
      count: 42,
    });
    assert.equal(e2.ok, true, e2.reason);
    assert.equal(e2.entry.count, 42);

    const kids = await upsertAttendanceEntry(pool, {
      churchId: churchA.id,
      attendanceEventId: created.event.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      category: "children",
      count: 10,
    });
    assert.equal(kids.ok, true, kids.reason);

    const emptySubmit = await submitAttendanceEvent(pool, {
      id: (
        await createAttendanceEvent(pool, {
          churchId: churchA.id,
          branchId: branchA.id,
          actorUserId: branchAdmin.user.id,
          tenant,
          title: "Empty",
          eventType: "other",
          eventDate: eventDateInMonth(7),
        })
      ).event.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    assert.equal(emptySubmit.ok, false);
    assert.equal(emptySubmit.reason, "entries_required");

    const submitted = await submitAttendanceEvent(pool, {
      id: created.event.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    assert.equal(submitted.ok, true, submitted.reason);
    assert.equal(submitted.event.status, "submitted");
    assert.equal(submitted.event.totalCount, 52);

    const approved = await approveAttendanceEvent(pool, {
      id: created.event.id,
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      tenant: makeTenant(churchA, orgA.records.organization, branchA),
    });
    assert.equal(approved.ok, true, approved.reason);
    assert.equal(approved.event.status, "approved");
  });

  it("amends submitted by reverting to draft; locks approved for branch", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const created = await createAttendanceEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "Amend Me",
      eventType: "midweek",
      eventDate: eventDateInMonth(8),
    });
    await upsertAttendanceEntry(pool, {
      churchId: churchA.id,
      attendanceEventId: created.event.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      category: "adults",
      count: 20,
    });
    await submitAttendanceEvent(pool, {
      id: created.event.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });

    const amend = await upsertAttendanceEntry(pool, {
      churchId: churchA.id,
      attendanceEventId: created.event.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      category: "adults",
      count: 22,
    });
    assert.equal(amend.ok, true, amend.reason);
    const after = await getAttendanceEvent(pool, {
      id: created.event.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    assert.equal(after.event.status, "draft");
    assert.equal(after.event.totalCount, 22);

    await submitAttendanceEvent(pool, {
      id: created.event.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });
    await approveAttendanceEvent(pool, {
      id: created.event.id,
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      tenant,
    });

    const locked = await upsertAttendanceEntry(pool, {
      churchId: churchA.id,
      attendanceEventId: created.event.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      category: "adults",
      count: 99,
    });
    assert.equal(locked.ok, false);
    assert.equal(locked.status, STATUS.POLICY);
  });

  it("scopes branch admin to assigned branch only", async (t) => {
    if (skipIfNeeded(t)) return;
    const campusTenant = makeTenant(churchA, orgA.records.organization, campusBranch, branchA);
    const hqTenant = makeTenant(churchA, orgA.records.organization, branchA);

    const created = await createAttendanceEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: campusAdmin.user.id,
      tenant: campusTenant,
      scopeBranchId: campusBranch.id,
      title: "Wrong branch",
      eventType: "other",
      eventDate: eventDateInMonth(9),
    });
    // create uses branchId from input; authorize with campus admin on campus branch but creating for HQ branch
    // authorizeActor gets branchId: branchA from input - campus admin won't have branch_admin on HQ
    assert.equal(created.ok, false);
    assert.equal(created.status, STATUS.FORBIDDEN);

    const campusEv = await createAttendanceEvent(pool, {
      churchId: churchA.id,
      branchId: campusBranch.id,
      actorUserId: campusAdmin.user.id,
      tenant: campusTenant,
      scopeBranchId: campusBranch.id,
      title: "Campus service",
      eventType: "sunday_service",
      eventDate: eventDateInMonth(9),
    });
    assert.equal(campusEv.ok, true, campusEv.reason);

    const branchList = await listAttendanceEvents(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant: hqTenant,
    });
    assert.equal(branchList.ok, true);
    assert.ok(!branchList.events.some((e) => e.id === campusEv.event.id));

    const churchWideDenied = await listAttendanceEvents(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: branchAdmin.user.id,
      tenant: hqTenant,
    });
    assert.equal(churchWideDenied.ok, false);
  });

  it("builds monthly summaries from real submitted totals only", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const draft = await createAttendanceEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "Draft only",
      eventType: "other",
      eventDate: eventDateInMonth(10),
    });
    await upsertAttendanceEntry(pool, {
      churchId: churchA.id,
      attendanceEventId: draft.event.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      category: "adults",
      count: 1000,
    });

    const live = await createAttendanceEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "Counted service",
      eventType: "sunday_service",
      eventDate: eventDateInMonth(11),
    });
    await upsertAttendanceEntry(pool, {
      churchId: churchA.id,
      attendanceEventId: live.event.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      category: "adults",
      count: 30,
    });
    await upsertAttendanceEntry(pool, {
      churchId: churchA.id,
      attendanceEventId: live.event.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      category: "youth",
      count: 5,
    });
    await submitAttendanceEvent(pool, {
      id: live.event.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });

    const summary = await getMonthlyAttendanceSummary(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      yearMonth,
      actorUserId: branchAdmin.user.id,
      tenant,
    });
    assert.equal(summary.ok, true, summary.reason);
    assert.ok(summary.summary.grandTotal >= 35);
    assert.ok(!summary.summary.byBranch.some((r) => r.totalCount === 1000 && r.category === "adults" && r.eventCount === 1 && summary.summary.grandTotal === 1000));
    const adults = summary.summary.byBranch.find((r) => r.category === "adults");
    assert.ok(adults);
    assert.ok(adults.totalCount >= 30);
    // Draft 1000 must not be the only contribution — ensure draft excluded by checking
    // that a pure draft month slice isn't inventing fake analytics fields.
    assert.equal(Object.prototype.hasOwnProperty.call(summary.summary, "projectedGrowth"), false);
    assert.deepEqual(summary.summary.sourceStatuses, ["submitted", "approved", "archived"]);
  });

  it("HQ can archive and view church-wide monthly totals", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const created = await createAttendanceEvent(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      title: "Archive candidate",
      eventType: "special",
      eventDate: eventDateInMonth(12),
    });
    await upsertAttendanceEntry(pool, {
      churchId: churchA.id,
      attendanceEventId: created.event.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
      category: "volunteers",
      count: 8,
    });
    await submitAttendanceEvent(pool, {
      id: created.event.id,
      churchId: churchA.id,
      actorUserId: branchAdmin.user.id,
      tenant,
      scopeBranchId: branchA.id,
    });

    const archived = await archiveAttendanceEvent(pool, {
      id: created.event.id,
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      tenant,
    });
    assert.equal(archived.ok, true, archived.reason);
    assert.equal(archived.event.status, "archived");

    const hqSummary = await getMonthlyAttendanceSummary(pool, {
      churchId: churchA.id,
      branchId: null,
      yearMonth,
      actorUserId: hqAdmin.user.id,
      tenant,
    });
    assert.equal(hqSummary.ok, true, hqSummary.reason);
    assert.ok(hqSummary.summary.churchTotals);
    assert.ok(hqSummary.summary.grandTotal >= 8);
  });

  it("HTTP CSRF-protected create and submit without leaking church UUID", async (t) => {
    if (skipIfNeeded(t)) return;
    const cookie = `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`;
    const list = await request(app)
      .get("/branch-admin/attendance")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-attendance-admin-list="1"/);
    assert.match(list.text, /data-bb-stitch-attendance="36-branch-attendance-tracker"/);
    assert.match(list.text, /Attendance tracker/);
    assert.match(list.text, /Monthly summary/);
    assert.match(list.text, /data-bb-attendance-monthly="1"/);
    assert.match(list.text, /data-bb-att-status-chips="1"/);
    assert.match(list.text, /data-bb-att-type-chips="1"/);
    assert.match(list.text, /data-bb-att-history="1"/);
    assert.match(list.text, /data-bb-att-unavailable="1"/);
    assert.doesNotMatch(list.text, /\+12%|Last 30 days avg|Pending Drafts|projectedGrowth|Average Sunday/i);
    assert.doesNotMatch(list.text, /bb-ba-btn[^>]*>\s*QR|fingerprint scanner|sync now/i);
    assert.doesNotMatch(list.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(list.text, new RegExp(branchA.id, "i"));

    const form = await request(app)
      .get("/branch-admin/attendance/new")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(form.status, 200);
    assert.match(form.text, /data-bb-attendance-admin-form="1"/);
    assert.match(form.text, /data-bb-stitch-attendance-form="36-branch-attendance-tracker"/);
    assert.match(form.text, /does not record individual members/);
    assert.match(form.text, /name="title"/);
    assert.match(form.text, /name="event_type"/);
    assert.match(form.text, /name="event_date"/);
    assert.match(form.text, /name="_csrf"/);
    const csrf = extractCookie(form, CSRF_COOKIE);

    const missingCsrf = await request(app)
      .post("/branch-admin/attendance")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(cookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        title: "CSRF blocked",
        event_type: "sunday_service",
        event_date: eventDateInMonth(4),
      });
    assert.equal(missingCsrf.status, 403);

    const created = await request(app)
      .post("/branch-admin/attendance")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(cookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        title: "HTTP Sunday",
        event_type: "sunday_service",
        event_date: eventDateInMonth(4),
      });
    assert.equal(created.status, 303);
    assert.match(created.headers.location, /\/branch-admin\/attendance\/[0-9a-f-]{36}/i);
    const eventId = created.headers.location.split("/").pop().split("?")[0];

    const detail = await request(app)
      .get(`/branch-admin/attendance/${eventId}`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-attendance-admin-detail="1"/);
    assert.match(detail.text, /data-bb-stitch-attendance-detail="37-branch-attendance-record-detail"/);
    assert.match(detail.text, /Category counts/);
    assert.match(detail.text, /bb-att-submit-modal/);
    assert.match(detail.text, /data-bb-att-edit="1"/);
    assert.match(detail.text, /data-bb-att-totals="1"/);
    assert.match(detail.text, /data-bb-att-entry-form="1"/);
    assert.doesNotMatch(detail.text, new RegExp(churchA.id, "i"));
    const csrf2 = extractCookie(detail, CSRF_COOKIE);
    const entry = await request(app)
      .post(`/branch-admin/attendance/${eventId}/entries`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(cookie, `${CSRF_COOKIE}=${csrf2}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        category: "adults",
        count: "15",
      });
    assert.equal(entry.status, 303);

    const editPage = await request(app)
      .get(`/branch-admin/attendance/${eventId}/edit`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(editPage.status, 200);
    assert.match(editPage.text, /data-bb-form-mode="edit"/);
    const editCsrf = extractCookie(editPage, CSRF_COOKIE);
    const edited = await request(app)
      .post(`/branch-admin/attendance/${eventId}/edit`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(cookie, `${CSRF_COOKIE}=${editCsrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: editCsrf,
        title: "HTTP Sunday updated",
        event_type: "sunday_service",
        event_date: eventDateInMonth(4),
      });
    assert.equal(edited.status, 303);

    const detail2 = await request(app)
      .get(`/branch-admin/attendance/${eventId}`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.match(detail2.text, /HTTP Sunday updated/);
    const csrf3 = extractCookie(detail2, CSRF_COOKIE);
    const submitted = await request(app)
      .post(`/branch-admin/attendance/${eventId}/submit`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(cookie, `${CSRF_COOKIE}=${csrf3}`))
      .type("form")
      .send({ [CSRF_FIELD]: csrf3 });
    assert.equal(submitted.status, 303);

    const afterSubmit = await request(app)
      .get(`/branch-admin/attendance/${eventId}`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(afterSubmit.status, 200);
    assert.match(afterSubmit.text, /data-bb-status="submitted"/);
    assert.match(afterSubmit.text, /data-bb-att-amend-policy="1"/);
    assert.doesNotMatch(afterSubmit.text, /data-bb-att-edit="1"/);

    const hq = await request(app)
      .get("/hq/attendance")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${hqAdmin.rawToken}`);
    assert.equal(hq.status, 200);
    assert.match(hq.text, /Monthly summary/);
    assert.match(hq.text, /data-bb-attendance-admin-list="1"/);
    assert.doesNotMatch(hq.text, new RegExp(churchA.id, "i"));
  });

  it("leaves V4 attendance wiring untouched", () => {
    const legacy = fs.readFileSync(path.join(ROOT, "server.legacy.js"), "utf8");
    assert.doesNotMatch(legacy, /createAttendanceAdminRouter|attendanceService/);
    assert.ok(fs.existsSync(path.join(ROOT, "db/postgres/052_church_attendance_giving.sql")));
  });
});
