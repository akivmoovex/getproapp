"use strict";

/**
 * Platform reusable approval-request constants (V2.04 Phase 7).
 */

const APPROVAL_REQUEST_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

const APPROVAL_REQUEST_STATUSES = Object.freeze([
  APPROVAL_REQUEST_STATUS.PENDING,
  APPROVAL_REQUEST_STATUS.APPROVED,
  APPROVAL_REQUEST_STATUS.REJECTED,
  APPROVAL_REQUEST_STATUS.CANCELLED,
]);

const REQUESTER_SUBJECT_TYPE = Object.freeze({
  USER: "user",
  MEMBER: "member",
  STAFF: "staff",
  IDENTITY: "identity",
});

/** Allowed transitions from pending. Terminal states have none. */
const APPROVAL_TRANSITIONS = Object.freeze({
  [APPROVAL_REQUEST_STATUS.PENDING]: Object.freeze([
    APPROVAL_REQUEST_STATUS.APPROVED,
    APPROVAL_REQUEST_STATUS.REJECTED,
    APPROVAL_REQUEST_STATUS.CANCELLED,
  ]),
  [APPROVAL_REQUEST_STATUS.APPROVED]: Object.freeze([]),
  [APPROVAL_REQUEST_STATUS.REJECTED]: Object.freeze([]),
  [APPROVAL_REQUEST_STATUS.CANCELLED]: Object.freeze([]),
});

const APPROVAL_REQUEST_CODE = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "approval_request_not_found",
  DUPLICATE_PENDING: "duplicate_pending_request",
  SELF_APPROVAL_DENIED: "self_approval_denied",
  UNAUTHORIZED: "unauthorized",
  RESOURCE_SCOPE_DENIED: "resource_scope_denied",
  TENANT_MISMATCH: "tenant_mismatch",
  INVALID_TRANSITION: "invalid_transition",
  NOT_PENDING: "not_pending",
  ADAPTER_FAILED: "adapter_failed",
});

module.exports = {
  APPROVAL_REQUEST_STATUS,
  APPROVAL_REQUEST_STATUSES,
  REQUESTER_SUBJECT_TYPE,
  APPROVAL_TRANSITIONS,
  APPROVAL_REQUEST_CODE,
};
