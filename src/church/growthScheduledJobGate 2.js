"use strict";

/**
 * Central policy helper for Growth scheduled-job safety.
 * Determines which organization statuses allow jobs and which broadcast/report
 * statuses block Foundation downgrade.
 *
 * No circular requires to heavy services — uses only constants and simple validation.
 */

/**
 * Organization statuses that BLOCK Growth scheduled jobs from running.
 * Only 'active' allows jobs to execute.
 */
const ORGANIZATION_STATUSES_BLOCKING_GROWTH_JOBS = Object.freeze([
  "suspended",
  "archived",
  "dormant",
  "inactive",
]);

/**
 * Returns true only if the organization status allows Growth scheduled jobs.
 * @param {string|null|undefined} status
 * @returns {boolean}
 */
function isOrganizationStatusEligibleForGrowthJobs(status) {
  return String(status || "").toLowerCase() === "active";
}

/**
 * Broadcast statuses that BLOCK Foundation downgrade.
 *
 * BLOCK: scheduled, processing, approval, audience_estimate, preview, partially_failed, failed
 *   - These represent active or retryable work that would be lost on downgrade.
 *
 * DO NOT BLOCK: published, cancelled, archived, draft, paused_no_entitlement, paused_organization_inactive
 *   - published: Already delivered, no pending work.
 *   - cancelled: Admin explicitly cancelled.
 *   - archived: No longer active.
 *   - draft: Not yet committed to send.
 *   - paused_*: Already paused due to entitlement/org issues.
 */
const GROWTH_BROADCAST_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE = Object.freeze([
  "scheduled",
  "processing",
  "approval",
  "audience_estimate",
  "preview",
  "partially_failed",
  "failed",
]);

/**
 * Report schedule statuses that BLOCK Foundation downgrade.
 *
 * BLOCK: enabled
 *   - Active schedules that would continue running under Foundation.
 *
 * DO NOT BLOCK: paused, cancelled
 *   - Already stopped, no pending automated work.
 */
const GROWTH_REPORT_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE = Object.freeze([
  "enabled",
]);

/**
 * Throws if the organization does not allow Growth scheduled jobs.
 * @param {object|null} org - Organization row with at least { id, status }
 * @throws {Error} with code ORG_INACTIVE or ORG_NOT_FOUND
 */
function assertOrganizationAllowsGrowthScheduledJobs(org) {
  if (!org) {
    const err = new Error("Organization not found.");
    err.code = "ORG_NOT_FOUND";
    throw err;
  }
  if (!isOrganizationStatusEligibleForGrowthJobs(org.status)) {
    const err = new Error(
      "Organization is not active. Scheduled jobs cannot run for suspended, archived, dormant, or inactive organizations."
    );
    err.code = "ORG_INACTIVE";
    err.organizationStatus = org.status;
    throw err;
  }
}

/**
 * Sanitize a pause reason for storage.
 * Strips potential secrets/PII patterns and enforces max length.
 * @param {string|null|undefined} text
 * @returns {string|null}
 */
function sanitizeJobPauseReason(text) {
  if (text == null || text === "") return null;
  let sanitized = String(text);
  // Strip potential secrets: API keys, tokens, passwords
  sanitized = sanitized.replace(/[A-Za-z0-9_-]{32,}/g, "[redacted-token]");
  sanitized = sanitized.replace(/password[=:]\s*\S+/gi, "password=[redacted]");
  sanitized = sanitized.replace(/secret[=:]\s*\S+/gi, "secret=[redacted]");
  sanitized = sanitized.replace(/token[=:]\s*\S+/gi, "token=[redacted]");
  sanitized = sanitized.replace(/key[=:]\s*\S+/gi, "key=[redacted]");
  // Strip emails
  sanitized = sanitized.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
  // Strip phone-like patterns
  sanitized = sanitized.replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]");
  // Enforce max length
  return sanitized.slice(0, 500) || null;
}

/**
 * Build a structured blocker object for downgrade eligibility.
 * @param {string} code
 * @param {string} message
 * @param {number} used
 * @returns {{code:string, message:string, used:number, limit:number}}
 */
function buildBlocker(code, message, used) {
  return { code, message, used, limit: 0 };
}

module.exports = {
  ORGANIZATION_STATUSES_BLOCKING_GROWTH_JOBS,
  isOrganizationStatusEligibleForGrowthJobs,
  GROWTH_BROADCAST_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE,
  GROWTH_REPORT_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE,
  assertOrganizationAllowsGrowthScheduledJobs,
  sanitizeJobPauseReason,
  buildBlocker,
};
