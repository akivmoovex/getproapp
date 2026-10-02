"use strict";

/**
 * V2.04 Website Management feature contract — shared registry for AC + BlessBoard.
 * Product adapters declare routes/markers; platform owns lifecycle/viewport/shared caps.
 */

const { PRODUCT_CODE } = require("./publicWebsiteUrl");

/** @typedef {'PARITY'|'AC_ONLY_BY_DESIGN'|'BB_ONLY_BY_DESIGN'|'BB_GAP'|'AC_GAP'|'PRODUCT_SPECIFIC'|'DEFERRED'} ParityStatus */
/** @typedef {'FULL'|'PARTIAL'|'BROKEN'|'REDIRECT'|'NOT_IMPLEMENTED'|'OFF_HUB'} OptionStatus */

/**
 * Shared platform capabilities (must exist for both products via adapters).
 */
const SHARED_PLATFORM_FEATURES = Object.freeze([
  {
    id: "WM_HUB",
    label: "Website Management Hub",
    category: "shell",
  },
  {
    id: "WM_DRAFT",
    label: "Draft state",
    category: "lifecycle",
  },
  {
    id: "WM_SAVE",
    label: "Save draft",
    category: "lifecycle",
  },
  {
    id: "WM_PREVIEW",
    label: "Preview draft",
    category: "lifecycle",
  },
  {
    id: "WM_PUBLISH",
    label: "Publish",
    category: "lifecycle",
  },
  {
    id: "WM_UNPUBLISH",
    label: "Unpublish",
    category: "lifecycle",
  },
  {
    id: "WM_HISTORY",
    label: "Version history",
    category: "lifecycle",
  },
  {
    id: "WM_VERSION_PREVIEW",
    label: "Old version preview",
    category: "lifecycle",
  },
  {
    id: "WM_RESTORE",
    label: "Restore-as-new",
    category: "lifecycle",
  },
  {
    id: "WM_MEDIA",
    label: "Media library",
    category: "media",
  },
  {
    id: "WM_BRANDING",
    label: "Branding",
    category: "appearance",
  },
  {
    id: "WM_SEO",
    label: "SEO",
    category: "appearance",
  },
  {
    id: "WM_STYLES",
    label: "Styles / theme",
    category: "appearance",
  },
  {
    id: "WM_VIEWPORT",
    label: "Responsive editor viewport",
    category: "editor",
  },
  {
    id: "WM_INLINE",
    label: "Inline editing",
    category: "editor",
  },
  {
    id: "WM_CHANGE_MANAGER",
    label: "Change Manager / unpublished changes",
    category: "editor",
  },
  {
    id: "WM_TENANT_ISOLATION",
    label: "Tenant isolation",
    category: "security",
  },
  {
    id: "WM_RBAC",
    label: "Website RBAC",
    category: "security",
  },
]);

/**
 * ActiveClinic Website Management hub options (canonical staff routes).
 */
const AC_WEBSITE_OPTIONS = Object.freeze([
  {
    featureId: "AC_HUB",
    label: "Overview",
    route: "/app/settings/website",
    template: "views/activeclinic/app/settings-website-content.ejs",
    marker: /data-ac-website-hub|data-ac-page-section="settings-website"/,
    shell: "ac-app",
    status: "FULL",
    sharedFeature: "WM_HUB",
  },
  {
    featureId: "AC_SETTINGS",
    label: "Website Settings",
    route: "/app/settings/website/settings",
    template: "views/activeclinic/app/website-cms-settings.ejs",
    marker: /data-ac-page-section="website-settings"/,
    shell: "ac-mw",
    status: "FULL",
  },
  {
    featureId: "AC_PAGES",
    label: "Pages",
    route: "/app/settings/website/pages",
    template: "views/activeclinic/app/website-cms-pages.ejs",
    marker: /data-ac-page-section="website-pages"/,
    shell: "ac-mw",
    status: "FULL",
  },
  {
    featureId: "AC_SECTIONS",
    label: "Sections",
    route: "/app/settings/website/sections",
    template: "views/activeclinic/app/website-cms-sections.ejs",
    marker: /data-ac-page-section="website-sections"/,
    shell: "ac-mw",
    status: "FULL",
  },
  {
    featureId: "AC_NAVIGATION",
    label: "Navigation",
    route: "/app/settings/website/navigation",
    template: "views/activeclinic/app/website-cms-navigation.ejs",
    marker: /data-ac-page-section="website-navigation"/,
    shell: "ac-mw",
    status: "FULL",
  },
  {
    featureId: "AC_CHROME",
    label: "Header & Footer",
    route: "/app/settings/website/chrome",
    template: "views/activeclinic/app/website-cms-chrome.ejs",
    marker: /data-ac-page-section="website-chrome"/,
    shell: "ac-mw",
    status: "FULL",
  },
  {
    featureId: "AC_BRANDING",
    label: "Brand & Appearance",
    route: "/app/settings/website/branding",
    template: "views/activeclinic/app/website-cms-branding.ejs",
    marker: /data-ac-page-section="website-branding"/,
    shell: "ac-mw",
    status: "FULL",
    sharedFeature: "WM_BRANDING",
  },
  {
    featureId: "AC_MEDIA",
    label: "Media Library",
    route: "/app/settings/website/media",
    template: "views/activeclinic/app/website-cms-media.ejs",
    marker: /data-ac-page-section="website-media"/,
    shell: "ac-mw",
    status: "FULL",
    sharedFeature: "WM_MEDIA",
  },
  {
    featureId: "AC_LIBRARY",
    label: "Content Library",
    route: "/app/settings/website/library",
    template: "views/activeclinic/app/website-cms-library.ejs",
    marker: /data-ac-page-section="website-library"/,
    shell: "ac-mw",
    status: "FULL",
  },
  {
    featureId: "AC_SEO",
    label: "SEO & Social",
    route: "/app/settings/website/seo",
    template: "views/activeclinic/app/website-cms-seo.ejs",
    marker: /data-ac-page-section="website-seo"/,
    shell: "ac-mw",
    status: "FULL",
    sharedFeature: "WM_SEO",
  },
  {
    featureId: "AC_CATALOGUE",
    label: "Public Catalogue",
    route: "/app/settings/website/catalogue",
    template: "views/activeclinic/app/website-cms-catalogue.ejs",
    marker: /data-ac-page-section="website-catalogue"/,
    shell: "ac-mw",
    status: "FULL",
    productSpecific: true,
  },
  {
    featureId: "AC_PUBLISH",
    label: "Publishing",
    route: "/app/settings/website/publish",
    template: "views/activeclinic/app/website-cms-publish.ejs",
    marker: /data-ac-page-section="website-publish"/,
    shell: "ac-mw",
    status: "FULL",
    sharedFeature: "WM_PUBLISH",
  },
]);

/**
 * BlessBoard Website Management options (canonical HQ routes + engine).
 */
const BB_WEBSITE_OPTIONS = Object.freeze([
  {
    featureId: "BB_HUB",
    label: "Website Management Hub",
    route: "/hq/website",
    template: "views/blessboard/v5/hq/website-management.ejs",
    marker: /data-bb-website-management|data-bb-hq-website/,
    shell: "bb-hq",
    status: "FULL",
    sharedFeature: "WM_HUB",
  },
  {
    featureId: "BB_BRANDING",
    label: "Branding",
    route: "/hq/website/branding",
    template: null,
    marker: /data-bb-website|branding|website/,
    shell: "bb-hq",
    status: "FULL",
    sharedFeature: "WM_BRANDING",
    routeRegisteredIn: "src/blessboard/http/churchWebsiteAdminRoutes.js",
  },
  {
    featureId: "BB_SETTINGS",
    label: "Advanced settings",
    route: "/hq/website/advanced",
    template: null,
    marker: /website|settings|advanced/,
    shell: "bb-hq",
    status: "PARTIAL",
    routeRegisteredIn: "src/blessboard/http/websiteWorkflowBatchCAdminRoutes.js",
  },
  {
    featureId: "BB_PUBLISH_REVIEW",
    label: "Publish review",
    route: "/hq/website/publish/review",
    template: null,
    marker: /publish|readiness|review/,
    shell: "bb-hq",
    status: "FULL",
    sharedFeature: "WM_PUBLISH",
  },
  {
    featureId: "BB_HISTORY",
    label: "Version history",
    route: "/c/:organizationKey/website/history",
    template: null,
    marker: /history|version/,
    shell: "bb-hq",
    status: "FULL",
    sharedFeature: "WM_HISTORY",
    // Registered as `${pathPrefix}/website/history` on blessboardWebsiteEditorRoutes.
    routeProbe: "/website/history",
  },
  {
    featureId: "BB_MEDIA",
    label: "Media",
    route: "/hq/content/media",
    template: null,
    marker: /media/,
    shell: "bb-hq",
    status: "FULL",
    sharedFeature: "WM_MEDIA",
  },
  {
    featureId: "BB_CLASSIC_PAGES",
    label: "Classic pages CMS",
    route: "/hq/content",
    template: null,
    marker: /content|pages/,
    shell: "bb-hq",
    status: "FULL",
  },
  {
    featureId: "BB_LEADERSHIP",
    label: "Leadership",
    route: "/hq/content/pages/leadership",
    template: null,
    marker: /leadership/,
    shell: "bb-hq",
    status: "FULL",
    productSpecific: true,
    routeProbe: "pages/:pageKey",
  },
  {
    featureId: "BB_MINISTRIES",
    label: "Ministries",
    route: "/hq/content/pages/ministries",
    template: null,
    marker: /ministr/,
    shell: "bb-hq",
    status: "FULL",
    productSpecific: true,
    routeProbe: "pages/:pageKey",
  },
  {
    featureId: "BB_EVENTS",
    label: "Events",
    route: "/hq/content/pages/events",
    template: null,
    marker: /event/,
    shell: "bb-hq",
    status: "FULL",
    productSpecific: true,
    routeProbe: "pages/:pageKey",
  },
  {
    featureId: "BB_SERMONS",
    label: "Sermons",
    route: "/hq/content/pages/sermons",
    template: null,
    marker: /sermon/,
    shell: "bb-hq",
    status: "FULL",
    productSpecific: true,
    routeProbe: "pages/:pageKey",
  },
  {
    featureId: "BB_GIVING",
    label: "Giving",
    route: "/hq/content/pages/giving",
    template: null,
    marker: /giv/,
    shell: "bb-hq",
    status: "FULL",
    productSpecific: true,
    routeProbe: "pages/:pageKey",
  },
]);

/**
 * Feature-for-feature parity rows (AC capability ↔ BB equivalent).
 */
const FEATURE_PARITY_MATRIX = Object.freeze([
  {
    feature: "Website Hub",
    platformCommon: true,
    ac: "FULL",
    bb: "FULL",
    acRoute: "/app/settings/website",
    bbRoute: "/hq/website",
    parity: "PARITY",
  },
  {
    feature: "General Settings",
    platformCommon: true,
    ac: "FULL",
    bb: "PARTIAL",
    acRoute: "/app/settings/website/settings",
    bbRoute: "/hq/website/advanced",
    parity: "PARITY",
  },
  {
    feature: "Pages",
    platformCommon: true,
    ac: "FULL",
    bb: "PARTIAL",
    acRoute: "/app/settings/website/pages",
    bbRoute: "/hq/content (+ inline editor)",
    parity: "PARITY",
    dataModelDifference: "AC free-form CMS pages; BB classic public_pages + engine fields",
  },
  {
    feature: "Sections",
    platformCommon: true,
    ac: "FULL",
    bb: "PARTIAL",
    acRoute: "/app/settings/website/sections",
    bbRoute: "/hq/content/.../sections + engine add-section",
    parity: "PARITY",
  },
  {
    feature: "Navigation",
    platformCommon: false,
    ac: "FULL",
    bb: "NOT_IMPLEMENTED",
    acRoute: "/app/settings/website/navigation",
    bbRoute: null,
    parity: "AC_ONLY_BY_DESIGN",
    note: "BB nav derives from page titles / templates; dedicated manager not required for V2.04",
  },
  {
    feature: "Header/Footer Chrome",
    platformCommon: false,
    ac: "FULL",
    bb: "NOT_IMPLEMENTED",
    acRoute: "/app/settings/website/chrome",
    bbRoute: null,
    parity: "AC_ONLY_BY_DESIGN",
    note: "BB chrome via inline footer fields + templates",
  },
  {
    feature: "Branding",
    platformCommon: true,
    ac: "FULL",
    bb: "FULL",
    acRoute: "/app/settings/website/branding",
    bbRoute: "/hq/website/branding",
    parity: "PARITY",
  },
  {
    feature: "Media",
    platformCommon: true,
    ac: "FULL",
    bb: "FULL",
    acRoute: "/app/settings/website/media",
    bbRoute: "/hq/content/media + engine media-library",
    parity: "PARITY",
  },
  {
    feature: "Content Library",
    platformCommon: false,
    ac: "FULL",
    bb: "PARTIAL",
    acRoute: "/app/settings/website/library",
    bbRoute: "/hq/content/media (assets reuse; not CMS content items)",
    parity: "PRODUCT_SPECIFIC",
    note: "AC reusable content items; BB media reuse via media library",
  },
  {
    feature: "SEO",
    platformCommon: true,
    ac: "FULL",
    bb: "FULL",
    acRoute: "/app/settings/website/seo",
    bbRoute: "engine /c/:org/website/seo",
    parity: "PARITY",
  },
  {
    feature: "Draft / Preview / Publish / Unpublish / History / Restore",
    platformCommon: true,
    ac: "FULL",
    bb: "FULL",
    acRoute: "engine + /app/settings/website/publish",
    bbRoute: "engine + /hq/website/publish*",
    parity: "PARITY",
  },
  {
    feature: "Responsive Desktop/Tablet/Mobile",
    platformCommon: true,
    ac: "FULL",
    bb: "FULL",
    acRoute: "editorViewportFrame",
    bbRoute: "editorViewportFrame",
    parity: "PARITY",
  },
  {
    feature: "Catalogue (Services/Doctors)",
    platformCommon: false,
    ac: "FULL",
    bb: "N/A",
    acRoute: "/app/settings/website/catalogue",
    bbRoute: null,
    parity: "PRODUCT_SPECIFIC",
  },
  {
    feature: "Leadership / Ministries / Events / Sermons / Giving",
    platformCommon: false,
    ac: "N/A",
    bb: "FULL",
    acRoute: null,
    bbRoute: "/hq/content/pages/{leadership,ministries,events,sermons,giving}",
    parity: "PRODUCT_SPECIFIC",
  },
]);

const LIFECYCLE_STEPS = Object.freeze([
  // V2.04 shared lifecycle
  "DRAFT",
  "SAVE",
  "PREVIEW",
  "PUBLISH",
  "PUBLIC_VERIFY",
  "UNPUBLISH",
  "VERSION_HISTORY",
  "OLD_VERSION_PREVIEW",
  "RESTORE_AS_NEW",
  "REPUBLISH",
  // V2.05 Batch 6 unified PublishWorkflow vocabulary (same engine)
  "EDIT",
  "SAVE_DRAFT",
  "CHANGE_MANAGER",
  "PUBLISH_READINESS",
  "CONFIRM_PUBLISH",
  "LIVE_SITE",
  "HISTORICAL_PREVIEW",
]);

function listSharedPlatformFeatures() {
  return SHARED_PLATFORM_FEATURES.slice();
}

function listAcWebsiteOptions() {
  return AC_WEBSITE_OPTIONS.slice();
}

function listBbWebsiteOptions() {
  return BB_WEBSITE_OPTIONS.slice();
}

function listParityMatrix() {
  return FEATURE_PARITY_MATRIX.slice();
}

function productAdapter(productCode) {
  const code = String(productCode || "").trim();
  if (code === PRODUCT_CODE.ACTIVECLINIC || code === "activeclinic") {
    return {
      product: PRODUCT_CODE.ACTIVECLINIC,
      hubRoute: "/app/settings/website",
      options: listAcWebsiteOptions(),
      catalogueDomain: ["services", "doctors"],
    };
  }
  if (code === PRODUCT_CODE.BLESSBOARD || code === "blessboard") {
    return {
      product: PRODUCT_CODE.BLESSBOARD,
      hubRoute: "/hq/website",
      options: listBbWebsiteOptions(),
      catalogueDomain: ["leadership", "ministries", "events", "sermons", "giving"],
    };
  }
  throw new Error(`unknown_product:${productCode}`);
}

function parityGaps(status) {
  return FEATURE_PARITY_MATRIX.filter((row) => row.parity === status);
}

module.exports = {
  PRODUCT_CODE,
  SHARED_PLATFORM_FEATURES,
  AC_WEBSITE_OPTIONS,
  BB_WEBSITE_OPTIONS,
  FEATURE_PARITY_MATRIX,
  LIFECYCLE_STEPS,
  listSharedPlatformFeatures,
  listAcWebsiteOptions,
  listBbWebsiteOptions,
  listParityMatrix,
  productAdapter,
  parityGaps,
};
