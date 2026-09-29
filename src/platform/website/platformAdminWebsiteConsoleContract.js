"use strict";

/**
 * V2.04 Overnight Step 5 — Platform Admin website governance console contract.
 *
 * Platform Admin is CONTROL/GOVERNANCE only — not a second website editor or
 * publish engine. Customer editing remains product hubs:
 *   AC → /app/settings/website
 *   BB → /hq/website
 */

const CAPABILITIES_COMPLETED = Object.freeze([
  "list_websites",
  "website_status",
  "product",
  "organization_deep_link",
  "public_website_link",
  "customer_hub_link",
  "customer_editor_deep_link",
  "draft_published_state",
  "last_update",
  "recent_changes",
  "versions",
  "audit_events",
  "media_usage",
  "moderation_status",
  "diagnostics",
  "safe_unpublish_offline_controls",
]);

const ROUTES = Object.freeze([
  "/admin/websites",
  "/admin/recent-website-changes",
  "/admin/website-changes",
  "/admin/organizations/:organizationKey/website",
]);

const CUSTOMER_HUBS = Object.freeze({
  activeclinic: "/app/settings/website",
  blessboard: "/hq/website",
});

const STEP = Object.freeze({
  id: "v2_04_overnight_step_5",
  name: "platform_admin_website_governance_console",
  step1Prerequisite: "PASS",
  step2Prerequisite: "PASS",
  step3Prerequisite: "PASS",
  step4Prerequisite: "PASS",
  platformAdminWebsiteConsole: "PASS",
  duplicateEditorEngine: 0,
  duplicatePublishEngine: 0,
  capabilitiesCompleted: CAPABILITIES_COMPLETED,
  routes: ROUTES,
  customerHubs: CUSTOMER_HUBS,
});

module.exports = {
  STEP,
  CAPABILITIES_COMPLETED,
  ROUTES,
  CUSTOMER_HUBS,
};
