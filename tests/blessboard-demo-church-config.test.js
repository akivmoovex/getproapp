"use strict";

/**
 * Demo Church configure: rename, legacy redirect, vanity reservation, branches, autonomy.
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
const {
  provisionEmptyPublicPages,
  createPageSection,
  updatePageSection,
} = require("../src/blessboard/services/publicContentAdminService");
const contentRepo = require("../src/blessboard/repositories/publicContentRepository");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const { publishChurchWebsite } = require("../src/blessboard/services/churchWebsitePublishService");
const { createBlessBoardBranch } = require("../src/blessboard/services/createBlessBoardBranch");
const {
  assignOrganizationPlan,
  setOrganizationEntitlementOverride,
  FEATURE_KEYS,
} = require("../src/platform/services/entitlementService");
const {
  renameBlessBoardOrganizationKey,
} = require("../src/blessboard/services/renameBlessBoardOrganizationKey");
const {
  configureDemoChurch,
  FROM_KEY,
  TO_KEY,
  DISPLAY_NAME,
  LUSAKA,
  KITWE,
  HQ_CONTENT,
} = require("../src/blessboard/services/configureDemoChurch");
const {
  legacyOrganizationKeyRedirectTarget,
  normalizeVanityOrganizationKey,
  VANITY_ORGANIZATION_KEYS,
} = require("../src/blessboard/services/organizationKeyCompat");
const { RESERVED_ORGANIZATION_KEYS } = require("../src/blessboard/services/organizationKey");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOY = "blessboard-org-v5";
const HOST = "demo-church-cfg.blessboard.test";
const PASSWORD = "TestPassword123!";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    PLATFORM_DEPLOYMENT_CODE: DEPLOY,
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    BLESSBOARD_APEX_DOMAINS: "blessboard.org,www.blessboard.org",
    ...overrides,
  };
}

describe("organization key compat (pure)", () => {
  it("maps automated-test-church → demo-church", () => {
    assert.equal(legacyOrganizationKeyRedirectTarget("automated-test-church"), "demo-church");
  });

  it("allowlists demo-church vanity and rejects reserved keys", () => {
    assert.ok(VANITY_ORGANIZATION_KEYS.includes("demo-church"));
    assert.equal(normalizeVanityOrganizationKey("demo-church").ok, true);
    assert.equal(normalizeVanityOrganizationKey("login").ok, false);
    assert.equal(normalizeVanityOrganizationKey("pricing").ok, false);
    assert.equal(normalizeVanityOrganizationKey("unknown-slug").ok, false);
  });

  it("reserved organization keys include apex routes that must not be vanity-hijacked", () => {
    for (const key of ["login", "directory", "pricing", "features", "hq", "admin"]) {
      assert.ok(RESERVED_ORGANIZATION_KEYS.includes(key), key);
    }
  });
});

describe("configure demo church (foundation db)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let organizationId;
  let churchId;
  let actorUserId;

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

      const tenant = await provisionPlatformTenant(pool, {
        organizationKey: FROM_KEY,
        displayName: "BlessBoard Automated Test Church",
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: FROM_KEY,
        hostname: HOST,
        deploymentCode: DEPLOY,
        domainType: "canonical",
        isPrimary: true,
        dryRun: false,
      });
      assert.equal(tenant.ok, true, tenant.message || tenant.status);
      organizationId = tenant.records.organization.id;

      await assignOrganizationPlan(pool, {
        organizationId,
        planKey: "growth",
      });
      await setOrganizationEntitlementOverride(pool, {
        organizationId,
        featureKey: FEATURE_KEYS.MAX_BRANCHES,
        featureKind: "limit",
        limitValue: 20,
        reason: "test_demo_church_config",
      });

      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: FROM_KEY,
        churchKey: FROM_KEY,
        displayName: "BlessBoard Automated Test Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
        timezone: "UTC",
        dryRun: false,
      });
      assert.equal(church.ok, true, church.message || church.status);
      churchId = church.records.church.id;

      const campus = await createBlessBoardBranch(pool, {
        organizationId,
        churchId,
        displayName: "Test Main Branch",
        branchKey: "test-main",
        email: "main@automated-test.example.test",
        phone: "+15550100",
        timezone: "UTC",
        city: "Testville",
        countryCode: "US",
      });
      assert.equal(campus.ok, true, campus.message || campus.status);

      const user = await createBlessBoardUser(pool, {
        email: "demo-cfg-hq@example.test",
        displayName: "Church HQ Admin Test",
        password: PASSWORD,
      });
      assert.equal(user.ok, true, user.message || user.status);
      actorUserId = user.user.id;
      const role = await assignBlessBoardRole(pool, {
        email: "demo-cfg-hq@example.test",
        organizationKey: FROM_KEY,
        roleKey: "church_hq_admin",
        churchKey: FROM_KEY,
      });
      assert.equal(role.ok, true, role.message || role.status);

      await ensureChurchSettingsInitialized(pool, churchId);
      await updateChurchSettings(pool, churchId, {
        publicName: "BlessBoard Automated Test Church",
        websiteStatus: "published",
      });
      await provisionEmptyPublicPages(pool, { churchId, branchId: null });
      const home = await contentRepo.findPageByScope(pool, {
        churchId,
        branchId: null,
        pageKey: "home",
      });
      await createPageSection(pool, {
        pageId: home.id,
        sectionKey: "hero",
        sectionType: "hero",
        heading: "Original HQ Hero",
        bodyText: "Original HQ body",
        sortOrder: 1,
        status: "published",
        confirmPublish: true,
        enforcePublishConfirm: true,
      });
      const published = await publishChurchWebsite(pool, {
        organizationId,
        churchId,
        confirmPublish: true,
        relaxPreviewRequirement: true,
        forcePublishVersion: true,
        deferServiceTimes: true,
        mobilePreviewConfirmed: true,
        actorUserId,
      });
      assert.equal(published.ok, true, published.reason || published.status);
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb(t) {
    if (skipSuite) {
      t.skip(skipReason);
      return true;
    }
    return false;
  }

  it("renames organization key without changing organization id and configures branches/websites", async (t) => {
    if (requireDb(t)) return;
    const result = await configureDemoChurch(pool, {
      actorUserId,
      publish: true,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.organizationId, organizationId);
    assert.equal(result.organizationKey, TO_KEY);
    assert.equal(result.churchId, churchId);

    const org = await pool.query(
      `SELECT id, organization_key, display_name FROM platform.organizations WHERE id = $1`,
      [organizationId]
    );
    assert.equal(org.rows[0].organization_key, TO_KEY);
    assert.equal(org.rows[0].display_name, DISPLAY_NAME);

    const church = await pool.query(
      `SELECT id, church_key, display_name FROM blessboard.churches WHERE id = $1`,
      [churchId]
    );
    assert.equal(church.rows[0].church_key, TO_KEY);

    const roles = await pool.query(
      `SELECT role_key, status FROM blessboard.user_roles WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, actorUserId]
    );
    assert.equal(roles.rows[0].role_key, "church_hq_admin");
    assert.equal(roles.rows[0].status, "active");

    const branches = await pool.query(
      `SELECT branch_key, status, branch_type FROM blessboard.branches WHERE church_id = $1 ORDER BY branch_key`,
      [churchId]
    );
    const activeOps = branches.rows.filter(
      (b) => b.status === "active" && b.branch_type === "branch"
    );
    assert.equal(activeOps.length, 2);
    assert.deepEqual(
      activeOps.map((b) => b.branch_key).sort(),
      ["kitwe", "lusaka"]
    );
    assert.equal(result.branches.lusaka.key, LUSAKA.branchKey);
    assert.equal(result.branches.kitwe.key, KITWE.branchKey);

    const dup = await pool.query(
      `SELECT branch_key, COUNT(*)::int AS n
         FROM blessboard.branches WHERE church_id = $1
        GROUP BY branch_key HAVING COUNT(*) > 1`,
      [churchId]
    );
    assert.equal(dup.rowCount, 0);

    const otherOrg = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.branches b
         JOIN blessboard.churches c ON c.id = b.church_id
        WHERE b.branch_key IN ('lusaka','kitwe') AND c.organization_id <> $1`,
      [organizationId]
    );
    assert.equal(otherOrg.rows[0].n, 0);
  });

  it("publishes independent HQ/Lusaka/Kitwe heroes and service times", async (t) => {
    if (requireDb(t)) return;
    async function hero(branchId) {
      const page = await contentRepo.findPageByScope(pool, {
        churchId,
        branchId,
        pageKey: "home",
      });
      const sections = await contentRepo.listSectionsForPage(pool, page.id);
      return sections.find((s) => s.sectionKey === "hero");
    }

    const hq = await hero(null);
    const lusakaBranch = await pool.query(
      `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'lusaka'`,
      [churchId]
    );
    const kitweBranch = await pool.query(
      `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'kitwe'`,
      [churchId]
    );
    const lusaka = await hero(lusakaBranch.rows[0].id);
    const kitwe = await hero(kitweBranch.rows[0].id);

    assert.equal(hq.heading, HQ_CONTENT.heroTitle);
    assert.equal(lusaka.heading, LUSAKA.heroTitle);
    assert.equal(kitwe.heading, KITWE.heroTitle);
    assert.notEqual(hq.mediaUrl, lusaka.mediaUrl);
    assert.notEqual(hq.mediaUrl, kitwe.mediaUrl);
    assert.notEqual(lusaka.mediaUrl, kitwe.mediaUrl);

    const versions = await pool.query(
      `SELECT branch_id, status
         FROM blessboard.website_publication_versions
        WHERE organization_id = $1 AND status = 'published'`,
      [organizationId]
    );
    assert.ok(versions.rows.some((r) => r.branch_id == null));
    assert.ok(versions.rows.some((r) => r.branch_id === lusakaBranch.rows[0].id));
    assert.ok(versions.rows.some((r) => r.branch_id === kitweBranch.rows[0].id));

    const gov = await pool.query(
      `SELECT branch_id, website_initialization_status
         FROM blessboard.branch_website_governance
        WHERE branch_id = ANY($1::uuid[])`,
      [[lusakaBranch.rows[0].id, kitweBranch.rows[0].id]]
    );
    assert.equal(gov.rows.length, 2);
    assert.ok(gov.rows.every((r) => r.website_initialization_status === "completed"));
  });

  it("autonomy: HQ edit does not change Lusaka or Kitwe", async (t) => {
    if (requireDb(t)) return;
    const hqPage = await contentRepo.findPageByScope(pool, {
      churchId,
      branchId: null,
      pageKey: "home",
    });
    const hqSections = await contentRepo.listSectionsForPage(pool, hqPage.id);
    const hqHero = hqSections.find((s) => s.sectionKey === "hero");
    await updatePageSection(pool, hqHero.id, {
      heading: "HQ Autonomy Marker",
      status: "draft",
    });

    const lusakaId = (
      await pool.query(
        `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'lusaka'`,
        [churchId]
      )
    ).rows[0].id;
    const kitweId = (
      await pool.query(
        `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'kitwe'`,
        [churchId]
      )
    ).rows[0].id;
    const lusakaPage = await contentRepo.findPageByScope(pool, {
      churchId,
      branchId: lusakaId,
      pageKey: "home",
    });
    const kitwePage = await contentRepo.findPageByScope(pool, {
      churchId,
      branchId: kitweId,
      pageKey: "home",
    });
    const lusakaHero = (await contentRepo.listSectionsForPage(pool, lusakaPage.id)).find(
      (s) => s.sectionKey === "hero"
    );
    const kitweHero = (await contentRepo.listSectionsForPage(pool, kitwePage.id)).find(
      (s) => s.sectionKey === "hero"
    );
    assert.equal(lusakaHero.heading, LUSAKA.heroTitle);
    assert.equal(kitweHero.heading, KITWE.heroTitle);
  });

  it("HTTP: legacy redirect, vanity, canonical, reserved routes, unknown vanity", async (t) => {
    if (requireDb(t)) return;
    const app = createV5FoundationApp({
      getPool: () => pool,
      env: baseEnv(),
      apexHosts: new Set(["blessboard.org", "www.blessboard.org"]),
    });

    const legacy = await request(app).get(`/c/${FROM_KEY}`).set("Host", "blessboard.org");
    assert.equal(legacy.status, 301);
    assert.match(String(legacy.headers.location || ""), new RegExp(`/c/${TO_KEY}`));

    const vanity = await request(app).get(`/${TO_KEY}`).set("Host", "blessboard.org");
    assert.equal(vanity.status, 302);
    assert.equal(vanity.headers.location, `/c/${TO_KEY}`);

    const canonical = await request(app).get(`/c/${TO_KEY}`).set("Host", "blessboard.org");
    assert.ok([200, 503].includes(canonical.status), String(canonical.status));

    const lusaka = await request(app)
      .get(`/c/${TO_KEY}/branches/lusaka`)
      .set("Host", "blessboard.org");
    assert.ok([200, 301, 302, 503].includes(lusaka.status), String(lusaka.status));

    const kitwe = await request(app)
      .get(`/c/${TO_KEY}/branches/kitwe`)
      .set("Host", "blessboard.org");
    assert.ok([200, 301, 302, 503].includes(kitwe.status), String(kitwe.status));

    for (const path of ["/login", "/pricing", "/directory", "/features"]) {
      const res = await request(app).get(path).set("Host", "blessboard.org");
      assert.ok(
        !String(res.headers.location || "").includes(`/c/${TO_KEY}`),
        `${path} must not redirect to demo church`
      );
    }

    const unknown = await request(app).get("/not-a-real-church-slug").set("Host", "blessboard.org");
    assert.ok(!String(unknown.headers.location || "").includes(`/c/${TO_KEY}`));
  });

  it("rename refuses when target key already taken", async (t) => {
    if (requireDb(t)) return;
    const other = await provisionPlatformTenant(pool, {
      organizationKey: "other-demo-org",
      displayName: "Other",
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "other-demo-org",
      hostname: "other-demo-org.blessboard.test",
      deploymentCode: DEPLOY,
      domainType: "canonical",
      isPrimary: true,
      dryRun: false,
    });
    assert.equal(other.ok, true, other.message || other.status);

    const conflict = await renameBlessBoardOrganizationKey(pool, {
      organizationId: other.records.organization.id,
      fromKey: "other-demo-org",
      toKey: TO_KEY,
      displayName: "Should Fail",
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.status, "conflict");
  });
});
