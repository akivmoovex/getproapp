"use strict";

/**
 * BlessBoard product-side website availability sync.
 * Invoked by platform lifecycleService via productRuntimeRegistry — platform
 * does not hard-require blessboard settings repositories.
 */

const settingsRepo = require("../repositories/blessBoardSettingsRepository");
const { LIFECYCLE_STATUS } = require("../../platform/website/lifecycleStatus");

function blessBoardWebsiteStatusForLifecycle(lifecycleStatus) {
  if (lifecycleStatus === LIFECYCLE_STATUS.PUBLIC) return "published";
  if (lifecycleStatus === LIFECYCLE_STATUS.SUSPENDED) return "suspended";
  return "draft";
}

/**
 * @param {object} db
 * @param {object} instance — platform website instance
 * @param {string} lifecycleStatus
 */
async function syncBlessBoardWebsiteStatus(db, instance, lifecycleStatus) {
  if (!instance || instance.productCode !== "blessboard") return;
  const church = await db.query(
    `SELECT id FROM blessboard.churches WHERE organization_id = $1 LIMIT 1`,
    [instance.organizationId]
  );
  if (!church.rows[0]) return;
  const existing = await settingsRepo.findChurchSettings(db, church.rows[0].id);
  if (!existing) return;
  const next = blessBoardWebsiteStatusForLifecycle(lifecycleStatus);
  if (String(existing.websiteStatus || "") === next) return;
  await settingsRepo.upsertChurchSettings(db, church.rows[0].id, {
    publicName: existing.publicName,
    denomination: existing.denomination,
    primaryEmail: existing.primaryEmail,
    primaryPhone: existing.primaryPhone,
    defaultTimezone: existing.defaultTimezone,
    defaultCountryCode: existing.defaultCountryCode,
    websiteStatus: next,
  });
}

module.exports = {
  blessBoardWebsiteStatusForLifecycle,
  syncBlessBoardWebsiteStatus,
};
