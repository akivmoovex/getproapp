"use strict";

/**
 * V2.04 Phase 9 — Attendance correction + audit (A12–A14).
 * Never silent overwrite; fail-closed on attendance.correct.
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
  ATTENDANCE_PERMISSION,
  correctAttendanceCheckIn,
  sanitizeCorrectedValue,
  snapshotCheckIn,
} = require("../src/blessboard/services/attendance");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHURCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACTOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CHECK_IN_ID = "22222222-2222-4222-8222-222222222222";
const CHECKED_AT = new Date("2026-09-30T08:12:00.000Z");

function allowOnly(keys) {
  const set = new Set(keys);
  return async (_db, input) => ({
    allowed: set.has(input.permission),
    reasonCode: set.has(input.permission) ? "RBAC_ALLOWED" : "RBAC_PERMISSION_DENIED",
  });
}

function sampleCheckIn(overrides) {
  return {
    id: CHECK_IN_ID,
    organizationId: ORG,
    churchId: CHURCH,
    sessionId: "11111111-1111-4111-8111-111111111111",
    memberId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    status: "present",
    method: "manual",
    checkedInAt: CHECKED_AT,
    lateArrival: false,
    wrongBranch: false,
    needsReview: false,
    ...overrides,
  };
}

describe("V2.04 BB correction Stitch + route wiring", () => {
  it("ships functional A12–A14 markers (Stitch screens absent)", () => {
    assert.match(read("views/blessboard/v5/attendance/correction-form.ejs"), /data-bb-stitch-v204="BB-A12"/);
    assert.match(read("views/blessboard/v5/attendance/correction-form.ejs"), /Correct Attendance/);
    assert.match(read("views/blessboard/v5/attendance/correction-form.ejs"), /Never silently overwrite/);
    assert.match(read("views/blessboard/v5/attendance/correction-form.ejs"), /immutable method/);
    assert.doesNotMatch(
      read("views/blessboard/v5/attendance/correction-form.ejs"),
      /correctAttendanceCheckIn/
    );

    assert.match(
      read("views/blessboard/v5/attendance/correction-confirmed.ejs"),
      /data-bb-stitch-v204="BB-A13"/
    );
    assert.match(
      read("views/blessboard/v5/attendance/correction-confirmed.ejs"),
      /Correction Confirmation/
    );
    assert.match(
      read("views/blessboard/v5/attendance/correction-confirmed.ejs"),
      /Preserved method/
    );

    assert.match(
      read("views/blessboard/v5/attendance/correction-audit.ejs"),
      /data-bb-stitch-v204="BB-A14"/
    );
    assert.match(
      read("views/blessboard/v5/attendance/correction-audit.ejs"),
      /Attendance History \/ Audit/
    );
  });

  it("wires correction routes with attendance.correct fail-closed", () => {
    const routes = read("src/blessboard/http/attendanceCorrectionAdminRoutes.js");
    assert.match(routes, /attendance\.correct/);
    assert.match(routes, /gateCorrect/);
    assert.match(routes, /correctAttendanceCheckIn/);
    assert.match(routes, /\/check-ins\/:checkInId\/correct/);
    assert.match(routes, /\/correction\/:correctionId/);
    assert.match(routes, /\/audit/);
    assert.match(routes, /SESSION_LOCKED/);

    const server = read("src/platform/http/v5FoundationServer.js");
    assert.match(server, /createAttendanceCorrectionAdminRouter/);
  });
});

describe("V2.04 BB correction service rules", () => {
  it("fails unauthorized at service level without applying correction", async () => {
    let applied = false;
    const result = await correctAttendanceCheckIn(
      {},
      {
        checkInId: CHECK_IN_ID,
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        originalValue: { status: "present", lateArrival: false, wrongBranch: false },
        correctedValue: { status: "voided" },
        reason: "wrong member scanned",
        checkIn: sampleCheckIn(),
      },
      {
        authorize: allowOnly([ATTENDANCE_PERMISSION.CHECK_IN]),
        checkInStore: {
          findById: async () => sampleCheckIn(),
          applyCorrection: async () => {
            applied = true;
          },
        },
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "unauthorized");
    assert.equal(applied, false);
  });

  it("requires original + corrected + reason; never silently overwrites method/time", async () => {
    const missing = await correctAttendanceCheckIn(
      {},
      {
        checkInId: CHECK_IN_ID,
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        originalValue: { status: "present" },
        correctedValue: { status: "voided" },
        reason: "ab",
      },
      { authorize: allowOnly([ATTENDANCE_PERMISSION.CORRECT]) }
    );
    assert.equal(missing.code, "invalid_input");

    let appliedPayload = null;
    const checkIn = sampleCheckIn();
    const ok = await correctAttendanceCheckIn(
      {},
      {
        checkInId: CHECK_IN_ID,
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH_A,
        actorUserId: ACTOR,
        sessionStatus: "closed",
        checkIn,
        originalValue: {
          status: "present",
          lateArrival: false,
          wrongBranch: false,
        },
        correctedValue: {
          status: "voided",
          method: "peak",
          checkedInAt: new Date("2099-01-01T00:00:00.000Z"),
          lateArrival: true,
        },
        reason: "scanned wrong person at door",
      },
      {
        authorize: allowOnly([ATTENDANCE_PERMISSION.CORRECT]),
        correctionStore: { insert: async (_db, row) => row },
        checkInStore: {
          findById: async () => checkIn,
          applyCorrection: async (_db, args) => {
            appliedPayload = args;
            return { ok: true };
          },
        },
      }
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.correction.originalValue.method, "manual");
    assert.equal(
      new Date(ok.correction.originalValue.checkedInAt).toISOString(),
      CHECKED_AT.toISOString()
    );
    assert.equal(ok.correction.correctedValue.method, "manual");
    assert.equal(
      new Date(ok.correction.correctedValue.checkedInAt).toISOString(),
      CHECKED_AT.toISOString()
    );
    assert.equal(ok.correction.correctedValue.status, "voided");
    assert.ok(ok.correction.timestamp);
    assert.equal(ok.correction.actorUserId, ACTOR);
    assert.equal(appliedPayload.correctedValue.method, undefined);
    assert.equal(appliedPayload.correctedValue.checkedInAt, undefined);
    assert.equal(appliedPayload.correctedValue.status, "voided");
  });

  it("rejects locked sessions and original mismatch", async () => {
    const locked = await correctAttendanceCheckIn(
      {},
      {
        checkInId: CHECK_IN_ID,
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        sessionStatus: "locked",
        checkIn: sampleCheckIn(),
        originalValue: { status: "present", lateArrival: false, wrongBranch: false },
        correctedValue: { status: "voided" },
        reason: "too late to change",
      },
      { authorize: allowOnly([ATTENDANCE_PERMISSION.CORRECT]) }
    );
    assert.equal(locked.code, "session_locked");

    const mismatch = await correctAttendanceCheckIn(
      {},
      {
        checkInId: CHECK_IN_ID,
        organizationId: ORG,
        churchId: CHURCH,
        actorUserId: ACTOR,
        sessionStatus: "open",
        checkIn: sampleCheckIn({ status: "late", lateArrival: true }),
        originalValue: { status: "present", lateArrival: false, wrongBranch: false },
        correctedValue: { status: "voided" },
        reason: "stale form submit",
      },
      {
        authorize: allowOnly([ATTENDANCE_PERMISSION.CORRECT]),
        checkInStore: {
          findById: async () => sampleCheckIn({ status: "late", lateArrival: true }),
        },
      }
    );
    assert.equal(mismatch.code, "original_mismatch");
  });

  it("sanitizeCorrectedValue strips immutable fields", () => {
    const snap = snapshotCheckIn(sampleCheckIn());
    const safe = sanitizeCorrectedValue(
      {
        status: "voided",
        method: "qr",
        checkedInAt: "2099-01-01",
        lateArrival: true,
      },
      snap
    );
    assert.equal(safe.method, "manual");
    assert.equal(new Date(safe.checkedInAt).toISOString(), CHECKED_AT.toISOString());
    assert.equal(safe.status, "voided");
    assert.equal(safe.lateArrival, true);
  });
});
