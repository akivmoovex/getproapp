"use strict";

/**
 * Product website schemas for the shared V7 website engine.
 * Page types, public routes, and editable surfaces are configuration.
 * Publish / draft / version logic stays in the engine, not in products.
 */

const PRODUCT_CODE = Object.freeze({
  ACTIVECLINIC: "activeclinic",
  BLESSBOARD: "blessboard",
});

const OWNERSHIP_MODEL = Object.freeze({
  SINGLE_TENANT_SITE: "single_tenant_site",
  CHURCH_HQ_AND_BRANCHES: "church_hq_and_branches",
});

const SNAPSHOT_KEY = "cms.snapshot";

const ACTIVECLINIC_PAGES = Object.freeze([
  { key: "home", label: "Home", path: "", mandatory: true },
  { key: "about", label: "About", path: "about", mandatory: true },
  { key: "services", label: "Services", path: "services", mandatory: true },
  { key: "doctors", label: "Doctors", path: "doctors", mandatory: false },
  { key: "pricing", label: "Pricing", path: "pricing", mandatory: false },
  { key: "contact", label: "Contact", path: "contact", mandatory: true },
  { key: "location", label: "Location", path: "location", mandatory: true },
  { key: "book", label: "Book", path: "book", mandatory: true },
]);

const BLESSBOARD_PAGES = Object.freeze([
  { key: "home", label: "Home", path: "", mandatory: true },
  { key: "about", label: "About", path: "about", mandatory: true },
  { key: "leadership", label: "Leadership", path: "leadership", mandatory: false },
  { key: "ministries", label: "Ministries", path: "ministries", mandatory: false },
  { key: "events", label: "Events", path: "events", mandatory: false },
  { key: "sermons", label: "Sermons", path: "sermons", mandatory: false },
  { key: "giving", label: "Giving", path: "giving", mandatory: false },
  { key: "contact", label: "Contact", path: "contact", mandatory: true },
]);

const SCHEMAS = Object.freeze({
  [PRODUCT_CODE.ACTIVECLINIC]: Object.freeze({
    productCode: PRODUCT_CODE.ACTIVECLINIC,
    templateId: "activeclinic_clinic",
    ownershipModel: OWNERSHIP_MODEL.SINGLE_TENANT_SITE,
    publicPrefix: "/clinics",
    settingsPath: "/app/settings/website",
    libraryPath: "/app/settings/website/library",
    brandingPath: "/app/settings/website/branding",
    seoPath: "/app/settings/website/seo",
    navigationPath: "/app/settings/website/navigation",
    pagesPath: "/app/settings/website/pages",
    pages: ACTIVECLINIC_PAGES,
    mandatoryPages: Object.freeze(
      ACTIVECLINIC_PAGES.filter((page) => page.mandatory).map((page) => page.key)
    ),
    contentComponents: Object.freeze([
      "hero",
      "rich_text",
      "image",
      "hours",
      "catalogue",
      "library_item",
    ]),
    snapshotKey: SNAPSHOT_KEY,
  }),
  [PRODUCT_CODE.BLESSBOARD]: Object.freeze({
    productCode: PRODUCT_CODE.BLESSBOARD,
    templateId: "blessboard_church",
    ownershipModel: OWNERSHIP_MODEL.CHURCH_HQ_AND_BRANCHES,
    publicPrefix: "/c",
    settingsPath: "/hq/website/advanced",
    libraryPath: "/hq/content/media",
    brandingPath: "/hq/website/branding",
    seoPath: "/hq/website/advanced",
    navigationPath: "/hq/content",
    pagesPath: "/hq/content",
    pages: BLESSBOARD_PAGES,
    mandatoryPages: Object.freeze(
      BLESSBOARD_PAGES.filter((page) => page.mandatory).map((page) => page.key)
    ),
    contentComponents: Object.freeze([
      "hero",
      "plain_text",
      "image",
      "entity_list",
      "service_times",
    ]),
    snapshotKey: SNAPSHOT_KEY,
    singleSiteWhenBranchCountBelow: 2,
  }),
});

function normalizeProductCode(productCode) {
  return String(productCode || "")
    .trim()
    .toLowerCase();
}

function getProductWebsiteSchema(productCode) {
  return SCHEMAS[normalizeProductCode(productCode)] || null;
}

function listProductWebsiteSchemas() {
  return Object.freeze(Object.values(SCHEMAS));
}

function listProductPageTypes(productCode) {
  const schema = getProductWebsiteSchema(productCode);
  return schema ? schema.pages.slice() : [];
}

function isMandatoryPage(productCode, pageKey) {
  const schema = getProductWebsiteSchema(productCode);
  if (!schema) return false;
  return schema.mandatoryPages.includes(String(pageKey || "").trim());
}

function publicRouteForPage(productCode, pageKey) {
  const schema = getProductWebsiteSchema(productCode);
  if (!schema) return null;
  const key = String(pageKey || "home").trim();
  const page = schema.pages.find((entry) => entry.key === key);
  if (!page) return null;
  return page.path ? `${schema.publicPrefix}/:organizationKey/${page.path}` : `${schema.publicPrefix}/:organizationKey`;
}

module.exports = {
  PRODUCT_CODE,
  OWNERSHIP_MODEL,
  SNAPSHOT_KEY,
  SCHEMAS,
  getProductWebsiteSchema,
  listProductWebsiteSchemas,
  listProductPageTypes,
  isMandatoryPage,
  publicRouteForPage,
};
