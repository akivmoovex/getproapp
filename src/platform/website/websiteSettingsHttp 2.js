"use strict";

const {
  loadWebsiteBranding,
  saveWebsiteBranding,
  normalizeHexColor,
  imageValueFromParts,
} = require("./branding");
const contentService = require("./contentService");
const { buildStylesPageView } = require("./stylesPageModel");
const { buildSeoPageView } = require("./seoPageModel");
const { renderWebsiteStylesPage, STYLES_STYLESHEET, STYLES_SCRIPT } = require("./renderWebsiteStyles");
const { renderWebsiteSeoPage, SEO_STYLESHEET, SEO_SCRIPT } = require("./renderWebsiteSeo");
const { renderWebsiteManagementPage } = require("./renderWebsiteManagementPage");
const { HISTORY_STYLESHEET } = require("./renderWebsiteHistory");
const {
  loadBlessBoardSeoEditorState,
} = require("../../blessboard/website/blessboardEngineSeo");

const AC_SEO_KEYS = Object.freeze([
  "seo.title",
  "seo.description",
  "seo.image",
  "seo.canonical_url",
  "seo.robots",
  "seo.sitemap_include",
]);

const BB_SEO_KEYS = Object.freeze([
  "seo.title",
  "seo.description",
  "seo.og_title",
  "seo.og_description",
  "seo.og_image_url",
  "seo.robots",
  "seo.canonical_url",
  "seo.sitemap_include",
]);

function seoKeysForProduct(productCode) {
  const product = String(productCode || "").trim().toLowerCase();
  return product === "activeclinic" ? AC_SEO_KEYS : BB_SEO_KEYS;
}

function noticeFromQuery(query) {
  const saved = String((query && query.saved) || "").trim();
  if (saved === "1") return "Saved to draft.";
  return null;
}

function errorFromQuery(query) {
  const code = String((query && query.error) || "").trim();
  if (!code) return null;
  return code.replace(/_/g, " ");
}

async function loadStylesPresentation(db, input) {
  const branding = await loadWebsiteBranding(db, input);
  if (!branding.ok) {
    throw Object.assign(new Error(branding.code || "load_failed"), { code: branding.code });
  }
  const page = buildStylesPageView({
    productCode: input.productCode,
    siteLabel: input.siteLabel,
    values: branding.values,
    published: branding.published,
    backHref: input.backHref,
    saveAction: input.saveAction,
    mediaLibraryHref: input.mediaLibraryHref,
    csrfField: input.csrfField,
    csrfToken: input.csrfToken,
    notice: input.notice,
    error: input.error,
  });
  return { page, bodyHtml: renderWebsiteStylesPage(page) };
}

async function loadSeoPresentation(db, input) {
  const organizationId = String(input.organizationId || "");
  const productCode = String(input.productCode || "").trim().toLowerCase();
  const instance = input.instance;
  if (!organizationId || !instance) {
    throw Object.assign(new Error("website_instance_not_found"), { code: "website_instance_not_found" });
  }
  const keys = seoKeysForProduct(productCode);
  let values = {};
  let published = {};
  if (productCode === "blessboard") {
    const bbState = await loadBlessBoardSeoEditorState(db, {
      organizationId,
      instance,
      churchId: input.churchId,
      branchId: input.branchId,
    });
    values = bbState.values;
    published = bbState.published;
  } else {
    const rows = await Promise.all(
      keys.map((key) => contentService.getWebsiteContentRow(db, instance.id, organizationId, key))
    );
    keys.forEach((key, index) => {
      const row = rows[index];
      values[key] = row ? row.draftValue : null;
      published[key] = row ? row.publishedValue : null;
    });
  }
  const page = buildSeoPageView({
    productCode,
    siteLabel: input.siteLabel,
    values,
    published,
    backHref: input.backHref,
    saveAction: input.saveAction,
    csrfField: input.csrfField,
    csrfToken: input.csrfToken,
    notice: input.notice,
    error: input.error,
  });
  return { page, bodyHtml: renderWebsiteSeoPage(page) };
}

function renderStandaloneStylesPage(presentation) {
  const page = presentation.page;
  return renderWebsiteManagementPage({
    pageTitle: page.pageTitle,
    productCode: page.productCode,
    siteLabel: page.siteLabel,
    backHref: page.backHref,
    backLabel: page.backLabel,
    bodyHtml: presentation.bodyHtml,
    stylesheets: [HISTORY_STYLESHEET, STYLES_STYLESHEET],
    scripts: [STYLES_SCRIPT],
    csrfToken: page.csrfToken,
  });
}

function renderStandaloneSeoPage(presentation) {
  const page = presentation.page;
  return renderWebsiteManagementPage({
    pageTitle: page.pageTitle,
    productCode: page.productCode,
    siteLabel: page.siteLabel,
    backHref: page.backHref,
    backLabel: page.backLabel,
    bodyHtml: presentation.bodyHtml,
    stylesheets: [HISTORY_STYLESHEET, SEO_STYLESHEET],
    scripts: [SEO_SCRIPT],
    csrfToken: page.csrfToken,
  });
}

function parseStylesFormBody(body) {
  const entries = [];
  const primary = normalizeHexColor(body.primaryColor || body.primaryColorText);
  if (primary.ok && primary.value) entries.push({ key: "brand.primary_color", value: primary.value });
  const accent = normalizeHexColor(body.accentColor || body.accentColorText);
  if (accent.ok && accent.value) entries.push({ key: "brand.accent_color", value: accent.value });
  const logoSrc = String(body.logo || "").trim();
  const logoAlt = String(body.logoAlt || "").trim();
  if (logoSrc || logoAlt) {
    entries.push({ key: "home.logo", value: imageValueFromParts(logoSrc, logoAlt, null) });
  }
  const heroSrc = String(body.heroImage || "").trim();
  const heroAlt = String(body.heroImageAlt || "").trim();
  if (heroSrc || heroAlt) {
    entries.push({ key: "home.hero.image", value: imageValueFromParts(heroSrc, heroAlt, null) });
  }
  return entries;
}

function textOrNull(body, name) {
  const raw = body && body[name];
  if (raw == null) return null;
  const text = String(raw).trim();
  return text || null;
}

function parseSeoFormBody(body, productCode) {
  const product = String(productCode || "").trim().toLowerCase();
  const entries = [];
  const map = [
    ["seoTitle", "seo.title"],
    ["seoDescription", "seo.description"],
    ["ogTitle", "seo.og_title"],
    ["ogDescription", "seo.og_description"],
    ["ogImageUrl", "seo.og_image_url"],
    ["robots", "seo.robots"],
    ["canonicalUrl", "seo.canonical_url"],
    ["seoImage", "seo.image"],
  ];
  for (const [field, key] of map) {
    if (product === "activeclinic" && (key === "seo.og_title" || key === "seo.og_description" || key === "seo.og_image_url")) {
      continue;
    }
    if (product !== "activeclinic" && key === "seo.image") continue;
    const value = textOrNull(body, field);
    if (value != null) entries.push({ key, value });
  }
  return entries;
}

async function saveStylesDraft(db, input) {
  const entries = parseStylesFormBody(input.body || {});
  return saveWebsiteBranding(db, {
    organizationId: input.organizationId,
    productCode: input.productCode,
    instance: input.instance,
    entries,
    actorIdentityId: input.actorIdentityId,
    grantedPermissions: input.grantedPermissions,
  });
}

async function saveSeoDraft(db, input) {
  const entries = parseSeoFormBody(input.body || {}, input.productCode);
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const saved = await contentService.saveWebsiteDraft(db, {
      organizationId: input.organizationId,
      instanceId: input.instance.id,
      expectedProductCode: input.productCode,
      contentKey: entry.key,
      value: entry.value,
      actorIdentityId: input.actorIdentityId,
      grantedPermissions: input.grantedPermissions,
    });
    if (!saved.ok) return saved;
  }
  return { ok: true };
}

module.exports = {
  seoKeysForProduct,
  noticeFromQuery,
  errorFromQuery,
  loadStylesPresentation,
  loadSeoPresentation,
  renderStandaloneStylesPage,
  renderStandaloneSeoPage,
  saveStylesDraft,
  saveSeoDraft,
};
