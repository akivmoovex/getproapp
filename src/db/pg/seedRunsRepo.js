"use strict";

/**
 * Registry for admin test-data seeding (seed_runs / seed_run_items).
 */

const ALLOWED_TABLES = new Set([
  "leads",
  "reviews",
  "companies",
  "field_agents",
  "field_agent_provider_submissions",
  "field_agent_callback_leads",
  "intake_clients",
  "intake_client_projects",
  "intake_project_assignments",
  "intake_deal_reviews",
]);

/**
 * @param {import("pg").Pool} pool
 * @param {{ batchUuid: string, tenantId: number, createdByAdminUserId: number | null }} p
 * @returns {Promise<number>} run id
 */
async function insertRun(pool, p) {
  const r = await pool.query(
    `INSERT INTO public.seed_runs (batch_uuid, tenant_id, created_by_admin_user_id)
     VALUES ($1::uuid, $2, $3)
     RETURNING id`,
    [p.batchUuid, p.tenantId, p.createdByAdminUserId]
  );
  return Number(r.rows[0].id);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} q
 * @param {{ runId: number, tableName: string, entityId: number }} p
 */
async function insertItem(q, p) {
  const t = String(p.tableName || "").trim();
  if (!ALLOWED_TABLES.has(t)) {
    throw new Error(`seed_run_items: disallowed table_name ${t}`);
  }
  await q.query(
    `INSERT INTO public.seed_run_items (run_id, table_name, entity_id) VALUES ($1, $2, $3)`,
    [p.runId, t, p.entityId]
  );
}

/**
 * All tracked entities for a tenant (across all runs), for cleanup.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @returns {Promise<{ table_name: string, entity_id: number }[]>}
 */
async function listTrackedEntitiesForTenant(pool, tenantId) {
  const r = await pool.query(
    `
    SELECT i.table_name, i.entity_id
    FROM public.seed_run_items i
    INNER JOIN public.seed_runs r ON r.id = i.run_id
    WHERE r.tenant_id = $1
    ORDER BY i.id ASC
    `,
    [tenantId]
  );
  return r.rows.map((row) => ({
    table_name: String(row.table_name),
    entity_id: Number(row.entity_id),
  }));
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function deleteRunsForTenant(pool, tenantId) {
  const d = await pool.query(`DELETE FROM public.seed_runs WHERE tenant_id = $1`, [tenantId]);
  return d.rowCount ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @returns {Promise<number>}
 */
async function countRunsForTenant(pool, tenantId) {
  const r = await pool.query(`SELECT COUNT(*)::int AS c FROM public.seed_runs WHERE tenant_id = $1`, [tenantId]);
  return Number(r.rows[0].c) || 0;
}

/**
 * Tracked row counts per logical table (for clear preview).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @returns {Promise<{ table_name: string, count: number }[]>}
 */
async function countTrackedByTableForTenant(pool, tenantId) {
  const r = await pool.query(
    `
    SELECT i.table_name, COUNT(*)::int AS c
    FROM public.seed_run_items i
    INNER JOIN public.seed_runs r ON r.id = i.run_id
    WHERE r.tenant_id = $1
    GROUP BY i.table_name
    ORDER BY i.table_name ASC
    `,
    [tenantId]
  );
  return r.rows.map((row) => ({
    table_name: String(row.table_name),
    count: Number(row.c) || 0,
  }));
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {string} batchUuid
 * @returns {Promise<number | null>} run id
 */
async function getRunIdByTenantAndBatchUuid(pool, tenantId, batchUuid) {
  const r = await pool.query(
    `SELECT id FROM public.seed_runs WHERE tenant_id = $1 AND batch_uuid = $2::uuid LIMIT 1`,
    [tenantId, batchUuid]
  );
  if (!r.rows.length) return null;
  return Number(r.rows[0].id);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} runId
 * @returns {Promise<{ table_name: string, entity_id: number }[]>}
 */
async function listTrackedEntitiesForRun(pool, runId) {
  const r = await pool.query(
    `
    SELECT table_name, entity_id
    FROM public.seed_run_items
    WHERE run_id = $1
    ORDER BY id ASC
    `,
    [runId]
  );
  return r.rows.map((row) => ({
    table_name: String(row.table_name),
    entity_id: Number(row.entity_id),
  }));
}

module.exports = {
  insertRun,
  insertItem,
  listTrackedEntitiesForTenant,
  listTrackedEntitiesForRun,
  deleteRunsForTenant,
  countRunsForTenant,
  countTrackedByTableForTenant,
  getRunIdByTenantAndBatchUuid,
  ALLOWED_TABLES,
};
