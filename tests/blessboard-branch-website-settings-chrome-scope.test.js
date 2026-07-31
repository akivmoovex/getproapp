"use strict";

/**
 * Live defect regressions:
 * A) HQ branch settings route resolves by branch key (same identity as service-times).
 * B) Branch-admin edit chrome only on authorized public page scope.
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
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  ensureBranchWebsiteGovernance,
} = require("../src/blessboard/services/branchWebsiteGovernanceService");
const {
  resolveBranchWebsiteSettings,
  STATUS: RESOLVE_STATUS,
} = require("../src/blessboard/services/resolveBranchWebsiteSettings");
const {
  canShowWebsiteEditChrome,
} = require("../src/blessboard/http/attachWebsiteAdminChrome");
const { resolveWebsiteScope, SCOPE_TYPE } = require("../src/blessboard/services/resolveWebsiteScope");
const {
  buildBlessBoardTenantContext,
} = require("../src/blessboard/http/buildBlessBoardTenantContext");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "chrome-scope-a.blessboard.org";
const HOST_B = "chrome-scope-b.blessboard.org";
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

function sidCookie(token) {
  return `${DEFAULT_V5_COOKIE}=${token}`;
}

describe("branch website settings + edit chrome scope regressions", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let hqBranchA;
  let branchA;
  let branchB;
  let hqBranchB;
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
        organizationKey: "chrome-scope-a",
        displayName: "Chrome Scope A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "chrome-scope-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "chrome-scope-a",
        churchKey: "chrome-scope-a",
        displayName: "Chrome Scope A Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqBranchA = chA.records.hqBranch;

      const alpha = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-alpha', 'Campus Alpha', 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, branch_key AS key, display_name`,
        [churchA.id]
      );
      branchA = alpha.rows[0];
      const beta = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-beta', 'Campus Beta', 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, branch_key AS key, display_name`,
        [churchA.id]
      );
      branchB = beta.rows[0];

      for (const b of [hqBranchA, branchA, branchB]) {
        await ensureBranchWebsiteGovernance(pool, {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: b.id,
        });
      }

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "Chrome Scope A Church",
        websiteStatus: "published",
      });

      const churchPages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
      for (const page of churchPages.pages || []) {
        await updatePublicPage(pool, page.id, { status: "published" });
      }
      for (const bid of [hqBranchA.id, branchA.id, branchB.id]) {
        const pages = await provisionEmptyPublicPages(pool, {
          churchId: churchA.id,
          branchId: bid,
        });
        for (const page of pages.pages || []) {
          await updatePublicPage(pool, page.id, { status: "published" });
        }
      }

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "chrome-scope-b",
        displayName: "Chrome Scope B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "chrome-scope-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "chrome-scope-b",
        churchKey: "chrome-scope-b",
        displayName: "Chrome Scope B Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;
      hqBranchB = chB.records.hqBranch;

      async function makeUser(email, displayName, role, orgId) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        if (role) assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hq = await makeUser(
        "hq-chrome@example.test",
        "HQ A",
        {
          email: "hq-chrome@example.test",
          organizationKey: "chrome-scope-a",
          roleKey: "church_hq_admin",
          churchKey: "chrome-scope-a",
        },
        orgA.id
      );
      users.baA = await makeUser(
        "ba-alpha@example.test",
        "BA Alpha",
        {
          email: "ba-alpha@example.test",
          organizationKey: "chrome-scope-a",
          roleKey: "branch_admin",
          churchKey: "chrome-scope-a",
          branchKey: "campus-alpha",
        },
        orgA.id
      );
      users.baB = await makeUser(
        "ba-beta@example.test",
        "BA Beta",
        {
          email: "ba-beta@example.test",
          organizationKey: "chrome-scope-a",
          roleKey: "branch_admin",
          churchKey: "chrome-scope-a",
          branchKey: "campus-beta",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "hq-b@example.test",
        "HQ B",
        {
          email: "hq-b@example.test",
          organizationKey: "chrome-scope-b",
          roleKey: "church_hq_admin",
          churchKey: "chrome-scope-b",
        },
        orgB.id
      );

      tenantA = buildBlessBoardTenantContext({
        organization: { id: orgA.id, key: "chrome-scope-a" },
        church: {
          id: churchA.id,
          churchKey: "chrome-scope-a",
          displayName: "Chrome Scope A Church",
          dataEnvironment: "testing",
        },
        hqBranch: {
          id: hqBranchA.id,
          branchKey: "hq",
          displayName: "HQ",
        },
        primaryBranch: {
          id: hqBranchA.id,
          branchKey: "hq",
          displayName: "HQ",
        },
      });
      assert.ok(tenantA && tenantA.resolved);

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
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("HQ admin loads branch settings by key for identity/contact/social/seo", async () => {
    requireDb();
    for (const section of ["identity", "contact", "social", "seo"]) {
      const res = await request(app)
        .get(`/hq/website/branches/${branchA.key}/settings?section=${section}`)
        .set("Host", HOST_A)
        .set("Cookie", sidCookie(users.hq.rawToken));
      assert.equal(res.status, 200, `section=${section}`);
      assert.match(res.text, /data-bb-branch-website-settings="1"/);
    }
  });

  it("safe return_to is preserved; unsafe off-site return_to is rejected", async () => {
    requireDb();
    const safePath = `/branches/${branchA.key}?website_edit=1`;
    const safe = await request(app)
      .get(
        `/hq/website/branches/${branchA.key}/settings?section=identity&return_to=${encodeURIComponent(
          safePath
        )}`
      )
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hq.rawToken));
    assert.equal(safe.status, 200);
    assert.match(safe.text, /name="return_to"/);
    assert.match(safe.text, new RegExp(`value="${safePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));

    const unsafe = await request(app)
      .get(
        `/hq/website/branches/${branchA.key}/settings?section=identity&return_to=${encodeURIComponent(
          "https://evil.example/phish"
        )}`
      )
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hq.rawToken));
    assert.equal(unsafe.status, 200);
    assert.doesNotMatch(unsafe.text, /evil\.example/);
  });

  it("missing and cross-organization branch keys return 404", async () => {
    requireDb();
    const missing = await request(app)
      .get("/hq/website/branches/no-such-branch/settings?format=json")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hq.rawToken));
    assert.equal(missing.status, 404);

    // Unique key that exists only in org B — never disclose via org A session.
    await pool.query(
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
       VALUES ($1, 'foreign-only-campus', 'Foreign Campus', 'branch', 'active', false, 'UTC', 'ZM')
       ON CONFLICT DO NOTHING`,
      [churchB.id]
    );
    const cross = await request(app)
      .get("/hq/website/branches/foreign-only-campus/settings?format=json")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hq.rawToken));
    assert.equal(cross.status, 404);
    assert.equal(cross.body.error, "not_found");
  });

  it("branch admin cannot open HQ branch-settings route", async () => {
    requireDb();
    const res = await request(app)
      .get(`/hq/website/branches/${branchA.key}/settings`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.baA.rawToken));
    assert.ok(res.status === 403 || res.status === 404);
  });

  it("service-times and settings resolve the same branch identity", async () => {
    requireDb();
    const scope = await resolveWebsiteScope(pool, {
      tenant: tenantA,
      authenticatedUser: users.hq.user.id,
      requestedBranchKey: branchA.key,
      organizationId: orgA.id,
      churchId: churchA.id,
    });
    assert.equal(scope.ok, true);
    assert.equal(scope.scopeType, SCOPE_TYPE.BRANCH);
    assert.equal(scope.branchKey, branchA.key);

    const settings = await resolveBranchWebsiteSettings(pool, {
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      branchId: scope.branchId,
      churchDisplayName: "Chrome Scope A Church",
    });
    assert.equal(settings.ok, true);
    assert.equal(settings.branchKey, branchA.key);
    assert.equal(settings.branchId, scope.branchId);

    const st = await request(app)
      .get(`/hq/website/branches/${branchA.key}/service-times`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hq.rawToken));
    assert.equal(st.status, 200);

    const setRes = await request(app)
      .get(`/hq/website/branches/${branchA.key}/settings?format=json`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hq.rawToken));
    assert.equal(setRes.status, 200);
    assert.equal(setRes.body.branchKey, branchA.key);
    assert.equal(setRes.body.branchId, scope.branchId);
  });

  it("hq alias does not resolve another campus settings scope", async () => {
    requireDb();
    const hqSettings = await request(app)
      .get("/hq/website/branches/hq/settings?format=json")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hq.rawToken));
    assert.equal(hqSettings.status, 200);
    assert.equal(hqSettings.body.branchKey, "hq");
    assert.notEqual(hqSettings.body.branchId, branchA.id);
  });

  it("scope-settings read failure soft-fails instead of opaque lookup_error", async () => {
    requireDb();
    const throwing = {
      query: async (sql, params) => {
        if (String(sql).includes("website_scope_settings")) {
          const err = new Error('relation "blessboard.website_scope_settings" does not exist');
          err.code = "42P01";
          throw err;
        }
        return pool.query(sql, params);
      },
    };
    const resolved = await resolveBranchWebsiteSettings(throwing, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      churchDisplayName: "Chrome Scope A Church",
    });
    assert.equal(resolved.ok, true, resolved.status);
    assert.notEqual(resolved.status, RESOLVE_STATUS.LOOKUP_ERROR);
  });

  it("unit: chrome gate allows HQ everywhere and BA only on matching scope", () => {
    const baBranchId = "11111111-1111-4111-8111-111111111111";
    const otherId = "22222222-2222-4222-8222-222222222222";
    assert.equal(
      canShowWebsiteEditChrome({
        isHqEditor: true,
        draftBranchId: null,
        model: { websiteScope: { scopeType: "church" }, websiteMode: "multi_site" },
      }),
      true
    );
    assert.equal(
      canShowWebsiteEditChrome({
        isHqEditor: false,
        draftBranchId: baBranchId,
        model: {
          websiteScope: { scopeType: "branch", branchId: baBranchId },
          websiteMode: "multi_site",
        },
      }),
      true
    );
    assert.equal(
      canShowWebsiteEditChrome({
        isHqEditor: false,
        draftBranchId: baBranchId,
        model: { websiteScope: { scopeType: "church" }, websiteMode: "multi_site" },
      }),
      false
    );
    assert.equal(
      canShowWebsiteEditChrome({
        isHqEditor: false,
        draftBranchId: baBranchId,
        model: {
          websiteScope: { scopeType: "branch", branchId: otherId },
          websiteMode: "multi_site",
        },
      }),
      false
    );
    assert.equal(
      canShowWebsiteEditChrome({
        isHqEditor: false,
        draftBranchId: baBranchId,
        model: { websiteScope: { scopeType: "church" }, websiteMode: "single_site" },
      }),
      true
    );
  });

  it("HQ admin sees chrome on church-wide and branch A; BA only on branch A", async () => {
    requireDb();
    const hqChurch = await request(app)
      .get("/c/chrome-scope-a?website_edit=1")
      .set("Host", APEX)
      .set("Cookie", sidCookie(users.hq.rawToken));
    assert.equal(hqChurch.status, 200);
    assert.match(hqChurch.text, /data-bb-edit-toolbar/);

    const hqBranch = await request(app)
      .get(`/c/chrome-scope-a/branches/${branchA.key}?website_edit=1`)
      .set("Host", APEX)
      .set("Cookie", sidCookie(users.hq.rawToken));
    assert.equal(hqBranch.status, 200);
    assert.match(hqBranch.text, /data-bb-edit-toolbar/);
    assert.match(hqBranch.text, /data-bb-features-panel/);

    const baOwn = await request(app)
      .get(`/c/chrome-scope-a/branches/${branchA.key}?website_edit=1`)
      .set("Host", APEX)
      .set("Cookie", sidCookie(users.baA.rawToken));
    assert.equal(baOwn.status, 200);
    assert.match(baOwn.text, /data-bb-edit-toolbar/);

    const baChurch = await request(app)
      .get("/c/chrome-scope-a?website_edit=1")
      .set("Host", APEX)
      .set("Cookie", sidCookie(users.baA.rawToken));
    assert.equal(baChurch.status, 200);
    assert.doesNotMatch(baChurch.text, /data-bb-edit-toolbar/);
    assert.doesNotMatch(baChurch.text, /data-bb-features-panel/);
    assert.doesNotMatch(baChurch.text, /data-bb-inline-edit/);

    const baHqAlias = await request(app)
      .get("/c/chrome-scope-a/branches/hq?website_edit=1")
      .set("Host", APEX)
      .set("Cookie", sidCookie(users.baA.rawToken));
    assert.equal(baHqAlias.status, 200);
    assert.doesNotMatch(baHqAlias.text, /data-bb-edit-toolbar/);

    const baOther = await request(app)
      .get(`/c/chrome-scope-a/branches/${branchB.key}?website_edit=1`)
      .set("Host", APEX)
      .set("Cookie", sidCookie(users.baA.rawToken));
    assert.equal(baOther.status, 200);
    assert.doesNotMatch(baOther.text, /data-bb-edit-toolbar/);
    assert.doesNotMatch(baOther.text, /data-bb-features-panel/);
  });

  it("public visitor never gets chrome; removing website_edit removes chrome", async () => {
    requireDb();
    const visitor = await request(app)
      .get(`/c/chrome-scope-a/branches/${branchA.key}?website_edit=1`)
      .set("Host", APEX);
    assert.equal(visitor.status, 200);
    assert.doesNotMatch(visitor.text, /data-bb-edit-toolbar/);

    const hqNoEdit = await request(app)
      .get(`/c/chrome-scope-a/branches/${branchA.key}`)
      .set("Host", APEX)
      .set("Cookie", sidCookie(users.hq.rawToken));
    assert.equal(hqNoEdit.status, 200);
    assert.doesNotMatch(hqNoEdit.text, /data-bb-edit-toolbar/);
  });

  it("tenant-host routes follow the same chrome rules", async () => {
    requireDb();
    const baOwn = await request(app)
      .get(`/branches/${branchA.key}?website_edit=1`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.baA.rawToken));
    assert.equal(baOwn.status, 200);
    assert.match(baOwn.text, /data-bb-edit-toolbar/);

    const baChurch = await request(app)
      .get("/?website_edit=1")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.baA.rawToken));
    assert.equal(baChurch.status, 200);
    assert.doesNotMatch(baChurch.text, /data-bb-edit-toolbar/);
  });
});
