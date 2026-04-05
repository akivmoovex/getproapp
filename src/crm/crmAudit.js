/**
 * @param {import("better-sqlite3").Database} db
 */
function insertCrmAudit(db, { tenantId, taskId, userId, actionType, details }) {
  db.prepare(
    `
    INSERT INTO crm_audit_logs (tenant_id, task_id, user_id, action_type, details)
    VALUES (?, ?, ?, ?, ?)
    `
  ).run(
    tenantId,
    taskId,
    userId != null && Number(userId) > 0 ? Number(userId) : null,
    String(actionType || "unknown").slice(0, 64),
    String(details || "").slice(0, 2000)
  );
}

module.exports = { insertCrmAudit };
