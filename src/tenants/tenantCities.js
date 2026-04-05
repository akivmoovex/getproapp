/**
 * Per-tenant city list for join autocomplete, watermarks, and admin.
 * Rows: enabled (directory/join eligibility), big_city (rotating watermark hints).
 */

function getTenantCitiesForClient(db, tenantId) {
  const tid = Number(tenantId);
  if (!tid) return [];
  return db
    .prepare(
      `
      SELECT id, name, enabled, big_city AS bigCity
      FROM tenant_cities
      WHERE tenant_id = ?
      ORDER BY name COLLATE NOCASE ASC
      `
    )
    .all(tid);
}

/** Pipe-separated phrases for step-2 rotating watermark: "Search: Lusaka|Search: Kitwe" */
function getJoinCityWatermarkRotate(db, tenantId) {
  const rows = db
    .prepare(
      `
      SELECT name FROM tenant_cities
      WHERE tenant_id = ? AND enabled = 1 AND big_city = 1
      ORDER BY name COLLATE NOCASE ASC
      `
    )
    .all(Number(tenantId));
  if (!rows.length) {
    return "Search: Lusaka|Search: Kitwe|Search: Ndola";
  }
  return rows.map((r) => `Search: ${r.name}`).join("|");
}

module.exports = {
  getTenantCitiesForClient,
  getJoinCityWatermarkRotate,
};
