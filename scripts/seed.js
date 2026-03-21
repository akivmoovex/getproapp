const { db } = require("../src/db");
const { TENANT_ZM, TENANT_DEMO } = require("../src/tenantIds");

function main() {
  const categoriesCount = db.prepare("SELECT COUNT(*) AS c FROM categories").get().c;
  const companiesCount = db.prepare("SELECT COUNT(*) AS c FROM companies").get().c;

  const defaults = [
    { slug: "accounting", name: "Accounting" },
    { slug: "lawyers", name: "Lawyers" },
    { slug: "carpenters", name: "Carpenters" },
    { slug: "electricians", name: "Electricians" },
    { slug: "plumbers", name: "Plumbers" },
    { slug: "catering", name: "Catering" },
    { slug: "beauty", name: "Beauty & Salons" },
    { slug: "health", name: "Clinics & Health" },
    { slug: "real-estate", name: "Real Estate" },
    { slug: "ict", name: "ICT & Tech" },
  ];

  if (!categoriesCount) {
    const insert = db.prepare("INSERT INTO categories (tenant_id, slug, name, sort) VALUES (?, ?, ?, ?)");
    const tx = db.transaction(() => {
      defaults.forEach((c, i) => insert.run(TENANT_ZM, c.slug, c.name, i * 10));
    });
    tx();
    // eslint-disable-next-line no-console
    console.log(`Seeded ${defaults.length} categories for Zambia (tenant_id ${TENANT_ZM}).`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`Categories already exist (${categoriesCount}), skipping.`);
  }

  const zmCats = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(TENANT_ZM).c;
  const demoCats = db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(TENANT_DEMO).c;
  if (zmCats > 0 && demoCats === 0) {
    const rows = db
      .prepare("SELECT slug, name, sort FROM categories WHERE tenant_id = ? ORDER BY sort ASC")
      .all(TENANT_ZM);
    const ins = db.prepare(
      "INSERT INTO categories (tenant_id, slug, name, sort, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
    );
    const tx = db.transaction(() => {
      for (const r of rows) {
        ins.run(TENANT_DEMO, r.slug, r.name, r.sort);
      }
    });
    tx();
    // eslint-disable-next-line no-console
    console.log(`Copied ${rows.length} categories to demo tenant (tenant_id ${TENANT_DEMO}).`);
  }

  if (!companiesCount) {
    const accounting = db
      .prepare("SELECT id FROM categories WHERE slug = 'accounting' AND tenant_id = ?")
      .get(TENANT_DEMO);
    const subdomain = process.env.DEMO_COMPANY_SUBDOMAIN || "sample-accounting";
    db.prepare(
      `
      INSERT INTO companies
        (subdomain, name, category_id, headline, about, services, phone, email, location, featured_cta_label, featured_cta_phone, tenant_id)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Call us', ?, ?)
      `
    ).run(
      subdomain,
      "Demo Accounting Services",
      accounting ? accounting.id : null,
      "Accurate bookkeeping, tax prep, and financial reports",
      "We help SMEs stay organized with clean accounts, timely invoicing, and reliable reporting.",
      "Bookkeeping & reconciliation\nTax preparation & filing\nMonthly financial statements\nBusiness advisory support",
      "+260000000001",
      "demo@example.com",
      "Lusaka, Zambia",
      process.env.CALL_CENTER_PHONE || "+260000000000",
      TENANT_DEMO
    );
    // eslint-disable-next-line no-console
    console.log(`Seeded demo company (tenant_id ${TENANT_DEMO}, subdomain ${subdomain}).`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`Companies already exist (${companiesCount}), skipping demo company.`);
  }
}

main();
