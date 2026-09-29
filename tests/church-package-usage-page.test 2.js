"use strict";

const path = require("path");
const ejs = require("ejs");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  BLESSBOARD_PACKAGES,
  FAIR_USE,
  resolvePackageFromPlanCode,
} = require("../src/church/blessBoardPackageCatalogue");
const {
  getNumericLimit,
} = require("../src/services/church/churchEntitlementService");
const churchPackageUsageService = require("../src/services/church/churchPackageUsageService");
const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");

const PARTIAL_PATH = path.join(__dirname, "../views/church/partials/package_usage_summary.ejs");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-package-usage-page",
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
  return app;
}

async function renderPartial(locals) {
  return ejs.renderFile(PARTIAL_PATH, locals, { root: path.join(__dirname, "../views") });
}

test("Foundation package limit rows match catalogue ceilings", () => {
  const plan = {
    packageCode: "foundation",
    entitlements: BLESSBOARD_PACKAGES.foundation.entitlements,
  };
  const rows = churchPackageUsageService.buildPackageLimitRows(plan, 1);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  assert.equal(byKey.branches, "1");
  assert.equal(byKey.members, "250");
  assert.equal(byKey.admins, "10");
  assert.equal(byKey.storage, churchPackageUsageService.formatBytes(2147483648));
  assert.equal(byKey.externalEmails, "500");
  assert.equal(byKey.scheduledReports, "Not included");
  assert.equal(getNumericLimit(plan, "storage.bytes"), 2147483648);
});

test("Growth package limit rows use fair use and composed storage/email", () => {
  const plan = {
    packageCode: "growth",
    entitlements: BLESSBOARD_PACKAGES.growth.entitlements,
  };
  const rows = churchPackageUsageService.buildPackageLimitRows(plan, 2);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  assert.equal(byKey.branches, "Counted (unlimited)");
  assert.equal(byKey.members, "Unlimited (fair use)");
  assert.equal(byKey.admins, "Unlimited (fair use)");
  assert.equal(
    byKey.storage,
    churchPackageUsageService.formatBytes(getNumericLimit(plan, "storage.bytes", { activeBranchCount: 2 }))
  );
  assert.equal(byKey.externalEmails, "7000");
  assert.equal(byKey.scheduledReports, "20");
  assert.equal(getNumericLimit(plan, "members.max_active"), FAIR_USE);
});

test("missing package fallback resolves Foundation in limit rows", () => {
  const resolved = resolvePackageFromPlanCode(null);
  assert.equal(resolved.packageCode, "foundation");
  assert.equal(resolved.usedFallback, true);
  const rows = churchPackageUsageService.buildPackageLimitRows(
    { entitlements: resolved.packageDefinition.entitlements },
    1
  );
  assert.equal(rows.find((r) => r.key === "members").value, "250");
});

test("usage service failure partial shows safe fallback text", async () => {
  const html = await renderPartial({ packageUsage: null });
  assert.match(html, /id="package"/);
  assert.match(html, /Package &amp; usage|Package & usage/);
  assert.match(html, /temporarily unavailable/i);
  assert.doesNotMatch(html, /invoice|dunning|platform_tenant/i);
});

test("mobile-friendly package panel uses shared responsive shell classes", async () => {
  const html = await renderPartial({
    packageUsage: {
      packageLabel: "Foundation",
      planStatus: "active",
      usedFallback: false,
      meters: {
        branches: { display: "1 / 1" },
        members: { display: "0 / 250" },
        admins: { display: "1 / 10" },
        storage: { display: "0 B / 2.00 GB" },
        externalEmails: { display: "0 / 500" },
        scheduledReports: { display: "Not included (0 / month)" },
      },
      packageLimitRows: churchPackageUsageService.buildPackageLimitRows(
        { entitlements: BLESSBOARD_PACKAGES.foundation.entitlements },
        1
      ),
      warnings: [],
      blocked: [],
      availableUpgrade: {
        packageLabel: "Growth",
        reason: "Unlock Growth capacity and features.",
      },
      billingReadiness: {
        cadence: "monthly",
        collectionState: "ok",
        summary: "Billing readiness: metering is available. Payment collection is not enabled yet.",
      },
    },
  });
  assert.match(html, /church-branch-panel/);
  assert.match(html, /church-branch-dl/);
  assert.match(html, /Available upgrade:\s*<strong>Growth<\/strong>/);
  assert.match(html, /Billing readiness/);
  assert.doesNotMatch(html, /desktop-only|hidden-mobile/i);
});

test(
  "loadPackageUsageForAccountPage returns null when snapshot throws",
  async () => {
    const original = churchPackageUsageService.getOrganisationUsageSnapshot;
    churchPackageUsageService.getOrganisationUsageSnapshot = async () => {
      throw new Error("forced usage failure");
    };
    try {
      const result = await churchPackageUsageService.loadPackageUsageForAccountPage({}, 1);
      assert.equal(result, null);
    } finally {
      churchPackageUsageService.getOrganisationUsageSnapshot = original;
    }
  }
);

test(
  "Foundation account page shows catalogue limits; Growth shows fair use; isolation and unauthorised",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pkgpage");
    const passwordHash = await bcrypt.hash("testpass123456", 12);

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pkg_a_${suffix}`.slice(0, 40),
      name: `Pkg A ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgA.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pkg_b_${suffix}`.slice(0, 40),
      name: `Pkg B ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgB.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const orgMissing = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pkg_m_${suffix}`.slice(0, 40),
      name: `Pkg Missing ${suffix}`,
    });
    await pool.query(`UPDATE public.church_organizations SET plan_code = NULL WHERE id = $1`, [
      orgMissing.id,
    ]);

    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: `main_a_${suffix}`.slice(0, 30),
      host_slug: `main_a_${suffix}`.slice(0, 30),
      name: "Main A",
      status: "active",
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: `main_b_${suffix}`.slice(0, 30),
      host_slug: `main_b_${suffix}`.slice(0, 30),
      name: "Main B",
      status: "active",
    });
    const branchMissing = await branchesRepo.createBranch(pool, {
      organization_id: orgMissing.id,
      slug: `main_m_${suffix}`.slice(0, 30),
      host_slug: `main_m_${suffix}`.slice(0, 30),
      name: "Main Missing",
      status: "active",
    });

    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `ba_a_${suffix}@example.com`,
      phone: "0977000111",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      full_name: "Admin B",
      email: `ba_b_${suffix}@example.com`,
      phone: "0977000222",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgMissing.id,
      branch_id: branchMissing.id,
      full_name: "Admin M",
      email: `ba_m_${suffix}@example.com`,
      phone: "0977000333",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgA.id,
      full_name: "HQ A",
      email: `hq_a_${suffix}@example.com`,
      phone: "0977000444",
      password_hash: passwordHash,
      role: "hq_admin",
      status: "active",
    });
    await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `mem_a_${suffix}@example.com`,
      phone: "0977000555",
      full_name: "Member A",
      password_hash: passwordHash,
    });
    await pool.query(
      `UPDATE public.church_members SET status = 'verified' WHERE email = $1`,
      [`mem_a_${suffix}@example.com`]
    );

    const orgARow = await organizationsRepo.findOrganizationById(pool, orgA.id);
    const orgBRow = await organizationsRepo.findOrganizationById(pool, orgB.id);
    const orgMRow = await organizationsRepo.findOrganizationById(pool, orgMissing.id);

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgARow.slug,
      organization: orgARow,
      branch: branchA,
    });
    const agentA = request.agent(appA);
    await agentA
      .post("/branch/login")
      .type("form")
      .send({ identifier: `ba_a_${suffix}@example.com`, password: "testpass123456" })
      .expect(303);

    const foundationPage = await agentA.get("/branch/account");
    assert.equal(foundationPage.status, 200);
    assert.match(foundationPage.text, /name="viewport"/);
    assert.match(foundationPage.text, /Current package:\s*<strong>Foundation<\/strong>/);
    assert.match(foundationPage.text, /Status:\s*<strong>active<\/strong>/);
    assert.match(foundationPage.text, /Package limits/);
    assert.match(foundationPage.text, /<dt>Active branches<\/dt><dd>1<\/dd>/);
    assert.match(foundationPage.text, /<dt>Active members<\/dt><dd>250<\/dd>/);
    assert.match(foundationPage.text, /<dt>Administrators \/ leadership<\/dt><dd>10<\/dd>/);
    assert.match(foundationPage.text, /2\.00 GB|2 GB/);
    assert.match(foundationPage.text, /<dt>External emails \/ month<\/dt><dd>500<\/dd>/);
    assert.match(foundationPage.text, /Not included/);
    assert.match(foundationPage.text, /Available upgrade:\s*<strong>Growth<\/strong>/);
    assert.match(foundationPage.text, /Billing readiness/);
    assert.doesNotMatch(foundationPage.text, /platform_tenant|dunning day|draft invoice/i);

    const hqApp = makeApp({
      kind: "hq",
      orgSlug: orgARow.slug,
      organization: orgARow,
      branch: branchA,
    });
    const hqAgent = request.agent(hqApp);
    await hqAgent
      .post("/hq/login")
      .type("form")
      .send({ identifier: `hq_a_${suffix}@example.com`, password: "testpass123456" })
      .expect(303);
    const hqAccount = await hqAgent.get("/hq/account");
    assert.equal(hqAccount.status, 200);
    assert.match(hqAccount.text, /Current package:\s*<strong>Foundation<\/strong>/);
    assert.match(hqAccount.text, /name="viewport"/);

    const appB = makeApp({
      kind: "branch",
      orgSlug: orgBRow.slug,
      organization: orgBRow,
      branch: branchB,
    });
    const agentB = request.agent(appB);
    await agentB
      .post("/branch/login")
      .type("form")
      .send({ identifier: `ba_b_${suffix}@example.com`, password: "testpass123456" })
      .expect(303);
    const growthPage = await agentB.get("/branch/account");
    assert.equal(growthPage.status, 200);
    assert.match(growthPage.text, /Current package:\s*<strong>Growth<\/strong>/);
    assert.match(growthPage.text, /Unlimited \(fair use\)/);
    assert.match(growthPage.text, /Counted \(unlimited\)/);
    assert.match(growthPage.text, /<dt>Scheduled reports \/ month<\/dt><dd>20<\/dd>/);
    assert.match(growthPage.text, /<dt>External emails \/ month<\/dt><dd>6000<\/dd>/);
    assert.match(growthPage.text, /12\.00 GB/);
    assert.doesNotMatch(growthPage.text, /Available upgrade:\s*<strong>Growth<\/strong>/);
    // Isolation: Growth org must not show Org A member counts as Foundation caps alone
    assert.doesNotMatch(growthPage.text, /Pkg A /);

    const appM = makeApp({
      kind: "branch",
      orgSlug: orgMRow.slug,
      organization: orgMRow,
      branch: branchMissing,
    });
    const agentM = request.agent(appM);
    await agentM
      .post("/branch/login")
      .type("form")
      .send({ identifier: `ba_m_${suffix}@example.com`, password: "testpass123456" })
      .expect(303);
    const fallbackPage = await agentM.get("/branch/account");
    assert.equal(fallbackPage.status, 200);
    assert.match(fallbackPage.text, /Current package:\s*<strong>Foundation<\/strong>/);
    assert.match(fallbackPage.text, /safe default|Foundation/i);

    const unauth = await request(appA).get("/branch/account");
    assert.ok([302, 303].includes(unauth.status));
    assert.match(String(unauth.headers.location || ""), /\/branch\/login/);

    const memberApp = makeApp({
      kind: "branch",
      orgSlug: orgARow.slug,
      organization: orgARow,
      branch: branchA,
    });
    const memberAgent = request.agent(memberApp);
    await memberAgent
      .post("/member/login")
      .type("form")
      .send({ identifier: `mem_a_${suffix}@example.com`, password: "testpass123456" });
    const memberOnBranchAccount = await memberAgent.get("/branch/account");
    assert.ok([302, 303].includes(memberOnBranchAccount.status));
    const memberAccount = await memberAgent.get("/member/account");
    assert.equal(memberAccount.status, 200);
    assert.doesNotMatch(memberAccount.text, /Package &amp; usage|Package limits/);

    const snapA = await churchPackageUsageService.getOrganisationUsageSnapshot(pool, orgA.id, {
      reconcileStorage: false,
    });
    const snapB = await churchPackageUsageService.getOrganisationUsageSnapshot(pool, orgB.id, {
      reconcileStorage: false,
    });
    assert.equal(snapA.organizationId, orgA.id);
    assert.equal(snapB.organizationId, orgB.id);
    assert.notEqual(snapA.organizationId, snapB.organizationId);
    assert.equal(snapA.packageCode, "foundation");
    assert.equal(snapB.packageCode, "growth");

    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = ANY($1::int[])`, [
      [orgA.id, orgB.id, orgMissing.id],
    ]);
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = ANY($1::int[])`, [
      [orgA.id, orgB.id, orgMissing.id],
    ]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = ANY($1::int[])`, [
      [orgA.id, orgB.id, orgMissing.id],
    ]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = ANY($1::int[])`, [
      [orgA.id, orgB.id, orgMissing.id],
    ]);
    await pool.query(`DELETE FROM public.church_organization_usage_months WHERE organization_id = ANY($1::int[])`, [
      [orgA.id, orgB.id, orgMissing.id],
    ]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = ANY($1::int[])`, [
      [orgA.id, orgB.id, orgMissing.id],
    ]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = ANY($1::int[])`, [
      [orgA.id, orgB.id, orgMissing.id],
    ]);
  }
);
