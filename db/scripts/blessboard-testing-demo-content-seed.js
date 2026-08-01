#!/usr/bin/env node
"use strict";

/**
 * Seed rich Stitch-shaped website demo content for BlessBoard V5 testing orgs.
 *
 * Testing deployment only (DEPLOYMENT_ENV=testing, or NODE_ENV=test).
 * Dry-run / diagnose by default. Writes require --apply.
 * Does not overwrite user content unless --refresh-demo-content (demo-owned only).
 * Never deletes. Never uses GETPRO_DATABASE_URL. No V4 tables.
 *
 * Diagnose:
 *   DEPLOYMENT_ENV=testing DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=… \
 *     node db/scripts/blessboard-testing-demo-content-seed.js --diagnose \
 *     --organization-key=demo-church
 *
 * Apply (Hostinger testing):
 *   DEPLOYMENT_ENV=testing DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5' \
 *     <NODE_BINARY> db/scripts/blessboard-testing-demo-content-seed.js --apply \
 *     --organization-key=demo-church
 */

const { Pool } = require("pg");
const {
  resolveDatabaseUrlSafe,
  requireMatchedIdentity,
  assertNoLegacyPublicTables,
  redactSecretsDeep,
  assertNoSecretsInText,
} = require("./lib/provisionCliSafety");
const {
  seedTestingWebsiteDemoContent,
  STATUS,
  ALLOW_ENV,
} = require("../../src/blessboard/services/testingWebsiteDemoContentService");
const {
  DEFAULT_ORGANIZATION_KEY,
  DEFAULT_ACTOR_EMAIL,
} = require("../../src/blessboard/services/testingWebsiteDemoContentSpec");

function parseArgs(argv) {
  let apply = false;
  let diagnose = false;
  let refreshDemoContent = false;
  let organizationKey = DEFAULT_ORGANIZATION_KEY;
  let churchKey = "";
  let actorEmail = DEFAULT_ACTOR_EMAIL;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    const take = (prefix) => arg.slice(prefix.length);
    if (arg === "--apply") apply = true;
    else if (arg === "--diagnose") diagnose = true;
    else if (arg === "--refresh-demo-content") refreshDemoContent = true;
    else if (arg === "--organization-key") organizationKey = next();
    else if (arg.startsWith("--organization-key=")) organizationKey = take("--organization-key=");
    else if (arg === "--church-key") churchKey = next();
    else if (arg.startsWith("--church-key=")) churchKey = take("--church-key=");
    else if (arg === "--actor-email") actorEmail = next();
    else if (arg.startsWith("--actor-email=")) actorEmail = take("--actor-email=");
  }
  if (diagnose) apply = false;
  const dryRun = !apply;
  return {
    apply,
    diagnose,
    dryRun,
    refreshDemoContent,
    organizationKey: String(organizationKey || DEFAULT_ORGANIZATION_KEY)
      .trim()
      .toLowerCase(),
    churchKey: String(churchKey || "").trim().toLowerCase(),
    actorEmail: String(actorEmail || DEFAULT_ACTOR_EMAIL)
      .trim()
      .toLowerCase(),
  };
}

function emitJson(obj) {
  const text = JSON.stringify(redactSecretsDeep(obj), null, 2);
  assertNoSecretsInText(text);
  // eslint-disable-next-line no-console
  console.log(text);
}

function emitHuman(lines) {
  const text = lines.join("\n");
  assertNoSecretsInText(text);
  // eslint-disable-next-line no-console
  console.error(text);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let exitCode = 0;
  let pool = null;

  try {
    const dbUrl = resolveDatabaseUrlSafe();
    if (!dbUrl.ok) {
      emitJson({
        ok: false,
        status: dbUrl.message,
        message: dbUrl.message,
        detail: dbUrl.detail || null,
        writes: false,
        allow_env: ALLOW_ENV,
      });
      emitHuman([`[testing-demo-content] FAIL: ${dbUrl.message}`]);
      process.exit(2);
    }

    pool = new Pool({ connectionString: dbUrl.connectionString, max: 4 });

    const identity = await requireMatchedIdentity(pool);
    if (!identity.ok) {
      emitJson({
        ok: false,
        status: identity.code || "identity_required",
        message: identity.message,
        writes: false,
      });
      emitHuman([`[testing-demo-content] FAIL: ${identity.message}`]);
      exitCode = 2;
      return;
    }

    const legacy = await assertNoLegacyPublicTables(pool);
    if (!legacy.ok) {
      emitJson({
        ok: false,
        status: legacy.message,
        tables: legacy.tables,
        writes: false,
      });
      emitHuman([`[testing-demo-content] FAIL: ${legacy.message}`]);
      exitCode = 2;
      return;
    }

    const result = await seedTestingWebsiteDemoContent(pool, {
      dryRun: args.dryRun,
      diagnose: args.diagnose,
      refreshDemoContent: args.refreshDemoContent,
      organizationKey: args.organizationKey,
      churchKey: args.churchKey || args.organizationKey,
      actorEmail: args.actorEmail,
      env: process.env,
    });

    const counts = {};
    for (const a of result.actions || []) {
      const s = a.status || "unknown";
      counts[s] = (counts[s] || 0) + 1;
    }

    emitJson({
      ok: result.ok,
      status: result.status,
      message: result.message,
      mode: args.diagnose ? "diagnose" : args.apply ? "apply" : "dry_run",
      refresh_demo_content: args.refreshDemoContent,
      keys: result.keys || null,
      categories: result.categories || null,
      action_counts: counts,
      action_total: (result.actions || []).length,
      dates: result.dates || null,
      notes: result.notes || null,
      detail: result.detail || null,
      identity_key: identity.identityKey,
      host_fingerprint: dbUrl.hostFingerprint,
      database: dbUrl.databaseName,
      hint: args.dryRun
        ? "Re-run with --apply to write (still fill-empty unless --refresh-demo-content)."
        : undefined,
    });

    emitHuman([
      `[testing-demo-content] mode=${args.diagnose ? "diagnose" : args.apply ? "apply" : "dry_run"} ok=${result.ok} status=${result.status}`,
      `  organization_key=${args.organizationKey}`,
      `  actions=${(result.actions || []).length} refresh=${args.refreshDemoContent}`,
      args.dryRun
        ? "  hint: add --apply to write demo content (no destructive deletes)."
        : "  writes applied (fill-empty or refresh demo-owned only).",
    ]);

    if (!result.ok) {
      exitCode =
        result.status === STATUS.REFUSED_PRODUCTION ||
        result.status === STATUS.REFUSED_ENVIRONMENT
          ? 2
          : 1;
    }
  } catch (err) {
    emitJson({
      ok: false,
      status: "cli_error",
      message: err && err.message ? String(err.message).slice(0, 200) : "error",
      writes: false,
    });
    emitHuman([`[testing-demo-content] ERROR: ${err && err.message ? err.message : err}`]);
    exitCode = 2;
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
  }

  process.exit(exitCode);
}

main();
