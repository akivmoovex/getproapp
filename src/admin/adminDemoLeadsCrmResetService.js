/**
 * Admin DB tools: delete approved demo-tenant activity rows only (super-admin, fixture-gated at route).
 * Scope: CRM, leads, reviews (for demo companies), callbacks, professional signups, field agents (+ CASCADE submissions/callback leads).
 */
"use strict";

const { TENANT_DEMO } = require("../tenants/tenantIds");
const tenantsRepo = require("../db/pg/tenantsRepo");

const DEMO_SLUG = "demo";

/**
 * @param {import("pg").Pool} pool
 * @param {{ confirmSlug: string }} p
 */
async function resetDemoLeadsAndCrm(pool, p) {
  const confirmSlug = String(p.confirmSlug || "").trim();
  if (confirmSlug !== DEMO_SLUG) {
    return { ok: false, error: "validation", message: "Confirmation does not match tenant slug." };
  }

  const tenant = await tenantsRepo.getById(pool, TENANT_DEMO);
  if (!tenant) {
    return { ok: false, error: "validation", message: "Tenant not found." };
  }
  if (String(tenant.slug || "").trim() !== DEMO_SLUG) {
    return { ok: false, error: "validation", message: "Demo tenant slug mismatch; aborting." };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const r1 = await client.query(`DELETE FROM public.crm_tasks WHERE tenant_id = $1`, [TENANT_DEMO]);
    const r2 = await client.query(`DELETE FROM public.crm_csr_fifo_state WHERE tenant_id = $1`, [TENANT_DEMO]);
    const r3 = await client.query(`DELETE FROM public.leads WHERE tenant_id = $1`, [TENANT_DEMO]);
    const r4 = await client.query(
      `DELETE FROM public.reviews WHERE company_id IN (SELECT id FROM public.companies WHERE tenant_id = $1)`,
      [TENANT_DEMO]
    );
    const r5 = await client.query(`DELETE FROM public.callback_interests WHERE tenant_id = $1`, [TENANT_DEMO]);
    const r6 = await client.query(`DELETE FROM public.professional_signups WHERE tenant_id = $1`, [TENANT_DEMO]);
    const r7 = await client.query(`DELETE FROM public.field_agents WHERE tenant_id = $1`, [TENANT_DEMO]);

    await client.query("COMMIT");

    const deleted = {
      crm_tasks: r1.rowCount ?? 0,
      crm_csr_fifo_state: r2.rowCount ?? 0,
      leads: r3.rowCount ?? 0,
      reviews: r4.rowCount ?? 0,
      callback_interests: r5.rowCount ?? 0,
      professional_signups: r6.rowCount ?? 0,
      field_agents: r7.rowCount ?? 0,
    };

    // eslint-disable-next-line no-console
    console.log(`[getpro] adminDemoLeadsCrmReset: tenant=${TENANT_DEMO} deleted=${JSON.stringify(deleted)}`);

    return {
      ok: true,
      tenantId: TENANT_DEMO,
      tenantSlug: DEMO_SLUG,
      counts: {
        created: {},
        deleted,
      },
      tablesTouched: [
        "crm_tasks",
        "crm_csr_fifo_state",
        "leads",
        "reviews",
        "callback_interests",
        "professional_signups",
        "field_agents",
      ],
    };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    const msg = e && e.message ? String(e.message) : "Reset failed.";
    // eslint-disable-next-line no-console
    console.error("[getpro] adminDemoLeadsCrmReset:", msg);
    return { ok: false, error: "server", message: msg };
  } finally {
    client.release();
  }
}

module.exports = {
  resetDemoLeadsAndCrm,
};
