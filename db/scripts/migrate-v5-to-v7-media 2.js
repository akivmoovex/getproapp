#!/usr/bin/env node
"use strict";

const path = require("path");
const fs = require("fs");
const {
  loadMigrationEnv,
  parseCliArgs,
  assertCommandSafety,
  createReadOnlySourcePool,
  createTargetPool,
} = require("../../src/migration/v5ToV7");
const { detectLocalMediaRoot } = require("../../src/migration/v5ToV7/inventory");
const {
  createSupabaseMediaClient,
  planSupabaseMedia,
  copySupabaseMedia,
} = require("../../src/migration/v5ToV7/supabaseMediaCopy");
const { resolveStateDir } = require("../../src/migration/v5ToV7/state");

async function planMedia(sourcePool) {
  const assets = await sourcePool.query(
    `SELECT id, church_id, storage_bucket, storage_key, mime_type, size_bytes, visibility, sha256
       FROM blessboard.media_assets WHERE status = 'active' ORDER BY created_at`
  );
  const local = await detectLocalMediaRoot();
  return {
    metadataRows: assets.rowCount,
    localFilesystem: local,
    sampleKeys: assets.rows.slice(0, 5).map((r) => ({
      id: r.id,
      storageKey: r.storage_key,
      visibility: r.visibility,
    })),
  };
}

async function copyLocalMedia(sourcePool, srcRoot, tgtRoot, dryRun) {
  const assets = await sourcePool.query(`SELECT storage_key FROM blessboard.media_assets WHERE status = 'active'`);
  const stats = { scanned: assets.rowCount, copied: 0, missingSource: 0, skippedIdentical: 0, conflicted: 0 };
  if (dryRun || !fs.existsSync(srcRoot)) return stats;
  fs.mkdirSync(tgtRoot, { recursive: true });
  for (const row of assets.rows) {
    const rel = String(row.storage_key || "").replace(/^\/+/, "");
    const from = path.join(srcRoot, rel);
    const to = path.join(tgtRoot, rel);
    if (!fs.existsSync(from)) {
      stats.missingSource += 1;
      continue;
    }
    if (fs.existsSync(to)) {
      stats.skippedIdentical += 1;
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    stats.copied += 1;
  }
  return stats;
}

async function main() {
  const { command, confirm, help } = parseCliArgs(process.argv.slice(2));
  if (help) {
    console.log("Usage: node db/scripts/migrate-v5-to-v7-media.js <plan|dry-run|apply|verify> [--confirm]");
    process.exit(0);
  }
  const cmdGate = assertCommandSafety(command, { confirm });
  if (!cmdGate.ok) {
    console.error(JSON.stringify({ ok: false, code: cmdGate.code }));
    process.exit(1);
  }

  const env = loadMigrationEnv({
    allowHosted: process.env.V7_MIGRATION_ALLOW_HOSTED === "1",
    confirmProductionTarget: process.env.V7_MIGRATION_CONFIRM_PRODUCTION_TARGET === "1",
  });
  if (!env.ok) {
    console.error(JSON.stringify({ ok: false, errors: env.errors }));
    process.exit(1);
  }

  const stateDir = resolveStateDir(process.env.V7_MIGRATION_STATE_DIR, process.cwd());
  const resumePath = path.join(stateDir, "state", "media-resume.json");
  const resumeState = fs.existsSync(resumePath) ? JSON.parse(fs.readFileSync(resumePath, "utf8")) : {};

  const sourcePool = createReadOnlySourcePool(env.config.bbSourceUrl);
  const targetPool = createTargetPool(env.config.targetUrl);
  try {
    const plan = await planMedia(sourcePool);
    const output = { ok: true, command, plan };

    const srcSupabaseUrl = process.env.V7_MEDIA_SOURCE_SUPABASE_URL || process.env.SUPABASE_URL;
    const srcSupabaseKey =
      process.env.V7_MEDIA_SOURCE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const tgtSupabaseUrl = process.env.V7_MEDIA_TARGET_SUPABASE_URL;
    const tgtSupabaseKey = process.env.V7_MEDIA_TARGET_SUPABASE_SERVICE_ROLE_KEY;

    if (command === "plan" && srcSupabaseUrl && srcSupabaseKey) {
      output.supabase = await planSupabaseMedia(sourcePool, process.env);
    }

    if (command === "dry-run" || command === "apply") {
      const dryRun = command === "dry-run";
      if (srcSupabaseUrl && srcSupabaseKey && tgtSupabaseUrl && tgtSupabaseKey) {
        const sourceClient = createSupabaseMediaClient({
          supabaseUrl: srcSupabaseUrl,
          serviceRoleKey: srcSupabaseKey,
        });
        const targetClient = createSupabaseMediaClient({
          supabaseUrl: tgtSupabaseUrl,
          serviceRoleKey: tgtSupabaseKey,
        });
        const copied = await copySupabaseMedia({
          sourcePool,
          sourceClient,
          targetClient,
          env: process.env,
          dryRun,
          resumeState,
        });
        output.supabase = copied;
        if (!dryRun) {
          fs.mkdirSync(path.dirname(resumePath), { recursive: true });
          fs.writeFileSync(resumePath, JSON.stringify(copied.resumeState, null, 2));
        }
      } else {
        const srcRoot = process.env.V7_MEDIA_SOURCE_ROOT || path.resolve("data/uploads/blessboard-v5-media");
        const tgtRoot = process.env.V7_MEDIA_TARGET_ROOT || path.resolve("tmp/v7-media-rehearsal");
        output.apply = await copyLocalMedia(sourcePool, srcRoot, tgtRoot, dryRun);
      }
    }

    if (command === "verify") {
      const tgt = await targetPool.query(`SELECT COUNT(*)::int AS n FROM blessboard.media_assets WHERE status = 'active'`);
      output.verify = { targetMetadataRows: tgt.rows[0].n };
    }

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await sourcePool.end().catch(() => {});
    await targetPool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
