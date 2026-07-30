"use strict";

/**
 * Stage 5 — branch mini website pages: inheritance, isolation, editors, publish.
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
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  buildBlessBoardTenantContext,
} = require("../src/blessboard/http/buildBlessBoardTenantContext");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
  updateBranchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
  createPageSection,
  createEvent,
  createSermon,
  createGivingMethod,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  loadTenantPublicPageModel,
  KIND,
} = require("../src/blessboard/http/loadTenantPublicPageModel");
const {
  getBranchPageInheritanceState,
  createBranchPageOverride,
  removeBranchPageOverride,
  INHERITANCE_MODE,
} = require("../src/blessboard/services/websiteBranchPageInheritanceService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "stage5-a.blessboard.org";
const HOST_B = "stage5-b.blessboard.org";
const APEX = "blessboard.org";

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

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

describe("blessboard branch mini website pages (stage 5)", () => {
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
  let tenantA;
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

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "stage5-a",
        displayName: "Stage5 Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "stage5-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "stage5-b",
        displayName: "Stage5 Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "stage5-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "stage5-a",
        churchKey: "stage5-a",
        displayName: "Stage5 Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqBranchA = chA.records.hqBranch;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "stage5-b",
        churchKey: "stage5-b",
        displayName: "Stage5 Church B",
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

      tenantA = buildBlessBoardTenantContext({
        organization: { id: orgA.id, key: "stage5-a" },
        church: {
          id: churchA.id,
          churchKey: "stage5-a",
          displayName: "Stage5 Church A",
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

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const orgId =
          role.organizationKey === "stage5-a"
            ? orgA.id
            : provB.records.organization.id;
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser("hq-stage5@example.test", "HQ A", {
        email: "hq-stage5@example.test",
        organizationKey: "stage5-a",
        roleKey: "church_hq_admin",
        churchKey: "stage5-a",
      });
      users.eastAdmin = await makeUser("east-stage5@example.test", "East Admin", {
        email: "east-stage5@example.test",
        organizationKey: "stage5-a",
        roleKey: "branch_admin",
        churchKey: "stage5-a",
        branchKey: "campus-east",
      });
      users.westAdmin = await makeUser("west-stage5@example.test", "West Admin", {
        email: "west-stage5@example.test",
        organizationKey: "stage5-a",
        roleKey: "branch_admin",
        churchKey: "stage5-a",
        branchKey: "campus-west",
      });
      users.hqB = await makeUser("hq-b-stage5@example.test", "HQ B", {
        email: "hq-b-stage5@example.test",
        organizationKey: "stage5-b",
        roleKey: "church_hq_admin",
        churchKey: "stage5-b",
      });

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "Stage5 Church A",
        websiteStatus: "published",
        primaryEmail: "church@stage5-a.test",
        primaryPhone: "+260211000001",
      });
      await updateBranchSettings(pool, campusEast.id, {
        publicName: "Campus East",
        phone: "+260211000111",
        email: "east@stage5-a.test",
        addressLine1: "11 East Road",
        city: "Lusaka",
        countryCode: "ZM",
      });
      await updateBranchSettings(pool, campusWest.id, {
        publicName: "Campus West",
        phone: "+260211000222",
        email: "west@stage5-a.test",
        addressLine1: "22 West Road",
        city: "Lusaka",
        countryCode: "ZM",
      });

      const churchPages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
      for (const page of churchPages.pages) {
        await updatePublicPage(pool, page.id, { status: "published" });
      }
      const aboutChurch = churchPages.pages.find((p) => p.pageKey === "about");
      await createPageSection(pool, {
        pageId: aboutChurch.id,
        sectionKey: "about-hero",
        sectionType: "hero",
        heading: "Church-wide About Hero Stage5",
        bodyText: "Church about body",
        status: "published",
      });
      const homeChurch = churchPages.pages.find((p) => p.pageKey === "home");
      await createPageSection(pool, {
        pageId: homeChurch.id,
        sectionKey: "home-hero",
        sectionType: "hero",
        heading: "Church-wide Home Hero Stage5",
        bodyText: "Church home body",
        status: "published",
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

  async function authedGet(url, host, user) {
    const res = await request(app)
      .get(url)
      .set("Host", host)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${user.rawToken}`);
    const csrf = extractCookie(res, CSRF_COOKIE);
    return { res, csrf };
  }

  async function authedPost(url, host, user, csrf, fields) {
    return request(app)
      .post(url)
      .set("Host", host)
      .set(
        "Cookie",
        `${DEFAULT_V5_COOKIE}=${user.rawToken}; ${CSRF_COOKIE}=${csrf}`
      )
      .type("form")
      .send({ [CSRF_FIELD]: csrf, ...fields });
  }

  it("1. Branch homepage override", async () => {
    requireDb();
    const eastPages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
    });
    const eastHome = eastPages.pages.find((p) => p.pageKey === "home");
    await updatePublicPage(pool, eastHome.id, {
      status: "published",
      title: "East Home Override",
    });
    await createPageSection(pool, {
      pageId: eastHome.id,
      sectionKey: "east-home-hero",
      sectionType: "hero",
      heading: "East Branch Home Hero Stage5",
      bodyText: "East only",
      status: "published",
    });

    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "home",
      hostname: APEX,
      pathPrefix: "/c/stage5-a/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "path",
    });
    assert.equal(model.kind, KIND.OK);
    assert.equal(model.page.contentScope, "branch");
    assert.match(
      (model.sections || []).map((s) => s.heading).join(" "),
      /East Branch Home Hero Stage5/
    );
    assert.doesNotMatch(
      (model.sections || []).map((s) => s.heading).join(" "),
      /Church-wide Home Hero Stage5/
    );
  });

  it("2. Church-wide About inheritance", async () => {
    requireDb();
    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "about",
      hostname: APEX,
      pathPrefix: "/c/stage5-a/branches/campus-west",
      selectedBranch: selectedBranchFrom(campusWest),
      routingMode: "path",
    });
    assert.equal(model.kind, KIND.OK);
    assert.equal(model.page.contentScope, "church");
    assert.match(
      (model.sections || []).map((s) => s.heading).join(" "),
      /Church-wide About Hero Stage5/
    );
  });

  it("3. Remove override restores inheritance", async () => {
    requireDb();
    await createBranchPageOverride(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusWest.id,
      pageKey: "about",
      actorUserId: users.hqA.user.id,
    });
    const westPages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
    });
    const westAbout = westPages.pages.find((p) => p.pageKey === "about");
    await updatePublicPage(pool, westAbout.id, {
      status: "published",
      title: "West About Override",
    });
    await createPageSection(pool, {
      pageId: westAbout.id,
      sectionKey: "west-about-hero",
      sectionType: "hero",
      heading: "West About Override Hero",
      bodyText: "West about",
      status: "published",
    });

    let model = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "about",
      hostname: APEX,
      pathPrefix: "/c/stage5-a/branches/campus-west",
      selectedBranch: selectedBranchFrom(campusWest),
      routingMode: "path",
    });
    assert.match(
      (model.sections || []).map((s) => s.heading).join(" "),
      /West About Override Hero/
    );

    const removed = await removeBranchPageOverride(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusWest.id,
      pageKey: "about",
      actorUserId: users.hqA.user.id,
    });
    assert.equal(removed.ok, true, removed.reason);

    const churchStill = await pool.query(
      `SELECT status FROM blessboard.public_pages
        WHERE church_id = $1 AND branch_id IS NULL AND page_key = 'about'`,
      [churchA.id]
    );
    assert.equal(churchStill.rows[0].status, "published");

    model = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "about",
      hostname: APEX,
      pathPrefix: "/c/stage5-a/branches/campus-west",
      selectedBranch: selectedBranchFrom(campusWest),
      routingMode: "path",
    });
    assert.equal(model.page.contentScope, "church");
    assert.match(
      (model.sections || []).map((s) => s.heading).join(" "),
      /Church-wide About Hero Stage5/
    );
    assert.doesNotMatch(
      (model.sections || []).map((s) => s.heading).join(" "),
      /West About Override Hero/
    );
  });

  it("4. Branch events remain isolated", async () => {
    requireDb();
    await createEvent(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
      title: "East Only Event Stage5",
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      timezone: "Africa/Lusaka",
      status: "published",
    });
    await createEvent(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
      title: "West Only Event Stage5",
      startsAt: new Date(Date.now() + 172800000).toISOString(),
      timezone: "Africa/Lusaka",
      status: "published",
    });

    const east = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "events",
      hostname: APEX,
      pathPrefix: "/c/stage5-a/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "path",
    });
    const west = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "events",
      hostname: APEX,
      pathPrefix: "/c/stage5-a/branches/campus-west",
      selectedBranch: selectedBranchFrom(campusWest),
      routingMode: "path",
    });
    assert.ok(east.entities.some((e) => e.title === "East Only Event Stage5"));
    assert.ok(!east.entities.some((e) => e.title === "West Only Event Stage5"));
    assert.ok(west.entities.some((e) => e.title === "West Only Event Stage5"));
    assert.ok(!west.entities.some((e) => e.title === "East Only Event Stage5"));
  });

  it("5. Branch sermons remain isolated", async () => {
    requireDb();
    await createSermon(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
      title: "East Sermon Stage5",
      speakerName: "Pastor East",
      preachedAt: new Date().toISOString().slice(0, 10),
      status: "published",
    });
    await createSermon(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
      title: "West Sermon Stage5",
      speakerName: "Pastor West",
      preachedAt: new Date().toISOString().slice(0, 10),
      status: "published",
    });
    const east = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "sermons",
      hostname: APEX,
      pathPrefix: "/c/stage5-a/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "path",
    });
    assert.ok(east.entities.some((e) => e.title === "East Sermon Stage5"));
    assert.ok(!east.entities.some((e) => e.title === "West Sermon Stage5"));
  });

  it("6. Giving methods remain isolated", async () => {
    requireDb();
    await createGivingMethod(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
      methodType: "mobile_money",
      label: "East Giving Stage5",
      instructions: "Dial east",
      status: "published",
    });
    await createGivingMethod(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
      methodType: "mobile_money",
      label: "West Giving Stage5",
      instructions: "Dial west",
      status: "published",
    });
    const east = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "giving",
      hostname: APEX,
      pathPrefix: "/c/stage5-a/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "path",
    });
    assert.ok(east.entities.some((e) => e.label === "East Giving Stage5"));
    assert.ok(!east.entities.some((e) => e.label === "West Giving Stage5"));
  });

  it("7. Contact details use the selected branch", async () => {
    requireDb();
    const east = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "contact",
      hostname: APEX,
      pathPrefix: "/c/stage5-a/branches/campus-east",
      selectedBranch: selectedBranchFrom(campusEast),
      routingMode: "path",
    });
    const west = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "contact",
      hostname: APEX,
      pathPrefix: "/c/stage5-a/branches/campus-west",
      selectedBranch: selectedBranchFrom(campusWest),
      routingMode: "path",
    });
    assert.match(String(east.publicContact && east.publicContact.phone), /000111/);
    assert.match(String(west.publicContact && west.publicContact.phone), /000222/);
    assert.match(String(east.publicContact && east.publicContact.email), /east@/);
    assert.match(String(west.publicContact && west.publicContact.email), /west@/);
  });

  it("8. HQ can edit same-church branches", async () => {
    requireDb();
    const eastEdit = await authedGet(
      "/hq/website/branches/campus-east/pages/home",
      HOST_A,
      users.hqA
    );
    assert.equal(eastEdit.res.status, 200);
    assert.match(eastEdit.res.text, /data-bb-content-page-editor="1"/);
    assert.match(eastEdit.res.text, /data-bb-content-inheritance="1"/);

    const westEdit = await authedGet(
      "/hq/website/branches/campus-west/pages/about",
      HOST_A,
      users.hqA
    );
    assert.equal(westEdit.res.status, 200);
    assert.match(westEdit.res.text, /Campus West|Inherited from church website|Branch override/);
  });

  it("9. Branch Admin edits only the assigned branch", async () => {
    requireDb();
    const eastOk = await authedGet(
      "/branch-admin/website/pages/home",
      HOST_A,
      users.eastAdmin
    );
    assert.equal(eastOk.res.status, 200);
    assert.match(eastOk.res.text, /data-bb-content-page-editor="1"/);
    assert.match(eastOk.res.text, /Campus East|Branch override|Inherited from church/);

    const westAsEast = await authedGet(
      "/hq/website/branches/campus-west/pages/home",
      HOST_A,
      users.eastAdmin
    );
    assert.ok([403, 404].includes(westAsEast.res.status));
  });

  it("10. Public users see only published content", async () => {
    requireDb();
    const draftPages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
    });
    const leadership = draftPages.pages.find((p) => p.pageKey === "leadership");
    await updatePublicPage(pool, leadership.id, {
      status: "draft",
      title: "Draft Leadership Hidden",
    });
    await createPageSection(pool, {
      pageId: leadership.id,
      sectionKey: "draft-lead",
      sectionType: "text",
      heading: "Secret Draft Leader Heading",
      bodyText: "should not show",
      status: "draft",
    });

    const publicRes = await request(app)
      .get("/c/stage5-a/branches/campus-east/leadership")
      .set("Host", APEX);
    assert.equal(publicRes.status, 200);
    assert.doesNotMatch(publicRes.text, /Secret Draft Leader Heading/);
  });

  it("11. Cross-organization access returns 404", async () => {
    requireDb();
    const foreign = await authedGet(
      "/hq/website/branches/campus-east/pages/home",
      HOST_B,
      users.hqB
    );
    assert.equal(foreign.res.status, 404);

    const publicForeign = await request(app)
      .get("/c/stage5-b/branches/campus-east")
      .set("Host", APEX);
    assert.equal(publicForeign.status, 404);
  });

  it("12. Success and errors are visible", async () => {
    requireDb();
    const { res, csrf } = await authedGet(
      "/hq/website/branches/campus-east/pages/about",
      HOST_A,
      users.hqA
    );
    assert.equal(res.status, 200);
    assert.ok(csrf);

    const override = await authedPost(
      "/hq/website/branches/campus-east/pages/about/inheritance/override",
      HOST_A,
      users.hqA,
      csrf,
      {}
    );
    assert.ok([302, 303].includes(override.status));
    assert.match(String(override.headers.location || ""), /inheritance=override/);

    const after = await authedGet(
      String(override.headers.location || "/hq/website/branches/campus-east/pages/about"),
      HOST_A,
      users.hqA
    );
    assert.equal(after.res.status, 200);
    assert.match(after.res.text, /Branch override is ready|data-bb-inheritance-mode="override"/);

    const badCsrf = await authedPost(
      "/hq/website/branches/campus-east/pages/about/inheritance/remove",
      HOST_A,
      users.hqA,
      "not-a-real-csrf",
      {}
    );
    assert.equal(badCsrf.status, 403);

    const state = await getBranchPageInheritanceState(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
      pageKey: "about",
    });
    assert.equal(state.ok, true);
    assert.equal(state.mode, INHERITANCE_MODE.OVERRIDE);
  });
});
