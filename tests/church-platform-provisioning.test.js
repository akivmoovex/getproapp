"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ROLES } = require("../src/auth/roles");
const { db } = require("../src/db");
const adminRoutes = require("../src/routes/admin");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const platformProvisioningRepo = require("../src/db/pg/church/platformProvisioningRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createAdminApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-platform-provisioning-test",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use((req, res, next) => {
    req.tenant = { id: TENANT_ZM, slug: "zm" };
    req.tenantUrlPrefix = "";
    res.locals.asset = (k) => `/${String(k || "").replace(/^\//, "")}`;
    next();
  });
  app.use("/admin", adminRoutes({ db }));
  return app;
}

function makeChurchApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-platform-login-test",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function adminLoginAgent(app, username, password) {
  const agent = request.agent(app);
  await agent.post("/admin/login").type("form").send({ username, password }).expect(302);
  return agent;
}

function provisioningBody(slug, suffix) {
  return {
    organization_name: `Test Church ${suffix}`,
    organization_slug: slug,
    country: "Zambia",
    city: "Lusaka",
    plan_code: "foundation",
    branch_name: `Main Branch ${suffix}`,
    branch_host_slug: slug,
    branch_city: "Lusaka",
    pastor_name: "Rev. Test",
    hq_full_name: `HQ Admin ${suffix}`,
    hq_email: `hq_${suffix}@example.com`,
    hq_phone: "0977000111",
    hq_temporary_password: "temppass123",
    branch_admin_full_name: `Branch Admin ${suffix}`,
    branch_admin_email: `branch_${suffix}@example.com`,
    branch_admin_phone: "0977000222",
    branch_admin_temporary_password: "temppass456",
  };
}

async function cleanupOrg(pool, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("unauthenticated user cannot access /admin/church", async () => {
  const app = createAdminApp();
  const res = await request(app).get("/admin/church");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/admin/login");
});

test("tenant manager cannot access /admin/church", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("platmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `plat_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get("/admin/church");
  assert.equal(res.status, 403);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "platform provisioning integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("platprov");
    const slug = `prov${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 40);
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `plat_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const app = createAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");

    const dash = await agent.get("/admin/church");
    assert.equal(dash.status, 200);
    assert.match(dash.text, /BlessBoard Admin/);

    const body = provisioningBody(slug, suffix);
    const create = await agent.post("/admin/church/organizations").type("form").send(body);
    assert.equal(create.status, 302);
    assert.match(create.headers.location, /\/admin\/church\/organizations\/\d+\?provisioned=1$/);

    const orgId = Number(create.headers.location.match(/organizations\/(\d+)/)[1]);
    const org = await platformProvisioningRepo.findChurchOrganizationById(pool, orgId);
    assert.ok(org);
    assert.equal(org.slug, slug);

    const branches = await pool.query(
      `SELECT * FROM public.church_branches WHERE organization_id = $1`,
      [orgId]
    );
    assert.equal(branches.rows.length, 1);

    const hqAdmins = await pool.query(
      `SELECT * FROM public.church_hq_admins WHERE organization_id = $1`,
      [orgId]
    );
    assert.equal(hqAdmins.rows.length, 1);
    assert.notEqual(hqAdmins.rows[0].password_hash, body.hq_temporary_password);
    assert.equal(await bcrypt.compare(body.hq_temporary_password, hqAdmins.rows[0].password_hash), true);

    const branchAdmins = await pool.query(
      `SELECT * FROM public.church_branch_admins WHERE organization_id = $1`,
      [orgId]
    );
    assert.equal(branchAdmins.rows.length, 1);
    assert.notEqual(branchAdmins.rows[0].password_hash, body.branch_admin_temporary_password);
    assert.equal(
      await bcrypt.compare(body.branch_admin_temporary_password, branchAdmins.rows[0].password_hash),
      true
    );

    const audits = await pool.query(
      `SELECT action FROM public.church_audit_logs WHERE organization_id = $1 ORDER BY id ASC`,
      [orgId]
    );
    const actions = audits.rows.map((r) => r.action);
    assert.ok(actions.includes("platform_church_organization_created"));
    assert.ok(actions.includes("platform_church_branch_created"));
    assert.ok(actions.includes("platform_church_hq_admin_created"));
    assert.ok(actions.includes("platform_church_branch_admin_created"));

    const dup = await agent.post("/admin/church/organizations").type("form").send(body);
    assert.equal(dup.status, 400);
    assert.match(dup.text, /already in use|already exists/i);

    const resolvedBranch = await branchesRepo.findBranchByHostSlug(pool, slug);
    assert.ok(resolvedBranch);
    assert.equal(resolvedBranch.id, branches.rows[0].id);

    const branch = branches.rows[0];
    const churchApp = makeChurchApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });

    const hqAgent = request.agent(churchApp);
    const hqLogin = await hqAgent.post("/hq/login").type("form").send({
      identifier: body.hq_email,
      password: body.hq_temporary_password,
    });
    assert.equal(hqLogin.status, 303);
    assert.equal(hqLogin.headers.location, "/hq/dashboard");

    const branchAgent = request.agent(churchApp);
    const branchLogin = await branchAgent.post("/branch/login").type("form").send({
      identifier: body.branch_admin_email,
      password: body.branch_admin_temporary_password,
    });
    assert.equal(branchLogin.status, 303);
    assert.equal(branchLogin.headers.location, "/branch/dashboard");

    const beforeCount = (
      await pool.query(`SELECT COUNT(*)::int AS c FROM public.church_organizations WHERE slug = $1`, [
        `rollback_${slug}`,
      ])
    ).rows[0].c;

    try {
      await platformProvisioningRepo.provisionChurchOrganization(
        pool,
        {
          platform_tenant_id: 999999999,
          organization: {
            name: "Rollback Org",
            slug: `rollback_${slug}`,
            country: "Zambia",
            plan_code: "foundation",
            status: "active",
          },
          branch: {
            name: "Rollback Branch",
            slug: `rollback_${slug}`,
            host_slug: `rollback_${slug}`,
            country: "Zambia",
            status: "active",
          },
          hqAdmin: {
            full_name: "Rollback HQ",
            email: `rollback_hq_${suffix}@example.com`,
            phone: "",
            temporary_password: "rollback123",
          },
          branchAdmin: {
            full_name: "Rollback Branch Admin",
            email: `rollback_ba_${suffix}@example.com`,
            phone: "",
            temporary_password: "rollback456",
          },
        },
        superId
      );
      assert.fail("expected invalid tenant provisioning to fail");
    } catch (err) {
      assert.ok(err);
    }

    const afterCount = (
      await pool.query(`SELECT COUNT(*)::int AS c FROM public.church_organizations WHERE slug = $1`, [
        `rollback_${slug}`,
      ])
    ).rows[0].c;
    assert.equal(afterCount, beforeCount);

    await cleanupOrg(pool, orgId);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
