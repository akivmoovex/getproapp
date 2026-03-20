const { db } = require("../src/db");

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
    const insert = db.prepare("INSERT INTO categories (slug, name, sort) VALUES (?, ?, ?)");
    const tx = db.transaction(() => {
      defaults.forEach((c, i) => insert.run(c.slug, c.name, i * 10));
    });
    tx();
    // eslint-disable-next-line no-console
    console.log(`Seeded ${defaults.length} categories.`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`Categories already exist (${categoriesCount}), skipping.`);
  }

  if (!companiesCount) {
    const accounting = db.prepare("SELECT id FROM categories WHERE slug = 'accounting'").get();
    const subdomain = process.env.DEMO_COMPANY_SUBDOMAIN || "demo";
    db.prepare(
      `
      INSERT INTO companies
        (subdomain, name, category_id, headline, about, services, phone, email, location, featured_cta_label, featured_cta_phone)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Call us', ?)
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
      process.env.CALL_CENTER_PHONE || "+260000000000"
    );
    // eslint-disable-next-line no-console
    console.log("Seeded demo company.");
  } else {
    // eslint-disable-next-line no-console
    console.log(`Companies already exist (${companiesCount}), skipping demo company.`);
  }
}

main();

