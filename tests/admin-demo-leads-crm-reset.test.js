"use strict";

/**
 * Admin DB tools: POST /admin/db/reset-demo-leads-crm (demo tenant Leads + CRM reset).
 * Skips when DATABASE_URL / GETPRO_DATABASE_URL is unset.
 */

const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const { runBootstrap, resetBootstrapForTests } = require("../src/startup/bootstrap");
const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ROLES } = require("../src/auth/roles");
const { db } = require("../src/db");
const adminRoutes = require("../src/routes/admin");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const { TENANT_DEMO, TENANT_ZM } = require("../src/tenants/tenantIds");
const { areAdminDbFixturesEnabled } = require("../src/admin/dbFixturesEnv");
const { resetDemoLeadsAndCrm } = require("../src/admin/adminDemoLeadsCrmResetService");

test("resetDemoLeadsAndCrm rejects wrong confirmSlug without touching pool", async () => {
  const r = await resetDemoLeadsAndCrm(null, { confirmSlug: "wrong" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "validation");
});

function uniq() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createDbToolsHttpApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "admin_demo_reset_test_secret",
      resave: false,
      saveUninitialized: false,
      name: "adm_demo_reset_sid",
    })
  );
  app.use((req, res, next) => {
    req.tenant = { id: TENANT_ZM, slug: "zm" };
    req.tenantUrlPrefix = "";
    next();
  });
  app.use("/admin", adminRoutes({ db }));
  return app;
}

async function adminLoginJsonAgent(app, username, password) {
  const agent = request.agent(app);
  await agent.post("/admin/login").type("form").send({ username, password }).expect(302);
  return agent;
}

async function insertCrmTask(pool, tenantId) {
  const r = await pool.query(
    `INSERT INTO public.crm_tasks (tenant_id, title, description, status, attachment_url, source_type)
     VALUES ($1, $2, $3, 'new', '', 'manual')
     RETURNING id`,
    [tenantId, `reset_test_${uniq()}`, "t"]
  );
  return Number(r.rows[0].id);
}

async function countTable(pool, table, tenantId) {
  const r = await pool.query(`SELECT COUNT(*)::int AS c FROM public.${table} WHERE tenant_id = $1`, [tenantId]);
  return r.rows[0].c;
}

test("reset demo Leads + CRM (HTTP + DB)", { skip: !isPgConfigured() }, async () => {
  runBootstrap();
  const pool = getPgPool();
  const app = createDbToolsHttpApp();
  const suffix = uniq();
  const pw = "DemoResetTest_1!";
  const hash = await bcrypt.hash(pw, 4);
  const supName = `demo_reset_sup_${suffix}`;
  const mgrName = `demo_reset_mgr_${suffix}`;
  let superId;
  let mgrId;
  const taskIds = [];

  const prevNodeEnv = process.env.NODE_ENV;
  const prevA = process.env.GETPRO_ALLOW_DB_FIXTURES;
  const prevP = process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION;
  process.env.NODE_ENV = "development";

  try {
    superId = await adminUsersRepo.insertUser(pool, {
      username: supName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });
    mgrId = await adminUsersRepo.insertUser(pool, {
      username: mgrName,
      passwordHash: hash,
      role: ROLES.TENANT_MANAGER,
      tenantId: TENANT_ZM,
      displayName: "",
    });

    const tDemoBefore = await insertCrmTask(pool, TENANT_DEMO);
    const tZmBefore = await insertCrmTask(pool, TENANT_ZM);
    taskIds.push(tDemoBefore, tZmBefore);

    await pool.query(`INSERT INTO public.crm_csr_fifo_state (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`, [
      TENANT_DEMO,
    ]);

    const coDemo = await pool.query(`SELECT id FROM public.companies WHERE tenant_id = $1 LIMIT 1`, [TENANT_DEMO]);
    const coZm = await pool.query(`SELECT id FROM public.companies WHERE tenant_id = $1 LIMIT 1`, [TENANT_ZM]);
    let leadDemoId = null;
    let leadZmId = null;
    if (coDemo.rows[0]) {
      const lr = await pool.query(
        `INSERT INTO public.leads (tenant_id, company_id, name, phone, email, message, status)
         VALUES ($1, $2, 'rt', '+260971111111', 'a@b.c', 'm', 'open') RETURNING id`,
        [TENANT_DEMO, coDemo.rows[0].id]
      );
      leadDemoId = Number(lr.rows[0].id);
    }
    if (coZm.rows[0]) {
      const lr = await pool.query(
        `INSERT INTO public.leads (tenant_id, company_id, name, phone, email, message, status)
         VALUES ($1, $2, 'rt', '+260972222222', 'c@d.e', 'm', 'open') RETURNING id`,
        [TENANT_ZM, coZm.rows[0].id]
      );
      leadZmId = Number(lr.rows[0].id);
    }

    const superAgent = await adminLoginJsonAgent(app, supName, pw);
    const mgrAgent = await adminLoginJsonAgent(app, mgrName, pw);

    const badSlug = await mgrAgent
      .post("/admin/db/reset-demo-leads-crm")
      .set("Accept", "application/json")
      .send({ confirmSlug: "demo" });
    assert.equal(badSlug.status, 403);
    assert.equal(badSlug.body.ok, false);

    const wrongConfirm = await superAgent
      .post("/admin/db/reset-demo-leads-crm")
      .set("Accept", "application/json")
      .send({ confirmSlug: "zm" });
    assert.equal(wrongConfirm.status, 400);
    assert.equal(wrongConfirm.body.ok, false);

    assert.ok(areAdminDbFixturesEnabled(), "test expects DB fixtures enabled in development");

    const ok = await superAgent
      .post("/admin/db/reset-demo-leads-crm")
      .set("Accept", "application/json")
      .send({ confirmSlug: "demo" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.ok, true);
    assert.equal(ok.body.tenantId, TENANT_DEMO);
    assert.equal(ok.body.tenantSlug, "demo");
    assert.ok(ok.body.counts && ok.body.counts.deleted);

    assert.equal(await countTable(pool, "crm_tasks", TENANT_DEMO), 0);
    assert.ok((await countTable(pool, "crm_tasks", TENANT_ZM)) >= 1);

    if (leadDemoId) {
      const lr = await pool.query(`SELECT 1 FROM public.leads WHERE id = $1`, [leadDemoId]);
      assert.equal(lr.rows.length, 0);
    }
    if (leadZmId) {
      const lr = await pool.query(`SELECT 1 FROM public.leads WHERE id = $1`, [leadZmId]);
      assert.equal(lr.rows.length, 1);
    }

    const fifo = await pool.query(`SELECT 1 FROM public.crm_csr_fifo_state WHERE tenant_id = $1`, [TENANT_DEMO]);
    assert.equal(fifo.rows.length, 0);
  } finally {
    try {
      for (const id of taskIds) {
        await pool.query(`DELETE FROM public.crm_tasks WHERE id = $1`, [id]).catch(() => {});
      }
      if (superId) await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]).catch(() => {});
      if (mgrId) await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [mgrId]).catch(() => {});
    } catch {
      /* ignore */
    }
    if (prevNodeEnv !== undefined) process.env.NODE_ENV = prevNodeEnv;
    else delete process.env.NODE_ENV;
    if (prevA !== undefined) process.env.GETPRO_ALLOW_DB_FIXTURES = prevA;
    else delete process.env.GETPRO_ALLOW_DB_FIXTURES;
    if (prevP !== undefined) process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION = prevP;
    else delete process.env.GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION;
    resetBootstrapForTests();
  }
});
