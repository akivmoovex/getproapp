"use strict";

const fieldAgentPayRunRepo = require("./fieldAgentPayRunRepo");
const fieldAgentPayoutBatchRepo = require("./fieldAgentPayoutBatchRepo");

const round = fieldAgentPayRunRepo.roundMoney2;

/**
 * Payout batches with rolled-up expected / net paid / outstanding from member pay runs (ledger-derived).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} [limit]
 */
async function listPayoutBatchReconciliationRows(pool, tenantId, limit = 80) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const batches = await fieldAgentPayoutBatchRepo.listPayoutBatchesForTenant(pool, tid, limit);
  const out = [];
  for (const b of batches) {
    const members = await fieldAgentPayoutBatchRepo.listPayRunsInPayoutBatch(pool, b.id, tid);
    let expected = 0;
    let netPaid = 0;
    let outstanding = 0;
    for (const m of members) {
      const prid = Number(m.id);
      const rec = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, prid, tid);
      if (rec) {
        expected = round(expected + Number(rec.run_payable_total || 0));
        netPaid = round(netPaid + Number(rec.total_paid_amount || 0));
        outstanding = round(outstanding + Number(rec.outstanding_amount || 0));
      }
    }
    out.push({
      batch: b,
      memberCount: members.length,
      expectedTotal: expected,
      netPaidTotal: netPaid,
      outstandingTotal: outstanding,
    });
  }
  return out;
}

/**
 * Approved/paid pay runs that are not in a non-cancelled payout batch (standalone for this screen).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} [limit]
 */
async function listStandalonePayRunReconciliationRows(pool, tenantId, limit = 80) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const lim = Math.min(Math.max(Number(limit) || 80, 1), 200);
  const r = await pool.query(
    `
    SELECT pr.id
    FROM public.field_agent_pay_runs pr
    WHERE pr.tenant_id = $1
      AND pr.status IN ('approved', 'paid')
      AND NOT EXISTS (
        SELECT 1
        FROM public.field_agent_payout_batch_pay_runs m
        INNER JOIN public.field_agent_payout_batches b ON b.id = m.payout_batch_id
        WHERE m.pay_run_id = pr.id
          AND m.tenant_id = pr.tenant_id
          AND b.status <> 'cancelled'
      )
    ORDER BY pr.period_start DESC NULLS LAST, pr.id DESC
    LIMIT $2
    `,
    [tid, lim]
  );
  const out = [];
  for (const row of r.rows) {
    const pid = Number(row.id);
    const run = await fieldAgentPayRunRepo.getPayRunByIdForTenant(pool, pid, tid);
    const rec = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, pid, tid);
    if (run && rec) {
      out.push({ run, rec });
    }
  }
  return out;
}

module.exports = {
  listPayoutBatchReconciliationRows,
  listStandalonePayRunReconciliationRows,
};
