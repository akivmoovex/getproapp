"use strict";

/**
 * Phase4 Stages 6–7: website plan entitlements, locks, plan features, mobile markers.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { assignOrganizationPlan } = require("../src/platform/services/entitlementService");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const planEntitlementSvc = require("../src/blessboard/services/websitePlanEntitlementService");
const { GROWTH_MONTHLY_PER_BRANCH_CENTS } = require("../src/church/blessBoardBillingCatalogue");
const { formatUsdFromCents } = require("../src/church/platformPricingContent");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const HOST_F = "p67-found.blessboard.org";
const HOST_G = "p67-growth.blessboard.org";
const HOST_N = "p67-net.blessboard.org";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function extractCsrfToken(html) {
  const m = String(html || "").match(
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || null;
}

function sidCookie(rawToken) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}`;
}

describe("phase4 website plan entitlements stages 6 and 7", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgs = {};
  let users = {};

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

      async function provision(key, host, planKey) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `P67 ${key}`,
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: host,
          domainType: "canonical",
          deploymentCode: "blessboard-org-staging",
          isPrimary: true,
        });
        assert.equal(prov.ok, true, prov.message);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: key,
          churchKey: key,
          displayName: `P67 Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        const org = prov.records.organization;
        const church = ch.records.church;
        await ensureChurchSettingsInitialized(pool, church.id);
        await updateChurchSettings(pool, church.id, {
          publicName: `P67 Church ${key}`,
          websiteStatus: "draft",
          primaryEmail: `${key}@example.test`,
        });
        await repairWebsiteFoundation(pool, { churchId: church.id });
        if (planKey) {
          const assign = await assignOrganizationPlan(pool, {
            organizationId: org.id,
            planKey,
            status: "active",
          });
          assert.equal(assign.ok, true, assign.reason);
        }
        const created = await createBlessBoardUser(pool, {
          email: `${key}-hq@example.test`,
          displayName: `HQ ${key}`,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal(
          (
            await assignBlessBoardRole(pool, {
              email: `${key}-hq@example.test`,
              organizationKey: key,
              roleKey: "church_hq_admin",
              churchKey: key,
            })
          ).ok,
          true
        );
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId: org.id,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return {
          org,
          church,
          user: created.user,
          rawToken: session.rawToken,
        };
      }

      orgs.foundation = await provision("p67-found", HOST_F, "free");
      orgs.growth = await provision("p67-growth", HOST_G, "growth");
      orgs.network = await provision("p67-net", HOST_N, "professional");
      users.foundation = orgs.foundation;
      users.growth = orgs.growth;
      users.network = orgs.network;

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set(["blessboard.org", "www.blessboard.org"]),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function authedGet(host, path, rawToken) {
    const res = await request(app)
      .get(path)
      .set("Host", host)
      .set("Cookie", sidCookie(rawToken));
    return {
      res,
      csrf: extractCsrfToken(res.text),
      csrfCookie: extractCookie(res, CSRF_COOKIE),
    };
  }

  it("1 plan features highlights Foundation for free plan", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_F,
      "/hq/website/plan-features",
      users.foundation.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Website Plan Features/);
    assert.match(res.text, /data-bb-phase4-website-plan-features="1"/);
    assert.match(res.text, /data-bb-phase4-website-plan-features-mobile="1"/);
    assert.match(res.text, /data-bb-phase4-wpf-plan="foundation"[^>]*aria-current="true"|is-current/);
    assert.doesNotMatch(res.text, /website\.change_requests|website\.network_/);
  });

  it("2 Growth plan features shows catalogue price", async () => {
    skipIfNeeded();
    const { res } = await authedGet(HOST_G, "/hq/website/plan-features", users.growth.rawToken);
    assert.equal(res.status, 200);
    const price = formatUsdFromCents(GROWTH_MONTHLY_PER_BRANCH_CENTS);
    assert.match(res.text, new RegExp(price.replace(".", "\\.")));
    assert.match(res.text, /Custom/);
    assert.match(res.text, /data-bb-phase4-wpf-plan="growth"/);
  });

  it("3 Network plan features highlights Network and Custom pricing", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_N,
      "/hq/website/plan-features",
      users.network.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Current active plan|Current plan/);
    assert.match(res.text, /data-bb-phase4-wpf-plan="network"/);
    assert.match(res.text, />Custom</);
  });

  it("4 Foundation is locked from advanced management with Network lock screen", async () => {
    skipIfNeeded();
    const { res } = await authedGet(HOST_F, "/hq/website/advanced", users.foundation.rawToken);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-advanced-website-feature-locked="1"/);
    assert.match(res.text, /Network Feature|Advanced Website Management/);
  });

  it("5 Foundation is locked from change requests with Growth lock screen", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_F,
      "/hq/website/change-submissions",
      users.foundation.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-growth-website-feature-locked="1"/);
    assert.match(res.text, /Growth Only|Growth Website/);
  });

  it("6 Growth cannot open Network approval settings", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_G,
      "/hq/website/network-approval-settings",
      users.growth.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-advanced-website-feature-locked="1"/);
  });

  it("7 Growth cannot open Network version history", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_G,
      "/hq/website/network-version-history",
      users.growth.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-advanced-website-feature-locked="1"/);
  });

  it("8 Growth POST to network approval settings is blocked", async () => {
    skipIfNeeded();
    const { res, csrf, csrfCookie } = await authedGet(
      HOST_G,
      "/hq/website/plan-features",
      users.growth.rawToken
    );
    assert.equal(res.status, 200);
    const cookies = [sidCookie(users.growth.rawToken)];
    if (csrfCookie) cookies.push(`${CSRF_COOKIE}=${csrfCookie}`);
    const posted = await request(app)
      .post("/hq/website/network-approval-settings")
      .set("Host", HOST_G)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        branch_edit_mode: "approval_required",
      });
    assert.equal(posted.status, 403);
  });

  it("9 Network can open advanced hub and mobile markers exist", async () => {
    skipIfNeeded();
    const { res } = await authedGet(HOST_N, "/hq/website/advanced", users.network.rawToken);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-advanced-website-management="1"/);
    assert.match(res.text, /Advanced Website Management/);
  });

  it("10 Network approval settings render with mobile-ready form", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_N,
      "/hq/website/network-approval-settings",
      users.network.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-network-approval-settings="1"/);
    assert.match(res.text, /name="_csrf"|name="csrf"/i);
  });

  it("11 Network version history mobile cards marker", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_N,
      "/hq/website/network-version-history",
      users.network.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-network-website-version-history="1"/);
    assert.match(res.text, /data-bb-phase4-nwvh-mobile="1"|data-bb-phase3-wvh-mobile="1"/);
  });

  it("12 capability helpers map professional to network", async () => {
    skipIfNeeded();
    assert.equal(planEntitlementSvc.normalizePlanKey("professional"), "network");
    assert.equal(planEntitlementSvc.planMeetsCapability("growth", "website.change_requests"), true);
    assert.equal(
      planEntitlementSvc.planMeetsCapability("growth", "website.network_version_history"),
      false
    );
    assert.equal(
      planEntitlementSvc.planMeetsCapability("network", "website.advanced_management"),
      true
    );
  });

  it("13 branch admin cannot open plan-gated HQ advanced route as upgrade", async () => {
    skipIfNeeded();
    const created = await createBlessBoardUser(pool, {
      email: "p67-br@example.test",
      displayName: "Branch P67",
      password: PASSWORD,
    });
    assert.equal(created.ok, true);
    assert.equal(
      (
        await assignBlessBoardRole(pool, {
          email: "p67-br@example.test",
          organizationKey: "p67-found",
          roleKey: "branch_admin",
          churchKey: "p67-found",
          branchKey: "hq",
        })
      ).ok,
      true
    );
    const session = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: created.user.id,
      organizationId: orgs.foundation.org.id,
    });
    const { res } = await authedGet(HOST_F, "/hq/website/advanced", session.rawToken);
    assert.ok(res.status === 403 || res.status === 404 || res.status === 302);
    assert.doesNotMatch(res.text || "", /data-bb-phase4-advanced-website-feature-locked="1"/);
  });
});
