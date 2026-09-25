"use strict";

/**
 * Shared JSON helpers for website theme draft selection (no gallery UI).
 */

const {
  loadWebsiteThemeState,
  saveWebsiteThemeDraft,
  evaluateThemeCompatibility,
  THEME_CONTENT_KEY,
} = require("./websiteThemeService");
const { getTheme } = require("./themeRegistry");
const { PERMISSIONS } = require("./permissions");

function statusForThemeCode(code) {
  if (code === "forbidden") return 403;
  if (code === "website_instance_not_found") return 404;
  if (code === "invalid_theme" || code === "theme_product_mismatch" || code === "invalid_input") {
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
    draftThemeId: state.draftThemeId,
    publishedThemeId: state.publishedThemeId,
    activeThemeId: state.activeThemeId,
    legacyFallback: state.legacyFallback === true,
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

module.exports = {
  presentThemeState,
  saveThemeDraftHttp,
  previewCompatibility,
  statusForThemeCode,
};
