"use strict";

/**
 * Pure scheduling rules already enforced by the appointment overlap query.
 * Slot capacity is not one of those rules.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BLOCKING_APPOINTMENT_STATUSES = Object.freeze([
  "requested",
  "confirmed",
  "arrived",
  "waiting",
  "with_practitioner",
]);

function isUsableAssignedStaffId(value) {
  if (value == null || String(value).trim() === "") return true;
  return UUID_RE.test(String(value).trim());
}

function staffOverlapApplies(assignedStaffId) {
  return Boolean(assignedStaffId && String(assignedStaffId).trim());
}

function isBlockingAppointmentStatus(status) {
  return BLOCKING_APPOINTMENT_STATUSES.includes(status);
}

function intervalsOverlap(startsAt, endsAt, otherStartsAt, otherEndsAt) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const otherStart = new Date(otherStartsAt).getTime();
  const otherEnd = new Date(otherEndsAt).getTime();
  if (![start, end, otherStart, otherEnd].every(Number.isFinite)) return false;
  if (!(start < end) || !(otherStart < otherEnd)) return false;
  return start < otherEnd && end > otherStart;
}

function classifyIdempotentRetry(existingRow) {
  if (!existingRow) return { duplicate: false, capacity: null };
  return {
    duplicate: true,
    capacity: null,
    protection: "request_dedup_not_slot_lock",
  };
}

function evaluateSlotCapacity() {
  return {
    ok: false,
    code: "BLOCKED_APPROVAL_REQUIRED",
    capacity: null,
    reason: "slot_capacity_not_approved",
  };
}

module.exports = {
  BLOCKING_APPOINTMENT_STATUSES,
  isUsableAssignedStaffId,
  staffOverlapApplies,
  isBlockingAppointmentStatus,
  intervalsOverlap,
  classifyIdempotentRetry,
  evaluateSlotCapacity,
};
