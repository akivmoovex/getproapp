"use strict";

/**
 * V8 ↔ V7 shared-database compatibility contract (machine-readable).
 * Single PostgreSQL database; no separate V8 database.
 * Does not run migrations or mutate production data.
 */

const { REQUIRED_MIGRATIONS } = require("./v7RuntimeSchemaCompatibility");

/** Expand/contract phases while V7 remains active. */
const COMPAT_PHASE = Object.freeze({
  EXPAND: "expand",
  MIGRATE_READERS: "migrate_readers",
  MIGRATE_WRITERS: "migrate_writers",
  CONTRACT: "contract",
});

/**
 * Contract phase gates. CONTRACT that removes V7 dependencies is forbidden
 * while V7 is active on the shared database.
 */
const PHASE_RULES = Object.freeze({
  [COMPAT_PHASE.EXPAND]: {
    allowed: [
      "ADD TABLE IF NOT EXISTS",
      "ADD COLUMN nullable or with stable DEFAULT",
      "ADD INDEX / UNIQUE INDEX concurrent-safe where possible",
      "ADD CHECK that accepts all existing V7 values",
      "ADD ENUM value (append-only)",
    ],
    forbidden: [
      "DROP COLUMN used by V7",
      "RENAME COLUMN/TABLE used by V7",
      "NARROW CHECK / ENUM removing V7 values",
      "CHANGE column type without dual-write adapter",
      "NOT NULL without backfill + DEFAULT for all existing rows",
    ],
  },
  [COMPAT_PHASE.MIGRATE_READERS]: {
    allowed: ["V8 and V7 both read old representation; V8 may also read new columns"],
    forbidden: ["Require V7 to read V8-only columns"],
  },
  [COMPAT_PHASE.MIGRATE_WRITERS]: {
    allowed: ["Dual-write old+new; V7 writers unchanged"],
    forbidden: ["Stop writing V7-required columns while V7 is active"],
  },
  [COMPAT_PHASE.CONTRACT]: {
    allowed: ["Only after V7 is retired from the shared DB"],
    forbidden: [
      "Remove V7 columns/constraints/tables while V7 remains active",
      "Drop dual-write before V7 readers/writers are gone",
    ],
  },
});

/**
 * Core shared / product tables V7 requires on the shared database.
 * Columns listed are the minimum V7 read/write surface (not every additive column).
 */
const V7_REQUIRED_RELATIONS = Object.freeze([
  // Platform — tenancy / identity / session / audit / website / media
  {
    schema: "platform",
    table: "organizations",
    columns: [
      "id",
      "organization_key",
      "display_name",
      "legal_name",
      "status",
      "data_environment",
      "created_at",
      "updated_at",
    ],
    statusValues: ["active", "inactive", "retired"],
    dataFormats: {
      organization_key: "^[a-z][a-z0-9_-]{0,63}$",
      data_environment: "production|pilot|demo|testing",
    },
    product: "shared",
  },
  {
    schema: "platform",
    table: "organization_products",
    columns: ["organization_id", "product_id", "product_tenant_key", "status"],
    product: "shared",
  },
  {
    schema: "platform",
    table: "identities",
    columns: [
      "id",
      "status",
      "primary_phone",
      "phone_normalized",
      "phone_verified_at",
      "primary_email",
      "email_normalized",
      "email_verified_at",
      "password_hash",
      "must_change_password",
      "created_at",
      "updated_at",
    ],
    statusValues: ["active", "inactive", "suspended"],
    dataFormats: {
      phone_normalized: "^\\+[1-9][0-9]{6,14}$",
      email_normalized: "lower(trim) email",
      session_or_token_hash: "sha256 hex 64",
    },
    product: "shared",
  },
  {
    schema: "platform",
    table: "identity_product_profiles",
    columns: [
      "id",
      "identity_id",
      "product_key",
      "profile_type",
      "product_profile_id",
      "status",
    ],
    product: "shared",
  },
  {
    schema: "platform",
    table: "identity_action_tokens",
    columns: [
      "id",
      "platform_identity_id",
      "purpose",
      "token_hash",
      "expires_at",
      "consumed_at",
      "revoked_at",
      "deployment_code",
      "product_key",
    ],
    dataFormats: {
      token_hash: "^[a-f0-9]{64}$",
    },
    notes: "Raw tokens never stored. V7 AC purposes are activation + password_reset.",
    product: "shared",
  },
  {
    schema: "platform",
    table: "deployment_sessions",
    columns: [
      "id",
      "session_token_hash",
      "deployment_code",
      "user_id",
      "organization_id",
      "created_at",
      "last_seen_at",
      "expires_at",
      "revoked_at",
    ],
    dataFormats: {
      session_token_hash: "^[a-f0-9]{64}$",
    },
    product: "shared",
  },
  {
    schema: "platform",
    table: "audit_events",
    columns: [
      "id",
      "deployment_code",
      "organization_id",
      "action_key",
      "entity_type",
      "outcome",
      "metadata_json",
      "created_at",
    ],
    outcomeValues: ["success", "failure", "denied"],
    notes: "Append-only; UPDATE/DELETE blocked by trigger.",
    product: "shared",
  },
  {
    schema: "platform",
    table: "website_instances",
    columns: [
      "id",
      "organization_id",
      "product_code",
      "template_id",
      "slug",
      "status",
      "scope_kind",
      "scope_ref",
      "created_at",
      "updated_at",
    ],
    statusValues: ["draft", "coming_soon", "published", "archived"],
    product: "shared",
  },
  {
    schema: "platform",
    table: "website_content",
    columns: [
      "id",
      "organization_id",
      "instance_id",
      "content_key",
      "content_type",
      "draft_value",
      "published_value",
      "visibility",
    ],
    product: "shared",
  },
  {
    schema: "platform",
    table: "website_versions",
    columns: ["id", "instance_id", "version_number", "snapshot_json", "status"],
    product: "shared",
  },
  {
    schema: "platform",
    table: "website_media",
    columns: [
      "id",
      "organization_id",
      "storage_key",
      "mime_type",
      "media_kind",
      "original_filename",
    ],
    product: "shared",
  },
  {
    schema: "platform",
    table: "schema_migrations",
    columns: ["module", "version", "filename", "checksum", "applied_at", "execution_ms"],
    product: "shared",
  },
  {
    schema: "platform",
    table: "database_identity",
    columns: ["id", "database_instance_id", "environment_code", "database_name", "identity_key"],
    product: "shared",
  },

  // BlessBoard — church / branch / user / invitation / media
  {
    schema: "blessboard",
    table: "churches",
    columns: [
      "id",
      "organization_id",
      "church_key",
      "display_name",
      "status",
      "data_environment",
      "created_at",
      "updated_at",
    ],
    product: "blessboard",
  },
  {
    schema: "blessboard",
    table: "branches",
    columns: [
      "id",
      "church_id",
      "branch_key",
      "display_name",
      "branch_type",
      "status",
      "is_primary",
      "created_at",
      "updated_at",
    ],
    product: "blessboard",
  },
  {
    schema: "blessboard",
    table: "users",
    columns: [
      "id",
      "email_normalized",
      "email_display",
      "password_hash",
      "status",
      "display_name",
      "created_at",
      "updated_at",
    ],
    statusValues: ["active", "inactive", "suspended", "invited"],
    notes: "password_hash NULL only when status=invited (V7 invitation path).",
    product: "blessboard",
  },
  {
    schema: "blessboard",
    table: "user_invitations",
    columns: [
      "id",
      "organization_id",
      "church_id",
      "branch_id",
      "email_normalized",
      "role_key",
      "token_hash",
      "status",
      "expires_at",
    ],
    statusValues: ["pending", "accepted", "revoked", "expired"],
    dataFormats: { token_hash: "len=64" },
    product: "blessboard",
  },
  {
    schema: "blessboard",
    table: "media_assets",
    columns: ["id", "church_id", "storage_bucket", "storage_key", "mime_type", "sha256", "status"],
    product: "blessboard",
  },

  // ActiveClinic — facility / staff invitation / core org
  {
    schema: "activeclinic",
    table: "healthcare_organizations",
    columns: ["id", "organization_id", "status"],
    product: "activeclinic",
  },
  {
    schema: "activeclinic",
    table: "facilities",
    columns: [
      "id",
      "organization_id",
      "healthcare_organization_id",
      "facility_key",
      "display_name",
      "facility_type",
      "status",
      "country_code",
      "phone_normalized",
      "timezone",
    ],
    product: "activeclinic",
  },
  {
    schema: "activeclinic",
    table: "staff_members",
    columns: ["id", "organization_id", "status"],
    product: "activeclinic",
  },
  {
    schema: "activeclinic",
    table: "staff_invitations",
    columns: [
      "id",
      "organization_id",
      "healthcare_organization_id",
      "staff_member_id",
      "platform_identity_id",
      "status",
      "expires_at",
      "current_token_id",
      "delivery_status",
    ],
    statusValues: ["draft", "pending", "accepted", "expired", "revoked"],
    product: "activeclinic",
  },
]);

/** Shared records where incompatible V8 writes can break V7 readers. */
const SHARED_WRITE_RISKS = Object.freeze([
  {
    relation: "platform.organizations",
    risk: "Changing status/data_environment enums or organization_key format breaks V7 tenancy resolution.",
    mitigation: "Keep V7 CHECK values; add new statuses only after dual-read adapters exist.",
  },
  {
    relation: "platform.identities",
    risk: "Nulling password_hash / changing phone_normalized format breaks AC login and BB-linked identity.",
    mitigation: "Additive verified_* columns OK; never rewrite phone E.164 or email_normalized casing rules.",
  },
  {
    relation: "platform.deployment_sessions",
    risk: "Altering session_token_hash format or expiry semantics invalidates concurrent V7 sessions.",
    mitigation: "Keep sha256 hex-64; new session kinds use new columns or new tables.",
  },
  {
    relation: "platform.website_content",
    risk: "Changing draft_value/published_value JSON shape without adapters breaks V7 website engine.",
    mitigation: "Version content payloads; keep old keys readable; isolate V8-only fields under namespaced keys.",
  },
  {
    relation: "platform.identity_action_tokens",
    risk: "Narrowing purpose CHECK drops V7 activation/reset purposes.",
    mitigation: "APPEND new purpose values only; never remove activeclinic_staff_activation / activeclinic_password_reset while V7 is active.",
  },
  {
    relation: "blessboard.users / user_invitations",
    risk: "Tightening invitation/password consistency breaks BB invite accept.",
    mitigation: "Preserve invited+NULL password_hash rule; hash-only tokens.",
  },
  {
    relation: "activeclinic.staff_invitations",
    risk: "Changing delivery_status / token linkage breaks AC activation.",
    mitigation: "Additive columns only; tokens remain in platform.identity_action_tokens.",
  },
]);

/** SQL patterns that are never allowed in V8 migrations while V7 shares the DB. */
const FORBIDDEN_SQL_PATTERNS = Object.freeze([
  {
    id: "drop_column",
    re: /\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+COLUMN\b/i,
    message: "DROP COLUMN is forbidden while V7 shares the database (no contract phase).",
  },
  {
    id: "rename_column",
    re: /\bRENAME\s+COLUMN\b/i,
    message: "RENAME COLUMN is forbidden while V7 shares the database.",
  },
  {
    id: "rename_table",
    re: /\bALTER\s+TABLE\b[\s\S]*?\bRENAME\s+TO\b/i,
    message: "RENAME TABLE is forbidden while V7 shares the database.",
  },
  {
    id: "drop_table",
    re: /\bDROP\s+TABLE\b(?!\s+IF\s+EXISTS\s+pg_temp)/i,
    message: "DROP TABLE of shared relations is forbidden while V7 is active.",
  },
  {
    id: "drop_type",
    re: /\bDROP\s+TYPE\b/i,
    message: "DROP TYPE / enum removal is forbidden while V7 is active.",
  },
]);

/**
 * @param {string} sql
 * @returns {{ ok: boolean, violations: Array<{ id: string, message: string }> }}
 */
function lintMigrationSqlForV7Compatibility(sql) {
  const text = String(sql || "");
  const violations = [];
  for (const rule of FORBIDDEN_SQL_PATTERNS) {
    if (rule.re.test(text)) {
      violations.push({ id: rule.id, message: rule.message });
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * True when an additive column DDL is V7-safe (nullable or DEFAULT present).
 * @param {string} alterSql
 */
function isAdditiveColumnDdlSafe(alterSql) {
  const text = String(alterSql || "");
  if (!/\bADD\s+COLUMN\b/i.test(text)) return false;
  if (/\bNOT\s+NULL\b/i.test(text) && !/\bDEFAULT\b/i.test(text)) return false;
  return true;
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ schema: string, table: string, columns: string[] }} relation
 */
async function assertRelationColumnsExist(db, relation) {
  const r = await db.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2`,
    [relation.schema, relation.table]
  );
  if (r.rowCount === 0) {
    return {
      ok: false,
      relation: `${relation.schema}.${relation.table}`,
      missing: relation.columns.slice(),
      reason: "table_missing",
    };
  }
  const present = new Set(r.rows.map((row) => row.column_name));
  const missing = relation.columns.filter((c) => !present.has(c));
  return {
    ok: missing.length === 0,
    relation: `${relation.schema}.${relation.table}`,
    missing,
    reason: missing.length ? "columns_missing" : "ok",
  };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 */
async function inspectV7RequiredRelations(db) {
  const results = [];
  for (const relation of V7_REQUIRED_RELATIONS) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await assertRelationColumnsExist(db, relation));
  }
  const failed = results.filter((x) => !x.ok);
  return {
    ok: failed.length === 0,
    checked: results.length,
    failed,
    results,
  };
}

module.exports = {
  COMPAT_PHASE,
  PHASE_RULES,
  V7_REQUIRED_RELATIONS,
  SHARED_WRITE_RISKS,
  FORBIDDEN_SQL_PATTERNS,
  REQUIRED_MIGRATIONS,
  lintMigrationSqlForV7Compatibility,
  isAdditiveColumnDdlSafe,
  assertRelationColumnsExist,
  inspectV7RequiredRelations,
};
