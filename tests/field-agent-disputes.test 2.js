"use strict";

/**
 * Field-agent pay-run disputes: tenant-scoped metadata only (no pay-run mutations).
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
const registerAdminFieldAgentDisputesRoutes = require("../src/routes/admin/adminFieldAgentDisputes");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const fieldAgentPayRunRepo = require("../src/db/pg/fieldAgentPayRunRepo");
const fieldAgentPayRunDisputesRepo = require("../src/db/pg/fieldAgentPayRunDisputesRepo");
const { setFieldAgentSession } = require("../src/auth/fieldAgentAuth");
const { ROLES } = require("../src/auth/roles");
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
      secret: "fa_disputes_test",
      resave: false,
      saveUninitialized: true,
      name: "fa_disp_sid",
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
      username: "fa_disp",
      displayName: "Disp Test",
    });
    next();
  });
  app.use(fieldAgentRoutes());
  return app;
}

function createAdminDisputesApp({ adminUserId, tenantId = TENANT_ZM }) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "admin_disp_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_disp_sid",
    })
  );
  app.use((req, res, next) => {
    req.session.adminUser = {
      id: adminUserId,
      role: ROLES.TENANT_MANAGER,
      tenantId,
    };
    res.locals.embed = false;
    res.locals.asset = () => "/styles.css";
    res.locals.brandProductName = "Test";
    next();
  });
  const router = express.Router();
  registerAdminFieldAgentDisputesRoutes(router);
  app.use("/admin", router);
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
    notes: `fa_disp_${base}`,
  });
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
      spBonusAmount: 0,
      spWithheldAmount: 0,
      spPayableAmount: 55.5,
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
  "disputes: field agent POST creates open dispute on own approved item",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_disp_ok_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, itemId } = await insertApprovedPayRunForFieldAgent(pool, faId, 0);
    const app = createFaApp(faId);
    await request(app)
      .post(`/field-agent/statements/${payRunId}/disputes`)
      .type("form")
      .send({ pay_run_item_id: String(itemId), dispute_reason: "Line looks wrong", dispute_notes: "See email" })
      .expect(302);
    const rows = await fieldAgentPayRunDisputesRepo.listDisputesForFieldAgent(pool, TENANT_ZM, faId, 10);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "open");
    assert.equal(String(rows[0].dispute_reason), "Line looks wrong");
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "disputes: cannot dispute another agent's pay_run_item (404)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faA = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_disp_a_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const faB = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_disp_b_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, itemId } = await insertApprovedPayRunForFieldAgent(pool, faA, 0);
    const appB = createFaApp(faB);
    await request(appB)
      .post(`/field-agent/statements/${payRunId}/disputes`)
      .type("form")
      .send({ pay_run_item_id: String(itemId), dispute_reason: "Not mine" })
      .expect(404);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "disputes: cannot dispute draft pay run (404)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_disp_dr_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const base = Date.now() + 800000;
    const periodStart = new Date(base);
    const periodEnd = new Date(base + 29 * 86400000);
    const payRunId = await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
      tenantId: TENANT_ZM,
      periodStart,
      periodEnd,
      adminUserId: null,
      notes: `draft_disp_${base}`,
    });
    await fieldAgentPayRunRepo.insertPayRunItems(pool, payRunId, TENANT_ZM, [
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
    const items = await fieldAgentPayRunRepo.listItemsForPayRun(pool, payRunId, TENANT_ZM);
    const itemId = Number(items[0].id);
    const app = createFaApp(faId);
    await request(app)
      .post(`/field-agent/statements/${payRunId}/disputes`)
      .type("form")
      .send({ pay_run_item_id: String(itemId), dispute_reason: "Draft" })
      .expect(404);
    await pool.query(`DELETE FROM public.field_agent_pay_runs WHERE id = $1`, [payRunId]);
  }
);

test(
  "disputes: duplicate open dispute rejected (409)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_disp_dup_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, itemId } = await insertApprovedPayRunForFieldAgent(pool, faId, 0);
    const app = createFaApp(faId);
    await request(app)
      .post(`/field-agent/statements/${payRunId}/disputes`)
      .type("form")
      .send({ pay_run_item_id: String(itemId), dispute_reason: "First" })
      .expect(302);
    await request(app)
      .post(`/field-agent/statements/${payRunId}/disputes`)
      .type("form")
      .send({ pay_run_item_id: String(itemId), dispute_reason: "Second" })
      .expect(409);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "disputes: admin list + status transitions; pay_run_item amounts unchanged",
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
      username: `fa_disp_adm_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, itemId } = await insertApprovedPayRunForFieldAgent(pool, faId, 0);
    const before = await pool.query(
      `SELECT sp_payable_amount FROM public.field_agent_pay_run_items WHERE id = $1 AND tenant_id = $2`,
      [itemId, TENANT_ZM]
    );
    const spBefore = Number(before.rows[0].sp_payable_amount);

    const created = await fieldAgentPayRunDisputesRepo.createDispute(pool, {
      tenantId: TENANT_ZM,
      payRunId,
      payRunItemId: itemId,
      fieldAgentId: faId,
      disputeReason: "Admin flow",
      disputeNotes: null,
    });
    assert.ok(created.dispute);
    const disputeId = Number(created.dispute.id);

    const app = createAdminDisputesApp({ adminUserId: adminId, tenantId: TENANT_ZM });
    const listRes = await request(app).get("/admin/field-agent-disputes?status=open").expect(200);
    assert.ok(String(listRes.text).includes(String(disputeId)));

    const r1 = await fieldAgentPayRunDisputesRepo.updateDisputeStatus(
      pool,
      disputeId,
      TENANT_ZM,
      "resolved",
      adminId,
      "skip review"
    );
    assert.equal(r1.error, "INVALID_TRANSITION");

    const r2 = await fieldAgentPayRunDisputesRepo.updateDisputeStatus(pool, disputeId, TENANT_ZM, "under_review", adminId, "Looking");
    assert.equal(r2.error, null);
    assert.equal(r2.dispute.status, "under_review");

    const r3 = await fieldAgentPayRunDisputesRepo.updateDisputeStatus(pool, disputeId, TENANT_ZM, "resolved", adminId, "Done");
    assert.equal(r3.error, null);
    assert.ok(r3.dispute.resolved_at);
    assert.equal(Number(r3.dispute.resolved_by_admin_user_id), adminId);

    const after = await pool.query(
      `SELECT sp_payable_amount FROM public.field_agent_pay_run_items WHERE id = $1 AND tenant_id = $2`,
      [itemId, TENANT_ZM]
    );
    assert.equal(Number(after.rows[0].sp_payable_amount), spBefore);

    const rFinal = await fieldAgentPayRunDisputesRepo.updateDisputeStatus(pool, disputeId, TENANT_ZM, "under_review", adminId, "nope");
    assert.equal(rFinal.error, "FINAL");

    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "disputes: repo tenant isolation on getDisputeByIdForTenant",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_disp_iso_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, itemId } = await insertApprovedPayRunForFieldAgent(pool, faId, 0);
    const created = await fieldAgentPayRunDisputesRepo.createDispute(pool, {
      tenantId: TENANT_ZM,
      payRunId,
      payRunItemId: itemId,
      fieldAgentId: faId,
      disputeReason: "iso",
      disputeNotes: null,
    });
    const id = Number(created.dispute.id);
    const wrong = await fieldAgentPayRunDisputesRepo.getDisputeByIdForTenant(pool, id, TENANT_IL);
    assert.equal(wrong, null);
    const ok = await fieldAgentPayRunDisputesRepo.getDisputeByIdForTenant(pool, id, TENANT_ZM);
    assert.ok(ok);
    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);

test(
  "disputes: admin HTTP POST status transitions",
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
      username: `fa_disp_http_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const { payRunId, itemId } = await insertApprovedPayRunForFieldAgent(pool, faId, 0);
    const created = await fieldAgentPayRunDisputesRepo.createDispute(pool, {
      tenantId: TENANT_ZM,
      payRunId,
      payRunItemId: itemId,
      fieldAgentId: faId,
      disputeReason: "HTTP",
      disputeNotes: null,
    });
    const disputeId = Number(created.dispute.id);
    const app = createAdminDisputesApp({ adminUserId: adminId, tenantId: TENANT_ZM });

    await request(app)
      .post(`/admin/field-agent-disputes/${disputeId}/status`)
      .type("form")
      .send({ status: "under_review", admin_notes: "On it" })
      .expect(302);

    const mid = await fieldAgentPayRunDisputesRepo.getDisputeByIdForTenant(pool, disputeId, TENANT_ZM);
    assert.equal(mid.status, "under_review");

    await request(app)
      .post(`/admin/field-agent-disputes/${disputeId}/status`)
      .type("form")
      .send({ status: "rejected", admin_notes: "No change" })
      .expect(302);

    const fin = await fieldAgentPayRunDisputesRepo.getDisputeByIdForTenant(pool, disputeId, TENANT_ZM);
    assert.equal(fin.status, "rejected");
    assert.ok(fin.resolved_at);

    await deletePayRunBypassTriggersForTests(pool, payRunId);
  }
);
