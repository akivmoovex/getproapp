"use strict";

/**
 * Shared sitemap.xml / robots.txt output for the V7 website engine.
 *
 * Both products feed absolute URLs in and get identical, escaped output.
 * Inclusion decisions belong to the SEO model (see seoModel.includeInSitemap);
 * this module only formats.
 */

const DEFAULT_DISALLOW = Object.freeze([
  "/app/",
  "/hq/",
  "/admin",
  "/login",
  "/register",
  "/member/",
  "/leader/",
]);

function escapeXml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * @param {Array<string|{loc: string, lastmod?: string|Date|null}>} entries
 * @returns {string}
 */
function buildSitemapXml(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const seen = new Set();
  const body = [];

  for (const entry of list) {
    const loc = typeof entry === "string" ? entry : entry && entry.loc;
    const clean = String(loc == null ? "" : loc).trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);

    let lastmod = "";
    const rawLastmod = entry && typeof entry === "object" ? entry.lastmod : null;
    if (rawLastmod) {
      const when = rawLastmod instanceof Date ? rawLastmod : new Date(rawLastmod);
      if (!Number.isNaN(when.getTime())) lastmod = when.toISOString().slice(0, 10);
    }

    body.push(
      lastmod
        ? `  <url>\n    <loc>${escapeXml(clean)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`
        : `  <url>\n    <loc>${escapeXml(clean)}</loc>\n  </url>`
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body.join("\n")}\n</urlset>\n`;
}

/**
 * @param {{
 *   allow?: boolean,
 *   disallowPaths?: string[],
 *   sitemapUrl?: string|null,
 * }} input
 * @returns {string}
 */
function buildRobotsTxt(input) {
  const opts = input && typeof input === "object" ? input : {};
  const lines = ["User-agent: *"];

  if (opts.allow === false) {
    lines.push("Disallow: /");
  } else {
    lines.push("Allow: /");
    const disallow = Array.isArray(opts.disallowPaths)
      ? opts.disallowPaths
      : DEFAULT_DISALLOW;
    for (const path of disallow) {
      const clean = String(path == null ? "" : path).trim();
      if (!clean || /\s/.test(clean) || !clean.startsWith("/")) continue;
      lines.push(`Disallow: ${clean}`);
    }
  }

  // A fully blocked site must not advertise a sitemap.
  const sitemapUrl =
    opts.allow === false || !opts.sitemapUrl ? "" : String(opts.sitemapUrl).trim();
  if (sitemapUrl && /^https?:\/\//i.test(sitemapUrl) && !/\s/.test(sitemapUrl)) {
    lines.push("");
    lines.push(`Sitemap: ${sitemapUrl}`);
  }

  lines.push("");
  return lines.join("\n");
}

module.exports = {
  DEFAULT_DISALLOW,
  escapeXml,
  buildSitemapXml,
  buildRobotsTxt,
};
