"use strict";

/**
 * Growth trial duration helper + Foundation→Growth offer lifecycle (Prompt 41).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  addGrowthTrialDurationUtc,
  GROWTH_TRIAL_DURATION_DAYS,
} = require("../src/platform/time/addGrowthTrialDurationUtc");
const { addOneCalendarMonthUtc } = require("../src/platform/time/addOneCalendarMonth");
const {
  buildSubscriptionAssignment,
  PLAN_KEY_GROWTH,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  createGrowthTrialOffer,
  acceptGrowthTrialOffer,
  getGrowthTrialOfferState,
  grantGrowthTrialException,
  ELIGIBILITY,
} = require("../src/platform/services/growthTrialOfferService");
const { runGrowthTrialExpiryBatch } = require("../src/platform/services/growthTrialExpiryService");
const { NETWORK_SUPPORT_SUCCESS_MESSAGE } = require("../src/blessboard/services/platformChurchRegistrationService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const SESSION_SECRET = "test-session-secret-at-least-32-chars!!";

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function extractCsrf(html) {
  const m = String(html || "").match(/name="_csrf"[^>]*value="([^"]+)"/);
  return (m && m[1]) || null;
}

describe("addGrowthTrialDurationUtc (30-day policy)", () => {
  it("uses exactly 30 days, not calendar month", () => {
    assert.equal(GROWTH_TRIAL_DURATION_DAYS, 30);
    const jan1 = new Date(Date.UTC(2026, 0, 1, 10, 0, 0));
    const end = addGrowthTrialDurationUtc(jan1);
    assert.equal(end.toISOString(), "2026-01-31T10:00:00.000Z");

    const jan31 = new Date(Date.UTC(2026, 0, 31, 10, 0, 0));
    assert.equal(
      addGrowthTrialDurationUtc(jan31).toISOString(),
      "2026-03-02T10:00:00.000Z"
    );

    const feb1 = new Date(Date.UTC(2026, 1, 1, 10, 0, 0));
    assert.equal(addGrowthTrialDurationUtc(feb1).toISOString(), "2026-03-03T10:00:00.000Z");

    // Distinct from calendar-month for Jan 31.
    assert.notEqual(
      addGrowthTrialDurationUtc(jan31).toISOString(),
      addOneCalendarMonthUtc(jan31).toISOString()
    );
  });

  it("buildSubscriptionAssignment uses 30-day ends_at and trial source", () => {
    const start = new Date(Date.UTC(2026, 5, 15, 12, 30, 0));
    const assignment = buildSubscriptionAssignment(PLAN_KEY_GROWTH, start);
    assert.equal(assignment.subscriptionStatus, "trialing");
    assert.equal(assignment.subscriptionTrialSource, "direct_growth_registration");
    assert.equal(
      assignment.subscriptionEndsAt,
      addGrowthTrialDurationUtc(start).toISOString()
    );
  });
});

describe("Foundation Growth trial offer lifecycle", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgId;
  let orgKey = "offer-foundation-org";
  let hqUser;
  let branchUser;
  let hqCookie;
  let branchCookie;
  let paUser;
  let churchId;

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
        displayName: "Offer Foundation Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: orgKey,
        hostname: `${orgKey}.blessboard.org`,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
        subscriptionPlanKey: "free",
        subscriptionStatus: "active",
      });
      assert.equal(provisioned.ok, true, provisioned.message);
      orgId = provisioned.records.organization.id;

      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: orgKey,
        churchKey: orgKey,
        displayName: "Offer Foundation Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(church.ok, true, church.message);
      churchId = church.records.church.id;

      const hq = await createBlessBoardUser(pool, {
        email: "hq-offer@example.org",
        displayName: "HQ Offer",
        password: PASSWORD,
      });
      assert.equal(hq.ok, true);
      hqUser = hq.user;
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "hq-offer@example.org",
            organizationKey: orgKey,
            roleKey: "church_hq_admin",
            churchKey: orgKey,
          })
        ).ok,
        true
      );

      const branch = await createBlessBoardUser(pool, {
        email: "branch-offer@example.org",
        displayName: "Branch Offer",
        password: PASSWORD,
      });
      assert.equal(branch.ok, true);
      branchUser = branch.user;
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "branch-offer@example.org",
            organizationKey: orgKey,
            roleKey: "branch_admin",
            churchKey: orgKey,
            branchKey: "hq",
          })
        ).ok,
        true
      );

      const pa = await createBlessBoardUser(pool, {
        email: "pa-offer@example.org",
        displayName: "PA Offer",
        password: PASSWORD,
      });
      assert.equal(pa.ok, true);
      paUser = pa.user;
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "pa-offer@example.org",
            organizationKey: orgKey,
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );

      const hqSession = await createV5Session(pool, {
        deploymentCode: "blessboard-org-v5",
        userId: hqUser.id,
        organizationId: orgId,
        churchId,
      });
      assert.equal(hqSession.ok, true);
      hqCookie = `${DEFAULT_V5_COOKIE}=${hqSession.rawToken}`;

      const branchSession = await createV5Session(pool, {
        deploymentCode: "blessboard-org-v5",
        userId: branchUser.id,
        organizationId: orgId,
        churchId,
      });
      assert.equal(branchSession.ok, true);
      branchCookie = `${DEFAULT_V5_COOKIE}=${branchSession.rawToken}`;

      app = createV5FoundationApp({
        env: {
          NODE_ENV: "test",
          DEPLOYMENT_ENV: "testing",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
          SESSION_SECRET,
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
          BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
          BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
        },
        getPool: () => pool,
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

  it("1. new Foundation organization is eligible", async () => {
    requireDb();
    const state = await getGrowthTrialOfferState(pool, orgId);
    assert.equal(state.ok, true);
    assert.equal(state.state, ELIGIBILITY.ELIGIBLE);
  });

  it("2. viewing settings does not start a trial", async () => {
    requireDb();
    const page = await request(app)
      .get("/hq/settings")
      .set("Host", `${orgKey}.blessboard.org`)
      .set("Cookie", hqCookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-bb-hq-growth-trial="1"/);
    const sub = await pool.query(
      `SELECT pl.plan_key, os.status
         FROM platform.organization_subscriptions os
         INNER JOIN platform.plans pl ON pl.id = os.plan_id
        WHERE os.organization_id = $1 AND os.status IN ('active','trialing','past_due')
        ORDER BY os.created_at DESC LIMIT 1`,
      [orgId]
    );
    assert.equal(sub.rows[0].plan_key, "free");
    assert.equal(sub.rows[0].status, "active");
  });

  it("3–7. HQ can accept after offer; branch cannot; 30-day window; idempotent", async () => {
    requireDb();
    const offered = await createGrowthTrialOffer(pool, {
      organizationId: orgId,
      actorUserId: paUser.id,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(offered.ok, true, JSON.stringify(offered));

    const branchPage = await request(app)
      .get("/hq/settings")
      .set("Host", `${orgKey}.blessboard.org`)
      .set("Cookie", branchCookie);
    assert.ok([403, 303].includes(branchPage.status) || !branchPage.text.includes("accept_growth_trial"));

    const hqPage = await request(app)
      .get("/hq/settings")
      .set("Host", `${orgKey}.blessboard.org`)
      .set("Cookie", hqCookie);
    assert.equal(hqPage.status, 200);
    assert.match(hqPage.text, /accept_growth_trial/);
    const csrf = extractCsrf(hqPage.text);
    const csrfCookie = extractCookie(hqPage, CSRF_COOKIE);

    const before = Date.now();
    const accept = await request(app)
      .post("/hq/settings")
      .set("Host", `${orgKey}.blessboard.org`)
      .set("Cookie", `${hqCookie}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        action: "accept_growth_trial",
        confirm_accept_trial: "1",
      });
    assert.equal(accept.status, 303);
    assert.match(accept.headers.location || "", /trial_accepted=1/);
    const after = Date.now();

    const sub = await pool.query(
      `SELECT os.id, os.status, os.starts_at, os.ends_at, os.trial_source, pl.plan_key
         FROM platform.organization_subscriptions os
         INNER JOIN platform.plans pl ON pl.id = os.plan_id
        WHERE os.organization_id = $1 AND os.status = 'trialing'
        ORDER BY os.created_at DESC LIMIT 1`,
      [orgId]
    );
    assert.equal(sub.rows[0].plan_key, "growth");
    assert.equal(sub.rows[0].trial_source, "foundation_trial_offer");
    const starts = new Date(sub.rows[0].starts_at);
    const ends = new Date(sub.rows[0].ends_at);
    assert.ok(starts.getTime() >= before - 2000 && starts.getTime() <= after + 2000);
    assert.equal(ends.toISOString(), addGrowthTrialDurationUtc(starts).toISOString());

    const again = await acceptGrowthTrialOffer(pool, {
      organizationId: orgId,
      actorUserId: hqUser.id,
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(again.ok, true);
    assert.equal(again.alreadyAccepted, true);

    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organization_subscriptions
        WHERE organization_id = $1 AND status = 'trialing'`,
      [orgId]
    );
    assert.equal(count.rows[0].n, 1);
  });

  it("8–9. second intro trial blocked; exception requires reason", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.organization_growth_trial_offers
          SET status = 'canceled', canceled_at = now(), updated_at = now()
        WHERE organization_id = $1 AND status = 'offered'`,
      [orgId]
    );
    await pool.query(
      `UPDATE blessboard.organization_growth_trial_offers
          SET status = 'consumed', updated_at = now()
        WHERE organization_id = $1
          AND is_exception = false
          AND status IN ('accepted', 'active', 'expired')`,
      [orgId]
    );
    await pool.query(
      `UPDATE platform.organization_subscriptions
          SET status = 'expired', updated_at = now()
        WHERE organization_id = $1 AND status IN ('active','trialing','past_due')`,
      [orgId]
    );
    const freePlan = await pool.query(
      `SELECT id FROM platform.plans WHERE plan_key = 'free' AND product_key = 'blessboard' LIMIT 1`
    );
    await pool.query(
      `INSERT INTO platform.organization_subscriptions
         (organization_id, product_key, plan_id, status, starts_at, ends_at)
       VALUES ($1, 'blessboard', $2, 'active', now(), NULL)`,
      [orgId, freePlan.rows[0].id]
    );

    const state = await getGrowthTrialOfferState(pool, orgId);
    assert.equal(state.state, ELIGIBILITY.CONSUMED);

    const noReason = await grantGrowthTrialException(pool, {
      organizationId: orgId,
      actorUserId: paUser.id,
      reason: "",
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(noReason.ok, false);

    const granted = await grantGrowthTrialException(pool, {
      organizationId: orgId,
      actorUserId: paUser.id,
      reason: "support approved re-offer after provisioning issue",
      deploymentCode: "blessboard-org-v5",
    });
    assert.equal(granted.ok, true, JSON.stringify(granted));

    const audit = await pool.query(
      `SELECT action_key FROM platform.audit_events
        WHERE action_key = 'growth_trial.exception_granted'
        ORDER BY created_at DESC LIMIT 1`
    );
    assert.ok(audit.rowCount >= 1);
  });

  it("Network public message is exact and support validation entry status", () => {
    assert.equal(
      NETWORK_SUPPORT_SUCCESS_MESSAGE,
      "Thank you for your interest in the BlessBoard Network plan. Your registration has been received successfully. Our customer support team will contact you shortly to validate your organization's requirements and guide you through the next steps."
    );
  });
});
