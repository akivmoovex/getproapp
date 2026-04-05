"use strict";

/**
 * Drops indexes superseded by query_pattern_indexes_v1 composites.
 * Safe: all app queries scope companies by tenant_id; leads tenant scans use (tenant_id, created_at);
 * reviews app paths filter by company_id first (see docs/SQLITE_INDEX_STRATEGY.md).
 *
 * Idempotent: DROP INDEX IF EXISTS; gated by _getpro_migrations.
 */
module.exports = function run(db) {
  try {
    if (!db.prepare("SELECT 1 FROM _getpro_migrations WHERE id = ?").get("drop_redundant_indexes_v1")) {
      db.exec(`
        DROP INDEX IF EXISTS idx_companies_category_id;
        DROP INDEX IF EXISTS idx_leads_tenant_id;
        DROP INDEX IF EXISTS idx_reviews_created_at;
      `);

      db.prepare("INSERT INTO _getpro_migrations (id) VALUES (?)").run("drop_redundant_indexes_v1");
      // eslint-disable-next-line no-console
      console.log(
        "[getpro] Migration: drop_redundant_indexes_v1 (removed idx_companies_category_id, idx_leads_tenant_id, idx_reviews_created_at)."
      );
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[getpro] drop_redundant_indexes_v1 migration:", e.message);
  }
};
