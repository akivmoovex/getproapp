"use strict";

const {
  blessboardAbsoluteUrlForRequest,
  blessboardAbsoluteAssetUrl,
} = require("./blessboardPublicUrls");

/** Published branch public pages that may be indexed. */
const TENANT_PUBLIC_PATHS = {
  home: "/",
  about: "/about",
  leadership: "/leadership",
  ministries: "/ministries",
  events: "/events",
  sermons: "/sermons",
  contact: "/contact",
  giving: "/giving",
};

/**
 * @param {Record<string, unknown>} locals
 */
function buildTenantMetaDescription(locals) {
  const welcome = typeof locals.welcomeMessage === "string" ? locals.welcomeMessage.trim() : "";
  if (welcome) return welcome.slice(0, 320);
  const church = typeof locals.churchName === "string" ? locals.churchName.trim() : "Our Church";
  const branch = typeof locals.branchName === "string" ? locals.branchName.trim() : "";
  if (branch && branch !== church) {
    return `${church} — ${branch}. Visit for service information, events, ministries, and contact details.`;
  }
  return `${church} — visit for service information, events, ministries, and contact details.`;
}

/**
 * @param {Record<string, unknown>} locals
 * @param {import("express").Request} req
 */
function resolveTenantOgImage(locals, req) {
  const logo = blessboardAbsoluteAssetUrl(req, locals.churchLogoUrl);
  if (logo) return logo;
  const hero = blessboardAbsoluteAssetUrl(req, locals.heroImageUrl);
  if (hero) return hero;
  return "";
}

/**
 * Attach self-referencing canonical and index metadata for published tenant public pages.
 * @param {Record<string, unknown>} locals
 * @param {import("express").Request | null} req
 */
function mergeChurchTenantPublicSeo(locals, req = null) {
  if (!locals || locals.isVerticalApex || !req) return locals;

  const activePage = typeof locals.activePage === "string" ? locals.activePage : "home";
  const pathname =
    (typeof locals.canonicalPath === "string" && locals.canonicalPath) ||
    TENANT_PUBLIC_PATHS[activePage] ||
    "/";
  const canonicalUrl = blessboardAbsoluteUrlForRequest(req, pathname);
  const isPreview = Boolean(locals.isPreview);
  const noindex = Boolean(locals.noindex) || isPreview;

  const pageTitle =
    (typeof locals.pageTitle === "string" && locals.pageTitle.trim()) ||
    (typeof locals.churchName === "string" && locals.churchName.trim()) ||
    "Church";
  const churchName =
    (typeof locals.churchName === "string" && locals.churchName.trim()) || "Church";
  const metaDescription = buildTenantMetaDescription(locals);
  const ogImage = resolveTenantOgImage(locals, req);

  return {
    ...locals,
    pageTitle,
    metaDescription,
    seoTitle: `${pageTitle} | ${churchName}`,
    seoDescription: metaDescription,
    canonicalUrl,
    ogUrl: canonicalUrl,
    ogImage: ogImage || undefined,
    ogType: "website",
    robotsMeta: noindex ? undefined : "index, follow",
    noindex,
    structuredDataJsonLd: [],
  };
}

module.exports = {
  TENANT_PUBLIC_PATHS,
  mergeChurchTenantPublicSeo,
  buildTenantMetaDescription,
  resolveTenantOgImage,
};
