"use strict";

/**
 * Testing-only data maintenance eligibility.
 * Restrictive only: never enables outside DEPLOYMENT_ENV=testing.
 * No override flag may make production eligible.
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isTestingDataMaintenanceAllowed(env) {
  const source = env || process.env;
  const dep = String(source.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  return dep === "testing";
}

module.exports = {
  isTestingDataMaintenanceAllowed,
};
