"use strict";

/**
 * Field-agent monthly statements: tenant + field-agent scoping, visibility (approved/paid only).
 */

const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureFieldAgentPayRunsSchema } = require("../src/db/pg/ensureFieldAgentPayRunsSchema");
const fieldAgentRoutes = require("../src/routes/fieldAgent");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const fieldAgentPayRunRepo = require("../src/db/pg/fieldAgentPayRunRepo");
const { setFieldAgentSession } = require("../src/auth/fieldAgentAuth");
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

function createFaApp(fieldAgentId, tenantId = TENANT_ZM) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "fa_statements_test",
      resave: false,
      saveUninitialized: true,
      name: "fa_stmt_sid",
    })
  );
  app.use((req, res, next) => {
    res.locals.asset = () => "/styles.css";
    res.locals.brandProductName = "Test";
    res.locals.brandPublicTagline = "";
    req.tenant = { id: tenantId, slug: tenantId === TENANT_ZM ? "zm" : "il", themeClass: "" };
    req.tenantUrlPrefix = "";
    next();
  });
  app.use((req, res, next) => {
    setFieldAgentSession(req, {
      id: fieldAgentId,
      tenantId,
      username: "fa_stmt",
      displayName: "Stmt Test",
    });
    next();
  });
  app.use(fieldAgentRoutes());
  return app;
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
    notes: `fa_stmt_${base}`,
  });
  const spPay = 77.25;
  await fieldAgentPayRunRepo.insertPayRunItems(pool, payRunId, TENANT_ZM, [
    {
      fieldAgentId,
      fieldAgentLabel: "Snap Name",
      periodStart,
      periodEnd,
      spRatingValue: 4,
      spRatingLowThresholdUsed: 3,
      spRatingHighThresholdUsed: 4.5,
      spHighRatingBonusPercentUsed: 5,
      earnedSpCommission: 10,
      spBonusAmount: 2,
      spWithheldAmount: 0,
      spPayableAmount: spPay,
      earnedEcCommission: 1,
      ecWithheldAmount: 0,
      ecPayableAmount: 3,
      recruitmentCommissionAmount: 0.5,
      qualityStatusLabelSp: "ok",
      qualityStatusLabelEc: "fine",
    },
  ]);
  const adminId = (await pool.query(`SELECT id FROM public.admin_users LIMIT 1`)).rows[0];
  const aid = adminId ? Number(adminId.id) : null;
  await fieldAgentPayRunRepo.lockPayRunDraft(pool, payRunId, TENANT_ZM, aid);
  await fieldAgentPayRunRepo.approvePayRunLocked(pool, payRunId, TENANT_ZM, aid);
  return { payRunId, spPay };
}

test(
  "field-agent statements: repo lists only approved/paid; draft hidden",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_stmt_d_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const base = Date.now() + 333333;
    const periodStart = new Date(base);
    const periodEnd = new Date(base + 29 * 86400000);
    const draftId = await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
      tenantId: TENANT_ZM,
      periodStart,
      periodEnd,
      adminUserId: null,
      notes: "draft_only",
    });
    await fieldAgentPayRunRepo.insertPayRunItems(pool, draftId, TENANT_ZM, [
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
        spPayableAmount: 1,
        earnedEcCommission: 0,
        ecWithheldAmount: 0,
        ecPayableAmount: 0,
        recruitmentCommissionAmount: 0,
        qualityStatusLabelSp: "",
        qualityStatusLabelEc: "",
      },
    ]);
    const listDraft = await fieldAgentPayRunRepo.listVisiblePayRunItemsForFieldAgent(pool, TENANT_ZM, faId, {
      limit: 20,
    });
    assert.equal(listDraft.length, 0);
    await pool.query(`DELETE FROM public.field_agent_pay_runs WHERE id = $1`, [draftId]);

    const { payRunId } = await insertApprovedPayRunForFieldAgent(pool, faId, 0);
    const listOk = await fieldAgentPayRunRepo.listVisiblePayRunItemsForFieldAgent(pool, TENANT_ZM, faId, {
      limit: 20,
    });
    assert.equal(listOk.length, 1);
    assert.equal(Number(listOk[0].pay_run_id), payRunId);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "field-agent statements: other agent detail 404; own row uses frozen sp_payable",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faA = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_stmt_a_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const faB = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_stmt_b_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, spPay } = await insertApprovedPayRunForFieldAgent(pool, faA, 0);
    const rowB = await fieldAgentPayRunRepo.getVisiblePayRunItemDetailForFieldAgent(pool, TENANT_ZM, faB, payRunId);
    assert.equal(rowB, null);
    const rowA = await fieldAgentPayRunRepo.getVisiblePayRunItemDetailForFieldAgent(pool, TENANT_ZM, faA, payRunId);
    assert.ok(rowA);
    assert.equal(Number(rowA.sp_payable_amount), spPay);

    const appA = createFaApp(faA);
    const appB = createFaApp(faB);
    const resA = await request(appA).get(`/field-agent/statements/${payRunId}`).expect(200);
    assert.ok(String(resA.text).includes("77.25"));
    await request(appB).get(`/field-agent/statements/${payRunId}`).expect(404);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "field-agent statements: list ordering newest period first",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_stmt_ord_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const older = await insertApprovedPayRunForFieldAgent(pool, faId, -86400000 * 400);
    const newer = await insertApprovedPayRunForFieldAgent(pool, faId, 86400000 * 50);
    const list = await fieldAgentPayRunRepo.listVisiblePayRunItemsForFieldAgent(pool, TENANT_ZM, faId, { limit: 10 });
    assert.ok(list.length >= 2);
    const idxNew = list.findIndex((r) => r.pay_run_id === newer.payRunId);
    const idxOld = list.findIndex((r) => r.pay_run_id === older.payRunId);
    assert.ok(idxNew >= 0 && idxOld >= 0);
    assert.ok(idxNew < idxOld);
    await deletePayRunBypassTriggersForTests(pool, older.payRunId);
    await deletePayRunBypassTriggersForTests(pool, newer.payRunId);
  }
);

test(
  "field-agent statements: tenant isolation on detail",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_stmt_t_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId } = await insertApprovedPayRunForFieldAgent(pool, faId, 0);
    const rowWrong = await fieldAgentPayRunRepo.getVisiblePayRunItemDetailForFieldAgent(pool, TENANT_IL, faId, payRunId);
    assert.equal(rowWrong, null);
    const appIl = createFaApp(faId, TENANT_IL);
    await request(appIl).get(`/field-agent/statements/${payRunId}`).expect(404);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "getPayRunStatementSnapshotForFieldAgent: admin mode includes draft; field-agent mode does not",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_stmt_draft_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const base = Date.now() + 900000;
    const periodStart = new Date(base);
    const periodEnd = new Date(base + 29 * 86400000);
    const payRunId = await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
      tenantId: TENANT_ZM,
      periodStart,
      periodEnd,
      adminUserId: null,
      notes: `draft_stmt_${base}`,
    });
    await fieldAgentPayRunRepo.insertPayRunItems(pool, payRunId, TENANT_ZM, [
      {
        fieldAgentId: faId,
        fieldAgentLabel: "Draft FA",
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
    const rowAdmin = await fieldAgentPayRunRepo.getPayRunStatementSnapshotForFieldAgent(pool, TENANT_ZM, payRunId, faId, {
      forAdmin: true,
    });
    const rowFa = await fieldAgentPayRunRepo.getPayRunStatementSnapshotForFieldAgent(pool, TENANT_ZM, payRunId, faId, {
      forAdmin: false,
    });
    assert.ok(rowAdmin);
    assert.equal(rowAdmin.status, "draft");
    assert.equal(rowFa, null);
    await pool.query(`DELETE FROM public.field_agent_pay_runs WHERE id = $1`, [payRunId]);
  }
);

test(
  "field-agent GET statements/:payRunId/download returns printable statement HTML",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_stmt_dl_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId } = await insertApprovedPayRunForFieldAgent(pool, faId, 0);
    const app = createFaApp(faId);
    const res = await request(app).get(`/field-agent/statements/${payRunId}/download`).expect(200);
    const html = String(res.text);
    assert.ok(html.includes("Monthly statement"));
    assert.ok(html.includes("Print / Save as PDF"));
    assert.ok(html.includes("frozen pay-run snapshot"));
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);
