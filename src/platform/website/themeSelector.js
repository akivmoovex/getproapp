"use strict";

/**
 * Shared ThemeSelector (V2.05 Batch 3).
 * Presentation families Clarity / Editorial / Community — draft only, no content duplication.
 */

const { PRODUCT_CODE } = require("./publicWebsiteUrl");
const {
  getTheme,
  listSelectableThemesForProduct,
  defaultThemeIdForProduct,
  BB_DEFAULT_ID,
  BB_CONTEMPORARY_FELLOWSHIP_ID,
  BB_COMMUNITY_ID,
  AC_DEFAULT_ID,
  AC_FAMILY_WELLNESS_MINT_ID,
  AC_COMMUNITY_ID,
} = require("./themeRegistry");
const { buildLivePreviewView, LIVE_PREVIEW } = require("./livePreview");

const PRESENTATION_FAMILIES = Object.freeze([
  Object.freeze({
    key: "clarity",
    label: "Clarity",
    description: "Clean classic public-site presentation.",
  }),
  Object.freeze({
    key: "editorial",
    label: "Editorial",
    description: "Modern editorial surfaces and accents.",
  }),
  Object.freeze({
    key: "community",
    label: "Community",
    description: "Warm community-forward presentation.",
  }),
]);

const FAMILY_BY_THEME_ID = Object.freeze({
  [BB_DEFAULT_ID]: "clarity",
  [BB_CONTEMPORARY_FELLOWSHIP_ID]: "editorial",
  [BB_COMMUNITY_ID]: "community",
  [AC_DEFAULT_ID]: "clarity",
  [AC_FAMILY_WELLNESS_MINT_ID]: "editorial",
  [AC_COMMUNITY_ID]: "community",
});

function familyMeta(key) {
  return PRESENTATION_FAMILIES.find((f) => f.key === key) || null;
}

function presentationFamilyForThemeId(themeId) {
  const id = String(themeId || "").trim();
  return FAMILY_BY_THEME_ID[id] || null;
}

function listPresentationThemesForProduct(productCode) {
  return listSelectableThemesForProduct(productCode).map((theme) => {
    const familyKey =
      theme.presentationFamily || presentationFamilyForThemeId(theme.id) || "clarity";
    const family = familyMeta(familyKey);
    return {
      ...theme,
      presentationFamily: familyKey,
      familyLabel: family ? family.label : theme.displayName,
      displayName: family ? family.label : theme.displayName,
      familyDescription: family ? family.description : theme.description,
    };
  });
}

function buildThemeSelectorView(input) {
  const opts = input && typeof input === "object" ? input : {};
  const productCode = String(opts.productCode || "").trim().toLowerCase();
  const themes = listPresentationThemesForProduct(productCode);
  const draftThemeId = String(opts.draftThemeId || defaultThemeIdForProduct(productCode) || "");
  const publishedThemeId = String(
    opts.publishedThemeId || defaultThemeIdForProduct(productCode) || ""
  );
  const stitchScreen =
    productCode === PRODUCT_CODE.ACTIVECLINIC
      ? "AC-WEB-THM-01"
      : productCode === PRODUCT_CODE.BLESSBOARD
        ? "BB-WEB-THM-01"
        : null;
  const draftTheme = getTheme(draftThemeId, productCode);
  const liveTheme = getTheme(publishedThemeId, productCode);
  const draftFamily = presentationFamilyForThemeId(draftThemeId);
  const liveFamily = presentationFamilyForThemeId(publishedThemeId);
  const draftFamilyMeta = familyMeta(draftFamily);
  const liveFamilyMeta = familyMeta(liveFamily);
  return {
    pattern: "ThemeSelector",
    stitchScreen,
    productCode,
    families: PRESENTATION_FAMILIES,
    themes,
    draftThemeId,
    publishedThemeId,
    draftFamily,
    liveFamily,
    draftThemeLabel: draftTheme
      ? (draftFamilyMeta && draftFamilyMeta.label) || draftTheme.displayName
      : "—",
    liveThemeLabel: liveTheme
      ? (liveFamilyMeta && liveFamilyMeta.label) || liveTheme.displayName
      : "—",
    livePreview: buildLivePreviewView({
      stitchScreen,
      previewHref: opts.previewHref || null,
      draftThemeId,
      publishedThemeId,
    }),
    flow: LIVE_PREVIEW.flow,
    contentUnchanged: true,
    presentationOnly: true,
  };
}

module.exports = {
  PRESENTATION_FAMILIES,
  FAMILY_BY_THEME_ID,
  presentationFamilyForThemeId,
  listPresentationThemesForProduct,
  buildThemeSelectorView,
};
