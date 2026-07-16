"use strict";

/**
 * Shared helpers for audit-log viewer export gating.
 * Does not write audit events.
 */

const { hasEntitlement, getOrganisationPlan } = require("./churchEntitlementService");

/**
 * Safe CSV export permitted for church admins when Growth reports entitlements apply.
 * Platform super-admins gate export separately (always allowed when authenticated as super admin).
 */
async function organisationAllowsAuditExport(pool, organizationId) {
  const plan = await getOrganisationPlan(pool, organizationId);
  return (
    hasEntitlement(plan, "reports.cross_branch") || hasEntitlement(plan, "reports.scheduled")
  );
}

module.exports = {
  organisationAllowsAuditExport,
};
