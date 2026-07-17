#!/usr/bin/env node
"use strict";

/**
 * Assign a BlessBoard V5 role. DATABASE_URL + identity required.
 */

const { Pool } = require("pg");
const { requireDatabaseUrl, parseDatabaseName } = require("./lib/databaseUrl");
const { sanitizeHostFingerprint } = require("./lib/hostFingerprint");
const { checkDatabaseIdentity } = require("./lib/databaseIdentity");
const {
  assignBlessBoardRole,
  STATUS,
} = require("../../src/blessboard/services/assignBlessBoardRole");

function parseArgs(argv) {
  const out = {
    email: "",
    organizationKey: "",
    role: "",
    churchKey: "",
    branchKey: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    const take = (prefix) => arg.slice(prefix.length);
    if (arg === "--email") out.email = next();
    else if (arg.startsWith("--email=")) out.email = take("--email=");
    else if (arg === "--organization-key") out.organizationKey = next();
    else if (arg.startsWith("--organization-key=")) out.organizationKey = take("--organization-key=");
    else if (arg === "--role") out.role = next();
    else if (arg.startsWith("--role=")) out.role = take("--role=");
    else if (arg === "--church-key") out.churchKey = next();
    else if (arg.startsWith("--church-key=")) out.churchKey = take("--church-key=");
    else if (arg === "--branch-key") out.branchKey = next();
    else if (arg.startsWith("--branch-key=")) out.branchKey = take("--branch-key=");
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = [
    ["email", args.email],
    ["organizationKey", args.organizationKey],
    ["role", args.role],
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
    const identity = await checkDatabaseIdentity(pool, { identityKey: expectedIdentity });
    if (!identity.ok) {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          ok: false,
          status: STATUS.TRANSACTION_ERROR,
          message: "database_identity_required",
          identity_code: identity.code,
          current_database: databaseName || null,
          host_fingerprint: hostFingerprint,
        })
      );
      process.exit(2);
    }

    const result = await assignBlessBoardRole(pool, {
      email: args.email,
      organizationKey: args.organizationKey,
      roleKey: args.role,
      churchKey: args.churchKey || null,
      branchKey: args.branchKey || null,
    });

    const safe = {
      ok: result.ok,
      status: result.status,
      message: result.message,
      roleKey: result.role ? result.role.roleKey : null,
      organizationId: result.role ? result.role.organizationId : null,
      churchId: result.role ? result.role.churchId : null,
      branchId: result.role ? result.role.branchId : null,
      identity_key: identity.row && identity.row.identity_key,
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
  } catch {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ ok: false, status: STATUS.TRANSACTION_ERROR, message: "cli_failure" }));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
