"use strict";

/**
 * Staff-managed person workflow result codes (V2.04 Phase 3).
 * Not a merged memberPatient domain — product outcomes stay product-owned.
 */

const STAFF_PERSON_WORKFLOW_CODE = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  ADAPTER_MISSING: "adapter_missing",
  UNAUTHORIZED: "unauthorized",
  VALIDATION_FAILED: "validation_failed",
  DUPLICATE_BLOCKED: "duplicate_blocked",
  DUPLICATE_OVERRIDE_REQUIRED: "duplicate_override_required",
  DUPLICATE_OVERRIDE_DENIED: "duplicate_override_denied",
  PERSON_FAILED: "person_failed",
  PRODUCT_CREATE_FAILED: "product_create_failed",
  LINK_FAILED: "link_failed",
  SCOPE_DENIED: "scope_denied",
});

const STAFF_PERSON_WORKFLOW_SOURCE = Object.freeze({
  STAFF_UI: "staff_ui",
  STAFF_API: "staff_api",
  IMPORT: "import",
  SYSTEM: "system",
  TEST: "test",
});

module.exports = {
  STAFF_PERSON_WORKFLOW_CODE,
  STAFF_PERSON_WORKFLOW_SOURCE,
};
