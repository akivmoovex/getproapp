"use strict";

/**
 * Read-only V7 runtime schema capability checks.
 * Detects application/schema drift (for example TENANT_PUBLISH before
 * platform/031) before self-registration can leave tenants half-provisioned.
 * Does not run migrations or mutate data.
 * Hosted testing/production enforcement uses DEPLOYMENT_ENV plus the
 * deployment-profile registry and database identity signals.
 */

const { PUBLISH_POLICY } = require("../website/publishPolicy");
const {
  DEPLOYMENT_PROFILES,
  getDeploymentProfile,
} = require("../config/deploymentProfiles");

const RESULT = Object.freeze({
  OK: "ok",
  INCOMPATIBLE: "schema_incompatible",
  LOOKUP_FAILED: "schema_lookup_failed",
});

const REQUIRED_WEBSITE_PERMISSIONS = Object.freeze([
  "website.view",
  "website.edit",
  "website.publish",
  "website.rollback",
  "website.restore",
]);

const REQUIRED_AC_REGISTRATION_STATUSES = Object.freeze([
  "submitted",
  "provisioning",
  "review_required",
  "active",
  "provision_failed",
]);

const REQUIRED_BB_REGISTRATION_STATUSES = Object.freeze([
  "submitted",
  "provisioning",
  "review_required",
  "active",
  "provision_failed",
]);

const REQUIRED_WEBSITE_TABLES = Object.freeze([
  { schema: "platform", table: "website_instances" },
  { schema: "platform", table: "website_content" },
  { schema: "platform", table: "website_versions" },
]);

const REQUIRED_WEBSITE_VERSION_COLUMNS = Object.freeze([
  "instance_id",
  "version_number",
  "snapshot_json",
  "status",
]);

const REQUIRED_AC_PRODUCT_TABLES = Object.freeze([
  { schema: "activeclinic", table: "healthcare_organizations" },
  { schema: "activeclinic", table: "clinic_registration_applications" },
  { schema: "activeclinic", table: "facilities" },
  { schema: "activeclinic", table: "departments" },
  { schema: "activeclinic", table: "staff_members" },
  { schema: "activeclinic", table: "staff_role_assignments" },
  { schema: "activeclinic", table: "staff_facility_assignments" },
]);

const REQUIRED_MIGRATIONS = Object.freeze([
  { module: "platform", version: "027", filename: "027_website_engine.sql" },
  { module: "platform", version: "029", filename: "029_website_lifecycle_moderation.sql" },
  { module: "platform", version: "031", filename: "031_website_tenant_publish_policy.sql" },
  { module: "blessboard", version: "093", filename: "093_website_engine_permissions.sql" },
  { module: "blessboard", version: "094", filename: "094_website_moderation_permissions.sql" },
  { module: "blessboard", version: "095", filename: "095_website_org_admin_publish.sql" },
  { module: "blessboard", version: "098", filename: "098_church_registration_canonical_lifecycle.sql" },
  { module: "blessboard", version: "099", filename: "099_church_registration_provision_stage.sql" },
  { module: "activeclinic", version: "019", filename: "019_public_website_and_booking.sql" },
  { module: "activeclinic", version: "026", filename: "026_clinic_registration_provisioning.sql" },
  { module: "activeclinic", version: "030", filename: "030_clinic_registration_canonical_lifecycle.sql" },
  { module: "activeclinic", version: "031", filename: "031_clinic_registration_provision_stage.sql" },
  { module: "activeclinic", version: "033", filename: "033_clinic_registration_terms_acceptance.sql" },
  { module: "activeclinic", version: "034", filename: "034_service_website_visibility.sql" },
]);

const CAPABILITY = Object.freeze({
  TENANT_PUBLISH_POLICY: "website_instances.publish_policy.TENANT_PUBLISH",
  AC_CANONICAL_REGISTRATION_STATUSES:
    "activeclinic.clinic_registration_applications.canonical_statuses",
  BB_CANONICAL_REGISTRATION_STATUSES:
    "blessboard.platform_church_registration_applications.canonical_statuses",
  WEBSITE_PERMISSIONS: "blessboard.permissions.website_core",
  ORG_ADMIN_WEBSITE_GRANTS: "activeclinic_organization_admin.website_core",
  WEBSITE_VERSIONING: "platform.website_versions",
  WEBSITE_CONTENT: "platform.website_content",
  AC_PROVISION_STAGE_COLUMNS: "activeclinic.clinic_registration_applications.provision_stage",
  AC_TERMS_ACCEPTANCE_COLUMNS: "activeclinic.clinic_registration_applications.terms_version",
  BB_PROVISION_STAGE_COLUMNS: "blessboard.platform_church_registration_applications.provision_stage",
  AC_PRODUCT_TABLES: "activeclinic.core_product_tables",
  AC_WEBSITE_PUBLISHED: "activeclinic.healthcare_organizations.website_published",
  AC_SERVICE_WEBSITE_VISIBLE: "activeclinic.appointment_service_types.public_website_visible",
  REQUIRED_MIGRATIONS: "platform.schema_migrations.v7_required",
});

function parseCheckValues(definition) {
  const text = String(definition || "");
  const values = [];
  const re = /'([^']+)'/g;
  let match = re.exec(text);
  while (match) {
    values.push(match[1]);
    match = re.exec(text);
  }
  return values;
}

const HOSTED_SCHEMA_ENVS = new Set(["testing", "production"]);

function normalizeSignal(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

function hostedIdentityKeysFromRegistry() {
  const keys = new Set();
  for (const profile of Object.values(DEPLOYMENT_PROFILES || {})) {
    const key = normalizeSignal(profile && profile.expectedIdentityKey);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Fail closed on hosted testing/production runtimes even when DEPLOYMENT_ENV
 * is missing or malformed. Uses the deployment-profile registry and database
 * identity env — not hostname guessing. Local/dev without those signals stays
 * unenforced so unit tests remain usable.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   enforce: boolean,
 *   reason: string,
 *   deploymentEnv: string,
 *   identityEnv: string,
 *   identityKey: string,
 *   deploymentCode: string | null,
 *   expectedDatabaseEnvironment: string | null,
 * }}
 */
function resolveV7RuntimeSchemaEnforcement(env) {
  const source = env || process.env;
  const deploymentEnv = normalizeSignal(source.DEPLOYMENT_ENV);
  const identityEnv = normalizeSignal(
    source.DATABASE_IDENTITY_ENV || source.EXPECTED_DATABASE_ENV
  );
  const identityKey = normalizeSignal(source.DATABASE_IDENTITY_EXPECTED);
  const hostedKeys = hostedIdentityKeysFromRegistry();
  const profile = getDeploymentProfile(source);
  const deploymentCode = profile && profile.deploymentCode ? profile.deploymentCode : null;
  const expectedDatabaseEnvironment = profile
    ? normalizeSignal(profile.expectedDatabaseEnvironment)
    : "";
  const profileDeploymentEnvironment = profile
    ? normalizeSignal(profile.deploymentEnvironment)
    : "";

  const base = {
    deploymentEnv,
    identityEnv,
    identityKey,
    deploymentCode,
    expectedDatabaseEnvironment: expectedDatabaseEnvironment || null,
  };

  if (HOSTED_SCHEMA_ENVS.has(deploymentEnv)) {
    return { enforce: true, reason: "deployment_env", ...base };
  }

  if (hostedKeys.has(identityKey) && HOSTED_SCHEMA_ENVS.has(identityEnv)) {
    return { enforce: true, reason: "database_identity", ...base };
  }

  if (hostedKeys.has(identityKey)) {
    return { enforce: true, reason: "hosted_identity_key", ...base };
  }

  const profileIsCanonicalHostedRuntime =
    Boolean(profile && profile.expectedIdentityKey) ||
    (profile && profile.productSelection === "hostname");
  if (
    profileIsCanonicalHostedRuntime &&
    (HOSTED_SCHEMA_ENVS.has(expectedDatabaseEnvironment) ||
      HOSTED_SCHEMA_ENVS.has(profileDeploymentEnvironment))
  ) {
    return { enforce: true, reason: "deployment_profile", ...base };
  }

  if (
    profile &&
    HOSTED_SCHEMA_ENVS.has(identityEnv) &&
    (HOSTED_SCHEMA_ENVS.has(expectedDatabaseEnvironment) ||
      HOSTED_SCHEMA_ENVS.has(profileDeploymentEnvironment))
  ) {
    return { enforce: true, reason: "database_identity_env_and_profile", ...base };
  }

  return { enforce: false, reason: "local_or_unhosted", ...base };
}

function shouldEnforceV7RuntimeSchemaCompatibility(env) {
  return resolveV7RuntimeSchemaEnforcement(env).enforce === true;
}

function pgCode(err) {
  return err && err.code ? String(err.code) : "query_failed";
}

function checkResult(key, label, ok, extra) {
  return {
    key,
    label,
    ok: ok === true,
    remediation: extra && extra.remediation ? extra.remediation : null,
    detail: extra && extra.detail ? extra.detail : null,
  };
}

async function querySafe(db, sql, params) {
  return db.query(sql, params);
}

async function tableExists(db, schemaName, tableName) {
  const result = await querySafe(
    db,
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2
      LIMIT 1`,
    [schemaName, tableName]
  );
  return Boolean(result.rows && result.rows[0]);
}

async function missingColumns(db, schemaName, tableName, columns) {
  const result = await querySafe(
    db,
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = ANY($3::text[])`,
    [schemaName, tableName, columns.slice()]
  );
  const present = new Set((result.rows || []).map((row) => row.column_name));
  return columns.filter((name) => !present.has(name));
}

async function constraintDefinition(db, schemaName, tableName, constraintName) {
  const result = await querySafe(
    db,
    `SELECT pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1
        AND t.relname = $2
        AND c.conname = $3`,
    [schemaName, tableName, constraintName]
  );
  return result.rows[0] && result.rows[0].def ? String(result.rows[0].def) : "";
}

/**
 * @param {{ query: Function }} db
 */
async function inspectV7RuntimeSchemaCompatibility(db) {
  const capabilities = [];
  const missing = [];
  const checks = [];
  const details = {};

  async function record(key, label, ok, extra) {
    const row = checkResult(key, label, ok, extra);
    checks.push(row);
    if (row.ok) capabilities.push(key);
    else missing.push(key);
    return row;
  }

  try {
    await querySafe(db, `SELECT 1`);
  } catch (err) {
    return {
      ok: false,
      compatible: false,
      code: RESULT.LOOKUP_FAILED,
      capability: CAPABILITY.REQUIRED_MIGRATIONS,
      missing: [CAPABILITY.REQUIRED_MIGRATIONS],
      capabilities: [],
      checks: [
        checkResult(CAPABILITY.REQUIRED_MIGRATIONS, "Database reachable", false, {
          remediation: "Confirm DATABASE_URL and apply pending migrations with db:migrate.",
          detail: pgCode(err),
        }),
      ],
      details: { lookupError: pgCode(err) },
      reason: `lookup_failed:${pgCode(err)}`,
    };
  }

  try {
    const missingTables = [];
    for (const item of REQUIRED_WEBSITE_TABLES) {
      if (!(await tableExists(db, item.schema, item.table))) {
        missingTables.push(`${item.schema}.${item.table}`);
      }
    }
    details.missingWebsiteTables = missingTables;
    await record(
      CAPABILITY.WEBSITE_CONTENT,
      "Website content table",
      !missingTables.includes("platform.website_content"),
      {
        remediation: "Apply db/migrations/platform/027_website_engine.sql",
        detail: missingTables.includes("platform.website_content")
          ? "platform.website_content missing"
          : null,
      }
    );
    const versionCols = missingTables.includes("platform.website_versions")
      ? REQUIRED_WEBSITE_VERSION_COLUMNS.slice()
      : await missingColumns(
          db,
          "platform",
          "website_versions",
          REQUIRED_WEBSITE_VERSION_COLUMNS
        );
    details.missingWebsiteVersionColumns = versionCols;
    await record(
      CAPABILITY.WEBSITE_VERSIONING,
      "Website versioning",
      versionCols.length === 0,
      {
        remediation: "Apply db/migrations/platform/027_website_engine.sql",
        detail: versionCols.length ? `missing columns: ${versionCols.join(",")}` : null,
      }
    );
  } catch (err) {
    details.websiteTableError = pgCode(err);
    await record(CAPABILITY.WEBSITE_CONTENT, "Website content table", false, {
      remediation: "Apply db/migrations/platform/027_website_engine.sql",
      detail: pgCode(err),
    });
    await record(CAPABILITY.WEBSITE_VERSIONING, "Website versioning", false, {
      remediation: "Apply db/migrations/platform/027_website_engine.sql",
      detail: pgCode(err),
    });
  }

  try {
    const def = await constraintDefinition(
      db,
      "platform",
      "website_instances",
      "website_instances_publish_policy_check"
    );
    const policies = parseCheckValues(def);
    details.publishPolicies = policies;
    await record(
      CAPABILITY.TENANT_PUBLISH_POLICY,
      "TENANT_PUBLISH policy",
      policies.includes(PUBLISH_POLICY.TENANT_PUBLISH),
      {
        remediation: "Apply db/migrations/platform/031_website_tenant_publish_policy.sql",
        detail: policies.includes(PUBLISH_POLICY.TENANT_PUBLISH)
          ? null
          : "publish_policy check does not include TENANT_PUBLISH",
      }
    );
  } catch (err) {
    details.publishPolicyError = pgCode(err);
    await record(CAPABILITY.TENANT_PUBLISH_POLICY, "TENANT_PUBLISH policy", false, {
      remediation: "Apply db/migrations/platform/031_website_tenant_publish_policy.sql",
      detail: pgCode(err),
    });
  }

  try {
    const def = await constraintDefinition(
      db,
      "activeclinic",
      "clinic_registration_applications",
      "clinic_registration_applications_status_check"
    );
    const statuses = parseCheckValues(def);
    details.registrationStatuses = statuses;
    const hasCanonical = REQUIRED_AC_REGISTRATION_STATUSES.every((status) =>
      statuses.includes(status)
    );
    await record(
      CAPABILITY.AC_CANONICAL_REGISTRATION_STATUSES,
      "ActiveClinic registration lifecycle",
      hasCanonical,
      {
        remediation:
          "Apply db/migrations/activeclinic/030_clinic_registration_canonical_lifecycle.sql",
        detail: hasCanonical
          ? null
          : `missing statuses: ${REQUIRED_AC_REGISTRATION_STATUSES.filter((s) => !statuses.includes(s)).join(",")}`,
      }
    );
  } catch (err) {
    details.registrationStatusError = pgCode(err);
    await record(
      CAPABILITY.AC_CANONICAL_REGISTRATION_STATUSES,
      "ActiveClinic registration lifecycle",
      false,
      {
        remediation:
          "Apply db/migrations/activeclinic/030_clinic_registration_canonical_lifecycle.sql",
        detail: pgCode(err),
      }
    );
  }

  try {
    const def = await constraintDefinition(
      db,
      "blessboard",
      "platform_church_registration_applications",
      "platform_church_reg_apps_application_status_check"
    );
    const statuses = parseCheckValues(def);
    details.blessboardRegistrationStatuses = statuses;
    const hasCanonical = REQUIRED_BB_REGISTRATION_STATUSES.every((status) =>
      statuses.includes(status)
    );
    await record(
      CAPABILITY.BB_CANONICAL_REGISTRATION_STATUSES,
      "BlessBoard registration lifecycle",
      hasCanonical,
      {
        remediation:
          "Apply db/migrations/blessboard/098_church_registration_canonical_lifecycle.sql",
        detail: hasCanonical
          ? null
          : `missing statuses: ${REQUIRED_BB_REGISTRATION_STATUSES.filter((s) => !statuses.includes(s)).join(",")}`,
      }
    );
  } catch (err) {
    details.blessboardRegistrationStatusError = pgCode(err);
    await record(
      CAPABILITY.BB_CANONICAL_REGISTRATION_STATUSES,
      "BlessBoard registration lifecycle",
      false,
      {
        remediation:
          "Apply db/migrations/blessboard/098_church_registration_canonical_lifecycle.sql",
        detail: pgCode(err),
      }
    );
  }

  try {
    const perms = await querySafe(
      db,
      `SELECT permission_key
         FROM blessboard.permissions
        WHERE permission_key = ANY($1::text[])
          AND is_active = true`,
      [REQUIRED_WEBSITE_PERMISSIONS.slice()]
    );
    const present = new Set((perms.rows || []).map((row) => row.permission_key));
    details.websitePermissions = [...present].sort();
    const missingPerms = REQUIRED_WEBSITE_PERMISSIONS.filter((key) => !present.has(key));
    details.missingWebsitePermissions = missingPerms;
    await record(
      CAPABILITY.WEBSITE_PERMISSIONS,
      "Website RBAC permissions",
      missingPerms.length === 0,
      {
        remediation:
          "Apply db/migrations/blessboard/093_website_engine_permissions.sql and 094_website_moderation_permissions.sql",
        detail: missingPerms.length ? `missing: ${missingPerms.join(",")}` : null,
      }
    );
  } catch (err) {
    details.websitePermissionError = pgCode(err);
    await record(CAPABILITY.WEBSITE_PERMISSIONS, "Website RBAC permissions", false, {
      remediation: "Apply db/migrations/blessboard/093_website_engine_permissions.sql",
      detail: pgCode(err),
    });
  }

  try {
    const grants = await querySafe(
      db,
      `SELECT p.permission_key
         FROM blessboard.roles r
         JOIN blessboard.role_permissions rp ON rp.role_id = r.id
         JOIN blessboard.permissions p ON p.id = rp.permission_id
        WHERE r.role_key = 'activeclinic_organization_admin'
          AND p.permission_key = ANY($1::text[])
          AND p.is_active = true`,
      [REQUIRED_WEBSITE_PERMISSIONS.slice()]
    );
    const present = new Set((grants.rows || []).map((row) => row.permission_key));
    details.orgAdminWebsiteGrants = [...present].sort();
    const missingGrants = REQUIRED_WEBSITE_PERMISSIONS.filter((key) => !present.has(key));
    details.missingOrgAdminWebsiteGrants = missingGrants;
    await record(
      CAPABILITY.ORG_ADMIN_WEBSITE_GRANTS,
      "Organization admin website grants",
      missingGrants.length === 0,
      {
        remediation: "Apply db/migrations/blessboard/095_website_org_admin_publish.sql",
        detail: missingGrants.length ? `missing grants: ${missingGrants.join(",")}` : null,
      }
    );
  } catch (err) {
    details.orgAdminGrantError = pgCode(err);
    await record(
      CAPABILITY.ORG_ADMIN_WEBSITE_GRANTS,
      "Organization admin website grants",
      false,
      {
        remediation: "Apply db/migrations/blessboard/095_website_org_admin_publish.sql",
        detail: pgCode(err),
      }
    );
  }

  try {
    const missingAcCols = await missingColumns(
      db,
      "activeclinic",
      "clinic_registration_applications",
      ["last_provision_stage", "last_provision_error"]
    );
    details.missingAcProvisionColumns = missingAcCols;
    await record(
      CAPABILITY.AC_PROVISION_STAGE_COLUMNS,
      "ActiveClinic provision-stage columns",
      missingAcCols.length === 0,
      {
        remediation:
          "Apply db/migrations/activeclinic/026_clinic_registration_provisioning.sql and 031_clinic_registration_provision_stage.sql",
        detail: missingAcCols.length ? `missing: ${missingAcCols.join(",")}` : null,
      }
    );
  } catch (err) {
    details.acProvisionColumnError = pgCode(err);
    await record(
      CAPABILITY.AC_PROVISION_STAGE_COLUMNS,
      "ActiveClinic provision-stage columns",
      false,
      {
        remediation: "Apply db/migrations/activeclinic/031_clinic_registration_provision_stage.sql",
        detail: pgCode(err),
      }
    );
  }

  try {
    const missingAcTermsCols = await missingColumns(
      db,
      "activeclinic",
      "clinic_registration_applications",
      ["terms_version", "terms_accepted_at", "privacy_version", "privacy_acknowledged_at"]
    );
    details.missingAcTermsAcceptanceColumns = missingAcTermsCols;
    await record(
      CAPABILITY.AC_TERMS_ACCEPTANCE_COLUMNS,
      "ActiveClinic registration Terms acceptance columns",
      missingAcTermsCols.length === 0,
      {
        remediation: "Apply db/migrations/activeclinic/033_clinic_registration_terms_acceptance.sql",
        detail: missingAcTermsCols.length ? `missing: ${missingAcTermsCols.join(",")}` : null,
      }
    );
  } catch (err) {
    details.acTermsAcceptanceColumnError = pgCode(err);
    await record(
      CAPABILITY.AC_TERMS_ACCEPTANCE_COLUMNS,
      "ActiveClinic registration Terms acceptance columns",
      false,
      {
        remediation: "Apply db/migrations/activeclinic/033_clinic_registration_terms_acceptance.sql",
        detail: pgCode(err),
      }
    );
  }

  try {
    const missingBbCols = await missingColumns(
      db,
      "blessboard",
      "platform_church_registration_applications",
      ["last_provision_stage", "provisioning_error_code"]
    );
    details.missingBbProvisionColumns = missingBbCols;
    await record(
      CAPABILITY.BB_PROVISION_STAGE_COLUMNS,
      "BlessBoard provision-stage columns",
      missingBbCols.length === 0,
      {
        remediation:
          "Apply db/migrations/blessboard/027_foundation_schema_and_status.sql and 099_church_registration_provision_stage.sql",
        detail: missingBbCols.length ? `missing: ${missingBbCols.join(",")}` : null,
      }
    );
  } catch (err) {
    details.bbProvisionColumnError = pgCode(err);
    await record(
      CAPABILITY.BB_PROVISION_STAGE_COLUMNS,
      "BlessBoard provision-stage columns",
      false,
      {
        remediation: "Apply db/migrations/blessboard/099_church_registration_provision_stage.sql",
        detail: pgCode(err),
      }
    );
  }

  try {
    const missingAcTables = [];
    for (const item of REQUIRED_AC_PRODUCT_TABLES) {
      if (!(await tableExists(db, item.schema, item.table))) {
        missingAcTables.push(`${item.schema}.${item.table}`);
      }
    }
    details.missingAcProductTables = missingAcTables;
    await record(
      CAPABILITY.AC_PRODUCT_TABLES,
      "ActiveClinic product tables",
      missingAcTables.length === 0,
      {
        remediation: "Apply pending db/migrations/activeclinic/*.sql",
        detail: missingAcTables.length ? `missing: ${missingAcTables.join(",")}` : null,
      }
    );
  } catch (err) {
    details.acProductTableError = pgCode(err);
    await record(CAPABILITY.AC_PRODUCT_TABLES, "ActiveClinic product tables", false, {
      remediation: "Apply pending db/migrations/activeclinic/*.sql",
      detail: pgCode(err),
    });
  }

  try {
    const missingPub = await missingColumns(
      db,
      "activeclinic",
      "healthcare_organizations",
      ["website_published"]
    );
    details.missingWebsitePublishedColumn = missingPub;
    await record(
      CAPABILITY.AC_WEBSITE_PUBLISHED,
      "Clinic website_published column",
      missingPub.length === 0,
      {
        remediation: "Apply db/migrations/activeclinic/019_public_website_and_booking.sql",
        detail: missingPub.length ? "website_published missing" : null,
      }
    );
  } catch (err) {
    details.websitePublishedError = pgCode(err);
    await record(
      CAPABILITY.AC_WEBSITE_PUBLISHED,
      "Clinic website_published column",
      false,
      {
        remediation: "Apply db/migrations/activeclinic/019_public_website_and_booking.sql",
        detail: pgCode(err),
      }
    );
  }

  try {
    const missingVisible = await missingColumns(
      db,
      "activeclinic",
      "appointment_service_types",
      ["public_website_visible"]
    );
    details.missingServiceWebsiteVisibleColumn = missingVisible;
    await record(
      CAPABILITY.AC_SERVICE_WEBSITE_VISIBLE,
      "Service public_website_visible column",
      missingVisible.length === 0,
      {
        remediation: "Apply db/migrations/activeclinic/034_service_website_visibility.sql",
        detail: missingVisible.length ? "public_website_visible missing" : null,
      }
    );
  } catch (err) {
    details.serviceWebsiteVisibleError = pgCode(err);
    await record(
      CAPABILITY.AC_SERVICE_WEBSITE_VISIBLE,
      "Service public_website_visible column",
      false,
      {
        remediation: "Apply db/migrations/activeclinic/034_service_website_visibility.sql",
        detail: pgCode(err),
      }
    );
  }

  try {
    const keys = REQUIRED_MIGRATIONS.map((item) => `${item.module}:${item.version}`);
    const applied = await querySafe(
      db,
      `SELECT module, version
         FROM platform.schema_migrations
        WHERE (module || ':' || version) = ANY($1::text[])`,
      [keys]
    );
    const present = new Set(
      (applied.rows || []).map((row) => `${row.module}:${row.version}`)
    );
    const missingMigrations = REQUIRED_MIGRATIONS.filter(
      (item) => !present.has(`${item.module}:${item.version}`)
    );
    details.missingMigrations = missingMigrations.map((item) => `${item.module}/${item.filename}`);
    await record(
      CAPABILITY.REQUIRED_MIGRATIONS,
      "Required V7 migrations applied",
      missingMigrations.length === 0,
      {
        remediation:
          missingMigrations.length === 0
            ? null
            : `Apply pending migrations, then restart. Missing: ${details.missingMigrations.join(", ")}`,
        detail: missingMigrations.length ? details.missingMigrations.join(",") : null,
      }
    );
  } catch (err) {
    details.migrationLookupError = pgCode(err);
    await record(
      CAPABILITY.REQUIRED_MIGRATIONS,
      "Required V7 migrations applied",
      false,
      {
        remediation:
          "Create platform.schema_migrations by running db:migrate (never from application startup).",
        detail: pgCode(err),
      }
    );
  }

  const compatible = missing.length === 0;
  return {
    ok: compatible,
    compatible,
    code: compatible ? RESULT.OK : RESULT.INCOMPATIBLE,
    capability: missing[0] || null,
    missing,
    capabilities,
    checks,
    details,
    reason: compatible ? null : `missing:${missing.join(",")}`,
  };
}

function presentV7SchemaCompatibilityPublic(report) {
  if (!report) return null;
  return {
    compatible: report.compatible === true,
    code: report.code || null,
    capability: report.capability || null,
    missing: Array.isArray(report.missing) ? report.missing.slice() : [],
    checks: Array.isArray(report.checks)
      ? report.checks.map((row) => ({
          key: row.key,
          label: row.label,
          ok: row.ok === true,
          remediation: row.remediation || null,
        }))
      : [],
  };
}

function schemaCompatibilityHealthz(schema) {
  const publicReport = presentV7SchemaCompatibilityPublic(schema);
  const compatible = !schema || schema.compatible !== false;
  return {
    status: compatible ? 200 : 503,
    schemaCompatible: schema ? schema.compatible === true : null,
    schemaCompatibility: publicReport,
  };
}

function formatV7RuntimeSchemaCompatibilityLog(report) {
  const status = report && report.compatible ? "ok" : "incompatible";
  const missing = ((report && report.missing) || []).join(",") || "none";
  const enforcement =
    report && report.enforcement && report.enforcement.reason
      ? report.enforcement.reason
      : "n/a";
  return (
    `[platform] schemaCompatibility status=${status} code=${(report && report.code) || "unknown"} ` +
    `enforcement=${enforcement} missing=${missing}`
  );
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   exit?: (code: number) => void,
 *   logger?: { log: Function, error: Function },
 * }} [opts]
 */
async function assertV7RuntimeSchemaCompatibilityOrExit(db, opts) {
  const options = opts || {};
  const env = options.env || process.env;
  const exit = typeof options.exit === "function" ? options.exit : (code) => process.exit(code);
  const logger = options.logger || console;
  const enforcement = resolveV7RuntimeSchemaEnforcement(env);
  if (!enforcement.enforce) {
    const skipped = {
      ok: true,
      compatible: true,
      code: "skipped",
      missing: [],
      capabilities: [],
      checks: [],
      details: { skipped: true, enforcement },
      reason: "hosted-runtime-not-detected",
      enforcement,
    };
    logger.log(formatV7RuntimeSchemaCompatibilityLog(skipped) + " (not enforced)");
    return skipped;
  }
  const report = await inspectV7RuntimeSchemaCompatibility(db);
  report.enforcement = enforcement;
  logger.log(formatV7RuntimeSchemaCompatibilityLog(report));
  if (!report.compatible) {
    const pendingHint =
      report.details &&
      Array.isArray(report.details.missingMigrations) &&
      report.details.missingMigrations.length
        ? report.details.missingMigrations.join(", ")
        : (report.missing || []).join(", ") || "required V7 migrations";
    logger.error(
      `[platform] FATAL: V7 runtime schema is incompatible with this application. ` +
        `enforcement=${enforcement.reason} ` +
        `deploymentEnv=${enforcement.deploymentEnv || "unset"} ` +
        `identityKey=${enforcement.identityKey || "unset"} ` +
        `identityEnv=${enforcement.identityEnv || "unset"} ` +
        `deploymentCode=${enforcement.deploymentCode || "unset"} ` +
        `capability=${report.capability || report.reason || "unknown"} ` +
        `missing=${(report.missing || []).join(",") || "none"}. ` +
        `Apply pending migrations (${pendingHint}) to this database, then restart. ` +
        `Do not run migrations from application startup. ` +
        `Refusing to start so clinics are not left website_pending.`
    );
    exit(1);
  }
  return report;
}

/**
 * Block self-registration/provision when hosted schema cannot support V7.
 * Returns null when compatible or not enforced.
 */
async function rejectIfV7SchemaIncompatible(db, env) {
  const enforcement = resolveV7RuntimeSchemaEnforcement(env);
  if (!enforcement.enforce) return null;
  const report = await inspectV7RuntimeSchemaCompatibility(db);
  if (report.compatible) return null;
  return {
    ok: false,
    code: "schema_mismatch",
    capability: report.capability,
    missing: report.missing,
    reason: report.reason,
    enforcement,
    report: presentV7SchemaCompatibilityPublic(report),
  };
}

module.exports = {
  RESULT,
  REQUIRED_WEBSITE_PERMISSIONS,
  REQUIRED_AC_REGISTRATION_STATUSES,
  REQUIRED_BB_REGISTRATION_STATUSES,
  REQUIRED_MIGRATIONS,
  CAPABILITY,
  parseCheckValues,
  resolveV7RuntimeSchemaEnforcement,
  shouldEnforceV7RuntimeSchemaCompatibility,
  inspectV7RuntimeSchemaCompatibility,
  presentV7SchemaCompatibilityPublic,
  schemaCompatibilityHealthz,
  formatV7RuntimeSchemaCompatibilityLog,
  assertV7RuntimeSchemaCompatibilityOrExit,
  rejectIfV7SchemaIncompatible,
};
