"use strict";

/**
 * Stored order and laboratory status checks.
 * No dose, allergy, or payment rule is decided here.
 */

const STORED_ORDER_TYPES = Object.freeze([
  "laboratory",
  "prescription",
  "radiology",
  "other",
]);

const STORED_ORDER_STATUSES = Object.freeze(["draft", "submitted", "cancelled"]);

const RESULTABLE_LABORATORY_REQUEST_STATUSES = Object.freeze([
  "pending_collection",
  "collected",
  "received",
  "processing",
]);

function isStoredOrderType(value) {
  return STORED_ORDER_TYPES.includes(String(value || ""));
}

function isStoredOrderStatus(value) {
  return STORED_ORDER_STATUSES.includes(String(value || ""));
}

function canAttachLaboratoryResult(status) {
  return RESULTABLE_LABORATORY_REQUEST_STATUSES.includes(status);
}

const CLOSED_DIAGNOSTIC_STATUSES = Object.freeze(["verified", "released"]);

function isClosedDiagnosticStatus(status) {
  return CLOSED_DIAGNOSTIC_STATUSES.includes(status);
}

module.exports = {
  STORED_ORDER_TYPES,
  STORED_ORDER_STATUSES,
  RESULTABLE_LABORATORY_REQUEST_STATUSES,
  isStoredOrderType,
  isStoredOrderStatus,
  canAttachLaboratoryResult,
  CLOSED_DIAGNOSTIC_STATUSES,
  isClosedDiagnosticStatus,
};
