"use strict";

/**
 * V7 QA hardening: /branch-admin/website must resolve the branch the actor is
 * ASSIGNED to.
 *
 * The church in this fixture has three branches, and the branch admin is assigned
 * to a non-primary one. That matters: in a single-branch church the assigned branch
 * and the church primary branch are the same row, so a resolver that wrongly used
 * the primary branch — or the church-wide site — still looked correct. Only a
 * multi-branch church can tell those apart.
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
const { createBlessBoardBranch } = require("../src/blessboard/services/createBlessBoardBranch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  setOrganizationEntitlementOverride,
  FEATURE_KEYS,
} = require("../src/platform/services/entitlementService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST = "assigned-branch.blessboard.org";
const APEX = "blessboard.org";
const ORG_KEY = "assigned-branch-org";

function baseEnv() {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
  };
}

describe("V7 /branch-admin/website resolves the assigned branch", () => {
  let pool;
  let app;
  let skipSuite = false;
  let skipReason = "";
  let org;
  let church;
  let southSession = null;
  let northSession = null;

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

      const provisioned = await provisionPlatformTenant(pool, {
        organizationKey: ORG_KEY,
        displayName: "Assigned Branch Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: ORG_KEY,
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provisioned.ok, true, provisioned.message);
      org = provisioned.records.organization;

      const provisionedChurch = await provisionBlessBoardChurch(pool, {
        organizationKey: ORG_KEY,
        churchKey: ORG_KEY,
        displayName: "Assigned Branch Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Head Office",
      });
      assert.equal(provisionedChurch.ok, true, provisionedChurch.message);
      church = provisionedChurch.records.church;

      // The default plan caps active branches below what this fixture needs, and a
      // capped create would leave the church single-branch — the exact shape that
      // hides the bug under test.
      const override = await setOrganizationEntitlementOverride(pool, {
        organizationId: org.id,
        featureKey: FEATURE_KEYS.MAX_BRANCHES,
        featureKind: "limit",
        limitValue: 5,
        reason: "v7_assigned_branch_entry_regression",
        createdByUserId: null,
      });
      assert.equal(override.ok, true, override.reason);

      for (const [branchKey, displayName] of [
        ["campus-north", "Campus North"],
        ["campus-south", "Campus South"],
      ]) {
        const created = await createBlessBoardBranch(pool, {
          organizationId: org.id,
          churchId: church.id,
          actorUserId: null,
          branchKey,
          displayName,
          timezone: "UTC",
          countryCode: "ZM",
        });
        assert.equal(created.ok, true, created.message || created.reason);
      }

      const branchCount = await pool.query(
        `SELECT COUNT(*)::int AS n FROM blessboard.branches WHERE church_id = $1`,
        [church.id]
      );
      assert.equal(branchCount.rows[0].n, 3, "fixture must be a multi-branch church");

      async function makeBranchAdmin(email, branchKey) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName: `Admin ${branchKey}`,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        const assigned = await assignBlessBoardRole(pool, {
          email,
          organizationKey: ORG_KEY,
          roleKey: "branch_admin",
          churchKey: ORG_KEY,
          branchKey,
        });
        assert.equal(assigned.ok, true, assigned.message || assigned.reason);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId: org.id,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return session.rawToken;
      }

      southSession = await makeBranchAdmin("south-admin@example.test", "campus-south");
      northSession = await makeBranchAdmin("north-admin@example.test", "campus-north");

      app = createV5FoundationApp({ getPool: () => pool, env: baseEnv() });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  // Skip only when the foundation database is genuinely unavailable. Any other
  // setup failure must fail the suite: these assertions are worthless if the
  // fixture quietly degraded to a single-branch church.
  function skipIfNeeded() {
    if (!skipSuite) return false;
    if (/ECONNREFUSED|does not exist|password authentication|ENOTFOUND|connect/i.test(skipReason)) {
      console.log(`skip: ${skipReason}`);
      return true;
    }
    throw new Error(`fixture setup failed: ${skipReason}`);
  }

  function entry(token) {
    return request(app)
      .get("/branch-admin/website")
      .redirects(0)
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${token}`);
  }

  it("sends the campus-south admin to the campus-south website", async () => {
    if (skipIfNeeded()) return;
    const res = await entry(southSession);
    assert.equal(res.status, 303);
    assert.equal(
      res.headers.location,
      `/c/${ORG_KEY}/campus-south?website_edit=1`
    );
  });

  it("does not fall back to the church primary branch or the church-wide site", async () => {
    if (skipIfNeeded()) return;
    const res = await entry(southSession);
    assert.equal(res.status, 303);
    const location = res.headers.location;
    // The church-wide page and the HQ branch are both wrong targets here: this
    // actor's website.* grants are scoped to campus-south only.
    assert.notEqual(location, `/c/${ORG_KEY}?website_edit=1`);
    assert.doesNotMatch(location, /\/hq(\?|$)/);
    assert.match(location, /\/campus-south\?website_edit=1/);
  });

  it("keeps sibling branches isolated per assigned admin", async () => {
    if (skipIfNeeded()) return;
    const south = await entry(southSession);
    const north = await entry(northSession);
    assert.equal(south.status, 303);
    assert.equal(north.status, 303);
    assert.match(north.headers.location, /\/campus-north\?website_edit=1/);
    assert.doesNotMatch(north.headers.location, /campus-south/);
    assert.doesNotMatch(south.headers.location, /campus-north/);
    assert.notEqual(south.headers.location, north.headers.location);
  });

  it("ignores a client-supplied branch key on the entry route", async () => {
    if (skipIfNeeded()) return;
    // Branch identity must come from the session-resolved assignment, never the
    // query string, or the entry route becomes a cross-branch pivot.
    const res = await request(app)
      .get("/branch-admin/website?branch=campus-north&branchKey=campus-north")
      .redirects(0)
      .set("Host", APEX)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${southSession}`);
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /\/campus-south\?website_edit=1/);
    assert.doesNotMatch(res.headers.location, /campus-north/);
  });
});
