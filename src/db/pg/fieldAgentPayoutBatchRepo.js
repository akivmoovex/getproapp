"use strict";

const financeGuardService = require("../../finance/financeGuardService");
const fieldAgentPayRunRepo = require("./fieldAgentPayRunRepo");
const { assertPayoutApprovedForApprovedRun } = financeGuardService;
const {
  getPayRunByIdForTenantForUpdate,
  insertPayRunStatusHistory,
  PAY_RUN_STATUS_HISTORY_REASON,
} = fieldAgentPayRunRepo;
const {
  appendPayoutFinanceAudit,
  PAYOUT_FINANCE_AUDIT_ACTION,
  ENTITY: PAYOUT_FINANCE_AUDIT_ENTITY,
} = require("./fieldAgentPayoutFinanceAuditRepo");

const PAYOUT_BATCH_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
  CANCELLED: "cancelled",
};

/** @typedef {'BATCH_NOT_FOUND'|'NOT_OPEN'|'DUPLICATE_REFERENCE'|'PAY_RUN_NOT_FOUND'|'NOT_PAYOUT_APPROVED'|'PERIOD_OR_CLOSE'|'ALREADY_IN_OPEN_BATCH'|'ALREADY_IN_THIS_BATCH'|'PAY_RUN_ALREADY_BATCHED'|'INVALID'} ErrorCode */

/**
 * @param {import("pg").Pool|import("pg").PoolClient} pool
 * @param {number} tenantId
 * @param {{ batchReference: string, notes?: string | null, createdByAdminUserId: number | null }} p
 * @returns {Promise<{ batch: object | null, error: ErrorCode | null }>}
 */
async function createPayoutBatch(pool, tenantId, p) {
  const tid = Number(tenantId);
  const ref = p.batchReference != null ? String(p.batchReference).trim().slice(0, 200) : "";
  const notes = p.notes != null ? String(p.notes).trim().slice(0, 4000) : "";
  const aid = p.createdByAdminUserId != null && Number.isFinite(Number(p.createdByAdminUserId)) && Number(p.createdByAdminUserId) > 0 ? Number(p.createdByAdminUserId) : null;
  if (!Number.isFinite(tid) || tid < 1 || !ref) {
    return { batch: null, error: "INVALID" };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `
      INSERT INTO public.field_agent_payout_batches (
        tenant_id, batch_reference, status, notes, created_by_admin_user_id
      ) VALUES ($1, $2, 'open', NULLIF($3::text, ''), $4)
      RETURNING *
      `,
      [tid, ref, notes, aid]
    );
    const batch = r.rows[0];
    await appendPayoutFinanceAudit(client, {
      tenantId: tid,
      actorAdminUserId: aid,
      actionType: PAYOUT_FINANCE_AUDIT_ACTION.BATCH_CREATED,
      entityType: PAYOUT_FINANCE_AUDIT_ENTITY.PAYOUT_BATCH,
      entityId: Number(batch.id),
      note: notes || null,
      metadata: { batch_reference: ref },
    });
    await client.query("COMMIT");
    return { batch, error: null };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    if (e && e.code === "23505") {
      return { batch: null, error: "DUPLICATE_REFERENCE" };
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} [limit]
 */
async function listPayoutBatchesForTenant(pool, tenantId, limit = 80) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const lim = Math.min(Math.max(Number(limit) || 80, 1), 200);
  const r = await pool.query(
    `
    SELECT b.*,
           (SELECT COUNT(*)::int FROM public.field_agent_payout_batch_pay_runs m WHERE m.payout_batch_id = b.id) AS pay_run_count
    FROM public.field_agent_payout_batches b
    WHERE b.tenant_id = $1
    ORDER BY b.created_at DESC, b.id DESC
    LIMIT $2
    `,
    [tid, lim]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} batchId
 * @param {number} tenantId
 */
async function getPayoutBatchByIdForTenant(pool, batchId, tenantId) {
  const bid = Number(batchId);
  const tid = Number(tenantId);
  if (!Number.isFinite(bid) || bid < 1 || !Number.isFinite(tid) || tid < 1) return null;
  const r = await pool.query(
    `
    SELECT b.*,
           (SELECT COUNT(*)::int FROM public.field_agent_payout_batch_pay_runs m WHERE m.payout_batch_id = b.id) AS pay_run_count
    FROM public.field_agent_payout_batches b
    WHERE b.id = $1 AND b.tenant_id = $2
    LIMIT 1
    `,
    [bid, tid]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} batchId
 * @param {number} tenantId
 */
async function listPayRunsInPayoutBatch(pool, batchId, tenantId) {
  const bid = Number(batchId);
  const tid = Number(tenantId);
  if (!Number.isFinite(bid) || bid < 1 || !Number.isFinite(tid) || tid < 1) return [];
  const r = await pool.query(
    `
    SELECT
      m.id AS membership_id,
      m.added_at,
      m.added_by_admin_user_id,
      pr.id,
      pr.period_start,
      pr.period_end,
      pr.status,
      pr.payout_approved_at,
      pr.closed_at
    FROM public.field_agent_payout_batch_pay_runs m
    INNER JOIN public.field_agent_pay_runs pr ON pr.id = m.pay_run_id AND pr.tenant_id = m.tenant_id
    WHERE m.payout_batch_id = $1 AND m.tenant_id = $2
    ORDER BY pr.period_start ASC, pr.id ASC
    `,
    [bid, tid]
  );
  return r.rows;
}

/**
 * Approved + payout-approved + not already in any batch + same tenant.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} [limit]
 */
async function listPayRunsEligibleForPayoutBatch(pool, tenantId, limit = 100) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 300);
  const r = await pool.query(
    `
    SELECT pr.id, pr.period_start, pr.period_end, pr.status, pr.payout_approved_at, pr.closed_at
    FROM public.field_agent_pay_runs pr
    WHERE pr.tenant_id = $1
      AND pr.status = 'approved'
      AND pr.payout_approved_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.field_agent_payout_batch_pay_runs m WHERE m.pay_run_id = pr.id
      )
    ORDER BY pr.period_start DESC, pr.id DESC
    LIMIT $2
    `,
    [tid, lim]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ batchId: number, payRunId: number, tenantId: number, adminUserId: number | null }} p
 * @returns {Promise<{ ok: true, membership: object } | { ok: false, error: ErrorCode }>}
 */
async function addPayRunToPayoutBatch(pool, p) {
  const batchId = Number(p.batchId);
  const payRunId = Number(p.payRunId);
  const tid = Number(p.tenantId);
  const aid = p.adminUserId != null && Number.isFinite(Number(p.adminUserId)) && Number(p.adminUserId) > 0 ? Number(p.adminUserId) : null;
  if (!Number.isFinite(batchId) || batchId < 1 || !Number.isFinite(payRunId) || payRunId < 1 || !Number.isFinite(tid) || tid < 1) {
    return { ok: false, error: "INVALID" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const bRes = await client.query(
      `SELECT * FROM public.field_agent_payout_batches WHERE id = $1 AND tenant_id = $2 FOR UPDATE LIMIT 1`,
      [batchId, tid]
    );
    const batch = bRes.rows[0];
    if (!batch) {
      await client.query("ROLLBACK");
      return { ok: false, error: "BATCH_NOT_FOUND" };
    }
    if (String(batch.status || "") !== PAYOUT_BATCH_STATUS.OPEN) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NOT_OPEN" };
    }

    const run = await fieldAgentPayRunRepo.getPayRunByIdForTenant(client, payRunId, tid);
    if (!run) {
      await client.query("ROLLBACK");
      return { ok: false, error: "PAY_RUN_NOT_FOUND" };
    }
    const payoutOk = assertPayoutApprovedForApprovedRun(run);
    if (!payoutOk.ok) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NOT_PAYOUT_APPROVED" };
    }

    const periodGuards = await financeGuardService.assertHardCloseAndPeriodUnlocked(client, tid, run);
    if (!periodGuards.ok) {
      await client.query("ROLLBACK");
      return { ok: false, error: "PERIOD_OR_CLOSE" };
    }

    const mem = await client.query(
      `
      SELECT m.payout_batch_id, b.status AS batch_status
      FROM public.field_agent_payout_batch_pay_runs m
      INNER JOIN public.field_agent_payout_batches b ON b.id = m.payout_batch_id
      WHERE m.pay_run_id = $1
      LIMIT 1
      `,
      [payRunId]
    );
    if (mem.rows.length) {
      const existingBatchId = Number(mem.rows[0].payout_batch_id);
      const st = String(mem.rows[0].batch_status || "");
      if (existingBatchId === batchId) {
        await client.query("ROLLBACK");
        return { ok: false, error: "ALREADY_IN_THIS_BATCH" };
      }
      if (st === PAYOUT_BATCH_STATUS.OPEN) {
        await client.query("ROLLBACK");
        return { ok: false, error: "ALREADY_IN_OPEN_BATCH" };
      }
      await client.query("ROLLBACK");
      return { ok: false, error: "PAY_RUN_ALREADY_BATCHED" };
    }

    let ins;
    try {
      ins = await client.query(
        `
        INSERT INTO public.field_agent_payout_batch_pay_runs (
          payout_batch_id, pay_run_id, tenant_id, added_by_admin_user_id
        ) VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [batchId, payRunId, tid, aid]
      );
    } catch (e) {
      await client.query("ROLLBACK");
      if (e && e.code === "23505") {
        return { ok: false, error: "ALREADY_IN_THIS_BATCH" };
      }
      throw e;
    }

    await appendPayoutFinanceAudit(client, {
      tenantId: tid,
      actorAdminUserId: aid,
      actionType: PAYOUT_FINANCE_AUDIT_ACTION.PAY_RUN_ADDED_TO_BATCH,
      entityType: PAYOUT_FINANCE_AUDIT_ENTITY.PAY_RUN,
      entityId: payRunId,
      note: null,
      metadata: { payout_batch_id: batchId },
    });
    await appendPayoutFinanceAudit(client, {
      tenantId: tid,
      actorAdminUserId: aid,
      actionType: PAYOUT_FINANCE_AUDIT_ACTION.PAY_RUN_ADDED_TO_BATCH,
      entityType: PAYOUT_FINANCE_AUDIT_ENTITY.PAYOUT_BATCH,
      entityId: batchId,
      note: null,
      metadata: { pay_run_id: payRunId },
    });

    await client.query("COMMIT");
    return { ok: true, membership: ins.rows[0] };
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

/**
 * @param {import("pg").Pool} pool
 * @param {number} payRunId
 * @param {number} tenantId
 * @returns {Promise<{ id: number, status: string, batch_reference: string } | null>}
 */
async function getNonCancelledPayoutBatchContainingPayRun(pool, payRunId, tenantId) {
  const pid = Number(payRunId);
  const tid = Number(tenantId);
  if (!Number.isFinite(pid) || pid < 1 || !Number.isFinite(tid) || tid < 1) return null;
  const r = await pool.query(
    `
    SELECT b.id, b.status, b.batch_reference
    FROM public.field_agent_payout_batch_pay_runs m
    INNER JOIN public.field_agent_payout_batches b ON b.id = m.payout_batch_id
    WHERE m.pay_run_id = $1 AND m.tenant_id = $2 AND b.status <> 'cancelled'
    LIMIT 1
    `,
    [pid, tid]
  );
  return r.rows[0] ?? null;
}

/**
 * Record payout completion for the whole batch: updates batch + each member pay run with the same bank evidence; append-only status history per run. Does not change ledger.
 * @param {import("pg").Pool} pool
 * @param {{ batchId: number, tenantId: number, adminUserId: number | null, bankReference: string, paymentMethod: string, completionNote?: string | null }} p
 * @returns {Promise<{ batch: object | null, error: string | null }>}
 */
async function completePayoutBatchWithEvidence(pool, p) {
  const batchId = Number(p.batchId);
  const tid = Number(p.tenantId);
  const aid = p.adminUserId != null && Number.isFinite(Number(p.adminUserId)) && Number(p.adminUserId) > 0 ? Number(p.adminUserId) : null;
  const bank = p.bankReference != null ? String(p.bankReference).trim() : "";
  const meth = p.paymentMethod != null ? String(p.paymentMethod).trim().slice(0, 200) : "";
  const note = p.completionNote != null ? String(p.completionNote).trim().slice(0, 4000) : "";
  if (!Number.isFinite(batchId) || batchId < 1 || !Number.isFinite(tid) || tid < 1) {
    return { batch: null, error: "INVALID" };
  }
  if (!bank) return { batch: null, error: "BANK_REFERENCE_REQUIRED" };
  if (!meth) return { batch: null, error: "PAYMENT_METHOD_REQUIRED" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const bRes = await client.query(
      `SELECT * FROM public.field_agent_payout_batches WHERE id = $1 AND tenant_id = $2 FOR UPDATE LIMIT 1`,
      [batchId, tid]
    );
    const batch = bRes.rows[0];
    if (!batch) {
      await client.query("ROLLBACK");
      return { batch: null, error: "BATCH_NOT_FOUND" };
    }
    if (String(batch.status || "") === PAYOUT_BATCH_STATUS.CANCELLED) {
      await client.query("ROLLBACK");
      return { batch: null, error: "BATCH_CANCELLED" };
    }
    if (batch.payout_completed_at != null) {
      await client.query("ROLLBACK");
      return { batch: null, error: "ALREADY_COMPLETED" };
    }

    const memRes = await client.query(
      `SELECT pay_run_id FROM public.field_agent_payout_batch_pay_runs WHERE payout_batch_id = $1 AND tenant_id = $2 ORDER BY pay_run_id ASC`,
      [batchId, tid]
    );
    const payRunIds = memRes.rows.map((row) => Number(row.pay_run_id)).filter((id) => Number.isFinite(id) && id > 0);

    for (const prid of payRunIds) {
      const run = await getPayRunByIdForTenantForUpdate(client, prid, tid);
      if (!run) {
        await client.query("ROLLBACK");
        return { batch: null, error: "PAY_RUN_NOT_FOUND" };
      }
      if (String(run.status || "") === "void") {
        await client.query("ROLLBACK");
        return { batch: null, error: "VOID_MEMBER" };
      }
      if (run.payout_completed_at != null) {
        await client.query("ROLLBACK");
        return { batch: null, error: "MEMBER_ALREADY_COMPLETED" };
      }
      const payoutOk = assertPayoutApprovedForApprovedRun(run);
      if (!payoutOk.ok) {
        await client.query("ROLLBACK");
        return { batch: null, error: "NOT_PAYOUT_APPROVED" };
      }
      const guards = await financeGuardService.assertHardCloseAndPeriodUnlocked(client, tid, run);
      if (!guards.ok) {
        await client.query("ROLLBACK");
        return { batch: null, error: guards.error || "PERIOD_OR_CLOSE" };
      }
    }

    const bUp = await client.query(
      `
      UPDATE public.field_agent_payout_batches
      SET payout_completed_at = now(),
          completed_by_admin_user_id = $3,
          bank_reference = $4,
          payment_method = $5,
          completion_note = NULLIF($6::text, '')
      WHERE id = $1 AND tenant_id = $2 AND payout_completed_at IS NULL AND status <> 'cancelled'
      RETURNING *
      `,
      [batchId, tid, aid, bank, meth, note]
    );
    if (!bUp.rows.length) {
      await client.query("ROLLBACK");
      return { batch: null, error: "ALREADY_COMPLETED" };
    }
    const batchOut = bUp.rows[0];

    const reasonBase = PAY_RUN_STATUS_HISTORY_REASON.PAYOUT_BATCH_COMPLETION_RECORDED;
    const reasonSuffix = `batch_id=${batchId} ref=${bank.slice(0, 120)} method=${meth.slice(0, 80)}${note ? ` note=${note.slice(0, 400)}` : ""}`;

    for (const prid of payRunIds) {
      const runRow = await getPayRunByIdForTenantForUpdate(client, prid, tid);
      const st = String(runRow.status || "");
      await client.query(
        `
        UPDATE public.field_agent_pay_runs
        SET payout_completed_at = now(),
            completed_by_admin_user_id = $3,
            bank_reference = $4,
            payment_method = $5,
            completion_note = NULLIF($6::text, ''),
            updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND payout_completed_at IS NULL
        `,
        [prid, tid, aid, bank, meth, note]
      );
      const reason = `${reasonBase}: ${reasonSuffix}`.slice(0, 4000);
      await insertPayRunStatusHistory(client, {
        tenantId: tid,
        payRunId: prid,
        fromStatus: st,
        toStatus: st,
        reason,
        actorAdminUserId: aid,
        sourcePaymentId: null,
      });
      await appendPayoutFinanceAudit(client, {
        tenantId: tid,
        actorAdminUserId: aid,
        actionType: PAYOUT_FINANCE_AUDIT_ACTION.PAY_RUN_PAYOUT_COMPLETED,
        entityType: PAYOUT_FINANCE_AUDIT_ENTITY.PAY_RUN,
        entityId: prid,
        note: null,
        metadata: { payout_batch_id: batchId, bank_reference: bank, payment_method: meth },
      });
    }

    await appendPayoutFinanceAudit(client, {
      tenantId: tid,
      actorAdminUserId: aid,
      actionType: PAYOUT_FINANCE_AUDIT_ACTION.BATCH_PAYOUT_COMPLETED,
      entityType: PAYOUT_FINANCE_AUDIT_ENTITY.PAYOUT_BATCH,
      entityId: batchId,
      note: note || null,
      metadata: { pay_run_ids: payRunIds, bank_reference: bank, payment_method: meth },
    });

    await client.query("COMMIT");
    return { batch: batchOut, error: null };
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

/**
 * Mark payout batch as manually bank-reconciled (flags only on batch row).
 * @param {import("pg").Pool} pool
 * @param {{ batchId: number, tenantId: number, adminUserId: number | null, reconciliationNote?: string | null }} p
 * @returns {Promise<{ batch: object | null, error: string | null }>}
 */
async function markPayoutBatchBankReconciled(pool, p) {
  const bid = Number(p.batchId);
  const tid = Number(p.tenantId);
  const aid = p.adminUserId != null && Number.isFinite(Number(p.adminUserId)) && Number(p.adminUserId) > 0 ? Number(p.adminUserId) : null;
  const note = p.reconciliationNote != null ? String(p.reconciliationNote).trim().slice(0, 4000) : "";
  if (!Number.isFinite(bid) || bid < 1 || !Number.isFinite(tid) || tid < 1) {
    return { batch: null, error: "INVALID" };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `
      UPDATE public.field_agent_payout_batches
      SET reconciled_at = now(),
          reconciled_by_admin_user_id = $3,
          reconciliation_note = NULLIF($4::text, '')
      WHERE id = $1 AND tenant_id = $2 AND reconciled_at IS NULL AND status <> 'cancelled'
      RETURNING *
      `,
      [bid, tid, aid, note]
    );
    if (!r.rows.length) {
      await client.query("ROLLBACK");
      const probe = await getPayoutBatchByIdForTenant(pool, bid, tid);
      if (!probe) return { batch: null, error: "BATCH_NOT_FOUND" };
      if (String(probe.status || "") === PAYOUT_BATCH_STATUS.CANCELLED) return { batch: null, error: "BATCH_CANCELLED" };
      return { batch: null, error: "ALREADY_RECONCILED" };
    }
    await appendPayoutFinanceAudit(client, {
      tenantId: tid,
      actorAdminUserId: aid,
      actionType: PAYOUT_FINANCE_AUDIT_ACTION.BATCH_BANK_RECONCILED,
      entityType: PAYOUT_FINANCE_AUDIT_ENTITY.PAYOUT_BATCH,
      entityId: bid,
      note: note || null,
      metadata: {},
    });
    await client.query("COMMIT");
    return { batch: r.rows[0], error: null };
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

/**
 * @param {import("pg").Pool} pool
 * @param {number} batchId
 * @param {number} tenantId
 * @param {number | null} [adminUserId]
 */
async function closePayoutBatch(pool, batchId, tenantId, adminUserId = null) {
  const bid = Number(batchId);
  const tid = Number(tenantId);
  const aid =
    adminUserId != null && Number.isFinite(Number(adminUserId)) && Number(adminUserId) > 0 ? Number(adminUserId) : null;
  if (!Number.isFinite(bid) || bid < 1 || !Number.isFinite(tid) || tid < 1) {
    return { batch: null, error: "INVALID" };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `
      UPDATE public.field_agent_payout_batches
      SET status = 'closed'
      WHERE id = $1 AND tenant_id = $2 AND status = 'open'
      RETURNING *
      `,
      [bid, tid]
    );
    if (!r.rows.length) {
      await client.query("ROLLBACK");
      const probe = await getPayoutBatchByIdForTenant(pool, bid, tid);
      if (!probe) return { batch: null, error: "BATCH_NOT_FOUND" };
      return { batch: null, error: "NOT_OPEN" };
    }
    await appendPayoutFinanceAudit(client, {
      tenantId: tid,
      actorAdminUserId: aid,
      actionType: PAYOUT_FINANCE_AUDIT_ACTION.BATCH_CLOSED,
      entityType: PAYOUT_FINANCE_AUDIT_ENTITY.PAYOUT_BATCH,
      entityId: bid,
      note: null,
      metadata: {},
    });
    await client.query("COMMIT");
    return { batch: r.rows[0], error: null };
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

module.exports = {
  PAYOUT_BATCH_STATUS,
  createPayoutBatch,
  listPayoutBatchesForTenant,
  getPayoutBatchByIdForTenant,
  listPayRunsInPayoutBatch,
  listPayRunsEligibleForPayoutBatch,
  addPayRunToPayoutBatch,
  closePayoutBatch,
  getNonCancelledPayoutBatchContainingPayRun,
  completePayoutBatchWithEvidence,
  markPayoutBatchBankReconciled,
};
