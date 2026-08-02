"use strict";

/**
 * Stage 1 website scope resolver — church-wide vs authorized branch mini-site.
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
const {
  buildBlessBoardTenantContext,
} = require("../src/blessboard/http/buildBlessBoardTenantContext");
const {
  resolveWebsiteScope,
  STATUS,
  SCOPE_TYPE,
} = require("../src/blessboard/services/resolveWebsiteScope");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "wscope-a.blessboard.org";
const HOST_B = "wscope-b.blessboard.org";

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

describe("blessboard website scope resolver", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let hqBranchA;
  let campusBranchA;
  let tenantA;
  let tenantB;
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
        organizationKey: "wscope-a",
        displayName: "Website Scope Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "wscope-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "wscope-b",
        displayName: "Website Scope Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "wscope-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "wscope-a",
        churchKey: "wscope-a",
        displayName: "Website Scope Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqBranchA = chA.records.hqBranch;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "wscope-b",
        churchKey: "wscope-b",
        displayName: "Website Scope Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      const campus = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-east', 'Campus East', 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, branch_key, display_name, branch_type, is_primary`,
        [churchA.id]
      );
      campusBranchA = campus.rows[0];

      tenantA = buildBlessBoardTenantContext({
        organization: {
          id: orgA.id,
          key: "wscope-a",
        },
        church: {
          id: churchA.id,
          churchKey: "wscope-a",
          displayName: "Website Scope Church A",
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
      assert.ok(tenantA && tenantA.resolved);

      tenantB = buildBlessBoardTenantContext({
        organization: {
          id: orgB.id,
          key: "wscope-b",
        },
        church: {
          id: churchB.id,
          churchKey: "wscope-b",
          displayName: "Website Scope Church B",
        },
        hqBranch: {
          id: chB.records.hqBranch.id,
          branchKey: "hq",
          displayName: "HQ B",
        },
        primaryBranch: {
          id: chB.records.hqBranch.id,
          branchKey: "hq",
          displayName: "HQ B",
        },
      });
      assert.ok(tenantB && tenantB.resolved);

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const orgId =
          role.organizationKey === "wscope-a" ? orgA.id : orgB.id;
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser("hq-wscope@example.test", "HQ A", {
        email: "hq-wscope@example.test",
        organizationKey: "wscope-a",
        roleKey: "church_hq_admin",
        churchKey: "wscope-a",
      });
      users.campusAdmin = await makeUser("campus-wscope@example.test", "Campus Admin", {
        email: "campus-wscope@example.test",
        organizationKey: "wscope-a",
        roleKey: "branch_admin",
        churchKey: "wscope-a",
        branchKey: "campus-east",
      });
      users.hqPrimaryAdmin = await makeUser("hq-branch-wscope@example.test", "HQ Branch Admin", {
        email: "hq-branch-wscope@example.test",
        organizationKey: "wscope-a",
        roleKey: "branch_admin",
        churchKey: "wscope-a",
        branchKey: "hq",
      });
      users.hqB = await makeUser("hq-b-wscope@example.test", "HQ B", {
        email: "hq-b-wscope@example.test",
        organizationKey: "wscope-b",
        roleKey: "church_hq_admin",
        churchKey: "wscope-b",
      });

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "Website Scope Church A",
        websiteStatus: "published",
      });

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
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("1. HQ resolves a same-church branch", async () => {
    requireDb();
    const resolved = await resolveWebsiteScope(pool, {
      tenant: tenantA,
      authenticatedUser: users.hqA.user.id,
      requestedBranchKey: "campus-east",
      organizationId: tenantA.organization.id,
      churchId: tenantA.church.id,
    });
    assert.equal(resolved.ok, true, resolved.message);
    assert.equal(resolved.scopeType, SCOPE_TYPE.BRANCH);
    assert.equal(resolved.branchId, String(campusBranchA.id));
    assert.equal(resolved.branchKey, "campus-east");
    assert.equal(resolved.organizationId, String(orgA.id));
    assert.equal(resolved.churchId, String(churchA.id));
  });

  it("2. HQ cannot resolve a foreign branch", async () => {
    requireDb();
    const resolved = await resolveWebsiteScope(pool, {
      tenant: tenantA,
      authenticatedUser: users.hqA.user.id,
      requestedBranchKey: "hq",
      organizationId: tenantB.organization.id,
      churchId: tenantB.church.id,
    });
    assert.equal(resolved.ok, false);
    assert.equal(resolved.status, STATUS.NOT_FOUND);
    assert.equal(resolved.httpStatus, 404);

    const crossTenant = await resolveWebsiteScope(pool, {
      tenant: tenantB,
      authenticatedUser: users.hqA.user.id,
      requestedBranchKey: "hq",
    });
    assert.equal(crossTenant.ok, false);
    assert.ok(
      crossTenant.status === STATUS.FORBIDDEN || crossTenant.status === STATUS.NOT_FOUND
    );
  });

  it("3. Branch Admin resolves the assigned branch", async () => {
    requireDb();
    const resolved = await resolveWebsiteScope(pool, {
      tenant: tenantA,
      authenticatedUser: users.campusAdmin.user.id,
      requestedBranchKey: null,
    });
    assert.equal(resolved.ok, true, resolved.message);
    assert.equal(resolved.scopeType, SCOPE_TYPE.BRANCH);
    assert.equal(resolved.branchId, String(campusBranchA.id));
    assert.equal(resolved.branchKey, "campus-east");
  });

  it("4. Branch Admin cannot resolve another branch", async () => {
    requireDb();
    const resolved = await resolveWebsiteScope(pool, {
      tenant: tenantA,
      authenticatedUser: users.campusAdmin.user.id,
      requestedBranchKey: "hq",
    });
    assert.equal(resolved.ok, false);
    assert.equal(resolved.status, STATUS.NOT_FOUND);
    assert.equal(resolved.httpStatus, 404);
  });

  it("5. Branch Admin scope does not silently become the primary branch", async () => {
    requireDb();
    assert.equal(String(tenantA.primaryBranch.id), String(hqBranchA.id));
    assert.notEqual(String(campusBranchA.id), String(hqBranchA.id));

    const resolved = await resolveWebsiteScope(pool, {
      tenant: tenantA,
      authenticatedUser: users.campusAdmin.user.id,
      requestedBranchKey: null,
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.branchId, String(campusBranchA.id));
    assert.notEqual(resolved.branchId, String(tenantA.primaryBranch.id));
    assert.notEqual(resolved.branchKey, tenantA.primaryBranch.key);
  });

  it("6. Church-wide scope remains branchId = null", async () => {
    requireDb();
    const resolved = await resolveWebsiteScope(pool, {
      tenant: tenantA,
      authenticatedUser: users.hqA.user.id,
      requestedBranchKey: null,
    });
    assert.equal(resolved.ok, true, resolved.message);
    assert.equal(resolved.scopeType, SCOPE_TYPE.CHURCH);
    assert.equal(resolved.branchId, null);
    assert.equal(resolved.branchKey, null);
    assert.equal(resolved.branch, null);
  });

  it("7. Existing website editor routes continue working", async () => {
    requireDb();

    const hqChurchWide = await request(app)
      .get("/hq/content")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`);
    assert.equal(hqChurchWide.status, 200);
    assert.match(hqChurchWide.text, /Church-wide|Website content|Content/i);

    const hqHome = await request(app)
      .get("/hq/content/pages/home")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`);
    assert.equal(hqHome.status, 200);

    const hqBranch = await request(app)
      .get("/hq/content/b/campus-east")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`);
    assert.equal(hqBranch.status, 200);
    assert.match(hqBranch.text, /Campus East/i);

    const hqForeignBranch = await request(app)
      .get("/hq/content/b/does-not-exist")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`);
    assert.equal(hqForeignBranch.status, 404);

    const campusContent = await request(app)
      .get("/branch-admin/content")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.campusAdmin.rawToken}`);
    // Branch shell binds to host primary branch; campus-only admins cannot enter on HQ host.
    assert.ok(
      campusContent.status === 403 || campusContent.status === 303,
      `unexpected campus content status ${campusContent.status}`
    );

    const campusDeniedHqBranch = await request(app)
      .get("/hq/content/b/hq")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.campusAdmin.rawToken}`);
    assert.ok(
      campusDeniedHqBranch.status === 403 || campusDeniedHqBranch.status === 404,
      `unexpected status ${campusDeniedHqBranch.status}`
    );

    const primaryBranchAdmin = await request(app)
      .get("/branch-admin/content")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hqPrimaryAdmin.rawToken}`);
    assert.equal(primaryBranchAdmin.status, 200);
  });

  it("rejects mismatched client-supplied church IDs", async () => {
    requireDb();
    const resolved = await resolveWebsiteScope(pool, {
      tenant: tenantA,
      authenticatedUser: users.hqA.user.id,
      requestedBranchKey: null,
      churchId: churchB.id,
    });
    assert.equal(resolved.ok, false);
    assert.equal(resolved.status, STATUS.NOT_FOUND);
  });

  it("Branch Admin cannot open church-wide HQ content scope", async () => {
    requireDb();
    const resolved = await resolveWebsiteScope(pool, {
      tenant: tenantA,
      authenticatedUser: users.campusAdmin.user.id,
      requestedBranchKey: null,
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.scopeType, SCOPE_TYPE.BRANCH);
    assert.notEqual(resolved.branchId, null);
  });
});
