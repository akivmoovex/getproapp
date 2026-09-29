"use strict";

/**
 * Shared website SEO model for the V7 website engine.
 *
 * One place decides sanitisation, override precedence, robots governance, and
 * the meta-tag set that public shells render. Products supply their own
 * defaults (site name, page label, computed URL, fallback copy) and their own
 * storage; they do not each re-derive tag values.
 *
 * Robots resolution fails closed: a tenant-supplied "index" can never override
 * an environment or lifecycle noindex.
 */

const SEO_FIELDS = Object.freeze([
  "title",
  "description",
  "canonicalUrl",
  "ogTitle",
  "ogDescription",
  "ogImageUrl",
  "robots",
  "sitemapInclude",
]);

const LIMITS = Object.freeze({
  TITLE: 80,
  DESCRIPTION: 160,
  OG_TITLE: 80,
  OG_DESCRIPTION: 200,
  URL: 500,
});

const ROBOTS_VALUES = Object.freeze(["index", "noindex"]);

const ROBOTS_DIRECTIVE = Object.freeze({
  INDEX: "index, follow",
  NOINDEX: "noindex, nofollow",
});

const TWITTER_CARD = Object.freeze({
  SUMMARY: "summary",
  SUMMARY_LARGE_IMAGE: "summary_large_image",
});

const NOINDEX_ENVIRONMENTS = Object.freeze(new Set(["testing", "demo", "rehearsal"]));

/**
 * Collapse whitespace, strip angle brackets, truncate with an ellipsis.
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function metaText(value, max) {
  const limit = Number.isFinite(max) && max > 1 ? Math.floor(max) : LIMITS.DESCRIPTION;
  const text = String(value == null ? "" : value)
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}

/**
 * Absolute https URL, used for canonical and og:url. Rejects anything else so a
 * misconfigured tenant value cannot point crawlers off-site or downgrade to http.
 * @param {unknown} value
 * @returns {string|null}
 */
function absoluteHttpsUrl(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw.length > LIMITS.URL) return null;
  if (raw.includes("\\") || raw.includes("\0") || /\s/.test(raw)) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (!parsed.hostname || !parsed.hostname.includes(".")) return null;
  parsed.hash = "";
  return parsed.toString();
}

/**
 * Share image: absolute https, or a same-site absolute path.
 * @param {unknown} value
 * @returns {string|null}
 */
function shareImageUrl(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw.length > LIMITS.URL) return null;
  if (raw.includes("\\") || raw.includes("\0") || raw.includes("..") || /\s/.test(raw)) {
    return null;
  }
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return absoluteHttpsUrl(raw);
}

/**
 * @param {unknown} value
 * @returns {"index"|"noindex"|null}
 */
function normalizeRobots(value) {
  if (value == null || value === "") return null;
  if (value === true) return "noindex";
  if (value === false) return "index";
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  if (raw === "noindex" || raw === "noindex, nofollow" || raw === "true") return "noindex";
  if (raw === "index" || raw === "index, follow" || raw === "false") return "index";
  return null;
}

/**
 * @param {unknown} value
 * @returns {boolean|null}
 */
function normalizeSitemapInclude(value) {
  if (value == null || value === "") return null;
  if (value === true || value === false) return value;
  const raw = String(value).trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return null;
}

function escapeAttr(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Resolve the governance-aware robots decision.
 *
 * @param {{
 *   dataEnvironment?: string|null,
 *   publishState?: string|null,
 *   forceNoindex?: boolean|null,
 *   robotsOverride?: unknown,
 * }} input
 * @returns {{ noindex: boolean, locked: boolean, reason: string }}
 */
function resolveRobots(input) {
  const env = String((input && input.dataEnvironment) || "").toLowerCase();
  const publishState = String((input && input.publishState) || "").toLowerCase();

  if (NOINDEX_ENVIRONMENTS.has(env)) {
    return { noindex: true, locked: true, reason: "environment" };
  }
  if (publishState && publishState !== "published") {
    return { noindex: true, locked: true, reason: "not_published" };
  }
  if (input && input.forceNoindex === true) {
    return { noindex: true, locked: true, reason: "governance" };
  }

  const override = normalizeRobots(input && input.robotsOverride);
  if (override === "noindex") {
    return { noindex: true, locked: false, reason: "tenant" };
  }
  return { noindex: false, locked: false, reason: "default" };
}

/**
 * Build the full public SEO model for one page.
 *
 * @param {{
 *   siteName?: string|null,
 *   pageLabel?: string|null,
 *   titleSuffix?: string|null,
 *   computedUrl?: string|null,
 *   fallbackTitle?: string|null,
 *   fallbackDescription?: string|null,
 *   titleOverride?: unknown,
 *   descriptionOverride?: unknown,
 *   canonicalUrlOverride?: unknown,
 *   ogTitleOverride?: unknown,
 *   ogDescriptionOverride?: unknown,
 *   ogImageUrl?: unknown,
 *   ogImageAlt?: unknown,
 *   robotsOverride?: unknown,
 *   sitemapIncludeOverride?: unknown,
 *   dataEnvironment?: string|null,
 *   publishState?: string|null,
 *   forceNoindex?: boolean|null,
 * }} input
 */
function buildWebsiteSeo(input) {
  const opts = input && typeof input === "object" ? input : {};

  const siteName = metaText(opts.siteName, LIMITS.TITLE);
  const pageLabel = metaText(opts.pageLabel, LIMITS.TITLE);
  const suffix = metaText(opts.titleSuffix, LIMITS.TITLE);

  const titleOverride = metaText(opts.titleOverride, LIMITS.TITLE);
  const descriptionOverride = metaText(opts.descriptionOverride, LIMITS.DESCRIPTION);
  const ogTitleOverride = metaText(opts.ogTitleOverride, LIMITS.OG_TITLE);
  const ogDescriptionOverride = metaText(opts.ogDescriptionOverride, LIMITS.OG_DESCRIPTION);

  // Title: explicit override, else product fallback, else composed, else site name.
  let title = titleOverride || metaText(opts.fallbackTitle, LIMITS.TITLE);
  if (!title) {
    title = pageLabel && siteName && pageLabel !== siteName
      ? `${pageLabel} · ${siteName}`
      : siteName || pageLabel;
  }
  if (suffix && title && !title.endsWith(suffix)) {
    title = metaText(`${title} · ${suffix}`, LIMITS.TITLE);
  }

  const description =
    descriptionOverride || metaText(opts.fallbackDescription, LIMITS.DESCRIPTION);

  const computedUrl = absoluteHttpsUrl(opts.computedUrl);
  const canonicalOverride = absoluteHttpsUrl(opts.canonicalUrlOverride);
  // A relative computedUrl is still useful to callers that only have a path.
  const computedFallback =
    computedUrl ||
    (typeof opts.computedUrl === "string" && opts.computedUrl.startsWith("/")
      ? opts.computedUrl
      : null);
  const canonicalUrl = canonicalOverride || computedFallback || null;

  const ogImage = shareImageUrl(opts.ogImageUrl);
  const ogTitle = ogTitleOverride || title;
  const ogDescription = ogDescriptionOverride || description;

  const robotsDecision = resolveRobots({
    dataEnvironment: opts.dataEnvironment,
    publishState: opts.publishState,
    forceNoindex: opts.forceNoindex,
    robotsOverride: opts.robotsOverride,
  });
  const noindex = robotsDecision.noindex;

  const sitemapOverride = normalizeSitemapInclude(opts.sitemapIncludeOverride);
  const includeInSitemap = noindex ? false : sitemapOverride !== false;

  return {
    title: title || "",
    description: description || "",
    canonicalUrl: canonicalUrl || "",
    ogType: "website",
    ogTitle: ogTitle || "",
    ogDescription: ogDescription || "",
    ogUrl: canonicalUrl || "",
    ogImageUrl: ogImage || null,
    ogImageAlt: metaText(opts.ogImageAlt, LIMITS.DESCRIPTION) || "",
    ogSiteName: siteName || "",
    twitterCard: ogImage ? TWITTER_CARD.SUMMARY_LARGE_IMAGE : TWITTER_CARD.SUMMARY,
    twitterTitle: ogTitle || "",
    twitterDescription: ogDescription || "",
    twitterImageUrl: ogImage || null,
    robots: noindex ? ROBOTS_DIRECTIVE.NOINDEX : ROBOTS_DIRECTIVE.INDEX,
    noindex,
    robotsLocked: robotsDecision.locked,
    robotsReason: robotsDecision.reason,
    includeInSitemap,
    titleAttr: escapeAttr(title || ""),
    descriptionAttr: escapeAttr(description || ""),
    canonicalAttr: escapeAttr(canonicalUrl || ""),
  };
}

module.exports = {
  SEO_FIELDS,
  LIMITS,
  ROBOTS_VALUES,
  ROBOTS_DIRECTIVE,
  TWITTER_CARD,
  NOINDEX_ENVIRONMENTS,
  metaText,
  absoluteHttpsUrl,
  shareImageUrl,
  normalizeRobots,
  normalizeSitemapInclude,
  resolveRobots,
  buildWebsiteSeo,
};
