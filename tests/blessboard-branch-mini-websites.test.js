"use strict";

/**
 * Stage 3 — public branch mini websites (path + tenant-host).
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
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  buildBlessBoardTenantContext,
} = require("../src/blessboard/http/buildBlessBoardTenantContext");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
  createPageSection,
  createLeader,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  saveHomeServiceTimes,
} = require("../src/blessboard/services/homeServiceTimesService");
const {
  loadTenantPublicPageModel,
  KIND,
} = require("../src/blessboard/http/loadTenantPublicPageModel");
const {
  resolvePublicWebsiteBranch,
  STATUS: PUBLIC_BRANCH_STATUS,
} = require("../src/blessboard/services/resolvePublicWebsiteBranch");
const {
  publicChurchHomePath,
  publicBranchHomePath,
  publicBranchPagePath,
  tenantBranchHomePath,
  tenantBranchPagePath,
  buildPublicWebsitePaths,
} = require("../src/blessboard/urls/churchUrlHelper");
const {
  parseTenantBranchPublicPath,
  isTenantPublicBranchPagePath,
} = require("../src/blessboard/http/tenantPublicPaths");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST_A = "mini-a.blessboard.org";
const HOST_B = "mini-b.blessboard.org";
const APEX = "blessboard.org";

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

describe("blessboard branch mini websites (stage 3)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let hqBranchA;
  let campusEast;
  let campusWest;
  let churchB;
  let foreignBranchB;
  let tenantA;
  let inactiveBranch;

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

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "mini-a",
        displayName: "Mini Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "mini-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "mini-b",
        displayName: "Mini Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "mini-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "mini-a",
        churchKey: "mini-a",
        displayName: "Mini Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqBranchA = chA.records.hqBranch;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "mini-b",
        churchKey: "mini-b",
        displayName: "Mini Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      const east = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-east', 'Campus East', 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id]
      );
      campusEast = east.rows[0];

      const west = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-west', 'Campus West', 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id]
      );
      campusWest = west.rows[0];

      const inactive = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-inactive', 'Inactive Campus', 'branch', 'inactive', false, 'UTC', 'ZM')
         RETURNING id, branch_key`,
        [churchA.id]
      );
      inactiveBranch = inactive.rows[0];

      const foreign = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'foreign-only', 'Foreign Only', 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchB.id]
      );
      foreignBranchB = foreign.rows[0];

      tenantA = buildBlessBoardTenantContext({
        organization: { id: orgA.id, key: "mini-a" },
        church: {
          id: churchA.id,
          churchKey: "mini-a",
          displayName: "Mini Church A",
          dataEnvironment: "testing",
        },
        hqBranch: {
          id: hqBranchA.id,
          branchKey: "hq",
          displayName: "HQ A",
        },
        primaryBranch: {
          id: hqBranchA.id,
          branchKey: "hq",
          displayName: "HQ A",
        },
      });

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "Mini Church A",
        websiteStatus: "published",
      });
      await ensureChurchSettingsInitialized(pool, churchB.id);
      await updateChurchSettings(pool, churchB.id, {
        publicName: "Mini Church B",
        websiteStatus: "published",
      });

      const churchPages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
      for (const page of churchPages.pages) {
        await updatePublicPage(pool, page.id, { status: "published" });
      }
      const homeChurch = churchPages.pages.find((p) => p.pageKey === "home");
      await createPageSection(pool, {
        pageId: homeChurch.id,
        sectionKey: "church-hero",
        sectionType: "hero",
        heading: "Church-wide Mini Hero",
        bodyText: "Church scope home copy",
        status: "published",
      });

      const eastPages = await provisionEmptyPublicPages(pool, {
        churchId: churchA.id,
        branchId: campusEast.id,
      });
      const eastHome = eastPages.pages.find((p) => p.pageKey === "home");
      await updatePublicPage(pool, eastHome.id, {
        status: "published",
        title: "East Mini Home",
      });
      await createPageSection(pool, {
        pageId: eastHome.id,
        sectionKey: "east-hero",
        sectionType: "hero",
        heading: "East Campus Mini Hero",
        bodyText: "East branch home copy",
        status: "published",
      });

      const westPages = await provisionEmptyPublicPages(pool, {
        churchId: churchA.id,
        branchId: campusWest.id,
      });
      const westHome = westPages.pages.find((p) => p.pageKey === "home");
      await updatePublicPage(pool, westHome.id, {
        status: "published",
        title: "West Mini Home",
      });
      await createPageSection(pool, {
        pageId: westHome.id,
        sectionKey: "west-hero",
        sectionType: "hero",
        heading: "West Campus Mini Hero",
        bodyText: "West branch home copy",
        status: "published",
      });

      await createLeader(pool, {
        churchId: churchA.id,
        branchId: null,
        displayName: "Church Wide Pastor Mini",
        roleTitle: "Pastor",
        status: "published",
      });
      await createLeader(pool, {
        churchId: churchA.id,
        branchId: hqBranchA.id,
        displayName: "Primary Only Pastor Mini",
        roleTitle: "Pastor",
        status: "published",
      });
      await createLeader(pool, {
        churchId: churchA.id,
        branchId: campusEast.id,
        displayName: "East Campus Pastor Mini",
        roleTitle: "Campus Pastor",
        status: "published",
      });

      await saveHomeServiceTimes(pool, {
        churchId: churchA.id,
        branchId: campusEast.id,
        organizationId: orgA.id,
        actorUserId: null,
        action: "save_publish",
        entries: [
          {
            name: "East Sunday Mini",
            day: "sunday",
            startTime: "09:00",
            endTime: "10:30",
            location: "East Hall",
            sortOrder: 0,
          },
        ],
      });
      await saveHomeServiceTimes(pool, {
        churchId: churchA.id,
        branchId: campusWest.id,
        organizationId: orgA.id,
        actorUserId: null,
        action: "save_publish",
        entries: [
          {
            name: "West Saturday Mini",
            day: "saturday",
            startTime: "18:00",
            endTime: null,
            location: "West Hall",
            sortOrder: 0,
          },
        ],
      });

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set([APEX, "www.blessboard.org"]),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function selectedBranchFrom(row) {
    return {
      id: String(row.id),
      key: String(row.branch_key),
      displayName: String(row.display_name || ""),
      branchType: "branch",
      isPrimary: false,
    };
  }

  it("1. Existing church-wide URL still works", async () => {
    requireDb();
    const pathRes = await request(app).get("/c/mini-a").set("Host", APEX);
    assert.equal(pathRes.status, 200);
    assert.match(pathRes.text, /Church-wide Mini Hero|Mini Church A/);

    const tenantRes = await request(app).get("/").set("Host", HOST_A);
    assert.equal(tenantRes.status, 200);
    assert.match(tenantRes.text, /Church-wide Mini Hero|Mini Church A/);
  });

  it("2. Two branches have distinct public URLs", async () => {
    requireDb();
    const eastPath = publicBranchHomePath("mini-a", "campus-east");
    const westPath = publicBranchHomePath("mini-a", "campus-west");
    assert.equal(eastPath, "/c/mini-a/branches/campus-east");
    assert.equal(westPath, "/c/mini-a/branches/campus-west");
    assert.notEqual(eastPath, westPath);

    const eastRes = await request(app).get(eastPath).set("Host", APEX);
    const westRes = await request(app).get(westPath).set("Host", APEX);
    assert.equal(eastRes.status, 200);
    assert.equal(westRes.status, 200);
    assert.match(eastRes.text, /East Campus Mini Hero/);
    assert.doesNotMatch(eastRes.text, /West Campus Mini Hero/);
    assert.match(westRes.text, /West Campus Mini Hero/);
    assert.doesNotMatch(westRes.text, /East Campus Mini Hero/);
  });

  it("3. Branch route resolves the requested branch", async () => {
    requireDb();
    const resolved = await resolvePublicWebsiteBranch(pool, {
      churchId: churchA.id,
      branchKey: "campus-east",
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.branch.key, "campus-east");
    assert.equal(resolved.branch.id, String(campusEast.id));

    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "home",
      hostname: APEX,
      pathPrefix: "/c/mini-a/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "path",
    });
    assert.equal(model.kind, KIND.OK);
    assert.equal(model.websiteScope.scopeType, "branch");
    assert.equal(model.websiteScope.branchKey, "campus-east");
    assert.equal(model.branch.key, "campus-east");
    assert.equal(model.websiteScope.contentBranchId, String(campusEast.id));
    assert.match(
      (model.sections || []).map((s) => s.heading).join(" "),
      /East Campus Mini Hero/
    );
  });

  it("4. Unknown and foreign branch keys return 404", async () => {
    requireDb();
    const unknown = await request(app)
      .get("/c/mini-a/branches/does-not-exist")
      .set("Host", APEX);
    assert.equal(unknown.status, 404);

    const foreign = await request(app)
      .get(`/c/mini-a/branches/${foreignBranchB.branch_key}`)
      .set("Host", APEX);
    assert.equal(foreign.status, 404);

    const inactive = await request(app)
      .get(`/c/mini-a/branches/${inactiveBranch.branch_key}`)
      .set("Host", APEX);
    assert.equal(inactive.status, 404);

    const tenantUnknown = await request(app)
      .get("/branches/does-not-exist")
      .set("Host", HOST_A);
    assert.equal(tenantUnknown.status, 404);

    const tenantForeign = await request(app)
      .get(`/branches/${foreignBranchB.branch_key}`)
      .set("Host", HOST_A);
    assert.equal(tenantForeign.status, 404);

    const resolvedForeign = await resolvePublicWebsiteBranch(pool, {
      churchId: churchA.id,
      branchKey: foreignBranchB.branch_key,
    });
    assert.equal(resolvedForeign.ok, false);
    assert.equal(resolvedForeign.status, PUBLIC_BRANCH_STATUS.NOT_FOUND);
  });

  it("5. Branch content overrides church-wide content", async () => {
    requireDb();
    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "home",
      hostname: APEX,
      pathPrefix: "/c/mini-a/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "path",
    });
    assert.equal(model.kind, KIND.OK);
    assert.equal(model.page && model.page.contentScope, "branch");
    assert.match(
      (model.sections || []).map((s) => s.heading).join(" "),
      /East Campus Mini Hero/
    );
    assert.doesNotMatch(
      (model.sections || []).map((s) => s.heading).join(" "),
      /Church-wide Mini Hero/
    );

    const lead = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "leadership",
      hostname: APEX,
      pathPrefix: "/c/mini-a/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "path",
    });
    assert.equal(lead.entitiesScope, "branch");
    assert.ok(
      lead.entities.some((e) => e.displayName === "East Campus Pastor Mini")
    );
    assert.ok(
      !lead.entities.some((e) => e.displayName === "Church Wide Pastor Mini")
    );
  });

  it("6. Church-wide fallback works", async () => {
    requireDb();
    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "leadership",
      hostname: APEX,
      pathPrefix: "/c/mini-a/branches/campus-west",
      selectedBranch: selectedBranchFrom(campusWest),
      routingMode: "path",
    });
    assert.equal(model.kind, KIND.OK);
    assert.equal(model.entitiesScope, "church");
    assert.ok(
      model.entities.some((e) => e.displayName === "Church Wide Pastor Mini")
    );
  });

  it("7. No selected-branch page uses primary-branch entities", async () => {
    requireDb();
    const eastLead = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "leadership",
      hostname: APEX,
      pathPrefix: "/c/mini-a/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "path",
    });
    assert.ok(
      !eastLead.entities.some((e) => e.displayName === "Primary Only Pastor Mini")
    );

    const westLead = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "leadership",
      hostname: APEX,
      pathPrefix: "/c/mini-a/branches/campus-west",
      selectedBranch: selectedBranchFrom(campusWest),
      routingMode: "path",
    });
    assert.ok(
      !westLead.entities.some((e) => e.displayName === "Primary Only Pastor Mini")
    );
    assert.ok(
      !westLead.entities.some((e) => e.displayName === "East Campus Pastor Mini")
    );
  });

  it("8. Service times match the selected branch", async () => {
    requireDb();
    const east = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "home",
      hostname: APEX,
      pathPrefix: "/c/mini-a/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "path",
    });
    const west = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "home",
      hostname: APEX,
      pathPrefix: "/c/mini-a/branches/campus-west",
      selectedBranch: selectedBranchFrom(campusWest),
      routingMode: "path",
    });
    assert.ok(
      east.serviceTimesEntries.some((e) => e.name === "East Sunday Mini")
    );
    assert.ok(
      !east.serviceTimesEntries.some((e) => e.name === "West Saturday Mini")
    );
    assert.ok(
      west.serviceTimesEntries.some((e) => e.name === "West Saturday Mini")
    );
    assert.ok(
      !west.serviceTimesEntries.some((e) => e.name === "East Sunday Mini")
    );
  });

  it("9. Canonical URLs are correct", async () => {
    requireDb();
    const pathModel = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "about",
      hostname: APEX,
      pathPrefix: "/c/mini-a/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "path",
    });
    assert.equal(
      pathModel.canonicalUrl,
      "https://blessboard.org/c/mini-a/branches/campus-east/about"
    );
    assert.equal(
      pathModel.publicPaths.about,
      publicBranchPagePath("mini-a", "campus-east", "about")
    );

    const tenantModel = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "about",
      hostname: HOST_A,
      pathPrefix: "/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "tenant",
    });
    assert.equal(
      tenantModel.canonicalUrl,
      `https://${HOST_A}/branches/campus-east/about`
    );
    assert.equal(
      tenantModel.publicPaths.home,
      tenantBranchHomePath("campus-east")
    );
    assert.equal(
      tenantModel.publicPaths.about,
      tenantBranchPagePath("campus-east", "about")
    );

    assert.equal(publicChurchHomePath("mini-a"), "/c/mini-a");
    const churchPaths = buildPublicWebsitePaths({
      organizationKey: "mini-a",
      mode: "path",
    });
    assert.equal(churchPaths.home, "/c/mini-a");
    assert.equal(churchPaths.about, "/c/mini-a/about");
  });

  it("10. Tenant-host and /c/:organizationKey paths behave consistently", async () => {
    requireDb();
    assert.equal(isTenantPublicBranchPagePath("/branches/campus-east"), true);
    assert.equal(
      parseTenantBranchPublicPath("/branches/campus-east/leadership").pageKey,
      "leadership"
    );

    const pathRes = await request(app)
      .get("/c/mini-a/branches/campus-east/leadership")
      .set("Host", APEX);
    const tenantRes = await request(app)
      .get("/branches/campus-east/leadership")
      .set("Host", HOST_A);
    assert.equal(pathRes.status, 200);
    assert.equal(tenantRes.status, 200);
    assert.match(pathRes.text, /East Campus Pastor Mini/);
    assert.match(tenantRes.text, /East Campus Pastor Mini/);
    assert.doesNotMatch(pathRes.text, /Primary Only Pastor Mini/);
    assert.doesNotMatch(tenantRes.text, /Primary Only Pastor Mini/);

    const pathModel = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "leadership",
      hostname: APEX,
      pathPrefix: "/c/mini-a/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "path",
    });
    const tenantModel = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "leadership",
      hostname: HOST_A,
      pathPrefix: "/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "tenant",
    });
    assert.equal(pathModel.websiteScope.contentBranchId, tenantModel.websiteScope.contentBranchId);
    assert.equal(pathModel.websiteScope.branchKey, tenantModel.websiteScope.branchKey);
    assert.deepEqual(
      pathModel.entities.map((e) => e.displayName).sort(),
      tenantModel.entities.map((e) => e.displayName).sort()
    );
  });
});
