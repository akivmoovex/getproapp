/**
 * FIFO-style distribution of inbound CRM tasks to CSR users: round-robin among
 * tenant-scoped users whose effective role is `csr`, using `crm_csr_fifo_state`.
 */

const { insertAuditLog } = require("../db/pg/crmAuditRepo");
const crmTasksRepo = require("../db/pg/crmTasksRepo");

/**
 * @param {number|null|undefined} lastId
 * @param {number[]} orderedIds ascending stable ids
 */
function pickNextRoundRobin(lastId, orderedIds) {
  if (!orderedIds.length) return null;
  if (lastId == null || lastId === undefined) return orderedIds[0];
  const n = Number(lastId);
  const idx = orderedIds.indexOf(n);
  if (idx < 0) return orderedIds[0];
  return orderedIds[(idx + 1) % orderedIds.length];
}

/**
 * After an inbound CRM row is inserted (unassigned), assign the next CSR in FIFO rotation.
 * No-op if there are no CSRs or the task was already claimed.
 *
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} taskId
 * @returns {Promise<void>}
 */
async function tryAssignInboundCrmTaskToCsrFifo(pool, tenantId, taskId) {
  const tid = Number(tenantId);
  const tsk = Number(taskId);
  if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(tsk) || tsk <= 0) return;

  await crmTasksRepo.withTransaction(pool, async (client) => {
    const csrs = await crmTasksRepo.listCsrUserIdsForTenantOrdered(client, tid);
    if (!csrs.length) return;

    await client.query(
      `INSERT INTO public.crm_csr_fifo_state (tenant_id, last_assigned_admin_user_id)
       VALUES ($1, NULL)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tid]
    );

    const st = await client.query(
      `SELECT last_assigned_admin_user_id FROM public.crm_csr_fifo_state WHERE tenant_id = $1 FOR UPDATE`,
      [tid]
    );
    const lastId = st.rows[0] ? st.rows[0].last_assigned_admin_user_id : null;
    const nextId = pickNextRoundRobin(lastId, csrs);
    if (nextId == null) return;

    const u = await client.query(
      `UPDATE public.crm_tasks
       SET owner_id = $1, status = 'in_progress', updated_at = now()
       WHERE id = $2 AND tenant_id = $3 AND owner_id IS NULL`,
      [nextId, tsk, tid]
    );
    if (u.rowCount === 0) return;

    await client.query(`UPDATE public.crm_csr_fifo_state SET last_assigned_admin_user_id = $1 WHERE tenant_id = $2`, [
      nextId,
      tid,
    ]);

    await insertAuditLog(client, {
      tenantId: tid,
      taskId: tsk,
      userId: null,
      actionType: "assignment",
      details: JSON.stringify({ owner_id: nextId, action: "fifo_csr_auto" }),
    });
  });
}

module.exports = {
  tryAssignInboundCrmTaskToCsrFifo,
  pickNextRoundRobin,
};
