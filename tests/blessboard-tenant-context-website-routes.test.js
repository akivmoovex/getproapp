"use strict";

/**
 * Tenant context / apex navigation for HQ and branch-admin.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const crypto = require("crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { createV5Session } = require("../src/platform/session/createV5Session");
const {
  resolveApexPostLoginPath,
  hasBranchAdminRole,
  safeBranchAdminNextPath,
} = require("../src/blessboard/http/tenantLoginHelpers");
const {
  resolveWebsiteActionUrls,
} = require("../src/blessboard/urls/websiteActionUrls");
const {
  loadActiveBranchForChurch,
} = require("../src/blessboard/http/loadSessionScopedTenantContext");

const DEPLOYMENT = "blessboard-org-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

describe("website action URL helper", () => {
  it("platform admin never receives /hq tenant-session links", () => {
    const urls = resolveWebsiteActionUrls({
      actor: "platform_admin",
      organizationKey: "demo3",
    });
    assert.equal(urls.serviceTimesUrl, null);
    assert.equal(urls.editWebsiteUrl, null);
    assert.equal(urls.previewUrl, "/admin/organizations/demo3/website-preview");
    assert.equal(urls.publishedWebsiteUrl, "/c/demo3");
    assert.doesNotMatch(JSON.stringify(urls), /\/hq\//);
  });

  it("hq admin receives HQ editor and preview routes", () => {
    const urls = resolveWebsiteActionUrls({
      actor: "hq",
      organizationKey: "demo3",
    });
    assert.equal(urls.serviceTimesUrl, "/hq/content/pages/home");
    assert.equal(urls.previewUrl, "/hq/content/preview/home");
    assert.equal(urls.publishedWebsiteUrl, "/c/demo3");
  });

  it("branch admin receives branch website workflow routes", () => {
    const urls = resolveWebsiteActionUrls({
      actor: "branch_admin",
      organizationKey: "demo3",
    });
    assert.equal(urls.editWebsiteUrl, "/branch-admin/website");
    assert.equal(urls.publishWorkflowUrl, "/branch-admin/website/submit");
    assert.doesNotMatch(String(urls.editWebsiteUrl), /\/hq\//);
  });
});

describe("apex post-login destinations", () => {
  it("routes branch_admin to /branch-admin", () => {
    assert.equal(hasBranchAdminRole([{ roleKey: "branch_admin" }]), true);
    assert.equal(
      resolveApexPostLoginPath([{ roleKey: "branch_admin" }], null),
      "/branch-admin"
    );
    assert.equal(safeBranchAdminNextPath("/branch-admin/website"), "/branch-admin/website");
    assert.equal(safeBranchAdminNextPath("/hq"), null);
  });
});

describe("tenant context apex HQ and branch-admin", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app = null;
  let fixtures = {};

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });

      const orgKey = uniq("ctxorg");
      const hqEmail = `hq-${orgKey}@example.org`;
      const branchEmail = `br-${orgKey}@example.org`;

      const hqUser = await createBlessBoardUser(pool, {
        email: hqEmail,
        password: PASSWORD,
        displayName: "HQ Admin",
      });
      assert.equal(hqUser.ok, true, hqUser.message);

      const bootApp = await appRepo.createApplication(pool, {
        church_name: `Ctx Church ${orgKey}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "HQ",
        contact_email: `${uniq("boot")}@example.org`,
        contact_phone: `+2547${String(Date.now()).slice(-7)}`,
        contact_phone_normalized: `+2547${String(Date.now()).slice(-7)}`,
        selected_plan: "foundation",
        consent_terms: true,
      });
      const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: bootApp.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: orgKey,
        actorContext: {
          type: "test",
          source: "tenant-context",
          dataEnvironment: "testing",
          deploymentCode: DEPLOYMENT,
        },
      });
      assert.equal(provisioned.ok, true, provisioned.message || provisioned.status);

      const hqRole = await assignBlessBoardRole(pool, {
        email: hqEmail,
        organizationKey: orgKey,
        roleKey: "church_hq_admin",
        churchKey: orgKey,
      });
      assert.equal(hqRole.ok, true, hqRole.message);

      const branchUser = await createBlessBoardUser(pool, {
        email: branchEmail,
        password: PASSWORD,
        displayName: "Branch Admin",
      });
      assert.equal(branchUser.ok, true, branchUser.message);

      const branchRole = await assignBlessBoardRole(pool, {
        email: branchEmail,
        organizationKey: orgKey,
        roleKey: "branch_admin",
        churchKey: orgKey,
        branchKey: "hq",
      });
      assert.equal(branchRole.ok, true, branchRole.message);

      fixtures = {
        orgKey,
        organizationId: provisioned.records.organizationId,
        churchId: provisioned.records.churchId,
        branchId: provisioned.records.branchId,
        hqUserId: hqUser.user.id,
        branchUserId: branchUser.user.id,
      };

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set([APEX, `www.${APEX}`]),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function cookieFor(userId, organizationId, branchId) {
    const created = await createV5Session(pool, {
      deploymentCode: DEPLOYMENT,
      userId,
      organizationId,
      churchId: fixtures.churchId,
      branchId: branchId || null,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("HQ content home loads church data with session organization scope", async () => {
    requireDb();
    const cookie = await cookieFor(fixtures.hqUserId, fixtures.organizationId, null);
    const res = await request(app)
      .get("/hq/content/pages/home")
      .set("Cookie", cookie)
      .set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /Ctx Church/i);
    assert.match(res.text, /Service times|service times|bb-ca-service-times/i);
  });

  it("HQ without organization scope does not render an empty dashboard", async () => {
    requireDb();
    const created = await createV5Session(pool, {
      deploymentCode: DEPLOYMENT,
      userId: fixtures.hqUserId,
      organizationId: null,
      churchId: null,
      branchId: null,
    });
    assert.equal(created.ok, true, created.code);
    const cookie = `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
    const res = await request(app).get("/hq").set("Cookie", cookie).set("Host", APEX);
    assert.notEqual(res.status, 200);
    assert.ok(res.status === 403 || res.status === 503 || res.status === 404);
  });

  it("branch-admin loads assigned branch data on apex", async () => {
    requireDb();
    const cookie = await cookieFor(
      fixtures.branchUserId,
      fixtures.organizationId,
      fixtures.branchId
    );
    const res = await request(app)
      .get("/branch-admin")
      .set("Cookie", cookie)
      .set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /Ctx Church|Headquarters|Branch/i);
    assert.doesNotMatch(res.text, /This page is not yet available/i);
  });

  it("branch-admin website entry opens visual editor, not HQ editor", async () => {
    requireDb();
    const cookie = await cookieFor(
      fixtures.branchUserId,
      fixtures.organizationId,
      fixtures.branchId
    );
    const res = await request(app)
      .get("/branch-admin/website")
      .redirects(0)
      .set("Cookie", cookie)
      .set("Host", APEX);
    assert.ok([302, 303, 403].includes(res.status));
    if (res.status === 302 || res.status === 303) {
      assert.match(String(res.headers.location || ""), /\/c\/[^?]+\?website_edit=1/);
      assert.doesNotMatch(String(res.headers.location || ""), /\/hq\//);
      assert.doesNotMatch(String(res.headers.location || ""), /\/submissions/);
    }
  });

  it("loadActiveBranchForChurch rejects cross-church branch ids", async () => {
    requireDb();
    const ok = await loadActiveBranchForChurch(
      pool,
      fixtures.churchId,
      fixtures.branchId
    );
    assert.ok(ok);
    assert.equal(ok.id, fixtures.branchId);
    const bad = await loadActiveBranchForChurch(
      pool,
      fixtures.churchId,
      "00000000-0000-4000-8000-000000000099"
    );
    assert.equal(bad, null);
  });

  it("public /c/:key still renders after HQ session exists", async () => {
    requireDb();
    const res = await request(app).get(`/c/${fixtures.orgKey}`).set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /Ctx Church/i);
  });
});
