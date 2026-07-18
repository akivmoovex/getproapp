"use strict";

/**
 * Reconciliation report builder (in-memory; no DB required).
 */

/**
 * @param {string} entity
 * @param {Array<{ transformed: object, loadResult: object }>} results
 */
function buildReconciliationReport(entity, results) {
  let accepted = 0;
  let quarantined = 0;
  let warnings = 0;
  const samples = [];

  for (const item of results) {
    if (item.loadResult && item.loadResult.ok) accepted += 1;
    else quarantined += 1;
    warnings += (item.transformed && item.transformed.warnings
      ? item.transformed.warnings.length
      : 0);
    if (item.transformed && !item.transformed.ok && samples.length < 5) {
      samples.push(item.transformed.quarantine || { reason: "unknown" });
    }
  }

  return {
    entity,
    sourceRows: results.length,
    accepted,
    quarantined,
    warningCount: warnings,
    quarantineSamples: samples,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  buildReconciliationReport,
};
