"use strict";

/**
 * Build a migration plan JSON (no DB writes).
 */

const { ENTITY_GROUPS, listAllEntities, UNSUPPORTED_SOURCE_ENTITIES } = require("./groups");

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
      includeSampleContent: Boolean(config.runConfig.includeSampleContent),
    },
    safety: {
      dryRunDefault: true,
      applyRequiresConfirm: true,
      sourceReadOnly: true,
      refuseSameFingerprint: true,
      refuseGetproDatabaseUrl: true,
      noSourceMutations: true,
      noPublicTenantsOrSession: true,
      noStartupAutoRun: true,
      orphanParentsQuarantined: true,
      sampleOrgsExcludedUnlessSelected: true,
    },
    groups,
    entities: listAllEntities(),
    unsupportedSourceEntities: UNSUPPORTED_SOURCE_ENTITIES.map((u) => ({ ...u })),
    notes: [
      "Outputs: migration-plan.json, dry-run-summary.json, apply-summary.json, conflict-report.json, skipped-record-report.json, reconciliation-report.json",
      "Media blob copy is deferred (metadata group skipped).",
      "Sample/demo org keys are quarantined unless V4_TO_V5_INCLUDE_SAMPLE_CONTENT=1.",
      "Orphan members/admins (unmapped org/branch) are quarantined — never assigned to a default branch.",
      "Use npm run migrate:v4-to-v5:dry-run before apply.",
    ],
  };
}

module.exports = {
  buildMigrationPlan,
};
