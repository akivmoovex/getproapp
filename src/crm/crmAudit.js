/**
 * Thin async wrapper for CRM audit inserts via PostgreSQL (`crmAuditRepo.insertAuditLog`).
 * Primary CRM writes use `insertAuditLog` inside `crmTasksRepo` transactions.
 */

const { insertAuditLog } = require("../db/pg/crmAuditRepo");

/**
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, taskId: number, userId?: number | null, actionType: string, details?: string }} payload
 */
async function insertCrmAuditWithStore(pool, payload) {
  await insertAuditLog(pool, payload);
}

module.exports = { insertCrmAuditWithStore };
