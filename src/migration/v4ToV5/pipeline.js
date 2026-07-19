"use strict";

/**
 * Orchestrates plan / dry-run / apply / verify for V4→V5 migration.
 */

const path = require("path");
const { ENTITY_GROUPS } = require("./groups");
const { createIdMap } = require("./idMap");
const { createCheckpointStore } = require("./checkpoint");
const { transformRow } = require("./transform");
const { buildMigrationPlan } = require("./plan");
const {
  writeReportBundle,
  consoleSafeSummary,
  sanitizeQuarantine,
} = require("./reports");
const { createTargetLoader } = require("./loadPg");
const { verifyTargetIdentity } = require("./safety");

/**
 * @param {object} options
 */
async function runMigrationPipeline(options) {
  const {
    mode, // plan | dry-run | apply | verify
    config,
    extractor,
    targetPool = null,
    outputDir,
    checkpointPath,
    idMapPath,
    resume = false,
    forceFailAfter = null, // test hook
  } = options;

  const dryRun = mode !== "apply";
  const batchId = `${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const idMap = createIdMap(idMapPath);
  const checkpoints = createCheckpointStore(checkpointPath);
  const loader = createTargetLoader({
    dryRun,
    targetPool,
    batchSize: config.runConfig.batchSize,
  });

  const conflicts = [];
  const skipped = [];
  const groupReports = [];
  const totals = {
    accepted: 0,
    skipped: 0,
    conflicts: 0,
    quarantined: 0,
    wouldWrite: 0,
    written: 0,
  };

  // 1) Always verify target identity before any group work (except pure plan without pool).
  let identity = { ok: true, skipped: true };
  if (targetPool) {
    identity = await verifyTargetIdentity(targetPool, config.identityKey);
    if (!identity.ok) {
      return {
        ok: false,
        code: identity.code,
        message: identity.message,
        totals,
      };
    }
  } else if (mode === "apply" || mode === "verify") {
    return {
      ok: false,
      code: "target_pool_required",
      message: "Target pool required for apply/verify.",
      totals,
    };
  }

    if (mode === "plan") {
    const sourceCounts = {};
    if (extractor && typeof extractor.count === "function") {
      for (const g of ENTITY_GROUPS) {
        for (const entity of g.entities) {
          const c = await extractor.count(entity);
          sourceCounts[entity] = c.count || 0;
        }
      }
    }
    const plan = buildMigrationPlan({ config, sourceCounts });
    const unsupportedSkipped = (plan.unsupportedSourceEntities || []).map((u) => ({
      entity: u.key,
      sourceId: null,
      reason: u.reason,
    }));
    const files = writeReportBundle(outputDir, {
      plan,
      conflicts: [],
      skipped: unsupportedSkipped,
    });
    return {
      ok: true,
      mode: "plan",
      plan,
      files,
      identity,
      totals: consoleSafeSummary(totals),
    };
  }

  if (mode === "verify") {
    const reconciliation = await buildTargetReconciliation(targetPool, idMap);
    const files = writeReportBundle(outputDir, {
      reconciliation,
      conflicts: [],
      skipped: [],
    });
    return {
      ok: true,
      mode: "verify",
      identity,
      reconciliation,
      files,
      totals: consoleSafeSummary(totals),
    };
  }

  // dry-run or apply
  for (const group of ENTITY_GROUPS) {
    if (group.verifyOnly) {
      groupReports.push({
        groupId: group.id,
        status: "verified_identity",
        entities: [],
      });
      checkpoints.save(group.id, { batchId, status: "done", dryRun, mode });
      continue;
    }

    if (group.skipReason) {
      groupReports.push({
        groupId: group.id,
        status: "skipped_group",
        reason: group.skipReason,
        entities: [],
      });
      skipped.push({ entity: group.id, sourceId: null, reason: group.skipReason });
      totals.skipped += 1;
      checkpoints.save(group.id, { batchId, status: "skipped", reason: group.skipReason, dryRun, mode });
      continue;
    }

    if (resume) {
      const cp = checkpoints.get(group.id);
      if (cp && cp.status === "done" && cp.mode === mode) {
        groupReports.push({ groupId: group.id, status: "resumed_skip", entities: [] });
        continue;
      }
    }

    const entityResults = [];
    for (const entity of group.entities) {
      let cursor = null;
      let processed = 0;
      do {
        const extracted = await extractor.extract(entity, cursor);
        if (extracted.skipped) {
          skipped.push({
            entity,
            sourceId: null,
            reason: extracted.reason || "extract_skipped",
          });
          totals.skipped += 1;
          break;
        }

        const items = [];
        for (const row of extracted.rows) {
          const transformed = transformRow(entity, row, {
            batchId,
            runConfig: config.runConfig,
            idMap,
          });
          items.push({ sourceId: row.id, transformed });
        }

        const batch = await loader.loadBatch(entity, items, {
          forceFailAfter: forceFailAfter != null ? forceFailAfter : undefined,
        });

        if (!batch.ok && batch.rolledBack) {
          checkpoints.save(group.id, {
            batchId,
            status: "failed",
            entity,
            cursor,
            error: batch.error,
            dryRun,
            mode,
          });
          idMap.save();
          const files = writeReportBundle(outputDir, {
            dryRun: {
              mode,
              groups: groupReports,
              totals: consoleSafeSummary(totals),
              failed: { groupId: group.id, entity, error: batch.error, rolledBack: true },
            },
            conflicts,
            skipped,
            reconciliation: { groups: groupReports, totals: consoleSafeSummary(totals) },
          });
          return {
            ok: false,
            code: "batch_rolled_back",
            message: batch.error,
            groupId: group.id,
            entity,
            files,
            totals: consoleSafeSummary(totals),
            rolledBack: true,
          };
        }

        for (const r of batch.results) {
          if (r.status === "dry_run_accepted") {
            totals.accepted += 1;
            totals.wouldWrite += 1;
          } else if (r.status === "written") {
            totals.accepted += 1;
            totals.written += 1;
          } else if (r.status === "skipped" || r.reason === "already_present") {
            totals.skipped += 1;
            skipped.push({ entity, sourceId: r.sourceId, reason: r.reason || "skipped" });
          } else if (r.status === "conflict") {
            totals.conflicts += 1;
            conflicts.push({
              entity,
              sourceId: r.sourceId,
              code: r.code,
              detail: r.detail || null,
            });
          } else if (r.status === "quarantined") {
            totals.quarantined += 1;
            skipped.push({
              entity,
              sourceId: r.sourceId,
              reason: (r.quarantine && r.quarantine.reason) || "quarantined",
            });
          }
        }

        processed += extracted.rows.length;
        cursor = extracted.nextCursor;
        checkpoints.save(`${group.id}:${entity}`, {
          batchId,
          cursor,
          processed,
          dryRun,
          mode,
          status: cursor ? "in_progress" : "entity_done",
        });
      } while (cursor);

      entityResults.push({ entity, processed });
    }

    checkpoints.save(group.id, { batchId, status: "done", dryRun, mode });
    groupReports.push({ groupId: group.id, status: "ok", entities: entityResults });
  }

  idMap.save();

  const reconciliation = {
    mode,
    dryRun,
    groups: groupReports,
    totals: consoleSafeSummary(totals),
    conflictCount: conflicts.length,
    skippedCount: skipped.length,
    identityVerified: Boolean(identity && identity.ok),
  };

  const files = writeReportBundle(outputDir, {
    dryRun: mode === "dry-run" ? { ...reconciliation, outputDir } : null,
    applySummary: mode === "apply" ? reconciliation : null,
    conflicts,
    skipped,
    reconciliation,
    plan: mode === "dry-run" || mode === "apply" ? buildMigrationPlan({ config }) : null,
  });

  return {
    ok: true,
    mode,
    dryRun,
    identity,
    groups: groupReports,
    conflicts: conflicts.map((c) => ({ ...c })),
    skipped: skipped.map((s) => ({ ...s, quarantine: undefined })),
    files,
    totals: consoleSafeSummary(totals),
    reconciliation,
  };
}

async function buildTargetReconciliation(targetPool, idMap) {
  const counts = {};
  const queries = {
    organizations: `SELECT COUNT(*)::int AS n FROM platform.organizations`,
    churches: `SELECT COUNT(*)::int AS n FROM blessboard.churches`,
    branches: `SELECT COUNT(*)::int AS n FROM blessboard.branches`,
    users: `SELECT COUNT(*)::int AS n FROM blessboard.users`,
    members: `SELECT COUNT(*)::int AS n FROM blessboard.members`,
    domains: `SELECT COUNT(*)::int AS n FROM platform.domains`,
  };
  for (const [key, sql] of Object.entries(queries)) {
    try {
      const r = await targetPool.query(sql);
      counts[key] = r.rows[0].n;
    } catch {
      counts[key] = null;
    }
  }
  return {
    targetCounts: counts,
    idMapEntries: Object.keys(idMap.entries()).length,
    generatedAt: new Date().toISOString(),
  };
}

function defaultOutputDir(root) {
  return path.join(root || process.cwd(), "tmp", "migration-v4-to-v5");
}

module.exports = {
  runMigrationPipeline,
  buildTargetReconciliation,
  defaultOutputDir,
  sanitizeQuarantine,
};
