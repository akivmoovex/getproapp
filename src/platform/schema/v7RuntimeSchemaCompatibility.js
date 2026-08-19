"use strict";

/**
 * Read-only V7 runtime schema capability checks.
 * Detects application/schema drift (for example TENANT_PUBLISH before
 * platform/031). Does not run migrations or mutate data.
 */

const { PUBLISH_POLICY } = require("../website/publishPolicy");

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

const CAPABILITY = Object.freeze({
  TENANT_PUBLISH_POLICY: "website_instances.publish_policy.TENANT_PUBLISH",
  AC_CANONICAL_REGISTRATION_STATUSES: "activeclinic.clinic_registration_applications.canonical_statuses",
  WEBSITE_PERMISSIONS: "blessboard.permissions.website_core",
  ORG_ADMIN_WEBSITE_GRANTS: "activeclinic_organization_admin.website_core",
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

function shouldEnforceV7RuntimeSchemaCompatibility(env) {
  const source = env || process.env;
  const deploymentEnv = String(source.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  return deploymentEnv === "testing" || deploymentEnv === "production";
}

/**
 * @param {{ query: Function }} db
 */
async function inspectV7RuntimeSchemaCompatibility(db) {
  const capabilities = [];
  const missing = [];
  const details = {};

  try {
    const constraint = await db.query(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'platform'
          AND t.relname = 'website_instances'
          AND c.conname = 'website_instances_publish_policy_check'`
    );
    const def = constraint.rows[0] && constraint.rows[0].def;
    const policies = parseCheckValues(def);
    details.publishPolicies = policies;
    if (policies.includes(PUBLISH_POLICY.TENANT_PUBLISH)) {
      capabilities.push(CAPABILITY.TENANT_PUBLISH_POLICY);
    } else {
      missing.push(CAPABILITY.TENANT_PUBLISH_POLICY);
    }
  } catch (err) {
    return {
      ok: false,
      compatible: false,
      code: RESULT.LOOKUP_FAILED,
      capability: CAPABILITY.TENANT_PUBLISH_POLICY,
      missing: [CAPABILITY.TENANT_PUBLISH_POLICY],
      capabilities,
      details,
      reason: err && err.code ? String(err.code) : "publish_policy_constraint_unreadable",
    };
  }

  try {
    const statusConstraint = await db.query(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'activeclinic'
          AND t.relname = 'clinic_registration_applications'
          AND c.conname = 'clinic_registration_applications_status_check'`
    );
    const def = statusConstraint.rows[0] && statusConstraint.rows[0].def;
    const statuses = parseCheckValues(def);
    details.registrationStatuses = statuses;
    const hasCanonical = REQUIRED_AC_REGISTRATION_STATUSES.every((status) =>
      statuses.includes(status)
    );
    if (hasCanonical) {
      capabilities.push(CAPABILITY.AC_CANONICAL_REGISTRATION_STATUSES);
    } else {
      missing.push(CAPABILITY.AC_CANONICAL_REGISTRATION_STATUSES);
    }
  } catch (err) {
    missing.push(CAPABILITY.AC_CANONICAL_REGISTRATION_STATUSES);
    details.registrationStatusError = err && err.code ? String(err.code) : "status_constraint_unreadable";
  }

  try {
    const perms = await db.query(
      `SELECT permission_key
         FROM blessboard.permissions
        WHERE permission_key = ANY($1::text[])
          AND is_active = true`,
      [REQUIRED_WEBSITE_PERMISSIONS]
    );
    const present = new Set(perms.rows.map((row) => row.permission_key));
    details.websitePermissions = [...present].sort();
    const missingPerms = REQUIRED_WEBSITE_PERMISSIONS.filter((key) => !present.has(key));
    if (!missingPerms.length) {
      capabilities.push(CAPABILITY.WEBSITE_PERMISSIONS);
    } else {
      missing.push(CAPABILITY.WEBSITE_PERMISSIONS);
      details.missingWebsitePermissions = missingPerms;
    }
  } catch (err) {
    missing.push(CAPABILITY.WEBSITE_PERMISSIONS);
    details.websitePermissionError = err && err.code ? String(err.code) : "permissions_unreadable";
  }

  try {
    const grants = await db.query(
      `SELECT p.permission_key
         FROM blessboard.roles r
         JOIN blessboard.role_permissions rp ON rp.role_id = r.id
         JOIN blessboard.permissions p ON p.id = rp.permission_id
        WHERE r.role_key = 'activeclinic_organization_admin'
          AND p.permission_key = ANY($1::text[])
          AND p.is_active = true`,
      [REQUIRED_WEBSITE_PERMISSIONS]
    );
    const present = new Set(grants.rows.map((row) => row.permission_key));
    details.orgAdminWebsiteGrants = [...present].sort();
    const missingGrants = REQUIRED_WEBSITE_PERMISSIONS.filter((key) => !present.has(key));
    if (!missingGrants.length) {
      capabilities.push(CAPABILITY.ORG_ADMIN_WEBSITE_GRANTS);
    } else {
      missing.push(CAPABILITY.ORG_ADMIN_WEBSITE_GRANTS);
      details.missingOrgAdminWebsiteGrants = missingGrants;
    }
  } catch (err) {
    missing.push(CAPABILITY.ORG_ADMIN_WEBSITE_GRANTS);
    details.orgAdminGrantError = err && err.code ? String(err.code) : "role_grants_unreadable";
  }

  const compatible = missing.length === 0;
  return {
    ok: compatible,
    compatible,
    code: compatible ? RESULT.OK : RESULT.INCOMPATIBLE,
    capability: missing[0] || null,
    missing,
    capabilities,
    details,
    reason: compatible ? null : `missing:${missing.join(",")}`,
  };
}

function formatV7RuntimeSchemaCompatibilityLog(report) {
  const status = report && report.compatible ? "ok" : "incompatible";
  const missing = ((report && report.missing) || []).join(",") || "none";
  return (
    `[platform] schemaCompatibility status=${status} code=${(report && report.code) || "unknown"} ` +
    `missing=${missing}`
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
  if (!shouldEnforceV7RuntimeSchemaCompatibility(env)) {
    const skipped = {
      ok: true,
      compatible: true,
      code: "skipped",
      missing: [],
      capabilities: [],
      details: { skipped: true },
      reason: "deployment-env-not-enforced",
    };
    logger.log(formatV7RuntimeSchemaCompatibilityLog(skipped) + " (not enforced)");
    return skipped;
  }
  const report = await inspectV7RuntimeSchemaCompatibility(db);
  logger.log(formatV7RuntimeSchemaCompatibilityLog(report));
  if (!report.compatible) {
    logger.error(
      `[platform] FATAL: V7 runtime schema is incompatible with this application. ` +
        `Missing capability: ${report.capability || report.reason || "unknown"}. ` +
        `Apply pending migrations (platform/031, blessboard/095, activeclinic/030) to this database, then restart. ` +
        `Refusing to start so clinics are not left website_pending.`
    );
    exit(1);
  }
  return report;
}

module.exports = {
  RESULT,
  REQUIRED_WEBSITE_PERMISSIONS,
  REQUIRED_AC_REGISTRATION_STATUSES,
  CAPABILITY,
  parseCheckValues,
  shouldEnforceV7RuntimeSchemaCompatibility,
  inspectV7RuntimeSchemaCompatibility,
  formatV7RuntimeSchemaCompatibilityLog,
  assertV7RuntimeSchemaCompatibilityOrExit,
};
