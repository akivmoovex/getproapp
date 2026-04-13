"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseInclusiveUtcPeriodFromDateStrings } = require("../src/admin/fieldAgentPayRunCompute");
const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureFieldAgentPayRunsSchema } = require("../src/db/pg/ensureFieldAgentPayRunsSchema");
const { ensureTenantCommerceSettingsSchema } = require("../src/db/pg/ensureTenantCommerceSettingsSchema");
const fieldAgentPayRunRepo = require("../src/db/pg/fieldAgentPayRunRepo");
const { computePayRunPreview } = require("../src/admin/fieldAgentPayRunCompute");
const { buildPayRunItemsCsv } = require("../src/admin/fieldAgentPayRunExportCsv");
const tenantCommerceSettingsRepo = require("../src/db/pg/tenantCommerceSettingsRepo");
const { TENANT_ZM, TENANT_IL } = require("../src/tenants/tenantIds");

/** Test-only: remove pay runs stuck in locked/approved (triggers normally block DELETE). */
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

async function getAnyFieldAgentIdForTenant(pool, tenantId) {
  const r = await pool.query(`SELECT id FROM public.field_agents WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

async function getAnyAdminUserId(pool) {
  const r = await pool.query(`SELECT id FROM public.admin_users LIMIT 1`);
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

/**
 * Unique period window per call to satisfy tenant+period uniqueness.
 * @returns {Promise<{ payRunId: number, itemId: number, periodStart: Date, periodEnd: Date } | null>}
 */
async function insertDraftPayRunWithOneItem(pool, tenantId) {
  const base = Date.now();
  const periodStart = new Date(base);
  const periodEnd = new Date(base + 29 * 86400000);
  const faId = await getAnyFieldAgentIdForTenant(pool, tenantId);
  if (faId == null) return null;
  const payRunId = await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
    tenantId,
    periodStart,
    periodEnd,
    adminUserId: null,
    notes: `lock_approve_test ${base}`,
  });
  await fieldAgentPayRunRepo.insertPayRunItems(pool, payRunId, tenantId, [
    {
      fieldAgentId: faId,
      fieldAgentLabel: "Test FA",
      periodStart,
      periodEnd,
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
  const items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, payRunId, tenantId);
  return { payRunId, itemId: Number(items[0].id), periodStart, periodEnd };
}

async function insertApprovedPayRunWithOneItem(pool, tenantId) {
  const created = await insertDraftPayRunWithOneItem(pool, tenantId);
  if (!created) return null;
  const adminId = await getAnyAdminUserId(pool);
  await fieldAgentPayRunRepo.lockPayRunDraft(pool, created.payRunId, tenantId, adminId);
  await fieldAgentPayRunRepo.approvePayRunLocked(pool, created.payRunId, tenantId, adminId);
  return created;
}

test("parseInclusiveUtcPeriodFromDateStrings: valid range", () => {
  const p = parseInclusiveUtcPeriodFromDateStrings("2026-01-01", "2026-01-31");
  assert.ok(p);
  assert.equal(p.start.toISOString().slice(0, 10), "2026-01-01");
  assert.equal(p.end.toISOString().slice(0, 10), "2026-01-31");
});

test("parseInclusiveUtcPeriodFromDateStrings: end before start → null", () => {
  assert.equal(parseInclusiveUtcPeriodFromDateStrings("2026-02-01", "2026-01-01"), null);
});

test("buildPayRunItemsCsv: header row and net total from frozen columns", () => {
  const csv = buildPayRunItemsCsv(
    [
      {
        field_agent_id: 42,
        field_agent_label_snapshot: "Name, Inc",
        period_start: new Date("2026-01-01T00:00:00.000Z"),
        period_end: new Date("2026-01-31T00:00:00.000Z"),
        earned_sp_commission: 1,
        sp_bonus_amount: 0,
        sp_withheld_amount: 0,
        sp_payable_amount: 10,
        earned_ec_commission: 2,
        ec_withheld_amount: 0,
        ec_payable_amount: 3,
        recruitment_commission_amount: 5,
        applied_adjustment_amount: -2,
        net_payable_amount: 16,
        quality_status_label_sp: "ok",
        quality_status_label_ec: "fine",
      },
    ],
    "ZMW"
  );
  const lines = csv.trim().split("\n");
  assert.ok(lines[0].includes("applied_adjustment_amount") && lines[0].includes("net_payable_amount"));
  assert.ok(lines[1].includes('"Name, Inc"'));
  assert.ok(lines[1].endsWith(",ok,fine") || lines[1].includes(",ok,fine"));
  assert.ok(csv.includes(",-2,") && csv.includes(",16,"));
});

test(
  "field_agent_pay_runs: duplicate tenant+period rejected",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureTenantCommerceSettingsSchema(pool);
    await ensureFieldAgentPayRunsSchema(pool);
    const u = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const start = new Date(`2026-03-01T00:00:00.000Z`);
    const end = new Date(`2026-03-31T23:59:59.999Z`);
    const id1 = await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
      tenantId: TENANT_ZM,
      periodStart: start,
      periodEnd: end,
      adminUserId: null,
      notes: `test ${u}`,
    });
    assert.ok(id1 > 0);
    let threw = false;
    try {
      await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
        tenantId: TENANT_ZM,
        periodStart: start,
        periodEnd: end,
        adminUserId: null,
        notes: "dup",
      });
    } catch (e) {
      threw = true;
      assert.equal(e.code, "23505");
    }
    assert.ok(threw);
    await pool.query(`DELETE FROM public.field_agent_pay_runs WHERE id = $1`, [id1]);
  }
);

test(
  "pay run preview: explicit period uses tenant settings; frozen items survive commerce change",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureTenantCommerceSettingsSchema(pool);
    await ensureFieldAgentPayRunsSchema(pool);

    await tenantCommerceSettingsRepo.upsert(pool, TENANT_ZM, {
      currency: "ZMW",
      currency_name: "",
      currency_symbol: "K",
      deal_price_percentage: 3,
      minimum_credit_balance: 0,
      starting_credit_balance: 250,
      minimum_review_rating: 3,
      field_agent_sp_commission_percent: 10,
      field_agent_ec_commission_percent: 5,
      field_agent_sp_high_rating_bonus_percent: 5,
      field_agent_sp_rating_low_threshold: 3.0,
      field_agent_sp_rating_high_threshold: 4.5,
    });

    const preview = await computePayRunPreview(pool, TENANT_ZM, "2026-04-01", "2026-04-30");
    assert.ok(preview.rows.length >= 0);
    assert.equal(preview.settingsUsed.lowThreshold, 3);
    assert.equal(preview.settingsUsed.highThreshold, 4.5);

    const start = preview.periodStart;
    const end = preview.periodEnd;
    const payRunId = await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
      tenantId: TENANT_ZM,
      periodStart: start,
      periodEnd: end,
      adminUserId: null,
      notes: "freeze test",
    });

    const first = preview.rows[0];
    if (first) {
      await fieldAgentPayRunRepo.insertPayRunItems(pool, payRunId, TENANT_ZM, [
        {
          fieldAgentId: first.fieldAgentId,
          fieldAgentLabel: first.fieldAgentLabel,
          periodStart: start,
          periodEnd: end,
          spRatingValue: first.spRatingValue,
          spRatingLowThresholdUsed: first.spRatingLowThresholdUsed,
          spRatingHighThresholdUsed: first.spRatingHighThresholdUsed,
          spHighRatingBonusPercentUsed: 5,
          earnedSpCommission: first.earnedSpCommission,
          spBonusAmount: first.spBonusAmount,
          spWithheldAmount: first.spWithheldAmount,
          spPayableAmount: first.spPayableAmount,
          earnedEcCommission: first.earnedEcCommission,
          ecWithheldAmount: first.ecWithheldAmount,
          ecPayableAmount: first.ecPayableAmount,
          recruitmentCommissionAmount: first.recruitmentCommissionAmount,
          qualityStatusLabelSp: first.qualityStatusLabelSp,
          qualityStatusLabelEc: first.qualityStatusLabelEc,
        },
      ]);

      await tenantCommerceSettingsRepo.upsert(pool, TENANT_ZM, {
        currency: "ZMW",
        currency_name: "",
        currency_symbol: "K",
        deal_price_percentage: 3,
        minimum_credit_balance: 0,
        starting_credit_balance: 250,
        minimum_review_rating: 3,
        field_agent_sp_commission_percent: 99,
        field_agent_ec_commission_percent: 99,
        field_agent_sp_high_rating_bonus_percent: 99,
        field_agent_sp_rating_low_threshold: 1.0,
        field_agent_sp_rating_high_threshold: 2.0,
      });

      const items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, payRunId, TENANT_ZM);
      assert.equal(items.length, 1);
      assert.equal(Number(items[0].sp_rating_low_threshold_used), 3);
      assert.equal(Number(items[0].sp_rating_high_threshold_used), 4.5);
      assert.equal(Number(items[0].earned_sp_commission), Number(first.earnedSpCommission));
    }

    await tenantCommerceSettingsRepo.upsert(pool, TENANT_ZM, {
      currency: "ZMW",
      currency_name: "",
      currency_symbol: "K",
      deal_price_percentage: 3,
      minimum_credit_balance: 0,
      starting_credit_balance: 250,
      minimum_review_rating: 3,
      field_agent_sp_commission_percent: 10,
      field_agent_ec_commission_percent: 5,
      field_agent_sp_high_rating_bonus_percent: 5,
      field_agent_sp_rating_low_threshold: 3.0,
      field_agent_sp_rating_high_threshold: 4.5,
    });

    await pool.query(`DELETE FROM public.field_agent_pay_runs WHERE id = $1`, [payRunId]);
  }
);

test(
  "field_agent_pay_runs: lock with no line items fails",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = await getAnyAdminUserId(pool);
    const base = Date.now();
    const periodStart = new Date(base + 86400000);
    const periodEnd = new Date(base + 86400000 + 29 * 86400000);
    const payRunId = await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
      tenantId: TENANT_ZM,
      periodStart,
      periodEnd,
      adminUserId: null,
      notes: `empty_items ${base}`,
    });
    const r = await fieldAgentPayRunRepo.lockPayRunDraft(pool, payRunId, TENANT_ZM, adminId);
    assert.equal(r.error, "NO_ITEMS");
    assert.equal(r.run, null);
    await pool.query(`DELETE FROM public.field_agent_pay_runs WHERE id = $1`, [payRunId]);
  }
);

test(
  "field_agent_pay_runs: lock from draft succeeds; timestamps and admin id",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = await getAnyAdminUserId(pool);
    const created = await insertDraftPayRunWithOneItem(pool, TENANT_ZM);
    if (!created) return;
    const { payRunId } = created;
    const before = Date.now();
    const r = await fieldAgentPayRunRepo.lockPayRunDraft(pool, payRunId, TENANT_ZM, adminId);
    assert.equal(r.error, null);
    assert.ok(r.run);
    assert.equal(r.run.status, "locked");
    assert.ok(r.run.locked_at);
    if (adminId != null) assert.equal(Number(r.run.locked_by_admin_user_id), adminId);
    else assert.equal(r.run.locked_by_admin_user_id, null);
    const lockedAt = new Date(r.run.locked_at).getTime();
    assert.ok(lockedAt >= before - 2000 && lockedAt <= Date.now() + 2000);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "field_agent_pay_runs: lock from non-draft (already locked) fails",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = await getAnyAdminUserId(pool);
    const created = await insertDraftPayRunWithOneItem(pool, TENANT_ZM);
    if (!created) return;
    const { payRunId } = created;
    const first = await fieldAgentPayRunRepo.lockPayRunDraft(pool, payRunId, TENANT_ZM, adminId);
    assert.equal(first.error, null);
    const second = await fieldAgentPayRunRepo.lockPayRunDraft(pool, payRunId, TENANT_ZM, adminId);
    assert.equal(second.error, "INVALID_STATE");
    assert.equal(second.run, null);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "field_agent_pay_runs: approve from locked succeeds; approved_at and admin id",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = await getAnyAdminUserId(pool);
    const created = await insertDraftPayRunWithOneItem(pool, TENANT_ZM);
    if (!created) return;
    const { payRunId } = created;
    await fieldAgentPayRunRepo.lockPayRunDraft(pool, payRunId, TENANT_ZM, adminId);
    const before = Date.now();
    const r = await fieldAgentPayRunRepo.approvePayRunLocked(pool, payRunId, TENANT_ZM, adminId);
    assert.equal(r.error, null);
    assert.ok(r.run);
    assert.equal(r.run.status, "approved");
    assert.ok(r.run.approved_at);
    if (adminId != null) assert.equal(Number(r.run.approved_by_admin_user_id), adminId);
    else assert.equal(r.run.approved_by_admin_user_id, null);
    const approvedAt = new Date(r.run.approved_at).getTime();
    assert.ok(approvedAt >= before - 2000 && approvedAt <= Date.now() + 2000);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "field_agent_pay_runs: approve from draft fails",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = await getAnyAdminUserId(pool);
    const created = await insertDraftPayRunWithOneItem(pool, TENANT_ZM);
    if (!created) return;
    const { payRunId } = created;
    const r = await fieldAgentPayRunRepo.approvePayRunLocked(pool, payRunId, TENANT_ZM, adminId);
    assert.equal(r.error, "INVALID_STATE");
    assert.equal(r.run, null);
    await pool.query(`DELETE FROM public.field_agent_pay_runs WHERE id = $1`, [payRunId]);
  }
);

test(
  "field_agent_pay_runs: items cannot be updated after lock (DB trigger)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = await getAnyAdminUserId(pool);
    const created = await insertDraftPayRunWithOneItem(pool, TENANT_ZM);
    if (!created) return;
    const { payRunId, itemId } = created;
    await fieldAgentPayRunRepo.lockPayRunDraft(pool, payRunId, TENANT_ZM, adminId);
    let threw = false;
    try {
      await pool.query(`UPDATE public.field_agent_pay_run_items SET sp_bonus_amount = 999 WHERE id = $1`, [itemId]);
    } catch (e) {
      threw = true;
      assert.ok(String(e.message || "").includes("updates not allowed after lock"));
    }
    assert.ok(threw);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "field_agent_pay_runs: lock with wrong tenant id does not transition",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = await getAnyAdminUserId(pool);
    const created = await insertDraftPayRunWithOneItem(pool, TENANT_ZM);
    if (!created) return;
    const { payRunId } = created;
    const r = await fieldAgentPayRunRepo.lockPayRunDraft(pool, payRunId, TENANT_IL, adminId);
    assert.equal(r.error, "INVALID_STATE");
    const row = await fieldAgentPayRunRepo.getPayRunByIdForTenant(pool, payRunId, TENANT_ZM);
    assert.equal(row.status, "draft");
    await pool.query(`DELETE FROM public.field_agent_pay_runs WHERE id = $1`, [payRunId]);
  }
);

test(
  "field_agent_pay_runs: concurrent lock attempts — only one succeeds",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = await getAnyAdminUserId(pool);
    const created = await insertDraftPayRunWithOneItem(pool, TENANT_ZM);
    if (!created) return;
    const { payRunId } = created;
    const [a, b] = await Promise.all([
      fieldAgentPayRunRepo.lockPayRunDraft(pool, payRunId, TENANT_ZM, adminId),
      fieldAgentPayRunRepo.lockPayRunDraft(pool, payRunId, TENANT_ZM, adminId),
    ]);
    const successes = [a, b].filter((x) => x.error == null && x.run);
    assert.equal(successes.length, 1);
    const failures = [a, b].filter((x) => x.error === "INVALID_STATE");
    assert.equal(failures.length, 1);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "field_agent_pay_runs: mark paid from approved succeeds; payout_reference stored",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = await getAnyAdminUserId(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM);
    if (!created) return;
    const { payRunId } = created;
    const r = await fieldAgentPayRunRepo.markPayRunApprovedAsPaid(pool, payRunId, TENANT_ZM, adminId, {
      payoutReference: "BANK-REF-999",
      payoutNotes: "batch jan",
    });
    assert.equal(r.error, null);
    assert.ok(r.run);
    assert.equal(r.run.status, "paid");
    assert.ok(r.run.paid_at);
    assert.equal(String(r.run.payout_reference), "BANK-REF-999");
    assert.equal(String(r.run.payout_notes), "batch jan");
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "field_agent_pay_runs: mark paid from draft or locked fails",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = await getAnyAdminUserId(pool);
    const draft = await insertDraftPayRunWithOneItem(pool, TENANT_ZM);
    if (!draft) return;
    const r1 = await fieldAgentPayRunRepo.markPayRunApprovedAsPaid(pool, draft.payRunId, TENANT_ZM, adminId, {});
    assert.equal(r1.error, "INVALID_STATE");
    await fieldAgentPayRunRepo.lockPayRunDraft(pool, draft.payRunId, TENANT_ZM, adminId);
    const r2 = await fieldAgentPayRunRepo.markPayRunApprovedAsPaid(pool, draft.payRunId, TENANT_ZM, adminId, {});
    assert.equal(r2.error, "INVALID_STATE");
    await deletePayRunBypassTriggersForTests(pool, draft.payRunId);
  }
);

test(
  "field_agent_pay_runs: paid run cannot update pay_run row (except export metadata)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = await getAnyAdminUserId(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM);
    if (!created) return;
    const { payRunId } = created;
    await fieldAgentPayRunRepo.markPayRunApprovedAsPaid(pool, payRunId, TENANT_ZM, adminId, {});
    let threw = false;
    try {
      await pool.query(`UPDATE public.field_agent_pay_runs SET notes = notes || 'x' WHERE id = $1`, [payRunId]);
    } catch (e) {
      threw = true;
      assert.ok(String(e.message || "").includes("paid runs cannot be modified"));
    }
    assert.ok(threw);
    const ex = await fieldAgentPayRunRepo.recordPayRunExportGenerated(pool, payRunId, TENANT_ZM);
    assert.ok(ex);
    assert.equal(ex.export_format, "csv");
    assert.ok(ex.export_generated_at);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "field_agent_pay_runs: mark paid wrong tenant id fails",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = await getAnyAdminUserId(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM);
    if (!created) return;
    const { payRunId } = created;
    const r = await fieldAgentPayRunRepo.markPayRunApprovedAsPaid(pool, payRunId, TENANT_IL, adminId, {});
    assert.equal(r.error, "INVALID_STATE");
    const row = await fieldAgentPayRunRepo.getPayRunByIdForTenant(pool, payRunId, TENANT_ZM);
    assert.equal(row.status, "approved");
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "field_agent_pay_runs: export metadata not set for draft on recordExportGenerated",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertDraftPayRunWithOneItem(pool, TENANT_ZM);
    if (!created) return;
    const { payRunId } = created;
    const ex = await fieldAgentPayRunRepo.recordPayRunExportGenerated(pool, payRunId, TENANT_ZM);
    assert.equal(ex, null);
    await pool.query(`DELETE FROM public.field_agent_pay_runs WHERE id = $1`, [payRunId]);
  }
);

test(
  "field_agent_pay_runs: CSV export uses item snapshot amounts (repo + builder)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM);
    if (!created) return;
    const { payRunId } = created;
    const items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, payRunId, TENANT_ZM);
    const csv = buildPayRunItemsCsv(items, "USD");
    const line = csv.trim().split("\n")[1];
    assert.ok(line.includes(String(items[0].field_agent_id)));
    assert.ok(line.includes(String(Number(items[0].sp_payable_amount))));
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);
