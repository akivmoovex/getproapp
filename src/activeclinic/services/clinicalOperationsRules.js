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

const RESULTABLE_RADIOLOGY_REQUEST_STATUSES = Object.freeze([
  "pending",
  "in_progress",
  "completed",
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

function canAttachRadiologyReport(status) {
  return RESULTABLE_RADIOLOGY_REQUEST_STATUSES.includes(status);
}

function laboratoryQueueTabs(counts, currentStatus) {
  const status = String(currentStatus || "open");
  const safe = counts || {};
  const openCount =
    (safe.pending_collection || 0) +
    (safe.collected || 0) +
    (safe.received || 0) +
    (safe.processing || 0);
  const rows = [
    ["open", "Open queue", openCount],
    ["pending_collection", "Pending collection", safe.pending_collection || 0],
    ["collected", "Collected", safe.collected || 0],
    ["received", "Received", safe.received || 0],
    ["processing", "Processing", safe.processing || 0],
    ["resulted", "Resulted", safe.resulted || 0],
    ["verified", "Verified", safe.verified || 0],
    ["all", "All", safe.total || 0],
  ];
  return rows.map(([key, label, count]) => ({
    key,
    label,
    count,
    active: status === key,
    href: `/app/diagnostics/laboratory/queue?status=${key}`,
  }));
}

function radiologyQueueTabs(counts, currentStatus) {
  const status = String(currentStatus || "open");
  const safe = counts || {};
  const openCount = (safe.pending || 0) + (safe.in_progress || 0) + (safe.completed || 0);
  const rows = [
    ["open", "Open queue", openCount],
    ["pending", "Pending intake", safe.pending || 0],
    ["in_progress", "In progress", safe.in_progress || 0],
    ["completed", "Completed", safe.completed || 0],
    ["reported", "Reported", safe.reported || 0],
    ["verified", "Verified", safe.verified || 0],
    ["all", "All", safe.total || 0],
  ];
  return rows.map(([key, label, count]) => ({
    key,
    label,
    count,
    active: status === key,
    href: `/app/diagnostics/radiology/queue?status=${key}`,
  }));
}

function laboratoryDashboardStats(counts) {
  const safe = counts || {};
  return {
    pending_collection: safe.pending_collection || 0,
    collected: safe.collected || 0,
    received: safe.received || 0,
    processing: safe.processing || 0,
    resulted: safe.resulted || 0,
    verified: safe.verified || 0,
    total: safe.total || 0,
  };
}

function radiologyDashboardStats(counts) {
  const safe = counts || {};
  return {
    pending: safe.pending || 0,
    in_progress: safe.in_progress || 0,
    completed: safe.completed || 0,
    reported: safe.reported || 0,
    verified: safe.verified || 0,
    total: safe.total || 0,
  };
}

const STORED_DIAGNOSTIC_URGENCIES = Object.freeze(["routine", "urgent", "stat"]);

const CLOSED_DIAGNOSTIC_STATUSES = Object.freeze(["verified", "released"]);

function isClosedDiagnosticStatus(status) {
  return CLOSED_DIAGNOSTIC_STATUSES.includes(status);
}

/**
 * Map a supplied priority onto the laboratory_requests urgency check.
 * An empty value stays the stored default. An unknown word is rejected
 * rather than translated into a clinical category.
 */
function storedDiagnosticUrgency(value) {
  const raw = String(value == null ? "" : value).trim().toLowerCase();
  if (!raw) return "routine";
  return STORED_DIAGNOSTIC_URGENCIES.includes(raw) ? raw : null;
}

function clipPrescriptionText(value, max) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return "";
  return text.slice(0, max);
}

/**
 * Join the clinician-entered dose fields. This does not choose a dose,
 * route, or duration.
 */
function prescriptionDosageInstructions(details) {
  const source = details && typeof details === "object" ? details : {};
  const drug = clipPrescriptionText(source.drug_name || source.drugName, 200);
  const dose = clipPrescriptionText(source.dose, 100);
  const unit = clipPrescriptionText(source.dose_unit || source.doseUnit, 40);
  const route = clipPrescriptionText(source.route, 80);
  const frequency = clipPrescriptionText(source.frequency, 100);
  const duration = clipPrescriptionText(source.duration, 100);
  if (!drug || !dose || !frequency || !duration) return null;
  const doseText = unit ? `${dose} ${unit}` : dose;
  const parts = [`Dose: ${doseText}`];
  if (route) parts.push(`Route: ${route}`);
  parts.push(`Frequency: ${frequency}`, `Duration: ${duration}`);
  return parts.join("; ").slice(0, 1000);
}

function duplicatePrescriptionItemIds(itemDispenses) {
  const seen = new Set();
  for (const item of Array.isArray(itemDispenses) ? itemDispenses : []) {
    const id = String((item && item.prescriptionItemId) || "");
    if (!id) continue;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

function prescriptionQueueQuery(diagnosticRequest) {
  if (!diagnosticRequest || diagnosticRequest.kind !== "prescription") return "";
  if (diagnosticRequest.created === true) return "";
  return "&pharmacy_queue=waiting_for_catalogue";
}

function positiveDispenseQuantity(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 999999) {
    return value;
  }
  const text = String(value == null ? "" : value).trim();
  if (!/^[1-9][0-9]{0,5}$/.test(text)) return null;
  return Number(text);
}

module.exports = {
  STORED_ORDER_TYPES,
  STORED_ORDER_STATUSES,
  RESULTABLE_LABORATORY_REQUEST_STATUSES,
  RESULTABLE_RADIOLOGY_REQUEST_STATUSES,
  isStoredOrderType,
  isStoredOrderStatus,
  canAttachLaboratoryResult,
  canAttachRadiologyReport,
  laboratoryQueueTabs,
  radiologyQueueTabs,
  laboratoryDashboardStats,
  radiologyDashboardStats,
  CLOSED_DIAGNOSTIC_STATUSES,
  isClosedDiagnosticStatus,
  STORED_DIAGNOSTIC_URGENCIES,
  storedDiagnosticUrgency,
  prescriptionDosageInstructions,
  positiveDispenseQuantity,
  duplicatePrescriptionItemIds,
  prescriptionQueueQuery,
};
