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

module.exports = {
  companyProfileHref,
  parseGalleryJson,
  galleryToAdminText,
  parseGalleryAdminText,
  absoluteCompanyProfileUrl,
  formatReviewDateLabel,
};
