"use strict";

/**
 * Optional one-off migrator: copy platform.website_media.payload_bytes → Hostinger files.
 * Does NOT run automatically. Safe for testing only when MEDIA_STORAGE_ROOT is set
 * and DEPLOYMENT_ENV=testing (refuses production/ keys).
 *
 * Usage (manual):
 *   MEDIA_STORAGE_ROOT=... DEPLOYMENT_ENV=testing node scripts/migrate-website-media-to-hostinger.js --dry-run
 *   MEDIA_STORAGE_ROOT=... DEPLOYMENT_ENV=testing node scripts/migrate-website-media-to-hostinger.js --confirm migrate-website-media-to-hostinger
 */

const { createHostingerMediaStorage } = require("../src/platform/media/hostingerMediaStorage");
const {
  resolveHostingerMediaConfig,
  PROVIDER_HOSTINGER,
  PROVIDER_DATABASE,
  buildHostingerStorageKey,
} = require("../src/platform/media/hostingerMediaConfig");

async function migrateWebsiteMediaToHostinger(db, opts) {
  const options = opts || {};
  const env = options.env || process.env;
  const dryRun = options.dryRun !== false && !options.execute;
  const cfg = resolveHostingerMediaConfig(env);
  if (!cfg.enabled) {
    return { ok: false, code: "media_storage_root_unset", migrated: 0 };
  }
  if (cfg.environment !== "testing" && !options.allowProduction) {
    return { ok: false, code: "refused_non_testing_environment", migrated: 0 };
  }
  const storage = createHostingerMediaStorage(env, { config: cfg });
  const rows = await db.query(
    `SELECT m.id, m.organization_id, m.storage_key, m.storage_provider, m.mime_type,
            m.payload_bytes, i.product_code
       FROM platform.website_media m
       JOIN platform.website_instances i ON i.id = m.instance_id
      WHERE m.media_kind = 'image'
        AND m.status = 'active'
        AND m.payload_bytes IS NOT NULL
        AND COALESCE(m.storage_provider, 'database') = 'database'
      ORDER BY m.created_at ASC
      LIMIT $1`,
    [Math.min(Number(options.limit) || 100, 500)]
  );

  let migrated = 0;
  const errors = [];
  for (const row of rows.rows) {
    try {
      const mediaId = row.id;
      const storageKey = buildHostingerStorageKey({
        environment: cfg.environment,
        productCode: row.product_code,
        organizationId: row.organization_id,
        mediaId,
        mimeType: row.mime_type,
      });
      if (dryRun) {
        migrated += 1;
        continue;
      }
      await storage.storeMedia({
        productCode: row.product_code,
        organizationId: row.organization_id,
        mediaId,
        mimeType: row.mime_type,
        buffer: row.payload_bytes,
        storageKey,
      });
      await db.query(
        `UPDATE platform.website_media
            SET storage_provider = $3,
                storage_key = $4,
                payload_bytes = NULL
          WHERE id = $1 AND organization_id = $2`,
        [mediaId, row.organization_id, PROVIDER_HOSTINGER, storageKey]
      );
      migrated += 1;
    } catch (err) {
      errors.push({
        mediaId: row.id,
        code: (err && err.code) || "migrate_failed",
        message: err && err.message ? String(err.message).slice(0, 120) : "unknown",
      });
    }
  }
  return {
    ok: errors.length === 0,
    dryRun,
    migrated,
    scanned: rows.rows.length,
    errors,
    providerFrom: PROVIDER_DATABASE,
    providerTo: PROVIDER_HOSTINGER,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--confirm") || args.includes("--dry-run");
  const confirm = args.includes("--confirm") && args.includes("migrate-website-media-to-hostinger");
  if (!dryRun && !confirm) {
    // eslint-disable-next-line no-console
    console.error("Refusing: pass --confirm migrate-website-media-to-hostinger to execute");
    process.exit(2);
  }
  const { getPgPool } = require("../src/db/pg");
  const pool = getPgPool();
  const result = await migrateWebsiteMediaToHostinger(pool, {
    dryRun: !confirm,
    execute: confirm,
    env: process.env,
  });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result));
  await pool.end().catch(() => {});
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  migrateWebsiteMediaToHostinger,
};
