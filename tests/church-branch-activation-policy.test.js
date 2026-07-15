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
const {
  FOUNDATION_SECOND_ACTIVE_ERROR,
  canActivateAnotherActiveBranch,
  validateActivationRequirements,
  activateBranch,
  resolveCreateBranchLifecycle,
} = require("../src/services/church/branchActivationPolicyService");
const { resolveBranchLifecycle } = require("../src/church/branchLifecycle");
const { churchOperationalAccessGate, getChurchAccessBlock } = require("../src/church/churchStatusAccess");
const churchRoutes = require("../src/routes/church");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

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
      secret: "church-branch-activation-test",
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
      secret: "church-branch-access-test",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  app.use(churchOperationalAccessGate);
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
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("lifecycle mapping preserves operational status semantics", () => {
  assert.equal(resolveBranchLifecycle({ status: "active" }).phase, "active");
  assert.equal(resolveBranchLifecycle({ status: "suspended" }).phase, "temporarily_inactive");
  assert.equal(resolveBranchLifecycle({ status: "archived" }).phase, "archived");
  assert.equal(resolveBranchLifecycle({ status: "suspended", lifecycle_phase: "draft" }).phase, "draft");
  assert.equal(resolveBranchLifecycle({ status: "archived", lifecycle_phase: "closed" }).phase, "closed");
  assert.equal(resolveBranchLifecycle({ status: "active", lifecycle_phase: "draft" }).phase, "active");
});

test("Foundation package blocks a second active branch in policy", () => {
  const org = { plan_code: "foundation" };
  assert.equal(canActivateAnotherActiveBranch(org, 0).allowed, true);
  const blocked = canActivateAnotherActiveBranch(org, 1);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.error, FOUNDATION_SECOND_ACTIVE_ERROR);
});

test("Growth package allows multiple active branches", () => {
  const org = { plan_code: "growth" };
  assert.equal(canActivateAnotherActiveBranch(org, 0).allowed, true);
  assert.equal(canActivateAnotherActiveBranch(org, 5).allowed, true);
});

test("activation requirements validate identity address schedule admin and Growth billing ack", () => {
  const incomplete = validateActivationRequirements(
    { name: "", location_text: "", service_times: "" },
    { packageCode: "foundation", activeAdminCount: 0 }
  );
  assert.equal(incomplete.ok, false);

  const foundationReady = validateActivationRequirements(
    { name: "Main", location_text: "Lusaka", service_times: "Sun 09:00" },
    { packageCode: "foundation", activeAdminCount: 1 }
  );
  assert.equal(foundationReady.ok, true);

  const growthMissingBilling = validateActivationRequirements(
    { name: "Main", location_text: "Lusaka", service_times: "Sun 09:00" },
    { packageCode: "growth", activeAdminCount: 1, billingAcknowledged: false }
  );
  assert.equal(growthMissingBilling.ok, false);

  const growthOk = validateActivationRequirements(
    { name: "Main", location_text: "Lusaka", service_times: "Sun 09:00" },
    { packageCode: "growth", activeAdminCount: 1, billingAcknowledged: true }
  );
  assert.equal(growthOk.ok, true);
});

test(
  "Foundation first activation, second rejection, Growth multi, isolation, inactive access, history, POST bypass",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bact");

    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `bact_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `bact_a_${suffix}`.slice(0, 40),
      name: `Activation Org A ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgA.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      superId
    );

    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `bact_b_${suffix}`.slice(0, 40),
      name: `Activation Org B ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgB.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      superId
    );

    const orgAFresh = await organizationsRepo.findOrganizationById(pool, orgA.id);
    const firstLifecycle = await resolveCreateBranchLifecycle(pool, orgAFresh, { preferActive: true });
    assert.equal(firstLifecycle.createdAsActive, true);

    const created = await platformProvisioningRepo.createBranchForOrganization(
      pool,
      orgA.id,
      {
        branch: {
          name: "First Campus",
          slug: `first${suffix}`.slice(0, 30),
          host_slug: `first${suffix}`.slice(0, 30),
          location_text: "Lusaka Road 1",
          service_times: "Sunday 09:00",
          country: "Zambia",
        },
        branchAdmin: {
          full_name: "Admin One",
          email: `a1_${suffix}@example.com`,
          phone: "0977000001",
          temporary_password: "temppass12345",
        },
      },
      superId
    );
    assert.equal(created.branch.status, "active");
    assert.equal(created.createdAsActive, true);

    const second = await platformProvisioningRepo.createBranchForOrganization(
      pool,
      orgA.id,
      {
        branch: {
          name: "Second Campus Draft",
          slug: `second${suffix}`.slice(0, 30),
          host_slug: `second${suffix}`.slice(0, 30),
          location_text: "Ndola Road 2",
          service_times: "Sunday 10:00",
          country: "Zambia",
        },
        branchAdmin: {
          full_name: "Admin Two",
          email: `a2_${suffix}@example.com`,
          phone: "0977000002",
          temporary_password: "temppass12345",
        },
      },
      superId
    );
    assert.equal(second.branch.status, "suspended");
    assert.equal(second.createdAsActive, false);
    assert.match(String(second.deferReason || ""), /Foundation includes one active branch/i);

    // History preserved: both branch rows exist
    const allA = await branchesRepo.listBranchesForOrganization(pool, orgA.id);
    assert.equal(allA.length, 2);
    assert.equal(await branchesRepo.countActiveBranchesForOrganization(pool, orgA.id), 1);

    // Activate second must fail (Foundation)
    let activateErr = null;
    try {
      await activateBranch(pool, second.branch.id, {
        platformAdminId: superId,
        billingAcknowledged: false,
      });
    } catch (e) {
      activateErr = e;
    }
    assert.ok(activateErr);
    assert.equal(activateErr.code, "FOUNDATION_ACTIVE_BRANCH_LIMIT");
    assert.equal(activateErr.message, FOUNDATION_SECOND_ACTIVE_ERROR);

    // Direct POST bypass attempt
    const app = createAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");
    const bypass = await agent
      .post(`/admin/church/branches/${second.branch.id}/reactivate`)
      .type("form")
      .send({ status_reason: "bypass attempt" });
    assert.equal(bypass.status, 400);
    assert.match(bypass.text, /Foundation includes one active branch/i);

    // Inactive access enforcement (suspended second branch)
    const suspendedBranch = await branchesRepo.findBranchByIdForPlatform(pool, second.branch.id);
    const block = getChurchAccessBlock({
      kind: "branch",
      organization: orgAFresh,
      branch: suspendedBranch,
    });
    assert.ok(block);
    assert.equal(block.code, "branch");

    const churchApp = makeChurchApp({
      kind: "branch",
      organization: { ...orgAFresh, status: "active" },
      branch: suspendedBranch,
    });
    const publicRes = await request(churchApp).get("/");
    assert.ok([503, 403, 404].includes(publicRes.status) || /unavailable|suspended|not available/i.test(publicRes.text));

    // Growth org: multiple active branches
    const g1 = await platformProvisioningRepo.createBranchForOrganization(
      pool,
      orgB.id,
      {
        branch: {
          name: "Growth One",
          slug: `g1${suffix}`.slice(0, 30),
          host_slug: `g1${suffix}`.slice(0, 30),
          location_text: "Kitwe 1",
          service_times: "Sun 08:00",
        },
        branchAdmin: {
          full_name: "G Admin 1",
          email: `g1_${suffix}@example.com`,
          phone: "0977000011",
          temporary_password: "temppass12345",
        },
      },
      superId
    );
    const g2 = await platformProvisioningRepo.createBranchForOrganization(
      pool,
      orgB.id,
      {
        branch: {
          name: "Growth Two",
          slug: `g2${suffix}`.slice(0, 30),
          host_slug: `g2${suffix}`.slice(0, 30),
          location_text: "Kitwe 2",
          service_times: "Sun 09:00",
        },
        branchAdmin: {
          full_name: "G Admin 2",
          email: `g2_${suffix}@example.com`,
          phone: "0977000012",
          temporary_password: "temppass12345",
        },
      },
      superId
    );
    assert.equal(g1.branch.status, "active");
    assert.equal(g2.branch.status, "active");
    assert.equal(await branchesRepo.countActiveBranchesForOrganization(pool, orgB.id), 2);

    // Tenant isolation: org A counts must not include org B
    assert.equal(await branchesRepo.countActiveBranchesForOrganization(pool, orgA.id), 1);
    assert.notEqual(orgA.id, orgB.id);

    // Deactivate first branch — records remain; second can then activate
    await platformProvisioningRepo.suspendBranch(pool, created.branch.id, {
      reason: "Temporarily closing campus",
      platformAdminId: superId,
    });
    const afterSuspend = await branchesRepo.findBranchByIdForPlatform(pool, created.branch.id);
    assert.equal(afterSuspend.status, "suspended");
    assert.ok(afterSuspend.name);
    assert.equal(await branchesRepo.countActiveBranchesForOrganization(pool, orgA.id), 0);

    const secondActivated = await activateBranch(pool, second.branch.id, {
      platformAdminId: superId,
    });
    assert.equal(secondActivated.branch.status, "active");
    assert.equal(await branchesRepo.countActiveBranchesForOrganization(pool, orgA.id), 1);

    // Audits for activation / deactivation
    const audits = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE organization_id = $1 AND action IN ('platform_church_branch_activated', 'platform_church_branch_deactivated')`,
      [orgA.id]
    );
    assert.ok(audits.rows.some((r) => r.action === "platform_church_branch_activated"));
    assert.ok(audits.rows.some((r) => r.action === "platform_church_branch_deactivated"));

    await cleanupOrg(pool, orgA.id);
    await cleanupOrg(pool, orgB.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
