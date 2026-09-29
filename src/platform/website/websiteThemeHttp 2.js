"use strict";

/**
 * Shared JSON helpers + gallery presentation for website theme draft selection.
 */

const {
  loadWebsiteThemeState,
  saveWebsiteThemeDraft,
  evaluateThemeCompatibility,
  THEME_CONTENT_KEY,
} = require("./websiteThemeService");
const { getTheme, listSelectableThemesForProduct } = require("./themeRegistry");
const { PERMISSIONS } = require("./permissions");
const { buildThemeGalleryPageView } = require("./themeGalleryPageModel");
const {
  renderWebsiteThemeGalleryPage,
  THEME_GALLERY_STYLESHEET,
  THEME_GALLERY_SCRIPT,
} = require("./renderWebsiteThemeGallery");
const { renderWebsiteManagementPage } = require("./renderWebsiteManagementPage");
const { HISTORY_STYLESHEET } = require("./renderWebsiteHistory");

function statusForThemeCode(code) {
  if (code === "forbidden") return 403;
  if (code === "website_instance_not_found") return 404;
  if (
    code === "invalid_theme" ||
    code === "theme_product_mismatch" ||
    code === "theme_renderer_unavailable" ||
    code === "invalid_input"
  ) {
    return 400;
  }
  return 400;
}

async function presentThemeState(db, input) {
  const state = await loadWebsiteThemeState(db, input);
  if (!state.ok) {
    return { ok: false, code: state.code || "load_failed", status: statusForThemeCode(state.code) };
  }
  return {
    ok: true,
    status: 200,
    contentKey: THEME_CONTENT_KEY,
    available: state.available,
    selectable: state.selectable || listSelectableThemesForProduct(input.productCode),
    draftThemeId: state.draftThemeId,
    publishedThemeId: state.publishedThemeId,
    activeThemeId: state.activeThemeId,
    legacyFallback: state.legacyFallback === true,
    previewOnly: state.previewOnly === true,
    publicationThemeKey: state.publicationThemeKey,
    presentation: state.presentation,
    published: false,
  };
}

async function saveThemeDraftHttp(db, input) {
  const saved = await saveWebsiteThemeDraft(db, {
    organizationId: input.organizationId,
    productCode: input.productCode,
    instance: input.instance,
    themeId: input.themeId,
    actorIdentityId: input.actorIdentityId || null,
    grantedPermissions: input.grantedPermissions || [PERMISSIONS.EDIT],
    sectionTypes: input.sectionTypes,
    imageContentKeys: input.imageContentKeys,
  });
  if (!saved.ok) {
    return {
      ok: false,
      code: saved.code || "save_failed",
      status: statusForThemeCode(saved.code),
      published: false,
      compatibility: saved.compatibility || null,
    };
  }
  return {
    ok: true,
    status: 200,
    published: false,
    themeId: saved.themeId,
    contentKey: THEME_CONTENT_KEY,
    compatibility: saved.compatibility,
  };
}

function previewCompatibility(productCode, themeId, sectionTypes, imageContentKeys) {
  const theme = getTheme(themeId, productCode);
  if (!theme) return { ok: false, code: "invalid_theme" };
  return evaluateThemeCompatibility(theme, { sectionTypes, imageContentKeys });
}

async function loadThemeGalleryPresentation(db, input) {
  const state = await loadWebsiteThemeState(db, {
    organizationId: input.organizationId,
    productCode: input.productCode,
    instance: input.instance,
    preferDraft: true,
  });
  if (!state.ok) {
    throw Object.assign(new Error(state.code || "load_failed"), { code: state.code });
  }
  const page = buildThemeGalleryPageView({
    productCode: input.productCode,
    siteLabel: input.siteLabel,
    themes: state.selectable || listSelectableThemesForProduct(input.productCode),
    draftThemeId: state.draftThemeId,
    publishedThemeId: state.publishedThemeId,
    themeApiUrl: input.themeApiUrl,
    backHref: input.backHref,
    backLabel: input.backLabel,
    editHref: input.editHref || input.backHref,
    previewHrefBase: input.previewHrefBase || input.backHref,
    stylesHref: input.stylesHref || null,
    csrfField: input.csrfField,
    csrfToken: input.csrfToken,
    notice: input.notice,
    error: input.error,
    compatibility: input.compatibility || null,
  });
  return { page, bodyHtml: renderWebsiteThemeGalleryPage(page) };
}

function renderStandaloneThemeGalleryPage(presentation) {
  const page = presentation.page;
  return renderWebsiteManagementPage({
    pageTitle: page.pageTitle,
    productCode: page.productCode,
    siteLabel: page.siteLabel,
    backHref: page.backHref,
    backLabel: page.backLabel,
    bodyHtml: presentation.bodyHtml,
    stylesheets: [HISTORY_STYLESHEET, THEME_GALLERY_STYLESHEET],
    scripts: [THEME_GALLERY_SCRIPT],
    csrfToken: page.csrfToken,
  });
}

module.exports = {
  presentThemeState,
  saveThemeDraftHttp,
  previewCompatibility,
  statusForThemeCode,
  loadThemeGalleryPresentation,
  renderStandaloneThemeGalleryPage,
  THEME_GALLERY_STYLESHEET,
  THEME_GALLERY_SCRIPT,
};
