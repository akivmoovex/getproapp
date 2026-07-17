#!/usr/bin/env node
"use strict";

/**
 * Explicit administrative BlessBoard church + HQ branch provisioner.
 * Never runs during startup or migrations. DATABASE_URL only. Never prints secrets.
 *
 * Usage:
 *   DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=… npm run blessboard:church:provision -- \
 *     --organization-key demo-church \
 *     --church-key demo-church \
 *     --display-name "Demo Church" \
 *     --environment testing \
 *     --hq-branch-key hq \
 *     --hq-branch-name "Headquarters"
 */

const { Pool } = require("pg");
const { requireDatabaseUrl, parseDatabaseName } = require("./lib/databaseUrl");
const { sanitizeHostFingerprint } = require("./lib/hostFingerprint");
const { checkDatabaseIdentity } = require("./lib/databaseIdentity");
const {
  provisionBlessBoardChurch,
  STATUS,
} = require("../../src/blessboard/services/provisionBlessBoardChurch");

function parseArgs(argv) {
  const out = {
    organizationKey: "",
    churchKey: "",
    displayName: "",
    legalName: "",
    environment: "",
    hqBranchKey: "",
    hqBranchName: "",
    timezone: "",
    countryCode: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    const take = (prefix) => arg.slice(prefix.length);
    if (arg === "--organization-key") out.organizationKey = next();
    else if (arg.startsWith("--organization-key=")) out.organizationKey = take("--organization-key=");
    else if (arg === "--church-key") out.churchKey = next();
    else if (arg.startsWith("--church-key=")) out.churchKey = take("--church-key=");
    else if (arg === "--display-name") out.displayName = next();
    else if (arg.startsWith("--display-name=")) out.displayName = take("--display-name=");
    else if (arg === "--legal-name") out.legalName = next();
    else if (arg.startsWith("--legal-name=")) out.legalName = take("--legal-name=");
    else if (arg === "--environment") out.environment = next();
    else if (arg.startsWith("--environment=")) out.environment = take("--environment=");
    else if (arg === "--hq-branch-key") out.hqBranchKey = next();
    else if (arg.startsWith("--hq-branch-key=")) out.hqBranchKey = take("--hq-branch-key=");
    else if (arg === "--hq-branch-name") out.hqBranchName = next();
    else if (arg.startsWith("--hq-branch-name=")) out.hqBranchName = take("--hq-branch-name=");
    else if (arg === "--timezone") out.timezone = next();
    else if (arg.startsWith("--timezone=")) out.timezone = take("--timezone=");
    else if (arg === "--country-code") out.countryCode = next();
    else if (arg.startsWith("--country-code=")) out.countryCode = take("--country-code=");
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = [
    ["organizationKey", args.organizationKey],
    ["churchKey", args.churchKey],
    ["displayName", args.displayName],
    ["environment", args.environment],
    ["hqBranchKey", args.hqBranchKey],
    ["hqBranchName", args.hqBranchName],
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

  let connectionString;
  try {
    connectionString = requireDatabaseUrl();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({ ok: false, status: STATUS.TRANSACTION_ERROR, message: err.message })
    );
    process.exit(1);
  }

  const expectedIdentity = String(process.env.DATABASE_IDENTITY_EXPECTED || "").trim();
  if (!expectedIdentity) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        ok: false,
        status: STATUS.TRANSACTION_ERROR,
        message: "DATABASE_IDENTITY_EXPECTED is required",
      })
    );
    process.exit(2);
  }

  const databaseName = parseDatabaseName(connectionString);
  const hostFingerprint = sanitizeHostFingerprint(connectionString);
  const pool = new Pool({ connectionString, max: 2 });

  try {
    const identity = await checkDatabaseIdentity(pool, { identityKey: expectedIdentity });
    if (!identity.ok) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          ok: false,
          status: STATUS.TRANSACTION_ERROR,
          message: "database_identity_required",
          identity_code: identity.code,
          hint: "Set DATABASE_IDENTITY_EXPECTED and ensure platform.database_identity is initialized",
          current_database: databaseName || null,
          host_fingerprint: hostFingerprint,
        })
      );
      process.exit(2);
    }

    const result = await provisionBlessBoardChurch(pool, {
      organizationKey: args.organizationKey,
      churchKey: args.churchKey,
      displayName: args.displayName,
      legalName: args.legalName || null,
      dataEnvironment: args.environment,
      hqBranchKey: args.hqBranchKey,
      hqBranchDisplayName: args.hqBranchName,
      timezone: args.timezone || null,
      countryCode: args.countryCode || null,
    });

    const safe = {
      ok: result.ok,
      status: result.status,
      message: result.message,
      created: result.created,
      organizationKey:
        result.records && result.records.organization ? result.records.organization.key : null,
      churchKey: result.records && result.records.church ? result.records.church.key : null,
      hqBranchKey: result.records && result.records.hqBranch ? result.records.hqBranch.key : null,
      identity_key: identity.row && identity.row.identity_key,
      database_environment: identity.row && identity.row.environment_code,
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
