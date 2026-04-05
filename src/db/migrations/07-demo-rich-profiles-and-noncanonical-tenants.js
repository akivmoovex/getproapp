"use strict";
module.exports = function run(db) {/** One-time: rich demo profiles (gallery + hours) for demo tenant companies. */
try {
  const TID = require("../../tenants/tenantIds");
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("demo_company_profile_rich_v1")) {
    const demoTid = TID.TENANT_DEMO;
    const upd = db.prepare(`
      UPDATE companies SET
        years_experience = ?,
        service_areas = ?,
        hours_text = ?,
        gallery_json = ?,
        updated_at = datetime('now')
      WHERE tenant_id = ? AND subdomain = ?
    `);
    const seeds = [
      {
        sub: "demo-lusaka-spark",
        years: 8,
        areas: "Lusaka (CBD, Woodlands, Kabulonga, Roma)\nNearby: Chongwe (by arrangement)",
        hours: "Mon–Sat 08:00–18:00\nEmergency call-outs: Sun & public holidays (premium rates)",
        gallery: JSON.stringify([
          {
            url: "https://picsum.photos/seed/getpro-spark1/960/640",
            caption: "Distribution board upgrade — Woodlands",
          },
          {
            url: "https://picsum.photos/seed/getpro-spark2/960/640",
            caption: "Retail wiring — Cairo Road",
          },
          {
            url: "https://picsum.photos/seed/getpro-spark3/960/640",
            caption: "Safety inspection documentation",
          },
        ]),
      },
      {
        sub: "demo-lusaka-voltpro",
        years: 12,
        areas: "Lusaka industrial zones\nNdola & Kitwe (scheduled visits)",
        hours: "Mon–Fri 07:30–17:30\nClosed weekends",
        gallery: JSON.stringify([
          {
            url: "https://picsum.photos/seed/getpro-volt1/960/640",
            caption: "Warehouse lighting retrofit",
          },
          {
            url: "https://picsum.photos/seed/getpro-volt2/960/640",
            caption: "Three-phase distribution",
          },
        ]),
      },
      {
        sub: "demo-lusaka-flow",
        years: 6,
        areas: "Greater Lusaka\nKafue Road corridor",
        hours: "24/7 emergency line\nOffice: daily 07:00–20:00",
        gallery: JSON.stringify([
          {
            url: "https://picsum.photos/seed/getpro-flow1/960/640",
            caption: "Bathroom refit — leak-free guarantee",
          },
          {
            url: "https://picsum.photos/seed/getpro-flow2/960/640",
            caption: "Geyser installation",
          },
        ]),
      },
      {
        sub: "demo-kitwe-wire",
        years: 15,
        areas: "Kitwe & Kalulushi\nChingola (commercial projects)",
        hours: "Mon–Sat 08:00–17:00",
        gallery: JSON.stringify([
          {
            url: "https://picsum.photos/seed/getpro-kitwe1/960/640",
            caption: "Motor control cabinet",
          },
        ]),
      },
    ];
    for (const s of seeds) {
      const row = db.prepare("SELECT id FROM companies WHERE tenant_id = ? AND subdomain = ?").get(demoTid, s.sub);
      if (!row) continue;
      upd.run(s.years, s.areas, s.hours, s.gallery, demoTid, s.sub);
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("demo_company_profile_rich_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: demo company profile fields (gallery, hours, areas) updated.");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] demo company profile rich migration:", e.message);
}

/** One-time: delete super-admin–created tenants not in the canonical slug list (and their scoped data). */
try {
  const { CANONICAL_TENANT_SLUGS_LIST } = require("../../tenants/tenantIds");
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("delete_non_canonical_tenants_v1")) {
    const ph = CANONICAL_TENANT_SLUGS_LIST.map(() => "?").join(",");
    const orphans = db
      .prepare(`SELECT id FROM tenants WHERE slug NOT IN (${ph})`)
      .all(...CANONICAL_TENANT_SLUGS_LIST);
    if (orphans.length) {
      db.exec("PRAGMA foreign_keys = OFF");
      const tx = db.transaction(() => {
        for (const { id: tid } of orphans) {
          db.prepare("DELETE FROM leads WHERE tenant_id = ?").run(tid);
          db.prepare("DELETE FROM companies WHERE tenant_id = ?").run(tid);
          db.prepare("DELETE FROM categories WHERE tenant_id = ?").run(tid);
          db.prepare("DELETE FROM callback_interests WHERE tenant_id = ?").run(tid);
          db.prepare("DELETE FROM professional_signups WHERE tenant_id = ?").run(tid);
          db.prepare("DELETE FROM admin_users WHERE tenant_id = ?").run(tid);
          db.prepare("DELETE FROM tenants WHERE id = ?").run(tid);
        }
      });
      tx();
      db.exec("PRAGMA foreign_keys = ON");
      // eslint-disable-next-line no-console
      console.log(`[getpro] Migration: removed ${orphans.length} non-canonical tenant(s).`);
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("delete_non_canonical_tenants_v1");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] delete non-canonical tenants migration:", e.message);
}
};
