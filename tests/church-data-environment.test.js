"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const publicChurchDirectoryRepo = require("../src/db/pg/church/publicChurchDirectoryRepo");
const blessboardAdminRoutes = require("../src/routes/blessboardAdmin");
const { ROLES } = require("../src/auth/roles");
const {
  DATA_ENVIRONMENTS,
  isBillableEnvironment,
  isPublicDirectoryEnvironment,
  allowsFabricatedPublicContent,
  getDataEnvironment,
  normalizeDataEnvironment,
} = require("../src/church/orgDataEnvironment");
const churchDemoDataService = require("../src/services/church/churchDemoDataService");
const {
  captureBillableBranchSnapshot,
  generateGrowthDraftInvoice,
} = require("../src/services/church/churchBillingInvoiceService");
const {
  seedInitialWebsiteContentForBranch,
  seedOptionalDraftStarterContent,
  buildMinimalWebsiteShell,
} = require("../src/services/church/branchOnboardingService");
const { DEMO_TEST_BRANCH_EXCLUSION_SQL } = require("../src/church/crossBranchKpiDefinitions");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePlatformApp(role) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-data-env",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isBlessBoardApexHost = true;
    if (role) {
      req.session.adminUser = {
        id: 44,
        username: "super@example.com",
        display_name: "Super",
        role,
      };
    }
    next();
  });
  app.use("/admin", blessboardAdminRoutes());
  return app;
}

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branch_website_content WHERE organization_id = $1`, [
      orgId,
    ]);
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_announcements WHERE organization_id = $1`, [orgId]).catch(
      () => {}
    );
    await pool.query(`DELETE FROM public.church_events WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("data environment catalogue and helpers", () => {
  assert.deepEqual([...DATA_ENVIRONMENTS], ["production", "pilot", "demo", "test"]);
  assert.equal(normalizeDataEnvironment("DEMO"), "demo");
  assert.equal(normalizeDataEnvironment("nope"), "production");
  assert.equal(isBillableEnvironment("production"), true);
  assert.equal(isBillableEnvironment("pilot"), false);
  assert.equal(isBillableEnvironment("demo"), false);
  assert.equal(isBillableEnvironment("test"), false);
  const prevDep = process.env.DEPLOYMENT_ENV;
  try {
    process.env.DEPLOYMENT_ENV = "production";
    assert.equal(isPublicDirectoryEnvironment("production"), true);
    assert.equal(isPublicDirectoryEnvironment("demo"), false);
    process.env.DEPLOYMENT_ENV = "testing";
    assert.equal(isPublicDirectoryEnvironment("demo"), true);
  } finally {
    if (prevDep === undefined) delete process.env.DEPLOYMENT_ENV;
    else process.env.DEPLOYMENT_ENV = prevDep;
  }
  assert.equal(allowsFabricatedPublicContent("demo"), true);
  assert.equal(allowsFabricatedPublicContent("production"), false);
  assert.match(DEMO_TEST_BRANCH_EXCLUSION_SQL, /host_slug.*demo/);
});

test("production/pilot website shell has no fabricated mission copy", () => {
  const shell = buildMinimalWebsiteShell(
    { id: 1, name: "Real Church", data_environment: "production" },
    { id: 2, name: "Main", pastor_name: "Pastor A" }
  );
  assert.equal(shell.mission_text, "");
  assert.equal(shell.homepage_hero_subtitle, "");
  assert.doesNotMatch(shell.about_body || "", /BlessBoard community|Welcome home/i);
});

test(
  "classification, reset rejection, billing/report exclusion, isolation, public content",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("denv");
    const orgIds = [];

    try {
      const production = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `prod_${suffix}`.slice(0, 40),
        name: `Prod Church ${suffix}`,
        data_environment: "production",
      });
      orgIds.push(production.id);
      assert.equal(getDataEnvironment(production), "production");

      const demo = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `demoorg_${suffix}`.slice(0, 40),
        name: `Demo Fixture ${suffix}`,
        data_environment: "demo",
      });
      orgIds.push(demo.id);
      assert.equal(demo.data_environment, "demo");

      const testOrg = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `testorg_${suffix}`.slice(0, 40),
        name: `Test Fixture ${suffix}`,
        data_environment: "test",
      });
      orgIds.push(testOrg.id);

      await branchesRepo.createBranch(pool, {
        organization_id: production.id,
        slug: `pb_${suffix}`.slice(0, 30),
        host_slug: `pb_${suffix}`.slice(0, 30),
        name: "Prod Branch",
        status: "active",
      });
      await branchesRepo.createBranch(pool, {
        organization_id: demo.id,
        slug: `db_${suffix}`.slice(0, 30),
        host_slug: `db_${suffix}`.slice(0, 30),
        name: "Demo Branch",
        status: "active",
      });
      await branchesRepo.createBranch(pool, {
        organization_id: testOrg.id,
        slug: `tb_${suffix}`.slice(0, 30),
        host_slug: `tb_${suffix}`.slice(0, 30),
        name: "Test Branch",
        status: "active",
      });

      // Production reset rejection
      await assert.rejects(
        () => churchDemoDataService.resetDemoOrganisationContent(pool, production.id),
        (err) => err && err.code === "RESET_FORBIDDEN"
      );

      // Demo reset allowed
      const reset = await churchDemoDataService.resetDemoOrganisationContent(pool, demo.id, {
        platformAdminId: 44,
      });
      assert.equal(reset.dataEnvironment, "demo");

      // Billing exclusion
      await assert.rejects(
        () => captureBillableBranchSnapshot(pool, demo.id, { persist: false }),
        (err) => err && err.code === "NOT_BILLABLE_ENVIRONMENT"
      );
      const invoiceSkip = await generateGrowthDraftInvoice(pool, demo.id, {});
      assert.equal(invoiceSkip.skipped, true);
      assert.match(invoiceSkip.reason, /demo/i);

      // Public directory exclusion (production deployment hides demo/test)
      const prevDep = process.env.DEPLOYMENT_ENV;
      process.env.DEPLOYMENT_ENV = "production";
      try {
        const listed = await publicChurchDirectoryRepo.searchPublicOrganizations(pool, { q: suffix, limit: 50 });
        const slugs = listed.items.map((i) => i.slug);
        assert.ok(slugs.includes(production.slug));
        assert.ok(!slugs.includes(demo.slug));
        assert.ok(!slugs.includes(testOrg.slug));

        const demoPublic = await publicChurchDirectoryRepo.findActivePublicOrganizationBySlug(
          pool,
          demo.slug
        );
        assert.equal(demoPublic, null);
      } finally {
        if (prevDep === undefined) delete process.env.DEPLOYMENT_ENV;
        else process.env.DEPLOYMENT_ENV = prevDep;
      }

      // Public content separation: production gets empty shell; demo may fabricate
      const prodBranch = (await branchesRepo.listBranchesForOrganization(pool, production.id))[0];
      const demoBranch = (await branchesRepo.listBranchesForOrganization(pool, demo.id))[0];
      const prodContent = await seedInitialWebsiteContentForBranch(pool, production, prodBranch, {
        publish: true,
      });
      assert.equal(prodContent.mission_text, "");
      const starters = await seedOptionalDraftStarterContent(pool, production, prodBranch);
      assert.equal(starters.skipped, true);

      const demoContent = await seedInitialWebsiteContentForBranch(pool, demo, demoBranch, {
        publish: true,
      });
      assert.ok(demoContent.mission_text);

      // Tenant isolation: changing demo env does not alter production
      await churchDemoDataService.updateOrganisationDataEnvironment(pool, demo.id, "demo", {
        platformAdminId: 44,
      });
      const prodAgain = await organizationsRepo.findOrganizationById(pool, production.id);
      assert.equal(prodAgain.data_environment, "production");

      // Platform UI shows badge for super admin
      const page = await request(makePlatformApp(ROLES.SUPER_ADMIN))
        .get(`/admin/church/organizations/${demo.id}`)
        .set("Host", "blessboard.com");
      assert.equal(page.status, 200);
      assert.match(page.text, /Demo/);

      const deniedReset = await request(makePlatformApp(ROLES.SUPER_ADMIN))
        .post(`/admin/church/organizations/${production.id}/demo-reset`)
        .set("Host", "blessboard.com")
        .type("form")
        .send({});
      assert.equal(deniedReset.status, 400);
      assert.match(deniedReset.text, /only allowed for organisations classified as demo/i);
    } finally {
      await cleanup(pool, orgIds);
    }
  }
);
