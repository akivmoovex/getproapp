"use strict";

/**
 * V2.04 Batch 6–7 — ActiveClinic Stitch website management hub (H01–H06).
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
 * Batch 7 control audit for Stitch H03/H06 demo controls.
 * disposition: WIRE_EXISTING | FUTURE_CAPABILITY | BLOCKER
 *
 * @type {ReadonlyArray<{ screen: string, control: string, disposition: string, reason: string }>}
 */
const H03_H06_CONTROL_AUDIT = Object.freeze([
  {
    screen: "H03",
    control: "logo_brand_colors",
    disposition: "WIRE_EXISTING",
    reason: "Logo + brand.primary_color / accent via branding page + shared media",
  },
  {
    screen: "H03",
    control: "favicon_app_icon",
    disposition: "FUTURE_CAPABILITY",
    reason: "No favicon field in universal website vocabulary; logo media covers brand mark",
  },
  {
    screen: "H03",
    control: "header_style_mode",
    disposition: "PRESENTATION_ONLY",
    reason: "Sticky vs docked chrome is CSS presentation; show_logo/nav/phone flags remain WIRE_EXISTING on Header & Footer",
  },
  {
    screen: "H03",
    control: "header_visibility_flags",
    disposition: "WIRE_EXISTING",
    reason: "/app/settings/website/chrome — show logo, nav, phone",
  },
  {
    screen: "H03",
    control: "booking_gateway_engine",
    disposition: "FUTURE_CAPABILITY",
    reason: "External triage engines (HotDoc/HealthEngine) are not website branding configuration",
  },
  {
    screen: "H03",
    control: "accreditation_badges",
    disposition: "FUTURE_CAPABILITY",
    reason: "No accreditation badge catalogue in the website content model",
  },
  {
    screen: "H06",
    control: "site_identity_contact_hours",
    disposition: "WIRE_EXISTING",
    reason: "site.name, contact.phone/email, location.hours on settings form",
  },
  {
    screen: "H06",
    control: "public_url_readonly",
    disposition: "WIRE_EXISTING",
    reason: "Public URL displayed read-only from platform assignment",
  },
  {
    screen: "H06",
    control: "publish_status",
    disposition: "WIRE_EXISTING",
    reason: "Website status + publish/unpublish lifecycle (not a separate maintenance flag)",
  },
  {
    screen: "H06",
    control: "custom_domain",
    disposition: "FUTURE_CAPABILITY",
    reason: "Domain assignment is Platform Admin / infrastructure",
  },
  {
    screen: "H06",
    control: "ssl_certificate",
    disposition: "FUTURE_CAPABILITY",
    reason: "TLS is platform infrastructure, not customer website configuration",
  },
  {
    screen: "H06",
    control: "maintenance_mode",
    disposition: "FUTURE_CAPABILITY",
    reason: "No maintenance-mode flag; publish/unpublish covers public availability",
  },
  {
    screen: "H06",
    control: "website_timezone",
    disposition: "FUTURE_CAPABILITY",
    reason: "Timezone lives on organization/facility records, not website content",
  },
  {
    screen: "H06",
    control: "website_language",
    disposition: "FUTURE_CAPABILITY",
    reason: "No multi-language website configuration model",
  },
  {
    screen: "H06",
    control: "analytics_embed",
    disposition: "FUTURE_CAPABILITY",
    reason: "No analytics/pixel configuration in website settings",
  },
]);

/** @deprecated Prefer H03_H06_CONTROL_AUDIT FUTURE_CAPABILITY entries — kept for Batch 6 test compatibility. */
const NOT_WIRED_STITCH_CONTROLS = Object.freeze(
  H03_H06_CONTROL_AUDIT.filter((row) => row.disposition === "FUTURE_CAPABILITY").map((row) => ({
    screen: row.screen,
    control: row.control,
    reason: row.reason,
  }))
);

const HUB_DESKTOP_MARKERS = Object.freeze(HUB_SCREENS.map((s) => s.code));
const HUB_MOBILE_MARKERS = Object.freeze(HUB_SCREENS.map((s) => `${s.code}-M`));

const H03_H06_WIRED = H03_H06_CONTROL_AUDIT.filter((r) => r.disposition === "WIRE_EXISTING").length;
const H03_H06_PRESENTATION_ONLY = H03_H06_CONTROL_AUDIT.filter(
  (r) => r.disposition === "PRESENTATION_ONLY"
).length;
const H03_H06_FUTURE = H03_H06_CONTROL_AUDIT.filter((r) => r.disposition === "FUTURE_CAPABILITY").length;
const H03_H06_BLOCKERS = H03_H06_CONTROL_AUDIT.filter((r) => r.disposition === "BLOCKER").length;

module.exports = {
  STITCH_PROJECT_ID,
  HUB_SCREENS,
  H03_H06_CONTROL_AUDIT,
  NOT_WIRED_STITCH_CONTROLS,
  UNWIRED_STITCH_CONTROLS: NOT_WIRED_STITCH_CONTROLS.length,
  H03_H06_WIRED,
  H03_H06_PRESENTATION_ONLY,
  H03_H06_FUTURE,
  H03_H06_BLOCKERS,
  HUB_DESKTOP_MARKERS,
  HUB_MOBILE_MARKERS,
  PLATFORM_ADMIN_SEPARATION: true,
  VERSION_ENGINE: "platform/website/versionService + renderWebsiteHistory (restore-as-new)",
  SHARED_MEDIA_ROUTE_FAMILY: "/app/settings/website/media",
};
