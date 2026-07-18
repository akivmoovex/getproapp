"use strict";

/**
 * Platform plans / subscriptions / entitlements:
 * limits, overrides, expired subscription, plan changes, feature checks,
 * no destructive downgrade, V4 isolation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  createBlessBoardBranch,
} = require("../src/blessboard/services/createBlessBoardBranch");
const {
  STATUS,
  FEATURE_KEYS,
  resolveOrganizationEntitlements,
  resolveOrganizationEntitlementsSafe,
  hasFeature,
  getLimit,
  assertFeature,
  assertCanCreateBranch,
  assignOrganizationPlan,
  setOrganizationEntitlementOverride,
} = require("../src/platform/services/entitlementService");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT = "blessboard-org-v5";
const ROOT = path.join(__dirname, "..");

describe("platform entitlements", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let organizationId;
  let churchId;
  let orgKey = "ent-org";

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
        organizationKey: orgKey,
        displayName: "Entitlements Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: orgKey,
        hostname: "ent.blessboard.org",
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(provisioned.ok, true, provisioned.message);
      organizationId = provisioned.records.organization.id;

      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: orgKey,
        churchKey: "ent-church",
        displayName: "Entitlements Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
        timezone: "UTC",
        countryCode: "ZM",
      });
      assert.equal(church.ok, true, church.message);
      churchId = church.records.church.id;
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

  it("seeds configurable plans and assigns free on provision", async () => {
    requireDb();
    const plans = await pool.query(
      `SELECT plan_key FROM platform.plans WHERE product_key = 'blessboard' ORDER BY sort_order`
    );
    assert.deepEqual(
      plans.rows.map((r) => r.plan_key),
      ["free", "growth", "professional", "partner"]
    );

    const resolved = await resolveOrganizationEntitlements(pool, { organizationId });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.entitlements.planKey, "free");
    assert.equal(resolved.entitlements.subscriptionActive, true);
    assert.equal(getLimit(resolved.entitlements, FEATURE_KEYS.MAX_BRANCHES), 1);
    assert.equal(hasFeature(resolved.entitlements, FEATURE_KEYS.CUSTOM_DOMAIN), false);
    assert.equal(hasFeature(resolved.entitlements, FEATURE_KEYS.ADVANCED_REPORTS), false);
  });

  it("plan_key is immutable", async () => {
    requireDb();
    await assert.rejects(
      () =>
        pool.query(`UPDATE platform.plans SET plan_key = 'hacked' WHERE plan_key = 'free'`),
      /immutable/i
    );
  });

  it("enforces branch limits transactionally", async () => {
    requireDb();
    // Foundation (free) = max 1 active branch; church provision already created HQ (1).
    const blocked = await createBlessBoardBranch(pool, {
      churchId,
      organizationId,
      branchKey: "campus-a",
      displayName: "Campus A",
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, "limit_exceeded");
    assert.equal(blocked.reason, "max_branches");

    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.branches WHERE church_id = $1 AND status = 'active'`,
      [churchId]
    );
    assert.equal(count.rows[0].n, 1);
  });

  it("override raises branch limit without changing plan", async () => {
    requireDb();
    const ov = await setOrganizationEntitlementOverride(pool, {
      organizationId,
      featureKey: FEATURE_KEYS.MAX_BRANCHES,
      featureKind: "limit",
      limitValue: 3,
      reason: "pilot_exception",
    });
    assert.equal(ov.ok, true);

    const resolved = await resolveOrganizationEntitlements(pool, { organizationId });
    assert.equal(resolved.entitlements.planKey, "free");
    assert.equal(getLimit(resolved.entitlements, FEATURE_KEYS.MAX_BRANCHES), 3);
    assert.equal(resolved.entitlements.features[FEATURE_KEYS.MAX_BRANCHES].source, "override");

    const second = await createBlessBoardBranch(pool, {
      churchId,
      organizationId,
      branchKey: "campus-a",
      displayName: "Campus A",
    });
    assert.equal(second.ok, true, second.reason);

    const third = await createBlessBoardBranch(pool, {
      churchId,
      organizationId,
      branchKey: "campus-b",
      displayName: "Campus B",
    });
    assert.equal(third.ok, true, third.reason);

    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.branches WHERE church_id = $1 AND status = 'active'`,
      [churchId]
    );
    assert.equal(count.rows[0].n, 3);
  });

  it("feature checks fail closed for premium writes", async () => {
    requireDb();
    const domain = await assertFeature(pool, {
      organizationId,
      featureKey: FEATURE_KEYS.CUSTOM_DOMAIN,
    });
    assert.equal(domain.ok, false);
    assert.equal(domain.status, STATUS.FORBIDDEN);

    const email = await assertFeature(pool, {
      organizationId,
      featureKey: FEATURE_KEYS.CUSTOM_EMAIL,
    });
    assert.equal(email.ok, false);

    const advanced = await assertFeature(pool, {
      organizationId,
      featureKey: FEATURE_KEYS.ADVANCED_REPORTS,
    });
    assert.equal(advanced.ok, false);

    const basic = await assertFeature(pool, {
      organizationId,
      featureKey: FEATURE_KEYS.BASIC_REPORTS,
    });
    assert.equal(basic.ok, true);
  });

  it("custom domain provisioning fails closed on free plan", async () => {
    requireDb();
    const result = await provisionPlatformTenant(pool, {
      organizationKey: "ent-custom-domain",
      displayName: "Custom Domain Org",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "ent-custom-domain",
      hostname: "brand.example.com",
      domainType: "custom",
      deploymentCode: DEPLOYMENT,
      isPrimary: true,
    });
    assert.equal(result.ok, false);
    assert.match(String(result.message), /custom_domain_not_entitled/);
  });

  it("plan upgrade grants features; downgrade does not delete branches", async () => {
    requireDb();
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.branches WHERE church_id = $1 AND status = 'active'`,
      [churchId]
    );
    const branchCountBefore = before.rows[0].n;
    assert.ok(branchCountBefore >= 3);

    const up = await assignOrganizationPlan(pool, {
      organizationId,
      planKey: "professional",
    });
    assert.equal(up.ok, true);

    // Expire branch-limit override so plan features apply cleanly.
    await pool.query(
      `UPDATE platform.organization_entitlements
          SET starts_at = now() - interval '2 days',
              ends_at = now() - interval '1 day',
              updated_at = now()
        WHERE organization_id = $1 AND feature_key = 'max_branches'`,
      [organizationId]
    );

    const pro = await resolveOrganizationEntitlements(pool, { organizationId });
    assert.equal(pro.entitlements.planKey, "professional");
    assert.equal(hasFeature(pro.entitlements, FEATURE_KEYS.CUSTOM_DOMAIN), true);
    assert.equal(hasFeature(pro.entitlements, FEATURE_KEYS.ADVANCED_REPORTS), true);
    assert.equal(getLimit(pro.entitlements, FEATURE_KEYS.MAX_BRANCHES), null);

    const down = await assignOrganizationPlan(pool, {
      organizationId,
      planKey: "free",
    });
    assert.equal(down.ok, true);

    const free = await resolveOrganizationEntitlements(pool, { organizationId });
    assert.equal(free.entitlements.planKey, "free");
    assert.equal(getLimit(free.entitlements, FEATURE_KEYS.MAX_BRANCHES), 1);

    const after = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.branches WHERE church_id = $1 AND status = 'active'`,
      [churchId]
    );
    assert.equal(after.rows[0].n, branchCountBefore, "downgrade must not delete branches");

    const blocked = await assertCanCreateBranch(pool, { organizationId });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, STATUS.LIMIT_EXCEEDED);
  });

  it("expired subscription fails closed for writes; safe resolve softens reads", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.organization_subscriptions
          SET starts_at = now() - interval '2 days',
              ends_at = now() - interval '1 day',
              status = 'expired',
              updated_at = now()
        WHERE organization_id = $1 AND product_key = 'blessboard'
          AND status IN ('active', 'trialing', 'past_due')`,
      [organizationId]
    );

    const hard = await resolveOrganizationEntitlements(pool, { organizationId });
    assert.equal(hard.ok, true);
    assert.equal(hard.entitlements.subscriptionActive, false);
    assert.equal(hasFeature(hard.entitlements, FEATURE_KEYS.BASIC_REPORTS), false);

    const write = await assertFeature(pool, {
      organizationId,
      featureKey: FEATURE_KEYS.BASIC_REPORTS,
    });
    assert.equal(write.ok, false);
    assert.equal(write.status, STATUS.SUBSCRIPTION_INACTIVE);

    const soft = await resolveOrganizationEntitlementsSafe(pool, { organizationId });
    assert.equal(soft.ok, true);
    assert.equal(soft.entitlements.subscriptionActive, false);

    const softBad = await resolveOrganizationEntitlementsSafe(pool, {
      organizationId: "not-a-uuid",
    });
    assert.equal(softBad.ok, true);
    assert.equal(softBad.soft, true);
    assert.equal(softBad.entitlements.reason, "unavailable");

    // Restore active free for further suite safety
    await assignOrganizationPlan(pool, {
      organizationId,
      planKey: "free",
      status: "active",
      clearEndsAt: true,
    });
  });

  it("does not hardcode plan keys in V5 route modules", async () => {
    requireDb();
    const routeFiles = [
      "src/blessboard/http/hqAdminRoutes.js",
      "src/blessboard/http/branchAdminRoutes.js",
      "src/blessboard/http/contentAdminRoutes.js",
      "src/blessboard/http/tenantPublicRoutes.js",
      "src/platform/http/platformAdminRoutes.js",
    ];
    for (const rel of routeFiles) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      assert.doesNotMatch(text, /plan_key\s*===\s*['"]free['"]/);
      assert.doesNotMatch(text, /['"]professional['"]\s*===/);
      assert.doesNotMatch(text, /max_branches\s*[<=>]=?\s*\d+/);
    }
  });

  it("isolates V4 legacy plan logic from V5 entitlement tables", async () => {
    requireDb();
    const v4Plans = fs.readFileSync(path.join(ROOT, "src/church/churchPlans.js"), "utf8");
    assert.match(v4Plans, /custom_domain/);
    assert.doesNotMatch(v4Plans, /entitlementService|organization_subscriptions|platform\.plans/);

    const legacy = fs.readFileSync(path.join(ROOT, "server.legacy.js"), "utf8");
    assert.doesNotMatch(legacy, /entitlementService|organization_entitlements/);

    const publicPlans = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('plans', 'plan_features', 'organization_subscriptions')`
    );
    assert.equal(publicPlans.rows[0].n, 0);

    const platformPlans = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.plans WHERE product_key = 'blessboard'`
    );
    assert.ok(platformPlans.rows[0].n >= 4);
  });
});
