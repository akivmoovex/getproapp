"use strict";

/**
 * V5 Growth trial expiry → grace → Foundation downgrade (Prompt 10).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const crypto = require("crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  assignOrganizationPlan,
  resolveOrganizationEntitlements,
  hasFeature,
  getLimit,
  FEATURE_KEYS,
} = require("../src/platform/services/entitlementService");
const entitlementRepo = require("../src/platform/repositories/entitlementRepository");
const {
  runGrowthTrialExpiryBatch,
  classifyAction,
  DEFAULT_GRACE_DAYS,
  ACTION,
} = require("../src/platform/services/growthTrialExpiryService");
const { addCalendarDaysUtc } = require("../src/platform/time/addCalendarDaysUtc");
const { addGrowthTrialDurationUtc } = require("../src/platform/time/addGrowthTrialDurationUtc");

const IDENTITY_KEY = "blessboard-platform-v5";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

describe("V5 Growth trial expiry maintenance", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";

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

  async function provisionGrowthTrial(key, startsAt) {
    const prov = await provisionPlatformTenant(pool, {
      organizationKey: key,
      displayName: `Trial Org ${key}`,
      dataEnvironment: "testing",
      deploymentCode: "blessboard-org-v5",
      productKey: "blessboard",
      productTenantKey: key,
      hostname: `${key}.blessboard.org`,
      domainType: "canonical",
      isPrimary: true,
      subscriptionPlanKey: "growth",
      subscriptionStatus: "trialing",
      subscriptionStartsAt: startsAt.toISOString(),
      subscriptionEndsAt: addGrowthTrialDurationUtc(startsAt).toISOString(),
      subscriptionNotes: null,
    });
    assert.equal(prov.ok, true, prov.message || prov.status || prov.reason);
    return {
      organizationId: prov.records.organization.id,
      organizationKey: key,
    };
  }

  async function countOrgsAndSubs(organizationId) {
    const r = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM platform.organizations WHERE id = $1) AS orgs,
         (SELECT COUNT(*)::int FROM blessboard.churches WHERE organization_id = $1) AS churches,
         (SELECT COUNT(*)::int FROM blessboard.branches b
            JOIN blessboard.churches c ON c.id = b.church_id WHERE c.organization_id = $1) AS branches,
         (SELECT COUNT(*)::int FROM platform.organization_subscriptions WHERE organization_id = $1) AS subs,
         (SELECT COUNT(*)::int FROM platform.organization_subscriptions
           WHERE organization_id = $1 AND status IN ('active','trialing','past_due')) AS current_subs`,
      [organizationId]
    );
    return r.rows[0];
  }

  async function currentSub(organizationId, at) {
    return entitlementRepo.findCurrentSubscription(
      pool,
      organizationId,
      "blessboard",
      at.toISOString()
    );
  }

  async function auditCount(organizationId, actionKey) {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.audit_events
        WHERE organization_id = $1 AND action_key = $2`,
      [organizationId, actionKey]
    );
    return r.rows[0].n;
  }

  it("addCalendarDaysUtc and classifyAction basics", () => {
    const start = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    const plus7 = addCalendarDaysUtc(start, 7);
    assert.equal(plus7.toISOString(), "2026-01-22T12:00:00.000Z");
    assert.equal(DEFAULT_GRACE_DAYS, 7);

    const trialEnd = new Date(Date.UTC(2026, 1, 15, 10, 0, 0));
    const now = new Date(Date.UTC(2026, 1, 15, 10, 0, 1));
    const c = classifyAction(
      { plan_key: "growth", status: "trialing", ends_at: trialEnd },
      now,
      7
    );
    assert.equal(c.action, "enter_grace");
    assert.equal(c.graceEndsAt.toISOString(), addCalendarDaysUtc(trialEnd, 7).toISOString());

    const notYet = classifyAction(
      { plan_key: "growth", status: "trialing", ends_at: trialEnd },
      new Date(Date.UTC(2026, 1, 14, 10, 0, 0)),
      7
    );
    assert.equal(notYet.action, "skip");
    assert.equal(notYet.reason, "not_expired");
  });

  it("non-expired trial is ignored; dry-run mutates nothing", async () => {
    requireDb();
    const key = uniq("live");
    const startsAt = new Date(Date.UTC(2026, 5, 1, 8, 0, 0));
    const records = await provisionGrowthTrial(key, startsAt);
    const orgId = records.organizationId;
    const at = new Date(Date.UTC(2026, 5, 10, 8, 0, 0)); // still within month

    const dry = await runGrowthTrialExpiryBatch(pool, {
      dryRun: true,
      at,
      limit: 50,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(dry.ok, true);
    assert.equal(dry.summary.wouldEnterGrace, 0);
    assert.equal(dry.summary.wouldDowngrade, 0);

    const sub = await currentSub(orgId, at);
    assert.ok(sub);
    assert.equal(sub.status, "trialing");

    const before = await countOrgsAndSubs(orgId);
    const apply = await runGrowthTrialExpiryBatch(pool, {
      dryRun: false,
      at,
      limit: 50,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(apply.ok, true);
    assert.equal(apply.summary.enteredGrace, 0);
    assert.equal(apply.summary.downgraded, 0);
    const after = await countOrgsAndSubs(orgId);
    assert.deepEqual(after, before);
  });

  it("expired trial enters grace once with seven calendar days; entitlements stay Growth", async () => {
    requireDb();
    const key = uniq("grace");
    const startsAt = new Date(Date.UTC(2026, 0, 1, 9, 0, 0));
    const trialEnds = addGrowthTrialDurationUtc(startsAt);
    const records = await provisionGrowthTrial(key, startsAt);
    const orgId = records.organizationId;
    const at = new Date(trialEnds.getTime() + 1000);

    const first = await runGrowthTrialExpiryBatch(pool, {
      dryRun: false,
      at,
      graceDays: 7,
      limit: 50,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(first.ok, true);
    assert.equal(first.summary.enteredGrace, 1);

    const expectedGraceEnd = addCalendarDaysUtc(trialEnds, 7);
    const sub = await currentSub(orgId, at);
    assert.ok(sub);
    assert.equal(sub.status, "past_due");
    assert.equal(new Date(sub.endsAt).toISOString(), expectedGraceEnd.toISOString());

    const ents = await resolveOrganizationEntitlements(pool, {
      organizationId: orgId,
      at,
    });
    assert.equal(ents.ok, true);
    assert.equal(ents.entitlements.planKey, "growth");
    assert.equal(hasFeature(ents.entitlements, FEATURE_KEYS.ADVANCED_REPORTS), true);
    assert.equal(getLimit(ents.entitlements, FEATURE_KEYS.MAX_BRANCHES), null);

    assert.equal(await auditCount(orgId, ACTION.ENTERED_GRACE), 1);

    const second = await runGrowthTrialExpiryBatch(pool, {
      dryRun: false,
      at,
      graceDays: 7,
      limit: 50,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(second.summary.enteredGrace, 0);
    assert.equal(await auditCount(orgId, ACTION.ENTERED_GRACE), 1);

    const midGrace = new Date(at.getTime() + 3 * 24 * 60 * 60 * 1000);
    const still = await currentSub(orgId, midGrace);
    assert.equal(still.status, "past_due");
  });

  it("expired grace downgrades to one active Foundation; data intact; entitlements Foundation", async () => {
    requireDb();
    const key = uniq("down");
    const startsAt = new Date(Date.UTC(2026, 2, 1, 9, 0, 0));
    const trialEnds = addGrowthTrialDurationUtc(startsAt);
    const records = await provisionGrowthTrial(key, startsAt);
    const orgId = records.organizationId;

    const enterAt = new Date(trialEnds.getTime() + 1000);
    await runGrowthTrialExpiryBatch(pool, {
      dryRun: false,
      at: enterAt,
      graceDays: 7,
      deploymentCode: "blessboard-org-v5",
    });

    const graceEnds = addCalendarDaysUtc(trialEnds, 7);
    const before = await countOrgsAndSubs(orgId);
    assert.ok(before.branches >= 0);
    assert.ok(before.orgs === 1);

    const downgradeAt = new Date(graceEnds.getTime() + 1000);
    const dry = await runGrowthTrialExpiryBatch(pool, {
      dryRun: true,
      at: downgradeAt,
      graceDays: 7,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(dry.summary.wouldDowngrade >= 1, true);

    const stillGrace = await currentSub(orgId, enterAt);
    assert.equal(stillGrace.status, "past_due");

    const done = await runGrowthTrialExpiryBatch(pool, {
      dryRun: false,
      at: downgradeAt,
      graceDays: 7,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(done.summary.downgraded, 1);
    assert.equal(await auditCount(orgId, ACTION.DOWNGRADED), 1);

    const after = await countOrgsAndSubs(orgId);
    assert.equal(after.orgs, before.orgs);
    assert.equal(after.churches, before.churches);
    assert.equal(after.branches, before.branches);
    assert.equal(after.current_subs, 1);
    assert.ok(after.subs >= 2); // expired growth + active free

    const current = await currentSub(orgId, downgradeAt);
    assert.ok(current);
    assert.equal(current.status, "active");
    assert.equal(current.endsAt, null);
    const plan = await entitlementRepo.findPlanById(pool, current.planId);
    assert.equal(plan.planKey, "free");

    const ents = await resolveOrganizationEntitlements(pool, {
      organizationId: orgId,
      at: downgradeAt,
    });
    assert.equal(ents.entitlements.planKey, "free");
    assert.equal(hasFeature(ents.entitlements, FEATURE_KEYS.ADVANCED_REPORTS), false);
    assert.equal(getLimit(ents.entitlements, FEATURE_KEYS.MAX_BRANCHES), 1);

    // Idempotent re-run
    const again = await runGrowthTrialExpiryBatch(pool, {
      dryRun: false,
      at: downgradeAt,
      graceDays: 7,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(again.summary.downgraded, 0);
    assert.equal(await auditCount(orgId, ACTION.DOWNGRADED), 1);
    const currentSubs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organization_subscriptions
        WHERE organization_id = $1 AND status IN ('active','trialing','past_due')`,
      [orgId]
    );
    assert.equal(currentSubs.rows[0].n, 1);
  });

  it("active Growth (paid/retained marker) is not downgraded", async () => {
    requireDb();
    const key = uniq("paid");
    const startsAt = new Date(Date.UTC(2026, 0, 1, 9, 0, 0));
    const records = await provisionGrowthTrial(key, startsAt);
    const orgId = records.organizationId;

    // Operator-converted: active Growth, open window (no billing provider).
    const assigned = await assignOrganizationPlan(pool, {
      organizationId: orgId,
      planKey: "growth",
      status: "active",
      clearEndsAt: true,
      at: startsAt,
    });
    assert.equal(assigned.ok, true, assigned.reason);

    const late = new Date(Date.UTC(2026, 6, 1, 9, 0, 0));
    const result = await runGrowthTrialExpiryBatch(pool, {
      dryRun: false,
      at: late,
      limit: 50,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(result.ok, true);

    const sub = await currentSub(orgId, late);
    assert.ok(sub);
    assert.equal(sub.status, "active");
    const plan = await entitlementRepo.findPlanById(pool, sub.planId);
    assert.equal(plan.planKey, "growth");
    assert.equal(await auditCount(orgId, ACTION.DOWNGRADED), 0);
  });

  it("batch limit is respected", async () => {
    requireDb();
    const startsAt = new Date(Date.UTC(2025, 0, 1, 9, 0, 0));
    const trialEnds = addGrowthTrialDurationUtc(startsAt);
    const at = new Date(trialEnds.getTime() + 1000);
    const keys = [uniq("b1"), uniq("b2"), uniq("b3")];
    for (const key of keys) {
      await provisionGrowthTrial(key, startsAt);
    }
    const limited = await runGrowthTrialExpiryBatch(pool, {
      dryRun: false,
      at,
      limit: 2,
      graceDays: 7,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(limited.ok, true);
    assert.ok(limited.summary.candidates <= 2);
    assert.ok(limited.summary.enteredGrace <= 2);
  });

  it("concurrent processing does not double-apply grace", async () => {
    requireDb();
    const key = uniq("race");
    const startsAt = new Date(Date.UTC(2025, 5, 1, 9, 0, 0));
    const trialEnds = addGrowthTrialDurationUtc(startsAt);
    const records = await provisionGrowthTrial(key, startsAt);
    const orgId = records.organizationId;
    const at = new Date(trialEnds.getTime() + 5000);

    const [a, b] = await Promise.all([
      runGrowthTrialExpiryBatch(pool, {
        dryRun: false,
        at,
        graceDays: 7,
        deploymentCode: "blessboard-org-v5",
      }),
      runGrowthTrialExpiryBatch(pool, {
        dryRun: false,
        at,
        graceDays: 7,
        deploymentCode: "blessboard-org-v5",
      }),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(await auditCount(orgId, ACTION.ENTERED_GRACE), 1);
    const pastDue = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organization_subscriptions
        WHERE organization_id = $1 AND status = 'past_due'`,
      [orgId]
    );
    assert.equal(pastDue.rows[0].n, 1);
  });

  it("V4 growth-trial job script is untouched (path exists, not imported by V5 service)", () => {
    const v4Job = path.join(__dirname, "../scripts/run-church-growth-trial-jobs.js");
    assert.equal(fs.existsSync(v4Job), true);
    const servicePath = path.join(
      __dirname,
      "../src/platform/services/growthTrialExpiryService.js"
    );
    const src = fs.readFileSync(servicePath, "utf8");
    assert.doesNotMatch(src, /churchGrowthTrialService|run-church-growth-trial/);
    assert.doesNotMatch(src, /church_packages|package_subscriptions/);
  });
});
