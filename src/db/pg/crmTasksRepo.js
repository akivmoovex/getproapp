"use strict";

const { insertAuditLog } = require("./crmAuditRepo");

/**
 * PostgreSQL CRM tasks, comments, and audit logs (tenant-scoped).
 */

/**
 * @param {import("pg").Pool} pool
 * @param {import("pg").PoolClient} client
 * @param {number} userId
 * @param {number} tenantId
 */
async function userIsInTenant(pool, client, userId, tenantId) {
  const tid = Number(tenantId);
  const uid = Number(userId);
  if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(uid) || uid <= 0) return false;
  const q = client || pool;
  const r = await q.query(
    `SELECT 1 AS ok FROM public.admin_users u
     WHERE u.id = $1 AND COALESCE(u.enabled, TRUE) = TRUE
       AND (
         u.tenant_id = $2
         OR EXISTS (SELECT 1 FROM public.admin_user_tenant_roles m WHERE m.admin_user_id = u.id AND m.tenant_id = $2)
       )
     LIMIT 1`,
    [uid, tid]
  );
  return r.rows.length > 0;
}

function serializeTaskRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const k of ["created_at", "updated_at"]) {
    if (out[k] instanceof Date) {
      out[k] = out[k].toISOString().replace("T", " ").slice(0, 19);
    }
  }
  return out;
}

function serializeCommentRow(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.created_at instanceof Date) {
    out.created_at = out.created_at.toISOString().replace("T", " ").slice(0, 19);
  }
  return out;
}

function serializeAuditRow(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.created_at instanceof Date) {
    out.created_at = out.created_at.toISOString().replace("T", " ").slice(0, 19);
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function listTenantUsersForCrm(pool, tenantId) {
  const r = await pool.query(
    `
    SELECT DISTINCT u.id, u.username
    FROM public.admin_users u
    LEFT JOIN public.admin_user_tenant_roles m ON m.admin_user_id = u.id AND m.tenant_id = $1
    WHERE COALESCE(u.enabled, TRUE) = TRUE
      AND (m.tenant_id IS NOT NULL OR u.tenant_id = $1)
    ORDER BY lower(u.username) ASC
    `,
    [tenantId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function listTasksForBoard(pool, tenantId) {
  const r = await pool.query(
    `
    SELECT t.*, u.username AS owner_username
    FROM public.crm_tasks t
    LEFT JOIN public.admin_users u ON u.id = t.owner_id
    WHERE t.tenant_id = $1
    ORDER BY t.updated_at DESC
    `,
    [tenantId]
  );
  return r.rows.map(serializeTaskRow);
}

/**
 * Dashboard: CRM task counts by raw status (normalized in route via normalizeCrmTaskStatus).
 * @returns {Promise<{ status: string, c: number }[]>}
 */
async function countGroupedByStatusForTenant(pool, tenantId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS c FROM public.crm_tasks WHERE tenant_id = $1 GROUP BY status`,
    [tenantId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} taskId
 * @param {number} tenantId
 */
async function getTaskByIdAndTenant(pool, taskId, tenantId) {
  const r = await pool.query(
    `
    SELECT t.*, o.username AS owner_username, c.username AS creator_username
    FROM public.crm_tasks t
    LEFT JOIN public.admin_users o ON o.id = t.owner_id
    LEFT JOIN public.admin_users c ON c.id = t.created_by_id
    WHERE t.id = $1 AND t.tenant_id = $2
    `,
    [taskId, tenantId]
  );
  return r.rows[0] ? serializeTaskRow(r.rows[0]) : null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} taskId
 * @param {number} tenantId
 */
async function listCommentsForTask(pool, taskId, tenantId) {
  const r = await pool.query(
    `
    SELECT c.*, u.username AS author_username
    FROM public.crm_task_comments c
    LEFT JOIN public.admin_users u ON u.id = c.user_id
    WHERE c.task_id = $1 AND c.tenant_id = $2
    ORDER BY c.created_at ASC, c.id ASC
    `,
    [taskId, tenantId]
  );
  return r.rows.map(serializeCommentRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} taskId
 * @param {number} tenantId
 */
async function listAuditForTask(pool, taskId, tenantId) {
  const r = await pool.query(
    `
    SELECT a.*, u.username AS actor_username
    FROM public.crm_audit_logs a
    LEFT JOIN public.admin_users u ON u.id = a.user_id
    WHERE a.task_id = $1 AND a.tenant_id = $2
    ORDER BY a.created_at DESC, a.id DESC
    `,
    [taskId, tenantId]
  );
  return r.rows.map(serializeAuditRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {(client: import("pg").PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} p
 */
async function createTaskWithAudit(pool, { tenantId, title, description, status, ownerId, createdById, attachmentUrl }) {
  return withTransaction(pool, async (client) => {
    const ins = await client.query(
      `
      INSERT INTO public.crm_tasks (
        tenant_id, title, description, status, owner_id, created_by_id, attachment_url, source_type, source_ref_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', NULL)
      RETURNING id
      `,
      [tenantId, title, description, status, ownerId, createdById, attachmentUrl || ""]
    );
    const taskId = ins.rows[0].id;
    await insertAuditLog(client, {
      tenantId,
      taskId,
      userId: createdById,
      actionType: "task_created",
      details: JSON.stringify({
        title,
        attachment_url: attachmentUrl || undefined,
        owner_id: ownerId,
        status,
      }),
    });
    return taskId;
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} p
 */
async function updateTaskFieldsWithAudit(pool, { tenantId, taskId, userId, title, description, attachmentUrl }) {
  return withTransaction(pool, async (client) => {
    const u = await client.query(
      `
      UPDATE public.crm_tasks
      SET title = $1, description = $2, attachment_url = $3, updated_at = now()
      WHERE id = $4 AND tenant_id = $5
      `,
      [title, description, attachmentUrl || "", taskId, tenantId]
    );
    if (u.rowCount === 0) return false;
    await insertAuditLog(client, {
      tenantId,
      taskId,
      userId,
      actionType: "task_fields_updated",
      details: JSON.stringify({ title }),
    });
    return true;
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} p
 */
async function claimTaskWithAudit(pool, { tenantId, taskId, userId }) {
  return withTransaction(pool, async (client) => {
    const u = await client.query(
      `
      UPDATE public.crm_tasks
      SET owner_id = $1, status = 'in_progress', updated_at = now()
      WHERE id = $2 AND tenant_id = $3
      `,
      [userId, taskId, tenantId]
    );
    if (u.rowCount === 0) return false;
    await insertAuditLog(client, {
      tenantId,
      taskId,
      userId,
      actionType: "assignment",
      details: JSON.stringify({ owner_id: userId, action: "claim" }),
    });
    return true;
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} p
 */
async function updateTaskStatusWithAudit(pool, { tenantId, taskId, userId, status, prevStatus }) {
  return withTransaction(pool, async (client) => {
    const u = await client.query(
      `UPDATE public.crm_tasks SET status = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
      [status, taskId, tenantId]
    );
    if (u.rowCount === 0) return false;
    await insertAuditLog(client, {
      tenantId,
      taskId,
      userId,
      actionType: "status_change",
      details: JSON.stringify({ from: prevStatus, to: status }),
    });
    return true;
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} p
 */
async function moveKanbanWithAudit(pool, { tenantId, taskId, userId, newStatus, prevStatus, task, nextOwnerId }) {
  return withTransaction(pool, async (client) => {
    const u = await client.query(
      `UPDATE public.crm_tasks SET status = $1, owner_id = $2, updated_at = now() WHERE id = $3 AND tenant_id = $4`,
      [newStatus, nextOwnerId, taskId, tenantId]
    );
    if (u.rowCount === 0) {
      throw new Error("Task not found");
    }
    await insertAuditLog(client, {
      tenantId,
      taskId,
      userId,
      actionType: "status_change",
      details: JSON.stringify({ from: prevStatus, to: newStatus, via: "kanban" }),
    });
    if (!task.owner_id && nextOwnerId) {
      await insertAuditLog(client, {
        tenantId,
        taskId,
        userId,
        actionType: "assignment",
        details: JSON.stringify({ owner_id: nextOwnerId, action: "claim_kanban" }),
      });
    }
    if (task.owner_id && nextOwnerId == null) {
      await insertAuditLog(client, {
        tenantId,
        taskId,
        userId,
        actionType: "assignment",
        details: JSON.stringify({ from_owner_id: task.owner_id, action: "unassign_kanban" }),
      });
    }
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} p
 */
async function reassignTaskWithAudit(pool, { tenantId, taskId, userId, newOwnerId, nextStatus, prevOwner }) {
  return withTransaction(pool, async (client) => {
    const u = await client.query(
      `UPDATE public.crm_tasks SET owner_id = $1, status = $2, updated_at = now() WHERE id = $3 AND tenant_id = $4`,
      [newOwnerId, nextStatus, taskId, tenantId]
    );
    if (u.rowCount === 0) return false;
    await insertAuditLog(client, {
      tenantId,
      taskId,
      userId,
      actionType: "assignment",
      details: JSON.stringify({ from_owner_id: prevOwner, to_owner_id: newOwnerId }),
    });
    return true;
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} p
 */
async function insertCommentWithAudit(pool, { tenantId, taskId, userId, body }) {
  return withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO public.crm_task_comments (tenant_id, task_id, user_id, body) VALUES ($1, $2, $3, $4)`,
      [tenantId, taskId, userId, body]
    );
    await insertAuditLog(client, {
      tenantId,
      taskId,
      userId,
      actionType: "comment",
      details: JSON.stringify({ length: body.length }),
    });
  });
}

/**
 * Inbound events (API): same row shape as SQLite `crmAutoTasks` — no audit row (matches legacy behavior).
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, title: string, description: string, sourceType: string, sourceRefId: number | null }} p
 * @returns {Promise<number | null>} new task id
 */
async function insertFromInboundEvent(pool, { tenantId, title, description, sourceType, sourceRefId }) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return null;
  const t = String(title || "").trim().slice(0, 200);
  if (!t) return null;
  const desc = String(description || "").trim().slice(0, 8000);
  const st = String(sourceType || "manual").trim().slice(0, 40) || "manual";
  const ref =
    sourceRefId != null && Number.isFinite(Number(sourceRefId)) && Number(sourceRefId) > 0
      ? Number(sourceRefId)
      : null;

  const r = await pool.query(
    `
    INSERT INTO public.crm_tasks (
      tenant_id, title, description, status, owner_id, created_by_id, attachment_url, source_type, source_ref_id
    )
    VALUES ($1, $2, $3, 'new', NULL, NULL, '', $4, $5)
    RETURNING id
    `,
    [tid, t, desc, st, ref]
  );
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

module.exports = {
  userIsInTenant,
  listTenantUsersForCrm,
  listTasksForBoard,
  countGroupedByStatusForTenant,
  getTaskByIdAndTenant,
  listCommentsForTask,
  listAuditForTask,
  withTransaction,
  createTaskWithAudit,
  updateTaskFieldsWithAudit,
  claimTaskWithAudit,
  updateTaskStatusWithAudit,
  moveKanbanWithAudit,
  reassignTaskWithAudit,
  insertCommentWithAudit,
  insertFromInboundEvent,
};
