/**
 * Regional directory company profile URLs and gallery (JSON in `companies.gallery_json`).
 */

function companyProfileHref(req, companyId) {
  const id = Number(companyId);
  if (!id || id < 1) return "/company";
  const p = req.tenantUrlPrefix;
  const tail = `/company/${id}`;
  if (!p) return tail;
  if (p.startsWith("http")) return `${p.replace(/\/$/, "")}${tail}`;
  return `${String(p).replace(/\/$/, "")}${tail}`;
}

function parseGalleryJson(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  try {
    const j = JSON.parse(s);
    if (!Array.isArray(j)) return [];
    return j
      .map((x) => {
        if (typeof x === "string") return { url: x.trim(), caption: "" };
        if (x && typeof x.url === "string")
          return { url: x.url.trim(), caption: String(x.caption || "").trim() };
        return null;
      })
      .filter((x) => x && x.url);
  } catch {
    return [];
  }
}

function galleryToAdminText(items) {
  if (!items || !items.length) return "";
  return items
    .map((x) => (x.caption ? `${x.url}|${x.caption}` : x.url))
    .join("\n");
}

/** One URL per line; optional caption after | */
function parseGalleryAdminText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out = [];
  for (const line of lines) {
    const pipe = line.indexOf("|");
    if (pipe === -1) out.push({ url: line, caption: "" });
    else out.push({ url: line.slice(0, pipe).trim(), caption: line.slice(pipe + 1).trim() });
  }
  return out.filter((x) => x.url);
}

function absoluteCompanyProfileUrl(tenantSlug, companyId) {
  const base = (process.env.BASE_DOMAIN || "").trim();
  const scheme = process.env.PUBLIC_SCHEME || "https";
  const id = Number(companyId);
  if (!id || id < 1) return "/company";
  if (!base || !tenantSlug) return `/company/${id}`;
  return `${scheme}://${String(tenantSlug).toLowerCase()}.${base}/company/${id}`;
}

function formatReviewDateLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Public mini-site URL: {tenant}.{BASE}/{subdomain} (e.g. demo.getproapp.org/demo-lusaka-spark).
 * Without BASE_DOMAIN, returns a same-origin path /{subdomain} for local dev.
 */
function buildCompanyMiniSiteUrl(tenantSlug, subdomain, baseDomain) {
  const sub = String(subdomain || "").trim();
  const ts = String(tenantSlug || "").trim().toLowerCase();
  if (!sub || !ts) return "#";
  const base = String(baseDomain || "").trim();
  const scheme = process.env.PUBLIC_SCHEME || "https";
  if (!base) return `/${encodeURIComponent(sub)}`;
  return `${scheme}://${ts}.${base}/${encodeURIComponent(sub)}`;
}

/** Human-readable host/path for labels (no scheme). */
function companyMiniSiteLabel(tenantSlug, subdomain, baseDomain) {
  const sub = String(subdomain || "").trim();
  const ts = String(tenantSlug || "").trim().toLowerCase();
  if (!sub || !ts) return "";
  const base = String(baseDomain || "").trim();
  if (!base) return `/${sub}`;
  return `${ts}.${base}/${sub}`;
}

module.exports = {
  companyProfileHref,
  parseGalleryJson,
  galleryToAdminText,
  parseGalleryAdminText,
  absoluteCompanyProfileUrl,
  formatReviewDateLabel,
  buildCompanyMiniSiteUrl,
  companyMiniSiteLabel,
};
