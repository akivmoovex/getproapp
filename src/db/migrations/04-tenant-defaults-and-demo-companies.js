"use strict";
module.exports = function run(db) {/** One-time: only Global + Zambia stay enabled; other regions disabled (re-enable via admin + optional env). */
try {
  const ran = db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("disable_tenants_except_global_zm_v1");
  if (!ran && process.env.GETPRO_SKIP_TENANT_REGION_LOCK !== "1") {
    db.prepare("UPDATE tenants SET stage = ? WHERE slug NOT IN ('global', 'zm')").run("Disabled");
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("disable_tenants_except_global_zm_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: disabled all tenants except global and zm (set GETPRO_SKIP_TENANT_REGION_LOCK=1 before first boot to skip).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] tenant region lock migration:", e.message);
}

/** One-time: demo enabled for demo.{BASE_DOMAIN} (not listed in region picker); South Africa disabled by default. */
try {
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("tenant_demo_enabled_za_disabled_v1")) {
    db.prepare("UPDATE tenants SET stage = ? WHERE slug = 'demo'").run("Enabled");
    db.prepare("UPDATE tenants SET stage = ? WHERE slug = 'za'").run("Disabled");
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("tenant_demo_enabled_za_disabled_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: demo tenant enabled, za disabled (defaults).");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] tenant demo/za defaults migration:", e.message);
}

/** One-time: sample companies for demo tenant (directory search + card UI tests). */
try {
  const TID = require("../../tenants/tenantIds");
  const demoTenantId = TID.TENANT_DEMO;
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("demo_seed_sample_companies_v1")) {
    const elCat = db
      .prepare("SELECT id FROM categories WHERE tenant_id = ? AND slug = 'electricians'")
      .get(demoTenantId);
    const plCat = db
      .prepare("SELECT id FROM categories WHERE tenant_id = ? AND slug = 'plumbers'")
      .get(demoTenantId);
    const ins = db.prepare(`
      INSERT INTO companies
        (subdomain, name, category_id, headline, about, services, phone, email, location, featured_cta_label, featured_cta_phone, tenant_id, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Call us', ?, ?, datetime('now'))
    `);
    const seeds = [
      {
        sub: "demo-lusaka-spark",
        name: "Spark Electric Lusaka",
        cat: elCat,
        headline: "Licensed electricians for homes and businesses",
        about:
          "Full-service electrical installations, repairs, and safety inspections. Electrician services across Lusaka with same-week callouts.",
        services: "Rewiring\nPanel upgrades\nEmergency Electrician callouts",
        phone: "+260211000101",
        email: "info@getproapp.org",
        loc: "Lusaka, Zambia",
        cta: "+260211000101",
      },
      {
        sub: "demo-lusaka-voltpro",
        name: "VoltPro Electrical",
        cat: elCat,
        headline: "Commercial & industrial Electrician work",
        about:
          "Retail fit-outs, warehouses, and backup power. Search Electrician Lusaka — we cover CBD and Woodlands.",
        services: "Three-phase installs\nLighting design\nCompliance certificates",
        phone: "+260211000102",
        email: "info@getproapp.org",
        loc: "Lusaka",
        cta: "+260211000102",
      },
      {
        sub: "demo-lusaka-flow",
        name: "FlowRight Plumbing",
        cat: plCat,
        headline: "Emergency plumbers in Lusaka",
        about: "Burst pipes, geysers, and bathroom refits. Fast response in Lusaka and nearby areas.",
        services: "Leak detection\nDrain clearing\nBathroom installs",
        phone: "+260211000103",
        email: "info@getproapp.org",
        loc: "Lusaka, Zambia",
        cta: "+260211000103",
      },
      {
        sub: "demo-kitwe-wire",
        name: "Copperbelt Electric Co",
        cat: elCat,
        headline: "Electrician services in Kitwe",
        about: "Industrial Electrician support — not in Lusaka; used to test city filters.",
        services: "Motor control\nCabling\nMaintenance",
        phone: "+260212000201",
        email: "info@getproapp.org",
        loc: "Kitwe, Zambia",
        cta: "+260212000201",
      },
    ];
    let added = 0;
    for (const r of seeds) {
      if (db.prepare("SELECT 1 FROM companies WHERE subdomain = ?").get(r.sub)) continue;
      ins.run(
        r.sub,
        r.name,
        r.cat ? r.cat.id : null,
        r.headline,
        r.about,
        r.services,
        r.phone,
        r.email,
        r.loc,
        r.cta,
        demoTenantId
      );
      added += 1;
    }
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("demo_seed_sample_companies_v1");
    if (added > 0) {
      // eslint-disable-next-line no-console
      console.log(`[getpro] Migration: seeded ${added} demo tenant sample compan(y/ies).`);
    }
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] demo sample companies migration:", e.message);
}
};
