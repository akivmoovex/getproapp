"use strict";

const {
  assertDatabaseTestingIdentity,
  assertRuntimeTestingGate,
  previewTestingDataReset,
} = require("./testingDataResetService");

const STATUS = Object.freeze({
  OK: "ok",
  FORBIDDEN: "forbidden",
  IDENTITY_BLOCKED: "identity_blocked",
  LOOKUP_ERROR: "lookup_error",
});

const INVENTORY = Object.freeze([
  ["platform.organizations", "shared"],
  ["platform.organization_products", "shared"],
  ["platform.organization_subscriptions", "shared"],
  ["platform.user_identities", "shared"],
  ["platform.deployment_sessions", "shared"],
  ["platform.audit_events", "shared"],
  ["platform.schema_migrations", "protected"],
  ["blessboard.churches", "blessboard"],
  ["blessboard.user_role_assignments", "blessboard"],
  ["blessboard.user_invitations", "blessboard"],
  ["blessboard.media_assets", "blessboard"],
  ["activeclinic.clinics", "activeclinic"],
  ["activeclinic.staff_members", "activeclinic"],
  ["activeclinic.patients", "activeclinic"],
]);

function safeError(error) {
  return String((error && error.message) || "database lookup failed")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-db-url]")
    .replace(/(?:password|secret|token)[=:]\S+/gi, "[redacted]")
    .slice(0, 160);
}

async function countTable(db, qualifiedName) {
  const [schema, table] = qualifiedName.split(".");
  const exists = await db.query("SELECT to_regclass($1) IS NOT NULL AS present", [qualifiedName]);
  if (!exists.rows[0] || !exists.rows[0].present) return null;
  const result = await db.query(`SELECT COUNT(*)::int AS count FROM ${schema}.${table}`);
  return Number(result.rows[0] && result.rows[0].count || 0);
}

async function inspectTestDatabase(db, options = {}) {
  const env = options.env || process.env;
  const runtime = assertRuntimeTestingGate(env);
  if (!runtime.ok) return runtime;
  const identity = await assertDatabaseTestingIdentity(db, env);
  if (!identity.ok) return identity;

  try {
    await db.query("SELECT 1 AS connected");
    const inventory = [];
    for (const [table, owner] of INVENTORY) {
      inventory.push({ table, owner, recordCount: await countTable(db, table) });
    }
    const migrations = await db.query(
      `SELECT COUNT(*)::int AS applied_count,
              MAX(applied_at) AS latest_applied_at
         FROM platform.schema_migrations`
    );
    const migrationRow = migrations.rows[0] || {};
    const organizations = await db.query(
      `SELECT COALESCE(data_environment, 'unknown') AS environment,
              COUNT(*)::int AS count
         FROM platform.organizations
        GROUP BY data_environment
        ORDER BY data_environment`
    );
    return {
      ok: true,
      status: STATUS.OK,
      deploymentEnvironment: String(env.DEPLOYMENT_ENV || "").trim().toLowerCase(),
      database: {
        identityKey: identity.identityKey,
        environmentCode: identity.environmentCode,
        hostFingerprint: identity.hostFingerprint || null,
        databaseName: identity.databaseName || null,
        connection: "connected",
      },
      tenantCounts: organizations.rows.map((row) => ({
        environment: String(row.environment),
        count: Number(row.count || 0),
      })),
      inventory,
      migrations: {
        appliedCount: Number(migrationRow.applied_count || 0),
        latestAppliedAt: migrationRow.latest_applied_at || null,
      },
      scopes: [
        "selected_test_tenant",
        "all_blessboard_test_tenants",
        "all_activeclinic_test_tenants",
        "all_application_data",
      ],
      eligibility: {
        eligible: true,
        missingPrerequisites: [],
        destructiveExecution: "disabled_in_phase_2",
      },
    };
  } catch (error) {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "inspection_failed", message: safeError(error) };
  }
}

async function previewTestDatabaseReset(db, options = {}) {
  const scope = String(options.scope || "").trim();
  const allowed = [
    "selected_test_tenant",
    "all_blessboard_test_tenants",
    "all_activeclinic_test_tenants",
    "all_application_data",
  ];
  if (!allowed.includes(scope)) {
    return { ok: false, status: "invalid_input", reason: "scope_not_allowlisted" };
  }
  const model = await inspectTestDatabase(db, options);
  if (!model.ok) return model;
  const preview = await previewTestingDataReset(db, {
    env: options.env || process.env,
    actorUserId: options.actorUserId || "",
    action: "clear_all",
    sessionSecret: options.sessionSecret || "",
  });
  const safePreview = preview.ok
    ? (() => {
        const { previewToken, ...withoutToken } = preview;
        return withoutToken;
      })()
    : {
        blocked: true,
        reason: preview.reason || "preview_unavailable",
      };
  return {
    ...model,
    preview: {
      dryRun: true,
      scope,
      resetServicePreview: safePreview,
      affectedTables: model.inventory.filter((item) => item.owner !== "protected"),
      protectedRecords: model.inventory.filter((item) => item.owner === "protected"),
    },
  };
}

module.exports = {
  STATUS,
  INVENTORY,
  inspectTestDatabase,
  previewTestDatabaseReset,
};
