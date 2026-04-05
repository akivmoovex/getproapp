"use strict";

/**
 * Base indexes for the original core tables (`companies`, `leads`).
 * Runs immediately after `applyBaseSchema` and before migrations — same effective order as the monolithic db.js batch.
 *
 * `companies(category_id)` alone is not created here — use `idx_companies_tenant_category` from migration 15.
 * Incremental indexes remain in `migrations/*.js` next to their features (`CREATE INDEX IF NOT EXISTS`).
 */
function applyBaseIndexes(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_leads_company_id ON leads(company_id);
  `);
}

module.exports = { applyBaseIndexes };
