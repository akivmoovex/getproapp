"use strict";

/**
 * Offline attendance boundary (Phase 6).
 *
 * Complex offline synchronization is intentionally NOT implemented.
 * This module reserves the ingest contract so queue/reconciliation can be
 * added later without rewriting the online validation engine.
 */

const OFFLINE_INGEST_STATUS = Object.freeze({
  RESERVED: "reserved",
  PENDING: "pending",
  SYNCED: "synced",
  DUPLICATE: "duplicate",
  CONFLICT: "conflict",
  FAILED: "failed",
});

/**
 * Online check-in path must remain the source of truth.
 * Offline clients may later enqueue payloads matching this shape.
 *
 * @typedef {{
 *   clientItemId: string,
 *   organizationId: string,
 *   churchId: string,
 *   branchId: string,
 *   sessionId: string,
 *   memberId?: string|null,
 *   method: 'manual'|'qr'|'peak',
 *   capturedAtClient: string,
 *   qrToken?: string|null,
 * }} OfflineAttendancePayload
 */

/**
 * Reject sync attempts in Phase 6 — boundary only.
 */
async function enqueueOfflineAttendanceIngest(_db, _input, _deps) {
  return {
    ok: false,
    code: "offline_sync_not_implemented",
    phase: 6,
    message:
      "Offline queue/reconciliation is deferred. Use online validateAttendanceCheckIn.",
    reservedStatuses: Object.values(OFFLINE_INGEST_STATUS),
  };
}

/**
 * Future sync must re-authorize and call the same validation engine.
 */
function describeOfflineReconciliationContract() {
  return {
    implemented: false,
    requires: [
      "re_authorize_staff_on_sync",
      "idempotent_client_item_id",
      "call_validateAttendanceCheckIn",
      "conflict_policy",
      "device_storage_policy",
    ],
    mustNot: [
      "bypass_session_state_checks",
      "embed_pii_in_offline_qr",
      "auto_merge_without_audit",
    ],
    table: "blessboard.attendance_offline_ingest_boundary",
  };
}

module.exports = {
  OFFLINE_INGEST_STATUS,
  enqueueOfflineAttendanceIngest,
  describeOfflineReconciliationContract,
};
