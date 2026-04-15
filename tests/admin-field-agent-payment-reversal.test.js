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
    notes: `reversal_test ${base}`,
  });
  await fieldAgentPayRunRepo.insertPayRunItems(pool, payRunId, tenantId, [
    {
      fieldAgentId: faId,
      fieldAgentLabel: "Rev FA",
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
  await fieldAgentPayRunRepo.approvePayRunForPayout(pool, created.payRunId, tenantId, adminId, null);
  return created;
}

function createApp(tenantId, role = ROLES.TENANT_MANAGER) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "admin_fa_payment_reversal_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_fa_rev_sid",
    })
  );
  app.use((req, res, next) => {
    req.session.adminUser = { id: 1, role, tenantId };
    res.locals.asset = () => "/styles.css";
    res.locals.bodyEmbedClass = "";
    res.locals.embed = false;
    res.locals.brandProductName = "Pro-online";
    next();
  });
  const router = express.Router();
  registerAdminFieldAgentPayRunsRoutes(router);
  app.use("/admin", router);
  return app;
}

test(
  "reversal: creates negative ledger entry and updates reconciliation",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 100);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    const add = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-06-01",
      amount: 40,
      paymentMethod: "bank",
      paymentReference: "P40",
      notes: "",
      createdByAdminUserId: adminId,
    });
    assert.equal(add.ok, true);
    const payId = Number(add.payment.id);
    const rev = await fieldAgentPayRunRepo.reversePaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentId: payId,
      reason: "duplicate entry",
      paymentDate: "2026-06-02",
      createdByAdminUserId: adminId,
    });
    assert.equal(rev.ok, true);
    assert.equal(Number(rev.payment.amount), -40);
    const m = fieldAgentPayRunRepo.parsePaymentMetadata(rev.payment);
    assert.equal(m.type, fieldAgentPayRunRepo.LEDGER_ENTRY_TYPE.REVERSAL);
    assert.equal(Number(m.reverses_payment_id), payId);
    const rec = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, created.payRunId, TENANT_ZM);
    assert.equal(Number(rec.total_paid_amount), 0);
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "correction: creates reversal plus new payment atomically",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 50);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    const add = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-06-10",
      amount: 20,
      paymentMethod: "bank",
      paymentReference: "WRONG",
      notes: "",
      createdByAdminUserId: adminId,
    });
    const payId = Number(add.payment.id);
    const cor = await fieldAgentPayRunRepo.correctPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentId: payId,
      reason: "typo in amount",
      newAmount: 20.5,
      paymentDate: "2026-06-11",
      paymentMethod: "bank",
      paymentReference: "FIXED",
      createdByAdminUserId: adminId,
    });
    assert.equal(cor.ok, true);
    assert.equal(Number(cor.reversal.amount), -20);
    assert.equal(Number(cor.payment.amount), 20.5);
    const rows = await fieldAgentPayRunRepo.listPaymentsForPayRun(pool, created.payRunId, TENANT_ZM, 20, { order: "asc" });
    assert.equal(rows.length, 3);
    const rec = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, created.payRunId, TENANT_ZM);
    assert.equal(Number(rec.total_paid_amount), 20.5);
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "reversal: double reversal blocked",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 30);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    const add = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-06-20",
      amount: 10,
      createdByAdminUserId: adminId,
    });
    const payId = Number(add.payment.id);
    const r1 = await fieldAgentPayRunRepo.reversePaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentId: payId,
      reason: "first",
      createdByAdminUserId: adminId,
    });
    assert.equal(r1.ok, true);
    const r2 = await fieldAgentPayRunRepo.reversePaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentId: payId,
      reason: "second",
      createdByAdminUserId: adminId,
    });
    assert.equal(r2.ok, false);
    assert.equal(r2.error, "ALREADY_REVERSED");
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "reversal: reason required",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 15);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    const add = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-06-21",
      amount: 5,
      createdByAdminUserId: adminId,
    });
    const r = await fieldAgentPayRunRepo.reversePaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentId: Number(add.payment.id),
      reason: "   ",
      createdByAdminUserId: adminId,
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "REASON_REQUIRED");
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "reversal: tenant isolation on payment id",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 12);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    const add = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-06-22",
      amount: 6,
      createdByAdminUserId: adminId,
    });
    const r = await fieldAgentPayRunRepo.reversePaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_IL,
      paymentId: Number(add.payment.id),
      reason: "wrong tenant",
      createdByAdminUserId: adminId,
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, "NOT_FOUND");
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "UI: detail shows reversal kind and reverse/correct for eligible row",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 20);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    const payAdd = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-06-23",
      amount: 8,
      createdByAdminUserId: adminId,
    });
    const payRowId = Number(payAdd.payment.id);
    const app = createApp(TENANT_ZM);
    const page = await request(app).get(`/admin/field-agent-pay-runs/${created.payRunId}`).expect(200);
    const html = String(page.text || "");
    assert.ok(html.includes("Reverse"));
    assert.ok(html.includes("Correct"));
    assert.ok(html.includes("Payment</span>") || html.includes(">Payment<"));
    const rev = await fieldAgentPayRunRepo.reversePaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentId: payRowId,
      reason: "ui reversal",
      createdByAdminUserId: adminId,
    });
    assert.equal(rev.ok, true);
    const page2 = await request(app).get(`/admin/field-agent-pay-runs/${created.payRunId}`).expect(200);
    const html2 = String(page2.text || "");
    assert.ok(html2.includes("Reversal"));
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "reversal: reopens paid run to approved when ledger drops below payable",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 40);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    const add = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-06-30",
      amount: 40,
      createdByAdminUserId: adminId,
    });
    assert.equal(add.ok, true);
    let run = await fieldAgentPayRunRepo.getPayRunByIdForTenant(pool, created.payRunId, TENANT_ZM);
    assert.equal(String(run.status), "paid");
    await fieldAgentPayRunRepo.reversePaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentId: Number(add.payment.id),
      reason: "reopen test",
      createdByAdminUserId: adminId,
    });
    run = await fieldAgentPayRunRepo.getPayRunByIdForTenant(pool, created.payRunId, TENANT_ZM);
    assert.equal(String(run.status), "approved");
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "POST reverse route: success redirects",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 25);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    const add = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-06-24",
      amount: 9,
      createdByAdminUserId: adminId,
    });
    const app = createApp(TENANT_ZM);
    const res = await request(app)
      .post(`/admin/field-agent-pay-runs/${created.payRunId}/payments/${add.payment.id}/reverse`)
      .type("form")
      .send({ reason: "route test" })
      .expect(302);
    assert.ok(String(res.headers.location || "").includes("reversal=1"));
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "hard-closed pay run blocks add, reverse, and correct with PAY_RUN_CLOSED",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 100);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    const add = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-07-01",
      amount: 30,
      paymentMethod: "bank",
      paymentReference: "P1",
      notes: "",
      createdByAdminUserId: adminId,
    });
    assert.equal(add.ok, true);
    const payId = Number(add.payment.id);
    const closed = await fieldAgentPayRunRepo.markPayRunSoftClosed(pool, created.payRunId, TENANT_ZM, adminId);
    assert.ok(closed.ok);

    const addBlocked = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-07-02",
      amount: 1,
      paymentMethod: "bank",
      paymentReference: "extra",
      notes: "",
      createdByAdminUserId: adminId,
    });
    assert.equal(addBlocked.ok, false);
    assert.equal(addBlocked.error, fieldAgentPayRunRepo.PAY_RUN_CLOSED_ERROR);
    assert.equal(addBlocked.message, fieldAgentPayRunRepo.PAY_RUN_CLOSED_MESSAGE);

    const revBlocked = await fieldAgentPayRunRepo.reversePaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentId: payId,
      reason: "nope",
      paymentDate: "2026-07-03",
      createdByAdminUserId: adminId,
    });
    assert.equal(revBlocked.ok, false);
    assert.equal(revBlocked.error, fieldAgentPayRunRepo.PAY_RUN_CLOSED_ERROR);

    const corBlocked = await fieldAgentPayRunRepo.correctPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentId: payId,
      reason: "nope",
      newAmount: 40,
      paymentDate: "2026-07-04",
      paymentMethod: "bank",
      paymentReference: "x",
      createdByAdminUserId: adminId,
    });
    assert.equal(corBlocked.ok, false);
    assert.equal(corBlocked.error, fieldAgentPayRunRepo.PAY_RUN_CLOSED_ERROR);

    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "reversal window: old original payment_date blocks reverse/correct; bypass allows",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const prev = process.env.FIELD_AGENT_PAY_RUN_REVERSAL_WINDOW_DAYS;
    process.env.FIELD_AGENT_PAY_RUN_REVERSAL_WINDOW_DAYS = "7";
    try {
      const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 80);
      if (!created) return;
      const adminId = await getAnyAdminUserId(pool);
      const add = await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
        payRunId: created.payRunId,
        tenantId: TENANT_ZM,
        paymentDate: "2026-08-01",
        amount: 20,
        paymentMethod: "bank",
        paymentReference: "OLD",
        notes: "",
        createdByAdminUserId: adminId,
      });
      assert.equal(add.ok, true);
      const payId = Number(add.payment.id);
      await pool.query(`UPDATE public.field_agent_pay_run_payments SET payment_date = $1::date WHERE id = $2`, [
        "2019-03-15",
        payId,
      ]);

      const revFail = await fieldAgentPayRunRepo.reversePaymentForPayRun(pool, {
        payRunId: created.payRunId,
        tenantId: TENANT_ZM,
        paymentId: payId,
        reason: "too late",
        paymentDate: "2026-08-02",
        createdByAdminUserId: adminId,
        bypassReversalWindow: false,
      });
      assert.equal(revFail.ok, false);
      assert.equal(revFail.error, fieldAgentPayRunRepo.REVERSAL_WINDOW_EXPIRED_ERROR);
      assert.equal(revFail.message, fieldAgentPayRunRepo.REVERSAL_WINDOW_EXPIRED_MESSAGE);

      const corFail = await fieldAgentPayRunRepo.correctPaymentForPayRun(pool, {
        payRunId: created.payRunId,
        tenantId: TENANT_ZM,
        paymentId: payId,
        reason: "too late",
        newAmount: 25,
        paymentDate: "2026-08-02",
        paymentMethod: "bank",
        paymentReference: "x",
        createdByAdminUserId: adminId,
        bypassReversalWindow: false,
      });
      assert.equal(corFail.ok, false);
      assert.equal(corFail.error, fieldAgentPayRunRepo.REVERSAL_WINDOW_EXPIRED_ERROR);

      const revOk = await fieldAgentPayRunRepo.reversePaymentForPayRun(pool, {
        payRunId: created.payRunId,
        tenantId: TENANT_ZM,
        paymentId: payId,
        reason: "super bypass",
        paymentDate: "2026-08-03",
        createdByAdminUserId: adminId,
        bypassReversalWindow: true,
      });
      assert.equal(revOk.ok, true);

      await deletePayRunBypassTriggersForTests(pool, created.payRunId);
    } finally {
      if (prev === undefined) delete process.env.FIELD_AGENT_PAY_RUN_REVERSAL_WINDOW_DAYS;
      else process.env.FIELD_AGENT_PAY_RUN_REVERSAL_WINDOW_DAYS = prev;
    }
  }
);
