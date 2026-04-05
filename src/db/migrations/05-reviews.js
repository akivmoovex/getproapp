"use strict";
module.exports = function run(db) {/** Customer reviews (directory cards: all-time average + count; best review in last 90 days). */
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      rating REAL NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      author_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (rating >= 1 AND rating <= 5)
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_company_id ON reviews(company_id);
    /* idx_reviews_created_at: superseded by idx_reviews_company_created (migration 15). */
  `);
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] reviews table:", e.message);
}

/** One-time: seed demo reviews (mixed dates so “last 3 months” highlight differs from all-time average). */
try {
  const TID = require("../../tenants/tenantIds");
  if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("reviews_seed_demo_v1")) {
    const demoTenantId = TID.TENANT_DEMO;
    const ins = db.prepare(`
      INSERT INTO reviews (company_id, rating, body, author_name, created_at)
      VALUES (?, ?, ?, ?, datetime('now', ?))
    `);
    const companyId = (sub) => {
      const row = db
        .prepare("SELECT id FROM companies WHERE tenant_id = ? AND subdomain = ?")
        .get(demoTenantId, sub);
      return row ? row.id : null;
    };
    const tx = db.transaction(() => {
      const spark = companyId("demo-lusaka-spark");
      if (spark) {
        ins.run(
          spark,
          5,
          "Excellent work on our consumer unit upgrade — clear quote, finished on time.",
          "Mwansa K.",
          "-14 days"
        );
        ins.run(
          spark,
          4.5,
          "Professional and tidy. Would use again for rewiring.",
          "Grace T.",
          "-72 days"
        );
        ins.run(
          spark,
          4,
          "Good service overall; one follow-up visit needed for a minor issue.",
          "Peter N.",
          "-120 days"
        );
      }
      const volt = companyId("demo-lusaka-voltpro");
      if (volt) {
        ins.run(
          volt,
          5,
          "Handled our warehouse lighting and backup — minimal downtime. Top team.",
          "Lubinda R.",
          "-8 days"
        );
        ins.run(
          volt,
          4.8,
          "Commercial install was compliant and well documented.",
          "Anita B.",
          "-55 days"
        );
        ins.run(
          volt,
          4.2,
          "Solid industrial work; scheduling was tight but they delivered.",
          "David C.",
          "-400 days"
        );
      }
      const flow = companyId("demo-lusaka-flow");
      if (flow) {
        ins.run(
          flow,
          5,
          "Emergency leak fixed fast — plumber arrived within the hour.",
          "Chileshe M.",
          "-20 days"
        );
        ins.run(
          flow,
          4.9,
          "Bathroom refit looks great. Fair pricing.",
          "Mutale S.",
          "-60 days"
        );
        ins.run(
          flow,
          3.5,
          "OK service; communication could improve.",
          "Anonymous",
          "-95 days"
        );
      }
      const kitwe = companyId("demo-kitwe-wire");
      if (kitwe) {
        ins.run(
          kitwe,
          4.7,
          "Reliable for motor control and cabling on our line.",
          "Foreman J.",
          "-25 days"
        );
        ins.run(
          kitwe,
          4,
          "Good technical support for industrial maintenance.",
          "Plant Ops",
          "-300 days"
        );
      }
    });
    tx();
    db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("reviews_seed_demo_v1");
    // eslint-disable-next-line no-console
    console.log("[getpro] Migration: seeded demo tenant reviews.");
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("[getpro] reviews demo seed migration:", e.message);
}
};
