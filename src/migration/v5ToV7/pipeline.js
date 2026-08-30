"use strict";

const path = require("path");
const { inventoryBlessBoard, inventoryActiveClinic, detectLocalMediaRoot } = require("./inventory");
const { migrateBlessBoardCore, migrateActiveClinicCore } = require("./loaders");
const { createAuditStore } = require("./audit");
const { createIdMap } = require("./idMap");
const { loadWatermark, saveWatermark, beginWatermarkCycle, finalizeWatermarkCycle } = require("./delta");
const { roleMappingTable } = require("./roleMapping");
const {
  summarizeCollisions,
  buildIdentityIndexes,
  classifyIdentityCollision,
} = require("./identityMerge");
const { resolveStateDir, ensureManifest } = require("./state");
const { verifyReferentialIntegrity } = require("./integrity");
const { runPostImportBackfills } = require("./postImport");
const {
  collectBlessBoardIdentityCandidates,
  collectActiveClinicIdentityCandidates,
} = require("./identities");

function defaultOutputDir(root) {
  return path.join(root, "tmp", "v5-to-v7-migration");
}

async function collectIdentityPreview(bbPool, acPool, runConfig) {
  const bbOrgs = await bbPool.query(`SELECT church_key, organization_id FROM blessboard.churches`);
  const includedOrgIds = bbOrgs.rows
    .filter((r) => !require("./inventory").shouldExcludeOrgKey(r.church_key, runConfig))
    .map((r) => r.organization_id);

  const rows = [];
  const bbCandidates = await collectBlessBoardIdentityCandidates(bbPool, [...new Set(includedOrgIds)]);
  rows.push(
    ...bbCandidates.map((c) => ({
      email: c.email,
      phone: c.phone,
      source: c.source,
      legacyId: c.legacyId,
      identityId: c.legacyId,
    }))
  );

  try {
    const acOrgs = await acPool.query(
      `SELECT h.id, o.organization_key
         FROM activeclinic.healthcare_organizations h
         JOIN platform.organizations o ON o.id = h.organization_id`
    );
    const hcoIds = acOrgs.rows
      .filter((r) => !require("./inventory").shouldExcludeOrgKey(r.organization_key, runConfig))
      .map((r) => r.id);
    const acCandidates = await collectActiveClinicIdentityCandidates(acPool, hcoIds);
    rows.push(
      ...acCandidates.map((c) => ({
        email: c.email,
        phone: c.phone,
        source: c.source,
        legacyId: c.legacyId,
        identityId: c.sourceIdentityId || c.legacyId,
      }))
    );
  } catch {
    // AC schema may be absent on BB-only source
  }

  const index = buildIdentityIndexes(rows);
  const collisions = rows.map((row) => classifyIdentityCollision(index, row));
  return summarizeCollisions(collisions);
}

async function runMigrationPipeline({
  command,
  config,
  bbSourcePool,
  acSourcePool,
  targetPool,
  outputDir,
  delta = false,
  autoBackfill = false,
}) {
  const resolvedOutputDir = resolveStateDir(outputDir, process.env.INIT_CWD || process.cwd());
  const audit = createAuditStore(resolvedOutputDir);
  ensureManifest(resolvedOutputDir, audit, config);
  const idMapPath = path.join(resolvedOutputDir, "state", "id-map.json");
  const idMap = createIdMap(idMapPath);
  const watermarkPath = path.join(resolvedOutputDir, "state", "watermark.json");
  let watermark = loadWatermark(watermarkPath);
  if (command === "apply") {
    watermark = beginWatermarkCycle(watermark);
  }

  const bbInventory = await inventoryBlessBoard(bbSourcePool, config.runConfig);
  const acInventory = await inventoryActiveClinic(acSourcePool, config.runConfig);
  const localMedia = await detectLocalMediaRoot();
  const identityCollisions = await collectIdentityPreview(bbSourcePool, acSourcePool, config.runConfig);

  const plan = {
    ok: true,
    command,
    runId: audit.runId,
    stateDir: resolvedOutputDir,
    source: {
      identity: config.sourceIdentity,
      environment: config.sourceEnvironment,
      bb: config.bbSourceSummary,
      ac: config.acSourceSummary,
    },
    target: {
      identity: config.targetIdentity,
      environment: config.targetEnvironment,
      summary: config.targetSummary,
    },
    blessboard: bbInventory,
    activeclinic: acInventory,
    localMedia,
    identityCollisions,
    roleMapping: roleMappingTable(),
    delta: delta ? watermark : null,
    postImportBackfillRequired: true,
    warnings: [],
  };

  if (command === "plan") {
    audit.save();
    return { plan, apply: null, audit: audit.summary() };
  }

  const dryRun = command === "dry-run";
  const apply = command === "apply";
  const loaderOpts = { dryRun, delta, watermark, idMap };

  let bbResult = null;
  let acResult = null;
  let postImport = null;
  if (command !== "verify") {
    bbResult = await migrateBlessBoardCore(bbSourcePool, targetPool, config.runConfig, loaderOpts);
    for (const [entity, stats] of Object.entries(bbResult.results || {})) {
      audit.record(`blessboard.${entity}`, stats);
    }
    acResult = await migrateActiveClinicCore(acSourcePool, targetPool, config.runConfig, loaderOpts).catch(
      (err) => {
        if (/relation .* does not exist|schema .* does not exist/i.test(String(err.message))) {
          return { results: {}, warnings: ["activeclinic_schema_absent"] };
        }
        throw err;
      }
    );
    for (const [entity, stats] of Object.entries(acResult.results || {})) {
      audit.record(`activeclinic.${entity}`, stats);
    }

    postImport = await runPostImportBackfills(targetPool, {
      dryRun: dryRun || !autoBackfill,
      autoBackfill: apply && autoBackfill,
    });

    if (apply) {
      idMap.save();
      watermark = finalizeWatermarkCycle(watermark);
      saveWatermark(watermarkPath, watermark);
    }
  }

  const verify = await verifyImport(bbSourcePool, acSourcePool, targetPool, config.runConfig);
  const integrity = await verifyReferentialIntegrity(targetPool);
  verify.integrity = integrity;
  verify.ok = verify.ok && integrity.ok;

  audit.save("audit.json");

  return {
    plan,
    apply: { blessboard: bbResult, activeclinic: acResult, dryRun, delta, postImport },
    verify,
    audit: audit.summary(),
    idMapEntries: Object.keys(idMap.entries()).length,
    stateDir: resolvedOutputDir,
  };
}

async function verifyImport(bbSourcePool, acSourcePool, targetPool, runConfig) {
  const srcBb = await inventoryBlessBoard(bbSourcePool, runConfig);
  const tgtBb = await inventoryBlessBoard(targetPool, runConfig);
  const srcAc = await inventoryActiveClinic(acSourcePool, runConfig);
  const tgtAc = await inventoryActiveClinic(targetPool, runConfig);

  const matrix = [];
  function row(entity, source, imported, skipped = 0, conflicts = 0) {
    const result =
      imported >= source ? "PASS" : imported > 0 ? "PARTIAL" : source === 0 ? "N/A" : "FAIL";
    matrix.push({ entity, source, imported, skipped, conflicts, result });
  }

  const tgtIdentityCount = (
    await targetPool.query(`SELECT COUNT(*)::int AS n FROM platform.identities WHERE status = 'active'`)
  ).rows[0].n;
  row("bb.identities", srcBb.counts.users?.count || 0, tgtIdentityCount);

  const bbKeys = [
    "churches",
    "branches",
    "organizations",
    "users",
    "user_role_assignments",
    "public_pages",
    "page_sections",
    "media_assets",
    "website_instances",
  ];
  for (const key of bbKeys) {
    const s = (srcBb.counts[key] && srcBb.counts[key].count) || 0;
    const t = (tgtBb.counts[key] && tgtBb.counts[key].count) || 0;
    row(`bb.${key}`, s, t);
  }
  row("bb.product_enrollments", srcBb.counts.organizations?.count || 0, tgtBb.counts.organizations?.count || 0);

  if (srcAc.available) {
    const acKeys = [
      "healthcare_organizations",
      "facilities",
      "staff_members",
      "identities",
      "patients",
      "appointments",
      "appointment_service_types",
      "website_instances",
      "website_media",
    ];
    for (const key of acKeys) {
      const s = (srcAc.counts[key] && srcAc.counts[key].count) || 0;
      const t = (tgtAc.counts[key] && tgtAc.counts[key].count) || 0;
      row(`ac.${key}`, s, t);
    }
    row("ac.organizations", srcAc.counts.healthcare_organizations?.count || 0, tgtAc.counts.healthcare_organizations?.count || 0);
  }

  return { matrix, summary: { blessboard: srcBb, activeclinic: srcAc }, ok: matrix.every((r) => r.result === "PASS" || r.result === "N/A") };
}

module.exports = {
  defaultOutputDir,
  runMigrationPipeline,
  verifyImport,
  collectIdentityPreview,
};
