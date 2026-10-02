"use strict";

/**
 * V2.04 Phase 7 — Attendance session operations (BB-A01/A02/A03 + close/lock).
 * Covers state transitions, RBAC, tenant isolation, invalid transitions, Stitch markers.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const {
  SESSION_STATUS,
  ATTENDANCE_PERMISSION,
  VALIDATION_CODE,
  createAttendanceSession,
  transitionAttendanceSession,
  listAttendanceSessionsForTenant,
  getAttendanceSessionForTenant,
  validateAttendanceCheckIn,
  ALLOWED_TRANSITIONS,
} = require("../src/blessboard/services/attendance");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
const CHURCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHURCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const BRANCH_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BRANCH_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ACTOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function allowOnly(keys) {
  const set = new Set(keys);
  return async (_db, input) => ({
    allowed: set.has(input.permission),
    reasonCode: set.has(input.permission) ? "RBAC_ALLOWED" : "RBAC_PERMISSION_DENIED",
  });
}

function memoryStore(seedRows) {
  const rows = new Map(seedRows || []);
  return {
    rows,
    async insert(_db, row) {
      const id = row.id || SESSION_ID;
      const saved = { ...row, id };
      rows.set(id, saved);
      return saved;
    },
    async findById(_db, id) {
      return rows.get(id) || null;
    },
    async update(_db, { sessionId, patch }) {
      const cur = rows.get(sessionId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      rows.set(sessionId, next);
      return next;
    },
    async list(_db, input) {
      return [...rows.values()].filter((r) => {
        if (r.organizationId !== input.organizationId) return false;
        if (r.churchId !== input.churchId) return false;
        if (input.branchId && r.branchId !== input.branchId) return false;
        if (input.status && r.status !== input.status) return false;
        return true;
      });
    },
  };
}

describe("V2.04 BB attendance session Stitch + routes wiring", () => {
  it("ships A01–A03 templates with Stitch markers and no domain logic in EJS", () => {
    const a01 = read("views/blessboard/v5/attendance/sessions.ejs");
    assert.match(a01, /data-bb-stitch-v204="BB-A01"/);
    assert.match(a01, /Attendance Sessions/);
    assert.match(a01, /Manage active, upcoming, and certified parish gatherings/);
    assert.match(a01, /\+ Create Session/);
    assert.match(a01, /Open Sessions/);
    assert.match(a01, /Upcoming Sessions/);
    assert.match(a01, /Recent \/ Closed Sessions/);
    assert.match(a01, /Enter Session Dashboard/);
    assert.doesNotMatch(a01, /createAttendanceSession|transitionAttendanceSession/);

    const a02 = read("views/blessboard/v5/attendance/session-new.ejs");
    assert.match(a02, /data-bb-stitch-v204="BB-A02"/);
    assert.match(a02, /Create Attendance Session/);
    assert.match(a02, /Session &amp; Gathering Context/);
    assert.match(a02, /Schedule &amp; Lateness Policies/);
    assert.match(a02, /Late Arrival Threshold/);
    assert.match(a02, /Save as Draft/);
    assert.match(a02, /Save &amp; Open Session Now/);
    assert.doesNotMatch(a02, /createAttendanceSession/);

    const a03 = read("views/blessboard/v5/attendance/session-dashboard.ejs");
    assert.match(a03, /data-bb-stitch-v204=/);
    assert.match(a03, /Total Checked In/);
    assert.match(a03, /Display QR Kiosk/);
    assert.match(a03, /Open QR Display/);
    assert.match(a03, /bb-v204-a03__qr-actions/);
    assert.match(a03, /Close Session/);
    assert.match(a03, /Live Influx Roster Stream/);
    assert.match(a03, /Lock Final Session/);
    assert.match(a03, /data-bb-a11-summary/);
  });

  it("ships functional A10 close confirm (Stitch A10/A11 absent)", () => {
    const a10 = read("views/blessboard/v5/attendance/session-close.ejs");
    assert.match(a10, /data-bb-stitch-v204="BB-A10"/);
    assert.match(a10, /Close Session/);
    assert.match(a10, /Confirm Close Session/);
    assert.match(a10, /to_status" value="closed"/);
    assert.doesNotMatch(a10, /transitionAttendanceSession/);
  });

  it("wires session routes additively and mounts in foundation server", () => {
    const routes = read("src/blessboard/http/attendanceSessionAdminRoutes.js");
    assert.match(routes, /\/branch-admin\/attendance\/sessions/);
    assert.match(routes, /\/branch-admin\/attendance\/sessions\/new/);
    assert.match(routes, /\/branch-admin\/attendance\/sessions\/:id\/close/);
    assert.match(routes, /\/branch-admin\/attendance\/sessions\/:id\/transition/);
    assert.match(routes, /attendance\.view/);
    assert.match(routes, /attendance\.manage_session/);
    assert.match(routes, /toStatus: SESSION_STATUS\.OPEN/);
    assert.match(routes, /to_status/);

    const server = read("src/platform/http/v5FoundationServer.js");
    assert.match(server, /createAttendanceSessionAdminRouter/);
    assert.match(server, /createAttendanceAdminRouter/);
  });

  it("preserves aggregate attendance admin list", () => {
    const list = read("views/blessboard/v5/attendance/admin-list.ejs");
    assert.ok(list.length > 100);
    assert.doesNotMatch(list, /data-bb-stitch-v204="BB-A01"/);
  });
});

describe("V2.04 BB attendance session transitions + RBAC + isolation", () => {
  it("allows only draft→open→closed→locked", () => {
    assert.deepEqual(ALLOWED_TRANSITIONS[SESSION_STATUS.DRAFT], [SESSION_STATUS.OPEN]);
    assert.deepEqual(ALLOWED_TRANSITIONS[SESSION_STATUS.OPEN], [SESSION_STATUS.CLOSED]);
    assert.deepEqual(ALLOWED_TRANSITIONS[SESSION_STATUS.CLOSED], [SESSION_STATUS.LOCKED]);
    assert.deepEqual(ALLOWED_TRANSITIONS[SESSION_STATUS.LOCKED], []);
  });

  it("creates draft and transitions through lifecycle", async () => {
    const store = memoryStore();
    const deps = {
      authorize: allowOnly([ATTENDANCE_PERMISSION.MANAGE_SESSION]),
      sessionStore: store,
    };
    const created = await createAttendanceSession(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH_A,
        actorUserId: ACTOR,
        sessionDate: "2026-09-30",
        startTime: "2026-09-30T08:00:00.000Z",
        lateThresholdMinutes: 15,
        serviceEventRef: "sunday_morning_worship",
        title: "Sunday First Service",
      },
      deps
    );
    assert.equal(created.ok, true);
    assert.equal(created.session.status, SESSION_STATUS.DRAFT);

    for (const to of [
      SESSION_STATUS.OPEN,
      SESSION_STATUS.CLOSED,
      SESSION_STATUS.LOCKED,
    ]) {
      const step = await transitionAttendanceSession(
        {},
        {
          sessionId: SESSION_ID,
          toStatus: to,
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          branchId: BRANCH_A,
        },
        deps
      );
      assert.equal(step.ok, true, to);
      assert.equal(step.session.status, to);
    }
  });

  it("rejects invalid transitions", async () => {
    const store = memoryStore([
      [
        SESSION_ID,
        {
          id: SESSION_ID,
          organizationId: ORG,
          churchId: CHURCH,
          branchId: BRANCH_A,
          sessionDate: "2026-09-30",
          startTime: new Date("2026-09-30T08:00:00.000Z"),
          lateThresholdMinutes: 15,
          status: SESSION_STATUS.OPEN,
          title: "Open",
        },
      ],
    ]);
    const deps = {
      authorize: allowOnly([ATTENDANCE_PERMISSION.MANAGE_SESSION]),
      sessionStore: store,
    };

    const skip = await transitionAttendanceSession(
      {},
      {
        sessionId: SESSION_ID,
        toStatus: SESSION_STATUS.LOCKED,
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH_A,
      },
      deps
    );
    assert.equal(skip.ok, false);
    assert.equal(skip.code, "invalid_transition");

    const reopenDraft = await transitionAttendanceSession(
      {},
      {
        sessionId: SESSION_ID,
        toStatus: SESSION_STATUS.DRAFT,
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH_A,
      },
      deps
    );
    assert.equal(reopenDraft.ok, false);
    assert.equal(reopenDraft.code, "invalid_transition");
  });

  it("requires manage_session for create/transition and view for list/get", async () => {
    const store = memoryStore();
    const denied = await createAttendanceSession(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH_A,
        actorUserId: ACTOR,
        sessionDate: "2026-09-30",
        startTime: "2026-09-30T08:00:00.000Z",
      },
      {
        authorize: allowOnly([ATTENDANCE_PERMISSION.VIEW]),
        sessionStore: store,
      }
    );
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "unauthorized");

    store.rows.set(SESSION_ID, {
      id: SESSION_ID,
      organizationId: ORG,
      churchId: CHURCH,
      branchId: BRANCH_A,
      sessionDate: "2026-09-30",
      startTime: new Date("2026-09-30T08:00:00.000Z"),
      lateThresholdMinutes: 15,
      status: SESSION_STATUS.DRAFT,
      title: "Draft",
    });

    const listedDenied = await listAttendanceSessionsForTenant(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH_A,
        actorUserId: ACTOR,
      },
      {
        authorize: allowOnly([ATTENDANCE_PERMISSION.MANAGE_SESSION]),
        sessionStore: store,
      }
    );
    assert.equal(listedDenied.ok, false);
    assert.equal(listedDenied.code, "unauthorized");

    const listed = await listAttendanceSessionsForTenant(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH_A,
        actorUserId: ACTOR,
      },
      {
        authorize: allowOnly([ATTENDANCE_PERMISSION.VIEW]),
        sessionStore: store,
      }
    );
    assert.equal(listed.ok, true);
    assert.equal(listed.sessions.length, 1);
  });

  it("enforces tenant and branch isolation on get/transition", async () => {
    const store = memoryStore([
      [
        SESSION_ID,
        {
          id: SESSION_ID,
          organizationId: ORG,
          churchId: CHURCH,
          branchId: BRANCH_A,
          sessionDate: "2026-09-30",
          startTime: new Date("2026-09-30T08:00:00.000Z"),
          lateThresholdMinutes: 15,
          status: SESSION_STATUS.OPEN,
          title: "Tenant A",
        },
      ],
    ]);
    const depsView = {
      authorize: allowOnly([
        ATTENDANCE_PERMISSION.VIEW,
        ATTENDANCE_PERMISSION.MANAGE_SESSION,
      ]),
      sessionStore: store,
    };

    const wrongChurch = await getAttendanceSessionForTenant(
      {},
      {
        sessionId: SESSION_ID,
        organizationId: ORG,
        churchId: CHURCH_B,
        branchId: BRANCH_A,
        actorUserId: ACTOR,
      },
      depsView
    );
    assert.equal(wrongChurch.ok, false);
    assert.equal(wrongChurch.reason, "tenant_mismatch");

    const wrongOrg = await transitionAttendanceSession(
      {},
      {
        sessionId: SESSION_ID,
        toStatus: SESSION_STATUS.CLOSED,
        actorUserId: ACTOR,
        organizationId: ORG_B,
        churchId: CHURCH,
        branchId: BRANCH_A,
      },
      depsView
    );
    assert.equal(wrongOrg.ok, false);
    assert.equal(wrongOrg.reason, "tenant_mismatch");

    const wrongBranch = await getAttendanceSessionForTenant(
      {},
      {
        sessionId: SESSION_ID,
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH_B,
        actorUserId: ACTOR,
      },
      depsView
    );
    assert.equal(wrongBranch.ok, false);
    assert.equal(wrongBranch.reason, "branch_mismatch");

    const listed = await listAttendanceSessionsForTenant(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH_B,
        actorUserId: ACTOR,
      },
      depsView
    );
    assert.equal(listed.ok, true);
    assert.equal(listed.sessions.length, 0);
  });

  it("rejects normal check-in unless session is OPEN", async () => {
    const member = {
      id: MEMBER_ID,
      churchId: CHURCH,
      status: "active",
      primaryBranchId: BRANCH_A,
    };
    const cases = [
      { status: SESSION_STATUS.DRAFT, code: VALIDATION_CODE.SESSION_NOT_OPEN },
      { status: SESSION_STATUS.CLOSED, code: VALIDATION_CODE.SESSION_CLOSED },
      { status: SESSION_STATUS.LOCKED, code: VALIDATION_CODE.SESSION_LOCKED },
    ];
    for (const c of cases) {
      const result = await validateAttendanceCheckIn(
        {},
        {
          method: "manual",
          organizationId: ORG,
          churchId: CHURCH,
          actorUserId: ACTOR,
          session: {
            id: SESSION_ID,
            organizationId: ORG,
            churchId: CHURCH,
            branchId: BRANCH_A,
            status: c.status,
            startTime: new Date("2026-09-30T08:00:00.000Z"),
            lateThresholdMinutes: 15,
            wrongBranchPolicy: "record",
          },
          member,
          existingCheckIn: null,
          checkedInAt: new Date("2026-09-30T08:05:00.000Z"),
        },
        { authorize: allowOnly([ATTENDANCE_PERMISSION.CHECK_IN]) }
      );
      assert.equal(result.ok, false, c.status);
      assert.equal(result.code, c.code, c.status);
    }
  });
});
