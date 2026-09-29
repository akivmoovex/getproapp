"use strict";

/**
 * BlessBoard branch lifecycle — maps commercial lifecycle labels onto the existing
 * operational `church_branches.status` values (active | suspended | archived).
 *
 * Do not replace status gating in churchStatusAccess.js; status remains the access switch.
 *
 * | Lifecycle (product)     | Stored lifecycle_phase     | Operational status |
 * |-------------------------|----------------------------|--------------------|
 * | Draft                   | draft                      | suspended          |
 * | Ready for Activation    | ready                      | suspended          |
 * | Active                  | active                     | active             |
 * | Temporarily Inactive    | temporarily_inactive       | suspended          |
 * | Archived                | archived                   | archived           |
 * | Closed                  | closed                     | archived           |
 */

const OPERATIONAL_STATUSES = ["active", "suspended", "archived"];

const LIFECYCLE_PHASES = [
  "draft",
  "ready",
  "active",
  "temporarily_inactive",
  "archived",
  "closed",
];

const LIFECYCLE_LABELS = {
  draft: "Draft",
  ready: "Ready for Activation",
  active: "Active",
  temporarily_inactive: "Temporarily Inactive",
  archived: "Archived",
  closed: "Closed",
};

/** lifecycle_phase → operational status */
const LIFECYCLE_TO_STATUS = {
  draft: "suspended",
  ready: "suspended",
  active: "active",
  temporarily_inactive: "suspended",
  archived: "archived",
  closed: "archived",
};

function normalizeLifecyclePhase(raw) {
  const phase = String(raw || "")
    .trim()
    .toLowerCase();
  return LIFECYCLE_PHASES.includes(phase) ? phase : null;
}

/**
 * Default lifecycle_phase when only operational status is known.
 * @param {string} status
 */
function defaultLifecycleForStatus(status) {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  if (s === "active") return "active";
  if (s === "archived") return "archived";
  if (s === "suspended") return "temporarily_inactive";
  return "draft";
}

/**
 * Resolve display lifecycle for a branch row.
 * @param {{ status?: string, lifecycle_phase?: string | null }} branch
 */
function resolveBranchLifecycle(branch) {
  const status = String((branch && branch.status) || "")
    .trim()
    .toLowerCase();
  const stored = normalizeLifecyclePhase(branch && branch.lifecycle_phase);
  let phase = stored;
  if (!phase) {
    phase = defaultLifecycleForStatus(status);
  } else if (LIFECYCLE_TO_STATUS[phase] !== status) {
    // Prefer operational status if phase contradicts (keeps access gates authoritative).
    phase = defaultLifecycleForStatus(status);
  }
  return {
    phase,
    label: LIFECYCLE_LABELS[phase] || phase,
    operationalStatus: status || LIFECYCLE_TO_STATUS[phase] || "suspended",
    isActive: status === "active",
  };
}

function operationalStatusForLifecycle(phase) {
  const p = normalizeLifecyclePhase(phase) || "draft";
  return LIFECYCLE_TO_STATUS[p];
}

module.exports = {
  OPERATIONAL_STATUSES,
  LIFECYCLE_PHASES,
  LIFECYCLE_LABELS,
  LIFECYCLE_TO_STATUS,
  normalizeLifecyclePhase,
  defaultLifecycleForStatus,
  resolveBranchLifecycle,
  operationalStatusForLifecycle,
};
