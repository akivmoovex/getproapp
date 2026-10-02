"use strict";

/**
 * Copy platform.website_instances for included organizations.
 */

async function migrateWebsiteInstances(client, sourcePool, targetPool, orgIds, productCode, opts) {
  if (!orgIds.length) {
    return { sourceCount: 0, inserted: 0, updated: 0, skipped: 0, conflicted: 0, failed: 0 };
  }
  const ph = orgIds.map((_, i) => `$${i + 1}`).join(", ");
  const src = await sourcePool.query(
    `SELECT *
       FROM platform.website_instances
      WHERE organization_id IN (${ph})
        AND product_code = $${orgIds.length + 1}
        AND status <> 'archived'`,
    [...orgIds, productCode]
  );
  const sourceCount = src.rowCount;
  if (opts.dryRun || sourceCount === 0) {
    return { sourceCount, inserted: 0, updated: 0, skipped: 0, conflicted: 0, failed: 0 };
  }

  let inserted = 0;
  let skipped = 0;
  let conflicted = 0;
  let updated = 0;
  const columns = Object.keys(src.rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(", ");
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const updates = columns
    .filter((c) => c !== "id")
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(", ");
  const sql =
    opts.onConflict === "update"
      ? `INSERT INTO platform.website_instances (${colList}) VALUES (${placeholders})
         ON CONFLICT (id) DO UPDATE SET ${updates}`
      : `INSERT INTO platform.website_instances (${colList}) VALUES (${placeholders})
         ON CONFLICT (id) DO NOTHING`;

  for (const row of src.rows) {
    const values = columns.map((c) => row[c]);
    try {
      const res = await client.query(sql, values);
      if (res.rowCount === 0) skipped += 1;
      else if (opts.onConflict === "update") updated += 1;
      else inserted += 1;
    } catch (err) {
      if (/duplicate key|unique constraint/i.test(String(err.message))) conflicted += 1;
      else throw err;
    }
  }
  return { sourceCount, inserted, updated, skipped, conflicted, failed: 0 };
}

module.exports = {
  migrateWebsiteInstances,
};
