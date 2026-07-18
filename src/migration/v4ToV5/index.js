"use strict";

/**
 * V4 → V5 migration tooling.
 * Default mode: dry-run. Apply requires explicit --confirm via CLI.
 * Authority: docs/database/V4_TO_V5_DATA_MAPPING.md
 */

const { createIdMap } = require("./idMap");
const { createCheckpointStore } = require("./checkpoint");
const { createDryRunLoader } = require("./load");
const { createTargetLoader } = require("./loadPg");
const { createFixtureExtractor } = require("./extract");
const { createPgExtractor } = require("./extractPg");
const { transformRow } = require("./transform");
const { buildReconciliationReport } = require("./reconcile");
const { loadMigrationEnv, connectionFingerprint } = require("./config");
const { ENTITY_GROUPS, listAllEntities } = require("./groups");
const { buildMigrationPlan } = require("./plan");
const { runMigrationPipeline, defaultOutputDir } = require("./pipeline");
const {
  parseCliArgs,
  assertCommandSafety,
  assertDistinctConnections,
  verifyTargetIdentity,
  createReadOnlySourcePool,
  createTargetPool,
} = require("./safety");

const ENTITIES = Object.freeze(listAllEntities());

/**
 * @param {object} [options]
 * @param {boolean} [options.dryRun=true]
 */
function createMigrationRunner(options = {}) {
  const dryRun = options.dryRun !== false;
  const batchId = options.batchId || `dryrun-${new Date().toISOString()}`;
  const runConfig = {
    dataEnvironmentDefault: "pilot",
    canonicalDomainSuffix: "blessboard.org",
    deploymentCode: "blessboard-org-v5",
    synthesizeHqIfMissing: false,
    ...(options.runConfig || {}),
  };

  const idMap = createIdMap(options.idMapPath);
  const checkpoints = createCheckpointStore(options.checkpointPath);
  const extractor = options.extractor || createFixtureExtractor(options.fixturesDir);
  const loader = createDryRunLoader({ dryRun });

  return {
    dryRun,
    batchId,
    runConfig,
    idMap,
    checkpoints,
    entities: ENTITIES,

    async runEntity(entity, cursor) {
      if (!ENTITIES.includes(entity)) {
        throw new Error(`unknown_entity:${entity}`);
      }
      const extracted = await extractor.extract(entity, cursor);
      const results = [];
      for (const row of extracted.rows) {
        const ctx = { batchId, runConfig, idMap };
        const transformed = transformRow(entity, row, ctx);
        const loadResult = await loader.load(entity, transformed);
        results.push({ row, transformed, loadResult });
      }
      checkpoints.save(entity, {
        batchId,
        cursor: extracted.nextCursor,
        processed: results.length,
        dryRun,
      });
      return {
        entity,
        nextCursor: extracted.nextCursor,
        results,
        report: buildReconciliationReport(entity, results),
      };
    },
  };
}

module.exports = {
  ENTITIES,
  ENTITY_GROUPS,
  createMigrationRunner,
  createIdMap,
  createCheckpointStore,
  createDryRunLoader,
  createTargetLoader,
  createFixtureExtractor,
  createPgExtractor,
  transformRow,
  buildReconciliationReport,
  loadMigrationEnv,
  connectionFingerprint,
  buildMigrationPlan,
  runMigrationPipeline,
  defaultOutputDir,
  parseCliArgs,
  assertCommandSafety,
  assertDistinctConnections,
  verifyTargetIdentity,
  createReadOnlySourcePool,
  createTargetPool,
};
