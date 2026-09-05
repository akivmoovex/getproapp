"use strict";

/**
 * Shared website styles (branding) editor view model (Wave 4B-2).
 */

const {
  BRANDING_KEYS,
  colorDefaultsForProduct,
  imageFromWebsiteValue,
  pickHexColor,
} = require("./branding");

const FIELD_DEFS = Object.freeze([
  {
    key: "brand.primary_color",
    name: "primaryColor",
    label: "Primary brand color",
    type: "color",
    hint: "Used for buttons, links, and accents on your public website.",
  },
  {
    key: "brand.accent_color",
    name: "accentColor",
    label: "Accent color",
    type: "color",
    hint: "Secondary highlight color where supported.",
  },
  {
    key: "home.logo",
    name: "logo",
    label: "Site logo",
    type: "image",
    hint: "Shown in the website header when set.",
  },
  {
    key: "home.hero.image",
    name: "heroImage",
    label: "Default hero image",
    type: "image",
    hint: "Fallback hero imagery for pages without their own image.",
  },
]);

/**
 * @param {{
 *   productCode?: string,
 *   siteLabel?: string,
 *   values?: Record<string, unknown>,
 *   published?: Record<string, unknown>,
 *   backHref?: string|null,
 *   saveAction?: string|null,
 *   mediaLibraryHref?: string|null,
 *   csrfField?: string,
 *   csrfToken?: string,
 *   notice?: string|null,
 *   error?: string|null,
 * }} input
 */
function buildStylesPageView(input) {
  const opts = input && typeof input === "object" ? input : {};
  const productCode = String(opts.productCode || "").trim().toLowerCase();
  const defaults = colorDefaultsForProduct(productCode);
  const values = opts.values && typeof opts.values === "object" ? opts.values : {};
  const published = opts.published && typeof opts.published === "object" ? opts.published : {};
  const fields = FIELD_DEFS.map((def) => {
    if (def.type === "color") {
      const draft = pickHexColor({ v: values[def.key] }, "v");
      const live = pickHexColor({ v: published[def.key] }, "v");
      const fallback =
        def.key === "brand.primary_color"
          ? defaults.primary
          : def.key === "brand.accent_color"
            ? defaults.accent
            : null;
      return {
        ...def,
        draftValue: draft || "",
        publishedValue: live || fallback || "",
        placeholder: fallback || "#6c5ce7",
      };
    }
    const image = imageFromWebsiteValue(values[def.key]);
    const publishedImage = imageFromWebsiteValue(published[def.key]);
    return {
      ...def,
      draftValue: image,
      publishedValue: publishedImage,
    };
  });
  return {
    productCode,
    siteLabel: String(opts.siteLabel || "Website"),
    pageTitle: "Styles",
    intro:
      "Changes save to your website draft. Visitors see updates only after you publish.",
    backHref: opts.backHref ? String(opts.backHref) : null,
    backLabel: "Back to editor",
    saveAction: opts.saveAction ? String(opts.saveAction) : null,
    mediaLibraryHref: opts.mediaLibraryHref ? String(opts.mediaLibraryHref) : null,
    fields,
    csrfField: String(opts.csrfField || "_csrf"),
    csrfToken: String(opts.csrfToken || ""),
    notice: opts.notice || null,
    error: opts.error || null,
    brandingKeys: BRANDING_KEYS.slice(),
  };
}

module.exports = {
  FIELD_DEFS,
  buildStylesPageView,
};
