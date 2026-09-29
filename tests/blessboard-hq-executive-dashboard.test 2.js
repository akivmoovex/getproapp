"use strict";

/**
 * Network executive dashboard (NW-EX-01):
 * Network entitlement, Growth denial, church scope, filters, aggregates, a11y.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  foundationDbUnavailableSkipReason,
  createFoundationPool,
} = require("./helpers/foundationDb");
const {
  V5_IDENTITY_KEY: IDENTITY_KEY,
  V5_DEPLOYMENT_CODE: DEPLOYMENT,
  DEFAULT_V5_COOKIE,
  baseV5TestEnv,
  makeTenant,
} = require("./helpers/blessboardV5Fixtures");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const {
  assignOrganizationPlan,
  hasFeature,
  FEATURE_KEYS,
  resolveOrganizationEntitlements,
} = require("../src/platform/services/entitlementService");
const {
  createGivingEntry,
  submitGivingEntry,
  approveGivingEntry,
} = require("../src/blessboard/services/givingService");
const { getHqOperationalReport } = require("../src/blessboard/services/hqReportsService");

const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "exec-a.blessboard.org";
const HOST_B = "exec-b.blessboard.org";
const ROOT = path.join(__dirname, "..");

function baseEnv(overrides) {
  return baseV5TestEnv(overrides);
}

describe("blessboard hq executive dashboard", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let branchA;
  let hqAdmin;
  let branchAdmin;
  let yearMonth;
  let tenant;

  function skipIfNeeded(t) {
    if (skipSuite) {
      t.skip(foundationDbUnavailableSkipReason(skipReason));
      return true;
    }
    return false;
  }

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "exec-a",
        displayName: "Exec A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "exec-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "exec-a",
        churchKey: "exec-a",
        displayName: "Exec Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;
      tenant = makeTenant(churchA, orgA.records.organization, branchA);

      const orgB = await provisionPlatformTenant(pool, {
        organizationKey: "exec-b",
        displayName: "Exec B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "exec-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "exec-b",
        churchKey: "exec-b",
        displayName: "Exec Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);

      async function makeUser(email, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName: email,
        });
        assert.equal(created.ok, true, created.reason || created.message);
        if (role) {
          const assigned = await assignBlessBoardRole(pool, role);
          assert.equal(assigned.ok, true, assigned.message || assigned.reason);
        }
        const session = await createV5Session(pool, {
          deploymentCode: DEPLOYMENT,
          userId: created.user.id,
          organizationId: orgA.records.organization.id,
        });
        assert.equal(session.ok, true, session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      hqAdmin = await makeUser("hq@exec-a.example.test", {
        email: "hq@exec-a.example.test",
        organizationKey: "exec-a",
        churchKey: "exec-a",
        roleKey: "church_hq_admin",
      });
      branchAdmin = await makeUser("branch@exec-a.example.test", {
        email: "branch@exec-a.example.test",
        organizationKey: "exec-a",
        churchKey: "exec-a",
        roleKey: "branch_admin",
        branchKey: "hq",
      });

      const today = new Date();
      yearMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
      const givingDate = `${yearMonth}-15`;

      const created = await createGivingEntry(pool, {
        churchId: churchA.id,
        branchId: branchA.id,
        actorUserId: hqAdmin.user.id,
        tenant,
        categoryKey: "tithes",
        givingDate,
        amount: "42.00",
        currency: "USD",
      });
      assert.equal(created.ok, true, created.reason);

      const submitted = await submitGivingEntry(pool, {
        id: created.entry.id,
        churchId: churchA.id,
        actorUserId: hqAdmin.user.id,
        tenant,
      });
      assert.equal(submitted.ok, true, submitted.reason);

      const approved = await approveGivingEntry(pool, {
        id: created.entry.id,
        churchId: churchA.id,
        actorUserId: hqAdmin.user.id,
        tenant,
      });
      assert.equal(approved.ok, true, approved.reason);

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("executive dashboard suite setup failed:", skipReason);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("denies Growth and Foundation executive summary content", async (t) => {
    if (skipIfNeeded(t)) return;
    const cookie = `${DEFAULT_V5_COOKIE}=${hqAdmin.rawToken}`;

    const toGrowth = await assignOrganizationPlan(pool, {
      organizationId: orgA.records.organization.id,
      planKey: "growth",
      productKey: "blessboard",
      status: "active",
    });
    assert.equal(toGrowth.ok, true, toGrowth.reason);

    const growthEnt = await resolveOrganizationEntitlements(pool, {
      organizationId: orgA.records.organization.id,
    });
    assert.equal(hasFeature(growthEnt.entitlements, FEATURE_KEYS.EXECUTIVE_REPORTS), false);
    assert.equal(hasFeature(growthEnt.entitlements, FEATURE_KEYS.ADVANCED_REPORTS), true);

    const growthPage = await request(app)
      .get("/hq/reports/executive")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(growthPage.status, 200);
    assert.match(growthPage.text, /data-bb-hq-executive="1"/);
    assert.match(growthPage.text, /data-bb-exec-entitlement="denied"/);
    assert.match(growthPage.text, /data-bb-exec-denied="1"/);
    assert.doesNotMatch(growthPage.text, /data-bb-exec-summary="1"/);
    assert.doesNotMatch(growthPage.text, /href="\/hq\/reports\/executive"/);
    assert.doesNotMatch(growthPage.text, /href="\/hq\/audit\/governance"/);
    assert.doesNotMatch(growthPage.text, /42\.00/);
    assert.doesNotMatch(growthPage.text, /\+12\.|forecast|compliance score|health score/i);

    const toFree = await assignOrganizationPlan(pool, {
      organizationId: orgA.records.organization.id,
      planKey: "free",
      productKey: "blessboard",
      status: "active",
    });
    assert.equal(toFree.ok, true, toFree.reason);

    const foundationPage = await request(app)
      .get("/hq/reports/executive")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(foundationPage.status, 200);
    assert.match(foundationPage.text, /data-bb-exec-denied="1"/);
  });

  it("serves Network executive dashboard with aggregates, filters, and a11y markers", async (t) => {
    if (skipIfNeeded(t)) return;
    const cookie = `${DEFAULT_V5_COOKIE}=${hqAdmin.rawToken}`;

    const toNetwork = await assignOrganizationPlan(pool, {
      organizationId: orgA.records.organization.id,
      planKey: "professional",
      productKey: "blessboard",
      status: "active",
    });
    assert.equal(toNetwork.ok, true, toNetwork.reason);

    const networkEnt = await resolveOrganizationEntitlements(pool, {
      organizationId: orgA.records.organization.id,
    });
    assert.equal(hasFeature(networkEnt.entitlements, FEATURE_KEYS.EXECUTIVE_REPORTS), true);

    const page = await request(app)
      .get(`/hq/reports/executive?month=${yearMonth}`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-bb-hq-executive="1"/);
    assert.match(page.text, /data-bb-batch="nw-ex-01"/);
    assert.match(page.text, /data-bb-stitch-executive="57-hq-consolidated-analytics"/);
    assert.match(page.text, /data-bb-exec-entitlement="network"/);
    assert.match(page.text, /data-bb-exec-summary="1"/);
    assert.match(page.text, /data-bb-exec-filter="1"/);
    assert.match(page.text, /data-bb-exec-stat="branches"/);
    assert.match(page.text, /data-bb-exec-stat="members"/);
    assert.match(page.text, /data-bb-exec-table="giving-currency"|data-bb-exec-cards="giving-currency"/);
    assert.match(page.text, /42\.00/);
    assert.match(page.text, /data-bb-exec-unavailable="product"/);
    assert.match(page.text, /read receipts/i);
    assert.doesNotMatch(page.text, /Chart\.js|<canvas|\+12\.|donor email|baptism heatmap/i);
    assert.doesNotMatch(page.text, /data-bb-exec-fabricated=/);
    assert.match(page.text, /Unavailable analytics/);
    assert.match(page.text, /href="\/hq\/reports\/executive"/);
    assert.match(page.text, /aria-label="Executive dashboard"/);

    const filtered = await request(app)
      .get(`/hq/reports/executive?month=${yearMonth}&branch=hq`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, /data-bb-exec-scope="branch"/);
    assert.match(filtered.text, /42\.00/);

    const unknown = await request(app)
      .get(`/hq/reports/executive?month=${yearMonth}&branch=does-not-exist`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(unknown.status, 404);

    const crossChurch = await request(app)
      .get(`/hq/reports/executive?month=${yearMonth}`)
      .set("Host", HOST_B)
      .set("Cookie", cookie);
    assert.equal(crossChurch.status, 403);
    assert.doesNotMatch(crossChurch.text, /42\.00/);

    const branchDenied = await request(app)
      .get("/hq/reports/executive")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`);
    assert.ok(
      branchDenied.status === 403 || branchDenied.status === 303,
      `status=${branchDenied.status}`
    );
  });

  it("matches operational report aggregates and avoids per-branch N+1 in route", async (t) => {
    if (skipIfNeeded(t)) return;

    const report = await getHqOperationalReport(pool, {
      churchId: churchA.id,
      actorUserId: hqAdmin.user.id,
      tenant,
      yearMonth,
      branchId: null,
    });
    assert.equal(report.ok, true, report.reason);
    const usd = report.report.giving.byCurrency.find((g) => g.currency === "USD");
    assert.ok(usd);
    assert.equal(usd.totalAmount, "42.00");

    const routes = fs.readFileSync(
      path.join(ROOT, "src/blessboard/http/hqReportsRoutes.js"),
      "utf8"
    );
    assert.match(routes, /\/hq\/reports\/executive/);
    assert.match(routes, /resolveChurchExecutiveReports/);
    assert.match(routes, /Promise\.all\(\[\s*\n\s*getHqOperationalReport/);
    assert.doesNotMatch(routes, /branches\.forEach\([\s\S]*getHqOperationalReport/);

    const nav = fs.readFileSync(path.join(ROOT, "src/blessboard/http/hqAdminNav.js"), "utf8");
    assert.match(nav, /href: "\/hq\/reports\/executive"/);
  });
});
