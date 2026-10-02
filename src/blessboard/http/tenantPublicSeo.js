"use strict";

/**
 * Host-aware SEO for V5 tenant public pages.
 * Never include tenant UUIDs in metadata.
 *
 * Tag values, sanitisation, robots governance, and sitemap inclusion are owned
 * by the shared website-engine SEO model. This adapter only supplies
 * BlessBoard's church/branch defaults and URL composition.
 */

const { PAGE_KEY_TITLES } = require("../services/publicContentConstants");
const { PAGE_KEY_TO_PATH } = require("./tenantPublicPaths");
const { plainMetaText } = require("./tenantPublicSafe");
const seoModel = require("../../platform/website/seoModel");

/**
 * @param {{
 *   hostname: string,
 *   pageKey: string,
 *   publicName: string,
 *   pageTitle?: string|null,
 *   description?: string|null,
 *   dataEnvironment?: string|null,
 *   websiteStatus?: string|null,
 *   pathPrefix?: string,
 *   titleOverride?: string|null,
 *   descriptionOverride?: string|null,
 *   ogTitleOverride?: string|null,
 *   ogDescriptionOverride?: string|null,
 *   ogImageUrl?: string|null,
 *   canonicalUrlOverride?: string|null,
 *   robotsOverride?: string|null,
 *   sitemapIncludeOverride?: boolean|null,
 *   forceNoindex?: boolean|null,
 *   branchInactive?: boolean,
 * }} input
 */
function buildTenantPublicSeo(input) {
  const hostname = String(input.hostname || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  const pageKey = String(input.pageKey || "home");
  const pathPrefix = String(input.pathPrefix || "").replace(/\/$/, "");
  const basePath = PAGE_KEY_TO_PATH[pageKey] || "/";
  const path =
    pathPrefix && pageKey === "home"
      ? pathPrefix || "/"
      : pathPrefix
        ? `${pathPrefix}${basePath === "/" ? "" : basePath}`
        : basePath;
  const publicName = plainMetaText(input.publicName || "Church", 80) || "Church";
  const pageLabel =
    plainMetaText(input.pageTitle, 80) || PAGE_KEY_TITLES[pageKey] || "Home";

  const computedUrl = hostname ? `https://${hostname}${path}` : path;

  // Branch deactivation is a governance noindex, same class as lifecycle state.
  const forceNoindex = input.forceNoindex === true || Boolean(input.branchInactive);

  const fallbackDescription =
    plainMetaText(input.description, 160) ||
    (pageKey === "home" ? `${publicName} — welcome.` : `${pageLabel} at ${publicName}.`);

  const seo = seoModel.buildWebsiteSeo({
    siteName: publicName,
    pageLabel,
    computedUrl,
    fallbackTitle:
      pageKey === "home" ? publicName : `${pageLabel} · ${publicName}`,
    fallbackDescription,
    titleOverride: input.titleOverride,
    descriptionOverride: input.descriptionOverride,
    canonicalUrlOverride: input.canonicalUrlOverride,
    ogTitleOverride: input.ogTitleOverride,
    ogDescriptionOverride: input.ogDescriptionOverride,
    ogImageUrl: input.ogImageUrl,
    robotsOverride: input.robotsOverride,
    sitemapIncludeOverride: input.sitemapIncludeOverride,
    dataEnvironment: input.dataEnvironment,
    publishState: String(input.websiteStatus || "draft").toLowerCase(),
    forceNoindex,
  });

  return seo;
}

module.exports = {
  buildTenantPublicSeo,
};
