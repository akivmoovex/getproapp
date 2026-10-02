"use strict";

/**
 * V2.04 Phase 8 — Attendance check-in (A04 Stitch + functional A05–A09).
 * All methods must share validateAttendanceCheckIn / checkIn*.
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
  CHECK_IN_METHOD,
  ATTENDANCE_PERMISSION,
  VALIDATION_CODE,
  validateAttendanceCheckIn,
  checkInManual,
  checkInQr,
  checkInPeak,
  issueSessionCheckInQr,
  issueMemberCheckInClaimQr,
  issueAttendanceToken,
  assertTokenHasNoPii,
} = require("../src/blessboard/services/attendance");
const {
  presentCheckInResult,
} = require("../src/blessboard/http/attendanceCheckInAdminRoutes");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHURCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BRANCH_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ACTOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MEMBER_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function allowOnly(keys) {
  const set = new Set(keys);
  return async (_db, input) => ({
    allowed: set.has(input.permission),
    reasonCode: set.has(input.permission) ? "RBAC_ALLOWED" : "RBAC_PERMISSION_DENIED",
  });
}

function openSession(overrides) {
  return {
    id: SESSION_ID,
    organizationId: ORG,
    churchId: CHURCH,
    branchId: BRANCH_A,
    sessionDate: "2026-09-30",
    startTime: new Date("2026-09-30T08:00:00.000Z"),
    lateThresholdMinutes: 15,
    status: SESSION_STATUS.OPEN,
    wrongBranchPolicy: "record",
    ...overrides,
  };
}

function activeMember(overrides) {
  return {
    id: MEMBER_ID,
    churchId: CHURCH,
    status: "active",
    primaryBranchId: BRANCH_A,
    firstName: "Ezekiel",
    lastName: "Adeleke",
    memberNumber: "CH-84291",
    ...overrides,
  };
}

describe("V2.04 BB check-in Stitch + route wiring", () => {
  it("ships A04 Stitch markers and Confirm Check-In CTA", () => {
    const a04 = read("views/blessboard/v5/attendance/check-in-manual.ejs");
    assert.match(a04, /data-bb-stitch-v204="BB-A04"/);
    assert.match(a04, /data-bb-stitch-id="e14603722a2f4f7f94ba8a191a2ab0c1"/);
    assert.match(a04, /Fast Member Search/);
    assert.match(a04, /Member Verification Record/);
    assert.match(a04, /Confirm Check-In/);
    assert.match(a04, /Skip \/ Next Record/);
    assert.doesNotMatch(a04, /checkInManual|validateAttendanceCheckIn/);
  });

  it("ships functional A05–A09 markers (Stitch A05–A09 absent)", () => {
    assert.match(
      read("views/blessboard/v5/attendance/check-in-qr-display.ejs"),
      /data-bb-stitch-v204="BB-A05"/
    );
    assert.match(
      read("views/blessboard/v5/attendance/check-in-qr-member.ejs"),
      /data-bb-stitch-v204="BB-A06"/
    );
    assert.match(
      read("views/blessboard/v5/attendance/check-in-peak.ejs"),
      /data-bb-stitch-v204="BB-A07"/
    );
    assert.match(
      read("views/blessboard/v5/attendance/check-in-roster.ejs"),
      /data-bb-stitch-v204="BB-A08"/
    );
    assert.match(
      read("views/blessboard/v5/attendance/check-in-roster.ejs"),
      /data-bb-a08-cards="1"/
    );
    assert.match(
      read("public/blessboard/v5/branch-admin.css"),
      /bb-v204-a08__cards/
    );
    assert.match(
      read("views/blessboard/v5/partials/branch-admin-shell-start.ejs"),
      /branch-admin\.css\?v=v204-p4-1/
    );
    assert.match(
      read("views/blessboard/v5/attendance/partials/check-in-result.ejs"),
      /data-bb-stitch-v204="BB-A09"/
    );
    assert.match(
      read("views/blessboard/v5/attendance/check-in-qr-display.ejs"),
      /no Church ID, phone, or member PII/
    );
    assert.match(
      read("views/blessboard/v5/attendance/check-in-qr-display.ejs"),
      /data-bb-session-qr-image|qrDataUrl|bb-v204-a05__qr/
    );
    assert.doesNotMatch(
      read("views/blessboard/v5/attendance/check-in-qr-display.ejs"),
      /#TK-8492|742\s*\/\s*950/
    );
    assert.match(
      read("views/blessboard/v5/attendance/check-in-peak.ejs"),
      /ready for next member/i
    );
    assert.match(
      read("views/blessboard/v5/attendance/check-in-peak.ejs"),
      /Record Check-In \(1-Tap\)/
    );
  });

  it("maps presentCheckInResult to Stitch A06 states without inventing engines", () => {
    const closed = presentCheckInResult({
      ok: false,
      code: VALIDATION_CODE.SESSION_CLOSED,
    });
    assert.equal(closed.kind, "closed");
    assert.match(closed.title, /Session Closed/i);

    const expired = presentCheckInResult({
      ok: false,
      code: VALIDATION_CODE.EXPIRED_QR,
    });
    assert.equal(expired.kind, "expired");
    assert.match(expired.title, /Invalid or Expired/i);

    const invalid = presentCheckInResult({
      ok: false,
      code: VALIDATION_CODE.INVALID_QR,
    });
    assert.equal(invalid.kind, "invalid");

    const already = presentCheckInResult({
      ok: true,
      code: VALIDATION_CODE.OK,
      duplicate: true,
      checkIn: { id: "ci-1", lateArrival: false, wrongBranch: false },
    });
    assert.equal(already.kind, "duplicate");
    assert.match(already.title, /Already Checked In/i);

    const onTime = presentCheckInResult({
      ok: true,
      code: VALIDATION_CODE.OK,
      lateArrival: false,
      wrongBranch: false,
      checkIn: { id: "ci-2", status: "present" },
    });
    assert.equal(onTime.kind, "success");
    assert.match(onTime.title, /Check-In Confirmed/i);

    const routes = read("src/blessboard/http/attendanceCheckInAdminRoutes.js");
    assert.match(routes, /QRCode\.toDataURL|require\("qrcode"\)/);
    assert.match(routes, /countCheckInsBySession/);
    assert.doesNotMatch(routes, /TK-8492|742\s*\/\s*950/);
  });

  it("wires check-in routes through shared service and mounts router", () => {
    const routes = read("src/blessboard/http/attendanceCheckInAdminRoutes.js");
    assert.match(routes, /checkInManual/);
    assert.match(routes, /checkInQr/);
    assert.match(routes, /checkInPeak/);
    assert.match(routes, /attendance\.check_in/);
    assert.match(routes, /\/check-in/);
    assert.match(routes, /\/qr\/check-in/);
    assert.match(routes, /\/peak/);
    assert.match(routes, /\/roster/);
    assert.doesNotMatch(routes, /validateAttendanceCheckIn\(/);

    const server = read("src/platform/http/v5FoundationServer.js");
    assert.match(server, /createAttendanceCheckInAdminRouter/);

    const svc = read("src/blessboard/services/attendance/attendanceCheckInService.js");
    assert.match(svc, /validateAttendanceCheckIn/);
    assert.equal(
      (svc.match(/validateAttendanceCheckIn/g) || []).length >= 3,
      true
    );
  });
});

describe("V2.04 BB check-in methods share one validation path", () => {
  it("manual / qr / peak succeed through the same engine", async () => {
    const auth = allowOnly([ATTENDANCE_PERMISSION.CHECK_IN]);
    const inserts = [];
    const storeDeps = () => ({
      authorize: auth,
      qrSigningSecret: "phase8-secret",
      sessionStore: { findById: async () => openSession() },
      memberStore: { findById: async () => activeMember() },
      checkInStore: {
        findActiveBySessionMember: async () => null,
        insert: async (_db, row) => {
          const saved = { id: "ci-" + (inserts.length + 1), ...row };
          inserts.push(saved);
          return saved;
        },
      },
    });

    const manual = await checkInManual(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        sessionId: SESSION_ID,
        memberId: MEMBER_ID,
        checkedInAt: new Date("2026-09-30T08:05:00.000Z"),
      },
      storeDeps()
    );
    assert.equal(manual.ok, true);
    assert.equal(manual.method, CHECK_IN_METHOD.MANUAL);
    assert.equal(manual.duplicate, false);

    inserts.length = 0;
    const peak = await checkInPeak(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        sessionId: SESSION_ID,
        memberId: MEMBER_ID,
        checkedInAt: new Date("2026-09-30T08:06:00.000Z"),
      },
      storeDeps()
    );
    assert.equal(peak.ok, true);
    assert.equal(peak.method, CHECK_IN_METHOD.PEAK);

    inserts.length = 0;
    const issued = await issueSessionCheckInQr(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        sessionId: SESSION_ID,
        actorUserId: ACTOR,
      },
      { qrSigningSecret: "phase8-secret", tokenStore: { insert: async () => ({}) } }
    );
    const qr = await checkInQr(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        memberId: MEMBER_ID,
        qrToken: issued.token,
        checkedInAt: new Date("2026-09-30T08:07:00.000Z"),
      },
      storeDeps()
    );
    assert.equal(qr.ok, true);
    assert.equal(qr.method, CHECK_IN_METHOD.QR);
  });

  it("duplicate returns existing attendance without second insert", async () => {
    const existing = {
      id: "ci-existing",
      sessionId: SESSION_ID,
      memberId: MEMBER_ID,
      status: "present",
      lateArrival: false,
      wrongBranch: false,
    };
    let inserts = 0;
    const deps = {
      authorize: allowOnly([ATTENDANCE_PERMISSION.CHECK_IN]),
      sessionStore: { findById: async () => openSession() },
      memberStore: { findById: async () => activeMember() },
      checkInStore: {
        findActiveBySessionMember: async () => existing,
        insert: async () => {
          inserts += 1;
          return { id: "should-not" };
        },
      },
    };

    for (const fn of [checkInManual, checkInPeak]) {
      inserts = 0;
      const result = await fn(
        {},
        {
          organizationId: ORG,
          churchId: CHURCH,
          actorUserId: ACTOR,
          sessionId: SESSION_ID,
          memberId: MEMBER_ID,
        },
        deps
      );
      assert.equal(result.ok, true);
      assert.equal(result.duplicate, true);
      assert.equal(result.checkIn.id, "ci-existing");
      assert.equal(inserts, 0);
      const presented = presentCheckInResult(result);
      assert.equal(presented.kind, "duplicate");
    }
  });

  it("wrong branch records both branches; late records without reject", async () => {
    const deps = {
      authorize: allowOnly([ATTENDANCE_PERMISSION.CHECK_IN]),
      sessionStore: {
        findById: async () => openSession({ branchId: BRANCH_A }),
      },
      memberStore: {
        findById: async () => activeMember({ primaryBranchId: BRANCH_B }),
      },
      checkInStore: {
        findActiveBySessionMember: async () => null,
        insert: async (_db, row) => ({ id: "ci-wb", ...row }),
      },
    };

    const result = await checkInManual(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        sessionId: SESSION_ID,
        memberId: MEMBER_ID,
        checkedInAt: new Date("2026-09-30T08:40:00.000Z"),
      },
      deps
    );
    assert.equal(result.ok, true);
    assert.equal(result.wrongBranch, true);
    assert.equal(result.lateArrival, true);
    assert.equal(result.checkIn.membershipBranchId, BRANCH_B);
    assert.equal(result.checkIn.attendanceBranchId, BRANCH_A);
    assert.equal(result.checkIn.status, "late");

    const presented = presentCheckInResult(result);
    assert.equal(presented.kind, "late");
    assert.equal(presented.lateArrival, true);
    assert.equal(presented.wrongBranch, true);
    assert.match(presented.title, /Late Arrival/i);
  });

  it("rejects when session not open for all methods", async () => {
    const deps = {
      authorize: allowOnly([ATTENDANCE_PERMISSION.CHECK_IN]),
      sessionStore: {
        findById: async () => openSession({ status: SESSION_STATUS.CLOSED }),
      },
      memberStore: { findById: async () => activeMember() },
      checkInStore: {
        findActiveBySessionMember: async () => null,
        insert: async () => ({ id: "x" }),
      },
      qrSigningSecret: "phase8-secret",
    };

    const manual = await checkInManual(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        sessionId: SESSION_ID,
        memberId: MEMBER_ID,
      },
      deps
    );
    assert.equal(manual.ok, false);
    assert.equal(manual.code, VALIDATION_CODE.SESSION_CLOSED);

    const peak = await checkInPeak(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        sessionId: SESSION_ID,
        memberId: MEMBER_ID,
      },
      deps
    );
    assert.equal(peak.ok, false);

    const issued = issueAttendanceToken(
      { kind: "session", sessionId: SESSION_ID },
      { qrSigningSecret: "phase8-secret" }
    );
    const qr = await checkInQr(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        memberId: MEMBER_ID,
        qrToken: issued.token,
      },
      deps
    );
    assert.equal(qr.ok, false);
  });

  it("QR tokens exclude Church ID / phone / member PII", () => {
    const issued = issueAttendanceToken(
      { kind: "session", sessionId: SESSION_ID },
      { qrSigningSecret: "phase8-secret" }
    );
    assert.equal(issued.ok, true);
    assertTokenHasNoPii(issued.token, {
      churchId: CHURCH,
      phone: "+15553921084",
      memberNumber: "CH-84291",
      email: "x@example.com",
      name: "Ezekiel",
    });

    const claim = issueAttendanceToken(
      { kind: "member_claim", sessionId: SESSION_ID, memberId: MEMBER_ID },
      { qrSigningSecret: "phase8-secret" }
    );
    assert.equal(claim.ok, true);
    assertTokenHasNoPii(claim.token, {
      churchId: CHURCH,
      phone: "+15553921084",
      memberNumber: "CH-84291",
    });
  });

  it("requires attendance.check_in authorization", async () => {
    const denied = await validateAttendanceCheckIn(
      {},
      {
        method: "manual",
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        session: openSession(),
        member: activeMember(),
      },
      { authorize: allowOnly([ATTENDANCE_PERMISSION.VIEW]) }
    );
    assert.equal(denied.ok, false);
    assert.equal(denied.code, VALIDATION_CODE.UNAUTHORIZED);
  });
});
