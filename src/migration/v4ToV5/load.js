"use strict";

/**
 * Load interface — dry-run only. Destructive V5 writes are intentionally absent.
 */

function createDryRunLoader(options = {}) {
  const dryRun = options.dryRun !== false;

  return {
    dryRun,

    /**
     * @param {string} entity
     * @param {object} transformed
     */
    async load(entity, transformed) {
      if (!dryRun) {
        return {
          ok: false,
          status: "writes_not_implemented",
          entity,
          message: "Destructive V5 load is not implemented; keep dryRun=true",
        };
      }
      if (!transformed || !transformed.ok) {
        return {
          ok: false,
          status: "quarantined",
          entity,
          quarantine: transformed && transformed.quarantine,
        };
      }
      return {
        ok: true,
        status: "dry_run_accepted",
        entity,
        wouldWrite: transformed.record,
        warnings: transformed.warnings || [],
      };
    },
  };
}

module.exports = {
  createDryRunLoader,
};
