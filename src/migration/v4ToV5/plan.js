"use strict";

/**
 * Build a migration plan JSON (no DB writes).
 */

const { ENTITY_GROUPS, listAllEntities } = require("./groups");

/**
 * @param {object} input
 * @param {object} input.config — from loadMigrationEnv
 * @param {object} [input.sourceCounts] — optional entity → count
 */
function buildMigrationPlan(input) {
  const config = input.config;
  const sourceCounts = input.sourceCounts || {};
  const groups = ENTITY_GROUPS.map((g, index) => ({
    order: index + 1,
    id: g.id,
    title: g.title,
    description: g.description,
    entities: g.entities.slice(),
    verifyOnly: Boolean(g.verifyOnly),
    skipReason: g.skipReason || null,
    estimatedSourceRows: g.entities.reduce((sum, e) => sum + (sourceCounts[e] || 0), 0),
  }));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode: "plan",
    source: config.sourceSummary,
    target: config.targetSummary,
    identityKeyExpected: config.identityKey,
    runConfig: {
      dataEnvironmentDefault: config.runConfig.dataEnvironmentDefault,
      canonicalDomainSuffix: config.runConfig.canonicalDomainSuffix,
      deploymentCode: config.runConfig.deploymentCode,
      batchSize: config.runConfig.batchSize,
    },
    safety: {
      dryRunDefault: true,
      applyRequiresConfirm: true,
      sourceReadOnly: true,
      refuseSameFingerprint: true,
      noSourceMutations: true,
      noPublicTenantsOrSession: true,
      noStartupAutoRun: true,
    },
    groups,
    entities: listAllEntities(),
    notes: [
      "Outputs: migration-plan.json, dry-run-summary.json, conflict-report.json, skipped-record-report.json, reconciliation-report.json",
      "Media blob copy is deferred (metadata group skipped).",
      "Use npm run migrate:v4-to-v5:dry-run before apply.",
    ],
  };
}

module.exports = {
  buildMigrationPlan,
};
