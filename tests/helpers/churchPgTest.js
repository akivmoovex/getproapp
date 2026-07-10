"use strict";

/**
 * Shared PostgreSQL availability helper for church integration tests.
 *
 * Distinguishes:
 * 1) not configured → skip
 * 2) configured but unreachable → infrastructure failure (throw)
 * 3) available → return pool
 */

const { isPgConfigured, getPgPool, isGetproTestDbIntent } = require("../../src/db/pg/pool");

function churchPgNotConfiguredMessage() {
  if (isGetproTestDbIntent()) {
    return "PostgreSQL test database not configured (set TEST_DATABASE_URL with NODE_ENV=test or GETPRO_TEST_DB=1)";
  }
  return "PostgreSQL not configured";
}

/**
 * Options for node:test `{ skip: ... }` when the suite requires Postgres.
 * @returns {{ skip: boolean | string }}
 */
function churchPgSkipIfUnconfigured() {
  if (isPgConfigured()) return { skip: false };
  return { skip: churchPgNotConfiguredMessage() };
}

/**
 * Probe connectivity. Skip only when unconfigured; throw when configured but unreachable.
 * @param {import('node:test').TestContext} t
 * @returns {Promise<import('pg').Pool | null>}
 */
async function requireChurchPgOrSkip(t) {
  if (!isPgConfigured()) {
    t.skip(churchPgNotConfiguredMessage());
    return null;
  }
  const pool = getPgPool();
  try {
    await pool.query("SELECT 1");
    return pool;
  } catch (e) {
    const code = e && e.code ? String(e.code) : "unknown";
    const msg = e && e.message ? String(e.message).slice(0, 120) : "unreachable";
    throw new Error(
      `PostgreSQL test database is configured but unreachable (${code}: ${msg}). This is an infrastructure failure, not a skipped test.`
    );
  }
}

module.exports = {
  churchPgSkipIfUnconfigured,
  requireChurchPgOrSkip,
  churchPgNotConfiguredMessage,
};
