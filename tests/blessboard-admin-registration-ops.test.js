"use strict";

/**
 * Prompt 11 — registration operations in existing platform-admin screens.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { provisionRegisteredBlessBoardChurch } = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  listRegistrationApplicationsAdmin,
  normalizeListFilters,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const {
  listPlatformOrganizations,
  normalizeListInput: normalizeOrgList,
  MAX_LIMIT: ORG_MAX_LIMIT,
} = require("../src/platform/services/listPlatformOrganizations");
const {
  listPlatformSubscriptions,
  normalizeListInput: normalizeSubList,
  MAX_LIMIT: SUB_MAX_LIMIT,
} = require("../src/platform/services/listPlatformSubscriptions");
const {
  mapDirectoryPlanFilterToDbPlanKey,
  DB_PLAN_KEYS,
} = require("../src/blessboard/services/registrationPlanMapping");
const { addGrowthTrialDurationUtc } = require("../src/platform/time/addGrowthTrialDurationUtc");
const { addCalendarDaysUtc } = require("../src/platform/time/addCalendarDaysUtc");
const platformAdminRepo = require("../src/platform/repositories/platformAdminRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";

const ADMIN_ROUTES = Object.freeze([
  "/admin",
  "/admin/organizations",
  "/admin/registration-applications",
  "/admin/plans",
  "/admin/subscriptions",
]);

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

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

function extractCsrfToken(html) {
  const m = String(html || "").match(
    new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
  );
  return (m && (m[1] || m[2])) || null;
}

describe("platform-admin registration operations (Prompt 11)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let users = {};
  let fixtures = {};

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

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.platform = await makeUser("ops-pa@example.org", "Ops Platform Admin");
      users.hq = await makeUser("ops-hq@example.org", "Ops HQ Admin");
      users.member = await makeUser("ops-member@example.org", "Ops Member");

      // Foundation registration (provisioned)
      const foundationKey = uniq("opsfound");
      const foundationApp = await appRepo.createApplication(pool, {
        church_name: `Foundation Ops Church ${foundationKey}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "Foundation Contact",
        contact_email: `${foundationKey}@example.org`,
        contact_phone: "+254711000111",
        contact_phone_normalized: "+254711000111",
        role_in_church: "Administrator",
        selected_plan: "foundation",
        consent_terms: true,
      });
      const foundationProv = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: foundationApp.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: foundationKey,
        requestId: "ops-foundation",
        actorContext: {
          type: "test",
          source: "prompt11",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-v5",
        },
      });
      assert.equal(foundationProv.ok, true, foundationProv.message);
      fixtures.foundationAppId = foundationApp.id;
      fixtures.foundationOrgKey = foundationProv.records.organizationKey;
      fixtures.foundationOrgId = foundationProv.records.organizationId;
      fixtures.foundationChurchName = foundationApp.church_name;

      // Growth trial org
      const growthKey = uniq("opsgrowth");
      const trialStart = new Date();
      const trialEnd = addGrowthTrialDurationUtc(trialStart);
      const growthProv = await provisionPlatformTenant(pool, {
        organizationKey: growthKey,
        displayName: `Growth Trial ${growthKey}`,
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-v5",
        productKey: "blessboard",
        productTenantKey: growthKey,
        hostname: `${growthKey}.blessboard.org`,
        domainType: "canonical",
        isPrimary: true,
        subscriptionPlanKey: "growth",
        subscriptionStatus: "trialing",
        subscriptionStartsAt: trialStart.toISOString(),
        subscriptionEndsAt: trialEnd.toISOString(),
      });
      assert.equal(growthProv.ok, true, growthProv.message);
      fixtures.growthOrgKey = growthKey;
      fixtures.growthOrgId = growthProv.records.organization.id;
      fixtures.growthTrialEndsAt = trialEnd.toISOString().slice(0, 10);

      // Growth in grace
      const graceKey = uniq("opsgrace");
      const graceEnd = addCalendarDaysUtc(new Date(), 5);
      const graceProv = await provisionPlatformTenant(pool, {
        organizationKey: graceKey,
        displayName: `Grace Org ${graceKey}`,
        dataEnvironment: "testing",
        deploymentCode: "blessboard-org-v5",
        productKey: "blessboard",
        productTenantKey: graceKey,
        hostname: `${graceKey}.blessboard.org`,
        domainType: "canonical",
        isPrimary: true,
        subscriptionPlanKey: "growth",
        subscriptionStatus: "past_due",
        subscriptionStartsAt: addCalendarDaysUtc(new Date(), -10).toISOString(),
        subscriptionEndsAt: graceEnd.toISOString(),
      });
      assert.equal(graceProv.ok, true, graceProv.message);
      fixtures.graceOrgKey = graceKey;
      fixtures.graceDeadline = graceEnd.toISOString().slice(0, 10);

      // Network support-contact application
      const networkApp = await appRepo.createApplication(pool, {
        church_name: "Network Support Ops Church",
        country: "Uganda",
        city: "Kampala",
        contact_name: "Network Contact",
        contact_email: `${uniq("net")}@example.org`,
        contact_phone: "+256700111222",
        contact_phone_normalized: "+256700111222",
        role_in_church: "Pastor",
        selected_plan: "network",
        consent_terms: true,
        support_requested: true,
        follow_up_status: "new",
      });
      fixtures.networkAppId = networkApp.id;
      fixtures.networkChurchName = networkApp.church_name;

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "ops-pa@example.org",
            organizationKey: fixtures.foundationOrgKey,
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "ops-hq@example.org",
            organizationKey: fixtures.foundationOrgKey,
            roleKey: "church_hq_admin",
            churchKey: fixtures.foundationOrgKey,
          })
        ).ok,
        true
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
          BLESSBOARD_TENANT_ROUTING_MODE: "off",
        },
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

  async function cookieFor(user, organizationId = fixtures.foundationOrgId) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
      userId: user.id,
      organizationId,
      churchId: null,
      branchId: null,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("maps Network directory filter to professional DB key", () => {
    assert.equal(mapDirectoryPlanFilterToDbPlanKey("network"), DB_PLAN_KEYS.PROFESSIONAL);
    assert.equal(mapDirectoryPlanFilterToDbPlanKey("professional"), DB_PLAN_KEYS.PROFESSIONAL);
    const orgNorm = normalizeOrgList({ plan: "network" });
    assert.equal(orgNorm.ok, true);
    assert.equal(orgNorm.value.plan, DB_PLAN_KEYS.PROFESSIONAL);
    const subNorm = normalizeSubList({ plan: "network" });
    assert.equal(subNorm.ok, true);
    assert.equal(subNorm.value.planKey, DB_PLAN_KEYS.PROFESSIONAL);
  });

  it("rejects or ignores unsupported filters safely", () => {
    const badOrg = normalizeOrgList({ plan: "enterprise_gold" });
    assert.equal(badOrg.ok, false);
    assert.equal(badOrg.reason, "plan");

    const badSub = normalizeSubList({ plan: "not-a-plan", status: "magic" });
    assert.equal(badSub.ok, false);

    const badEnding = normalizeSubList({ ending_soon: "maybe" });
    assert.equal(badEnding.ok, false);
    assert.equal(badEnding.reason, "ending_soon");

    const reg = normalizeListFilters({
      selected_plan: "professional",
      requires_review: "maybe",
    });
    assert.equal(reg.ok, false);
    assert.equal(reg.reason, "requires_review");

    const regIgnoredPlan = normalizeListFilters({ selected_plan: "professional" });
    assert.equal(regIgnoredPlan.ok, true);
    assert.equal(regIgnoredPlan.value.selectedPlan, null);
  });

  it("bounds pagination for org and subscription lists", () => {
    const org = normalizeOrgList({ page: "0", limit: "9999" });
    assert.equal(org.ok, true);
    assert.equal(org.value.page, 1);
    assert.equal(org.value.limit, ORG_MAX_LIMIT);

    const sub = normalizeSubList({ page: "-3", limit: "500" });
    assert.equal(sub.ok, true);
    assert.equal(sub.value.page, 1);
    assert.equal(sub.value.limit, SUB_MAX_LIMIT);

    const reg = normalizeListFilters({ limit: "1000" });
    assert.equal(reg.ok, true);
    assert.equal(reg.value.limit, 100);
  });

  it("list services avoid N+1 (bounded query count)", async () => {
    requireDb();
    let orgQueries = 0;
    let subQueries = 0;
    let regQueries = 0;
    const original = pool.query.bind(pool);
    pool.query = (text, params) => {
      const sql = String(text || "");
      if (/FROM platform\.organizations\b/i.test(sql) && /LIMIT/i.test(sql)) orgQueries += 1;
      if (/COUNT\(DISTINCT o\.id\)/i.test(sql) || /COUNT\(\*\)::int AS total[\s\S]*FROM platform\.organizations/i.test(sql)) {
        orgQueries += 1;
      }
      if (/FROM platform\.organization_subscriptions\b/i.test(sql)) subQueries += 1;
      if (/platform_church_registration_applications/i.test(sql)) regQueries += 1;
      return original(text, params);
    };
    try {
      const orgs = await listPlatformOrganizations(pool, { limit: 25, page: 1 });
      assert.equal(orgs.ok, true);
      assert.ok(orgQueries <= 4, `org query count too high: ${orgQueries}`);

      const subs = await listPlatformSubscriptions(pool, { limit: 25, page: 1 });
      assert.equal(subs.ok, true);
      assert.ok(subQueries <= 4, `sub query count too high: ${subQueries}`);

      const regs = await listRegistrationApplicationsAdmin(pool, { limit: 25, page: 1 });
      assert.equal(regs.ok, true);
      assert.ok(regQueries <= 4, `reg query count too high: ${regQueries}`);
    } finally {
      pool.query = original;
    }
  });

  it("platform admin linked routes return 200", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    for (const path of ADMIN_ROUTES) {
      const res = await request(app).get(path).set("Host", APEX).set("Cookie", cookie);
      assert.equal(res.status, 200, `${path} expected 200 got ${res.status}`);
    }
    const orgDetail = await request(app)
      .get(`/admin/organizations/${fixtures.foundationOrgKey}`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(orgDetail.status, 200);

    const appDetail = await request(app)
      .get(`/admin/registration-applications/${fixtures.foundationAppId}`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(appDetail.status, 200);
  });

  it("tenant roles are denied on admin routes", async () => {
    requireDb();
    for (const user of [users.hq, users.member]) {
      const cookie = await cookieFor(user);
      for (const path of ["/admin", "/admin/organizations", "/admin/registration-applications", "/admin/subscriptions"]) {
        const res = await request(app).get(path).set("Host", APEX).set("Cookie", cookie);
        assert.equal(res.status, 403, `${user.email} ${path}`);
      }
    }
  });

  it("empty filter results remain usable with navigation", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const res = await request(app)
      .get("/admin/registration-applications?q=zzz-no-such-application-xyz")
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /No registration applications|No applications match/i);
    assert.match(res.text, /data-bb-nav="mobile-drawer"|href="\/admin"/);
    assert.match(res.text, /href="\/admin\/organizations"/);

    const subs = await request(app)
      .get("/admin/subscriptions?q=zzznoorg")
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(subs.status, 200);
    assert.match(subs.text, /No subscriptions match|data-bb-pa-empty="no-results"/i);
    assert.match(subs.text, /href="\/admin\/plans"/);
  });

  it("Foundation registration appears correctly", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const list = await request(app)
      .get("/admin/registration-applications?selected_plan=foundation&linked=linked")
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, new RegExp(fixtures.foundationChurchName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(list.text, /Foundation|foundation/i);
    assert.match(list.text, /\+254711000111/);

    const detail = await request(app)
      .get(`/admin/registration-applications/${fixtures.foundationAppId}`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /normalized/i);
    assert.doesNotMatch(detail.text, /password_hash|session_token|postgresql:\/\//i);

    const orgs = await request(app)
      .get(`/admin/organizations?q=${fixtures.foundationOrgKey}`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(orgs.status, 200);
    assert.match(orgs.text, /data-bb-linked-registration="1"|View application/);
    assert.match(orgs.text, /Foundation|free/i);
  });

  it("Growth trial and dates appear correctly", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const subs = await request(app)
      .get("/admin/subscriptions?status=trialing&plan=growth")
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(subs.status, 200);
    assert.match(subs.text, new RegExp(fixtures.growthOrgKey));
    assert.match(subs.text, /Trialing|trial/i);
    assert.match(subs.text, /Growth/);
    assert.match(subs.text, new RegExp(fixtures.growthTrialEndsAt));

    const dash = await request(app).get("/admin").set("Host", APEX).set("Cookie", cookie);
    assert.equal(dash.status, 200);
    assert.match(dash.text, /data-bb-count="active-growth-trials"/);
    assert.match(dash.text, /data-bb-count="recent-foundation-registrations"/);
  });

  it("Grace / downgrade state appears correctly", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const subs = await request(app)
      .get("/admin/subscriptions?status=past_due&plan=growth")
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(subs.status, 200);
    assert.match(subs.text, new RegExp(fixtures.graceOrgKey));
    assert.match(subs.text, /Grace|past due/i);
    assert.match(subs.text, /data-bb-grace-deadline="1"|Grace deadline/i);
    assert.match(subs.text, new RegExp(fixtures.graceDeadline));

    const orgDetail = await request(app)
      .get(`/admin/organizations/${fixtures.graceOrgKey}`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(orgDetail.status, 200);
    assert.match(orgDetail.text, /Grace|past_due/i);
    assert.match(orgDetail.text, /data-bb-grace-deadline="1"|Entitled/i);
  });

  it("Network request appears with support state", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const list = await request(app)
      .get("/admin/registration-applications?selected_plan=network&support_requested=true")
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /Network Support Ops Church/);
    assert.match(list.text, /data-bb-pa-plan-badge="network"|Network/);
    assert.match(list.text, /Support requested|data-bb-pa-support-requested/);

    const detail = await request(app)
      .get(`/admin/registration-applications/${fixtures.networkAppId}`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Network/);
    assert.match(detail.text, /support/i);

    const dash = await request(app).get("/admin").set("Host", APEX).set("Cookie", cookie);
    assert.match(dash.text, /data-bb-count="pending-network-support"/);
  });

  it("Network org/subscription filters query professional DB key", async () => {
    requireDb();
    // Assign professional plan to foundation org briefly via SQL for filter proof.
    await pool.query(
      `UPDATE platform.organization_subscriptions s
          SET plan_id = (SELECT id FROM platform.plans WHERE plan_key = 'professional' LIMIT 1),
              status = 'active',
              ends_at = NULL
        WHERE s.organization_id = $1
          AND s.product_key = 'blessboard'
          AND s.status IN ('active', 'trialing', 'past_due')`,
      [fixtures.foundationOrgId]
    );

    const orgs = await listPlatformOrganizations(pool, { plan: "network", limit: 25 });
    assert.equal(orgs.ok, true);
    assert.ok(orgs.organizations.some((o) => o.organizationKey === fixtures.foundationOrgKey));
    assert.ok(orgs.organizations.every((o) => o.planKey === "professional"));

    const subs = await listPlatformSubscriptions(pool, { plan: "network", limit: 25 });
    assert.equal(subs.ok, true);
    assert.ok(subs.subscriptions.some((s) => s.organizationKey === fixtures.foundationOrgKey));
    assert.ok(subs.subscriptions.every((s) => s.planKey === "professional"));
    assert.ok(subs.subscriptions.every((s) => /Network/i.test(s.planLabel || "")));

    // Restore free for later assertions if any
    await pool.query(
      `UPDATE platform.organization_subscriptions s
          SET plan_id = (SELECT id FROM platform.plans WHERE plan_key = 'free' LIMIT 1),
              status = 'active',
              ends_at = NULL
        WHERE s.organization_id = $1
          AND s.product_key = 'blessboard'
          AND s.status IN ('active', 'trialing', 'past_due')`,
      [fixtures.foundationOrgId]
    );
  });

  it("HTTP rejects unsupported subscription filters", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const res = await request(app)
      .get("/admin/subscriptions?plan=enterprise_gold")
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(res.status, 400);
  });

  it("CSRF remains required for registration follow-up mutations", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const res = await request(app)
      .post(`/admin/registration-applications/${fixtures.foundationAppId}/follow-up-status`)
      .set("Host", APEX)
      .set("Cookie", cookie)
      .type("form")
      .send({ follow_up_status: "contacted" });
    assert.equal(res.status, 303);
    assert.match(res.headers.location || "", /error=csrf/);

    const detail = await request(app)
      .get(`/admin/registration-applications/${fixtures.foundationAppId}`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    const csrf = extractCsrfToken(detail.text);
    const csrfCookie = extractCookie(detail, CSRF_COOKIE);
    assert.ok(csrf);
    const ok = await request(app)
      .post(`/admin/registration-applications/${fixtures.foundationAppId}/follow-up-status`)
      .set("Host", APEX)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf, follow_up_status: "contacted" });
    assert.equal(ok.status, 303);
    assert.match(ok.headers.location || "", /notice=/);
  });

  it("admin navigation has no broken linked routes and mobile shell exposes nav", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const home = await request(app).get("/admin").set("Host", APEX).set("Cookie", cookie);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-bb-nav="mobile-drawer"/);
    assert.match(home.text, /data-bb-nav="mobile-tabs"|data-bb-nav="mobile-header"/);

    const hrefs = [
      "/admin",
      "/admin/organizations",
      "/admin/registration-applications",
      "/admin/plans",
      "/admin/subscriptions",
    ];
    for (const href of hrefs) {
      assert.match(home.text, new RegExp(`href="${href.replace(/\//g, "\\/")}"`));
      const page = await request(app).get(href).set("Host", APEX).set("Cookie", cookie);
      assert.equal(page.status, 200, href);
    }

    const stats = await platformAdminRepo.countOrganizationDirectoryStats(pool);
    assert.ok(typeof stats.recentFoundationRegistrations === "number");
    assert.ok(typeof stats.activeGrowthTrials === "number");
    assert.ok(typeof stats.growthTrialsEndingSoon === "number");
    assert.ok(typeof stats.growthSubscriptionsInGrace === "number");
    assert.ok(typeof stats.registrationsRequiringReview === "number");
    assert.ok(typeof stats.pendingNetworkSupportRequests === "number");
    assert.ok(stats.recentFoundationRegistrations >= 1);
    assert.ok(stats.activeGrowthTrials >= 1);
    assert.ok(stats.growthSubscriptionsInGrace >= 1);
    assert.ok(stats.pendingNetworkSupportRequests >= 1);
  });
});
