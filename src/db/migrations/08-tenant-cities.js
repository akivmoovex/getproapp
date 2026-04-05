"use strict";
const path = require("path");
const fs = require("fs");
module.exports = function run(db) {/** Per-tenant cities: join autocomplete, enabled flag, big-city watermark rotation. */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      big_city INTEGER NOT NULL DEFAULT 0,
      UNIQUE(tenant_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_cities_tenant_id ON tenant_cities(tenant_id);
  `);
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] tenant_cities create:", e.message);
}

try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("tenant_cities_seed_zm_v1")) {
    const zmId = 4;
    const n = db.prepare("SELECT COUNT(*) AS c FROM tenant_cities WHERE tenant_id = ?").get(zmId).c;
    if (n === 0) {
      const listPath = path.join(__dirname, "..", "..", "..", "public", "data", "search-lists.json");
      if (fs.existsSync(listPath)) {
        const j = JSON.parse(fs.readFileSync(listPath, "utf8"));
        const cities = Array.isArray(j.cities) ? j.cities : [];
        const big = new Set(["Lusaka", "Kitwe", "Ndola", "Livingstone", "Kabwe"]);
        const ins = db.prepare(
          "INSERT INTO tenant_cities (tenant_id, name, enabled, big_city) VALUES (?, ?, 1, ?)"
        );
        const tx = db.transaction(() => {
          for (const raw of cities) {
            const name = String(raw || "").trim();
            if (!name) continue;
            ins.run(zmId, name, big.has(name) ? 1 : 0);
          }
        });
        tx();
        // eslint-disable-next-line no-console
        console.log(`[getpro] Seeded tenant_cities for Zambia (${cities.length} rows).`);
      }
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("tenant_cities_seed_zm_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] tenant_cities seed:", e.message);
}

/** One-time: copy Zambia city list to demo tenant when demo has no cities (admin Cities tab + join autocomplete). */
try {
  const TID = require("../../tenants/tenantIds");
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("demo_tenant_cities_copy_from_zm_v1")) {
    const demoId = TID.TENANT_DEMO;
    const zmId = TID.TENANT_ZM;
    const nDemo = db.prepare("SELECT COUNT(*) AS c FROM tenant_cities WHERE tenant_id = ?").get(demoId).c;
    if (Number(nDemo) === 0) {
      const rows = db
        .prepare("SELECT name, enabled, big_city FROM tenant_cities WHERE tenant_id = ? ORDER BY name COLLATE NOCASE ASC")
        .all(zmId);
      if (rows.length) {
        const ins = db.prepare(
          "INSERT INTO tenant_cities (tenant_id, name, enabled, big_city) VALUES (?, ?, ?, ?)"
        );
        const tx = db.transaction(() => {
          for (const r of rows) {
            ins.run(demoId, r.name, r.enabled, r.big_city);
          }
        });
        tx();
        // eslint-disable-next-line no-console
        console.log(`[getpro] Migration: copied ${rows.length} cities to demo tenant for admin/join.`);
      }
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("demo_tenant_cities_copy_from_zm_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] demo tenant_cities copy migration:", e.message);
}
};
