"use strict";

/**
 * V2.04 Phase 6 — BlessBoard session attendance domain foundation.
 * MANUAL + QR + PEAK share validateAttendanceCheckIn. No Stitch UI. No offline sync.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  SESSION_STATUS,
  CHECK_IN_METHOD,
  WRONG_BRANCH_POLICY,
  ATTENDANCE_PERMISSION,
  VALIDATION_CODE,
  validateAttendanceCheckIn,
  evaluateLateArrival,
  evaluateWrongBranch,
  createAttendanceSession,
  transitionAttendanceSession,
  checkInManual,
  checkInQr,
  checkInPeak,
  issueSessionCheckInQr,
  issueMemberCheckInClaimQr,
  correctAttendanceCheckIn,
  issueAttendanceToken,
  verifyAttendanceToken,
  assertTokenHasNoPii,
  enqueueOfflineAttendanceIngest,
  describeOfflineReconciliationContract,
} = require("../src/blessboard/services/attendance");

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
    wrongBranchPolicy: WRONG_BRANCH_POLICY.RECORD,
    ...overrides,
  };
}

function activeMember(overrides) {
  return {
    id: MEMBER_ID,
    churchId: CHURCH,
    status: "active",
    primaryBranchId: BRANCH_A,
    ...overrides,
  };
}

describe("V2.04 BB attendance session + QR opacity", () => {
  it("defines session states and check-in methods", () => {
    assert.deepEqual(
      [SESSION_STATUS.DRAFT, SESSION_STATUS.OPEN, SESSION_STATUS.CLOSED, SESSION_STATUS.LOCKED],
      ["draft", "open", "closed", "locked"]
    );
    assert.deepEqual(
      [CHECK_IN_METHOD.MANUAL, CHECK_IN_METHOD.QR, CHECK_IN_METHOD.PEAK],
      ["manual", "qr", "peak"]
    );
    assert.equal(ATTENDANCE_PERMISSION.CHECK_IN, "attendance.check_in");
    assert.equal(ATTENDANCE_PERMISSION.CORRECT, "attendance.correct");
  });

  it("creates draft session and transitions draft→open→closed→locked", async () => {
    const store = {
      rows: new Map(),
      async insert(_db, row) {
        const id = SESSION_ID;
        const saved = { ...row, id };
        this.rows.set(id, saved);
        return saved;
      },
      async findById(_db, id) {
        return this.rows.get(id) || null;
      },
      async update(_db, { sessionId, patch }) {
        const cur = this.rows.get(sessionId);
        const next = { ...cur, ...patch };
        this.rows.set(sessionId, next);
        return next;
      },
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
        lateThresholdMinutes: 10,
        serviceEventRef: "sunday-am",
        title: "Sunday Service",
      },
      {
        authorize: allowOnly([ATTENDANCE_PERMISSION.MANAGE_SESSION]),
        sessionStore: store,
      }
    );
    assert.equal(created.ok, true);
    assert.equal(created.session.status, "draft");

    const opened = await transitionAttendanceSession(
      {},
      {
        sessionId: SESSION_ID,
        toStatus: "open",
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH_A,
      },
      {
        authorize: allowOnly([ATTENDANCE_PERMISSION.MANAGE_SESSION]),
        sessionStore: store,
      }
    );
    assert.equal(opened.session.status, "open");

    const closed = await transitionAttendanceSession(
      {},
      {
        sessionId: SESSION_ID,
        toStatus: "closed",
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
      },
      {
        authorize: allowOnly([ATTENDANCE_PERMISSION.MANAGE_SESSION]),
        sessionStore: store,
      }
    );
    assert.equal(closed.session.status, "closed");

    const locked = await transitionAttendanceSession(
      {},
      {
        sessionId: SESSION_ID,
        toStatus: "locked",
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
      },
      {
        authorize: allowOnly([ATTENDANCE_PERMISSION.MANAGE_SESSION]),
        sessionStore: store,
      }
    );
    assert.equal(locked.session.status, "locked");

    const reopen = await transitionAttendanceSession(
      {},
      {
        sessionId: SESSION_ID,
        toStatus: "open",
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
      },
      {
        authorize: allowOnly([ATTENDANCE_PERMISSION.MANAGE_SESSION]),
        sessionStore: store,
      }
    );
    assert.equal(reopen.code, "invalid_transition");
  });

  it("QR token excludes Church ID, phone, and member PII", () => {
    const issued = issueAttendanceToken(
      {
        kind: "session",
        sessionId: SESSION_ID,
        memberId: MEMBER_ID,
      },
      { qrSigningSecret: "test-secret" }
    );
    assert.equal(issued.ok, true);
    assert.equal(assertTokenHasNoPii(issued.token).ok, true);
    const verified = verifyAttendanceToken(issued.token, {
      qrSigningSecret: "test-secret",
    });
    assert.equal(verified.ok, true);
    assert.equal(verified.sessionId, SESSION_ID);
    assert.equal(verified.memberId, undefined);
    const decoded = Buffer.from(issued.token.split(".")[0], "base64url").toString("utf8");
    assert.doesNotMatch(decoded, /phone|email|member_number|church_id|firstName/i);
    assert.doesNotMatch(decoded, new RegExp(MEMBER_ID));
  });
});

describe("V2.04 BB shared validation engine (manual + qr + peak)", () => {
  const auth = allowOnly([ATTENDANCE_PERMISSION.CHECK_IN]);

  it("manual / qr / peak all invoke the same validation outcomes", async () => {
    const base = {
      organizationId: ORG,
      churchId: CHURCH,
      actorUserId: ACTOR,
      session: openSession(),
      member: activeMember(),
      existingCheckIn: null,
      checkedInAt: new Date("2026-09-30T08:05:00.000Z"),
    };

    const manual = await validateAttendanceCheckIn(
      {},
      { ...base, method: "manual" },
      { authorize: auth }
    );
    assert.equal(manual.ok, true);
    assert.equal(manual.decision.create, true);
    assert.equal(manual.decision.lateArrival, false);

    const qrTok = issueAttendanceToken(
      { kind: "session", sessionId: SESSION_ID },
      { qrSigningSecret: "test-secret" }
    );
    const qr = await validateAttendanceCheckIn(
      {},
      { ...base, method: "qr", qrToken: qrTok.token },
      { authorize: auth, qrSigningSecret: "test-secret" }
    );
    assert.equal(qr.ok, true);
    assert.equal(qr.decision.method, "qr");

    const peak = await validateAttendanceCheckIn(
      {},
      { ...base, method: "peak" },
      { authorize: auth }
    );
    assert.equal(peak.ok, true);
    assert.equal(peak.decision.method, "peak");

    // Same engine field set for all methods
    for (const r of [manual, qr, peak]) {
      assert.ok(r.decision.membershipBranchId);
      assert.ok(r.decision.attendanceBranchId);
      assert.equal(typeof r.decision.lateArrival, "boolean");
      assert.equal(typeof r.decision.wrongBranch, "boolean");
    }
  });

  it("rejects closed/locked sessions and unauthorized staff", async () => {
    const closed = await validateAttendanceCheckIn(
      {},
      {
        method: "manual",
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        session: openSession({ status: "closed" }),
        member: activeMember(),
      },
      { authorize: auth }
    );
    assert.equal(closed.code, VALIDATION_CODE.SESSION_CLOSED);

    const locked = await validateAttendanceCheckIn(
      {},
      {
        method: "manual",
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        session: openSession({ status: "locked" }),
        member: activeMember(),
      },
      { authorize: auth }
    );
    assert.equal(locked.code, VALIDATION_CODE.SESSION_LOCKED);

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
    assert.equal(denied.code, VALIDATION_CODE.UNAUTHORIZED);
  });

  it("validates eligible members and rejects inactive", async () => {
    const bad = await validateAttendanceCheckIn(
      {},
      {
        method: "manual",
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        session: openSession(),
        member: activeMember({ status: "inactive" }),
      },
      { authorize: auth }
    );
    assert.equal(bad.code, VALIDATION_CODE.MEMBER_NOT_ELIGIBLE);
  });

  it("duplicate returns existing attendance rather than creating another", async () => {
    const existing = { id: "check-1", memberId: MEMBER_ID, sessionId: SESSION_ID };
    const result = await validateAttendanceCheckIn(
      {},
      {
        method: "manual",
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        session: openSession(),
        member: activeMember(),
        existingCheckIn: existing,
      },
      { authorize: auth }
    );
    assert.equal(result.ok, true);
    assert.equal(result.duplicate, true);
    assert.equal(result.decision.create, false);
    assert.equal(result.existing.id, "check-1");
  });

  it("wrong branch records both branches; policy deny rejects; default does not", () => {
    const session = openSession({ branchId: BRANCH_A });
    const member = activeMember({ primaryBranchId: BRANCH_B });

    const record = evaluateWrongBranch(session, member, WRONG_BRANCH_POLICY.RECORD);
    assert.equal(record.wrongBranch, true);
    assert.equal(record.reject, false);
    assert.equal(record.membershipBranchId, BRANCH_B);
    assert.equal(record.attendanceBranchId, BRANCH_A);

    const review = evaluateWrongBranch(
      session,
      member,
      WRONG_BRANCH_POLICY.REQUIRE_REVIEW
    );
    assert.equal(review.needsReview, true);
    assert.equal(review.reject, false);

    const deny = evaluateWrongBranch(session, member, WRONG_BRANCH_POLICY.DENY);
    assert.equal(deny.reject, true);
  });

  it("late arrival is metadata, not a rejection", () => {
    const session = openSession({
      startTime: new Date("2026-09-30T08:00:00.000Z"),
      lateThresholdMinutes: 15,
    });
    const late = evaluateLateArrival(
      session,
      new Date("2026-09-30T08:20:00.000Z")
    );
    assert.equal(late.lateArrival, true);
    assert.equal(late.checkInStatus, "late");

    const onTime = evaluateLateArrival(
      session,
      new Date("2026-09-30T08:10:00.000Z")
    );
    assert.equal(onTime.lateArrival, false);
  });

  it("invalid and expired QR fail validation", async () => {
    const bad = await validateAttendanceCheckIn(
      {},
      {
        method: "qr",
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        session: openSession(),
        member: activeMember(),
        qrToken: "not-a-token",
      },
      { authorize: auth, qrSigningSecret: "test-secret" }
    );
    assert.equal(bad.code, VALIDATION_CODE.INVALID_QR);

    const issued = issueAttendanceToken(
      {
        kind: "session",
        sessionId: SESSION_ID,
        ttlSeconds: 60,
        now: new Date("2026-09-30T07:00:00.000Z"),
      },
      { qrSigningSecret: "test-secret" }
    );
    const expired = await validateAttendanceCheckIn(
      {},
      {
        method: "qr",
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        session: openSession(),
        member: activeMember(),
        qrToken: issued.token,
        checkedInAt: new Date("2026-09-30T09:00:00.000Z"),
      },
      {
        authorize: auth,
        qrSigningSecret: "test-secret",
        now: new Date("2026-09-30T09:00:00.000Z"),
      }
    );
    assert.equal(expired.code, VALIDATION_CODE.EXPIRED_QR);
  });
});

describe("V2.04 BB check-in orchestration + corrections + offline boundary", () => {
  it("checkInManual / checkInQr / checkInPeak share engine and handle duplicate", async () => {
    const checks = [];
    const deps = {
      authorize: allowOnly([ATTENDANCE_PERMISSION.CHECK_IN]),
      qrSigningSecret: "test-secret",
      sessionStore: {
        findById: async () => openSession(),
      },
      memberStore: {
        findById: async () => activeMember(),
      },
      checkInStore: {
        findActiveBySessionMember: async () =>
          checks.length ? checks[0] : null,
        insert: async (_db, row) => {
          const saved = { id: "ci-" + (checks.length + 1), ...row };
          checks.push(saved);
          return saved;
        },
      },
    };

    const first = await checkInManual(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        sessionId: SESSION_ID,
        memberId: MEMBER_ID,
        checkedInAt: new Date("2026-09-30T08:05:00.000Z"),
      },
      deps
    );
    assert.equal(first.ok, true);
    assert.equal(first.duplicate, false);
    assert.equal(first.method, "manual");

    const dup = await checkInPeak(
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
    assert.equal(dup.ok, true);
    assert.equal(dup.duplicate, true);
    assert.equal(dup.checkIn.id, first.checkIn.id);
    assert.equal(checks.length, 1);

    const qrIssued = await issueSessionCheckInQr(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        sessionId: SESSION_ID,
        actorUserId: ACTOR,
      },
      {
        qrSigningSecret: "test-secret",
        tokenStore: { insert: async () => ({}) },
      }
    );
    assert.equal(qrIssued.ok, true);

    // Clear existing for QR path demo of late + wrong branch record
    checks.length = 0;
    const lateWrong = await checkInQr(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        memberId: MEMBER_ID,
        qrToken: qrIssued.token,
        checkedInAt: new Date("2026-09-30T08:30:00.000Z"),
      },
      {
        ...deps,
        memberStore: {
          findById: async () =>
            activeMember({ primaryBranchId: BRANCH_B }),
        },
        sessionStore: {
          findById: async () => openSession({ branchId: BRANCH_A }),
        },
        checkInStore: {
          findActiveBySessionMember: async () => null,
          insert: async (_db, row) => {
            assert.equal(row.wrongBranch, true);
            assert.equal(row.lateArrival, true);
            assert.equal(row.membershipBranchId, BRANCH_B);
            assert.equal(row.attendanceBranchId, BRANCH_A);
            return { id: "ci-qr", ...row };
          },
        },
      }
    );
    assert.equal(lateWrong.ok, true);
    assert.equal(lateWrong.lateArrival, true);
    assert.equal(lateWrong.wrongBranch, true);
  });

  it("corrections require permission, original, corrected, actor, reason; audit", async () => {
    const denied = await correctAttendanceCheckIn(
      {},
      {
        checkInId: "ci-1",
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        originalValue: { status: "present" },
        correctedValue: { status: "voided" },
        reason: "wrong member",
      },
      { authorize: allowOnly([ATTENDANCE_PERMISSION.CHECK_IN]) }
    );
    assert.equal(denied.code, "unauthorized");

    const locked = await correctAttendanceCheckIn(
      {},
      {
        checkInId: "ci-1",
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        originalValue: { status: "present" },
        correctedValue: { status: "voided" },
        reason: "wrong member",
        sessionStatus: "locked",
      },
      { authorize: allowOnly([ATTENDANCE_PERMISSION.CORRECT]) }
    );
    assert.equal(locked.code, "session_locked");

    const ok = await correctAttendanceCheckIn(
      {},
      {
        checkInId: "ci-1",
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        branchId: BRANCH_A,
        originalValue: { status: "present", memberId: MEMBER_ID },
        correctedValue: { status: "voided" },
        reason: "scanned wrong person",
        sessionStatus: "closed",
      },
      {
        authorize: allowOnly([ATTENDANCE_PERMISSION.CORRECT]),
        correctionStore: {
          insert: async (_db, row) => row,
        },
        checkInStore: {
          applyCorrection: async () => ({ ok: true }),
        },
      }
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.correction.actorUserId, ACTOR);
    assert.equal(ok.correction.reason, "scanned wrong person");
    assert.ok(ok.correction.timestamp);
    assert.deepEqual(ok.correction.originalValue.status, "present");
    assert.deepEqual(ok.correction.correctedValue.status, "voided");
  });

  it("offline sync is deferred; boundary contract reserved", async () => {
    const blocked = await enqueueOfflineAttendanceIngest({}, {});
    assert.equal(blocked.code, "offline_sync_not_implemented");
    const contract = describeOfflineReconciliationContract();
    assert.equal(contract.implemented, false);
    assert.ok(contract.requires.includes("call_validateAttendanceCheckIn"));
  });

  it("ships additive migration without replacing aggregate attendance_events", () => {
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        "../db/migrations/blessboard/121_attendance_session_domain_v204.sql"
      ),
      "utf8"
    );
    assert.match(sql, /attendance_sessions/);
    assert.match(sql, /attendance_check_ins/);
    assert.match(sql, /attendance_corrections/);
    assert.match(sql, /attendance_offline_ingest_boundary/);
    assert.match(sql, /wrong_branch_policy/);
    assert.match(sql, /'manual', 'qr', 'peak'/);
    assert.match(sql, /'draft', 'open', 'closed', 'locked'/);
    assert.doesNotMatch(sql, /DROP TABLE.*attendance_events/i);

    const aggregateStillExists = fs.existsSync(
      path.join(__dirname, "../db/migrations/blessboard/023_create_attendance.sql")
    );
    assert.equal(aggregateStillExists, true);
  });
});
