"use strict";
module.exports = function run(db) {/** One-time: remap legacy tenant ids to global=1, demo=2, il=3, zm=4, zw=5, bw=6, za=7, na=8. */
try {
  const TID = require("../../tenants/tenantIds");
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("tenant_id_layout_v1")) {
    const gm = db.prepare("SELECT id FROM tenants WHERE slug = 'global'").get();
    const zm = db.prepare("SELECT id FROM tenants WHERE slug = 'zm'").get();
    const dm = db.prepare("SELECT id FROM tenants WHERE slug = 'demo'").get();
    const layoutOk =
      gm && gm.id === TID.TENANT_GLOBAL &&
      zm && zm.id === TID.TENANT_ZM &&
      dm && dm.id === TID.TENANT_DEMO;

    if (layoutOk) {
      db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("tenant_id_layout_v1");
    } else {
      const SLUG_TO_ID = {
        global: TID.TENANT_GLOBAL,
        demo: TID.TENANT_DEMO,
        il: TID.TENANT_IL,
        zm: TID.TENANT_ZM,
        zw: TID.TENANT_ZW,
        bw: TID.TENANT_BW,
        za: TID.TENANT_ZA,
        na: TID.TENANT_NA,
      };
      const SLUG_ORDER = ["global", "demo", "il", "zm", "zw", "bw", "za", "na"];
      const OFFSET = 1000000;
      const fkTables = [
        ["companies", "tenant_id"],
        ["categories", "tenant_id"],
        ["leads", "tenant_id"],
        ["callback_interests", "tenant_id"],
        ["professional_signups", "tenant_id"],
      ];

      const tx = db.transaction(() => {
        if (!db.prepare("SELECT id FROM tenants WHERE slug = 'demo'").get()) {
          const maxRow = db.prepare("SELECT MAX(id) AS m FROM tenants").get();
          const nextId = (maxRow && maxRow.m ? Number(maxRow.m) : 0) + 1;
          db.prepare("INSERT INTO tenants (id, slug, name, stage) VALUES (?, 'demo', 'Demo', ?)").run(
            nextId,
            "Disabled"
          );
        }

        for (const [table, col] of fkTables) {
          const cols = db.prepare(`PRAGMA table_info(${table})`).all();
          if (!cols.some((c) => c.name === col)) continue;
          db.prepare(`UPDATE ${table} SET ${col} = ${col} + ? WHERE ${col} IS NOT NULL`).run(OFFSET);
        }
        const acols = db.prepare("PRAGMA table_info(admin_users)").all();
        const adminHasTid = acols.some((c) => c.name === "tenant_id");
        if (adminHasTid) {
          db.prepare("UPDATE admin_users SET tenant_id = tenant_id + ? WHERE tenant_id IS NOT NULL").run(OFFSET);
        }

        db.prepare("UPDATE tenants SET id = id + ?").run(OFFSET);

        const rows = db.prepare("SELECT id, slug FROM tenants").all();
        const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.id]));

        function rewriteFk(oldId, newId) {
          for (const [table, col] of fkTables) {
            const cols = db.prepare(`PRAGMA table_info(${table})`).all();
            if (!cols.some((c) => c.name === col)) continue;
            db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`).run(newId, oldId);
          }
          if (adminHasTid) {
            db.prepare("UPDATE admin_users SET tenant_id = ? WHERE tenant_id = ?").run(newId, oldId);
          }
        }

        for (const slug of SLUG_ORDER) {
          const wanted = SLUG_TO_ID[slug];
          if (wanted === undefined) continue;
          const oldShifted = bySlug[slug];
          if (oldShifted == null || oldShifted === wanted) continue;
          rewriteFk(oldShifted, wanted);
          db.prepare("UPDATE tenants SET id = ? WHERE id = ?").run(wanted, oldShifted);
          bySlug[slug] = wanted;
        }
      });

      db.exec("PRAGMA foreign_keys = OFF");
      tx();
      db.exec("PRAGMA foreign_keys = ON");

      db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("tenant_id_layout_v1");
      // eslint-disable-next-line no-console
      console.log("[getpro] Migration: tenant ids remapped to canonical layout (global=1 … zm=4 …).");
    }
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] tenant_id_layout migration:", e.message);
}
};
