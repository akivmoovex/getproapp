"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureFieldAgentPayRunsSchema } = require("../src/db/pg/ensureFieldAgentPayRunsSchema");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const fieldAgentPayRunRepo = require("../src/db/pg/fieldAgentPayRunRepo");
const fieldAgentPayRunAdjustmentsRepo = require("../src/db/pg/fieldAgentPayRunAdjustmentsRepo");
const fieldAgentPayRunDisputesRepo = require("../src/db/pg/fieldAgentPayRunDisputesRepo");
const { TENANT_ZM, TENANT_IL } = require("../src/tenants/tenantIds");

async function deletePayRunBypassTriggersForTests(pool, payRunId) {
  const c = await pool.connect();
  try {
    await c.query(`SET session_replication_role = 'replica'`);
    await c.query(`DELETE FROM public.field_agent_pay_runs WHERE id = $1`, [payRunId]);
    await c.query(`SET session_replication_role = 'origin'`);
  } finally {
    c.release();
  }
}

async function insertApprovedPayRunForFieldAgent(pool, fieldAgentId, periodOffsetMs) {
  const base = Date.now() + (periodOffsetMs || 0);
  const periodStart = new Date(base);
  const periodEnd = new Date(base + 29 * 86400000);
  const payRunId = await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
    tenantId: TENANT_ZM,
    periodStart,
    periodEnd,
    adminUserId: null,
    notes: `fa_adj_${base}`,
  });
  await fieldAgentPayRunRepo.insertPayRunItems(pool, payRunId, TENANT_ZM, [
    {
      fieldAgentId,
      fieldAgentLabel: "Adj Test FA",
      periodStart,
      periodEnd,
      spRatingValue: 4,
      spRatingLowThresholdUsed: 3,
      spRatingHighThresholdUsed: 4.5,
      spHighRatingBonusPercentUsed: 5,
      earnedSpCommission: 10,
      spBonusAmount: 0,
      spWithheldAmount: 0,
      spPayableAmount: 100,
      earnedEcCommission: 0,
      ecWithheldAmount: 0,
      ecPayableAmount: 0,
      recruitmentCommissionAmount: 0,
      qualityStatusLabelSp: "ok",
      qualityStatusLabelEc: "",
    },
  ]);
  const adminRow = (await pool.query(`SELECT id FROM public.admin_users LIMIT 1`)).rows[0];
  const aid = adminRow ? Number(adminRow.id) : null;
  await fieldAgentPayRunRepo.lockPayRunDraft(pool, payRunId, TENANT_ZM, aid);
  await fieldAgentPayRunRepo.approvePayRunLocked(pool, payRunId, TENANT_ZM, aid);
  const items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, payRunId, TENANT_ZM);
  return { payRunId, itemId: Number(items[0].id) };
}

test(
  "adjustments: admin can create positive and negative; linked to item; snapshot unchanged",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = (await pool.query(`SELECT id FROM public.admin_users LIMIT 1`)).rows[0];
    if (!adminId) return;
    const aid = Number(adminId.id);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_adj_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, itemId } = await insertApprovedPayRunForFieldAgent(pool, faId, 0);
    const before = await pool.query(
      `SELECT sp_payable_amount FROM public.field_agent_pay_run_items WHERE id = $1`,
      [itemId]
    );
    const sp0 = Number(before.rows[0].sp_payable_amount);

    const pos = await fieldAgentPayRunAdjustmentsRepo.createAdjustment(pool, {
      tenantId: TENANT_ZM,
      originalPayRunItemId: itemId,
      adjustmentAmount: 12.5,
      adjustmentType: "manual",
      reason: "Bonus correction",
      adminNotes: null,
      createdByAdminUserId: aid,
      disputeId: null,
    });
    assert.equal(pos.error, null);
    assert.equal(Number(pos.adjustment.original_pay_run_item_id), itemId);
    assert.equal(Number(pos.adjustment.original_pay_run_id), payRunId);

    const neg = await fieldAgentPayRunAdjustmentsRepo.createAdjustment(pool, {
      tenantId: TENANT_ZM,
      originalPayRunItemId: itemId,
      adjustmentAmount: -3.25,
      adjustmentType: "sp",
      reason: "Offset",
      adminNotes: "note",
      createdByAdminUserId: aid,
      disputeId: null,
    });
    assert.equal(neg.error, null);
    assert.equal(Number(neg.adjustment.adjustment_amount), -3.25);

    const after = await pool.query(
      `SELECT sp_payable_amount FROM public.field_agent_pay_run_items WHERE id = $1`,
      [itemId]
    );
    assert.equal(Number(after.rows[0].sp_payable_amount), sp0);

    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "adjustments: zero amount rejected",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = (await pool.query(`SELECT id FROM public.admin_users LIMIT 1`)).rows[0];
    if (!adminId) return;
    const aid = Number(adminId.id);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_adj_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, itemId } = await insertApprovedPayRunForFieldAgent(pool, faId, 0);
    const z = await fieldAgentPayRunAdjustmentsRepo.createAdjustment(pool, {
      tenantId: TENANT_ZM,
      originalPayRunItemId: itemId,
      adjustmentAmount: 0,
      reason: "x",
      adminNotes: null,
      createdByAdminUserId: aid,
      disputeId: null,
    });
    assert.equal(z.error, "AMOUNT_NONZERO");
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "adjustments: tenant isolation on list and getAdjustmentsForPayRunItem",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = (await pool.query(`SELECT id FROM public.admin_users LIMIT 1`)).rows[0];
    if (!adminId) return;
    const aid = Number(adminId.id);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_adj_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, itemId } = await insertApprovedPayRunForFieldAgent(pool, faId, 0);
    await fieldAgentPayRunAdjustmentsRepo.createAdjustment(pool, {
      tenantId: TENANT_ZM,
      originalPayRunItemId: itemId,
      adjustmentAmount: 1,
      reason: "iso",
      adminNotes: null,
      createdByAdminUserId: aid,
      disputeId: null,
    });
    const wrongList = await fieldAgentPayRunAdjustmentsRepo.listAdjustmentsForAdmin(pool, TENANT_IL, {});
    assert.equal(wrongList.length, 0);
    const wrongItem = await fieldAgentPayRunAdjustmentsRepo.getAdjustmentsForPayRunItem(pool, TENANT_IL, itemId);
    assert.equal(wrongItem.length, 0);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "adjustments: field agent sees only own rows",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = (await pool.query(`SELECT id FROM public.admin_users LIMIT 1`)).rows[0];
    if (!adminId) return;
    const aid = Number(adminId.id);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faA = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_adj_a_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const faB = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_adj_b_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, itemId } = await insertApprovedPayRunForFieldAgent(pool, faA, 0);
    await fieldAgentPayRunAdjustmentsRepo.createAdjustment(pool, {
      tenantId: TENANT_ZM,
      originalPayRunItemId: itemId,
      adjustmentAmount: 5,
      reason: "A only",
      adminNotes: null,
      createdByAdminUserId: aid,
      disputeId: null,
    });
    const listB = await fieldAgentPayRunAdjustmentsRepo.listAdjustmentsForFieldAgent(pool, TENANT_ZM, faB, 50);
    assert.equal(listB.length, 0);
    const listA = await fieldAgentPayRunAdjustmentsRepo.listAdjustmentsForFieldAgent(pool, TENANT_ZM, faA, 50);
    assert.equal(listA.length, 1);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "adjustments: invalid item rejected (wrong tenant)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = (await pool.query(`SELECT id FROM public.admin_users LIMIT 1`)).rows[0];
    if (!adminId) return;
    const aid = Number(adminId.id);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_adj_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, itemId } = await insertApprovedPayRunForFieldAgent(pool, faId, 0);
    const bad = await fieldAgentPayRunAdjustmentsRepo.createAdjustment(pool, {
      tenantId: TENANT_IL,
      originalPayRunItemId: itemId,
      adjustmentAmount: 1,
      reason: "bad",
      adminNotes: null,
      createdByAdminUserId: aid,
      disputeId: null,
    });
    assert.equal(bad.error, "ITEM_NOT_FOUND");
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "adjustments: resolve dispute with adjustment (under_review)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = (await pool.query(`SELECT id FROM public.admin_users LIMIT 1`)).rows[0];
    if (!adminId) return;
    const aid = Number(adminId.id);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_adj_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, itemId } = await insertApprovedPayRunForFieldAgent(pool, faId, 0);
    const disp = await fieldAgentPayRunDisputesRepo.createDispute(pool, {
      tenantId: TENANT_ZM,
      payRunId,
      payRunItemId: itemId,
      fieldAgentId: faId,
      disputeReason: "test",
      disputeNotes: null,
    });
    assert.ok(disp.dispute);
    await fieldAgentPayRunDisputesRepo.updateDisputeStatus(pool, disp.dispute.id, TENANT_ZM, "under_review", aid, null);

    const result = await fieldAgentPayRunAdjustmentsRepo.createAdjustmentAndResolveDispute(pool, {
      tenantId: TENANT_ZM,
      originalPayRunItemId: itemId,
      adjustmentAmount: 7.5,
      adjustmentType: "manual",
      reason: "Resolved via adjustment",
      adminNotes: "done",
      createdByAdminUserId: aid,
      disputeId: Number(disp.dispute.id),
    });
    assert.equal(result.error, null);
    assert.ok(result.dispute);
    assert.equal(result.dispute.status, "resolved");
    assert.ok(result.adjustment.dispute_id != null);

    const d2 = await fieldAgentPayRunDisputesRepo.getDisputeById(pool, disp.dispute.id);
    assert.equal(d2.status, "resolved");

    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);
