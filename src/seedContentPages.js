/**
 * One-time seed of editorial content (Zambia tenant) from data/content/manifest.json + .txt bodies.
 */
const fs = require("fs");
const path = require("path");
const { TENANT_ZM } = require("./tenantIds");

const MANIFEST = path.join(__dirname, "../data/content/manifest.json");

function seedContentPages(db) {
  const TENANT_ID = TENANT_ZM;
  const n = db.prepare("SELECT COUNT(*) AS c FROM content_pages WHERE tenant_id = ?").get(TENANT_ID).c;
  if (n > 0) return;

  if (!fs.existsSync(MANIFEST)) {
    // eslint-disable-next-line no-console
    console.warn("[getpro] seedContentPages: manifest not found, skipping.");
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const dir = path.dirname(MANIFEST);
  const ins = db.prepare(
    `
    INSERT INTO content_pages (
      tenant_id, kind, slug, title, excerpt, body, hero_image_url, hero_image_alt,
      seo_title, seo_description, published, sort_order, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))
    `
  );

  for (const item of manifest.items) {
    const bodyPath = path.join(dir, item.bodyFile);
    const body = fs.existsSync(bodyPath) ? fs.readFileSync(bodyPath, "utf8") : "";
    let excerpt = item.excerpt || "";
    if (!excerpt && body) {
      excerpt = body.split(/\n\n+/)[0].trim().slice(0, 320);
    }
    ins.run(
      TENANT_ID,
      item.kind,
      item.slug,
      item.title,
      excerpt,
      body,
      item.hero_image_url || "",
      item.hero_image_alt || "",
      item.seo_title || item.title,
      item.seo_description || excerpt,
      item.sort_order != null ? item.sort_order : 0
    );
  }

  // eslint-disable-next-line no-console
  console.log(`[getpro] Seeded ${manifest.items.length} content_pages rows for tenant_id=${TENANT_ID}.`);
}

module.exports = { seedContentPages };
