#!/usr/bin/env node
"use strict";

/**
 * V10 DBCL01 — READ-ONLY database cleanliness audit.
 *
 * Inventories schema metadata + aggregate domain counts.
 * Never mutates data. Never runs migrations.
 *
 * Usage:
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node db/scripts/v10-dbcl01-cleanliness-audit.js --expect-env testing
 *   scripts/local/run-with-blessboard-env.sh production \
 *     node db/scripts/v10-dbcl01-cleanliness-audit.js --expect-env production
 *   node db/scripts/v10-dbcl01-cleanliness-audit.js --canonical-ephemeral
 */

const { Pool } = require("pg");
const { requireDatabaseUrl, parseDatabaseName } = require("./lib/databaseUrl");
const { sanitizeHostFingerprint } = require("./lib/hostFingerprint");
const { buildFoundationPoolConfig } = require("./lib/foundationPool");
const { checkDatabaseIdentity } = require("./lib/databaseIdentity");
const { statusReadOnly } = require("./lib/migrator");
const {
  CANONICAL_CEILING,
  verifyCanonicalFreshSchema,
  describeBaseline,
} = require("./lib/canonicalMigrationBaseline");

const APP_SCHEMAS = ["platform", "blessboard", "activeclinic", "getpro", "ngo"];

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function fingerprintUrl(url) {
  try {
    const u = new URL(String(url).replace(/^postgresql:/i, "postgres:"));
    return {
      host: u.hostname,
      port: u.port || "5432",
      database: (u.pathname || "").replace(/^\//, "") || null,
      userPrefix: (u.username || "").slice(0, 3) + "***",
    };
  } catch {
    return { parse_error: true };
  }
}

function assertNoSecrets(text) {
  const s = String(text || "");
  if (/postgres(ql)?:\/\//i.test(s)) {
    throw new Error("Refusing to print a postgres URL");
  }
  if (/password\s*=/i.test(s)) {
    throw new Error("Refusing to print password material");
  }
}

async function safeCount(pool, sql) {
  try {
    const r = await pool.query(sql);
    const v = r.rows[0] && Object.values(r.rows[0])[0];
    return Number(v) || 0;
  } catch (err) {
    return { error: err && err.message ? err.message : String(err) };
  }
}

async function inventorySchema(pool) {
  const schemas = (
    await pool.query(
      `SELECT nspname AS schema_name
         FROM pg_namespace
        WHERE nspname = ANY($1::text[])
        ORDER BY 1`,
      [APP_SCHEMAS]
    )
  ).rows.map((r) => r.schema_name);

  const tables = (
    await pool.query(
      `SELECT table_schema AS schema, table_name AS name
         FROM information_schema.tables
        WHERE table_schema = ANY($1::text[])
          AND table_type = 'BASE TABLE'
        ORDER BY 1, 2`,
      [APP_SCHEMAS]
    )
  ).rows;

  const views = (
    await pool.query(
      `SELECT table_schema AS schema, table_name AS name, 'VIEW' AS kind
         FROM information_schema.views
        WHERE table_schema = ANY($1::text[])
       UNION ALL
       SELECT schemaname AS schema, matviewname AS name, 'MATERIALIZED VIEW' AS kind
         FROM pg_matviews
        WHERE schemaname = ANY($1::text[])
        ORDER BY 1, 2`,
      [APP_SCHEMAS]
    )
  ).rows;

  const columns = (
    await pool.query(
      `SELECT table_schema AS schema, table_name AS table, column_name AS name,
              data_type, udt_name, is_nullable, column_default IS NOT NULL AS has_default
         FROM information_schema.columns
        WHERE table_schema = ANY($1::text[])
        ORDER BY 1, 2, ordinal_position`,
      [APP_SCHEMAS]
    )
  ).rows;

  const indexes = (
    await pool.query(
      `SELECT schemaname AS schema, tablename AS table, indexname AS name,
              indexdef
         FROM pg_indexes
        WHERE schemaname = ANY($1::text[])
        ORDER BY 1, 2, 3`,
      [APP_SCHEMAS]
    )
  ).rows;

  const constraints = (
    await pool.query(
      `SELECT n.nspname AS schema, c.relname AS table, con.conname AS name,
              con.contype AS type
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY($1::text[])
        ORDER BY 1, 2, 3`,
      [APP_SCHEMAS]
    )
  ).rows;

  const sequences = (
    await pool.query(
      `SELECT sequence_schema AS schema, sequence_name AS name
         FROM information_schema.sequences
        WHERE sequence_schema = ANY($1::text[])
        ORDER BY 1, 2`,
      [APP_SCHEMAS]
    )
  ).rows;

  const triggers = (
    await pool.query(
      `SELECT event_object_schema AS schema, event_object_table AS table,
              trigger_name AS name, action_timing, event_manipulation
         FROM information_schema.triggers
        WHERE event_object_schema = ANY($1::text[])
        ORDER BY 1, 2, 3`,
      [APP_SCHEMAS]
    )
  ).rows;

  const functions = (
    await pool.query(
      `SELECT n.nspname AS schema, p.proname AS name,
              pg_get_function_identity_arguments(p.oid) AS args
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = ANY($1::text[])
        ORDER BY 1, 2, 3`,
      [APP_SCHEMAS]
    )
  ).rows;

  let migrations = [];
  let seeds = [];
  try {
    migrations = (
      await pool.query(
        `SELECT module, version, filename, applied_at
           FROM platform.schema_migrations
          ORDER BY module, version`
      )
    ).rows;
  } catch (err) {
    migrations = { error: err && err.message ? err.message : String(err) };
  }
  try {
    seeds = (
      await pool.query(
        `SELECT module, filename, applied_at
           FROM platform.schema_seeds
          ORDER BY module, filename`
      )
    ).rows;
  } catch (err) {
    seeds = { error: err && err.message ? err.message : String(err) };
  }

  const tableKeys = tables.map((t) => `${t.schema}.${t.name}`).sort();
  const viewKeys = views.map((v) => `${v.schema}.${v.name}`).sort();
  const columnKeys = columns
    .map((c) => `${c.schema}.${c.table}.${c.name}`)
    .sort();
  const indexKeys = indexes.map((i) => `${i.schema}.${i.name}`).sort();
  const constraintKeys = constraints
    .map((c) => `${c.schema}.${c.table}.${c.name}`)
    .sort();
  const sequenceKeys = sequences.map((s) => `${s.schema}.${s.name}`).sort();
  const triggerKeys = triggers
    .map((t) => `${t.schema}.${t.table}.${t.name}`)
    .sort();
  const functionKeys = functions
    .map((f) => `${f.schema}.${f.name}(${f.args || ""})`)
    .sort();

  return {
    schemas,
    counts: {
      tables: tables.length,
      columns: columns.length,
      indexes: indexes.length,
      constraints: constraints.length,
      sequences: sequences.length,
      views: views.length,
      triggers: triggers.length,
      functions: functions.length,
      migrations: Array.isArray(migrations) ? migrations.length : null,
      seeds: Array.isArray(seeds) ? seeds.length : null,
    },
    tables: tableKeys,
    views: viewKeys,
    columns: columnKeys,
    indexes: indexKeys,
    constraints: constraintKeys,
    sequences: sequenceKeys,
    triggers: triggerKeys,
    functions: functionKeys,
    migrations: Array.isArray(migrations)
      ? migrations.map((m) => ({
          module: m.module,
          version: m.version,
          filename: m.filename,
        }))
      : migrations,
    seeds: Array.isArray(seeds)
      ? seeds.map((s) => ({ module: s.module, filename: s.filename }))
      : seeds,
  };
}

async function domainCounts(pool) {
  const out = {
    platform: {},
    blessboard: {},
    activeclinic: {},
    website: {},
    media: {},
    audit_history: {},
    registration_session: {},
  };

  out.platform.organizations = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM platform.organizations`
  );
  out.platform.identities = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM platform.identities`
  );
  out.platform.users_via_identities = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM platform.identities WHERE status IS NOT NULL`
  );
  out.platform.deployment_sessions = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM platform.deployment_sessions`
  );

  out.blessboard.churches = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM blessboard.churches`
  );
  out.blessboard.branches = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM blessboard.branches`
  );
  out.blessboard.members = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM blessboard.members`
  );
  out.blessboard.users = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM blessboard.users`
  );
  out.blessboard.public_pages = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM blessboard.public_pages`
  );
  out.blessboard.website_publication_versions = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM blessboard.website_publication_versions`
  );
  out.blessboard.website_inline_field_drafts = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM blessboard.website_inline_field_drafts`
  );

  out.activeclinic.healthcare_organizations = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM activeclinic.healthcare_organizations`
  );
  out.activeclinic.facilities = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM activeclinic.facilities`
  );
  out.activeclinic.staff_members = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM activeclinic.staff_members`
  );
  out.activeclinic.patients = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM activeclinic.patients`
  );
  out.activeclinic.appointments = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM activeclinic.appointments`
  );
  out.activeclinic.encounters = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM activeclinic.encounters`
  );
  out.activeclinic.clinical_orders = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM activeclinic.clinical_orders`
  );
  out.activeclinic.invoices = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM activeclinic.invoices`
  );
  out.activeclinic.clinical_documents = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM activeclinic.clinical_documents`
  );

  out.website.platform_website_content = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM platform.website_content`
  );
  out.website.platform_website_versions = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM platform.website_versions`
  );
  out.website.platform_website_audit_events = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM platform.website_audit_events`
  );
  out.website.blessboard_structured_drafts = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM blessboard.website_structured_drafts`
  );

  out.media.platform_website_media = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM platform.website_media`
  );
  out.media.platform_media_folders = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM platform.media_folders`
  );
  out.media.blessboard_media_assets = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM blessboard.media_assets`
  );

  out.audit_history.platform_audit_events = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM platform.audit_events`
  );
  out.audit_history.website_audit_events = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM platform.website_audit_events`
  );

  out.registration_session.church_registration_applications = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM blessboard.platform_church_registration_applications`
  );
  out.registration_session.clinic_registration_applications = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM activeclinic.clinic_registration_applications`
  );
  out.registration_session.user_roles_legacy = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM blessboard.user_roles`
  );
  out.registration_session.user_role_assignments = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM blessboard.user_role_assignments`
  );
  out.registration_session.identity_verification_challenges = await safeCount(
    pool,
    `SELECT COUNT(*)::int FROM platform.identity_verification_challenges`
  );
  out.registration_session.deployment_sessions = out.platform.deployment_sessions;

  // Org environment flags (no PII)
  try {
    const flags = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE test_cleanup_eligible IS TRUE)::int AS cleanup_eligible,
         COUNT(*) FILTER (WHERE test_cleanup_eligible IS NOT TRUE)::int AS cleanup_ineligible,
         COUNT(*) FILTER (WHERE data_environment = 'production')::int AS data_env_production,
         COUNT(*) FILTER (WHERE data_environment = 'testing')::int AS data_env_testing,
         COUNT(*) FILTER (WHERE data_environment IS NULL OR data_environment NOT IN ('production','testing'))::int AS data_env_other
       FROM platform.organizations`
    );
    out.platform.org_flags = flags.rows[0];
  } catch (err) {
    out.platform.org_flags = {
      error: err && err.message ? err.message : String(err),
    };
  }

  return out;
}

function migrationCeiling(migrations) {
  if (!Array.isArray(migrations)) return null;
  const byModule = {};
  for (const row of migrations) {
    const prev = byModule[row.module];
    if (!prev || Number(row.version) > Number(prev.version)) {
      byModule[row.module] = {
        version: row.version,
        filename: row.filename,
      };
    }
  }
  return byModule;
}

async function auditPool(pool, connectionString, expectEnv) {
  const fingerprint = fingerprintUrl(connectionString);
  const liveFingerprint = sanitizeHostFingerprint(connectionString);
  const currentDb = parseDatabaseName(connectionString);

  const envGate = {
    DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV || null,
    DATABASE_IDENTITY_EXPECTED: process.env.DATABASE_IDENTITY_EXPECTED || null,
    DATABASE_IDENTITY_ENV: process.env.DATABASE_IDENTITY_ENV || null,
    PLATFORM_DEPLOYMENT_CODE: process.env.PLATFORM_DEPLOYMENT_CODE || null,
    GETPRO_DATABASE_URL_set: Boolean(
      process.env.GETPRO_DATABASE_URL &&
        String(process.env.GETPRO_DATABASE_URL).trim()
    ),
  };

  const identity = await checkDatabaseIdentity(pool, {
    identityKey: envGate.DATABASE_IDENTITY_EXPECTED || undefined,
  });

  const identityRow = identity.row || null;
  const liveEnv = identityRow
    ? String(identityRow.environment_code || "").toLowerCase()
    : null;

  const ambiguous = [];
  if (!expectEnv) ambiguous.push("missing --expect-env");
  if (!identity.ok) ambiguous.push(`identity_check:${identity.code}`);
  if (expectEnv && liveEnv && liveEnv !== expectEnv) {
    ambiguous.push(
      `live_environment_code=${liveEnv} expected=${expectEnv}`
    );
  }
  if (
    expectEnv &&
    envGate.DEPLOYMENT_ENV &&
    String(envGate.DEPLOYMENT_ENV).toLowerCase() !== expectEnv
  ) {
    ambiguous.push(
      `DEPLOYMENT_ENV=${envGate.DEPLOYMENT_ENV} expected=${expectEnv}`
    );
  }
  if (
    expectEnv &&
    envGate.DATABASE_IDENTITY_ENV &&
    String(envGate.DATABASE_IDENTITY_ENV).toLowerCase() !== expectEnv
  ) {
    ambiguous.push(
      `DATABASE_IDENTITY_ENV=${envGate.DATABASE_IDENTITY_ENV} expected=${expectEnv}`
    );
  }
  if (expectEnv === "testing") {
    if (liveEnv === "production") ambiguous.push("testing_target_is_production");
    if (String(envGate.PLATFORM_DEPLOYMENT_CODE || "").includes("production")) {
      ambiguous.push("PLATFORM_DEPLOYMENT_CODE looks production");
    }
  }
  if (expectEnv === "production") {
    if (liveEnv === "testing") ambiguous.push("production_target_is_testing");
  }
  if (
    identityRow &&
    envGate.DATABASE_IDENTITY_EXPECTED &&
    identityRow.identity_key !== envGate.DATABASE_IDENTITY_EXPECTED
  ) {
    ambiguous.push(
      `identity_key_mismatch live=${identityRow.identity_key} expected=${envGate.DATABASE_IDENTITY_EXPECTED}`
    );
  }

  if (ambiguous.length) {
    return {
      ok: false,
      aborted: true,
      code: "ENVIRONMENT_IDENTITY_AMBIGUOUS",
      ambiguous,
      envGate,
      fingerprint,
      live_host_fingerprint: liveFingerprint,
      current_database: currentDb,
      identity: identityRow
        ? {
            identity_key: identityRow.identity_key,
            environment_code: identityRow.environment_code,
            database_instance_id: identityRow.database_instance_id,
            database_name: identityRow.database_name,
          }
        : null,
    };
  }

  const schema = await inventorySchema(pool);
  const counts = await domainCounts(pool);
  const status = await statusReadOnly({ pool });
  const verify = await verifyCanonicalFreshSchema(pool);
  const ceiling = migrationCeiling(schema.migrations);

  return {
    ok: true,
    aborted: false,
    expect_env: expectEnv,
    envGate,
    fingerprint,
    live_host_fingerprint: liveFingerprint,
    current_database: currentDb,
    identity: {
      identity_key: identityRow.identity_key,
      environment_code: identityRow.environment_code,
      database_instance_id: identityRow.database_instance_id,
      database_name: identityRow.database_name,
      host_fingerprint: identityRow.host_fingerprint,
    },
    expected_canonical_identity: {
      identity_key: "moovex-platform-v7",
      environment_code: expectEnv,
      ceiling: CANONICAL_CEILING,
    },
    migration_ceiling_live: ceiling,
    migration_status: {
      pending: status.pending,
      drift: status.drift,
      applied: status.applied,
      ledger_missing: status.ledger_missing,
    },
    verify_canonical_fresh_schema: {
      ok: verify.ok,
      failures: verify.failures,
    },
    schema_counts: schema.counts,
    schema_keys: {
      tables: schema.tables,
      views: schema.views,
      columns: schema.columns,
      indexes: schema.indexes,
      constraints: schema.constraints,
      sequences: schema.sequences,
      triggers: schema.triggers,
      functions: schema.functions,
    },
    migrations: schema.migrations,
    seeds: schema.seeds,
    domain_counts: counts,
    baseline: describeBaseline(),
  };
}

async function runHosted() {
  const expectEnv = argValue("--expect-env");
  if (!expectEnv || !["testing", "production"].includes(expectEnv)) {
    throw new Error("Required: --expect-env testing|production");
  }
  const connectionString = requireDatabaseUrl();
  const pool = new Pool(buildFoundationPoolConfig(connectionString, { max: 2 }));
  try {
    // SET default_transaction_read_only for extra safety on this session
    await pool.query("SET default_transaction_read_only = on");
    await pool.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    return await auditPool(pool, connectionString, expectEnv);
  } finally {
    await pool.end();
  }
}

async function runCanonicalEphemeral() {
  const {
    resetFoundationDatabase,
    createFoundationPool,
    dropFoundationDatabaseByUrl,
  } = require("../../tests/helpers/foundationDb");
  const { migrate } = require("./lib/migrator");
  const { ensureDatabaseIdentity } = require("./lib/databaseIdentity");

  let databaseUrl = null;
  let pool = null;
  try {
    databaseUrl = await resetFoundationDatabase();
    pool = createFoundationPool(databaseUrl);
    await migrate({ pool });
    await ensureDatabaseIdentity(pool, {
      connectionString: databaseUrl,
      identityKey: "moovex-platform-v7",
      environmentCode: "testing",
    });
    const schema = await inventorySchema(pool);
    const verify = await verifyCanonicalFreshSchema(pool);
    return {
      ok: verify.ok,
      source: "ephemeral_canonical_fresh_bootstrap",
      verify_failures: verify.ok ? undefined : verify.failures,
      expected_canonical_identity: {
        identity_key: "moovex-platform-v7",
        environment_code: "testing",
        ceiling: CANONICAL_CEILING,
      },
      schema_counts: schema.counts,
      schema_keys: {
        tables: schema.tables,
        views: schema.views,
        columns: schema.columns,
        indexes: schema.indexes,
        constraints: schema.constraints,
        sequences: schema.sequences,
        triggers: schema.triggers,
        functions: schema.functions,
      },
      migrations: schema.migrations,
      seeds: schema.seeds,
      migration_ceiling_live: migrationCeiling(schema.migrations),
      baseline: describeBaseline(),
    };
  } finally {
    if (pool) await pool.end().catch(() => {});
    if (databaseUrl) await dropFoundationDatabaseByUrl(databaseUrl).catch(() => {});
  }
}

async function main() {
  let report;
  if (hasFlag("--canonical-ephemeral")) {
    report = await runCanonicalEphemeral();
  } else {
    report = await runHosted();
  }
  const out = JSON.stringify(report, null, 2);
  assertNoSecrets(out);
  console.log(out);
  if (report.aborted || report.ok === false) process.exit(2);
}

main().catch((err) => {
  console.error(
    `[dbcl01] ${err && err.message ? err.message : String(err)}`
  );
  process.exit(1);
});
