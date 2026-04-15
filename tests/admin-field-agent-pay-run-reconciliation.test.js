"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");
const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureFieldAgentPayRunsSchema } = require("../src/db/pg/ensureFieldAgentPayRunsSchema");
const registerAdminFieldAgentPayRunsRoutes = require("../src/routes/admin/adminFieldAgentPayRuns");
const fieldAgentPayRunRepo = require("../src/db/pg/fieldAgentPayRunRepo");
const { TENANT_ZM, TENANT_IL } = require("../src/tenants/tenantIds");
const { ROLES } = require("../src/auth/roles");

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

async function insertDraftPayRunWithOneItem(pool, tenantId, baseAmount = 10) {
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
    notes: `reconcile_test ${base}`,
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
      earnedSpCommission: baseAmount,
      spBonusAmount: 0,
      spWithheldAmount: 0,
      spPayableAmount: baseAmount,
      earnedEcCommission: 0,
      ecWithheldAmount: 0,
      ecPayableAmount: 0,
      recruitmentCommissionAmount: 0,
      qualityStatusLabelSp: "",
      qualityStatusLabelEc: "",
      appliedAdjustmentAmount: 0,
      netPayableAmount: baseAmount,
    },
  ]);
  return { payRunId };
}

async function insertApprovedPayRunWithOneItem(pool, tenantId, baseAmount = 10) {
  const created = await insertDraftPayRunWithOneItem(pool, tenantId, baseAmount);
  if (!created) return null;
  const adminId = await getAnyAdminUserId(pool);
  await fieldAgentPayRunRepo.lockPayRunDraft(pool, created.payRunId, tenantId, adminId);
  await fieldAgentPayRunRepo.approvePayRunLocked(pool, created.payRunId, tenantId, adminId);
  return created;
}

function createApp(tenantId, role = ROLES.TENANT_MANAGER) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "admin_fa_reconcile_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_fa_reconcile_sid",
    })
  );
  app.use((req, res, next) => {
    req.session.adminUser = { id: 1, role, tenantId };
    res.locals.asset = () => "/styles.css";
    res.locals.bodyEmbedClass = "";
    res.locals.embed = false;
    next();
  });
  const router = express.Router();
  registerAdminFieldAgentPayRunsRoutes(router);
  app.use("/admin", router);
  return app;
}

test(
  "reconciliation: payment create on approved succeeds",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 100);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    const res = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-01-15",
      amount: 40,
      paymentMethod: "bank_transfer",
      paymentReference: "TX-1",
      notes: "partial payment",
      createdByAdminUserId: adminId,
    });
    assert.equal(res.ok, true);
    assert.equal(Number(res.reconciliation.total_paid_amount), 40);
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "reconciliation: payment create on draft/locked fails",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const draft = await insertDraftPayRunWithOneItem(pool, TENANT_ZM, 50);
    if (!draft) return;
    const adminId = await getAnyAdminUserId(pool);
    const rDraft = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: draft.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-01-16",
      amount: 10,
      createdByAdminUserId: adminId,
    });
    assert.equal(rDraft.ok, false);
    await fieldAgentPayRunRepo.lockPayRunDraft(pool, draft.payRunId, TENANT_ZM, adminId);
    const rLocked = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: draft.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-01-16",
      amount: 10,
      createdByAdminUserId: adminId,
    });
    assert.equal(rLocked.ok, false);
    await deletePayRunBypassTriggersForTests(pool, draft.payRunId);
  }
);

test(
  "reconciliation: unpaid/partial/paid/overpaid computed correctly",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 100);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    let rec = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, created.payRunId, TENANT_ZM);
    assert.equal(rec.reconciliation_status, "unpaid");
    await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-02-01",
      amount: 30,
      createdByAdminUserId: adminId,
    });
    rec = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, created.payRunId, TENANT_ZM);
    assert.equal(rec.reconciliation_status, "partial");
    await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-02-02",
      amount: 70,
      createdByAdminUserId: adminId,
    });
    rec = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, created.payRunId, TENANT_ZM);
    assert.equal(rec.reconciliation_status, "paid");
    await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-02-03",
      amount: 5,
      createdByAdminUserId: adminId,
    });
    rec = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, created.payRunId, TENANT_ZM);
    assert.equal(rec.reconciliation_status, "overpaid");
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "reconciliation: multiple payment rows sum correctly",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 20);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-03-01",
      amount: 5,
      createdByAdminUserId: adminId,
    });
    await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-03-02",
      amount: 3.5,
      createdByAdminUserId: adminId,
    });
    const rows = await fieldAgentPayRunRepo.listPaymentsForPayRun(pool, created.payRunId, TENANT_ZM);
    assert.equal(rows.length, 2);
    const rec = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, created.payRunId, TENANT_ZM);
    assert.equal(Number(rec.total_paid_amount), 8.5);
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "reconciliation: tenant isolation enforced",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 10);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    const res = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_IL,
      paymentDate: "2026-03-03",
      amount: 1,
      createdByAdminUserId: adminId,
    });
    assert.equal(res.ok, false);
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "reconciliation: frozen pay run item values remain unchanged after payments",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 33);
    if (!created) return;
    const itemsBefore = await fieldAgentPayRunRepo.listItemsForPayRun(pool, created.payRunId, TENANT_ZM);
    const beforeNet = Number(itemsBefore[0].net_payable_amount);
    const adminId = await getAnyAdminUserId(pool);
    await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-03-04",
      amount: 10,
      createdByAdminUserId: adminId,
    });
    const itemsAfter = await fieldAgentPayRunRepo.listItemsForPayRun(pool, created.payRunId, TENANT_ZM);
    assert.equal(Number(itemsAfter[0].net_payable_amount), beforeNet);
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "reconciliation: mark-paid shortcut creates payment event and uses ledger totals",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 10);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    const mark = await fieldAgentPayRunRepo.markPayRunApprovedAsPaidViaLedger(pool, created.payRunId, TENANT_ZM, adminId, {
      payoutReference: "LEDGER-MARK-1",
      payoutNotes: "shortcut",
    });
    assert.equal(mark.error, null);
    const rows = await fieldAgentPayRunRepo.listPaymentsForPayRun(pool, created.payRunId, TENANT_ZM);
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].amount), 10);
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "reconciliation: payment history rendered in admin detail UI",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 12);
    if (!created) return;
    const app = createApp(TENANT_ZM, ROLES.TENANT_MANAGER);
    await request(app)
      .post(`/admin/field-agent-pay-runs/${created.payRunId}/payments`)
      .type("form")
      .send({
        payment_date: "2026-03-05",
        amount: "4",
        payment_method: "bank_transfer",
        payment_reference: "UI-REF-1",
        notes: "ui test",
      })
      .expect(302);
    const page = await request(app).get(`/admin/field-agent-pay-runs/${created.payRunId}`).expect(200);
    const html = String(page.text || "");
    assert.ok(html.includes("Reconciliation ledger"));
    assert.ok(html.includes("Payment history"));
    assert.ok(html.includes("UI-REF-1"));
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);
