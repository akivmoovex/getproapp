"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { findStaffCollision, updateAppointmentByOrgAndId } = require(
  "../../../src/activeclinic/repositories/appointmentRepository"
);
const { findPublicBookingByIdempotencyKey } = require(
  "../../../src/activeclinic/services/activeClinicPublicBookingService"
);
const { assertStatusTransition } = require("../../../src/platform/history/statusHistory");
const {
  assertSyntheticPlan,
  buildAppointmentConcurrencyPlan,
  applyActiveClinicFixtures,
} = require("../fixtures/v13SyntheticFixtures");

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HCO_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STAFF = "abababab-abab-4aba-8aba-abababababab";
const APPOINTMENT = "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd";
const STARTS = new Date("2026-12-01T09:00:00.000Z");
const ENDS = new Date("2026-12-01T09:30:00.000Z");

function memoryDb(rowsFor) {
  const seen = [];
  return {
    seen,
    async query(sql, params) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      seen.push({ text, params });
      return rowsFor(text, params);
    },
  };
}

describe("D25 appointment concurrency", () => {
  it("keeps the synthetic concurrency plan unapplied", async () => {
    const plan = assertSyntheticPlan(buildAppointmentConcurrencyPlan());
    assert.equal(plan.persisted, false);
    assert.equal(plan.capacity, null);
    assert.equal(plan.existingConflict, "assigned_staff_overlap");
    assert.equal(plan.missingProtection, "slot_capacity_lock");
    const db = { async query() { throw new Error("query"); } };
    await assert.rejects(
      () => applyActiveClinicFixtures(db, "postgres://127.0.0.1/getpro_v13_ci_d25local01", {}),
      /V13_FIXTURE_HOLD/
    );
  });

  it("returns an assigned-staff overlap and ignores another organization", async () => {
    const db = memoryDb((text, params) => {
      if (!text.includes("FROM activeclinic.appointments")) return { rows: [], rowCount: 0 };
      if (params[0] !== ORG_A) return { rows: [], rowCount: 0 };
      return { rows: [{ id: APPOINTMENT }], rowCount: 1 };
    });
    const hit = await findStaffCollision(db, {
      organizationId: ORG_A,
      healthcareOrganizationId: HCO_A,
      assignedStaffId: STAFF,
      startsAt: STARTS,
      endsAt: ENDS,
    });
    assert.equal(hit.kind, "appointment");
    assert.match(db.seen[0].text, /starts_at < \$5/);
    assert.match(db.seen[0].text, /ends_at > \$4/);
    assert.doesNotMatch(db.seen[0].text, /FOR UPDATE/);
    const other = await findStaffCollision(db, {
      organizationId: ORG_B,
      healthcareOrganizationId: HCO_A,
      assignedStaffId: STAFF,
      startsAt: STARTS,
      endsAt: ENDS,
    });
    assert.equal(other, null);
    assert.equal(db.seen.some((entry) => /^update\b/i.test(entry.text)), false);
  });

  it("does not query when no staff member is assigned", async () => {
    const db = memoryDb(() => { throw new Error("query"); });
    const result = await findStaffCollision(db, { assignedStaffId: null });
    assert.equal(result, null);
    assert.equal(db.seen.length, 0);
  });

  it("lets two overlap checks both miss when the slot is still empty", async () => {
    const db = memoryDb(() => ({ rows: [], rowCount: 0 }));
    const input = {
      organizationId: ORG_A,
      healthcareOrganizationId: HCO_A,
      assignedStaffId: STAFF,
      startsAt: STARTS,
      endsAt: ENDS,
    };
    const first = await findStaffCollision(db, input);
    const second = await findStaffCollision(db, input);
    assert.equal(first, null);
    assert.equal(second, null);
    assert.equal(db.seen.every((entry) => !/FOR UPDATE/.test(entry.text)), true);
  });

  it("returns an existing public booking for the same idempotency key and organization", async () => {
    const db = memoryDb((text, params) => {
      if (params[0] !== ORG_A) return { rows: [], rowCount: 0 };
      return {
        rows: [{ id: APPOINTMENT, request_number: "PB-1", status: "submitted_pending_confirmation", created_at: STARTS, booking_kind: "consultation" }],
        rowCount: 1,
      };
    });
    const same = await findPublicBookingByIdempotencyKey(db, {
      organizationId: ORG_A,
      idempotencyKey: "d25-retry-key",
    });
    assert.equal(same.duplicate, true);
    assert.equal(same.booking.id, APPOINTMENT);
    const other = await findPublicBookingByIdempotencyKey(db, {
      organizationId: ORG_B,
      idempotencyKey: "d25-retry-key",
    });
    assert.equal(other.ok, false);
    assert.equal(other.code, "not_found");
    const invalid = await findPublicBookingByIdempotencyKey(
      { async query() { throw new Error("query"); } },
      { organizationId: "not-a-uuid", idempotencyKey: "d25-retry-key" }
    );
    assert.equal(invalid.code, "invalid_input");
  });

  it("treats a version mismatch as no updated row and refuses a cancelled retry", async () => {
    const db = memoryDb(() => ({ rows: [], rowCount: 0 }));
    const updated = await updateAppointmentByOrgAndId(db, {
      id: APPOINTMENT,
      organizationId: ORG_A,
      healthcareOrganizationId: HCO_A,
      expectedVersion: 3,
      patch: { status: "cancelled", cancellationReason: "patient_request" },
    });
    assert.equal(updated, null);
    assert.match(db.seen[0].text, /AND version =/);
    assert.equal(db.seen[0].params.includes(3), true);
    const allowed = {
      confirmed: ["arrived", "waiting", "cancelled", "no_show"],
      cancelled: [],
    };
    assert.equal(assertStatusTransition("confirmed", "cancelled", allowed).ok, true);
    assert.equal(assertStatusTransition("cancelled", "confirmed", allowed).ok, false);
  });
});
