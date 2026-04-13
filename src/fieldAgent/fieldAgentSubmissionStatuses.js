"use strict";

/**
 * Canonical field-agent provider submission statuses (DB + app).
 * Transitions are enforced in `fieldAgentSubmissionsRepo` (SQL), not only here.
 */

const STATUSES = {
  PENDING: "pending",
  INFO_NEEDED: "info_needed",
  APPROVED: "approved",
  REJECTED: "rejected",
  APPEALED: "appealed",
};

const ALL_STATUSES = Object.freeze(Object.values(STATUSES));

/**
 * Submissions in these statuses occupy the duplicate-prevention pipeline for phone/WhatsApp
 * (partial unique indexes + duplicateExistsAgainstSubmissions).
 * Rejected submissions allow a new submission with the same normalized phone.
 */
const OPEN_PIPELINE_STATUSES = Object.freeze([
  STATUSES.PENDING,
  STATUSES.INFO_NEEDED,
  STATUSES.APPROVED,
  STATUSES.APPEALED,
]);

/** @type {Record<string, string[]>} */
const ALLOWED_TRANSITIONS = Object.freeze({
  [STATUSES.PENDING]: [STATUSES.APPROVED, STATUSES.REJECTED, STATUSES.INFO_NEEDED],
  [STATUSES.INFO_NEEDED]: [STATUSES.APPROVED, STATUSES.REJECTED],
  [STATUSES.REJECTED]: [STATUSES.APPEALED],
  [STATUSES.APPEALED]: [STATUSES.APPROVED, STATUSES.REJECTED, STATUSES.INFO_NEEDED],
  [STATUSES.APPROVED]: [],
});

/**
 * @param {unknown} s
 * @returns {string|null}
 */
function normalizeStatus(s) {
  const t = String(s || "")
    .trim()
    .toLowerCase();
  return ALL_STATUSES.includes(t) ? t : null;
}

/**
 * Documentation / test helper — repo enforces transitions in SQL.
 * @param {string} fromStatus
 * @param {string} toStatus
 */
function canTransition(fromStatus, toStatus) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (!from || !to) return false;
  const next = ALLOWED_TRANSITIONS[from];
  return Array.isArray(next) && next.includes(to);
}

module.exports = {
  STATUSES,
  ALL_STATUSES,
  OPEN_PIPELINE_STATUSES,
  ALLOWED_TRANSITIONS,
  normalizeStatus,
  canTransition,
};
