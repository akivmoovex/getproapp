#!/usr/bin/env node
"use strict";

/**
 * Copy platform marketing images from public/ into MEDIA_STORAGE_ROOT under
 * {env}/platform/... so CDN presentation URLs resolve.
 *
 * Testing only by default (refuses production/ writes when DEPLOYMENT_ENV=testing).
 *
 * Usage:
 *   node scripts/sync-platform-marketing-media-to-hostinger.js
 *   node scripts/sync-platform-marketing-media-to-hostinger.js --dry-run
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const {
  resolveHostingerMediaConfig,
  assertStorageKeyWritable,
} = require("../src/platform/media/hostingerMediaConfig");
const {
  listMarketingPublicPaths,
  storageKeyForPublicPath,
  localPublicFilePath,
} = require("../src/platform/media/platformMarketingAssets");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const env = process.env;
  const cfg = resolveHostingerMediaConfig(env);
  if (!cfg.enabled || !cfg.storageRoot) {
    console.error("MEDIA_STORAGE_ROOT not enabled; cannot sync marketing assets.");
    process.exit(1);
  }
  const repoRoot = path.resolve(__dirname, "..");
  let copied = 0;
  let skipped = 0;
  let missing = 0;
  for (const publicPath of listMarketingPublicPaths()) {
    // Shared marketing soft-fill is presented from the read namespace
    // (testing/platform/… on V8). Write there so CDN URLs resolve.
    const key = storageKeyForPublicPath(publicPath, env);
    const relLocal = localPublicFilePath(publicPath);
    if (!key || !relLocal) {
      missing += 1;
      continue;
    }
    assertStorageKeyWritable(cfg.environment, key);
    const srcAbs = path.join(repoRoot, relLocal);
    const destAbs = path.join(cfg.storageRoot, ...key.split("/"));
    if (!fs.existsSync(srcAbs)) {
      console.warn(`missing source: ${relLocal}`);
      missing += 1;
      continue;
    }
    if (fs.existsSync(destAbs)) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      console.log(`dry-run copy ${relLocal} -> ${key}`);
      copied += 1;
      continue;
    }
    await fsp.mkdir(path.dirname(destAbs), { recursive: true });
    await fsp.copyFile(srcAbs, destAbs);
    copied += 1;
  }
  console.log(
    JSON.stringify({
      ok: true,
      dryRun,
      storageRoot: cfg.storageRoot,
      copied,
      skipped,
      missing,
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
