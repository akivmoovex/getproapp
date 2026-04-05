"use strict";
const { seedCategoriesForTenant } = require("../seeds");
module.exports = function run(db) {/**
 * One-time: if Zambia has no professions, seed a canonical list, then copy to every tenant
 * that still has none (fixes empty admin Professions + directory categories on fresh or partial DBs).
 */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("ensure_canonical_categories_all_tenants_v1")) {
    const zmId = 4;
    const zmCount = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(zmId).c;
    if (Number(zmCount) === 0) {
      const rows = [
        ["electricians", "Electricians", 10],
        ["plumbers", "Plumbers", 20],
        ["builders", "Builders", 30],
        ["carpenters", "Carpenters", 40],
        ["painters", "Painters", 50],
        ["hvac", "HVAC", 60],
        ["locksmiths", "Locksmiths", 70],
        ["roofers", "Roofers", 80],
        ["gardeners", "Gardeners", 90],
        ["cleaners", "Cleaners", 100],
        ["handymen", "Handymen", 110],
        ["welders", "Welders", 120],
      ];
      const ins = db.prepare(
        "INSERT INTO categories (tenant_id, slug, name, sort, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
      );
      const tx = db.transaction(() => {
        for (const [slug, name, sort] of rows) {
          ins.run(zmId, slug, name, sort);
        }
      });
      tx();
      // eslint-disable-next-line no-console
      console.log("[getpro] Migration: seeded canonical professions for Zambia (zm).");
    }
    const destIds = [1, 2, 3, 5, 6, 7, 8];
    for (const tid of destIds) {
      seedCategoriesForTenant(db, tid, zmId);
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("ensure_canonical_categories_all_tenants_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: ensured categories copied from zm to tenants that had none.");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] ensure canonical categories migration:", e.message);
}

try {
  const newIds = [3, 5, 6, 7, 8];
  const src = 4;
  for (const tid of newIds) {
    const n = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(tid).c;
    if (n > 0) continue;
    const rows = db.prepare("SELECT slug, name, sort FROM categories WHERE tenant_id = ? ORDER BY sort ASC").all(src);
    const ins = db.prepare(
      "INSERT INTO categories (tenant_id, slug, name, sort, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
    );
    for (const r of rows) {
      ins.run(tid, r.slug, r.name, r.sort);
    }
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] regional tenant category seed:", e.message);
}

try {
  seedCategoriesForTenant(db, 1, 4);
  seedCategoriesForTenant(db, 2, 4);
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] global/demo category seed:", e.message);
}
};
