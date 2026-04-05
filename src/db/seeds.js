"use strict";

function seedCategoriesForTenant(db, destTenantId, srcTenantId) {
  const n = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(destTenantId).c;
  if (n > 0) return;
  const rows = db.prepare("SELECT slug, name, sort FROM categories WHERE tenant_id = ? ORDER BY sort ASC").all(srcTenantId);
  const ins = db.prepare(
    "INSERT INTO categories (tenant_id, slug, name, sort, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
  );
  for (const r of rows) {
    ins.run(destTenantId, r.slug, r.name, r.sort);
  }
}

module.exports = { seedCategoriesForTenant };
