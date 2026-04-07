/**
 * Per-tenant city list for join autocomplete, watermarks, and admin.
 * Rows: enabled (directory/join eligibility), big_city (rotating watermark hints).
 */

const tenantCitiesRepo = require("../db/pg/tenantCitiesRepo");

/**
 * For templates: enabled/bigCity as 0/1 (same shape as legacy SQLite row).
 * @param {import("pg").Pool} pool
 */
async function getTenantCitiesForClientAsync(pool, tenantId) {
  const tid = Number(tenantId);
  if (!tid) return [];
  const rows = await tenantCitiesRepo.listByTenantIdOrderByName(pool, tid);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled ? 1 : 0,
    bigCity: r.big_city ? 1 : 0,
  }));
}

/**
 * Pipe-separated phrases for step-2 rotating watermark: "Search: Lusaka|Search: Kitwe"
 * @param {import("pg").Pool} pool
 */
async function getJoinCityWatermarkRotateAsync(pool, tenantId) {
  const rows = await tenantCitiesRepo.listByTenantIdOrderByName(pool, Number(tenantId));
  const filtered = rows.filter((r) => r.enabled && r.big_city);
  if (!filtered.length) {
    return "Search: Lusaka|Search: Kitwe|Search: Ndola";
  }
  return filtered.map((r) => `Search: ${r.name}`).join("|");
}

module.exports = {
  getTenantCitiesForClientAsync,
  getJoinCityWatermarkRotateAsync,
};
