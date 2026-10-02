"use strict";

/**
 * Shared website SEO editor view model (Wave 4B-2).
 */

const { SEO_FIELDS, LIMITS } = require("./seoModel");

const WEBSITE_LEVEL_FIELDS = Object.freeze([
  {
    key: "seo.title",
    name: "seoTitle",
    label: "Site title",
    type: "text",
    scope: "website",
    maxLength: LIMITS.TITLE,
    hint: "Default title for search results and browser tabs.",
  },
  {
    key: "seo.description",
    name: "seoDescription",
    label: "Meta description",
    type: "textarea",
    scope: "website",
    maxLength: LIMITS.DESCRIPTION,
    hint: "Short summary shown in search results.",
  },
  {
    key: "seo.og_title",
    name: "ogTitle",
    label: "Social share title",
    type: "text",
    scope: "website",
    maxLength: LIMITS.OG_TITLE,
    hint: "Title when your site is shared on social platforms.",
  },
  {
    key: "seo.og_description",
    name: "ogDescription",
    label: "Social share description",
    type: "textarea",
    scope: "website",
    maxLength: LIMITS.OG_DESCRIPTION,
    hint: "Description shown alongside social previews.",
  },
  {
    key: "seo.og_image_url",
    name: "ogImageUrl",
    label: "Social share image",
    type: "url",
    scope: "website",
    maxLength: LIMITS.URL,
    hint: "Absolute image URL for social cards.",
  },
  {
    key: "seo.robots",
    name: "robots",
    label: "Search indexing",
    type: "select",
    scope: "website",
    options: Object.freeze([
      { value: "", label: "Use platform default" },
      { value: "index", label: "Allow indexing" },
      { value: "noindex", label: "Hide from search engines" },
    ]),
    hint: "Platform testing environments may still force noindex.",
  },
]);

const ACTIVECLINIC_EXTRA_FIELDS = Object.freeze([
  {
    key: "seo.image",
    name: "seoImage",
    label: "Social image (CMS)",
    type: "url",
    scope: "website",
    maxLength: LIMITS.URL,
    hint: "ActiveClinic social image from website settings.",
  },
  {
    key: "seo.canonical_url",
    name: "canonicalUrl",
    label: "Canonical URL",
    type: "url",
    scope: "website",
    maxLength: LIMITS.URL,
    hint: "Optional https URL override for the homepage.",
  },
]);

function fieldListForProduct(productCode) {
  const product = String(productCode || "").trim().toLowerCase();
  if (product === "activeclinic") {
    return WEBSITE_LEVEL_FIELDS.concat(ACTIVECLINIC_EXTRA_FIELDS);
  }
  return WEBSITE_LEVEL_FIELDS.slice();
}

function textValue(raw) {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw.src) return String(raw.src);
  return String(raw);
}

/**
 * @param {{
 *   productCode?: string,
 *   siteLabel?: string,
 *   values?: Record<string, unknown>,
 *   published?: Record<string, unknown>,
 *   backHref?: string|null,
 *   saveAction?: string|null,
 *   csrfField?: string,
 *   csrfToken?: string,
 *   notice?: string|null,
 *   error?: string|null,
 * }} input
 */
function buildSeoPageView(input) {
  const opts = input && typeof input === "object" ? input : {};
  const productCode = String(opts.productCode || "").trim().toLowerCase();
  const values = opts.values && typeof opts.values === "object" ? opts.values : {};
  const published = opts.published && typeof opts.published === "object" ? opts.published : {};
  const fields = fieldListForProduct(productCode).map((def) => ({
    ...def,
    draftValue: textValue(values[def.key]),
    publishedValue: textValue(published[def.key]),
  }));
  return {
    productCode,
    siteLabel: String(opts.siteLabel || "Website"),
    pageTitle: "SEO",
    intro:
      "Website-level metadata saves to your draft. Publish to update public HTML meta tags.",
    scopeNote: "These settings apply site-wide defaults. Page-specific metadata may still override where supported.",
    backHref: opts.backHref ? String(opts.backHref) : null,
    backLabel: "Back to editor",
    saveAction: opts.saveAction ? String(opts.saveAction) : null,
    fields,
    seoFields: SEO_FIELDS.slice(),
    csrfField: String(opts.csrfField || "_csrf"),
    csrfToken: String(opts.csrfToken || ""),
    notice: opts.notice || null,
    error: opts.error || null,
  };
}

module.exports = {
  WEBSITE_LEVEL_FIELDS,
  buildSeoPageView,
};
