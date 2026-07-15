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
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const platformProvisioningRepo = require("../src/db/pg/church/platformProvisioningRepo");
const { validateAddBranchBody } = require("../src/church/platformProvisioningValidation");
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
      secret: "church-add-branch-test",
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
      secret: "church-add-branch-login-test",
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

async function cleanupOrg(pool, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

function branchBody(hostSlug, adminKey, password) {
  return {
    branch_name: `Branch ${adminKey}`,
    branch_host_slug: hostSlug,
    city: "Lusaka",
    country: "Zambia",
    branch_admin_full_name: `Admin ${adminKey}`,
    branch_admin_email: `${adminKey}@example.com`,
    branch_admin_phone: "0977000333",
    branch_admin_temporary_password: password,
  };
}

test("reserved branch host slug is rejected", () => {
  const org = { country: "Zambia" };
  const result = validateAddBranchBody(branchBody("admin", "x", "temppass123"), org);
  assert.equal(result.ok, false);
});

test("tenant manager cannot add branch", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("addbrmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `addbr_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `addbrmgr_${suffix}`,
    name: `Add Branch Org ${suffix}`,
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get(`/admin/church/organizations/${org.id}/branches/new`);
  assert.equal(res.status, 403);
  await cleanupOrg(pool, org.id);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "add branch provisioning integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("addbr");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `addbr_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const orgSlug = `zbu${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 30);
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: orgSlug,
      name: `Zambia Baptist Union ${suffix}`,
    });
    await pool.query(`UPDATE public.church_organizations SET plan_code = 'free', country = 'Zambia' WHERE id = $1`, [
      org.id,
    ]);
    const firstHost = `kafue${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 30);
    await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: firstHost,
      host_slug: firstHost,
      name: "Kafue Baptist",
      country: "Zambia",
    });

    const app = createAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");

    const formPage = await agent.get(`/admin/church/organizations/${org.id}/branches/new`);
    assert.equal(formPage.status, 200);
    assert.match(formPage.text, /Add branch/);

    const secondHostAttempt = `lusaka${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 30);
    const draftCreate = await agent
      .post(`/admin/church/organizations/${org.id}/branches`)
      .type("form")
      .send(branchBody(secondHostAttempt, `lusaka${suffix}`, "temppass123"));
    // Foundation/free: second branch row is allowed as non-active (draft), not rejected at create time.
    assert.ok([302, 400].includes(draftCreate.status));
    if (draftCreate.status === 302) {
      const draftId = Number(draftCreate.headers.location.match(/branches\/(\d+)/)[1]);
      const draftBranch = await branchesRepo.findBranchByIdForPlatform(pool, draftId);
      assert.ok(draftBranch);
      assert.notEqual(draftBranch.status, "active");
      const activateAttempt = await agent
        .post(`/admin/church/branches/${draftId}/reactivate`)
        .type("form")
        .send({ status_reason: "try activate" });
      assert.equal(activateAttempt.status, 400);
      assert.match(activateAttempt.text, /Foundation includes one active branch|address|schedule|administrator/i);
      // Remove draft so the later Growth/standard create can reuse a clean host slug path.
      await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [draftId]);
      await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [draftId]);
      await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [draftId]);
    } else {
      assert.match(draftCreate.text, /1 branch|Foundation includes one active branch/i);
    }

    await pool.query(`UPDATE public.church_organizations SET plan_code = 'growth' WHERE id = $1`, [org.id]);

    const secondHost = `lusaka${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 30);
    const adminKey = `ba${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 24);
    const password = "branchpass456";
    const create = await agent
      .post(`/admin/church/organizations/${org.id}/branches`)
      .type("form")
      .send(branchBody(secondHost, adminKey, password));
    assert.equal(create.status, 302);
    assert.match(create.headers.location, /\/admin\/church\/branches\/\d+\?created=1$/);

    const branchId = Number(create.headers.location.match(/branches\/(\d+)/)[1]);
    const branch = await branchesRepo.findBranchByHostSlug(pool, secondHost);
    assert.ok(branch);
    assert.equal(branch.id, branchId);

    const admins = await pool.query(`SELECT * FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    assert.equal(admins.rows.length, 1);
    assert.notEqual(admins.rows[0].password_hash, password);
    assert.equal(await bcrypt.compare(password, admins.rows[0].password_hash), true);

    const dup = await agent
      .post(`/admin/church/organizations/${org.id}/branches`)
      .type("form")
      .send(branchBody(secondHost, `dup${suffix}`, "temppass123"));
    assert.equal(dup.status, 400);
    assert.match(dup.text, /already in use/i);

    const churchApp = makeChurchApp({
      kind: "branch",
      orgSlug: secondHost,
      hostSlug: secondHost,
      organization: { ...org, plan_code: "standard" },
      branch,
    });
    const branchAgent = request.agent(churchApp);
    const login = await branchAgent.post("/branch/login").type("form").send({
      identifier: `${adminKey}@example.com`,
      password,
    });
    assert.equal(login.status, 303);
    assert.equal(login.headers.location, "/branch/dashboard");

    const rollbackHost = `rollback${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 30);
    const before = await pool.query(`SELECT COUNT(*)::int AS c FROM public.church_branches WHERE host_slug = $1`, [
      rollbackHost,
    ]);
    try {
      await platformProvisioningRepo.createBranchForOrganization(
        pool,
        org.id,
        {
          branch: {
            name: "Rollback Branch",
            slug: rollbackHost,
            host_slug: rollbackHost,
            country: "Zambia",
            status: "active",
          },
          branchAdmin: {
            full_name: "Rollback Admin",
            email: "",
            phone: "",
            temporary_password: "short",
          },
        },
        superId
      );
      assert.fail("expected rollback provisioning to fail");
    } catch (err) {
      assert.ok(err);
    }
    const after = await pool.query(`SELECT COUNT(*)::int AS c FROM public.church_branches WHERE host_slug = $1`, [
      rollbackHost,
    ]);
    assert.equal(after.rows[0].c, before.rows[0].c);

    await cleanupOrg(pool, org.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
