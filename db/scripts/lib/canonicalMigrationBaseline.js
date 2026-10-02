"use strict";

/**
 * V10 PL07 — Canonical fresh-database migration baseline (strategy B).
 *
 * Fresh empty DBs reach V2.03 via the existing ordered migrator:
 *   platform → blessboard → activeclinic → getpro → ngo (+ seeds)
 *
 * Does not squash or rewrite applied history. Historical ownership exceptions
 * remain allowlisted; forward placements follow FUTURE_RULES.
 *
 * Never targets QA/production — see canonical-fresh-bootstrap.js (ephemeral only).
 */

const fs = require("fs");
const path = require("path");
const {
  MODULE_ORDER,
  MIGRATIONS_ROOT,
  discoverMigrations,
  discoverSeeds,
  versionFromFilename,
} = require("./migrator");
const {
  HISTORICAL_EXCEPTIONS,
  FUTURE_RULES,
  auditMigrationOwnership,
} = require("./migrationOwnershipPolicy");

/** Strategy chosen for V10/V2.03 fresh install. */
const STRATEGY = Object.freeze({
  code: "B",
  name: "cleaned_ordered_migrations",
  rationale:
    "Existing migrator already discovers numbered SQL per module in deterministic order with checksum ledger + identity gate. Squash (A) would rewrite applied history; bootstrap-schema (C) would duplicate the ledger. Strategy B is the simplest runner-supported path.",
});

/**
 * Canonical migration ceiling filenames (highest version per module on disk).
 * Update when a new highest migration ships for that module.
 */
const CANONICAL_CEILING = Object.freeze({
  platform: Object.freeze({
    version: "043",
    filename: "043_shared_data_jobs_and_preferences.sql",
  }),
  blessboard: Object.freeze({
    version: "118",
    filename: "118_activeclinic_management_data_permissions.sql",
  }),
  activeclinic: Object.freeze({
    version: "042",
    filename: "042_patient_visit_summary_releases.sql",
  }),
  getpro: Object.freeze({
    version: "001",
    filename: "001_create_getpro_schema.sql",
  }),
  ngo: Object.freeze({
    version: "001",
    filename: "001_create_ngo_schema.sql",
  }),
});

/**
 * Marker migrations that must be present for V2.03 fresh schema (capability floor).
 * Includes V7 website/registration markers plus V2.03 clinical / shared extensions.
 */
const V2_03_REQUIRED_MIGRATIONS = Object.freeze([
  { module: "platform", version: "027", filename: "027_website_engine.sql" },
  { module: "platform", version: "033", filename: "033_media_folders.sql" },
  { module: "platform", version: "035", filename: "035_website_media_storage_provider.sql" },
  { module: "platform", version: "036", filename: "036_identity_verification_challenges.sql" },
  { module: "platform", version: "043", filename: "043_shared_data_jobs_and_preferences.sql" },
  { module: "blessboard", version: "093", filename: "093_website_engine_permissions.sql" },
  { module: "blessboard", version: "098", filename: "098_church_registration_canonical_lifecycle.sql" },
  { module: "blessboard", version: "116", filename: "116_freeze_legacy_user_roles.sql" },
  { module: "blessboard", version: "118", filename: "118_activeclinic_management_data_permissions.sql" },
  { module: "activeclinic", version: "019", filename: "019_public_website_and_booking.sql" },
  { module: "activeclinic", version: "030", filename: "030_clinic_registration_canonical_lifecycle.sql" },
  { module: "activeclinic", version: "036", filename: "036_batch1a_services_practitioners.sql" },
  { module: "activeclinic", version: "041", filename: "041_clinical_documents.sql" },
  { module: "activeclinic", version: "042", filename: "042_patient_visit_summary_releases.sql" },
]);

/** Schemas that must exist after a complete fresh migrate. */
const REQUIRED_SCHEMAS = Object.freeze([
  "platform",
  "blessboard",
  "activeclinic",
  "getpro",
  "ngo",
]);

/**
 * Minimum relations for V2.03 fresh schema (presence checks; additive tables allowed).
 */
const V2_03_REQUIRED_RELATIONS = Object.freeze([
  { schema: "platform", table: "schema_migrations" },
  { schema: "platform", table: "database_identity" },
  { schema: "platform", table: "organizations" },
  { schema: "platform", table: "identities" },
  { schema: "platform", table: "deployment_sessions" },
  { schema: "platform", table: "website_content" },
  { schema: "platform", table: "website_media" },
  { schema: "platform", table: "media_folders" },
  { schema: "blessboard", table: "churches" },
  { schema: "blessboard", table: "roles" },
  { schema: "blessboard", table: "permissions" },
  { schema: "blessboard", table: "user_role_assignments" },
  { schema: "blessboard", table: "media_assets" },
  { schema: "activeclinic", table: "healthcare_organizations" },
  { schema: "activeclinic", table: "patients" },
  { schema: "activeclinic", table: "appointments" },
  { schema: "activeclinic", table: "clinical_documents" },
]);

/**
 * Fresh-bootstrap command (ephemeral local dry-run only).
 * QA/prod reset is PL10+ and requires explicit authorization — not this command.
 */
const FRESH_BOOTSTRAP_COMMAND = Object.freeze({
  ephemeral:
    "npm run db:canonical-fresh-bootstrap",
  description:
    "Creates an ephemeral local Postgres database, runs ordered migrate+seeds, verifies V2.03 ceiling/schema, then drops the DB. Never uses hosted QA/production DATABASE_URL.",
  hosted_later:
    "PL10 only after V10_FRESH_DB_BOOTSTRAP_PASS + QA_RESET_AUTHORIZED: YES — not enabled by PL07.",
});

function ceilingForModule(moduleName) {
  const files = discoverMigrations().filter((f) => f.module === moduleName);
  if (!files.length) return null;
  const last = files[files.length - 1];
  return { version: last.version, filename: last.filename };
}

function assertCeilingMatchesDisk() {
  const mismatches = [];
  for (const mod of MODULE_ORDER) {
    const expected = CANONICAL_CEILING[mod];
    const actual = ceilingForModule(mod);
    if (!expected || !actual) {
      mismatches.push({ module: mod, expected, actual });
      continue;
    }
    if (expected.version !== actual.version || expected.filename !== actual.filename) {
      mismatches.push({ module: mod, expected, actual });
    }
  }
  return mismatches;
}

function assertRequiredMigrationsOnDisk() {
  const byKey = new Map(
    discoverMigrations().map((f) => [`${f.module}/${f.version}`, f.filename])
  );
  const missing = [];
  for (const req of V2_03_REQUIRED_MIGRATIONS) {
    const key = `${req.module}/${req.version}`;
    const filename = byKey.get(key);
    if (!filename) {
      missing.push({ ...req, reason: "missing" });
    } else if (filename !== req.filename) {
      missing.push({ ...req, reason: "filename_mismatch", actual: filename });
    }
  }
  return missing;
}

/**
 * Static ownership smell scan for fresh-path guarantees:
 * - BB migrations must not CREATE/ALTER activeclinic.* schema objects
 * - AC migrations must not CREATE platform.* schema objects (historical misnamed
 *   activeclinic.platform_contact_inquiries table is allowlisted by exception)
 */
function scanCrossSchemaDdlSmells() {
  const smells = [];
  const bbDir = path.join(MIGRATIONS_ROOT, "blessboard");
  if (fs.existsSync(bbDir)) {
    for (const name of fs.readdirSync(bbDir)) {
      if (!name.endsWith(".sql") || name.includes(" 2.")) continue;
      const sql = fs.readFileSync(path.join(bbDir, name), "utf8");
      if (/\bCREATE\s+(TABLE|SCHEMA|TYPE|INDEX)\b[\s\S]{0,80}\bactiveclinic\./i.test(sql)) {
        smells.push({ module: "blessboard", filename: name, kind: "create_activeclinic_object" });
      }
      if (/\bALTER\s+TABLE\s+activeclinic\./i.test(sql)) {
        smells.push({ module: "blessboard", filename: name, kind: "alter_activeclinic_table" });
      }
    }
  }
  const acDir = path.join(MIGRATIONS_ROOT, "activeclinic");
  if (fs.existsSync(acDir)) {
    for (const name of fs.readdirSync(acDir)) {
      if (!name.endsWith(".sql") || name.includes(" 2.")) continue;
      const rel = `activeclinic/${name}`;
      const sql = fs.readFileSync(path.join(acDir, name), "utf8");
      // Historical: creates activeclinic.platform_contact_inquiries (product table name)
      if (HISTORICAL_EXCEPTIONS.includes(rel)) continue;
      if (/\bCREATE\s+(TABLE|SCHEMA|TYPE)\s+platform\./i.test(sql)) {
        smells.push({ module: "activeclinic", filename: name, kind: "create_platform_object" });
      }
    }
  }
  return smells;
}

function describeBaseline() {
  const discovered = discoverMigrations();
  const seeds = discoverSeeds();
  const ownership = auditMigrationOwnership();
  return {
    strategy: STRATEGY,
    moduleOrder: MODULE_ORDER.slice(),
    ceiling: CANONICAL_CEILING,
    discoveredCount: discovered.length,
    seedCount: seeds.length,
    historicalExceptions: HISTORICAL_EXCEPTIONS.length,
    ownershipOrphans: ownership.orphans.length,
    forwardRules: FUTURE_RULES.summary.slice(),
    freshBootstrapCommand: FRESH_BOOTSTRAP_COMMAND.ephemeral,
  };
}

/**
 * Verify a migrated pool matches the canonical V2.03 fresh baseline.
 * @param {import('pg').Pool} pool
 */
async function verifyCanonicalFreshSchema(pool) {
  const failures = [];
  const details = {
    schemas: {},
    relations: {},
    ceiling: {},
    pending: null,
    drift: null,
  };

  const schemaRows = await pool.query(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name = ANY($1::text[])`,
    [REQUIRED_SCHEMAS.slice()]
  );
  const present = new Set(schemaRows.rows.map((r) => r.schema_name));
  for (const name of REQUIRED_SCHEMAS) {
    details.schemas[name] = present.has(name);
    if (!present.has(name)) failures.push(`missing_schema:${name}`);
  }

  for (const rel of V2_03_REQUIRED_RELATIONS) {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE'`,
      [rel.schema, rel.table]
    );
    const ok = r.rowCount > 0;
    details.relations[`${rel.schema}.${rel.table}`] = ok;
    if (!ok) failures.push(`missing_relation:${rel.schema}.${rel.table}`);
  }

  const ledger = await pool.query(
    `SELECT module, version, filename FROM platform.schema_migrations
      WHERE module = ANY($1::text[])`,
    [MODULE_ORDER.slice()]
  );
  const byModule = new Map();
  for (const row of ledger.rows) {
    const prev = byModule.get(row.module);
    if (!prev || Number(row.version) > Number(prev.version)) {
      byModule.set(row.module, row);
    }
  }
  for (const mod of MODULE_ORDER) {
    const expected = CANONICAL_CEILING[mod];
    const actual = byModule.get(mod);
    details.ceiling[mod] = actual || null;
    if (!actual) {
      failures.push(`missing_ceiling_row:${mod}`);
      continue;
    }
    if (actual.version !== expected.version || actual.filename !== expected.filename) {
      failures.push(
        `ceiling_mismatch:${mod}:expected=${expected.version}/${expected.filename}:actual=${actual.version}/${actual.filename}`
      );
    }
  }

  for (const req of V2_03_REQUIRED_MIGRATIONS) {
    const hit = ledger.rows.find(
      (row) => row.module === req.module && row.version === req.version
    );
    if (!hit) failures.push(`missing_required_migration:${req.module}/${req.version}`);
    else if (hit.filename !== req.filename) {
      failures.push(
        `required_migration_filename:${req.module}/${req.version}:expected=${req.filename}:actual=${hit.filename}`
      );
    }
  }

  const { statusReadOnly } = require("./migrator");
  const st = await statusReadOnly({ pool });
  details.pending = st.pending;
  details.drift = st.drift;
  if (st.pending > 0) failures.push(`migrations_pending:${st.pending}`);
  if (st.drift > 0) failures.push(`checksum_drift:${st.drift}`);

  return { ok: failures.length === 0, failures, details };
}

module.exports = {
  STRATEGY,
  CANONICAL_CEILING,
  V2_03_REQUIRED_MIGRATIONS,
  REQUIRED_SCHEMAS,
  V2_03_REQUIRED_RELATIONS,
  FRESH_BOOTSTRAP_COMMAND,
  ceilingForModule,
  assertCeilingMatchesDisk,
  assertRequiredMigrationsOnDisk,
  scanCrossSchemaDdlSmells,
  describeBaseline,
  verifyCanonicalFreshSchema,
  versionFromFilename,
};
