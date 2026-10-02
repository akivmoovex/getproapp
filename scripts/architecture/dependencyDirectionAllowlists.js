"use strict";

/**
 * V10 architecture dependency-direction allowlists (PC03 / PC15).
 *
 * Shrink these lists over time. New edges must be justified and listed here —
 * silent requires will fail `npm run test:architecture` / PC15 guards.
 */

/** Paths relative to src/platform/ — Class E composition / legacy bridges. */
const PLATFORM_PRODUCT_REQUIRE_ALLOWLIST = Object.freeze([
  "http/v5FoundationServer.js",
  "http/moovexPlatformRuntimeServer.js",
  "http/platformAdminRoutes.js",
  "http/platformWebsiteAdminRoutes.js",
  "http/platformAdminShellLocals.js",
  "http/applySupportContextTenant.js",
  "http/requirePlatformSupportContext.js",
  "http/websiteGovernanceAccess.js",
  "website-engine/blessboardBridge.js",
  "website-engine/blessboardBackfillService.js",
  "website-engine/index.js",
  "website/governanceVersionPreview.js",
  "website/platformAdminWebsitesService.js",
  "website/websiteSettingsHttp.js",
  "services/createScopedTeamMemberService.js",
  "services/platformAdminAccountRecoveryService.js",
  "services/platformAdminTeamService.js",
  "services/platformAdminPublicLinksService.js",
  "services/platformAdminRegistrationAnalyticsService.js",
  "services/platformAdminEntitlements.js",
  "services/listPlatformOrganizations.js",
  "services/listPlatformSubscriptions.js",
  "services/billingSubscriptionService.js",
  "services/authTransferService.js",
  "registration/provisioningRecovery.js",
  "registration/registrationSlugPreview.js",
  "release-notes/releaseNotesService.js",
  "config/v5EnvValidation.js",
  "host.js",
]);

/**
 * Cross-product edges (BB↔AC / AC→church implementation).
 * PC19 target: empty — products must not hard-require each other's implementation.
 * Keys: "sourceRelPath|requiredModuleSubstring"
 */
const CROSS_PRODUCT_REQUIRE_ALLOWLIST = Object.freeze([]);

module.exports = {
  PLATFORM_PRODUCT_REQUIRE_ALLOWLIST,
  CROSS_PRODUCT_REQUIRE_ALLOWLIST,
};
