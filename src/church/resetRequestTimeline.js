"use strict";

const resetRequestTimelineRepo = require("../db/pg/church/resetRequestTimelineRepo");

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {string} requestType
 * @param {object} requestRow
 */
async function loadResetTimelineForDetail(pool, requestType, requestRow) {
  if (!requestRow || !requestRow.id || !requestRow.organization_id) {
    return { resetTimeline: [], resetTimelineError: null };
  }
  try {
    const resetTimeline = await resetRequestTimelineRepo.getResetRequestTimeline(pool, {
      request_type: requestType,
      request_id: requestRow.id,
      organization_id: requestRow.organization_id,
      branch_id: requestRow.branch_id ?? null,
      requestRow,
    });
    return { resetTimeline, resetTimelineError: null };
  } catch {
    return {
      resetTimeline: resetRequestTimelineRepo.buildFallbackResetRequestTimeline(requestType, requestRow),
      resetTimelineError: "Audit timeline could not be loaded. Showing system timeline.",
    };
  }
}

module.exports = {
  loadResetTimelineForDetail,
};
