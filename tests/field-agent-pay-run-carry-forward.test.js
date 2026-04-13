"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureFieldAgentPayRunsSchema } = require("../src/db/pg/ensureFieldAgentPayRunsSchema");
const { computePayRunPreview } = require("../src/admin/fieldAgentPayRunCompute");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const fieldAgentPayRunRepo = require("../src/db/pg/fieldAgentPayRunRepo");
const fieldAgentPayRunAdjustmentsRepo = require("../src/db/pg/fieldAgentPayRunAdjustmentsRepo");
const { buildStatementDetailFromSnapshotRow } = require("../src/fieldAgent/fieldAgentStatementPayload");
const tenantCommerceSettingsRepo = require("../src/db/pg/tenantCommerceSettingsRepo");
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

test(
  "carry-forward: preview includes unapplied adjustments in projected net",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminRow = (await pool.query(`SELECT id FROM public.admin_users LIMIT 1`)).rows[0];
    if (!adminRow) return;
    const adminId = Number(adminRow.id);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_cf_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, itemId } = await (async () => {
      const base = Date.now() + 100000;
      const periodStart = new Date(base);
      const periodEnd = new Date(base + 29 * 86400000);
      const prid = await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
        tenantId: TENANT_ZM,
        periodStart,
        periodEnd,
        adminUserId: null,
        notes: `orig_${base}`,
      });
      await fieldAgentPayRunRepo.insertPayRunItems(pool, prid, TENANT_ZM, [
        {
          fieldAgentId: faId,
          fieldAgentLabel: "X",
          periodStart,
          periodEnd,
          spRatingValue: 4,
          spRatingLowThresholdUsed: 3,
          spRatingHighThresholdUsed: 4.5,
          spHighRatingBonusPercentUsed: 5,
          earnedSpCommission: 1,
          spBonusAmount: 0,
          spWithheldAmount: 0,
          spPayableAmount: 2,
          earnedEcCommission: 0,
          ecWithheldAmount: 0,
          ecPayableAmount: 0,
          recruitmentCommissionAmount: 0,
          qualityStatusLabelSp: "",
          qualityStatusLabelEc: "",
        },
      ]);
      const aid = (await pool.query(`SELECT id FROM public.admin_users LIMIT 1`)).rows[0];
      const a = aid ? Number(aid.id) : null;
      await fieldAgentPayRunRepo.lockPayRunDraft(pool, prid, TENANT_ZM, a);
      await fieldAgentPayRunRepo.approvePayRunLocked(pool, prid, TENANT_ZM, a);
      const items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, prid, TENANT_ZM);
      return { payRunId: prid, itemId: Number(items[0].id) };
    })();

    await fieldAgentPayRunAdjustmentsRepo.createAdjustment(pool, {
      tenantId: TENANT_ZM,
      payRunId,
      payRunItemId: itemId,
      fieldAgentId: faId,
      adjustmentAmount: 4.5,
      adjustmentType: "manual",
      reason: "cf test",
      adminNotes: null,
      createdByAdminUserId: adminId,
      disputeId: null,
    });

    const preview = await computePayRunPreview(pool, TENANT_ZM, "2026-06-01", "2026-06-30");
    const row = preview.rows.find((r) => Number(r.fieldAgentId) === faId);
    assert.ok(row);
    assert.equal(Number(row.unappliedAdjustmentsTotal), 4.5);
    assert.ok(Number(row.projectedNetPayable) >= Number(row.basePayableTotal) + 4.5 - 0.01);

    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "carry-forward: draft creation freezes applied + net and links adjustments",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminRow = (await pool.query(`SELECT id FROM public.admin_users LIMIT 1`)).rows[0];
    if (!adminRow) return;
    const adminId = Number(adminRow.id);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_cf2_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId: origId, itemId } = await (async () => {
      const base = Date.now() + 200000;
      const periodStart = new Date(base);
      const periodEnd = new Date(base + 29 * 86400000);
      const prid = await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
        tenantId: TENANT_ZM,
        periodStart,
        periodEnd,
        adminUserId: null,
        notes: `orig2_${base}`,
      });
      await fieldAgentPayRunRepo.insertPayRunItems(pool, prid, TENANT_ZM, [
        {
          fieldAgentId: faId,
          fieldAgentLabel: "Y",
          periodStart,
          periodEnd,
          spRatingValue: 4,
          spRatingLowThresholdUsed: 3,
          spRatingHighThresholdUsed: 4.5,
          spHighRatingBonusPercentUsed: 5,
          earnedSpCommission: 1,
          spBonusAmount: 0,
          spWithheldAmount: 0,
          spPayableAmount: 10,
          earnedEcCommission: 0,
          ecWithheldAmount: 0,
          ecPayableAmount: 0,
          recruitmentCommissionAmount: 0,
          qualityStatusLabelSp: "",
          qualityStatusLabelEc: "",
        },
      ]);
      const a = adminId;
      await fieldAgentPayRunRepo.lockPayRunDraft(pool, prid, TENANT_ZM, a);
      await fieldAgentPayRunRepo.approvePayRunLocked(pool, prid, TENANT_ZM, a);
      const items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, prid, TENANT_ZM);
      return { payRunId: prid, itemId: Number(items[0].id) };
    })();

    const spBefore = (
      await pool.query(`SELECT sp_payable_amount FROM field_agent_pay_run_items WHERE id = $1`, [itemId])
    ).rows[0];
    const sp0 = Number(spBefore.sp_payable_amount);

    await fieldAgentPayRunAdjustmentsRepo.createAdjustment(pool, {
      tenantId: TENANT_ZM,
      payRunId: origId,
      payRunItemId: itemId,
      fieldAgentId: faId,
      adjustmentAmount: -3,
      adjustmentType: "manual",
      reason: "neg",
      adminNotes: null,
      createdByAdminUserId: adminId,
      disputeId: null,
    });

    const preview = await computePayRunPreview(pool, TENANT_ZM, "2027-01-01", "2027-01-31");
    const previewRow = preview.rows.find((r) => Number(r.fieldAgentId) === faId);
    assert.ok(previewRow);
    assert.equal(Number(previewRow.unappliedAdjustmentsTotal), -3);

    const newDraftId = await fieldAgentPayRunRepo.createDraftPayRunWithCarryForward(pool, {
      tenantId: TENANT_ZM,
      periodStart: preview.periodStart,
      periodEnd: preview.periodEnd,
      adminUserId: adminId,
      notes: "with carry",
      previewRows: preview.rows.map((r) => ({
        fieldAgentId: r.fieldAgentId,
        fieldAgentLabel: r.fieldAgentLabel,
        periodStart: preview.periodStart,
        periodEnd: preview.periodEnd,
        spRatingValue: r.spRatingValue != null ? Number(r.spRatingValue) : null,
        spRatingLowThresholdUsed: r.spRatingLowThresholdUsed,
        spRatingHighThresholdUsed: r.spRatingHighThresholdUsed,
        spHighRatingBonusPercentUsed: r.spHighRatingBonusPercentUsed,
        earnedSpCommission: r.earnedSpCommission,
        spBonusAmount: r.spBonusAmount,
        spWithheldAmount: r.spWithheldAmount,
        spPayableAmount: r.spPayableAmount,
        earnedEcCommission: r.earnedEcCommission,
        ecWithheldAmount: r.ecWithheldAmount,
        ecPayableAmount: r.ecPayableAmount,
        recruitmentCommissionAmount: r.recruitmentCommissionAmount,
        qualityStatusLabelSp: r.qualityStatusLabelSp,
        qualityStatusLabelEc: r.qualityStatusLabelEc,
      })),
    });

    const itemsNew = await fieldAgentPayRunRepo.listItemsForPayRun(pool, newDraftId, TENANT_ZM);
    const line = itemsNew.find((x) => Number(x.field_agent_id) === faId);
    assert.ok(line);
    assert.equal(Number(line.applied_adjustment_amount), -3);
    assert.equal(Number(line.net_payable_amount), fieldAgentPayRunRepo.roundMoney2(Number(line.sp_payable_amount) + Number(line.ec_payable_amount) + Number(line.recruitment_commission_amount) - 3));

    const adjRow = (
      await pool.query(`SELECT applied_in_pay_run_id FROM field_agent_pay_run_adjustments WHERE tenant_id = $1 AND field_agent_id = $2`, [
        TENANT_ZM,
        faId,
      ])
    ).rows[0];
    assert.equal(Number(adjRow.applied_in_pay_run_id), newDraftId);

    const spAfter = (
      await pool.query(`SELECT sp_payable_amount FROM field_agent_pay_run_items WHERE id = $1`, [itemId])
    ).rows[0];
    assert.equal(Number(spAfter.sp_payable_amount), sp0);

    const preview2 = await computePayRunPreview(pool, TENANT_ZM, "2027-02-01", "2027-02-28");
    const row2 = preview2.rows.find((r) => Number(r.fieldAgentId) === faId);
    assert.equal(Number(row2.unappliedAdjustmentsTotal), 0);

    await deletePayRunBypassTriggersForTests(pool, newDraftId);
    await deletePayRunBypassTriggersForTests(pool, origId);
  }
);

test(
  "carry-forward: deleting draft clears applied_in_pay_run_id (SET NULL)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = Number((await pool.query(`SELECT id FROM public.admin_users LIMIT 1`)).rows[0].id);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_cf3_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId: origId, itemId } = await (async () => {
      const base = Date.now() + 300000;
      const ps = new Date(base);
      const pe = new Date(base + 29 * 86400000);
      const prid = await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
        tenantId: TENANT_ZM,
        periodStart: ps,
        periodEnd: pe,
        adminUserId: null,
        notes: `o3_${base}`,
      });
      await fieldAgentPayRunRepo.insertPayRunItems(pool, prid, TENANT_ZM, [
        {
          fieldAgentId: faId,
          fieldAgentLabel: "Z",
          periodStart: ps,
          periodEnd: pe,
          spRatingValue: 4,
          spRatingLowThresholdUsed: 3,
          spRatingHighThresholdUsed: 4.5,
          spHighRatingBonusPercentUsed: 5,
          earnedSpCommission: 1,
          spBonusAmount: 0,
          spWithheldAmount: 0,
          spPayableAmount: 5,
          earnedEcCommission: 0,
          ecWithheldAmount: 0,
          ecPayableAmount: 0,
          recruitmentCommissionAmount: 0,
          qualityStatusLabelSp: "",
          qualityStatusLabelEc: "",
        },
      ]);
      await fieldAgentPayRunRepo.lockPayRunDraft(pool, prid, TENANT_ZM, adminId);
      await fieldAgentPayRunRepo.approvePayRunLocked(pool, prid, TENANT_ZM, adminId);
      const items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, prid, TENANT_ZM);
      return { payRunId: prid, itemId: Number(items[0].id) };
    })();

    await fieldAgentPayRunAdjustmentsRepo.createAdjustment(pool, {
      tenantId: TENANT_ZM,
      payRunId: origId,
      payRunItemId: itemId,
      fieldAgentId: faId,
      adjustmentAmount: 1,
      adjustmentType: "manual",
      reason: "del test",
      adminNotes: null,
      createdByAdminUserId: adminId,
      disputeId: null,
    });

    const preview = await computePayRunPreview(pool, TENANT_ZM, "2028-03-01", "2028-03-31");
    const draftId = await fieldAgentPayRunRepo.createDraftPayRunWithCarryForward(pool, {
      tenantId: TENANT_ZM,
      periodStart: preview.periodStart,
      periodEnd: preview.periodEnd,
      adminUserId: adminId,
      notes: "del",
      previewRows: preview.rows.map((r) => ({
        fieldAgentId: r.fieldAgentId,
        fieldAgentLabel: r.fieldAgentLabel,
        periodStart: preview.periodStart,
        periodEnd: preview.periodEnd,
        spRatingValue: r.spRatingValue != null ? Number(r.spRatingValue) : null,
        spRatingLowThresholdUsed: r.spRatingLowThresholdUsed,
        spRatingHighThresholdUsed: r.spRatingHighThresholdUsed,
        spHighRatingBonusPercentUsed: r.spHighRatingBonusPercentUsed,
        earnedSpCommission: r.earnedSpCommission,
        spBonusAmount: r.spBonusAmount,
        spWithheldAmount: r.spWithheldAmount,
        spPayableAmount: r.spPayableAmount,
        earnedEcCommission: r.earnedEcCommission,
        ecWithheldAmount: r.ecWithheldAmount,
        ecPayableAmount: r.ecPayableAmount,
        recruitmentCommissionAmount: r.recruitmentCommissionAmount,
        qualityStatusLabelSp: r.qualityStatusLabelSp,
        qualityStatusLabelEc: r.qualityStatusLabelEc,
      })),
    });

    await pool.query(`DELETE FROM public.field_agent_pay_runs WHERE id = $1`, [draftId]);

    const r = await pool.query(
      `SELECT applied_in_pay_run_id FROM field_agent_pay_run_adjustments WHERE tenant_id = $1 AND field_agent_id = $2`,
      [TENANT_ZM, faId]
    );
    assert.equal(r.rows[0].applied_in_pay_run_id, null);

    await deletePayRunBypassTriggersForTests(pool, origId);
  }
);

test(
  "carry-forward: tenant isolation on unapplied sum (preview)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const byFa = await fieldAgentPayRunAdjustmentsRepo.sumUnappliedAdjustmentsByFieldAgentForPreview(pool, TENANT_IL);
    const map = byFa instanceof Map ? byFa : new Map();
    const u = `${Date.now()}`;
    const faZm = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_iso_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const adminId = Number((await pool.query(`SELECT id FROM public.admin_users LIMIT 1`)).rows[0].id);
    const { payRunId, itemId } = await (async () => {
      const base = Date.now() + 400000;
      const ps = new Date(base);
      const pe = new Date(base + 29 * 86400000);
      const prid = await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
        tenantId: TENANT_ZM,
        periodStart: ps,
        periodEnd: pe,
        adminUserId: null,
        notes: `iso_${base}`,
      });
      await fieldAgentPayRunRepo.insertPayRunItems(pool, prid, TENANT_ZM, [
        {
          fieldAgentId: faZm,
          fieldAgentLabel: "I",
          periodStart: ps,
          periodEnd: pe,
          spRatingValue: 4,
          spRatingLowThresholdUsed: 3,
          spRatingHighThresholdUsed: 4.5,
          spHighRatingBonusPercentUsed: 5,
          earnedSpCommission: 1,
          spBonusAmount: 0,
          spWithheldAmount: 0,
          spPayableAmount: 1,
          earnedEcCommission: 0,
          ecWithheldAmount: 0,
          ecPayableAmount: 0,
          recruitmentCommissionAmount: 0,
          qualityStatusLabelSp: "",
          qualityStatusLabelEc: "",
        },
      ]);
      await fieldAgentPayRunRepo.lockPayRunDraft(pool, prid, TENANT_ZM, adminId);
      await fieldAgentPayRunRepo.approvePayRunLocked(pool, prid, TENANT_ZM, adminId);
      const items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, prid, TENANT_ZM);
      return { payRunId: prid, itemId: Number(items[0].id) };
    })();
    await fieldAgentPayRunAdjustmentsRepo.createAdjustment(pool, {
      tenantId: TENANT_ZM,
      payRunId,
      payRunItemId: itemId,
      fieldAgentId: faZm,
      adjustmentAmount: 99,
      adjustmentType: "manual",
      reason: "iso",
      adminNotes: null,
      createdByAdminUserId: adminId,
      disputeId: null,
    });
    assert.equal(map.has(faZm), false);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "carry-forward: statement detail shows net and base via buildStatementDetailFromSnapshotRow",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const commerce = await tenantCommerceSettingsRepo.getByTenantId(pool, TENANT_ZM);
    const row = {
      pay_run_id: 1,
      status: "approved",
      period_start: new Date("2026-01-01"),
      period_end: new Date("2026-01-31"),
      field_agent_label_snapshot: "T",
      earned_sp_commission: 1,
      sp_bonus_amount: 0,
      sp_withheld_amount: 0,
      sp_payable_amount: 10,
      earned_ec_commission: 2,
      ec_withheld_amount: 0,
      ec_payable_amount: 3,
      recruitment_commission_amount: 1,
      base_payable_total: 14,
      applied_adjustment_amount: 2,
      applied_adjustment_count: 1,
      adjustment_summary_label: "1 adjustment(s)",
      net_payable_amount: 16,
      total_payable: 16,
      quality_status_label_sp: "",
      quality_status_label_ec: "",
    };
    const d = buildStatementDetailFromSnapshotRow(row, commerce);
    assert.ok(String(d.netPayableDisplay).length > 0);
    assert.equal(Number(d.appliedAdjustmentCount), 1);
  }
);
