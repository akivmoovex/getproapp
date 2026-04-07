"use strict";

/**
 * CRM audit log inserts (PostgreSQL). Use the same `client` as the surrounding transaction when provided.
 */

/**
 * @param {import("pg").Pool | import("pg").PoolClient} poolOrClient
 * @param {{ tenantId: number, taskId: number, userId: number|null|undefined, actionType: string, details: string }} p
 */
async function insertAuditLog(poolOrClient, { tenantId, taskId, userId, actionType, details }) {
  const uid = userId != null && Number(userId) > 0 ? Number(userId) : null;
  await poolOrClient.query(
    `INSERT INTO public.crm_audit_logs (tenant_id, task_id, user_id, action_type, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, taskId, uid, String(actionType || "unknown").slice(0, 64), String(details || "").slice(0, 2000)]
  );
}

module.exports = { insertAuditLog };
