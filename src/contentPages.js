/**
 * Editorial content (articles, guides, FAQ) — tenant-scoped.
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

function listPublishedByKind(db, tenantId, kind) {
  return db
    .prepare(
      `
      SELECT id, slug, title, excerpt, sort_order, updated_at, hero_image_url, hero_image_alt,
             substr(body, 1, 320) AS body_preview
      FROM content_pages
      WHERE tenant_id = ? AND kind = ? AND published = 1
      ORDER BY sort_order ASC, title ASC
      `
    )
    .all(tenantId, kind);
}

function getBySlug(db, tenantId, kind, slug, opts = {}) {
  const { allowDraft = false } = opts;
  const row = db
    .prepare(
      `
      SELECT * FROM content_pages
      WHERE tenant_id = ? AND kind = ? AND slug = ?
      `
    )
    .get(tenantId, kind, slug);
  if (!row) return null;
  if (!allowDraft && !row.published) return null;
  return row;
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

function listAllByKind(db, tenantId, kind) {
  return db
    .prepare(
      `
      SELECT * FROM content_pages
      WHERE tenant_id = ? AND kind = ?
      ORDER BY sort_order ASC, title ASC
      `
    )
    .all(tenantId, kind);
}

function getById(db, tenantId, id) {
  return db.prepare("SELECT * FROM content_pages WHERE id = ? AND tenant_id = ?").get(id, tenantId);
}

/** Raw row by slug (includes drafts). */
function getRowBySlug(db, tenantId, kind, slug) {
  return db.prepare("SELECT * FROM content_pages WHERE tenant_id = ? AND kind = ? AND slug = ?").get(tenantId, kind, slug);
}

module.exports = {
  escapeHtml,
  formatBodyToHtml,
  listPublishedByKind,
  listAllByKind,
  getBySlug,
  getById,
  getRowBySlug,
  absolutePublicUrl,
  canonicalUrlForTenant,
};
