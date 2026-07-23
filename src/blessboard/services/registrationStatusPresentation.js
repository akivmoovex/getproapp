"use strict";

/**
 * Presentation-only registration status mappings for Platform Admin chips.
 * Does not persist values, run checks, or invent verification/duplicate outcomes.
 */

const TONE_TO_CHIP = Object.freeze({
  success: "bb-pa-chip--ok",
  danger: "bb-pa-chip--danger",
  warn: "bb-pa-chip--warn",
  muted: "bb-pa-chip--muted",
});

const APPLICATION_STATUS = Object.freeze({
  submitted: { label: "Submitted", tone: "warn" },
  duplicate_review: { label: "Duplicate review", tone: "warn" },
  rejected: { label: "Rejected", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
  closed: { label: "Closed", tone: "muted" },
});

const PROVISIONING_STATUS = Object.freeze({
  not_started: { label: "Not started", tone: "muted" },
  provisioning: { label: "Provisioning", tone: "warn" },
  provisioned: { label: "Provisioned", tone: "success" },
  provisioning_failed: { label: "Provisioning failed", tone: "danger" },
});

/** Display-only verification vocabulary (Phase2 Stitch). Not stored. */
const VERIFICATION_STATUS = Object.freeze({
  not_checked: { label: "Not checked", tone: "muted" },
  checking: { label: "Checking", tone: "warn" },
  passed: { label: "Passed", tone: "success" },
  warning: { label: "Warning", tone: "warn" },
  failed: { label: "Failed", tone: "danger" },
  manually_reviewed: { label: "Manually reviewed", tone: "success" },
  overridden: { label: "Overridden", tone: "warn" },
});

/** Display-only duplicate-risk vocabulary (Phase2 Stitch). Not stored. */
const DUPLICATE_RISK = Object.freeze({
  none: { label: "No likely duplicate", tone: "success" },
  possible: { label: "Possible match", tone: "warn" },
  strong: { label: "Strong match", tone: "warn" },
  confirmed: { label: "Confirmed duplicate", tone: "danger" },
  incomplete: { label: "Review incomplete", tone: "muted" },
});

const EMPTY_LABEL = "—";
const UNKNOWN_LABEL = "Unknown";

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeKey(raw) {
  if (raw == null) return "";
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/**
 * Strip characters unsafe in HTML attribute values (label still escaped by EJS <%= %>).
 * @param {unknown} raw
 * @returns {string}
 */
function sanitizeAttrValue(raw) {
  return String(raw == null ? "" : raw)
    .replace(/[\u0000-\u001f\u007f<>"'`]/g, "")
    .trim()
    .slice(0, 120);
}

/**
 * @param {unknown} tone
 * @returns {string}
 */
function chipClassForTone(tone) {
  const key = String(tone || "").trim().toLowerCase();
  return TONE_TO_CHIP[key] || TONE_TO_CHIP.muted;
}

/**
 * @param {string} kind
 * @param {unknown} raw
 * @param {Record<string, { label: string, tone: string }>} catalog
 */
function presentFromCatalog(kind, raw, catalog) {
  const empty = raw == null || String(raw).trim() === "";
  if (empty) {
    return {
      kind,
      value: "",
      label: EMPTY_LABEL,
      tone: "muted",
      chipClass: chipClassForTone("muted"),
      known: false,
      empty: true,
    };
  }

  const value = normalizeKey(raw);
  const entry = catalog[value];
  if (entry) {
    return {
      kind,
      value,
      label: entry.label,
      tone: entry.tone,
      chipClass: chipClassForTone(entry.tone),
      known: true,
      empty: false,
    };
  }

  return {
    kind,
    value: "",
    label: UNKNOWN_LABEL,
    tone: "muted",
    chipClass: chipClassForTone("muted"),
    known: false,
    empty: false,
  };
}

function presentApplicationStatus(raw) {
  return presentFromCatalog("application", raw, APPLICATION_STATUS);
}

function presentProvisioningStatus(raw) {
  return presentFromCatalog("provisioning", raw, PROVISIONING_STATUS);
}

function presentVerificationStatus(raw) {
  return presentFromCatalog("verification", raw, VERIFICATION_STATUS);
}

function presentDuplicateRisk(raw) {
  return presentFromCatalog("duplicate_risk", raw, DUPLICATE_RISK);
}

/**
 * Resolve presentation by kind string (for shared EJS partial).
 * @param {unknown} kind
 * @param {unknown} raw
 */
function presentRegistrationStatus(kind, raw) {
  const key = normalizeKey(kind);
  if (key === "application" || key === "application_status") {
    return presentApplicationStatus(raw);
  }
  if (key === "provisioning" || key === "provisioning_status") {
    return presentProvisioningStatus(raw);
  }
  if (key === "verification" || key === "verification_status") {
    return presentVerificationStatus(raw);
  }
  if (key === "duplicate_risk" || key === "duplicate" || key === "risk") {
    return presentDuplicateRisk(raw);
  }
  return presentFromCatalog(key || "unknown", raw, {});
}

module.exports = {
  TONE_TO_CHIP,
  APPLICATION_STATUS,
  PROVISIONING_STATUS,
  VERIFICATION_STATUS,
  DUPLICATE_RISK,
  EMPTY_LABEL,
  UNKNOWN_LABEL,
  normalizeKey,
  sanitizeAttrValue,
  chipClassForTone,
  presentApplicationStatus,
  presentProvisioningStatus,
  presentVerificationStatus,
  presentDuplicateRisk,
  presentRegistrationStatus,
};
