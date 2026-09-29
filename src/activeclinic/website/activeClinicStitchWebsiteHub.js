"use strict";

/**
 * V2.04 Batch 6 — ActiveClinic Stitch website management hub (H01–H06).
 *
 * Clinic-customer hub under /app/settings/website*.
 * Not Platform Admin governance.
 * Stitch project: 8888814012921999511.
 */

const STITCH_PROJECT_ID = "8888814012921999511";

/** @type {ReadonlyArray<{ code: string, title: string, stitchDesktopId: string, stitchMobileId: string, route: string, view: string, engines: string[] }>} */
const HUB_SCREENS = Object.freeze([
  {
    code: "H01",
    title: "Website Management Hub",
    stitchDesktopId: "ef46f62dff8041eb8936f76b4194d414",
    stitchMobileId: "427f07c6d9d04726985fad6e424e034e",
    route: "/app/settings/website",
    view: "views/activeclinic/app/settings-website-content.ejs",
    engines: ["websiteManagementPresentation", "cmsService.loadWebsiteHubStats"],
  },
  {
    code: "H02",
    title: "Pages Manager",
    stitchDesktopId: "3b4ffe6c6df14ed38ec3331062176f55",
    stitchMobileId: "9f867d5661b54cf7b107e6e056f1f0b5",
    route: "/app/settings/website/pages",
    view: "views/activeclinic/app/website-cms-pages.ejs",
    engines: ["cms page inventory"],
  },
  {
    code: "H03",
    title: "Brand & Appearance",
    stitchDesktopId: "0711352486e646de80ac3c613fb1a07f",
    stitchMobileId: "604d84f5d4e74c29a146a76ffb923bd1",
    route: "/app/settings/website/branding",
    view: "views/activeclinic/app/website-cms-branding.ejs",
    engines: ["brand.primary_color", "brand.accent_color", "home.logo", "platform media"],
  },
  {
    code: "H04",
    title: "Media Library",
    stitchDesktopId: "ae4c1d1bedca45058fc88ae891e30fc0",
    stitchMobileId: "69eac5b2a50742488afbb7fe2c245476",
    route: "/app/settings/website/media",
    view: "views/activeclinic/app/website-cms-media.ejs",
    engines: ["platform/website/mediaService.registerWebsiteMedia"],
  },
  {
    code: "H05",
    title: "Version History",
    stitchDesktopId: "36ee1df342644e0aa34ba8f8a70cf07a",
    stitchMobileId: "09e4b2af5a344d51baf39e73f89b59db",
    route: "/clinics/:clinicKey/website/history",
    view: "views/activeclinic/tenant/website-history.ejs",
    engines: ["versionService", "renderWebsiteHistory", "restore-as-new"],
  },
  {
    code: "H06",
    title: "Website Settings & Configuration",
    stitchDesktopId: "e6b21c0b3f954f1990ab908b7a0f4a10",
    stitchMobileId: "0ca150c5f7fa47ad8e5400cbe91a9854",
    route: "/app/settings/website/settings",
    view: "views/activeclinic/app/website-cms-settings.ejs",
    engines: ["site.name", "contact.*", "location.hours", "seo", "chrome"],
  },
]);

/**
 * Stitch demo controls with no matching clinic website backend capability.
 * Map to existing semantics where possible; otherwise mark NOT_WIRED (do not invent a second model).
 *
 * @type {ReadonlyArray<{ screen: string, control: string, reason: string }>}
 */
const NOT_WIRED_STITCH_CONTROLS = Object.freeze([
  {
    screen: "H03",
    control: "favicon_app_icon",
    reason: "No favicon field in universal website vocabulary; logo/hero use shared media",
  },
  {
    screen: "H03",
    control: "header_style_mode",
    reason: "Sticky vs docked header modes are Stitch-only; chrome uses show_logo/nav/phone flags",
  },
  {
    screen: "H03",
    control: "booking_gateway_engine",
    reason: "External triage engines (HotDoc/HealthEngine) are not website branding configuration",
  },
  {
    screen: "H03",
    control: "accreditation_badges",
    reason: "No accreditation badge catalogue in the website content model",
  },
  {
    screen: "H06",
    control: "custom_domain",
    reason: "Domain assignment is Platform Admin / infrastructure; public URL is read-only here",
  },
  {
    screen: "H06",
    control: "ssl_certificate",
    reason: "TLS is platform infrastructure, not customer website configuration",
  },
  {
    screen: "H06",
    control: "maintenance_mode",
    reason: "No maintenance-mode flag; publish/unpublish lifecycle covers public availability",
  },
  {
    screen: "H06",
    control: "website_timezone",
    reason: "Timezone lives on organization/facility records, not website content",
  },
  {
    screen: "H06",
    control: "website_language",
    reason: "No multi-language website configuration model",
  },
  {
    screen: "H06",
    control: "analytics_embed",
    reason: "No analytics/pixel configuration in website settings",
  },
]);

const HUB_DESKTOP_MARKERS = Object.freeze(HUB_SCREENS.map((s) => s.code));
const HUB_MOBILE_MARKERS = Object.freeze(HUB_SCREENS.map((s) => `${s.code}-M`));

module.exports = {
  STITCH_PROJECT_ID,
  HUB_SCREENS,
  NOT_WIRED_STITCH_CONTROLS,
  UNWIRED_STITCH_CONTROLS: NOT_WIRED_STITCH_CONTROLS.length,
  HUB_DESKTOP_MARKERS,
  HUB_MOBILE_MARKERS,
  PLATFORM_ADMIN_SEPARATION: true,
  VERSION_ENGINE: "platform/website/versionService + renderWebsiteHistory (restore-as-new)",
  SHARED_MEDIA_ROUTE_FAMILY: "/app/settings/website/media",
};
