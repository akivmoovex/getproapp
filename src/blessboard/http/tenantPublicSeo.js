"use strict";

/**
 * Host-aware SEO for V5 tenant public pages.
 * Never include tenant UUIDs in metadata.
 */

const { PAGE_KEY_TITLES } = require("../services/publicContentConstants");
const { PAGE_KEY_TO_PATH } = require("./tenantPublicPaths");
const { plainMetaText, escapeAttr } = require("./tenantPublicSafe");

/**
 * @param {{
 *   hostname: string,
 *   pageKey: string,
 *   publicName: string,
 *   pageTitle?: string|null,
 *   description?: string|null,
 *   dataEnvironment?: string|null,
 *   websiteStatus?: string|null,
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

  const noindex =
    env === "testing" ||
    env === "demo" ||
    websiteStatus !== "published";

  const title =
    pageKey === "home" ? `${publicName}` : `${pageLabel} · ${publicName}`;

  let description = plainMetaText(input.description, 160);
  if (!description) {
    description =
      pageKey === "home"
        ? `${publicName} — welcome.`
        : `${pageLabel} at ${publicName}.`;
  }

  const scheme = "https";
  const canonicalUrl = hostname ? `${scheme}://${hostname}${path}` : path;

  return {
    title,
    description,
    canonicalUrl,
    ogTitle: title,
    ogDescription: description,
    ogUrl: canonicalUrl,
    ogType: "website",
    robots: noindex ? "noindex, nofollow" : "index, follow",
    noindex,
    // Pre-escaped attribute-safe strings for templates that need them.
    titleAttr: escapeAttr(title),
    descriptionAttr: escapeAttr(description),
    canonicalAttr: escapeAttr(canonicalUrl),
  };
}

module.exports = {
  buildTenantPublicSeo,
};
