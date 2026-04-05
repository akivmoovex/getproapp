const { absolutePublicUrl } = require("../content/contentPages");

function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * @param {import('express').Request} req
 * @param {import('better-sqlite3').Database} db
 */
function buildSitemapXml(req, db) {
  const tenantId = req.tenant && req.tenant.id;
  if (!tenantId) return "";
  const base = absolutePublicUrl(req, "/").replace(/\/$/, "");
  const urls = [];

  urls.push({ loc: `${base}/`, changefreq: "weekly", priority: "1.0" });
  urls.push({ loc: `${base}/directory`, changefreq: "daily", priority: "0.9" });
  urls.push({ loc: `${base}/join`, changefreq: "monthly", priority: "0.6" });
  urls.push({ loc: `${base}/articles`, changefreq: "weekly", priority: "0.75" });
  urls.push({ loc: `${base}/guides`, changefreq: "weekly", priority: "0.75" });
  urls.push({ loc: `${base}/answers`, changefreq: "weekly", priority: "0.7" });

  const cats = db.prepare("SELECT slug FROM categories WHERE tenant_id = ?").all(tenantId);
  for (const c of cats) {
    urls.push({ loc: `${base}/category/${encodeURIComponent(c.slug)}`, changefreq: "weekly", priority: "0.8" });
  }

  const companies = db.prepare("SELECT id FROM companies WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 500").all(tenantId);
  for (const co of companies) {
    urls.push({ loc: `${base}/company/${co.id}`, changefreq: "weekly", priority: "0.7" });
  }

  const contentRows = db
    .prepare(
      "SELECT kind, slug FROM content_pages WHERE tenant_id = ? AND published = 1"
    )
    .all(tenantId);
  for (const row of contentRows) {
    const seg = row.kind === "article" ? "articles" : row.kind === "guide" ? "guides" : "answers";
    urls.push({
      loc: `${base}/${seg}/${encodeURIComponent(row.slug)}`,
      changefreq: "monthly",
      priority: row.kind === "faq" ? "0.65" : "0.75",
    });
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const u of urls) {
    lines.push("  <url>");
    lines.push(`    <loc>${escapeXml(u.loc)}</loc>`);
    if (u.changefreq) lines.push(`    <changefreq>${u.changefreq}</changefreq>`);
    if (u.priority) lines.push(`    <priority>${u.priority}</priority>`);
    lines.push("  </url>");
  }
  lines.push("</urlset>");
  return lines.join("\n");
}

function buildRobotsTxt(req) {
  const base = absolutePublicUrl(req, "/").replace(/\/$/, "");
  const sitemapUrl = `${base}/sitemap.xml`;
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /api/",
    "",
    `Sitemap: ${sitemapUrl}`,
    "",
  ].join("\n");
}

module.exports = { buildSitemapXml, buildRobotsTxt, escapeXml };
