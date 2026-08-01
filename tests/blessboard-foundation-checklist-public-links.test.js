"use strict";

/**
 * Foundation checklist Preview/Publish link destinations and completion gates.
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
const {
  approveAndProvisionRegistrationApplication,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const {
  buildChecklist,
  assembleSummary,
  getOrganizationOnboardingSummary,
  resolvePreviewActionUrl,
  resolvePublishAction,
} = require("../src/blessboard/services/organizationOnboardingSummaryService");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { createV5Session } = require("../src/platform/session/createV5Session");

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

describe("foundation checklist preview/publish links", () => {
  it("resolvePreviewActionUrl uses org-scoped admin preview for platform admin", () => {
    assert.equal(
      resolvePreviewActionUrl("grace-community-church", "platform_admin"),
      "/admin/organizations/grace-community-church/website-preview"
    );
    assert.equal(resolvePreviewActionUrl("grace-community-church", "hq"), "/hq/content/preview/home");
    assert.doesNotMatch(
      String(resolvePreviewActionUrl("grace-community-church", "platform_admin") || ""),
      /\/hq\/website/
    );
  });

  it("resolvePublishAction uses /c/:key when complete and View published website label", () => {
    const complete = resolvePublishAction({
      organizationKey: "grace-community-church",
      publishComplete: true,
      linkContext: "platform_admin",
    });
    assert.equal(complete.actionUrl, "/c/grace-community-church");
    assert.equal(complete.actionLabel, "View published website");

    const incompleteHq = resolvePublishAction({
      organizationKey: "grace-community-church",
      publishComplete: false,
      linkContext: "hq",
    });
    assert.equal(incompleteHq.actionUrl, "/hq/website");
    assert.equal(incompleteHq.actionLabel, "Publish website");
  });

  it("missing organization key prevents Publish complete even with published pages", () => {
    const items = buildChecklist(
      {
        orgDisplayName: "X",
        churchId: "11111111-1111-4111-8111-111111111111",
        churchDisplayName: "X",
        activeBranchCount: 1,
        publishedPages: 3,
        hasPublishedHomepage: true,
        websiteStatus: "published",
        hasPreviewableHomepage: true,
        previewAcknowledged: true,
        organizationKey: "",
      },
      ""
    );
    const publish = items.find((i) => i.key === "publish");
    assert.equal(publish.completed, false);
    assert.match(publish.explanation, /public website address is unavailable/i);
  });

  it("valid key without published homepage keeps Publish incomplete", () => {
    const items = buildChecklist(
      {
        orgDisplayName: "X",
        churchId: "11111111-1111-4111-8111-111111111111",
        churchDisplayName: "X",
        activeBranchCount: 1,
        publishedPages: 0,
        hasPublishedHomepage: false,
        websiteStatus: "draft",
        hasPreviewableHomepage: true,
        previewAcknowledged: true,
        organizationKey: "grace-community-church",
      },
      "grace-community-church"
    );
    const publish = items.find((i) => i.key === "publish");
    const serviceTimes = items.find((i) => i.key === "service_times");
    assert.equal(publish.completed, false);
    assert.match(publish.explanation, /has not been published yet/i);
    assert.equal(publish.actionLabel, "Publish website");
    assert.notEqual(publish.actionUrl, "/hq/website");
    assert.equal(serviceTimes.actionUrl, null);
    assert.doesNotMatch(String(serviceTimes.actionUrl || ""), /\/hq\//);
  });

  it("valid key + published homepage produces Publish complete with public path", () => {
    const items = buildChecklist(
      {
        orgDisplayName: "Grace",
        churchId: "11111111-1111-4111-8111-111111111111",
        churchDisplayName: "Grace",
        activeBranchCount: 1,
        publishedPages: 8,
        hasPublishedHomepage: true,
        websiteStatus: "published",
        hasPreviewableHomepage: true,
        previewAcknowledged: true,
        organizationKey: "grace-community-church",
      },
      "grace-community-church",
      { linkContext: "platform_admin" }
    );
    const publish = items.find((i) => i.key === "publish");
    const preview = items.find((i) => i.key === "preview");
    assert.equal(publish.completed, true);
    assert.equal(publish.actionUrl, "/c/grace-community-church");
    assert.equal(publish.actionLabel, "View published website");
    assert.equal(preview.actionUrl, "/admin/organizations/grace-community-church/website-preview");
    assert.equal(preview.actionLabel, "Open website preview");
    assert.doesNotMatch(preview.actionUrl, /\/hq\/website$/);
  });

  it("assembleSummary exposes publicWebsitePath facts", () => {
    const summary = assembleSummary(
      {
        organizationId: "11111111-1111-4111-8111-111111111111",
        organizationKey: "grace-community-church",
        orgDisplayName: "Grace",
        churchId: "22222222-2222-4222-8222-222222222222",
        churchDisplayName: "Grace",
        activeBranchCount: 1,
        publishedPages: 8,
        hasPublishedHomepage: true,
        publishedHomepageId: "33333333-3333-4333-8333-333333333333",
        websiteStatus: "published",
        hasPreviewableHomepage: true,
        previewAcknowledged: true,
        onboardingStatus: "in_progress",
      },
      "grace-community-church"
    );
    assert.equal(summary.organizationKeyAvailable, true);
    assert.equal(summary.publicWebsitePath, "/c/grace-community-church");
    assert.equal(summary.publicWebsiteAvailable, true);
  });
});

describe("foundation checklist integration (platform admin)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app = null;
  let platformAdmin = null;
  let church = null;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });

      const key = uniq("chkpa");
      const email = `pa-${key}@example.org`;
      const user = await createBlessBoardUser(pool, {
        email,
        password: PASSWORD,
        displayName: "Checklist PA",
      });
      assert.equal(user.ok, true, user.message);

      const bootApp = await appRepo.createApplication(pool, {
        church_name: `Chk PA ${key}`,
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
          source: "checklist-links",
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
        organizationKey: provisioned.records.organizationKey,
      };

      const churchKey = uniq("chkch");
      const appRow = await appRepo.createApplication(pool, {
        church_name: `Checklist Church ${churchKey}`,
        country: "Kenya",
        city: "Nairobi",
        contact_name: "Admin",
        contact_email: `${uniq("adm")}@example.org`,
        contact_phone: `+2547${String(Date.now() + 1).slice(-7)}`,
        contact_phone_normalized: `+2547${String(Date.now() + 1).slice(-7)}`,
        selected_plan: "foundation",
        consent_terms: true,
        branch_name: "Main",
      });
      const approved = await approveAndProvisionRegistrationApplication(pool, {
        applicationId: appRow.id,
        actorUserId: platformAdmin.userId,
        organizationKey: churchKey,
        deploymentCode: DEPLOYMENT,
        dataEnvironment: "testing",
      });
      assert.equal(approved.ok, true, approved.message || approved.status);
      church = {
        organizationId: approved.records.organizationId,
        organizationKey: approved.records.organizationKey,
        churchId: approved.records.churchId,
        displayName: `Checklist Church ${churchKey}`,
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

  async function sessionCookie() {
    const created = await createV5Session(pool, {
      deploymentCode: DEPLOYMENT,
      userId: platformAdmin.userId,
      organizationId: platformAdmin.organizationId,
      churchId: null,
      branchId: null,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("onboarding summary publish points at /c/:key after approval provision", async () => {
    requireDb();
    const result = await getOrganizationOnboardingSummary(pool, {
      organizationKey: church.organizationKey,
      linkContext: "platform_admin",
    });
    assert.equal(result.ok, true);
    const publish = result.summary.checklist.find((c) => c.key === "publish");
    const preview = result.summary.checklist.find((c) => c.key === "preview");
    assert.equal(result.summary.organizationKey, church.organizationKey);
    assert.equal(result.summary.publicWebsitePath, `/c/${church.organizationKey}`);
    assert.equal(result.summary.publicWebsiteAvailable, true);
    assert.equal(publish.completed, true);
    assert.equal(publish.actionUrl, `/c/${church.organizationKey}`);
    assert.equal(publish.actionLabel, "View published website");
    assert.equal(
      preview.actionUrl,
      `/admin/organizations/${church.organizationKey}/website-preview`
    );
    assert.doesNotMatch(String(preview.actionUrl || ""), /\/hq\/website$/);
    assert.doesNotMatch(String(publish.actionUrl || ""), /\/hq\/website$/);
  });

  it("platform-admin preview and public route render the correct church", async () => {
    requireDb();
    const cookie = await sessionCookie();

    const preview = await request(app)
      .get(`/admin/organizations/${church.organizationKey}/website-preview`)
      .set("Cookie", cookie)
      .set("Host", APEX);
    assert.equal(preview.status, 200);
    assert.match(preview.text, /Checklist Church/i);
    assert.doesNotMatch(preview.text, /Chk PA/i);

    const publicRes = await request(app)
      .get(`/c/${church.organizationKey}`)
      .set("Host", APEX);
    assert.equal(publicRes.status, 200);
    assert.match(publicRes.text, /Checklist Church/i);
    assert.doesNotMatch(publicRes.text, /not public yet/i);

    const detail = await request(app)
      .get(`/admin/organizations/${church.organizationKey}`)
      .set("Cookie", cookie)
      .set("Host", APEX);
    assert.equal(detail.status, 200);
    assert.match(detail.text, new RegExp(`/c/${church.organizationKey}`));
    assert.match(detail.text, /View published website/);
    assert.match(detail.text, /Open website preview/);
    assert.match(
      detail.text,
      new RegExp(`/admin/organizations/${church.organizationKey}/website-preview`)
    );
    assert.doesNotMatch(detail.text, /href="\/hq\/website"/);
    assert.doesNotMatch(detail.text, /href="\/hq\/content\/pages\/home"/);
    assert.doesNotMatch(detail.text, /href="\/hq\/settings"/);
    assert.match(detail.text, /data-bb-pa-public-website="1"/);
  });

  it("suspended organization public route is unavailable; preview blocked", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.organizations SET status = 'inactive' WHERE id = $1`,
      [church.organizationId]
    );
    const publicRes = await request(app)
      .get(`/c/${church.organizationKey}`)
      .set("Host", APEX);
    assert.equal(publicRes.status, 404);

    const cookie = await sessionCookie();
    const preview = await request(app)
      .get(`/admin/organizations/${church.organizationKey}/website-preview`)
      .set("Cookie", cookie)
      .set("Host", APEX);
    assert.equal(preview.status, 404);

    await pool.query(
      `UPDATE platform.organizations SET status = 'active' WHERE id = $1`,
      [church.organizationId]
    );
  });
});
