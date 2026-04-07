"use strict";

/**
 * Super-admin tenant delete: same end state as legacy SQLite `deleteTenantScopedData` + PRAGMA-off transaction,
 * extended with deletes for PostgreSQL-only child tables that reference `public.tenants` (FK-safe order).
 *
 * Order: deepest dependents first; then legacy slice (leads, companies, categories, …); then admin membership
 * repair (identical queries to SQLite); finally `DELETE FROM tenants`.
 */

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function deleteTenantScopedData(pool, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("Invalid tenant id");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const q = (text, params) => client.query(text, params);

    await q(`DELETE FROM public.intake_project_assignments WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.intake_project_images WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.intake_client_projects WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.intake_phone_otp WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.intake_clients WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.intake_code_sequences WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.intake_category_lead_settings WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.intake_allocation_settings WHERE tenant_id = $1`, [tid]);

    await q(`DELETE FROM public.crm_tasks WHERE tenant_id = $1`, [tid]);

    await q(`DELETE FROM public.leads WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.professional_signups WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.callback_interests WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.content_pages WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.tenant_cities WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.company_personnel_users WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.companies WHERE tenant_id = $1`, [tid]);
    await q(`DELETE FROM public.categories WHERE tenant_id = $1`, [tid]);

    const r1 = await q(`SELECT admin_user_id AS id FROM public.admin_user_tenant_roles WHERE tenant_id = $1`, [tid]);
    const r2 = await q(`SELECT id FROM public.admin_users WHERE tenant_id = $1`, [tid]);
    const affectedIds = new Set();
    for (const row of r1.rows) {
      affectedIds.add(Number(row.id));
    }
    for (const row of r2.rows) {
      affectedIds.add(Number(row.id));
    }

    await q(`DELETE FROM public.admin_user_tenant_roles WHERE tenant_id = $1`, [tid]);

    for (const uid of affectedIds) {
      if (!uid) continue;
      const next = await q(
        `SELECT tenant_id, role FROM public.admin_user_tenant_roles WHERE admin_user_id = $1 ORDER BY tenant_id ASC LIMIT 1`,
        [uid]
      );
      const row = next.rows[0];
      if (row) {
        await q(`UPDATE public.admin_users SET tenant_id = $1, role = $2 WHERE id = $3`, [
          row.tenant_id,
          row.role,
          uid,
        ]);
      } else {
        await q(`DELETE FROM public.admin_users WHERE id = $1`, [uid]);
      }
    }

    const delT = await q(`DELETE FROM public.tenants WHERE id = $1`, [tid]);
    if (delT.rowCount === 0) {
      throw new Error("Tenant not found");
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  deleteTenantScopedData,
};
