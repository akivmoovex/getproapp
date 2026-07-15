"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  PACKAGE_FEATURES,
  resolveFeatureUi,
  listNavFeatureGates,
  requiredPackageForEntitlement,
} = require("../src/church/blessBoardPackageFeatures");
const { resolvePackageFromPlanCode, BLESSBOARD_PACKAGES } = require("../src/church/blessBoardPackageCatalogue");
const { hasEntitlement } = require("../src/services/church/churchEntitlementService");
const { assertScheduledBroadcastAllowed, PACKAGE_FEATURE_DENIED } = require("../src/services/church/churchPackageFeatureGateService");
const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function planFromCode(code) {
  const resolved = resolvePackageFromPlanCode(code);
  return {
    packageCode: resolved.packageCode,
    packageLabel: resolved.packageDefinition.label,
    entitlements: resolved.packageDefinition.entitlements,
  };
}

function makeApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-package-feature-gates",
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

test("Foundation upgrade features resolve to Growth; Network-only stay Network", () => {
  assert.equal(requiredPackageForEntitlement("attendance.offline").code, "growth");
  assert.equal(requiredPackageForEntitlement("volunteers.scheduling").code, "growth");
  assert.equal(requiredPackageForEntitlement("reports.cross_branch").code, "growth");
  assert.equal(requiredPackageForEntitlement("domains.custom").code, "network");
  assert.equal(requiredPackageForEntitlement("integrations.webhooks").code, "network");
  assert.equal(requiredPackageForEntitlement("network.executive_hierarchy").code, "network");
});

test("UI states: upgrade for discoverable Foundation locks; hidden for Network clutter", () => {
  const foundation = planFromCode("foundation");
  const growth = planFromCode("growth");

  assert.equal(resolveFeatureUi(foundation, "appointments_calendar").state, "upgrade");
  assert.equal(resolveFeatureUi(foundation, "attendance_offline").state, "upgrade");
  assert.equal(resolveFeatureUi(foundation, "volunteers_scheduling").state, "upgrade");
  assert.equal(resolveFeatureUi(foundation, "email_hosted").state, "hidden");
  assert.equal(resolveFeatureUi(foundation, "integrations_webhooks").state, "hidden");
  assert.equal(resolveFeatureUi(foundation, "network_executive_hierarchy").state, "hidden");

  assert.equal(resolveFeatureUi(growth, "appointments_calendar").state, "available");
  assert.equal(resolveFeatureUi(growth, "reports_cross_branch").state, "available");
  assert.equal(resolveFeatureUi(growth, "domains_custom").state, "upgrade");
  assert.equal(resolveFeatureUi(growth, "reports_custom_builder").state, "hidden");
  assert.equal(resolveFeatureUi(growth, "network_priority_support").state, "hidden");
});

test("navigation omits hidden features and keeps duty roster un-gated", () => {
  const foundation = planFromCode("foundation");
  const branchNav = listNavFeatureGates(foundation, "branch");
  const paths = branchNav.map((n) => n.path);
  assert.ok(paths.includes("/branch/appointments"));
  assert.ok(paths.includes("/branch/volunteer-scheduling"));
  assert.ok(paths.includes("/branch/domains/custom"));
  assert.ok(!paths.includes("/branch/email/hosted"));
  assert.ok(!paths.includes("/hq/custom-report-builder"));
  assert.ok(branchNav.every((n) => n.state === "upgrade" || n.state === "available"));

  const hqNav = listNavFeatureGates(foundation, "hq");
  assert.ok(hqNav.some((n) => n.path === "/hq/cross-branch-reports"));
  assert.ok(!hqNav.some((n) => n.path === "/hq/integrations/webhooks"));
});

test("every registry feature uses a catalogue entitlement key", () => {
  for (const feature of PACKAGE_FEATURES) {
    const found =
      hasEntitlement({ entitlements: BLESSBOARD_PACKAGES.foundation.entitlements }, feature.entitlementKey) ||
      hasEntitlement({ entitlements: BLESSBOARD_PACKAGES.growth.entitlements }, feature.entitlementKey) ||
      feature.entitlementKey.startsWith("network.") ||
      feature.entitlementKey.startsWith("integrations.") ||
      feature.entitlementKey.startsWith("domains.") ||
      feature.entitlementKey.startsWith("email.") ||
      feature.entitlementKey.startsWith("reports.");
    assert.ok(found || feature.entitlementKey, `missing key for ${feature.id}`);
    // Key must exist on both package entitlement trees (may be false/0).
    const fVal = require("../src/church/blessBoardPackageCatalogue").readEntitlementPath(
      BLESSBOARD_PACKAGES.foundation.entitlements,
      feature.entitlementKey
    );
    const gVal = require("../src/church/blessBoardPackageCatalogue").readEntitlementPath(
      BLESSBOARD_PACKAGES.growth.entitlements,
      feature.entitlementKey
    );
    assert.notEqual(fVal, undefined, `Foundation missing ${feature.entitlementKey}`);
    assert.notEqual(gVal, undefined, `Growth missing ${feature.entitlementKey}`);
  }
});

test("scheduled broadcast assert blocks future publish_at without entitlement", async () => {
  const foundation = planFromCode("foundation");
  const req = {
    churchPackagePlan: foundation,
    churchContext: { organization: { id: 1 }, branch: null },
    method: "POST",
    path: "/hq/broadcasts",
  };
  const future = new Date(Date.now() + 60 * 60 * 1000);
  await assert.rejects(
    () => assertScheduledBroadcastAllowed(req, future),
    (err) => err && err.code === PACKAGE_FEATURE_DENIED
  );

  const growth = planFromCode("growth");
  req.churchPackagePlan = growth;
  await assert.doesNotReject(() => assertScheduledBroadcastAllowed(req, future));
  await assert.doesNotReject(() => assertScheduledBroadcastAllowed(req, new Date()));
});

test(
  "Foundation: nav upgrade links, GET upgrade shells, POST blocked; core flows stay open",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pkgui");
    const passwordHash = await bcrypt.hash("testpass123456", 12);

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pkgui_${suffix}`.slice(0, 40),
      name: `Pkg UI ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: `main_${suffix}`.slice(0, 30),
      host_slug: `main_${suffix}`.slice(0, 30),
      name: "Main",
      status: "active",
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Branch Admin",
      email: `ba_${suffix}@example.com`,
      phone: "0977000111",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: "HQ Admin",
      email: `hq_${suffix}@example.com`,
      phone: "0977000222",
      password_hash: passwordHash,
      role: "hq_admin",
      status: "active",
    });

    const orgRow = await organizationsRepo.findOrganizationById(pool, org.id);
    const app = makeApp({ kind: "branch", orgSlug: orgRow.slug, organization: orgRow, branch });
    const agent = request.agent(app);
    await agent
      .post("/branch/login")
      .type("form")
      .send({ identifier: `ba_${suffix}@example.com`, password: "testpass123456" })
      .expect(303);

    const dash = await agent.get("/branch/dashboard");
    assert.equal(dash.status, 200);
    assert.match(dash.text, /Appointments/);
    assert.match(dash.text, /Volunteer scheduling/);
    assert.match(dash.text, /Offline attendance/);
    assert.doesNotMatch(dash.text, /Hosted email/);
    assert.match(dash.text, /Duty Roster/);
    assert.match(dash.text, /Attendance/);

    const upgradeGet = await agent.get("/branch/appointments");
    assert.equal(upgradeGet.status, 200);
    assert.match(upgradeGet.text, /Appointment calendar/);
    assert.match(upgradeGet.text, /Foundation/);
    assert.match(upgradeGet.text, /Growth/);
    assert.match(upgradeGet.text, /View package/);

    const availableCore = await agent.get("/branch/attendance");
    assert.equal(availableCore.status, 200);
    assert.doesNotMatch(availableCore.text, /Not found/);

    const duty = await agent.get("/branch/duty-roster");
    assert.equal(duty.status, 200);

    const blockedPost = await agent.post("/branch/appointments").type("form").send({});
    assert.equal(blockedPost.status, 403);
    assert.match(blockedPost.text, /Appointment calendar|Growth|Foundation/i);

    const hiddenGet = await agent.get("/branch/email/hosted");
    assert.equal(hiddenGet.status, 404);
    assert.match(hiddenGet.text, /not available|Hosted email/i);

    const hqApp = makeApp({ kind: "hq", orgSlug: orgRow.slug, organization: orgRow, branch });
    const hqAgent = request.agent(hqApp);
    await hqAgent
      .post("/hq/login")
      .type("form")
      .send({ identifier: `hq_${suffix}@example.com`, password: "testpass123456" })
      .expect(303);

    const cross = await hqAgent.get("/hq/cross-branch-reports");
    assert.equal(cross.status, 200);
    assert.match(cross.text, /Cross-branch reports/);
    assert.match(cross.text, /Growth/);

    const webhookPost = await hqAgent.post("/hq/integrations/webhooks").type("form").send({});
    assert.equal(webhookPost.status, 403);

    const growthOrg = await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    void growthOrg;
    const orgGrowth = await organizationsRepo.findOrganizationById(pool, org.id);
    const growthApp = makeApp({ kind: "branch", orgSlug: orgGrowth.slug, organization: orgGrowth, branch });
    const growthAgent = request.agent(growthApp);
    await growthAgent
      .post("/branch/login")
      .type("form")
      .send({ identifier: `ba_${suffix}@example.com`, password: "testpass123456" })
      .expect(303);
    const availableAppts = await growthAgent.get("/branch/appointments");
    assert.equal(availableAppts.status, 200);
    assert.match(availableAppts.text, /Included in your/);
    assert.match(availableAppts.text, /Growth/);

    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
  }
);
