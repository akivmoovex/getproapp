"use strict";

/**
 * Post-import website engine backfill orchestration (does not duplicate backfill logic).
 */

const { backfillBlessBoardWebsiteVersions } = require("../../platform/website-engine/blessboardBackfillService");
const { backfillActiveClinicWebsites } = require("../../activeclinic/website/backfillActiveClinicWebsites");

async function runPostImportBackfills(targetPool, opts = {}) {
  const result = {
    postImportBackfillRequired: true,
    blessboard: null,
    activeclinic: null,
    dryRun: Boolean(opts.dryRun),
  };

  if (opts.dryRun || !opts.autoBackfill) {
    result.commands = [
      "npm run blessboard:website-engine:backfill",
      "node scripts/activeclinic/backfill-clinic-websites.js --apply",
    ];
    return result;
  }

  result.blessboard = await backfillBlessBoardWebsiteVersions(targetPool, {
    dryRun: false,
    limit: opts.limit || null,
  });

  result.activeclinic = await backfillActiveClinicWebsites(targetPool, {
    dryRun: false,
  });

  return result;
}

module.exports = {
  runPostImportBackfills,
};
