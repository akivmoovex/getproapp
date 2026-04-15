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
    notes: `accounting_export_test ${base}`,
  });
  await fieldAgentPayRunRepo.insertPayRunItems(pool, payRunId, tenantId, [
    {
      fieldAgentId: faId,
      fieldAgentLabel: "Accounting FA Alpha",
      periodStart,
      periodEnd,
      spRatingValue: 4,
      spRatingLowThresholdUsed: 3,
      spRatingHighThresholdUsed: 4.5,
      spHighRatingBonusPercentUsed: 5,
      earnedSpCommission: baseAmount,
      spBonusAmount: 1.25,
      spWithheldAmount: 0.5,
      spPayableAmount: baseAmount,
      earnedEcCommission: 2,
      ecWithheldAmount: 0,
      ecPayableAmount: 3.5,
      recruitmentCommissionAmount: 0.75,
      qualityStatusLabelSp: "sp_ok",
      qualityStatusLabelEc: "ec_ok",
      appliedAdjustmentAmount: -2,
      netPayableAmount: baseAmount + 3.5 + 0.75 - 2,
    },
  ]);
  return { payRunId, faId };
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
      secret: "admin_fa_accounting_export_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_fa_acct_sid",
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
  "accounting export: forbidden for non pay-run admin role",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 50);
    if (!created) return;
    const app = createApp(TENANT_ZM, ROLES.CSR);
    await request(app).get(`/admin/field-agent-pay-runs/${created.payRunId}/accounting-export.csv`).expect(403);
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "accounting export: tenant isolation (wrong session tenant)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 40);
    if (!created) return;
    const app = createApp(TENANT_IL, ROLES.TENANT_MANAGER);
    await request(app).get(`/admin/field-agent-pay-runs/${created.payRunId}/accounting-export.csv`).expect(403);
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "accounting export: not available for draft runs",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertDraftPayRunWithOneItem(pool, TENANT_ZM, 20);
    if (!created) return;
    const app = createApp(TENANT_ZM, ROLES.TENANT_MANAGER);
    await request(app).get(`/admin/field-agent-pay-runs/${created.payRunId}/accounting-export.csv`).expect(409);
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "accounting export: CSV reflects frozen item columns and ledger reconciliation",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 100);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-04-01",
      amount: 35,
      paymentMethod: "bank",
      paymentReference: "ACCT-REF",
      notes: "",
      createdByAdminUserId: adminId,
    });
    const app = createApp(TENANT_ZM, ROLES.TENANT_MANAGER);
    const res = await request(app).get(`/admin/field-agent-pay-runs/${created.payRunId}/accounting-export.csv`).expect(200);
    assert.ok(String(res.headers["content-type"] || "").includes("csv"));
    const text = String(res.text || "");
    const lines = text.trim().split("\n");
    assert.ok(lines.length >= 2);
    assert.ok(lines[0].includes("pay_run_id"));
    assert.ok(lines[0].includes("payment_total_for_run"));
    assert.ok(lines[0].includes("outstanding_amount_for_run"));
    assert.ok(lines[0].includes("overpaid_amount_for_run"));
    const row = lines[1].split(",");
    assert.ok(row.some((cell) => String(cell).includes("Accounting FA Alpha")));
    assert.ok(text.includes("sp_ok"));
    assert.ok(text.includes("ec_ok"));
    assert.match(text, /,1\.25,/);
    assert.ok(text.includes("35"));
    const rec = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, created.payRunId, TENANT_ZM);
    assert.ok(text.includes(String(rec.outstanding_amount)) || text.includes(Number(rec.outstanding_amount).toFixed(2)));
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "month-close page: shows unpaid, partial, paid, overpaid totals",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const adminId = await getAnyAdminUserId(pool);

    const u = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 60);
    if (!u) return;
    let html = (await request(createApp(TENANT_ZM)).get(`/admin/field-agent-pay-runs/${u.payRunId}/month-close`).expect(200)).text;
    assert.ok(html.includes("unpaid"));
    assert.ok(html.includes("Month-close reconciliation view"));
    assert.ok(html.includes("Frozen pay-run values"));
    await deletePayRunBypassTriggersForTests(pool, u.payRunId);

    const p = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 80);
    if (!p) return;
    await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: p.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-04-10",
      amount: 25,
      createdByAdminUserId: adminId,
    });
    html = (await request(createApp(TENANT_ZM)).get(`/admin/field-agent-pay-runs/${p.payRunId}/month-close`).expect(200)).text;
    assert.ok(html.includes("partial"));
    await deletePayRunBypassTriggersForTests(pool, p.payRunId);

    const f = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 90);
    if (!f) return;
    const items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, f.payRunId, TENANT_ZM);
    const net = Number(items[0].net_payable_amount);
    await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: f.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-04-11",
      amount: net,
      createdByAdminUserId: adminId,
    });
    html = (await request(createApp(TENANT_ZM)).get(`/admin/field-agent-pay-runs/${f.payRunId}/month-close`).expect(200)).text;
    assert.ok(html.includes(">paid<"));
    await deletePayRunBypassTriggersForTests(pool, f.payRunId);

    const o = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 20);
    if (!o) return;
    await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: o.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-04-12",
      amount: 25,
      createdByAdminUserId: adminId,
    });
    html = (await request(createApp(TENANT_ZM)).get(`/admin/field-agent-pay-runs/${o.payRunId}/month-close`).expect(200)).text;
    assert.ok(html.includes("overpaid"));
    assert.ok(html.includes("Outstanding is negative"));
    await deletePayRunBypassTriggersForTests(pool, o.payRunId);
  }
);

test(
  "month-close page: multiple payments listed in chronological order and summed in reconciliation",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 30);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-05-01",
      amount: 10,
      paymentReference: "P1",
      createdByAdminUserId: adminId,
    });
    await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-05-02",
      amount: 7.25,
      paymentReference: "P2",
      createdByAdminUserId: adminId,
    });
    const html = (
      await request(createApp(TENANT_ZM)).get(`/admin/field-agent-pay-runs/${created.payRunId}/month-close`).expect(200)
    ).text;
    const p1 = html.indexOf("P1");
    const p2 = html.indexOf("P2");
    assert.ok(p1 > 0 && p2 > 0);
    assert.ok(p1 < p2, "ledger should list earlier payment date first");
    assert.ok(html.includes("17.25"));
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "pay run detail page still renders reconciliation after accounting links",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 15);
    if (!created) return;
    const app = createApp(TENANT_ZM, ROLES.TENANT_MANAGER);
    const page = await request(app).get(`/admin/field-agent-pay-runs/${created.payRunId}`).expect(200);
    const html = String(page.text || "");
    assert.ok(html.includes("Reconciliation ledger"));
    assert.ok(html.includes("Month-close report"));
    assert.ok(html.includes("Accounting CSV"));
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "month-close: agent name filter narrows line items",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 11);
    if (!created) return;
    const app = createApp(TENANT_ZM, ROLES.TENANT_MANAGER);
    const miss = await request(app)
      .get(`/admin/field-agent-pay-runs/${created.payRunId}/month-close?agent_q=ZZZ_NO_MATCH`)
      .expect(200);
    assert.ok(String(miss.text).includes("No line items match"));
    const hit = await request(app)
      .get(`/admin/field-agent-pay-runs/${created.payRunId}/month-close?agent_q=Alpha`)
      .expect(200);
    assert.ok(String(hit.text).includes("Accounting FA Alpha"));
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);
