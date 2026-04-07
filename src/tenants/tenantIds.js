/**
 * Canonical numeric tenant ids (historically aligned with SQLite `tenants.id` and legacy seed rows — see Git history for removed `src/db/schema.js`).
 * Runtime uses PostgreSQL; keep these constants consistent with `public.tenants` data and any legacy SQLite tooling.
 */
const CANONICAL_TENANT_SLUGS_LIST = ["global", "demo", "il", "zm", "zw", "bw", "za", "na"];

module.exports = {
  TENANT_GLOBAL: 1,
  TENANT_DEMO: 2,
  TENANT_IL: 3,
  TENANT_ZM: 4,
  TENANT_ZW: 5,
  TENANT_BW: 6,
  TENANT_ZA: 7,
  TENANT_NA: 8,
  CANONICAL_TENANT_SLUGS_LIST,
};
