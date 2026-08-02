"use strict";

/**
 * Read-only foundation verification (schemas, tables, seeds, identity, no legacy public tables).
 */

const { statusReadOnly, discoverMigrations, discoverSeeds } = require("./migrator");
const { checkDatabaseIdentity } = require("./databaseIdentity");

const REQUIRED_SCHEMAS = Object.freeze(["platform", "blessboard", "getpro", "ngo"]);
const REQUIRED_PLATFORM_TABLES = Object.freeze([
  "audit_events",
  "auth_transfers",
  "database_identity",
  "deployment_sessions",
  "deployments",
  "domains",
  "organization_entitlements",
  
  "organization_products",
  "organization_subscriptions",
  "organizations",
  "plan_features",
  "plans",
  "products",
  "schema_migrations",
]);
const REQUIRED_DEPLOYMENTS = Object.freeze([
  "blessboard-com-production",
  "blessboard-org-staging",
]);
const REQUIRED_PRODUCTS = Object.freeze(["blessboard", "getpro", "ngo"]);
const FORBIDDEN_PUBLIC_TABLES = Object.freeze(["tenants", "session"]);
const PRODUCT_SCHEMAS = Object.freeze(["blessboard", "getpro", "ngo"]);

/**
 * Approved base tables per product schema.
 * BlessBoard catalogue + identity/auth tables; getpro/ngo must stay empty.
 *
 * `user_invitations` is canonical V5 auth/identity foundation (migration 032):
 * hash-only staff invites, password set on accept — not a product CMS table.
 */
const APPROVED_PRODUCT_TABLES = Object.freeze({
  blessboard: Object.freeze([
    "announcement_attachments",
    "announcement_audiences",
    "announcement_reads",
    "announcements",
    "attendance_entries",
    "attendance_events",
    "branch_settings",
    "branch_website_governance",
    "branches",
    "cell_memberships",
    "cells",
    "church_settings",
    "churches",
    "class_cohorts",
    "class_enrolments",
    "class_programs",
    "contact_channels",
    "department_memberships",
    "departments",
    "event_registrations",
    "events",
    "form_submissions",
    "forms",
    "giving_categories",
    "giving_entries",
    "giving_methods",
    "journey_contacts",
    "leaders",
    "media_assets",
    "member_branch_memberships",
    "member_journey_handover_events",
    "member_journey_handovers",
    "member_notification_preferences",
    "member_notifications",
    "member_registrations",
    "member_request_status_history",
    "member_requests",
    "members",
    "message_audiences",
    "message_delivery_attempts",
    "messages",
    "ministries",
    "ministry_memberships",
    "organization_growth_trial_offers",
    "organization_onboarding",
    "organization_support_contacts",
    "page_sections",
    "password_reset_rate_limits",
    "pastoral_case_assignments",
    "pastoral_case_events",
    "pastoral_case_notes",
    "pastoral_cases",
    "permissions",
    "platform_church_registration_applications",
    "public_pages",
    "registration_application_communications",
    "registration_duplicate_matches",
    "registration_email_verification_tokens",
    "registration_phone_verification_attempts",
    "resources",
    "role_permissions",
    "roles",
    "sermons",
    "user_action_tokens",
    "user_invitations",
    "user_role_assignment_events",
    "user_role_assignments",
    "user_roles",
    "users",
    "website_approval_settings",
    "website_audit_events",
    "website_change_submission_events",
    "website_change_submissions",
    "website_inline_field_drafts",
    "website_publication_versions",
    "website_scope_settings",
    "website_structured_drafts",
    "welfare_approvals",
    "welfare_cases",
    "welfare_distributions",
    "welfare_requests",
  ]),
  getpro: Object.freeze([]),
  ngo: Object.freeze([]),
});

/**
 * @param {import('pg').Pool} pool
 * @param {{ identityKey?: string }} [opts]
 */
async function verifyFoundation(pool, opts = {}) {
  const failures = [];
  const details = {
    schemas: {},
    platform_tables: [],
    deployments: [],
    products: [],
    public_forbidden: {},
    product_schema_tables: {},
    approved_product_tables: APPROVED_PRODUCT_TABLES,
    migration_status: null,
    identity: null,
  };

  const schemaRows = await pool.query(
    `SELECT schema_name
       FROM information_schema.schemata
      WHERE schema_name = ANY($1::text[])`,
    [REQUIRED_SCHEMAS.slice()]
  );
  const presentSchemas = new Set(schemaRows.rows.map((r) => r.schema_name));
  for (const name of REQUIRED_SCHEMAS) {
    const ok = presentSchemas.has(name);
    details.schemas[name] = ok;
    if (!ok) failures.push(`missing_schema:${name}`);
  }

  const tableRows = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'platform' AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  details.platform_tables = tableRows.rows.map((r) => r.table_name);
  for (const name of REQUIRED_PLATFORM_TABLES) {
    if (!details.platform_tables.includes(name)) {
      failures.push(`missing_platform_table:${name}`);
    }
  }

  const migStatus = await statusReadOnly({ pool });
  details.migration_status = {
    total: migStatus.total,
    applied: migStatus.applied,
    pending: migStatus.pending,
    drift: migStatus.drift,
    ledger_missing: Boolean(migStatus.ledger_missing),
  };
  if (migStatus.ledger_missing) failures.push("schema_migrations_missing");
  if (migStatus.drift > 0) failures.push("checksum_drift");
  if (migStatus.pending > 0) failures.push("migrations_pending");

  const expectedFiles = [...discoverMigrations(), ...discoverSeeds()];
  if (migStatus.applied < expectedFiles.length) {
    failures.push("migration_file_count_mismatch");
  }

  const identity = await checkDatabaseIdentity(pool, { identityKey: opts.identityKey });
  details.identity = identity.ok
    ? {
        ok: true,
        identity_key: identity.row && identity.row.identity_key,
        environment_code: identity.row && identity.row.environment_code,
        database_name: identity.row && identity.row.database_name,
        host_fingerprint: identity.row && identity.row.host_fingerprint,
      }
    : { ok: false, code: identity.code, message: identity.message };
  if (!identity.ok) failures.push(`identity:${identity.code}`);

  try {
    const deployments = await pool.query(
      `SELECT deployment_code FROM platform.deployments ORDER BY deployment_code`
    );
    details.deployments = deployments.rows.map((r) => r.deployment_code);
    for (const code of REQUIRED_DEPLOYMENTS) {
      if (!details.deployments.includes(code)) failures.push(`missing_deployment:${code}`);
    }
    if (details.deployments.length !== REQUIRED_DEPLOYMENTS.length) {
      // allow only the expected two for foundation seeds
      const unexpected = details.deployments.filter((c) => !REQUIRED_DEPLOYMENTS.includes(c));
      if (unexpected.length) failures.push(`unexpected_deployments:${unexpected.join(",")}`);
    }
  } catch (err) {
    failures.push(`deployments_query_failed:${err && err.message ? err.message : String(err)}`);
  }

  try {
    const products = await pool.query(
      `SELECT product_key FROM platform.products ORDER BY product_key`
    );
    details.products = products.rows.map((r) => r.product_key);
    for (const key of REQUIRED_PRODUCTS) {
      if (!details.products.includes(key)) failures.push(`missing_product:${key}`);
    }
  } catch (err) {
    failures.push(`products_query_failed:${err && err.message ? err.message : String(err)}`);
  }

  const publicForbidden = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [FORBIDDEN_PUBLIC_TABLES.slice()]
  );
  for (const name of FORBIDDEN_PUBLIC_TABLES) {
    const present = publicForbidden.rows.some((r) => r.table_name === name);
    details.public_forbidden[name] = present;
    if (present) failures.push(`forbidden_public_table:${name}`);
  }

  for (const schemaName of PRODUCT_SCHEMAS) {
    const allowed = new Set(APPROVED_PRODUCT_TABLES[schemaName] || []);
    const productTables = await pool.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
      [schemaName]
    );
    const present = productTables.rows.map((r) => r.table_name);
    details.product_schema_tables[schemaName] = present;

    for (const name of allowed) {
      if (!present.includes(name)) {
        failures.push(`missing_approved_product_table:${schemaName}.${name}`);
      }
    }
    for (const name of present) {
      if (!allowed.has(name)) {
        failures.push(`unexpected_product_table:${schemaName}.${name}`);
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    details,
  };
}

module.exports = {
  REQUIRED_SCHEMAS,
  REQUIRED_PLATFORM_TABLES,
  REQUIRED_DEPLOYMENTS,
  REQUIRED_PRODUCTS,
  FORBIDDEN_PUBLIC_TABLES,
  PRODUCT_SCHEMAS,
  APPROVED_PRODUCT_TABLES,
  verifyFoundation,
};
