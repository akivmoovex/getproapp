/**
 * When a provider marks an assignment as interested, deduct internal deal_price from portal credit balance
 * once per assignment (idempotent via deal_fee_recorded).
 */

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} assignmentId
 * @param {number} companyId
 * @returns {Promise<void>}
 */
async function applyDealPriceDebitOnInterestedIfNeeded(pool, tenantId, assignmentId, companyId) {
  const tid = Number(tenantId);
  const aid = Number(assignmentId);
  const cid = Number(companyId);
  if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(aid) || aid <= 0 || !Number.isFinite(cid) || cid <= 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await client.query(
      `SELECT a.id, a.deal_fee_recorded, p.deal_price
       FROM public.intake_project_assignments a
       INNER JOIN public.intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
       WHERE a.id = $1 AND a.tenant_id = $2 AND a.company_id = $3
       FOR UPDATE`,
      [aid, tid, cid]
    );
    const r = row.rows[0];
    if (!r) {
      await client.query("ROLLBACK");
      return;
    }
    if (r.deal_fee_recorded === true || r.deal_fee_recorded === 1) {
      await client.query("COMMIT");
      return;
    }
    const price = r.deal_price != null ? Number(r.deal_price) : null;
    if (price == null || !Number.isFinite(price) || price <= 0) {
      await client.query("COMMIT");
      return;
    }

    await client.query(
      `UPDATE public.companies
       SET portal_lead_credits_balance = portal_lead_credits_balance - $1, updated_at = now()
       WHERE id = $2 AND tenant_id = $3`,
      [price, cid, tid]
    );
    await client.query(
      `UPDATE public.intake_project_assignments SET deal_fee_recorded = TRUE, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [aid, tid]
    );
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { applyDealPriceDebitOnInterestedIfNeeded };
