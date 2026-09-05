"use strict";

/**
 * ActiveClinic public SEO adapter.
 *
 * Tag values, sanitisation, robots governance, and sitemap inclusion come from
 * the shared website-engine SEO model. This adapter supplies clinic defaults
 * and the canonical URL built from the shared public-URL helper.
 */

const seoModel = require("../../platform/website/seoModel");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
} = require("../../platform/website/publicWebsiteUrl");

const TITLE_SUFFIX = "ActiveClinic";

/** Template name (e.g. "tenant/doctors") to public page key. */
function pageKeyFromTemplate(template) {
  const raw = String(template || "").trim();
  if (!raw) return "home";
  const tail = raw.split("/").pop() || "home";
  return tail === "index" ? "home" : tail;
}

/**
 * Absolute origin for canonical URLs. Prefer the request host so canonical
 * matches the URL the visitor actually reached, then the product domain matrix.
 */
function resolveOrigin(req, env) {
  const host = req && typeof req.get === "function" ? String(req.get("host") || "") : "";
  const clean = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (clean && clean.includes(".") && !clean.startsWith("localhost")) {
    return `https://${clean}`;
  }
  const { publicOriginForProduct } = require("../../platform/website/publicWebsiteUrl");
  return publicOriginForProduct(PRODUCT_CODE.ACTIVECLINIC, env) || "";
}

/**
 * @param {{
 *   req?: object,
 *   env?: object,
 *   clinic?: object,
 *   instance?: object,
 *   template?: string,
 *   pageKey?: string,
 *   pageTitle?: string|null,
 *   metaDescription?: string|null,
 *   ogImageUrl?: string|null,
 *   robots?: string|null,
 *   isPreview?: boolean,
 * }} input
 */
function buildActiveClinicPublicSeo(input) {
  const opts = input && typeof input === "object" ? input : {};
  const clinic = opts.clinic && typeof opts.clinic === "object" ? opts.clinic : {};
  const instance = opts.instance && typeof opts.instance === "object" ? opts.instance : null;
  const content =
    clinic.websiteContent && typeof clinic.websiteContent === "object"
      ? clinic.websiteContent
      : {};

  const pageKey = opts.pageKey || pageKeyFromTemplate(opts.template);
  const organizationKey = clinic.clinicKey || clinic.slug || "";

  let computedUrl = null;
  if (organizationKey) {
    const path = buildPublicOrganizationWebsitePath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey,
      pageKey: pageKey === "home" ? null : pageKey,
    });
    if (path) {
      const origin = resolveOrigin(opts.req, opts.env);
      computedUrl = origin ? `${origin}${path}` : path;
    }
  }

  const siteName = clinic.websiteDisplayName || clinic.publicName || "";

  // An explicit robots local (booking flows, drafts, version previews) is a
  // governance noindex and must win over tenant content.
  const explicitNoindex = /noindex/i.test(String(opts.robots || ""));
  const publishState = instance && instance.status ? String(instance.status) : "";

  return seoModel.buildWebsiteSeo({
    siteName,
    pageLabel: opts.pageTitle || null,
    titleSuffix: TITLE_SUFFIX,
    computedUrl,
    fallbackTitle: opts.pageTitle || clinic.seoTitle || siteName || TITLE_SUFFIX,
    fallbackDescription: opts.metaDescription || clinic.seoDescription || "",
    titleOverride: null,
    descriptionOverride: null,
    canonicalUrlOverride: content["seo.canonical_url"] || null,
    ogTitleOverride: null,
    ogDescriptionOverride: null,
    ogImageUrl: opts.ogImageUrl || clinic.seoImageUrl || null,
    ogImageAlt: clinic.seoImageAlt || "",
    robotsOverride: content["seo.robots"] || null,
    sitemapIncludeOverride:
      content["seo.sitemap_include"] === false ? false : null,
    dataEnvironment: clinic.dataEnvironment || null,
    publishState,
    forceNoindex: explicitNoindex || opts.isPreview === true ? true : null,
  });
}

module.exports = {
  TITLE_SUFFIX,
  pageKeyFromTemplate,
  buildActiveClinicPublicSeo,
};
