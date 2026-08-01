"use strict";

/**
 * Public miniwebsite after registration approval:
 * - unique organization_key allocation (+ reserved / collision)
 * - initial Foundation publish so /c/:organizationKey is live
 * - HQ public path uses /c/:key
 * - repair dry-run + apply without duplicating content
 * - retry does not duplicate org/church/website
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
  allocateUniqueOrganizationKey,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  approveAndProvisionRegistrationApplication,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const {
  slugifyOrganizationKey,
  normalizeOrganizationKey,
  resolveBaseOrganizationKey,
  withOrganizationKeySuffix,
} = require("../src/blessboard/services/organizationKey");
const { publicChurchHomePath } = require("../src/blessboard/urls/churchUrlHelper");
const {
  loadFoundationWebsiteOverview,
} = require("../src/blessboard/services/websiteOverviewService");
const {
  inspectPublicMiniwebsiteRepair,
  repairPublicMiniwebsite,
} = require("../src/blessboard/services/publicMiniwebsiteRepairService");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { KIND } = require("../src/blessboard/http/loadTenantPublicPageModel");

const DEPLOYMENT = "blessboard-org-staging";
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

describe("registration public miniwebsite provision", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let platformAdmin = null;
  let app = null;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });

      const key = uniq("mwpa");
      const email = `pa-${key}@example.org`;
      const user = await createBlessBoardUser(pool, {
        email,
        password: PASSWORD,
        displayName: "Miniwebsite PA",
      });
      assert.equal(user.ok, true, user.message);

      const bootApp = await appRepo.createApplication(pool, {
        church_name: `MW PA Church ${key}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "PA",
        contact_email: `${uniq("boot")}@example.org`,
        contact_phone: `+2547${String(Date.now()).slice(-7)}`,
        contact_phone_normalized: `+2547${String(Date.now()).slice(-7)}`,
        selected_plan: "foundation",
        consent_terms: true,
      });
      const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: bootApp.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: key,
        actorContext: {
          type: "test",
          source: "miniwebsite-provision",
          dataEnvironment: "testing",
          deploymentCode: DEPLOYMENT,
        },
      });
      assert.equal(provisioned.ok, true, provisioned.message || provisioned.status);
      const role = await assignBlessBoardRole(pool, {
        email,
        organizationKey: provisioned.records.organizationKey,
        roleKey: "platform_admin",
      });
      assert.equal(role.ok, true, role.message);
      platformAdmin = {
        userId: user.user.id,
        email,
        organizationId: provisioned.records.organizationId,
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

  async function insertFoundationApp(overrides = {}) {
    const key = uniq("mwapp");
    const phoneTail = String(Date.now() + Math.floor(Math.random() * 9000)).slice(-7);
    return appRepo.createApplication(pool, {
      church_name: overrides.church_name || `Grace Community ${key}`,
      country: "Kenya",
      city: "Nairobi",
      contact_name: overrides.contact_name || "Applicant",
      contact_email: overrides.contact_email || `${key}@example.org`,
      contact_phone: overrides.contact_phone || `+2547${phoneTail}`,
      contact_phone_normalized: overrides.contact_phone_normalized || `+2547${phoneTail}`,
      selected_plan: overrides.selected_plan || "foundation",
      consent_terms: true,
      branch_name: overrides.branch_name || "Main Campus",
    });
  }

  it("slugifies church names and allocates collision suffixes", () => {
    assert.equal(slugifyOrganizationKey("Grace Community Church"), "grace-community-church");
    assert.equal(withOrganizationKeySuffix("grace-community-church", 1), "grace-community-church");
    assert.equal(withOrganizationKeySuffix("grace-community-church", 2), "grace-community-church-2");
    assert.equal(withOrganizationKeySuffix("grace-community-church", 3), "grace-community-church-3");
    const reserved = resolveBaseOrganizationKey("admin");
    assert.equal(reserved.ok, true);
    assert.notEqual(reserved.key, "admin");
    assert.equal(normalizeOrganizationKey("hq").ok, false);
    assert.equal(normalizeOrganizationKey("hq").reason, "reserved_key");
  });

  it("publicChurchHomePath uses /c/:organizationKey", () => {
    assert.equal(publicChurchHomePath("grace-community-church"), "/c/grace-community-church");
    assert.equal(publicChurchHomePath("HQ"), null);
  });

  it("approved church receives unique org key and published public site", async () => {
    requireDb();
    const suffix = uniq("gcc");
    const churchName = `Grace Community Church ${suffix}`;
    const expectedBase = slugifyOrganizationKey(churchName);
    const appRow = await insertFoundationApp({ church_name: churchName });

    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: appRow.id,
      actorUserId: platformAdmin.userId,
      // No organizationKey — must auto-allocate from church name.
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, approved.message || approved.status);
    assert.equal(approved.records.organizationKey, expectedBase);

    const org = await pool.query(
      `SELECT organization_key, status FROM platform.organizations WHERE id = $1`,
      [approved.records.organizationId]
    );
    assert.equal(org.rows[0].organization_key, expectedBase);
    assert.equal(org.rows[0].status, "active");

    const settings = await pool.query(
      `SELECT website_status, public_name FROM blessboard.church_settings WHERE church_id = $1`,
      [approved.records.churchId]
    );
    assert.equal(settings.rows[0].website_status, "published");
    assert.match(String(settings.rows[0].public_name), /Grace Community Church/);

    const pages = await pool.query(
      `SELECT page_key, status FROM blessboard.public_pages
        WHERE church_id = $1 AND branch_id IS NULL
        ORDER BY page_key`,
      [approved.records.churchId]
    );
    assert.ok(pages.rowCount >= 8);
    assert.ok(pages.rows.every((r) => r.status === "published"));

    const publicRes = await request(app)
      .get(`/c/${expectedBase}`)
      .set("Host", APEX);
    assert.equal(publicRes.status, 200);
    assert.doesNotMatch(publicRes.text, /not public yet/i);
    assert.match(publicRes.text, /Grace Community Church/i);

    const overview = await loadFoundationWebsiteOverview(pool, {
      organizationId: approved.records.organizationId,
      churchId: approved.records.churchId,
      organizationKey: expectedBase,
    });
    assert.equal(overview.ok, true);
    assert.equal(overview.publicPath, `/c/${expectedBase}`);
    assert.equal(overview.liveAvailable, true);
    assert.equal(overview.organizationKey, expectedBase);
  });

  it("collision handling allocates -2 suffix", async () => {
    requireDb();
    const base = uniq("collide");
    const first = await insertFoundationApp({ church_name: `Collide ${base}` });
    const firstKey = slugifyOrganizationKey(`Collide ${base}`);
    const a1 = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: first.id,
      actorUserId: platformAdmin.userId,
      organizationKey: firstKey,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(a1.ok, true, a1.message || a1.status);
    assert.equal(a1.records.organizationKey, firstKey);

    const second = await insertFoundationApp({ church_name: `Collide ${base}` });
    const a2 = await provisionRegisteredBlessBoardChurch(pool, {
      applicationId: second.id,
      administratorPassword: PASSWORD,
      // Auto from church name — base taken → -2
      actorContext: {
        type: "test",
        source: "collision",
        dataEnvironment: "testing",
        deploymentCode: DEPLOYMENT,
      },
    });
    assert.equal(a2.ok, true, a2.message || a2.status);
    assert.equal(a2.records.organizationKey, `${firstKey}-2`);
  });

  it("reserved base key is escaped during allocation", async () => {
    requireDb();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const key = await allocateUniqueOrganizationKey(client, {
        churchName: "Admin",
        exactPreferred: false,
      });
      assert.notEqual(key, "admin");
      assert.equal(normalizeOrganizationKey(key).ok, true);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("organization-key failure rolls back and does not mark provisioned", async () => {
    requireDb();
    const taken = uniq("taken");
    await provisionPlatformTenantBootstrap(taken);

    const appRow = await insertFoundationApp({ church_name: `Taken ${taken}` });
    const failed = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: appRow.id,
      actorUserId: platformAdmin.userId,
      organizationKey: taken,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(failed.ok, false);
    assert.ok(
      failed.message === "slug_unavailable" ||
        failed.provisionStatus === "slug_unavailable" ||
        String(failed.message || "").includes("slug")
    );

    const appState = await pool.query(
      `SELECT application_status, provisioning_status, organization_id
         FROM blessboard.platform_church_registration_applications
        WHERE id = $1`,
      [appRow.id]
    );
    assert.notEqual(appState.rows[0].provisioning_status, "provisioned");
    assert.equal(appState.rows[0].organization_id, null);
  });

  async function provisionPlatformTenantBootstrap(organizationKey) {
    const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
    const tenant = await provisionPlatformTenant(pool, {
      organizationKey,
      displayName: `Taken Org ${organizationKey}`,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: organizationKey,
      deploymentCode: DEPLOYMENT,
      skipDomain: true,
      subscriptionPlanKey: "free",
      subscriptionStatus: "active",
    });
    assert.equal(tenant.ok, true, tenant.message || tenant.status);
    return tenant;
  }

  it("suspended/inactive organization is not publicly served", async () => {
    requireDb();
    const key = uniq("susp");
    const appRow = await insertFoundationApp({ church_name: `Suspend ${key}` });
    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: appRow.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, approved.message || approved.status);

    await pool.query(
      `UPDATE platform.organizations SET status = 'inactive' WHERE id = $1`,
      [approved.records.organizationId]
    );

    const res = await request(app).get(`/c/${key}`).set("Host", APEX);
    assert.equal(res.status, 404);
  });

  it("tenant isolation: /c/:key does not leak another church", async () => {
    requireDb();
    const keyA = uniq("iso-a");
    const keyB = uniq("iso-b");
    const appA = await insertFoundationApp({ church_name: `Iso Alpha ${keyA}` });
    const appB = await insertFoundationApp({ church_name: `Iso Beta ${keyB}` });
    const a = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: appA.id,
      actorUserId: platformAdmin.userId,
      organizationKey: keyA,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    const b = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: appB.id,
      actorUserId: platformAdmin.userId,
      organizationKey: keyB,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);

    const resA = await request(app).get(`/c/${keyA}`).set("Host", APEX);
    const resB = await request(app).get(`/c/${keyB}`).set("Host", APEX);
    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);
    assert.match(resA.text, /Iso Alpha/i);
    assert.doesNotMatch(resA.text, /Iso Beta/i);
    assert.match(resB.text, /Iso Beta/i);
    assert.doesNotMatch(resB.text, /Iso Alpha/i);
  });

  it("retry after success does not duplicate organization, church, pages", async () => {
    requireDb();
    const key = uniq("retry");
    const appRow = await insertFoundationApp({ church_name: `Retry ${key}` });
    const first = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: appRow.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(first.ok, true, first.message || first.status);

    const second = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: appRow.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(second.ok, true);
    assert.equal(second.alreadyProvisioned || second.status === "already_provisioned", true);

    const orgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [key]
    );
    assert.equal(orgs.rows[0].n, 1);
    const churches = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.churches WHERE organization_id = $1`,
      [first.records.organizationId]
    );
    assert.equal(churches.rows[0].n, 1);
    const pages = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.public_pages WHERE church_id = $1 AND branch_id IS NULL`,
      [first.records.churchId]
    );
    assert.equal(pages.rows[0].n, 8);
  });

  it("repair dry-run reports unpublished gaps; apply publishes without overwrite", async () => {
    requireDb();
    const key = uniq("repair");
    const appRow = await insertFoundationApp({ church_name: `Repair ${key}` });
    const approved = await approveAndProvisionRegistrationApplication(pool, {
      applicationId: appRow.id,
      actorUserId: platformAdmin.userId,
      organizationKey: key,
      deploymentCode: DEPLOYMENT,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, approved.message || approved.status);

    // Force an incomplete (draft) state as if older provisioning left the site unpublished.
    await pool.query(
      `UPDATE blessboard.church_settings SET website_status = 'draft' WHERE church_id = $1`,
      [approved.records.churchId]
    );
    await pool.query(
      `UPDATE blessboard.public_pages SET status = 'draft' WHERE church_id = $1 AND branch_id IS NULL`,
      [approved.records.churchId]
    );
    await pool.query(
      `UPDATE blessboard.page_sections ps
          SET status = 'draft'
         FROM blessboard.public_pages pp
        WHERE ps.page_id = pp.id AND pp.church_id = $1`,
      [approved.records.churchId]
    );

    const setupRes = await request(app).get(`/c/${key}`).set("Host", APEX);
    assert.equal(setupRes.status, 200);
    assert.match(setupRes.text, /not public yet/i);

    const dry = await inspectPublicMiniwebsiteRepair(pool, { organizationKey: key });
    assert.equal(dry.ok, true);
    assert.equal(dry.needsRepair, true);
    assert.ok((dry.plannedActions || []).some((a) => a.action === "publish_initial_foundation_website"));

    const welcomeBefore = await pool.query(
      `SELECT ps.heading, ps.body_text
         FROM blessboard.page_sections ps
         JOIN blessboard.public_pages pp ON pp.id = ps.page_id
        WHERE pp.church_id = $1 AND ps.section_key = 'welcome'
        LIMIT 1`,
      [approved.records.churchId]
    );
    assert.ok(welcomeBefore.rows[0]);

    const applied = await repairPublicMiniwebsite(pool, {
      organizationKey: key,
      dryRun: false,
    });
    assert.equal(applied.ok, true, applied.reason);
    assert.equal(applied.applied, true);
    assert.equal(applied.after.websiteStatus, "published");
    assert.equal(applied.after.publicPath, `/c/${key}`);

    const welcomeAfter = await pool.query(
      `SELECT ps.heading, ps.body_text
         FROM blessboard.page_sections ps
         JOIN blessboard.public_pages pp ON pp.id = ps.page_id
        WHERE pp.church_id = $1 AND ps.section_key = 'welcome'
        LIMIT 1`,
      [approved.records.churchId]
    );
    assert.equal(welcomeAfter.rows[0].heading, welcomeBefore.rows[0].heading);
    assert.equal(welcomeAfter.rows[0].body_text, welcomeBefore.rows[0].body_text);

    const live = await request(app).get(`/c/${key}`).set("Host", APEX);
    assert.equal(live.status, 200);
    assert.doesNotMatch(live.text, /not public yet/i);
    assert.match(live.text, /Repair/i);

    // Second repair leaves a valid published site untouched (idempotent).
    const again = await repairPublicMiniwebsite(pool, {
      organizationKey: key,
      dryRun: false,
    });
    assert.equal(again.ok, true);
    assert.equal(again.published.alreadyPublished, true);
  });

  it("exports KIND for setup discrimination sanity", () => {
    assert.equal(KIND.SETUP, "setup");
  });
});
