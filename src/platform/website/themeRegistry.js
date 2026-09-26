"use strict";

/**
 * Shared website theme registry (C1 infrastructure + C3 additional themes).
 * Product-isolated collections — never cross-list BB and AC themes.
 */

const { PRODUCT_CODE } = require("./publicWebsiteUrl");
const { IMAGE_SLOT_REGISTRY } = require("./imagePlacement");
const {
  BLESSBOARD_SECTION_TYPES,
  ACTIVECLINIC_SECTION_TYPES,
} = require("./sectionRegistry");

const THEME_CONTENT_KEY = "site.theme_id";

const BB_DEFAULT_ID = "bb.default";
const BB_CONTEMPORARY_FELLOWSHIP_ID = "bb.contemporary-fellowship";
const AC_DEFAULT_ID = "ac.default";
const AC_FAMILY_WELLNESS_MINT_ID = "ac.family-wellness-mint";

function slotMapFromRegistry(overrides) {
  const out = {};
  for (const [key, def] of Object.entries(IMAGE_SLOT_REGISTRY)) {
    const over = overrides && overrides[key] ? overrides[key] : null;
    out[key] = Object.freeze({
      supportsSeparateFraming: def.supportsSeparateFraming === true,
      aspectDesktop:
        over && over.aspectDesktop != null
          ? over.aspectDesktop
          : def.aspectDesktop == null
            ? null
            : def.aspectDesktop,
      aspectMobile:
        over && over.aspectMobile != null
          ? over.aspectMobile
          : def.aspectMobile == null
            ? null
            : def.aspectMobile,
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
const BB_CONTEMPORARY_IMAGE_SLOTS = slotMapFromRegistry({
  "home.hero.image": Object.freeze({
    aspectDesktop: "21 / 9",
    aspectMobile: "16 / 10",
  }),
});
const AC_MINT_IMAGE_SLOTS = slotMapFromRegistry({
  "home.hero.image": Object.freeze({
    aspectDesktop: "16 / 10",
    aspectMobile: "4 / 3",
  }),
});

const BB_PAGES = Object.freeze([
  "home",
  "about",
  "contact",
  "giving",
  "leadership",
  "ministries",
  "events",
  "sermons",
]);

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
    hasWorkingRenderer: true,
    cssClass: "gp-website-theme--bb-default",
    stylesheetHref: null,
    pages: BB_PAGES,
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
  Object.freeze({
    id: BB_CONTEMPORARY_FELLOWSHIP_ID,
    productCode: PRODUCT_CODE.BLESSBOARD,
    displayName: "Contemporary Fellowship",
    description: "Modern dark sanctuary with cyan accents and an ultra-wide hero.",
    preview: Object.freeze({
      swatchPrimary: "#06b6d4",
      swatchAccent: "#0f172a",
      label: "Contemporary",
    }),
    engineTemplateId: "blessboard_church",
    isDefault: false,
    hasWorkingRenderer: true,
    cssClass: "gp-website-theme--bb-contemporary-fellowship",
    stylesheetHref:
      "/blessboard/v5/website-theme-contemporary-fellowship.css?v=v2-theme-c3-1",
    pages: BB_PAGES,
    sectionTypes: sectionTypesFromDefs(BLESSBOARD_SECTION_TYPES),
    imageSlots: BB_CONTEMPORARY_IMAGE_SLOTS,
    styling: Object.freeze({
      tokenPack: "blessboard-contemporary-fellowship",
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
    hasWorkingRenderer: true,
    cssClass: "gp-website-theme--ac-default",
    stylesheetHref: null,
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
  Object.freeze({
    id: AC_FAMILY_WELLNESS_MINT_ID,
    productCode: PRODUCT_CODE.ACTIVECLINIC,
    displayName: "Family Wellness Mint",
    description: "Soft mint family-care surfaces with gentle green accents.",
    preview: Object.freeze({
      swatchPrimary: "#006c4a",
      swatchAccent: "#68dba9",
      label: "Wellness",
    }),
    engineTemplateId: "activeclinic_clinic",
    isDefault: false,
    hasWorkingRenderer: true,
    cssClass: "gp-website-theme--ac-family-wellness-mint",
    stylesheetHref:
      "/activeclinic/website-theme-family-wellness-mint.css?v=v2-theme-c3-1",
    pages: pagesFromSectionDefs(ACTIVECLINIC_SECTION_TYPES),
    sectionTypes: sectionTypesFromDefs(ACTIVECLINIC_SECTION_TYPES),
    imageSlots: AC_MINT_IMAGE_SLOTS,
    styling: Object.freeze({
      tokenPack: "activeclinic-family-wellness-mint",
      preservesBrandColorOverrides: true,
    }),
    layout: Object.freeze({
      shell: "activeclinic_public_tenant",
    }),
  }),
]);

const ALL_BY_ID = Object.freeze(
  Object.fromEntries(
    [...BLESSBOARD_THEMES, ...ACTIVECLINIC_THEMES].map((theme) => [theme.id, theme])
  )
);

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
    hasWorkingRenderer: t.hasWorkingRenderer === true,
    stylesheetHref: t.stylesheetHref || null,
  }));
}

/**
 * Gallery cards — only product themes with an implemented public renderer.
 */
function listSelectableThemesForProduct(productCode) {
  return listThemesForProduct(productCode).filter((t) => t.hasWorkingRenderer === true);
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
  BB_CONTEMPORARY_FELLOWSHIP_ID,
  AC_DEFAULT_ID,
  AC_FAMILY_WELLNESS_MINT_ID,
  BLESSBOARD_THEMES,
  ACTIVECLINIC_THEMES,
  themesForProduct,
  defaultThemeIdForProduct,
  normalizeThemeId,
  getTheme,
  listThemesForProduct,
  listSelectableThemesForProduct,
  enumValuesForProduct,
  publicationThemeKeyFor,
};
