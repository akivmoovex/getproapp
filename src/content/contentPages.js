/**
 * Editorial content helpers (formatting, URL builders).
 * Data access is PostgreSQL: `src/db/pg/contentPagesRepo.js`.
 */

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain-text body → safe HTML paragraphs and simple bullet blocks. */
function formatBodyToHtml(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const blocks = t.split(/\n\n+/);
  const parts = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.every((l) => l.startsWith("- ") || l.startsWith("• "))) {
      const items = lines.map((l) => l.replace(/^[-•]\s+/, ""));
      parts.push(
        `<ul class="content-prose__ul">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
      );
    } else {
      parts.push(`<p>${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`);
    }
  }
  return parts.join("\n");
}

function absolutePublicUrl(req, path) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  if (!host) return "";
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${proto}://${host}${p}`;
}

/** Canonical URL for a tenant-prefixed path (handles apex `tenantUrlPrefix` full host vs path-only). */
function canonicalUrlForTenant(req, path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const prefix = req.tenantUrlPrefix;
  if (prefix && String(prefix).startsWith("http")) {
    return `${String(prefix).replace(/\/$/, "")}${p}`;
  }
  return absolutePublicUrl(req, p);
}

module.exports = {
  escapeHtml,
  formatBodyToHtml,
  absolutePublicUrl,
  canonicalUrlForTenant,
};
