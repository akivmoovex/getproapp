"use strict";

/**
 * Shared Website Theme Gallery view model (C2).
 * Product-filtered selectable themes only — no cross-product cards.
 */

const { PRODUCT_CODE, appendQuery } = require("./publicWebsiteUrl");
const { THEME_PREVIEW_QUERY } = require("./websiteThemeService");

function buildThemeGalleryPageView(input) {
  const opts = input && typeof input === "object" ? input : {};
  const productCode = String(opts.productCode || "").trim().toLowerCase();
  const themes = Array.isArray(opts.themes) ? opts.themes : [];
  const draftThemeId = String(opts.draftThemeId || "");
  const publishedThemeId = String(opts.publishedThemeId || "");
  const previewHrefBase = opts.previewHrefBase || opts.backHref || "";
  const editHref = opts.editHref || opts.backHref || "";
  const cards = themes.map((theme) => {
    const id = String(theme.id || "");
    const isDraft = id === draftThemeId;
    const isLive = id === publishedThemeId;
    const previewHref = previewHrefBase
      ? appendQuery(previewHrefBase, {
          website_mode: "draft",
          [THEME_PREVIEW_QUERY]: id,
        })
      : null;
    return {
      id,
      displayName: theme.displayName || id,
      description: theme.description || "",
      preview: theme.preview || null,
      isDefault: theme.isDefault === true,
      engineTemplateId: theme.engineTemplateId || "",
      isDraft,
      isLive,
      statusLabel: isDraft && !isLive ? "Draft" : isLive && isDraft ? "Current" : isLive ? "Live" : isDraft ? "Draft" : "",
      previewHref,
      selectable: true,
    };
  });
  const productLabel =
    productCode === PRODUCT_CODE.ACTIVECLINIC
      ? "ActiveClinic"
      : productCode === PRODUCT_CODE.BLESSBOARD
        ? "BlessBoard"
        : "Website";
  return {
    pageTitle: "Choose Website Theme",
    productCode,
    productLabel,
    siteLabel: opts.siteLabel || "",
    intro:
      "Pick a theme for your public website. Changes save to draft only — publish when you are ready.",
    safetyNote:
      "Theme selection does not rewrite your text, images, or section order. Unsupported sections stay in place and are listed for review.",
    themes: cards,
    draftThemeId,
    publishedThemeId,
    themeApiUrl: opts.themeApiUrl || "",
    backHref: opts.backHref || null,
    backLabel: opts.backLabel || "Back to editor",
    editHref,
    previewHrefBase,
    stylesHref: opts.stylesHref || null,
    csrfField: opts.csrfField || "_csrf",
    csrfToken: opts.csrfToken || "",
    notice: opts.notice || null,
    error: opts.error || null,
    compatibility: opts.compatibility || null,
    singleThemeOnly: cards.length <= 1,
  };
}

module.exports = {
  buildThemeGalleryPageView,
  THEME_PREVIEW_QUERY,
};
