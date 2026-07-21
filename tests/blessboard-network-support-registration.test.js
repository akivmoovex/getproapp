"use strict";

/**
 * Network support-contact registration (Prompt 09).
 * No automatic tenant/subscription; platform-admin queue visibility.
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
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const {
  mapPublicPlanToOrchestratorPlanKey,
  mapPublicPlanToDbPlanKey,
  isInstantProvisionPlan,
  isNetworkPlanSelection,
  planDisplayLabel,
  NETWORK_PLAN_CODE,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const {
  mapDirectoryPlanFilterToDbPlanKey,
  DB_PLAN_KEYS,
  planDisplayLabel: mappingPlanLabel,
} = require("../src/blessboard/services/registrationPlanMapping");
const {
  NETWORK_SUPPORT_SUCCESS_MESSAGE,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const {
  normalizeListFilters,
} = require("../src/blessboard/services/registrationApplicationsAdminService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

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

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

describe("Network support-contact registration", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let platformAdminCookie = null;
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

      const { provisionRegisteredBlessBoardChurch } = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
      const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");

      const paEmail = `pa-network-${uniq("u")}@example.org`;
      const admin = await createBlessBoardUser(pool, {
        email: paEmail,
        displayName: "PA Network",
        password: PASSWORD,
      });
      assert.equal(admin.ok, true, admin.message);

      const key = uniq("netfix");
      const application = await appRepo.createApplication(pool, {
        church_name: `Network Fixture Church ${key}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "Fixture Contact",
        contact_email: `${key}@example.org`,
        contact_phone: `+2547${String(Date.now()).slice(-7)}`,
        contact_phone_normalized: `+2547${String(Date.now()).slice(-7)}`,
        role_in_church: "Administrator",
        selected_plan: "foundation",
        consent_terms: true,
      });
      const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: application.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: key,
        requestId: "network-support-fixture",
        actorContext: {
          type: "test",
          source: "prompt09",
          dataEnvironment: "testing",
          deploymentCode: "blessboard-org-v5",
        },
      });
      assert.equal(provisioned.ok, true, provisioned.message || provisioned.status);
      fixtures.organizationId = provisioned.records.organizationId;
      fixtures.organizationKey = provisioned.records.organizationKey;
      fixtures.churchId = provisioned.records.churchId;
      fixtures.branchId = provisioned.records.branchId;

      const role = await assignBlessBoardRole(pool, {
        email: paEmail,
        organizationKey: fixtures.organizationKey,
        roleKey: "platform_admin",
      });
      assert.equal(role.ok, true, role.message);

      const session = await createV5Session(pool, {
        userId: admin.user.id,
        deploymentCode: "blessboard-org-v5",
        organizationId: fixtures.organizationId,
        churchId: null,
        branchId: null,
      });
      assert.equal(session.ok, true, session.code);
      platformAdminCookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
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

  function makeApp(envExtra = {}) {
    return createV5FoundationApp({
      env: {
        NODE_ENV: "test",
        BLESSBOARD_TENANT_ROUTING_MODE: "off",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        ...envExtra,
      },
      getPool: () => pool,
    });
  }

  async function getRegisterPage(app, pathName = "/register-church?plan=network") {
    const res = await request(app).get(pathName).set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    const csrf = extractCsrfToken(res.text);
    const cookie = extractCookie(res, CSRF_COOKIE);
    assert.ok(csrf);
    assert.ok(cookie);
    return { res, csrf, cookie };
  }

  function networkBody(overrides = {}) {
    const key = uniq("net");
    const phoneTail = String(1000000 + (Date.now() % 1000000) + Math.floor(Math.random() * 900)).slice(
      -7
    );
    return {
      church_name: `Network Church ${key}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: "Network Contact",
      role_in_church: "Administrator",
      phone: `+2547${phoneTail}`,
      email: `${key}@example.org`,
      selected_plan: "network",
      branch_name: "Main Campus",
      branch_count: "5",
      message: "Need multi-branch pricing",
      consent_contact: "on",
      ...overrides,
    };
  }

  it("maps public network → DB professional; no instant provision", () => {
    assert.equal(mapPublicPlanToDbPlanKey("network"), DB_PLAN_KEYS.PROFESSIONAL);
    assert.equal(mapPublicPlanToOrchestratorPlanKey("network"), null);
    assert.equal(isInstantProvisionPlan("network"), false);
    assert.equal(isNetworkPlanSelection("network"), true);
    assert.equal(planDisplayLabel("network"), "Network");
    assert.equal(mappingPlanLabel("professional"), "Network");
    assert.equal(mapDirectoryPlanFilterToDbPlanKey("network"), "professional");
    assert.equal(mapDirectoryPlanFilterToDbPlanKey("professional"), "professional");
    const filters = normalizeListFilters({ selected_plan: "network" });
    assert.equal(filters.ok, true);
    assert.equal(filters.value.selectedPlan, NETWORK_PLAN_CODE);
  });

  it("Network submission creates one support-contact application (no tenant)", async () => {
    requireDb();
    const app = makeApp({});
    const body = networkBody({
      church_name: `Escaped <script>alert(1)</script> Church ${uniq("x")}`,
      contact_name: `O'Brien <b>Bold</b>`,
      message: `Notes <img src=x onerror=alert(1)>`,
    });
    const { csrf, cookie } = await getRegisterPage(app);

    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: csrf });

    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/register-church?submitted=1&plan=network");

    const apps = await pool.query(
      `SELECT id, selected_plan, application_status, provisioning_status, organization_id,
              support_requested, follow_up_status, church_name, contact_name, message
         FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    assert.equal(apps.rows.length, 1);
    const row = apps.rows[0];
    assert.equal(row.selected_plan, "network");
    assert.equal(row.application_status, "submitted");
    assert.equal(row.provisioning_status, "not_started");
    assert.equal(row.organization_id, null);
    assert.equal(row.support_requested, true);
    assert.equal(row.follow_up_status, "validation_pending");

    const orgCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations o
        WHERE o.display_name = $1 OR o.organization_key LIKE $2`,
      [body.church_name, `%${body.email.split("@")[0]}%`]
    );
    assert.equal(orgCount.rows[0].n, 0);

    const subCount = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM platform.organization_subscriptions os
         JOIN platform.plans pl ON pl.id = os.plan_id
        WHERE pl.plan_key = 'professional'`
    );
    // Existing fixtures may have professional subs; ensure this application did not create any linked org.
    const linked = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations o
        JOIN blessboard.platform_church_registration_applications a ON a.organization_id = o.id
       WHERE lower(a.contact_email) = lower($1)`,
      [body.email]
    );
    assert.equal(linked.rows[0].n, 0);
    assert.ok(subCount.rows[0].n >= 0);

    const roleCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_roles ur
        JOIN blessboard.users u ON u.id = ur.user_id
       WHERE lower(u.email_normalized) = lower($1)`,
      [body.email]
    );
    assert.equal(roleCount.rows[0].n, 0);

    const success = await request(app)
      .get(res.headers.location)
      .set("Host", "blessboard.org");
    assert.equal(success.status, 200);
    assert.match(success.text, /data-bb-register-network-support="1"/);
    const msg = NETWORK_SUPPORT_SUCCESS_MESSAGE;
    assert.ok(
      success.text.includes(msg) ||
        success.text.includes(msg.replace(/'/g, "&#39;")) ||
        success.text.includes(msg.replace(/'/g, "&#x27;")),
      "success page should show the Network support message"
    );
    assert.doesNotMatch(success.text, new RegExp(String(row.id).replace(/-/g, "\\-")));
    assert.doesNotMatch(success.text, /review_notes/i);
    // Escaped applicant content must not execute as HTML on success (form not shown).
    assert.doesNotMatch(success.text, /<script>alert\(1\)<\/script>/);
  });

  it("refresh does not resubmit; duplicate submit is idempotent", async () => {
    requireDb();
    const app = makeApp({});
    const body = networkBody();
    const first = await getRegisterPage(app);
    const res1 = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${first.cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: first.csrf });
    assert.equal(res1.status, 303);

    const refresh = await request(app)
      .get(res1.headers.location)
      .set("Host", "blessboard.org");
    assert.equal(refresh.status, 200);
    assert.match(refresh.text, /data-bb-register-network-support="1"/);
    assert.doesNotMatch(refresh.text, /data-bb-register-form="1"/);

    const second = await getRegisterPage(app);
    const res2 = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${second.cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: second.csrf });
    assert.equal(res2.status, 303);
    assert.equal(res2.headers.location, "/register-church?submitted=1&plan=network");

    const apps = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)
          AND lower(church_name) = lower($2)`,
      [body.email, body.church_name]
    );
    assert.equal(apps.rows[0].n, 1);
  });

  it("platform admin can see and filter Network requests; tenants cannot", async () => {
    requireDb();
    const app = makeApp({});
    const body = networkBody({ church_name: `Admin Visible Network ${uniq("av")}` });
    const page = await getRegisterPage(app);
    await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${page.cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: page.csrf });

    const list = await request(app)
      .get("/admin/registration-applications?selected_plan=network&support_requested=true")
      .set("Host", "blessboard.org")
      .set("Cookie", platformAdminCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-pa-plan-badge="network"/);
    assert.match(list.text, /data-bb-pa-support-requested="1"/);
    assert.ok(list.text.includes(body.church_name));
    assert.ok(list.text.includes(body.contact_name));
    assert.ok(list.text.includes(body.email));
    assert.match(list.text, /Network/);

    const apps = await pool.query(
      `SELECT id FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1) LIMIT 1`,
      [body.email]
    );
    const id = apps.rows[0].id;
    const detail = await request(app)
      .get(`/admin/registration-applications/${id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", platformAdminCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-pa-plan-badge="network"/);
    assert.match(detail.text, /Support requested/);
    assert.match(detail.text, /data-bb-pa-follow-up-form="1"/);

    const anon = await request(app)
      .get("/admin/registration-applications")
      .set("Host", "blessboard.org");
    assert.ok(anon.status === 401 || anon.status === 303 || anon.status === 302);

    // Tenant church admin must not reach platform registration applications.
    const tenantEmail = `tenant-${uniq("t")}@example.org`;
    const tenantUser = await createBlessBoardUser(pool, {
      email: tenantEmail,
      displayName: "Tenant Admin",
      password: PASSWORD,
    });
    assert.equal(tenantUser.ok, true);
    const hqRole = await assignBlessBoardRole(pool, {
      email: tenantEmail,
      organizationKey: fixtures.organizationKey,
      roleKey: "church_hq_admin",
      churchKey: fixtures.organizationKey,
    });
    assert.equal(hqRole.ok, true, hqRole.message);
    const tenantSession = await createV5Session(pool, {
      userId: tenantUser.user.id,
      deploymentCode: "blessboard-org-v5",
      organizationId: fixtures.organizationId,
      churchId: fixtures.churchId,
      branchId: fixtures.branchId,
    });
    assert.equal(tenantSession.ok, true);
    const denied = await request(app)
      .get("/admin/registration-applications")
      .set("Host", "blessboard.org")
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${tenantSession.rawToken}`);
    assert.ok(denied.status === 403 || denied.status === 401 || denied.status === 303);
    assert.doesNotMatch(denied.text || "", /data-bb-pa-registration-applications="1"/);
  });

  it("Foundation and Growth automatic flows remain unchanged", async () => {
    requireDb();
    const app = makeApp({});
    assert.equal(isInstantProvisionPlan("foundation"), true);
    assert.equal(isInstantProvisionPlan("growth"), true);
    assert.equal(mapPublicPlanToOrchestratorPlanKey("foundation"), "free");
    assert.equal(mapPublicPlanToOrchestratorPlanKey("growth"), "growth");

    const freeKey = uniq("free");
    const phoneTail = String(1000000 + Math.floor(Math.random() * 9000000)).slice(-7);
    const freeBody = {
      church_name: `Keep Free ${freeKey}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: "Free Admin",
      role_in_church: "Administrator",
      phone: `+2547${phoneTail}`,
      email: `${freeKey}@example.org`,
      selected_plan: "foundation",
      organization_key: freeKey,
      password: PASSWORD,
      password_confirm: PASSWORD,
      branch_name: "Headquarters",
      consent_contact: "on",
    };
    const freePage = await getRegisterPage(app, "/register-church?plan=foundation");
    const freeRes = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${freePage.cookie}`)
      .type("form")
      .send({ ...freeBody, [CSRF_FIELD]: freePage.csrf });
    assert.equal(freeRes.status, 303);
    assert.equal(freeRes.headers.location, "/account");

    const growthKey = uniq("growth");
    const gPhone = String(1000000 + Math.floor(Math.random() * 9000000)).slice(-7);
    const growthBody = {
      church_name: `Keep Growth ${growthKey}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: "Growth Admin",
      role_in_church: "Administrator",
      phone: `+2547${gPhone}`,
      email: `${growthKey}@example.org`,
      selected_plan: "growth",
      organization_key: growthKey,
      password: PASSWORD,
      password_confirm: PASSWORD,
      branch_name: "Main",
      consent_contact: "on",
    };
    const growthPage = await getRegisterPage(app, "/register-church?plan=growth");
    const growthRes = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${growthPage.cookie}`)
      .type("form")
      .send({ ...growthBody, [CSRF_FIELD]: growthPage.csrf });
    assert.equal(growthRes.status, 303);
    assert.equal(growthRes.headers.location, "/account");
  });

  it("Network still enquiry-only when instant flag is on", async () => {
    requireDb();
    const app = makeApp({ [ENV_KEY]: "1" });
    const body = networkBody();
    const page = await getRegisterPage(app);
    const res = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${page.cookie}`)
      .type("form")
      .send({ ...body, [CSRF_FIELD]: page.csrf });
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/register-church?submitted=1&plan=network");
    const apps = await pool.query(
      `SELECT organization_id, provisioning_status, support_requested
         FROM blessboard.platform_church_registration_applications
        WHERE lower(contact_email) = lower($1)`,
      [body.email]
    );
    assert.equal(apps.rows[0].organization_id, null);
    assert.equal(apps.rows[0].provisioning_status, "not_started");
    assert.equal(apps.rows[0].support_requested, true);
  });
});
