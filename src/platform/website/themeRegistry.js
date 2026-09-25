"use strict";

/**
 * Shared website theme registry (C1 infrastructure).
 * Product-isolated collections — never cross-list BB and AC themes.
 * Visitor gallery / Stitch theme packs are out of scope for C1.
 */

const { PRODUCT_CODE } = require("./publicWebsiteUrl");
const { IMAGE_SLOT_REGISTRY } = require("./imagePlacement");
const {
  BLESSBOARD_SECTION_TYPES,
  ACTIVECLINIC_SECTION_TYPES,
} = require("./sectionRegistry");

const THEME_CONTENT_KEY = "site.theme_id";

const BB_DEFAULT_ID = "bb.default";
const AC_DEFAULT_ID = "ac.default";

function slotMapFromRegistry() {
  const out = {};
  for (const [key, def] of Object.entries(IMAGE_SLOT_REGISTRY)) {
    out[key] = Object.freeze({
      supportsSeparateFraming: def.supportsSeparateFraming === true,
      aspectDesktop: def.aspectDesktop == null ? null : def.aspectDesktop,
      aspectMobile: def.aspectMobile == null ? null : def.aspectMobile,
    });
  }
  return Object.freeze(out);
}

function pagesFromSectionDefs(defs) {
  const pages = new Set();
  for (const def of defs || []) {
    for (const page of def.pages || []) pages.add(page);
  }
  return Object.freeze([...pages]);
}

function sectionTypesFromDefs(defs) {
  return Object.freeze([
    ...new Set((defs || []).map((d) => String(d.type || "").trim()).filter(Boolean)),
  ]);
}

const SHARED_IMAGE_SLOTS = slotMapFromRegistry();

const BLESSBOARD_THEMES = Object.freeze([
  Object.freeze({
    id: BB_DEFAULT_ID,
    productCode: PRODUCT_CODE.BLESSBOARD,
    displayName: "BlessBoard Classic",
    description: "Current BlessBoard church public website appearance.",
    preview: Object.freeze({
      swatchPrimary: "#6c5ce7",
      swatchAccent: "#5341cd",
      label: "Default",
    }),
    engineTemplateId: "blessboard_church",
    isDefault: true,
    cssClass: "gp-website-theme--bb-default",
    pages: Object.freeze([
      "home",
      "about",
      "contact",
      "giving",
      "leadership",
      "ministries",
      "events",
      "sermons",
    ]),
    sectionTypes: sectionTypesFromDefs(BLESSBOARD_SECTION_TYPES),
    imageSlots: SHARED_IMAGE_SLOTS,
    styling: Object.freeze({
      tokenPack: "blessboard-default",
      preservesBrandColorOverrides: true,
    }),
    layout: Object.freeze({
      shell: "blessboard_tenant_public",
    }),
  }),
]);

const ACTIVECLINIC_THEMES = Object.freeze([
  Object.freeze({
    id: AC_DEFAULT_ID,
    productCode: PRODUCT_CODE.ACTIVECLINIC,
    displayName: "ActiveClinic Classic",
    description: "Current ActiveClinic clinic public website appearance.",
    preview: Object.freeze({
      swatchPrimary: "#006068",
      swatchAccent: "#0f766e",
      label: "Default",
    }),
    engineTemplateId: "activeclinic_clinic",
    isDefault: true,
    cssClass: "gp-website-theme--ac-default",
    pages: pagesFromSectionDefs(ACTIVECLINIC_SECTION_TYPES),
    sectionTypes: sectionTypesFromDefs(ACTIVECLINIC_SECTION_TYPES),
    imageSlots: SHARED_IMAGE_SLOTS,
    styling: Object.freeze({
      tokenPack: "activeclinic-default",
      preservesBrandColorOverrides: true,
    }),
    layout: Object.freeze({
      shell: "activeclinic_public_tenant",
    }),
  }),
]);

const ALL_BY_ID = Object.freeze({
  [BB_DEFAULT_ID]: BLESSBOARD_THEMES[0],
  [AC_DEFAULT_ID]: ACTIVECLINIC_THEMES[0],
});

function normalizeProduct(productCode) {
  return String(productCode || "").trim().toLowerCase();
}

function themesForProduct(productCode) {
  const product = normalizeProduct(productCode);
  if (product === PRODUCT_CODE.BLESSBOARD) return BLESSBOARD_THEMES;
  if (product === PRODUCT_CODE.ACTIVECLINIC) return ACTIVECLINIC_THEMES;
  return Object.freeze([]);
}

function defaultThemeIdForProduct(productCode) {
  const product = normalizeProduct(productCode);
  if (product === PRODUCT_CODE.ACTIVECLINIC) return AC_DEFAULT_ID;
  if (product === PRODUCT_CODE.BLESSBOARD) return BB_DEFAULT_ID;
  return null;
}

/**
 * Accept legacy BB publication theme_key "default" as bb.default.
 */
function normalizeThemeId(raw, productCode) {
  const product = normalizeProduct(productCode);
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return defaultThemeIdForProduct(product);
  if (text === "default" && product === PRODUCT_CODE.BLESSBOARD) return BB_DEFAULT_ID;
  return text;
}

function getTheme(themeId, productCode) {
  const product = normalizeProduct(productCode);
  const id = normalizeThemeId(themeId, product);
  const theme = ALL_BY_ID[id] || null;
  if (!theme) return null;
  if (theme.productCode !== product) return null;
  return theme;
}

function listThemesForProduct(productCode) {
  return themesForProduct(productCode).map((t) => ({
    id: t.id,
    displayName: t.displayName,
    description: t.description,
    preview: t.preview,
    isDefault: t.isDefault === true,
    engineTemplateId: t.engineTemplateId,
  }));
}

function enumValuesForProduct(productCode) {
  return themesForProduct(productCode).map((t) => t.id);
}

/**
 * Publication-version theme_key mirror (BB history filter).
 * bb.default keeps legacy key "default" so existing version rows stay filterable.
 */
function publicationThemeKeyFor(themeId, productCode) {
  const theme = getTheme(themeId, productCode);
  if (!theme) {
    const product = normalizeProduct(productCode);
    if (product === PRODUCT_CODE.BLESSBOARD) return "default";
    return defaultThemeIdForProduct(product) || "default";
  }
  if (theme.id === BB_DEFAULT_ID) return "default";
  return theme.id;
}

module.exports = {
  THEME_CONTENT_KEY,
  BB_DEFAULT_ID,
  AC_DEFAULT_ID,
  BLESSBOARD_THEMES,
  ACTIVECLINIC_THEMES,
  themesForProduct,
  defaultThemeIdForProduct,
  normalizeThemeId,
  getTheme,
  listThemesForProduct,
  enumValuesForProduct,
  publicationThemeKeyFor,
};
