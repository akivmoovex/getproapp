#!/usr/bin/env node
"use strict";

/**
 * Runs node:test with GETPRO_TEST_DB=1 when TEST_DATABASE_URL is set.
 * Usage:
 *   GETPRO_TEST_DB=1 TEST_DATABASE_URL=postgres://... npm run test:pg:isolated -- tests/company-field-agent-linkage.test.js
 * Or pass file globs as extra args (default: full tests/ suite).
 */

const { spawnSync } = require("child_process");

const extra = process.argv.slice(2);
const args = ["--test", ...(extra.length ? extra : ["tests"])];

const env = { ...process.env };
if (!env.GETPRO_TEST_DB) env.GETPRO_TEST_DB = "1";
if (!String(env.TEST_DATABASE_URL || "").trim()) {
  // eslint-disable-next-line no-console
  console.error("[getpro] test:pg:isolated: set TEST_DATABASE_URL to your dedicated test database.");
  process.exit(1);
}

const r = spawnSync(process.execPath, args, { stdio: "inherit", env });
process.exit(r.status != null ? r.status : 1);
