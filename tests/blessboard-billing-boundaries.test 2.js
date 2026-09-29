"use strict";

/**
 * Prompt 25 — V5 billing integration boundaries (no payment provider).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
  assignOrganizationPlan,
  resolveOrganizationEntitlements,
  FEATURE_KEYS,
  hasFeature,
} = require("../src/platform/services/entitlementService");
const {
  activatePaidSubscription,
  activatePaidSubscriptionByOrganizationKey,
  recordPaymentFailure,
  cancelAtPeriodEnd,
  synchronizeBillingState,
  PAYMENT_STATUS,
  STATUS: BILLING_STATUS,
  resolvePaidPlanKey,
} = require("../src/platform/services/billingSubscriptionService");
const {
  runGrowthTrialExpiryBatch,
} = require("../src/platform/services/growthTrialExpiryService");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT = "blessboard-org-staging";
const PASSWORD = "correct-horse-battery-staple";
const HOST = "bill-a.blessboard.org";
const APEX = "blessboard.org";
const ROOT = path.join(__dirname, "..");

describe("blessboard V5 billing integration boundaries", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let org;
  let church;
  let hqBranchId;
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

      const prov = await provisionPlatformTenant(pool, {
        organizationKey: "bill-a",
        displayName: "Billing Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "bill-a",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message);
      org = prov.records.organization;

      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "bill-a",
        churchKey: "bill-a",
        displayName: "Billing Church A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;

      const hq = await pool.query(
        `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'hq'`,
        [church.id]
      );
      hqBranchId = hq.rows[0].id;

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        return created.user;
      }

      users.hq = await makeUser("hq-bill@example.org", "HQ Bill", {
        email: "hq-bill@example.org",
        organizationKey: "bill-a",
        roleKey: "church_hq_admin",
        churchKey: "bill-a",
      });
      users.pa = await makeUser("pa-bill@example.org", "PA Bill", {
        email: "pa-bill@example.org",
        organizationKey: "bill-a",
        roleKey: "platform_admin",
      });

      app = createV5FoundationApp({
        getPool: () => pool,
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
          BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
          BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
          BLESSBOARD_APEX_DOMAINS: APEX,
          BLESSBOARD_CANONICAL_DOMAIN: APEX,
        },
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("maps Network public label to professional plan key", () => {
    assert.equal(resolvePaidPlanKey("network"), "professional");
    assert.equal(resolvePaidPlanKey("professional"), "professional");
    assert.equal(resolvePaidPlanKey("growth"), "growth");
  });

  it("1. Paid Growth activation prevents trial downgrade", async () => {
    requireDb();
    const started = await assignOrganizationPlan(pool, {
      organizationId: org.id,
      planKey: "growth",
      status: "trialing",
      clearEndsAt: true,
      notes: "trial for billing test",
    });
    assert.equal(started.ok, true, started.reason);

    const endsAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const startsAt = new Date(endsAt.getTime() - 30 * 24 * 60 * 60 * 1000);
    await pool.query(
      `UPDATE platform.organization_subscriptions
          SET status = 'trialing',
              starts_at = $2::timestamptz,
              ends_at = $3::timestamptz,
              updated_at = now()
        WHERE id = $1`,
      [started.subscription.id, startsAt.toISOString(), endsAt.toISOString()]
    );

    const paid = await activatePaidSubscription(pool, {
      organizationId: org.id,
      planKey: "growth",
      source: "manual_external",
      reason: "Customer converted before expiry",
      actorUserId: users.pa.id,
      billingCustomerRef: "ext-cust-1",
      billingSubscriptionRef: "ext-sub-1",
    });
    assert.equal(paid.ok, true, paid.reason);
    assert.equal(paid.subscription.billingPaymentStatus, PAYMENT_STATUS.EXTERNALLY_PAID);
    assert.equal(paid.subscription.status, "active");
    assert.equal(paid.subscription.endsAt, null);

    const batch = await runGrowthTrialExpiryBatch(pool, {
      dryRun: false,
      deploymentCode: DEPLOYMENT,
      at: new Date(),
      limit: 50,
      graceDays: 7,
    });
    assert.equal(batch.ok, true, batch.reason);

    const sub = await pool.query(
      `SELECT os.status, os.ends_at, os.billing_payment_status, pl.plan_key
         FROM platform.organization_subscriptions os
         INNER JOIN platform.plans pl ON pl.id = os.plan_id
        WHERE os.organization_id = $1
          AND os.status IN ('active', 'trialing', 'past_due')
        ORDER BY os.updated_at DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(sub.rows[0].plan_key, "growth");
    assert.equal(sub.rows[0].status, "active");
    assert.equal(sub.rows[0].billing_payment_status, "externally_paid");
  });

  it("2. Payment failure enters canonical state", async () => {
    requireDb();
    const failed = await recordPaymentFailure(pool, {
      organizationId: org.id,
      reason: "card_declined",
      eventId: "evt_fail_1",
      billingSubscriptionRef: "ext-sub-1",
    });
    assert.equal(failed.ok, true, failed.reason);
    assert.equal(failed.subscription.billingPaymentStatus, PAYMENT_STATUS.FAILED);
    assert.equal(failed.subscription.status, "past_due");

    const audit = await pool.query(
      `SELECT outcome FROM platform.audit_events
        WHERE organization_id = $1 AND action_key = 'billing.payment_failed'
        ORDER BY created_at DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(audit.rows[0].outcome, "success");
  });

  it("3. Manual activation is audited", async () => {
    requireDb();
    // Restore entitled Growth paid for subsequent cases
    const restored = await activatePaidSubscription(pool, {
      organizationId: org.id,
      planKey: "growth",
      source: "manual_external",
      reason: "Restore after failure test",
      actorUserId: users.pa.id,
      billingSubscriptionRef: "ext-sub-restore",
    });
    assert.equal(restored.ok, true, restored.reason);

    const audit = await pool.query(
      `SELECT outcome, actor_user_id, metadata_json
         FROM platform.audit_events
        WHERE organization_id = $1 AND action_key = 'billing.paid_activated'
        ORDER BY created_at DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(audit.rows[0].outcome, "success");
    assert.equal(String(audit.rows[0].actor_user_id), String(users.pa.id));
    const meta =
      typeof audit.rows[0].metadata_json === "string"
        ? JSON.parse(audit.rows[0].metadata_json)
        : audit.rows[0].metadata_json;
    assert.equal(meta.reason_code, "manual_external");
    assert.equal(meta.plan_key, "growth");
  });

  it("4. Network activation assigns professional plan correctly", async () => {
    requireDb();
    const network = await activatePaidSubscriptionByOrganizationKey(pool, {
      organizationKey: "bill-a",
      planKey: "network",
      reason: "Signed Network contract NC-100",
      confirmed: true,
      actorUserId: users.pa.id,
      billingCustomerRef: "contract-nc-100",
    });
    assert.equal(network.ok, true, network.reason);
    assert.equal(network.plan.planKey, "professional");
    assert.equal(network.subscription.billingPaymentStatus, PAYMENT_STATUS.EXTERNALLY_PAID);

    const resolved = await resolveOrganizationEntitlements(pool, {
      organizationId: org.id,
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.entitlements.planKey, "professional");
    assert.equal(resolved.entitlements.subscriptionActive, true);
  });

  it("5. Duplicate provider events are idempotent at service level", async () => {
    requireDb();
    const first = await activatePaidSubscription(pool, {
      organizationId: org.id,
      planKey: "professional",
      source: "provider",
      reason: "provider_sync",
      billingProvider: "future_provider",
      billingSubscriptionRef: "prov-sub-dup",
      billingCustomerRef: "prov-cust-dup",
      eventId: "evt_dup_1",
    });
    assert.equal(first.ok, true, first.reason);

    const second = await activatePaidSubscription(pool, {
      organizationId: org.id,
      planKey: "professional",
      source: "provider",
      reason: "provider_sync",
      billingProvider: "future_provider",
      billingSubscriptionRef: "prov-sub-dup",
      billingCustomerRef: "prov-cust-dup",
      eventId: "evt_dup_1",
    });
    assert.equal(second.ok, true, second.reason);
    assert.equal(second.idempotent, true);

    const sync1 = await synchronizeBillingState(pool, {
      organizationId: org.id,
      billingProvider: "future_provider",
      billingSubscriptionRef: "prov-sub-dup",
      billingPaymentStatus: "succeeded",
    });
    assert.equal(sync1.ok, true);
    const sync2 = await synchronizeBillingState(pool, {
      organizationId: org.id,
      billingProvider: "future_provider",
      billingSubscriptionRef: "prov-sub-dup",
      billingPaymentStatus: "succeeded",
    });
    assert.equal(sync2.ok, true);
    assert.equal(sync2.idempotent, true);

    const cancel1 = await cancelAtPeriodEnd(pool, {
      organizationId: org.id,
      billingCurrentPeriodEnd: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    assert.equal(cancel1.ok, true);
    const cancel2 = await cancelAtPeriodEnd(pool, { organizationId: org.id });
    assert.equal(cancel2.ok, true);
    assert.equal(cancel2.idempotent, true);
  });

  it("6. Tenant users cannot alter billing", async () => {
    requireDb();
    const session = await createV5Session(pool, {
      deploymentCode: DEPLOYMENT,
      userId: users.hq.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: hqBranchId,
    });
    assert.equal(session.ok, true);
    const cookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;

    const tenantPost = await request(app)
      .post("/admin/organizations/bill-a/billing/activate-paid")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .type("form")
      .send({
        plan_key: "growth",
        reason: "should fail",
        confirm_billing_activation: "1",
      });
    // Apex-only PA routes: tenant host must not succeed as billing mutation
    assert.ok(tenantPost.status === 403 || tenantPost.status === 404 || tenantPost.status === 503);

    const hqBilling = await request(app)
      .post("/hq/billing/activate-paid")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .type("form")
      .send({ plan_key: "growth", reason: "no" });
    assert.ok(hqBilling.status === 404 || hqBilling.status >= 400);

    // Static: no tenant HQ/BA billing mutation routes
    const hqRoutes = fs.readFileSync(
      path.join(ROOT, "src/blessboard/http/hqAdminRoutes.js"),
      "utf8"
    );
    assert.doesNotMatch(hqRoutes, /billing\/activate|activatePaidSubscription/);
  });

  it("7. Entitlements follow product subscription state", async () => {
    requireDb();
    const resolved = await resolveOrganizationEntitlements(pool, {
      organizationId: org.id,
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.entitlements.planKey, "professional");
    assert.equal(hasFeature(resolved.entitlements, FEATURE_KEYS.BASIC_REPORTS), true);
    // Provider payment strings must not be required for entitlement boolean
    assert.equal(typeof resolved.entitlements.subscriptionActive, "boolean");
  });

  it("8. Existing registration remains provider-independent", async () => {
    requireDb();
    const regService = fs.readFileSync(
      path.join(ROOT, "src/blessboard/services/platformChurchRegistrationService.js"),
      "utf8"
    );
    const provision = fs.readFileSync(
      path.join(ROOT, "src/blessboard/services/provisionRegisteredBlessBoardChurch.js"),
      "utf8"
    );
    assert.doesNotMatch(regService, /billingSubscriptionService|stripe|paypal/i);
    assert.doesNotMatch(provision, /billingSubscriptionService|stripe|paypal/i);

    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'organization_subscriptions'
          AND column_name LIKE 'billing_%'
        ORDER BY column_name`
    );
    const names = cols.rows.map((r) => r.column_name);
    assert.ok(names.includes("billing_payment_status"));
    assert.ok(names.includes("billing_provider"));
    assert.ok(names.includes("billing_customer_ref"));
    assert.ok(names.includes("billing_subscription_ref"));
    assert.ok(names.includes("billing_current_period_end"));
    assert.ok(names.includes("billing_cancel_at_period_end"));
    assert.ok(names.includes("billing_synced_at"));
  });
});
