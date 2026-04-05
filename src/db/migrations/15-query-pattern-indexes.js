"use strict";

/**
 * Indexes derived from actual WHERE / JOIN / ORDER BY usage in application code.
 * All CREATE INDEX IF NOT EXISTS — idempotent.
 *
 * @see docs/SQLITE_INDEX_STRATEGY.md
 */
module.exports = function run(db) {
  try {
    if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("query_pattern_indexes_v1")) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_companies_tenant_updated_at ON companies(tenant_id, updated_at);
        CREATE INDEX IF NOT EXISTS idx_companies_tenant_name ON companies(tenant_id, name);
        CREATE INDEX IF NOT EXISTS idx_companies_tenant_category ON companies(tenant_id, category_id);

        CREATE INDEX IF NOT EXISTS idx_leads_tenant_created_at ON leads(tenant_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_leads_tenant_company_created ON leads(tenant_id, company_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_callback_interests_tenant_created ON callback_interests(tenant_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_professional_signups_tenant_created ON professional_signups(tenant_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_categories_tenant_sort_name ON categories(tenant_id, sort, name);

        CREATE INDEX IF NOT EXISTS idx_content_pages_tenant_kind_published_sort
          ON content_pages(tenant_id, kind, published, sort_order);

        CREATE INDEX IF NOT EXISTS idx_reviews_company_created ON reviews(company_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_tenant_cities_tenant_name ON tenant_cities(tenant_id, name COLLATE NOCASE);

        CREATE INDEX IF NOT EXISTS idx_intake_client_projects_tenant_created ON intake_client_projects(tenant_id, created_at);
      `);

      db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("query_pattern_indexes_v1");
      // eslint-disable-next-line no-console
      console.log("[getpro] Migration: query_pattern_indexes_v1 (evidence-based query indexes).");
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[getpro] query_pattern_indexes_v1 migration:", e.message);
  }
};
