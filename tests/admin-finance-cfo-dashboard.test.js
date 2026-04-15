"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");
const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureFieldAgentPayRunsSchema } = require("../src/db/pg/ensureFieldAgentPayRunsSchema");
const registerAdminFinanceCfoRoutes = require("../src/routes/admin/adminFinanceCfo");
const financeCfoDashboardRepo = require("../src/db/pg/financeCfoDashboardRepo");
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

async function insertApprovedPayRunWithOneItem(pool, tenantId, baseAmount = 10) {
  const base = Date.now() + Math.floor(Math.random() * 100000);
  const periodStart = new Date(base);
  const periodEnd = new Date(base + 29 * 86400000);
  const faId = await getAnyFieldAgentIdForTenant(pool, tenantId);
  if (faId == null) return null;
  const payRunId = await fieldAgentPayRunRepo.insertPayRunDraft(pool, {
    tenantId,
    periodStart,
    periodEnd,
    adminUserId: null,
    notes: `cfo_test ${base}`,
  });
  await fieldAgentPayRunRepo.insertPayRunItems(pool, payRunId, tenantId, [
    {
      fieldAgentId: faId,
      fieldAgentLabel: "CFO FA",
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
  const adminId = await getAnyAdminUserId(pool);
  await fieldAgentPayRunRepo.lockPayRunDraft(pool, payRunId, tenantId, adminId);
  await fieldAgentPayRunRepo.approvePayRunLocked(pool, payRunId, tenantId, adminId);
  await fieldAgentPayRunRepo.approvePayRunForPayout(pool, payRunId, tenantId, adminId, null);
  return { payRunId, periodStartIso: periodStart.toISOString().slice(0, 10) };
}

function createFinanceApp(role = ROLES.SUPER_ADMIN, tenantId = TENANT_ZM) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "cfo_finance_test",
      resave: false,
      saveUninitialized: true,
      name: "cfo_sid",
    })
  );
  app.use((req, res, next) => {
    req.session.adminUser = { id: 1, role, tenantId };
    res.locals.asset = () => "/styles.css";
    res.locals.bodyEmbedClass = "";
    res.locals.embed = false;
    res.locals.brandProductName = "Pro-online";
    res.locals.adminNav = {
      isSuper: role === ROLES.SUPER_ADMIN,
      isViewer: false,
      canEditDirectory: false,
      canManageUsers: true,
      canManageArticles: false,
      tenantScoped: true,
      canAccessCrm: true,
      canMutateCrm: true,
      canClaimCrmTasks: true,
      canAccessTenantSettings: true,
      canAccessSettingsHub: true,
      canAccessProjectIntake: false,
      canMutateProjectIntake: false,
      canManageServiceProviderCategories: false,
      canViewIntakePriceEstimation: false,
      canValidateDeals: false,
      canViewTenantWideLeadProgress: false,
    };
    res.locals.adminScopeTenant = null;
    res.locals.adminScopeIsSession = false;
    res.locals.adminRegionSwitch = null;
    res.locals.adminSettingsTenantId = tenantId;
    next();
  });
  const router = express.Router();
  registerAdminFinanceCfoRoutes(router);
  app.use("/admin", router);
  return app;
}

test(
  "CFO dashboard: tenant_manager forbidden",
  async () => {
    const app = createFinanceApp(ROLES.TENANT_MANAGER, TENANT_ZM);
    await request(app).get("/admin/finance/cfo").expect(403);
    await request(app).get(`/admin/finance/cfo/tenant/${TENANT_ZM}`).expect(403);
    await request(app).get("/admin/finance/summary").expect(403);
    await request(app).get("/admin/finance/summary/export.csv").expect(403);
    await request(app).get("/admin/finance/summary/pay-runs-export.csv").expect(403);
    await request(app).get(`/admin/finance/summary/tenant/${TENANT_ZM}`).expect(403);
  }
);

test(
  "CFO dashboard: super admin can load pages",
  { skip: !isPgConfigured() },
  async () => {
    const app = createFinanceApp(ROLES.SUPER_ADMIN, TENANT_ZM);
    const dash = await request(app).get("/admin/finance/cfo").expect(200);
    assert.ok(String(dash.text || "").includes("Cross-tenant finance overview"));
    const summary = await request(app).get("/admin/finance/summary").expect(200);
    assert.ok(String(summary.text || "").includes("Cross-tenant finance summary"));
    assert.ok(String(summary.text || "").includes("Filters"));
    const csvSummary = await request(app).get("/admin/finance/summary/export.csv").expect(200);
    assert.equal(csvSummary.headers["content-type"].includes("text/csv"), true);
    assert.ok(String(csvSummary.text || "").includes("tenant_id,tenant_name,total_frozen_payable"));
    const csvRuns = await request(app).get("/admin/finance/summary/pay-runs-export.csv").expect(200);
    assert.equal(csvRuns.headers["content-type"].includes("text/csv"), true);
    assert.ok(String(csvRuns.text || "").includes("tenant_id,tenant_name,tenant_slug,pay_run_id"));
    const sumTenant = await request(app).get(`/admin/finance/summary/tenant/${TENANT_ZM}`).expect(200);
    assert.ok(String(sumTenant.text || "").includes("Tenant finance drill-down"));
    const tenantPage = await request(app).get(`/admin/finance/cfo/tenant/${TENANT_ZM}`).expect(200);
    assert.ok(String(tenantPage.text || "").includes("Finance drill-down"));
  }
);

test(
  "CFO dashboard: invalid tenant returns 404",
  { skip: !isPgConfigured() },
  async () => {
    const app = createFinanceApp(ROLES.SUPER_ADMIN, TENANT_ZM);
    await request(app).get("/admin/finance/cfo/tenant/999999999").expect(404);
    await request(app).get("/admin/finance/summary/tenant/999999999").expect(404);
  }
);

test(
  "CFO aggregates: reconciliation rows align with getPayRunReconciliationSummary",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const created = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 77);
    if (!created) return;
    const adminId = await getAnyAdminUserId(pool);
    await fieldAgentPayRunRepo.addPaymentForPayRun(pool, {
      payRunId: created.payRunId,
      tenantId: TENANT_ZM,
      paymentDate: "2026-08-01",
      amount: 30,
      createdByAdminUserId: adminId,
    });
    const rows = await financeCfoDashboardRepo.getApprovedPaidRunReconciliationRows(pool, {
      tenantId: TENANT_ZM,
      periodStartFrom: null,
      periodStartTo: null,
    });
    const mine = rows.find((r) => Number(r.pay_run_id) === created.payRunId);
    assert.ok(mine);
    const direct = await fieldAgentPayRunRepo.getPayRunReconciliationSummary(pool, created.payRunId, TENANT_ZM);
    assert.equal(mine.run_payable_total, direct.run_payable_total);
    assert.equal(mine.total_paid_amount, direct.total_paid_amount);
    assert.equal(mine.reconciliation_status, direct.reconciliation_status);
    await deletePayRunBypassTriggersForTests(pool, created.payRunId);
  }
);

test(
  "CFO tenant page: only includes target tenant pay runs",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentPayRunsSchema(pool);
    const zm = await insertApprovedPayRunWithOneItem(pool, TENANT_ZM, 11);
    const il = await insertApprovedPayRunWithOneItem(pool, TENANT_IL, 22);
    if (!zm || !il) {
      if (zm) await deletePayRunBypassTriggersForTests(pool, zm.payRunId);
      if (il) await deletePayRunBypassTriggersForTests(pool, il.payRunId);
      return;
    }
    const rowsZm = await financeCfoDashboardRepo.getTenantPayRunFinanceRows(pool, TENANT_ZM, {});
    const idsZm = new Set(rowsZm.map((r) => r.pay_run_id));
    assert.ok(idsZm.has(zm.payRunId));
    assert.ok(!idsZm.has(il.payRunId));
    await deletePayRunBypassTriggersForTests(pool, zm.payRunId);
    await deletePayRunBypassTriggersForTests(pool, il.payRunId);
  }
);
