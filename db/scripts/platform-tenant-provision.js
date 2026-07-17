#!/usr/bin/env node
"use strict";

/**
 * Explicit administrative platform tenant catalogue provisioner.
 * Never runs during startup or migrations. DATABASE_URL only. Never prints secrets.
 *
 * Usage:
 *   DATABASE_URL=… npm run platform:tenant:provision -- \
 *     --organization-key demo-church \
 *     --display-name "Demo Church" \
 *     --environment testing \
 *     --product blessboard \
 *     --tenant-key demo-church \
 *     --hostname demo.blessboard.test \
 *     --domain-type canonical \
 *     --deployment blessboard-org-v5
 */

const { Pool } = require("pg");
const { requireDatabaseUrl, parseDatabaseName } = require("./lib/databaseUrl");
const { sanitizeHostFingerprint } = require("./lib/hostFingerprint");
const {
  provisionPlatformTenant,
  STATUS,
} = require("../../src/platform/services/provisionPlatformTenant");

function parseArgs(argv) {
  const out = {
    organizationKey: "",
    displayName: "",
    legalName: "",
    environment: "",
    product: "",
    tenantKey: "",
    hostname: "",
    domainType: "",
    deployment: "",
    primary: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    const take = (prefix) => arg.slice(prefix.length);
    if (arg === "--organization-key") out.organizationKey = next();
    else if (arg.startsWith("--organization-key=")) out.organizationKey = take("--organization-key=");
    else if (arg === "--display-name") out.displayName = next();
    else if (arg.startsWith("--display-name=")) out.displayName = take("--display-name=");
    else if (arg === "--legal-name") out.legalName = next();
    else if (arg.startsWith("--legal-name=")) out.legalName = take("--legal-name=");
    else if (arg === "--environment") out.environment = next();
    else if (arg.startsWith("--environment=")) out.environment = take("--environment=");
    else if (arg === "--product") out.product = next();
    else if (arg.startsWith("--product=")) out.product = take("--product=");
    else if (arg === "--tenant-key") out.tenantKey = next();
    else if (arg.startsWith("--tenant-key=")) out.tenantKey = take("--tenant-key=");
    else if (arg === "--hostname") out.hostname = next();
    else if (arg.startsWith("--hostname=")) out.hostname = take("--hostname=");
    else if (arg === "--domain-type") out.domainType = next();
    else if (arg.startsWith("--domain-type=")) out.domainType = take("--domain-type=");
    else if (arg === "--deployment") out.deployment = next();
    else if (arg.startsWith("--deployment=")) out.deployment = take("--deployment=");
    else if (arg === "--primary") out.primary = next();
    else if (arg.startsWith("--primary=")) out.primary = take("--primary=");
  }
  return out;
}

function parsePrimary(raw) {
  if (raw === undefined || raw === "") return true;
  const v = String(raw).trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return null;
}

/**
 * Lightweight identity presence check (does not print secrets).
 * @param {import('pg').Pool} pool
 */
async function requireDatabaseIdentityPresent(pool) {
  const table = await pool.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = 'platform' AND table_name = 'database_identity'`
  );
  if (table.rowCount === 0) {
    return { ok: false, reason: "missing_table" };
  }
  const row = await pool.query(`SELECT environment_code FROM platform.database_identity WHERE id = 1`);
  if (row.rowCount === 0) {
    return { ok: false, reason: "missing_row" };
  }
  return { ok: true, environmentCode: row.rows[0].environment_code };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = [
    ["organizationKey", args.organizationKey],
    ["displayName", args.displayName],
    ["environment", args.environment],
    ["product", args.product],
    ["tenantKey", args.tenantKey],
    ["hostname", args.hostname],
    ["domainType", args.domainType],
    ["deployment", args.deployment],
  ];
  const missing = required.filter(([, v]) => !String(v || "").trim()).map(([k]) => k);
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        ok: false,
        status: STATUS.INVALID_INPUT,
        message: "missing_required_arguments",
        missing,
      })
    );
    process.exit(2);
  }

  const primary = parsePrimary(args.primary);
  if (primary === null) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        ok: false,
        status: STATUS.INVALID_INPUT,
        message: "invalid_primary",
      })
    );
    process.exit(2);
  }

  let connectionString;
  try {
    connectionString = requireDatabaseUrl();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ ok: false, status: STATUS.TRANSACTION_ERROR, message: err.message }));
    process.exit(1);
  }

  const databaseName = parseDatabaseName(connectionString);
  const hostFingerprint = sanitizeHostFingerprint(connectionString);
  const pool = new Pool({ connectionString, max: 2 });

  try {
    const identity = await requireDatabaseIdentityPresent(pool);
    if (!identity.ok) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          ok: false,
          status: STATUS.TRANSACTION_ERROR,
          message: "database_identity_required",
          hint: "Run npm run db:identity:init -- --env <code> --confirm",
          current_database: databaseName || null,
          host_fingerprint: hostFingerprint,
        })
      );
      process.exit(2);
    }

    const result = await provisionPlatformTenant(pool, {
      organizationKey: args.organizationKey,
      displayName: args.displayName,
      legalName: args.legalName || null,
      dataEnvironment: args.environment,
      productKey: args.product,
      productTenantKey: args.tenantKey,
      hostname: args.hostname,
      domainType: args.domainType,
      deploymentCode: args.deployment,
      isPrimary: primary,
    });

    const safe = {
      ok: result.ok,
      status: result.status,
      message: result.message,
      created: result.created,
      organizationKey: result.records && result.records.organization ? result.records.organization.key : null,
      hostname: result.records && result.records.domain ? result.records.domain.hostname : null,
      deploymentCode: result.records && result.records.domain ? result.records.domain.deploymentCode : null,
      productKey: result.records && result.records.product ? result.records.product.key : null,
      database_environment: identity.environmentCode,
      current_database: databaseName || null,
      host_fingerprint: hostFingerprint,
    };

    if (result.ok) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(safe, null, 2));
      process.exit(0);
    }
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(safe, null, 2));
    process.exit(2);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        ok: false,
        status: STATUS.TRANSACTION_ERROR,
        message: "cli_failure",
      })
    );
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
