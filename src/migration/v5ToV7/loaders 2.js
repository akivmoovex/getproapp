"use strict";

const crypto = require("crypto");
const { shouldExcludeOrgKey } = require("./inventory");
const { updatedSinceClause, usesFullReconcileOnDelta } = require("./delta");
const {
  collectBlessBoardIdentityCandidates,
  collectActiveClinicIdentityCandidates,
  migrateIdentities,
} = require("./identities");
const { buildIdentityIndexes } = require("./identityMerge");
const { migrateWebsiteInstances } = require("./websites");

async function buildCatalogIdRemap(sourcePool, targetPool, qualifiedTable, keyColumn) {
  const src = await sourcePool.query(
    `SELECT id::text AS id, ${keyColumn} AS catalog_key FROM ${qualifiedTable}`
  );
  const tgt = await targetPool.query(
    `SELECT id::text AS id, ${keyColumn} AS catalog_key FROM ${qualifiedTable}`
  );
  const tgtByKey = new Map(tgt.rows.map((row) => [row.catalog_key, row.id]));
  const remap = new Map();
  for (const row of src.rows) {
    const targetId = tgtByKey.get(row.catalog_key);
    if (!targetId) {
      throw new Error(`missing_target_catalog:${qualifiedTable}:${row.catalog_key}`);
    }
    remap.set(row.id, targetId);
  }
  return remap;
}

async function getTableColumns(pool, qualifiedName) {
  const [schema, table] = qualifiedName.split(".");
  const r = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND is_generated = 'NEVER'
      ORDER BY ordinal_position`,
    [schema, table]
  );
  return r.rows.map((row) => row.column_name);
}

async function tableHasUpdatedAt(pool, qualifiedName) {
  const [schema, table] = qualifiedName.split(".");
  const r = await pool.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = 'updated_at'
      LIMIT 1`,
    [schema, table]
  );
  return r.rowCount > 0;
}

function appendWhere(baseWhere, extraSql, params, extraParams) {
  const where = baseWhere.trim() ? baseWhere.trim() : "WHERE 1=1";
  const next = params.length + 1;
  const sql = extraSql.replace(/\$WATERMARK/g, `$${next}`);
  return { where: `${where}${sql}`, params: [...params, ...extraParams] };
}

async function buildDeltaFilter(sourcePool, table, watermark, delta) {
  if (!delta || !watermark?.capturedAt) {
    return { sql: "", params: [], mode: "full" };
  }
  if (usesFullReconcileOnDelta(table)) {
    return { sql: "", params: [], mode: "reconcile" };
  }
  if (await tableHasUpdatedAt(sourcePool, table)) {
    return { sql: " AND updated_at > $WATERMARK", params: [watermark.capturedAt], mode: "incremental" };
  }
  return { sql: "", params: [], mode: "reconcile" };
}

/**
 * @param {import('pg').PoolClient} client
 * @param {import('pg').Pool} sourcePool
 * @param {string} table
 * @param {string} whereSql
 * @param {any[]} params
 * @param {{ dryRun: boolean, onConflict?: 'skip'|'update', valueRemap?: Record<string, Map<string, string>>, delta?: boolean, watermark?: object }} opts
 */
async function copyTableRows(client, sourcePool, table, whereSql, params, opts) {
  const columns = await getTableColumns(sourcePool, table);
  if (!columns.length) {
    return { sourceCount: 0, inserted: 0, updated: 0, skipped: 0, unchanged: 0, conflicted: 0, failed: 0, mode: "none" };
  }

  const deltaFilter = await buildDeltaFilter(sourcePool, table, opts.watermark, opts.delta);
  const merged = appendWhere(whereSql, deltaFilter.sql, params, deltaFilter.params);
  const colList = columns.map((c) => `"${c}"`).join(", ");
  const src = await sourcePool.query(`SELECT ${colList} FROM ${table} ${merged.where}`, merged.params);
  const sourceCount = src.rowCount;
  if (opts.dryRun || sourceCount === 0) {
    return {
      sourceCount,
      inserted: 0,
      updated: 0,
      skipped: 0,
      unchanged: 0,
      conflicted: 0,
      failed: 0,
      mode: deltaFilter.mode,
    };
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let unchanged = 0;
  let conflicted = 0;
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const updates = columns
    .filter((c) => c !== "id")
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(", ");
  const sql =
    opts.onConflict === "update"
      ? `INSERT INTO ${table} (${colList}) VALUES (${placeholders})
         ON CONFLICT (id) DO UPDATE SET ${updates}`
      : `INSERT INTO ${table} (${colList}) VALUES (${placeholders})
         ON CONFLICT (id) DO NOTHING`;

  for (const row of src.rows) {
    const values = columns.map((c) => {
      const remap = opts.valueRemap && opts.valueRemap[c];
      if (!remap) return row[c];
      if (row[c] == null) return null;
      const mapped = remap.get(String(row[c]));
      if (!mapped) throw new Error(`unmapped_${table}.${c}:${row[c]}`);
      return mapped;
    });
    try {
      const existing = await client.query(`SELECT id FROM ${table} WHERE id = $1`, [row.id]);
      const res = await client.query(sql, values);
      if (existing.rowCount && opts.onConflict === "update") {
        if (columns.includes("updated_at")) {
          const same = await client.query(
            `SELECT 1 FROM ${table} WHERE id = $1 AND updated_at >= $2::timestamptz`,
            [row.id, row.updated_at || new Date(0)]
          );
          if (same.rowCount) {
            unchanged += 1;
            continue;
          }
        }
        updated += 1;
      } else if (res.rowCount === 0) {
        skipped += 1;
      } else if (opts.onConflict === "update") {
        updated += 1;
      } else {
        inserted += 1;
      }
    } catch (err) {
      if (/duplicate key|unique constraint/i.test(String(err.message))) {
        conflicted += 1;
      } else {
        throw err;
      }
    }
  }
  return { sourceCount, inserted, updated, skipped, unchanged, conflicted, failed: 0, mode: deltaFilter.mode };
}

async function migrateBlessBoardCore(sourcePool, targetPool, runConfig, opts) {
  const client = await targetPool.connect();
  const results = {};
  const copyOpts = {
    dryRun: opts.dryRun,
    onConflict: opts.delta ? "update" : "skip",
    delta: opts.delta,
    watermark: opts.watermark,
  };
  try {
    if (!opts.dryRun) await client.query("BEGIN");

    const churchFilter = await sourcePool.query(
      `SELECT id, church_key, organization_id FROM blessboard.churches ORDER BY church_key`
    );
    const includedChurches = churchFilter.rows.filter((r) => !shouldExcludeOrgKey(r.church_key, runConfig));
    const includedOrgIds = [...new Set(includedChurches.map((r) => r.organization_id))];
    const churchIds = includedChurches.map((r) => r.id);

    if (!includedOrgIds.length) {
      if (!opts.dryRun) await client.query("COMMIT");
      return { results, warnings: ["no_included_churches"] };
    }

    const orgPlaceholders = includedOrgIds.map((_, i) => `$${i + 1}`).join(", ");
    const churchPh = churchIds.map((_, i) => `$${i + 1}`).join(", ");

    const productIdRemap = await buildCatalogIdRemap(sourcePool, targetPool, "platform.products", "product_key");
    const roleIdRemap = await buildCatalogIdRemap(sourcePool, targetPool, "blessboard.roles", "role_key");

    results.organizations = await copyTableRows(
      client,
      sourcePool,
      "platform.organizations",
      `WHERE id IN (${orgPlaceholders})`,
      includedOrgIds,
      copyOpts
    );

    results.organization_products = await copyTableRows(
      client,
      sourcePool,
      "platform.organization_products",
      `WHERE organization_id IN (${orgPlaceholders})`,
      includedOrgIds,
      { ...copyOpts, valueRemap: { product_id: productIdRemap } }
    );

    results.churches = await copyTableRows(
      client,
      sourcePool,
      "blessboard.churches",
      `WHERE organization_id IN (${orgPlaceholders})`,
      includedOrgIds,
      copyOpts
    );

    results.branches = await copyTableRows(
      client,
      sourcePool,
      "blessboard.branches",
      `WHERE church_id IN (${churchPh})`,
      churchIds,
      copyOpts
    );

    results.users = await copyTableRows(
      client,
      sourcePool,
      "blessboard.users",
      `WHERE id IN (
         SELECT DISTINCT ura.user_id
           FROM blessboard.user_role_assignments ura
          WHERE ura.organization_id IN (${orgPlaceholders}) AND ura.status = 'active'
       )`,
      includedOrgIds,
      copyOpts
    );

    const bbIdentityCandidates = await collectBlessBoardIdentityCandidates(sourcePool, includedOrgIds);
    const targetIdentityRows = await targetPool.query(
      `SELECT id::text AS identity_id, email_normalized AS email, phone_normalized AS phone
         FROM platform.identities`
    );
    results.identities = await migrateIdentities(client, targetPool, bbIdentityCandidates, opts.idMap, {
      dryRun: opts.dryRun,
      indexes: buildIdentityIndexes(
        targetIdentityRows.rows.map((r) => ({
          email: r.email,
          phone: r.phone,
          source: "target",
          legacyId: r.identity_id,
          identityId: r.identity_id,
        }))
      ),
    });

    results.user_role_assignments = await copyTableRows(
      client,
      sourcePool,
      "blessboard.user_role_assignments",
      `WHERE organization_id IN (${orgPlaceholders}) AND status = 'active'`,
      includedOrgIds,
      { ...copyOpts, valueRemap: { role_id: roleIdRemap } }
    );

    results.public_pages = await copyTableRows(
      client,
      sourcePool,
      "blessboard.public_pages",
      `WHERE church_id IN (${churchPh})`,
      churchIds,
      copyOpts
    );

    results.page_sections = await copyTableRows(
      client,
      sourcePool,
      "blessboard.page_sections",
      `WHERE page_id IN (SELECT id FROM blessboard.public_pages WHERE church_id IN (${churchPh}))`,
      churchIds,
      copyOpts
    );

    results.media_assets = await copyTableRows(
      client,
      sourcePool,
      "blessboard.media_assets",
      `WHERE church_id IN (${churchPh})`,
      churchIds,
      copyOpts
    );

    results.website_instances = await migrateWebsiteInstances(
      client,
      sourcePool,
      targetPool,
      includedOrgIds,
      "blessboard",
      copyOpts
    );

    if (!opts.dryRun) await client.query("COMMIT");
    return { results, includedOrgIds, churchIds };
  } catch (err) {
    if (!opts.dryRun) await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function migrateActiveClinicCore(acSourcePool, targetPool, runConfig, opts) {
  const client = await targetPool.connect();
  const results = {};
  const copyOpts = {
    dryRun: opts.dryRun,
    onConflict: opts.delta ? "update" : "skip",
    delta: opts.delta,
    watermark: opts.watermark,
  };
  try {
    if (!opts.dryRun) await client.query("BEGIN");

    const orgs = await acSourcePool.query(
      `SELECT h.id, h.organization_id, o.organization_key
         FROM activeclinic.healthcare_organizations h
         JOIN platform.organizations o ON o.id = h.organization_id`
    );
    const included = orgs.rows.filter((r) => !shouldExcludeOrgKey(r.organization_key, runConfig));
    const hcoIds = included.map((r) => r.id);
    const orgIds = [...new Set(included.map((r) => r.organization_id))];

    if (!hcoIds.length) {
      if (!opts.dryRun) await client.query("COMMIT");
      return { results, warnings: ["no_included_clinics"] };
    }

    const orgPh = orgIds.map((_, i) => `$${i + 1}`).join(", ");
    const hcoPh = hcoIds.map((_, i) => `$${i + 1}`).join(", ");
    const productIdRemap = await buildCatalogIdRemap(acSourcePool, targetPool, "platform.products", "product_key");
    const roleIdRemap = await buildCatalogIdRemap(acSourcePool, targetPool, "blessboard.roles", "role_key");

    results.organizations = await copyTableRows(
      client,
      acSourcePool,
      "platform.organizations",
      `WHERE id IN (${orgPh})`,
      orgIds,
      copyOpts
    );

    results.organization_products = await copyTableRows(
      client,
      acSourcePool,
      "platform.organization_products",
      `WHERE organization_id IN (${orgPh})`,
      orgIds,
      { ...copyOpts, valueRemap: { product_id: productIdRemap } }
    );

    const acIdentityCandidates = await collectActiveClinicIdentityCandidates(acSourcePool, hcoIds);
    const targetIdentityRows = await targetPool.query(
      `SELECT id::text AS identity_id, email_normalized AS email, phone_normalized AS phone
         FROM platform.identities`
    );
    results.identities = await migrateIdentities(client, targetPool, acIdentityCandidates, opts.idMap, {
      dryRun: opts.dryRun,
      indexes: buildIdentityIndexes(
        targetIdentityRows.rows.map((r) => ({
          email: r.email,
          phone: r.phone,
          source: "target",
          legacyId: r.identity_id,
          identityId: r.identity_id,
        }))
      ),
    });

    const identityRemap = new Map();
    for (const [key, value] of Object.entries(opts.idMap.entries())) {
      if (key.startsWith("identity:")) identityRemap.set(key.slice("identity:".length), value);
    }

    results.healthcare_organizations = await copyTableRows(
      client,
      acSourcePool,
      "activeclinic.healthcare_organizations",
      `WHERE id IN (${hcoPh})`,
      hcoIds,
      copyOpts
    );

    results.facilities = await copyTableRows(
      client,
      acSourcePool,
      "activeclinic.facilities",
      `WHERE healthcare_organization_id IN (${hcoPh})`,
      hcoIds,
      copyOpts
    );

    results.staff_members = await copyTableRows(
      client,
      acSourcePool,
      "activeclinic.staff_members",
      `WHERE healthcare_organization_id IN (${hcoPh})`,
      hcoIds,
      {
        ...copyOpts,
        valueRemap: { platform_identity_id: identityRemap },
      }
    );

    results.staff_role_assignments = await copyTableRows(
      client,
      acSourcePool,
      "activeclinic.staff_role_assignments",
      `WHERE healthcare_organization_id IN (${hcoPh}) AND status = 'active'`,
      hcoIds,
      { ...copyOpts, valueRemap: { role_id: roleIdRemap } }
    );

    results.appointment_service_types = await copyTableRows(
      client,
      acSourcePool,
      "activeclinic.appointment_service_types",
      `WHERE healthcare_organization_id IN (${hcoPh})`,
      hcoIds,
      copyOpts
    );

    if (runConfig.migrateAcClinical) {
      results.patients = await copyTableRows(
        client,
        acSourcePool,
        "activeclinic.patients",
        `WHERE healthcare_organization_id IN (${hcoPh})`,
        hcoIds,
        copyOpts
      );
      results.appointments = await copyTableRows(
        client,
        acSourcePool,
        "activeclinic.appointments",
        `WHERE healthcare_organization_id IN (${hcoPh})`,
        hcoIds,
        copyOpts
      );
    }

    results.website_instances = await migrateWebsiteInstances(
      client,
      acSourcePool,
      targetPool,
      orgIds,
      "activeclinic",
      copyOpts
    );

    results.website_media = await copyTableRows(
      client,
      acSourcePool,
      "platform.website_media",
      `WHERE organization_id IN (${orgPh})`,
      orgIds,
      copyOpts
    );

    if (!opts.dryRun) await client.query("COMMIT");
    return { results, hcoIds, orgIds };
  } catch (err) {
    if (!opts.dryRun) await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  migrateBlessBoardCore,
  migrateActiveClinicCore,
  copyTableRows,
  buildCatalogIdRemap,
  buildDeltaFilter,
};
