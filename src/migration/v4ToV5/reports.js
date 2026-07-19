"use strict";

/**
 * Report writers — counts and source IDs only (no PII fields in console summaries).
 */

const fs = require("fs");
const path = require("path");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

/**
 * Strip likely PII from quarantine samples for console-safe reports.
 * @param {object} quarantine
 */
function sanitizeQuarantine(quarantine) {
  if (!quarantine || typeof quarantine !== "object") return quarantine;
  const row = quarantine.row && typeof quarantine.row === "object" ? quarantine.row : null;
  return {
    reason: quarantine.reason,
    sourceId: row && row.id != null ? row.id : null,
    sourceTableHint: quarantine.sourceTable || null,
    organizationId: row && row.organization_id != null ? row.organization_id : null,
    branchId: row && row.branch_id != null ? row.branch_id : null,
  };
}

function buildConflictReport(conflicts) {
  return {
    generatedAt: new Date().toISOString(),
    conflictCount: conflicts.length,
    conflicts: conflicts.map((c) => ({
      entity: c.entity,
      sourceId: c.sourceId,
      code: c.code,
      detail: c.detail || null,
    })),
  };
}

function buildSkippedReport(skipped) {
  return {
    generatedAt: new Date().toISOString(),
    skippedCount: skipped.length,
    skipped: skipped.map((s) => ({
      entity: s.entity,
      sourceId: s.sourceId,
      reason: s.reason,
    })),
  };
}

function buildDryRunSummary(summary) {
  return {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    groups: summary.groups || [],
    totals: summary.totals || {},
    outputFiles: summary.outputFiles || [],
  };
}

function buildApplySummary(summary) {
  return {
    generatedAt: new Date().toISOString(),
    mode: "apply",
    groups: summary.groups || [],
    totals: summary.totals || {},
    conflictCount: summary.conflictCount || 0,
    skippedCount: summary.skippedCount || 0,
    identityVerified: Boolean(summary.identityVerified),
  };
}

function buildReconciliationFile(report) {
  return {
    generatedAt: new Date().toISOString(),
    ...report,
  };
}

/**
 * @param {string} outputDir
 * @param {object} bundle
 */
function writeReportBundle(outputDir, bundle) {
  ensureDir(outputDir);
  const files = {};
  if (bundle.plan) files.plan = writeJson(path.join(outputDir, "migration-plan.json"), bundle.plan);
  if (bundle.dryRun) {
    files.dryRun = writeJson(path.join(outputDir, "dry-run-summary.json"), bundle.dryRun);
  }
  if (bundle.applySummary) {
    files.applySummary = writeJson(
      path.join(outputDir, "apply-summary.json"),
      buildApplySummary(bundle.applySummary)
    );
  }
  if (bundle.conflicts) {
    files.conflicts = writeJson(
      path.join(outputDir, "conflict-report.json"),
      buildConflictReport(bundle.conflicts)
    );
  }
  if (bundle.skipped) {
    files.skipped = writeJson(
      path.join(outputDir, "skipped-record-report.json"),
      buildSkippedReport(bundle.skipped)
    );
  }
  if (bundle.reconciliation) {
    files.reconciliation = writeJson(
      path.join(outputDir, "reconciliation-report.json"),
      buildReconciliationFile(bundle.reconciliation)
    );
  }
  return files;
}

/**
 * Console-safe one-liner counts (no emails/names).
 */
function consoleSafeSummary(totals) {
  return {
    accepted: totals.accepted || 0,
    skipped: totals.skipped || 0,
    conflicts: totals.conflicts || 0,
    quarantined: totals.quarantined || 0,
    wouldWrite: totals.wouldWrite || 0,
    written: totals.written || 0,
  };
}

module.exports = {
  writeJson,
  writeReportBundle,
  sanitizeQuarantine,
  buildConflictReport,
  buildSkippedReport,
  buildDryRunSummary,
  buildApplySummary,
  buildReconciliationFile,
  consoleSafeSummary,
};
