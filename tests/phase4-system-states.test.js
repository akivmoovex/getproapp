"use strict";

/**
 * Phase4 Stage 8A — shared empty / error / restricted system states.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

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
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const wcsSvc = require("../src/blessboard/services/websiteChangeSubmissionService");
const versionSvc = require("../src/blessboard/services/websitePublicationVersionService");
const {
  buildChangeRequestsEmptyState,
  buildVersionHistoryErrorState,
  buildVersionHistoryEmptyState,
  buildNetworkGovernanceRestrictedState,
  retryHrefFromRequest,
  STATE_TYPES,
} = require("../src/blessboard/http/websiteSystemStateHttp");
const { renderV5Ejs } = require("../src/blessboard/http/v5EjsTemplateCache");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const HOST_A = "p8a-net.blessboard.org";
const HOST_B = "p8a-growth.blessboard.org";
const HOST_F = "p8a-found.blessboard.org";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

function sidCookie(rawToken) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}`;
}

describe("phase4 stage 8A system states", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgNet;
  let orgGrowth;
  let orgFound;
  let hqNet;
  let hqGrowth;
  let hqFound;
  let branchNet;
  let originalLoadSubmissions;
  let originalLoadVersions;

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
          displayName: `P8A ${key}`,
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: host,
          domainType: "canonical",
          deploymentCode: "blessboard-org-v5",
          isPrimary: true,
        });
        assert.equal(prov.ok, true, prov.message);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: key,
          churchKey: key,
          displayName: `P8A Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        const org = prov.records.organization;
        const church = ch.records.church;
        await ensureChurchSettingsInitialized(pool, church.id);
        await updateChurchSettings(pool, church.id, {
          publicName: `P8A Church ${key}`,
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
          deploymentCode: "blessboard-org-v5",
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

      orgNet = await provision("p8a-net", HOST_A, "professional");
      orgGrowth = await provision("p8a-growth", HOST_B, "growth");
      orgFound = await provision("p8a-found", HOST_F, "free");
      hqNet = orgNet;
      hqGrowth = orgGrowth;
      hqFound = orgFound;

      const br = await createBlessBoardUser(pool, {
        email: "p8a-br@example.test",
        displayName: "Branch P8A",
        password: PASSWORD,
      });
      assert.equal(br.ok, true);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "p8a-br@example.test",
            organizationKey: "p8a-net",
            roleKey: "branch_admin",
            churchKey: "p8a-net",
            branchKey: "hq",
          })
        ).ok,
        true
      );
      const brSession = await createV5Session(pool, {
        deploymentCode: "blessboard-org-v5",
        userId: br.user.id,
        organizationId: orgNet.org.id,
      });
      assert.equal(brSession.ok, true);
      branchNet = { user: br.user, rawToken: brSession.rawToken };

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set(["blessboard.org", "www.blessboard.org"]),
      });

      originalLoadSubmissions = wcsSvc.loadSubmissionsList;
      originalLoadVersions = versionSvc.loadVersionHistory;
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (originalLoadSubmissions) wcsSvc.loadSubmissionsList = originalLoadSubmissions;
    if (originalLoadVersions) versionSvc.loadVersionHistory = originalLoadVersions;
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function authedGet(host, pathName, rawToken) {
    const res = await request(app)
      .get(pathName)
      .set("Host", host)
      .set("Cookie", sidCookie(rawToken))
      .set("Accept", "text/html");
    return res;
  }

  it("1 builders distinguish empty, error, restricted, and role actions", () => {
    const hqEmpty = buildChangeRequestsEmptyState({ viewerRole: "hq" });
    assert.equal(hqEmpty.type, STATE_TYPES.EMPTY);
    assert.match(hqEmpty.heading, /All caught up/i);
    assert.match(hqEmpty.primaryAction.label, /Request History/i);
    assert.doesNotMatch(hqEmpty.primaryAction.label, /Submit/i);

    const branchEmpty = buildChangeRequestsEmptyState({
      viewerRole: "branch",
      submitPath: "/branch-admin/website/submissions/new",
    });
    assert.match(branchEmpty.primaryAction.label, /Submit an update/i);

    const err = buildVersionHistoryErrorState({
      retryHref: "/hq/website/version-history?status=live",
    });
    assert.equal(err.type, STATE_TYPES.ERROR);
    assert.match(err.primaryAction.href, /status=live/);
    assert.doesNotMatch(err.body, /SQL|stack|VH_SYNC|entitlement/i);

    const emptyHist = buildVersionHistoryEmptyState();
    assert.equal(emptyHist.type, STATE_TYPES.EMPTY);
    assert.notEqual(emptyHist.heading, err.heading);

    const restricted = buildNetworkGovernanceRestrictedState();
    assert.equal(restricted.type, STATE_TYPES.RESTRICTED);
    assert.doesNotMatch(restricted.body + restricted.hint, /upgrade|buy a plan grants/i);
    assert.match(restricted.hint, /does not grant a role/i);

    assert.equal(
      retryHrefFromRequest(
        { originalUrl: "/hq/website/version-history?theme=a", url: "/?theme=a" },
        "/hq/website/version-history"
      ),
      "/hq/website/version-history?theme=a"
    );
  });

  it("2 system-state partial renders without JavaScript", () => {
    const partialPath = path.join(
      __dirname,
      "../views/blessboard/v5/partials/phase4-system-state.ejs"
    );
    const src = fs.readFileSync(partialPath, "utf8");
    assert.doesNotMatch(src, /<script/i);
    const html = renderV5Ejs("partials/phase4-system-state.ejs", {
      systemState: buildVersionHistoryErrorState(),
    });
    assert.match(html, /data-bb-phase4-system-state="1"/);
    assert.match(html, /Something went wrong/);
    assert.match(html, /Try Again/);
    assert.doesNotMatch(html, /VH_SYNC_FAILED|SELECT |stack trace/i);
    assert.doesNotMatch(html, /<script/i);
  });


  it("3 successful zero-result change requests renders empty state", async () => {
    skipIfNeeded();
    const res = await authedGet(
      HOST_B,
      "/hq/website/change-submissions",
      hqGrowth.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-system-state-type="empty"/);
    assert.match(res.text, /All caught up!/);
    assert.match(res.text, /data-bb-phase3-wcs-empty="1"/);
    assert.match(res.text, /View Request History/);
    assert.doesNotMatch(res.text, /Submit an update/i);
    assert.match(res.text, /data-bb-phase4-system-state-mobile="1"/);
  });

  it("4 failed change-request query does not render empty state", async () => {
    skipIfNeeded();
    wcsSvc.loadSubmissionsList = async () => ({
      ok: false,
      status: wcsSvc.STATUS.LOOKUP_ERROR,
    });
    try {
      const res = await authedGet(
        HOST_B,
        "/hq/website/change-submissions",
        hqGrowth.rawToken
      );
      assert.equal(res.status, 503);
      assert.match(res.text, /data-bb-phase4-system-state-type="error"/);
      assert.doesNotMatch(res.text, /data-bb-phase4-system-state-type="empty"/);
      assert.doesNotMatch(res.text, /All caught up!/);
      assert.doesNotMatch(res.text, /SELECT |ECONNREFUSED|lookup_error/i);
    } finally {
      wcsSvc.loadSubmissionsList = originalLoadSubmissions;
    }
  });

  it("5 version-history failure renders error state with retry context", async () => {
    skipIfNeeded();
    versionSvc.loadVersionHistory = async () => ({
      ok: false,
      status: versionSvc.STATUS.LOOKUP_ERROR,
    });
    try {
      const res = await authedGet(
        HOST_A,
        "/hq/website/network-version-history?theme=classic",
        hqNet.rawToken
      );
      assert.equal(res.status, 503);
      assert.match(res.text, /data-bb-phase4-system-state-type="error"/);
      assert.match(res.text, /Something went wrong/);
      assert.match(res.text, /Try Again/);
      assert.match(res.text, /href="\/hq\/website\/network-version-history\?theme=classic"/);
      assert.doesNotMatch(res.text, /data-bb-phase4-nwvh-empty="1"/);
      assert.doesNotMatch(res.text, /VH_SYNC_FAILED|stack|SQLSTATE/i);
    } finally {
      versionSvc.loadVersionHistory = originalLoadVersions;
    }
  });

  it("6 version-history empty result remains distinct from failure", async () => {
    skipIfNeeded();
    const res = await authedGet(
      HOST_A,
      "/hq/website/network-version-history",
      hqNet.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-system-state-type="empty"/);
    assert.match(res.text, /No website versions yet|No publication versions/);
    assert.doesNotMatch(res.text, /Something went wrong/);
    assert.doesNotMatch(res.text, /data-bb-phase4-system-state-type="error"/);
  });

  it("7 unauthorized role gets restricted state, not plan upgrade", async () => {
    skipIfNeeded();
    const res = await authedGet(HOST_A, "/hq/website/advanced", branchNet.rawToken);
    assert.equal(res.status, 403);
    assert.match(res.text, /data-bb-phase4-system-state-type="restricted"/);
    assert.match(res.text, /Access Restricted/);
    assert.doesNotMatch(res.text, /data-bb-phase4-advanced-website-feature-locked="1"/);
    assert.doesNotMatch(res.text, /Upgrade|Unlock Network|Choose a plan/i);
  });

  it("8 missing Network entitlement receives locked state", async () => {
    skipIfNeeded();
    const res = await authedGet(
      HOST_B,
      "/hq/website/advanced",
      hqGrowth.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-advanced-website-feature-locked="1"/);
    assert.doesNotMatch(res.text, /data-bb-phase4-system-state-type="restricted"/);
  });

  it("9 cross-tenant access remains denied without resource leak", async () => {
    skipIfNeeded();
    const res = await authedGet(
      HOST_A,
      "/hq/website/advanced",
      hqFound.rawToken
    );
    assert.ok(res.status === 403 || res.status === 404);
    assert.doesNotMatch(res.text, /data-bb-phase4-advanced-website-management="1"/);
    assert.doesNotMatch(res.text, /p8a-net|SYSTEM_REF|organizationId/i);
  });

  it("10 foundation missing entitlement is locked not restricted role copy", async () => {
    skipIfNeeded();
    const res = await authedGet(HOST_F, "/hq/website/advanced", hqFound.rawToken);
    assert.equal(res.status, 200);
    assert.match(res.text, /feature-locked="1"/);
    assert.doesNotMatch(res.text, /Branch-level administrative access does not permit/i);
  });

  it("11 desktop and mobile share the same empty-state model markers", async () => {
    skipIfNeeded();
    const res = await authedGet(
      HOST_B,
      "/hq/website/change-submissions",
      hqGrowth.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-system-state-mobile="1"/);
    assert.match(res.text, /bb-hq-phase4-sys--empty/);
    assert.match(
      fs.readFileSync(
        path.join(__dirname, "../public/blessboard/v5/hq-admin.css"),
        "utf8"
      ),
      /\.bb-hq-phase4-sys__actions[\s\S]*flex-direction:\s*column/
    );
  });
});
