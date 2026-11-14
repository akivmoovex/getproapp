"use strict";

/**
 * Gate for V13 integration suites that would mutate a database.
 * Default: NOT_RUN (does not execute writes). Never silently convert FAIL→PASS.
 */

const { RESULTS } = require("./v13QaStatus");

function dbWritesAuthorized(env = process.env) {
  return (
    String(env.GETPRO_V13_ALLOW_DB_WRITES || "") === "1" &&
    String(env.GETPRO_V13_DB_STAGES_AUTHORIZED || "") === "1"
  );
}

/**
 * @param {import('node:test').TestContext} t
 * @param {string} suiteName
 * @returns {boolean} true when the suite may execute DB writes
 */
function requireDbWriteAuthorization(t, suiteName) {
  if (dbWritesAuthorized()) return true;
  const reason = `${suiteName}: BLOCKED/NOT_RUN — database-writing stages require separate authorization (GETPRO_V13_ALLOW_DB_WRITES=1 + GETPRO_V13_DB_STAGES_AUTHORIZED=1)`;
  t.diagnostic(reason);
  t.diagnostic(`V13_RESULT=${RESULTS.NOT_RUN}`);
  return false;
}

module.exports = {
  dbWritesAuthorized,
  requireDbWriteAuthorization,
};
