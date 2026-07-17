#!/usr/bin/env node
"use strict";

/**
 * Create a BlessBoard V5 user. DATABASE_URL + identity required. Password via --password-stdin.
 *
 * Usage:
 *   printf '%s' 'TEMP_PASSWORD' | npm run blessboard:user:create -- \
 *     --email admin@example.org --display-name 'Administrator' --password-stdin
 */

const { Pool } = require("pg");
const { requireDatabaseUrl, parseDatabaseName } = require("./lib/databaseUrl");
const { sanitizeHostFingerprint } = require("./lib/hostFingerprint");
const { checkDatabaseIdentity } = require("./lib/databaseIdentity");
const {
  createBlessBoardUser,
  STATUS,
} = require("../../src/blessboard/services/createBlessBoardUser");

function parseArgs(argv) {
  const out = {
    email: "",
    displayName: "",
    passwordStdin: false,
    password: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    const take = (prefix) => arg.slice(prefix.length);
    if (arg === "--email") out.email = next();
    else if (arg.startsWith("--email=")) out.email = take("--email=");
    else if (arg === "--display-name") out.displayName = next();
    else if (arg.startsWith("--display-name=")) out.displayName = take("--display-name=");
    else if (arg === "--password-stdin") out.passwordStdin = true;
    else if (arg === "--password") out.password = next();
    else if (arg.startsWith("--password=")) out.password = take("--password=");
  }
  return out;
}

function readStdinPassword() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(chunks.join("").replace(/\r?\n$/, "")));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!String(args.email || "").trim() || !String(args.displayName || "").trim()) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        ok: false,
        status: STATUS.INVALID_INPUT,
        message: "missing_required_arguments",
        missing: [
          !String(args.email || "").trim() ? "email" : null,
          !String(args.displayName || "").trim() ? "displayName" : null,
        ].filter(Boolean),
      })
    );
    process.exit(2);
  }

  let password = args.password;
  if (args.passwordStdin) {
    password = await readStdinPassword();
  }
  if (!password) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        ok: false,
        status: STATUS.INVALID_INPUT,
        message: "password_required_via_stdin_or_flag",
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

    const result = await createBlessBoardUser(pool, {
      email: args.email,
      displayName: args.displayName,
      password,
    });

    const safe = {
      ok: result.ok,
      status: result.status,
      message: result.message,
      email: result.user ? result.user.email : null,
      displayName: result.user ? result.user.displayName : null,
      userId: result.user ? result.user.id : null,
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
