"use strict";
const { seedCategoriesForTenant } = require("../seeds");
module.exports = function run(db) {/** One-time: ensure every Enabled tenant has professions copied from Zambia when empty (fixes gaps after manual deletes or failed seeds). */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("repair_empty_categories_enabled_tenants_v1")) {
    const zmId = 4;
    const enabled = db.prepare("SELECT id FROM tenants WHERE stage = 'Enabled'").all();
    let repaired = 0;
    for (const { id } of enabled) {
      const n = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(id).c;
      if (Number(n) > 0) continue;
      seedCategoriesForTenant(db, id, zmId);
      repaired += 1;
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("repair_empty_categories_enabled_tenants_v1");
    if (repaired > 0) {
      // eslint-disable-next-line no-console
      console.log(`[getpro] Migration: copied professions from zm for ${repaired} enabled tenant(s) that had none.`);
    }
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] repair empty categories migration:", e.message);
}

/** One-time: directory company detail page fields (gallery JSON, hours, service areas). */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("companies_profile_columns_v1")) {
    const cols = db.prepare("PRAGMA table_info(companies)").all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("years_experience")) db.exec(`ALTER TABLE companies ADD COLUMN years_experience INTEGER`);
    if (!names.has("service_areas"))
      db.exec(`ALTER TABLE companies ADD COLUMN service_areas TEXT NOT NULL DEFAULT ''`);
    if (!names.has("hours_text")) db.exec(`ALTER TABLE companies ADD COLUMN hours_text TEXT NOT NULL DEFAULT ''`);
    if (!names.has("gallery_json")) db.exec(`ALTER TABLE companies ADD COLUMN gallery_json TEXT NOT NULL DEFAULT '[]'`);
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("companies_profile_columns_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] companies profile columns migration:", e.message);
}

/** One-time: company logo URL for directory / mini-site header. */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("companies_logo_url_v1")) {
    const cols = db.prepare("PRAGMA table_info(companies)").all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("logo_url")) db.exec(`ALTER TABLE companies ADD COLUMN logo_url TEXT NOT NULL DEFAULT ''`);
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("companies_logo_url_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] companies logo_url migration:", e.message);
}
};
