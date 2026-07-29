"use strict";

/**
 * Phase 7 post-implementation remediation:
 * denser demo content, church-name tokens, Login header, role routing.
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
  provisionEmptyPublicPages,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  buildPublicDemoPack,
  interpolateDemoText,
  CHURCH_NAME_TOKEN,
} = require("../src/blessboard/services/tenantPublicDemoContent");
const portalSvc = require("../src/blessboard/services/resolveTenantPortalAccess");
const { defaultTenantPostLoginPath: defaultPath } = require("../src/blessboard/http/tenantLoginHelpers");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST = "remediate7.blessboard.org";
const CHURCH_NAME = "Riverlight Fellowship";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

describe("blessboard phase7 remediation demo login routing", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let org;
  let church;
  let branch;
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

      org = await provisionPlatformTenant(pool, {
        organizationKey: "remediate7",
        displayName: CHURCH_NAME,
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "remediate7",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(org.ok, true, org.message);
      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "remediate7",
        churchKey: "remediate7",
        displayName: CHURCH_NAME,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;
      branch = ch.records.hqBranch;
      await repairWebsiteFoundation(pool, { churchId: church.id });
      await ensureChurchSettingsInitialized(pool, church.id);
      await updateChurchSettings(pool, church.id, {
        websiteStatus: "published",
        publicName: CHURCH_NAME,
      });
      await provisionEmptyPublicPages(pool, { churchId: church.id, branchId: null });
      await pool.query(
        `UPDATE blessboard.public_pages SET status = 'published'
          WHERE church_id = $1 AND branch_id IS NULL`,
        [church.id]
      );

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, { email, displayName, password: PASSWORD });
        assert.equal(created.ok, true, created.message);
        if (role) {
          assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        }
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: org.records.organization.id,
          churchId: church.id,
          branchId: branch.id,
        });
        assert.equal(session.ok, true);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hq = await makeUser("rem7-hq@example.test", "HQ", {
        email: "rem7-hq@example.test",
        organizationKey: "remediate7",
        roleKey: "church_hq_admin",
        churchKey: "remediate7",
      });
      users.branch = await makeUser("rem7-branch@example.test", "Branch", {
        email: "rem7-branch@example.test",
        organizationKey: "remediate7",
        roleKey: "branch_admin",
        churchKey: "remediate7",
        branchKey: "hq",
      });

      app = createV5FoundationApp({ getPool: () => pool, env: baseEnv() });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded() {
    if (skipSuite) {
      console.log(`skip: ${skipReason}`);
      return true;
    }
    return false;
  }

  it("demo pack interpolates church name tokens and avoids fixed demo church names", () => {
    if (skipIfNeeded()) return;
    const pack = buildPublicDemoPack({ publicName: CHURCH_NAME });
    assert.match(pack.home.heroBody, new RegExp(CHURCH_NAME));
    assert.match(pack.about.story.bodyText, new RegExp(CHURCH_NAME));
    assert.match(pack.footer.description, new RegExp(CHURCH_NAME));
    assert.equal(interpolateDemoText(`Welcome to ${CHURCH_NAME_TOKEN}`, CHURCH_NAME), `Welcome to ${CHURCH_NAME}`);
    assert.doesNotMatch(JSON.stringify(pack), /Grace Community Church|Sample Church|Demo Church|lorem ipsum/i);
    assert.ok(pack.home.heroBody.split(/\s+/).length >= 35);
    assert.ok(pack.about.story.bodyText.split(/\s+/).length >= 160);
    assert.ok(pack.ministries.length >= 4);
    assert.ok(pack.events.length >= 3);
    assert.ok(pack.sermons.length >= 3);
    assert.ok(pack.leaders.length >= 4);
    assert.ok(pack.about.values.length >= 4);
  });

  it("published pages show church name and dense demo content without fixed Grace name", async () => {
    if (skipIfNeeded()) return;
    const home = await request(app).get("/").set("Host", HOST).expect(200);
    assert.match(home.text, new RegExp(CHURCH_NAME));
    assert.match(home.text, /Faith, Community and Hope/);
    assert.match(home.text, /Children’s Ministry|Youth Ministry|Women’s Fellowship|Community Outreach/);
    assert.doesNotMatch(home.text, /Grace Community Church|lorem ipsum/i);
    assert.match(home.text, /data-bb-public-login="1"/);
    assert.match(home.text, />Login</);
    assert.doesNotMatch(home.text, /website-inline-edit\.js/);

    const about = await request(app).get("/about").set("Host", HOST).expect(200);
    assert.match(about.text, /How We Began/);
    assert.match(about.text, new RegExp(CHURCH_NAME));
    assert.match(about.text, /Presence|Integrity|Compassion|Discipleship/);

    const leadership = await request(app).get("/leadership").set("Host", HOST).expect(200);
    assert.match(leadership.text, /Pastor Jordan Hale/);
    assert.match(leadership.text, /Sarah Chen|David Miller|Sam Okonkwo/);

    const ministries = await request(app).get("/ministries").set("Host", HOST).expect(200);
    assert.match(ministries.text, /Children’s Ministry/);
    assert.match(ministries.text, /Youth Ministry/);
    assert.match(ministries.text, /Women’s Fellowship/);
    assert.match(ministries.text, /Community Outreach/);

    const events = await request(app).get("/events").set("Host", HOST).expect(200);
    assert.match(events.text, /Leaders Equipping Weekend|Sunday Morning Connection|Neighbourhood Celebration/);

    const sermons = await request(app).get("/sermons").set("Host", HOST).expect(200);
    assert.match(sermons.text, /Finding Peace in the Noise/);
    assert.match(sermons.text, /The Gift of Attention|Be Still and Know/);

    const giving = await request(app).get("/giving").set("Host", HOST).expect(200);
    assert.match(giving.text, /does not process payments/i);
    assert.doesNotMatch(giving.text, /stripe|paypal|account number|iban/i);

    const contact = await request(app).get("/contact").set("Host", HOST).expect(200);
    assert.match(contact.text, /First Visit Guidance|We'd Love to Hear From You/);
  });

  it("authenticated header replaces Login with portal destination", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app)
      .get("/")
      .set("Host", HOST)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hq.rawToken}`)
      .expect(200);
    assert.doesNotMatch(res.text, /data-bb-public-login="1"/);
    assert.match(res.text, /data-bb-public-portal="1"/);
    assert.match(res.text, /href="\/hq"/);
  });

  it("portal access resolves single and multi roles; rejects unsafe next", async () => {
    if (skipIfNeeded()) return;
    const hq = await portalSvc.resolveTenantPortalAccess({
      db: pool,
      userId: users.hq.user.id,
      organizationId: org.records.organization.id,
      churchId: church.id,
      branchId: branch.id,
      nextRaw: "https://evil.example/",
    });
    assert.equal(hq.hasAccess, true);
    assert.equal(hq.destination, "/hq");
    assert.equal(hq.multiRole, false);

    const branchOnly = await portalSvc.resolveTenantPortalAccess({
      db: pool,
      userId: users.branch.user.id,
      organizationId: org.records.organization.id,
      churchId: church.id,
      branchId: branch.id,
    });
    assert.equal(branchOnly.destination, "/branch-admin");

    assert.equal(defaultPath([{ roleKey: "church_hq_admin" }]), "/hq");
    assert.equal(defaultPath([{ roleKey: "branch_admin" }]), "/branch-admin");
    assert.equal(defaultPath([{ roleKey: "member" }]), "/member");
    assert.equal(
      defaultPath([{ roleKey: "church_hq_admin" }, { roleKey: "member" }]),
      "/account"
    );
  });
});
