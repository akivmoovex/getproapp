"use strict";

/**
 * Host-aware SEO for V5 tenant public pages.
 * Never include tenant UUIDs in metadata.
 * Stage 2: accepts branch-resolved SEO overrides + og image.
 */

const { PAGE_KEY_TITLES } = require("../services/publicContentConstants");
const { PAGE_KEY_TO_PATH } = require("./tenantPublicPaths");
const { plainMetaText, escapeAttr, safeExternalUrl } = require("./tenantPublicSafe");

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
  const env = String(input.dataEnvironment || "").toLowerCase();
  const websiteStatus = String(input.websiteStatus || "draft").toLowerCase();

  const titleOverride = plainMetaText(input.titleOverride, 80);
  const descriptionOverride = plainMetaText(input.descriptionOverride, 160);
  const ogTitleOverride = plainMetaText(input.ogTitleOverride, 80);
  const ogDescriptionOverride = plainMetaText(input.ogDescriptionOverride, 160);
  const ogImageUrl = input.ogImageUrl ? safeExternalUrl(input.ogImageUrl) : null;

  let noindex =
    env === "testing" ||
    env === "demo" ||
    websiteStatus !== "published" ||
    Boolean(input.branchInactive);

  if (input.forceNoindex === true) {
    noindex = true;
  }

  const title =
    titleOverride ||
    (pageKey === "home" ? `${publicName}` : `${pageLabel} · ${publicName}`);

  let description = descriptionOverride || plainMetaText(input.description, 160);
  if (!description) {
    description =
      pageKey === "home"
        ? `${publicName} — welcome.`
        : `${pageLabel} at ${publicName}.`;
  }

  const ogTitle = ogTitleOverride || title;
  const ogDescription = ogDescriptionOverride || description;

  const scheme = "https";
  const canonicalUrl = hostname ? `${scheme}://${hostname}${path}` : path;

  return {
    title,
    description,
    canonicalUrl,
    ogTitle,
    ogDescription,
    ogUrl: canonicalUrl,
    ogImageUrl: ogImageUrl || null,
    ogType: "website",
    robots: noindex ? "noindex, nofollow" : "index, follow",
    noindex,
    titleAttr: escapeAttr(title),
    descriptionAttr: escapeAttr(description),
    canonicalAttr: escapeAttr(canonicalUrl),
  };
}

module.exports = {
  buildTenantPublicSeo,
};
