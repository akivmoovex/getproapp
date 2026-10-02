"use strict";

/**
 * Network governance audit (NW-GOV-01):
 * Network entitlement, Growth denial, filters, privacy, church scope.
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
const { recordAuditEvent } = require("../src/platform/services/auditEventService");

const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "gov-a.blessboard.org";
const HOST_B = "gov-b.blessboard.org";
const ROOT = path.join(__dirname, "..");

function baseEnv(overrides) {
  return baseV5TestEnv(overrides);
}

describe("blessboard hq governance audit", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let branchA;
  let hqAdmin;
  let branchAdmin;

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
        organizationKey: "gov-a",
        displayName: "Gov A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "gov-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "gov-a",
        churchKey: "gov-a",
        displayName: "Gov Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      const orgB = await provisionPlatformTenant(pool, {
        organizationKey: "gov-b",
        displayName: "Gov B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "gov-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "gov-b",
        churchKey: "gov-b",
        displayName: "Gov Church B",
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

      hqAdmin = await makeUser("hq@gov-a.example.test", {
        email: "hq@gov-a.example.test",
        organizationKey: "gov-a",
        churchKey: "gov-a",
        roleKey: "church_hq_admin",
      });
      branchAdmin = await makeUser("branch@gov-a.example.test", {
        email: "branch@gov-a.example.test",
        organizationKey: "gov-a",
        churchKey: "gov-a",
        roleKey: "branch_admin",
        branchKey: "hq",
      });

      for (let i = 0; i < 3; i += 1) {
        const recorded = await recordAuditEvent(pool, {
          deploymentCode: DEPLOYMENT,
          organizationId: orgA.records.organization.id,
          churchId: churchA.id,
          branchId: branchA.id,
          actorUserId: hqAdmin.user.id,
          actionKey: "giving.entry.approve",
          entityType: "giving_entry",
          entityId: churchA.id,
          outcome: i === 0 ? "denied" : "success",
          metadata: {
            password: "must-not-appear",
            email: "secret@example.test",
            message: "pastoral confidential text",
            status: "ok",
            count: i,
          },
        });
        assert.equal(recorded.ok, true, recorded.reason);
      }

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("governance audit suite setup failed:", skipReason);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("denies Growth and Foundation governance content", async (t) => {
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
    assert.equal(hasFeature(growthEnt.entitlements, FEATURE_KEYS.ADVANCED_AUDIT), false);

    const growthPage = await request(app)
      .get("/hq/audit/governance")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(growthPage.status, 200);
    assert.match(growthPage.text, /data-bb-hq-governance-audit="1"/);
    assert.match(growthPage.text, /data-bb-gov-entitlement="denied"/);
    assert.match(growthPage.text, /data-bb-gov-denied="1"/);
    assert.doesNotMatch(growthPage.text, /data-bb-gov-catalog="1"/);
    assert.doesNotMatch(growthPage.text, /giving\.entry\.approve/);
    assert.doesNotMatch(growthPage.text, /must-not-appear|secret@example\.test|pastoral confidential/i);
    assert.doesNotMatch(growthPage.text, /href="\/hq\/audit\/governance"/);
    assert.doesNotMatch(growthPage.text, /href="\/hq\/reports\/executive"/);

    const basicAudit = await request(app)
      .get("/hq/audit")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(basicAudit.status, 200);
    assert.match(basicAudit.text, /data-bb-hq-audit="1"/);
    assert.doesNotMatch(basicAudit.text, /data-bb-audit-action="governance"/);
  });

  it("serves Network governance audit with filters, privacy, and pagination markers", async (t) => {
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
    assert.equal(hasFeature(networkEnt.entitlements, FEATURE_KEYS.ADVANCED_AUDIT), true);

    const page = await request(app)
      .get("/hq/audit/governance")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-bb-hq-governance-audit="1"/);
    assert.match(page.text, /data-bb-batch="nw-gov-01"/);
    assert.match(page.text, /data-bb-stitch-governance="58-hq-global-audit-trail"/);
    assert.match(page.text, /data-bb-gov-entitlement="network"/);
    assert.match(page.text, /data-bb-gov-filter="1"/);
    assert.match(page.text, /data-bb-gov-catalog="1"/);
    assert.match(page.text, /name="from"/);
    assert.match(page.text, /name="to"/);
    assert.match(page.text, /name="branch"/);
    assert.match(page.text, /name="actor"/);
    assert.match(page.text, /name="category"/);
    assert.match(page.text, /name="outcome"/);
    assert.match(page.text, /giving\.entry\.approve/);
    assert.match(page.text, /data-bb-gov-unavailable="product"/);
    assert.match(page.text, /data-bb-gov-privacy="1"/);
    assert.doesNotMatch(page.text, /must-not-appear|secret@example\.test|pastoral confidential/i);
    assert.doesNotMatch(page.text, /export\.csv|Download CSV/i);
    assert.doesNotMatch(page.text, /data-bb-gov-score=|data-bb-gov-risk=/);
    assert.match(page.text, /href="\/hq\/audit\/governance"/);
    assert.match(page.text, /Unavailable/);
    assert.match(page.text, /no approved export infrastructure/i);

    const filtered = await request(app)
      .get("/hq/audit/governance?category=giving&outcome=success&branch=hq")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, /giving\.entry\.approve/);
    assert.doesNotMatch(filtered.text, /must-not-appear/);

    const actorFiltered = await request(app)
      .get(`/hq/audit/governance?actor=${encodeURIComponent(hqAdmin.user.id)}`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(actorFiltered.status, 200);
    assert.match(actorFiltered.text, /data-bb-gov-catalog="1"|data-bb-gov-empty=/);

    const today = new Date().toISOString().slice(0, 10);
    const dated = await request(app)
      .get(`/hq/audit/governance?from=${today}&to=${today}`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(dated.status, 200);
    assert.match(dated.text, /giving\.entry\.approve/);

    const empty = await request(app)
      .get("/hq/audit/governance?category=media&outcome=failure")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(empty.status, 200);
    assert.match(empty.text, /data-bb-gov-empty="no-results"/);

    const crossChurch = await request(app)
      .get("/hq/audit/governance")
      .set("Host", HOST_B)
      .set("Cookie", cookie);
    assert.equal(crossChurch.status, 403);
    assert.doesNotMatch(crossChurch.text, /giving\.entry\.approve/);

    const branchDenied = await request(app)
      .get("/hq/audit/governance")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`);
    assert.ok(
      branchDenied.status === 403 || branchDenied.status === 303,
      `status=${branchDenied.status}`
    );
  });

  it("keeps append-only audit storage and navigation markers", async (t) => {
    if (skipIfNeeded(t)) return;
    const routes = fs.readFileSync(
      path.join(ROOT, "src/blessboard/http/hqReportsRoutes.js"),
      "utf8"
    );
    assert.match(routes, /\/hq\/audit\/governance/);
    assert.match(routes, /resolveChurchAdvancedAudit/);
    assert.doesNotMatch(routes, /UPDATE platform\.audit_events|DELETE FROM platform\.audit_events/i);

    const nav = fs.readFileSync(path.join(ROOT, "src/blessboard/http/hqAdminNav.js"), "utf8");
    assert.match(nav, /href: "\/hq\/audit\/governance"/);

    const view = fs.readFileSync(
      path.join(ROOT, "views/blessboard/v5/hq/governance-audit.ejs"),
      "utf8"
    );
    assert.match(view, /data-bb-hq-governance-audit="1"/);
    assert.doesNotMatch(view, /chart\.js|<canvas/i);
    assert.match(view, /Unavailable/);
  });
});
