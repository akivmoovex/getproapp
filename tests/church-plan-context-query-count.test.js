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
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { wrapPoolWithQueryCounter } = require("./helpers/churchPlanQueryCounter");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const churchPlanService = require("../src/services/church/churchPlanService");
const { getOrganisationPlan, hasEntitlement } = require("../src/services/church/churchEntitlementService");
const {
  loadPlanForReq,
  loadPlanContextForReq,
  attachPackageFeatureLocals,
  requirePackageFeature,
} = require("../src/services/church/churchPackageFeatureGateService");
const churchPackageUsageService = require("../src/services/church/churchPackageUsageService");
const { grantGrowthTrial } = require("../src/services/church/churchGrowthTrialService");
const crossBranchComparisonService = require("../src/services/church/crossBranchComparisonService");
const churchRoutes = require("../src/routes/church");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeChurchApp(ctx, sessionUser) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-plan-query-count",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    if (sessionUser && sessionUser.kind === "branch") {
      req.churchBranchAdmin = sessionUser.branchAdmin;
    }
    if (sessionUser && sessionUser.kind === "hq") {
      req.churchHqAdmin = sessionUser.hqAdmin;
    }
    next();
  });
  app.use(churchRoutes());
  return app;
}

async function seedFoundationTenant(pool, suffix) {
  const passwordHash = await bcrypt.hash("PlanPerf_pw_2026!", 12);
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `pqc_${suffix}`.slice(0, 40),
    name: `Plan Perf ${suffix}`,
  });
  await organizationsRepo.updateOrganizationPlan(
    pool,
    org.id,
    { plan_code: "foundation", plan_status: "active", plan_notes: null },
    null
  );
  const hostSlug = `pqc${Math.random().toString(36).slice(2, 10)}${suffix}`
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 28);
  const branch = await branchesRepo.createBranch(pool, {
    organization_id: org.id,
    slug: hostSlug,
    host_slug: hostSlug,
    name: `Main ${suffix}`,
    status: "active",
    lifecycle_phase: "active",
    location_text: "Test campus",
    service_times: "Sunday 09:00",
  });
  const branchAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    full_name: "Perf BA",
    email: `pqc_ba_${suffix}@example.com`,
    phone: "0977111001",
    password_hash: passwordHash,
  });
  const hqAdmin = await hqAdminsRepo.createHqAdmin(pool, {
    organization_id: org.id,
    full_name: "Perf HQ",
    email: `pqc_hq_${suffix}@example.com`,
    phone: "0977111002",
    password_hash: passwordHash,
    role: "hq_admin",
  });
  await membersRepo.createPendingMember(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    platform_tenant_id: TENANT_ZM,
    full_name: "Verified Member",
    email: `pqc_m_${suffix}@example.com`,
    phone: "0977111003",
    password_hash: passwordHash,
  });
  await pool.query(
    `UPDATE public.church_members SET status = 'verified' WHERE email = $1`,
    [`pqc_m_${suffix}@example.com`]
  );
  return { org, branch, branchAdmin, hqAdmin, password: "PlanPerf_pw_2026!" };
}

async function seedGrowthTenant(pool, suffix) {
  const base = await seedFoundationTenant(pool, `${suffix}_g`);
  await organizationsRepo.updateOrganizationPlan(
    pool,
    base.org.id,
    { plan_code: "growth", plan_status: "active", plan_notes: null },
    null
  );
  return base;
}

function countSqlKinds(counter) {
  const queries = [];
  const orig = counter.query.bind(counter);
  counter.query = (text, params) => {
    queries.push(String(text));
    return orig(text, params);
  };
  return {
    finish() {
      const org = queries.filter((q) => /church_organizations/i.test(q)).length;
      const trial = queries.filter((q) => /church_organization_package_trials/i.test(q)).length;
      const members = queries.filter((q) => /church_members/i.test(q) && /COUNT/i.test(q)).length;
      return { total: queries.length, org, trial, members, queries };
    },
  };
}

test(
  "getOrganisationPlan uses at most one organization and one trial query",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("planq");
    const { org } = await seedFoundationTenant(pool, suffix);

    const noTrialCounter = wrapPoolWithQueryCounter(pool);
    const trackerA = countSqlKinds(noTrialCounter);
    const planA = await getOrganisationPlan(noTrialCounter, org.id);
    const statsA = trackerA.finish();
    assert.ok(planA);
    assert.equal(planA.packageCode, "foundation");
    assert.ok(statsA.org <= 1, `org queries ${statsA.org}`);
    assert.ok(statsA.trial <= 1, `trial queries ${statsA.trial}`);
    assert.ok(statsA.org + statsA.trial <= 2);

    await grantGrowthTrial(pool, org.id, {
      reason: "Plan perf active trial",
      durationDays: 14,
      grantedByPlatformAdminId: null,
    });

    const trialCounter = wrapPoolWithQueryCounter(pool);
    const trackerB = countSqlKinds(trialCounter);
    const planB = await getOrganisationPlan(trialCounter, org.id);
    const statsB = trackerB.finish();
    assert.equal(planB.packageCode, "growth");
    assert.equal(planB.entitlementSource, "growth_trial");
    assert.ok(statsB.org <= 1);
    assert.ok(statsB.trial <= 1);
    assert.ok(statsB.org + statsB.trial <= 2);
  }
);

test(
  "loadPlanContextForOrganization avoids duplicate plan and seat queries",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("plctx");
    const { org } = await seedGrowthTenant(pool, suffix);

    const counter = wrapPoolWithQueryCounter(pool);
    const tracker = countSqlKinds(counter);
    const ctx = await churchPlanService.loadPlanContextForOrganization(counter, org.id);
    const stats = tracker.finish();

    assert.ok(ctx);
    assert.ok(ctx.packageUsage);
    assert.ok(ctx.seatUsage);
    assert.equal(ctx.seatUsage.activeMembers, 1);
    assert.ok(stats.org <= 2, `expected <=2 org lookups, got ${stats.org}`);
    assert.ok(stats.trial <= 1, `expected <=1 trial lookup, got ${stats.trial}`);
    assert.ok(stats.total <= 12, `plan context should stay bounded, got ${stats.total}`);
  }
);

test(
  "request-scoped plan context is reused within one HTTP request and not across tenants",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("reqscope");
    const a = await seedFoundationTenant(pool, `${suffix}a`);
    const b = await seedGrowthTenant(pool, `${suffix}b`);

    const reqA = {
      churchContext: { organization: a.org, branch: a.branch },
      res: { locals: {} },
    };
    const ctxA1 = await loadPlanContextForReq(reqA);
    const counter = wrapPoolWithQueryCounter(pool);
    const tracker = countSqlKinds(counter);
    const ctxA2 = await loadPlanContextForReq(reqA);
    const stats = tracker.finish();
    assert.equal(ctxA1, ctxA2);
    assert.equal(stats.total, 0, "second load on same request should not query");

    const reqB = {
      churchContext: { organization: b.org, branch: b.branch },
      res: { locals: {} },
    };
    const ctxB = await loadPlanContextForReq(reqB);
    assert.notEqual(ctxA1.packagePlan.organizationId, ctxB.packagePlan.organizationId);
    assert.equal(ctxB.packagePlan.packageCode, "growth");
  }
);

test(
  "feature middleware + locals reuse req.churchPackagePlan without second entitlement resolve",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("featloc");
    const { org } = await seedGrowthTenant(pool, suffix);

    const req = {
      method: "GET",
      path: "/branch/scheduled-reports",
      churchContext: { organization: org },
      res: { locals: {} },
    };
    const guard = requirePackageFeature("reports_scheduled", { allowGetUpgradeShell: true });
    await new Promise((resolve, reject) => {
      guard(req, { locals: {} }, (err) => (err ? reject(err) : resolve()));
    });

    const counter = wrapPoolWithQueryCounter(pool);
    let planCalls = 0;
    const entitlement = require("../src/services/church/churchEntitlementService");
    const orig = entitlement.getOrganisationPlan;
    entitlement.getOrganisationPlan = async (...args) => {
      planCalls += 1;
      return orig(...args);
    };
    try {
      await attachPackageFeatureLocals(req, "branch");
      assert.equal(planCalls, 0, "attachPackageFeatureLocals must not re-resolve plan");
      assert.ok(req.churchPackagePlan);
      assert.ok(hasEntitlement(req.churchPackagePlan, "reports.scheduled"));
    } finally {
      entitlement.getOrganisationPlan = orig;
      void counter;
    }
  }
);

test(
  "admin route query budgets: dashboard, members, scheduled report, broadcast, cross-branch, account",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("routes");
    const seeded = await seedGrowthTenant(pool, suffix);
    const ctx = {
      kind: "branch",
      orgSlug: seeded.org.slug,
      organization: { ...seeded.org, plan_code: "growth" },
      branch: seeded.branch,
      hostSlug: seeded.branch.host_slug,
    };
    const hqCtx = {
      kind: "branch",
      orgSlug: seeded.org.slug,
      organization: { ...seeded.org, plan_code: "growth" },
      branch: seeded.branch,
      hostSlug: seeded.branch.host_slug,
    };

    const branchApp = makeChurchApp(ctx, {
      kind: "branch",
      branchAdmin: {
        admin_id: seeded.branchAdmin.id,
        branch_id: seeded.branch.id,
        organization_id: seeded.org.id,
        full_name: seeded.branchAdmin.full_name,
        status: "active",
      },
    });
    const hqApp = makeChurchApp(hqCtx, {
      kind: "hq",
      hqAdmin: {
        hq_admin_id: seeded.hqAdmin.id,
        organization_id: seeded.org.id,
        full_name: seeded.hqAdmin.full_name,
        role: "hq_admin",
        status: "active",
        can_view_finance: true,
      },
    });
    const branchAgent = request.agent(branchApp);
    await branchAgent
      .post("/branch/login")
      .type("form")
      .send({ identifier: seeded.branchAdmin.email, password: seeded.password })
      .expect(303);
    const hqAgent = request.agent(hqApp);
    await hqAgent
      .post("/hq/login")
      .type("form")
      .send({ identifier: seeded.hqAdmin.email, password: seeded.password })
      .expect(303);

    const budgets = [];

    async function measure(label, fn) {
      const queries = [];
      const { Pool } = require("pg");
      const origPoolQuery = Pool.prototype.query;
      Pool.prototype.query = function patchedPoolQuery(text, params, callback) {
        const sql = typeof text === "object" && text && text.text != null ? String(text.text) : String(text);
        queries.push(sql);
        return origPoolQuery.call(this, text, params, callback);
      };
      try {
        await fn();
      } finally {
        Pool.prototype.query = origPoolQuery;
      }
      const org = queries.filter((q) => /church_organizations/i.test(q)).length;
      const trial = queries.filter((q) => /church_organization_package_trials/i.test(q)).length;
      const members = queries.filter((q) => /church_members/i.test(q) && /COUNT/i.test(q)).length;
      budgets.push({ label, total: queries.length, org, trial, members, queries });
    }

    await measure("branch dashboard GET", async () => {
      const res = await branchAgent.get("/branch/dashboard");
      assert.equal(res.status, 200);
    });
    await measure("HQ dashboard GET", async () => {
      const res = await hqAgent.get("/hq/dashboard");
      assert.equal(res.status, 200);
    });
    await measure("member directory GET", async () => {
      const res = await branchAgent.get("/branch/members");
      assert.equal(res.status, 200);
    });
    await measure("scheduled report GET", async () => {
      const res = await branchAgent.get("/branch/scheduled-reports");
      assert.ok([200, 404].includes(res.status));
    });
    await measure("scheduled broadcast GET", async () => {
      const res = await hqAgent.get("/hq/scheduled-broadcasts");
      assert.ok([200, 404].includes(res.status));
    });
    await measure("cross-branch report GET", async () => {
      const res = await hqAgent.get("/hq/cross-branch-reports");
      assert.ok([200, 404].includes(res.status));
    });
    await measure("branch account GET", async () => {
      const res = await branchAgent.get("/branch/account");
      assert.equal(res.status, 200);
    });

    for (const row of budgets) {
      console.log(
        `[plan-query-budget] ${row.label}: total=${row.total} org=${row.org} trial=${row.trial} members=${row.members}`
      );
      assert.ok(row.org <= 3, `${row.label}: org queries ${row.org}`);
      assert.ok(row.trial <= 2, `${row.label}: trial queries ${row.trial}`);
    }

    const dashboard = budgets.find((b) => b.label === "branch dashboard GET");
    assert.ok(dashboard.total <= 45, `branch dashboard total queries ${dashboard.total}`);
    const account = budgets.find((b) => b.label === "branch account GET");
    assert.ok(account.trial <= 2);
    assert.ok(account.org <= 3);
  }
);

test(
  "cross-branch service reuses plan option and expired trial still resolves Foundation",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("xbranch");
    const { org } = await seedFoundationTenant(pool, suffix);
    const plan = await getOrganisationPlan(pool, org.id);

    let planCalls = 0;
    const entitlement = require("../src/services/church/churchEntitlementService");
    const orig = entitlement.getOrganisationPlan;
    entitlement.getOrganisationPlan = async (...args) => {
      planCalls += 1;
      return orig(...args);
    };
    try {
      await assert.rejects(
        () =>
          crossBranchComparisonService.loadCrossBranchComparison(pool, {
            organizationId: org.id,
            plan,
            canViewFinance: false,
            filters: crossBranchComparisonService.parseFilters({
              date_from: "2026-07-01",
              date_to: "2026-07-31",
            }),
          }),
        (err) => err && err.code === "FOUNDATION_CROSS_BRANCH_FORBIDDEN"
      );
      assert.equal(planCalls, 0);
    } finally {
      entitlement.getOrganisationPlan = orig;
    }

    await grantGrowthTrial(pool, org.id, {
      reason: "cross branch trial",
      durationDays: 1,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const midTrial = await getOrganisationPlan(pool, org.id, {
      at: new Date("2026-01-01T12:00:00.000Z"),
    });
    assert.equal(midTrial.packageCode, "growth");
    assert.equal(midTrial.entitlementSource, "growth_trial");

    const afterEnd = await getOrganisationPlan(pool, org.id, {
      at: new Date("2026-06-10T00:00:00.000Z"),
    });
    assert.equal(afterEnd.packageCode, "foundation");
    assert.equal(afterEnd.entitlementSource, "growth_trial_ended");
  }
);

test("loadPackageUsageForAccountPage accepts pre-resolved plan", { skip: !isPgConfigured() }, async () => {
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  await ensureChurchSchema(pool);
  const suffix = makeSuffix("acct");
  const { org } = await seedGrowthTenant(pool, suffix);
  const plan = await getOrganisationPlan(pool, org.id);

  let planCalls = 0;
  const entitlement = require("../src/services/church/churchEntitlementService");
  const orig = entitlement.getOrganisationPlan;
  entitlement.getOrganisationPlan = async (...args) => {
    planCalls += 1;
    return orig(...args);
  };
  try {
    const usage = await churchPackageUsageService.loadPackageUsageForAccountPage(pool, org.id, {
      reconcileStorage: false,
      plan,
    });
    assert.ok(usage);
    assert.equal(planCalls, 0);
  } finally {
    entitlement.getOrganisationPlan = orig;
  }
});
