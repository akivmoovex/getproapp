"use strict";

/**
 * V13 QA result taxonomy for BB regression reporting.
 * Never convert FAIL into PASS by skipping assertions.
 */

const RESULTS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  BLOCKED: "BLOCKED",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  NOT_RUN: "NOT_RUN",
});

const TEST_LEVELS = Object.freeze({
  UNIT: "UNIT",
  INTEGRATION: "INTEGRATION",
  BROWSER: "BROWSER",
  STATIC: "STATIC",
  GUARD: "GUARD",
});

/**
 * @param {string} value
 * @returns {boolean}
 */
function isKnownResult(value) {
  return Object.prototype.hasOwnProperty.call(RESULTS, String(value || ""));
}

/**
 * Build one machine-readable regression row.
 * @param {object} partial
 */
function buildResultRow(partial) {
  const row = {
    BUG_ID: String(partial.BUG_ID || partial.bugId || ""),
    TEST_NAME: String(partial.TEST_NAME || partial.testName || ""),
    TEST_LEVEL: String(partial.TEST_LEVEL || partial.testLevel || ""),
    RESULT: String(partial.RESULT || partial.result || RESULTS.NOT_RUN),
    COMMIT_SHA: String(partial.COMMIT_SHA || partial.commitSha || ""),
    ENVIRONMENT: String(partial.ENVIRONMENT || partial.environment || "local"),
    DATABASE_IDENTITY: String(partial.DATABASE_IDENTITY || partial.databaseIdentity || "none"),
    FAILURE_REASON: String(partial.FAILURE_REASON || partial.failureReason || ""),
    ARTIFACT_REFERENCE: String(partial.ARTIFACT_REFERENCE || partial.artifactReference || ""),
  };
  if (!isKnownResult(row.RESULT)) {
    throw new Error(`invalid V13 QA RESULT: ${row.RESULT}`);
  }
  return row;
}

/**
 * Release is not ready while required regressions are open/failing/blocked/unimplemented.
 * @param {Array<object>} rows
 * @param {Array<object>} blockers
 */
function evaluateReleaseReadiness(rows, blockers) {
  const requiredOpen = (Array.isArray(blockers) ? blockers : []).filter(
    (b) => b && b.releaseBlocker === true && b.status !== "CLOSED"
  );
  const failingRequired = (Array.isArray(rows) ? rows : []).filter(
    (r) => r && r.required === true && r.RESULT !== RESULTS.PASS
  );
  const ready = requiredOpen.length === 0 && failingRequired.length === 0;
  return {
    ready,
    conclusion: ready ? "RELEASE_READY" : "RELEASE_BLOCKED",
    openBlockers: requiredOpen.map((b) => b.id || b.BUG_ID),
    failingRequired: failingRequired.map((r) => r.BUG_ID || r.TEST_NAME),
  };
}

module.exports = {
  RESULTS,
  TEST_LEVELS,
  isKnownResult,
  buildResultRow,
  evaluateReleaseReadiness,
};
