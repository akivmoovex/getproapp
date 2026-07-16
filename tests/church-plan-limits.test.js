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
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const platformProvisioningRepo = require("../src/db/pg/church/platformProvisioningRepo");
const churchPlanService = require("../src/services/church/churchPlanService");
const {
  getChurchPlan,
  isFeatureEnabled,
  canCreateAdditionalBranch,
  buildUsageWarnings,
} = require("../src/church/churchPlans");
const { validatePlanUpdateBody } = require("../src/church/churchPlanValidation");
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
      secret: "church-plan-limits-test",
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
      secret: "church-plan-hq-test",
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
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("church plan config exposes free limits and locked premium features", () => {
  const free = getChurchPlan("free");
  assert.equal(free.limits.max_branches, 1);
  assert.equal(free.limits.max_members, 200);
  assert.equal(isFeatureEnabled("free", "hq_broadcasts"), false);
  assert.equal(isFeatureEnabled("standard", "hq_broadcasts"), true);
  assert.equal(canCreateAdditionalBranch("free", 1).allowed, false);
  assert.equal(canCreateAdditionalBranch("free", 0).allowed, true);
});

test("validatePlanUpdateBody rejects invalid plan_code", () => {
  const result = validatePlanUpdateBody({ plan_code: "enterprise" });
  assert.equal(result.ok, false);
});

test("tenant manager cannot change organization plan", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("planmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `plan_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `planmgr_${suffix}`,
    name: `Plan Org ${suffix}`,
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent
    .post(`/admin/church/organizations/${org.id}/plan`)
    .type("form")
    .send({ plan_code: "standard", plan_status: "active" });
  assert.equal(res.status, 403);
  await cleanupOrg(pool, org.id);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "plan limits integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("planlim");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `plan_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `planlim_${suffix}`,
      name: `Plan Limits Org ${suffix}`,
      plan_code: "foundation",
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: `planlim_${suffix}`,
      host_slug: `planlim_${suffix}`,
      name: "Main",
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: "HQ Admin",
      email: `hq_${suffix}@example.com`,
      phone: "0977000111",
      password_hash: passwordHash,
      role: "hq_admin",
      status: "active",
    });

    const app = createAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");

    const planPage = await agent.get(`/admin/church/organizations/${org.id}/plan`);
    assert.equal(planPage.status, 200);
    assert.match(planPage.text, /Current plan|Package|Foundation/i);

    const orgList = await agent.get("/admin/church/organizations");
    assert.equal(orgList.status, 200);
    assert.match(orgList.text, /Plan Limits Org|organizations|Organisation/i);

    // Legacy plan_code writes remain possible at the repository layer for existing records;
    // new Admin Console assignment UI only accepts foundation/growth.
    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "standard", plan_status: "active", plan_notes: "Upgraded for legacy-limit test" },
      superId
    );

    const updated = await organizationsRepo.findOrganizationById(pool, org.id);
    assert.equal(updated.plan_code, "standard");

    const audits = await pool.query(
      `SELECT action, metadata_json FROM public.church_audit_logs WHERE organization_id = $1 AND action = $2`,
      [org.id, "platform_church_plan_updated"]
    );
    assert.equal(audits.rows.length, 1);
    assert.equal(audits.rows[0].metadata_json.new_plan, "standard");

    const usage = await churchPlanService.getOrganizationUsageSummary(pool, org.id);
    assert.equal(usage.branches_count, 1);
    assert.equal(usage.active_members_count, 0);

    const warnings = buildUsageWarnings("free", { branches_count: 1, active_members_count: 185 });
    assert.ok(warnings.some((w) => w.code === "member_near_limit"));

    const churchApp = makeChurchApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: updated,
      branch,
    });
    const hqAgent = request.agent(churchApp);
    await hqAgent.post("/hq/login").type("form").send({
      identifier: `hq_${suffix}@example.com`,
      password: "testpass123",
    });
    const hqDash = await hqAgent.get("/hq/dashboard");
    assert.equal(hqDash.status, 200);
    assert.match(hqDash.text, /Standard plan|plan/i);

    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "free", plan_status: "active", plan_notes: null },
      superId
    );
    const freeOrg = await organizationsRepo.findOrganizationById(pool, org.id);
    const hqAgentFree = request.agent(
      makeChurchApp({ kind: "branch", orgSlug: org.slug, organization: freeOrg, branch })
    );
    await hqAgentFree.post("/hq/login").type("form").send({
      identifier: `hq_${suffix}@example.com`,
      password: "testpass123",
    });
    const analytics = await hqAgentFree.get("/hq/analytics");
    assert.equal(analytics.status, 200);
    assert.match(analytics.text, /Premium feature preview|premium preview/i);

    const broadcasts = await hqAgentFree.get("/hq/broadcasts");
    assert.equal(broadcasts.status, 200);
    assert.match(broadcasts.text, /Premium feature preview|premium preview/i);

    const listWithPlan = await platformProvisioningRepo.listOrganizationsWithPlanSummary(pool, {
      q: org.slug,
    });
    assert.ok(listWithPlan.some((row) => row.id === org.id));

    await cleanupOrg(pool, org.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
