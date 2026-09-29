"use strict";

/**
 * Phase3 Website Workflow Dashboard (Batch C screen 14).
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
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  acknowledgeWebsitePreview,
  publishChurchWebsite,
} = require("../src/blessboard/services/churchWebsitePublishService");
const submissionRepo = require("../src/blessboard/repositories/websiteChangeSubmissionRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const HOST_A = "wwd-a.blessboard.org";
const HOST_B = "wwd-b.blessboard.org";

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

function sidCookie(rawToken) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}`;
}

describe("phase3 website workflow dashboard", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let branchA;
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

      async function provision(key, host, store) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `WWD ${key}`,
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
          displayName: `WWD Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        store.org = prov.records.organization;
        store.church = ch.records.church;
        const br = await pool.query(
          `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'hq' LIMIT 1`,
          [store.church.id]
        );
        store.branch = { id: br.rows[0].id };
        await ensureChurchSettingsInitialized(pool, store.church.id);
        await updateChurchSettings(pool, store.church.id, {
          publicName: `WWD Church ${key}`,
          websiteStatus: "draft",
          primaryEmail: `${key}@example.test`,
        });
        await repairWebsiteFoundation(pool, { churchId: store.church.id });
        await acknowledgeWebsitePreview(pool, {
          organizationId: store.org.id,
          actorUserId: null,
        });
      }

      const a = {};
      const b = {};
      await provision("wwd-a", HOST_A, a);
      await provision("wwd-b", HOST_B, b);
      orgA = a.org;
      orgB = b.org;
      churchA = a.church;
      branchA = a.branch;

      async function makeUser(email, displayName, role, orgId) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser(
        "wwd-hq-a@example.test",
        "HQ A",
        {
          email: "wwd-hq-a@example.test",
          organizationKey: "wwd-a",
          roleKey: "church_hq_admin",
          churchKey: "wwd-a",
        },
        orgA.id
      );
      users.branchA = await makeUser(
        "wwd-br-a@example.test",
        "Branch A",
        {
          email: "wwd-br-a@example.test",
          organizationKey: "wwd-a",
          roleKey: "branch_admin",
          churchKey: "wwd-a",
          branchKey: "hq",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "wwd-hq-b@example.test",
        "HQ B",
        {
          email: "wwd-hq-b@example.test",
          organizationKey: "wwd-b",
          roleKey: "church_hq_admin",
          churchKey: "wwd-b",
        },
        orgB.id
      );

      await submissionRepo.insertSubmission(pool, {
        organizationId: orgA.id,
        branchId: branchA.id,
        title: "Dashboard Pending Item",
        pageKey: "home",
        changeType: "Content",
        currentContent: {},
        proposedContent: { heading: "Dash" },
        status: "pending_review",
        submittedBy: users.branchA.user.id,
      });

      await publishChurchWebsite(pool, {
        churchId: churchA.id,
        actorUserId: users.hqA.user.id,
        confirmPublish: true,
        deferServiceTimes: true,
        env: baseEnv(),
      });

      // Publish may fail while pending exists — clear and publish for recent pubs panel.
      await pool.query(
        `UPDATE blessboard.website_change_submissions
            SET status = 'withdrawn'
          WHERE organization_id = $1 AND status = 'pending_review'`,
        [orgA.id]
      );
      await publishChurchWebsite(pool, {
        churchId: churchA.id,
        actorUserId: users.hqA.user.id,
        confirmPublish: true,
        deferServiceTimes: true,
        env: baseEnv(),
      });

      await submissionRepo.insertSubmission(pool, {
        organizationId: orgA.id,
        branchId: branchA.id,
        title: "Dashboard Pending Item",
        pageKey: "home",
        changeType: "Content",
        currentContent: {},
        proposedContent: { heading: "Dash2" },
        status: "pending_review",
        submittedBy: users.branchA.user.id,
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
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("real submission counts and recent submissions render", async () => {
    skipIfNeeded();
    const res = await request(app)
      .get("/hq/website/workflow")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(res.status, 200);
    assert.match(res.text, /Website Workflow Dashboard/);
    assert.match(res.text, /data-bb-phase3-website-workflow-dashboard="1"/);
    assert.match(res.text, /Dashboard Pending Item/);
    assert.match(res.text, /Pending submissions/);
    assert.match(res.text, /Needs attention/);
  });

  it("recent submissions are organization-scoped", async () => {
    skipIfNeeded();
    const res = await request(app)
      .get("/hq/website/workflow")
      .set("Host", HOST_B)
      .set("Cookie", sidCookie(users.hqB.rawToken));
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Dashboard Pending Item/);
  });

  it("empty states render safely for org without activity", async () => {
    skipIfNeeded();
    const res = await request(app)
      .get("/hq/website/workflow")
      .set("Host", HOST_B)
      .set("Cookie", sidCookie(users.hqB.rawToken));
    assert.equal(res.status, 200);
    assert.match(res.text, /No submissions are waiting for review|No website change submissions yet/);
  });

  it("publish action hidden or disabled when not ready", async () => {
    skipIfNeeded();
    const res = await request(app)
      .get("/hq/website/workflow")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(res.status, 200);
    // Pending submission makes validation fail → Publish disabled
    assert.match(res.text, /disabled[^>]*>Publish|title="Resolve validation before publishing"/);
  });

  it("recent publication data is accurate", async () => {
    skipIfNeeded();
    const res = await request(app)
      .get("/hq/website/workflow")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(res.status, 200);
    assert.match(res.text, /Recent publications/);
    assert.match(res.text, /v\d+/);
  });

  it("mobile structure exists", async () => {
    skipIfNeeded();
    const res = await request(app)
      .get("/hq/website/workflow")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase3-workflow-sticky="1"/);
    assert.match(res.text, /data-bb-phase3-workflow-mobile="1"/);
  });

  it("unauthorized users blocked", async () => {
    skipIfNeeded();
    const anon = await request(app)
      .get("/hq/website/workflow")
      .set("Host", HOST_A)
      .set("Accept", "text/html");
    assert.ok(anon.status === 303 || anon.status === 401);

    const branch = await request(app)
      .get("/hq/website/workflow")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken));
    assert.equal(branch.status, 403);
  });
});
