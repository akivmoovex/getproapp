"use strict";

/**
 * ActiveClinic product-side website availability sync.
 * Invoked by platform lifecycleService via productRuntimeRegistry.
 */

const { LIFECYCLE_STATUS } = require("../../platform/website/lifecycleStatus");

/**
 * @param {object} db
 * @param {object} instance — platform website instance
 * @param {string} lifecycleStatus
 */
async function syncActiveClinicAvailabilityFlag(db, instance, lifecycleStatus) {
  if (!instance || instance.productCode !== "activeclinic") return;
  const wantPublic = lifecycleStatus === LIFECYCLE_STATUS.PUBLIC;
  await db.query(
    `UPDATE activeclinic.healthcare_organizations
        SET website_published = $2, updated_at = now()
      WHERE organization_id = $1`,
    [instance.organizationId, wantPublic]
  );
}

module.exports = {
  syncActiveClinicAvailabilityFlag,
};
