"use strict";

/**
 * BUG 08: BlessBoard /hq/website/branding parity with ActiveClinic branding CMS.
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
const { repairWebsiteFoundation } = require("../src/blessboard/services/websiteFoundationRepairService");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const { registerBlessBoardWebsiteTemplate } = require("../src/blessboard/website/blessboardChurchTemplate");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const versionService = require("../src/platform/website/versionService");
const resolver = require("../src/platform/website/resolver");
const {
  normalizeHexColor,
  loadWebsiteBranding,
} = require("../src/platform/website/branding");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const cmsService = require("../src/activeclinic/website/clinicWebsiteCmsService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "bb-web-08-branding-12";

let pool;
let skipReason = null;
let stamp = 0;

function requireDb() {
  if (skipReason) {
    assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }
}

function extractCsrf(html) {
  const match = String(html || "").match(
    new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
  );
  return match ? match[1] || match[2] : "";
}

function cookieHeader(base, res) {
  const set = res.headers["set-cookie"];
  const extra = Array.isArray(set) ? set.map((c) => c.split(";")[0]).join("; ") : "";
  return extra ? `${base}; ${extra}` : base;
}

function makeBbApp() {
  return createV5FoundationApp({
    getPool: () => pool,
    env: {
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
      SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
      SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
      BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
      BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
      DEPLOYMENT_ENV: "testing",
    },
  });
}

async function provisionChurch(suffix) {
  stamp += 1;
  const key = `bb08${suffix}${stamp}`;
  const host = `${key}.blessboard.org`;
  const org = await provisionPlatformTenant(pool, {
    organizationKey: key,
    displayName: `BB08 Church ${key}`,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: key,
    hostname: host,
    domainType: "canonical",
    deploymentCode: "blessboard-org-staging",
    isPrimary: true,
  });
  assert.equal(org.ok, true, org.message);
  const churchProv = await provisionBlessBoardChurch(pool, {
    organizationKey: key,
    churchKey: key,
    displayName: `BB08 Church ${key}`,
    legalName: null,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
    timezone: "Africa/Lusaka",
    countryCode: "ZM",
  });
  assert.equal(churchProv.ok, true, churchProv.message);
  const churchId = churchProv.records.church.id;
  const hqBranchId = churchProv.records.hqBranch.id;
  const organizationId = org.records.organization.id;
  await pool.query(
    `INSERT INTO blessboard.church_settings (church_id, public_name, primary_email, website_status)
     VALUES ($1, $2, $3, 'published')
     ON CONFLICT (church_id) DO UPDATE
       SET public_name = EXCLUDED.public_name,
           website_status = 'published'`,
    [churchId, `BB08 Church ${key}`, `${key}@example.org`]
  );
  const repaired = await repairWebsiteFoundation(pool, {
    churchId,
    publicName: `BB08 Church ${key}`,
  });
  assert.equal(repaired.ok, true, JSON.stringify(repaired));
  registerBlessBoardWebsiteTemplate();
  const hqUser = await createBlessBoardUser(pool, {
    email: `${key}-hq@example.org`,
    password: PASSWORD,
    displayName: "HQ Admin",
  });
  assert.equal(hqUser.ok, true, hqUser.message);
  assert.equal(
    (
      await assignBlessBoardRole(pool, {
        email: `${key}-hq@example.org`,
        organizationKey: key,
        roleKey: "church_hq_admin",
        churchKey: key,
      })
    ).ok,
    true
  );
  const branchUser = await createBlessBoardUser(pool, {
    email: `${key}-ba@example.org`,
    password: PASSWORD,
    displayName: "Branch Admin",
  });
  assert.equal(branchUser.ok, true, branchUser.message);
  assert.equal(
    (
      await assignBlessBoardRole(pool, {
        email: `${key}-ba@example.org`,
        organizationKey: key,
        roleKey: "branch_admin",
        churchKey: key,
        branchKey: "hq",
      })
    ).ok,
    true
  );
  return {
    key,
    host,
    organizationId,
    churchId,
    hqBranchId,
    hqUserId: hqUser.user.id,
    branchUserId: branchUser.user.id,
  };
}

async function hqCookie(church, userId) {
  const created = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId,
    organizationId: church.organizationId,
    churchId: church.churchId,
    branchId: church.hqBranchId,
  });
  assert.equal(created.ok, true, created.code);
  return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
}

describe("BlessBoard website branding (BUG 08)", () => {
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
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("normalizes branding colours without a database", () => {
    assert.equal(normalizeHexColor("").ok, true);
    assert.equal(normalizeHexColor("").value, null);
    assert.equal(normalizeHexColor("#6C5CE7").value, "#6c5ce7");
    assert.equal(normalizeHexColor("not-a-colour").ok, false);
  });

  it("GET /hq/website/branding loads with church context and form controls", async () => {
    requireDb();
    const church = await provisionChurch("load");
    const cookie = await hqCookie(church, church.hqUserId);
    const page = await request(makeBbApp())
      .get("/hq/website/branding")
      .set("Host", church.host)
      .set("Cookie", cookie);
    assert.equal(page.status, 200, page.text && page.text.slice(0, 300));
    assert.match(page.text, /data-bb-hq-website-branding="1"/);
    assert.match(page.text, /Branding Settings/);
    assert.match(page.text, /data-bb-wb-brand-preview="1"/);
    assert.match(page.text, /Primary colour/);
    assert.match(page.text, /Accent colour/);
    assert.match(page.text, new RegExp(`BB08 Church ${church.key}`));
    assert.match(page.text, /website-branding\.js/);
    assert.match(page.text, new RegExp(`/c/${church.key}/website/media`));
  });

  it("saves branding to draft without changing the live public site until publish", async () => {
    requireDb();
    const church = await provisionChurch("draft");
    const app = makeBbApp();
    const cookie = await hqCookie(church, church.hqUserId);
    const other = await provisionChurch("other");

    const brandingPage = await request(app)
      .get("/hq/website/branding")
      .set("Host", church.host)
      .set("Cookie", cookie);
    assert.equal(brandingPage.status, 200);
    const cookies = cookieHeader(cookie, brandingPage);

    const bad = await request(app)
      .post("/hq/website/branding")
      .set("Host", church.host)
      .set("Cookie", cookies)
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(brandingPage.text),
        primaryColor: "not-a-colour",
        accentColor: "#5341cd",
      });
    assert.equal(bad.status, 200);
    assert.match(bad.text, /6-digit colour/i);

    const saved = await request(app)
      .post("/hq/website/branding")
      .set("Host", church.host)
      .set("Cookie", cookies)
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(brandingPage.text),
        primaryColor: "#112233",
        accentColor: "#445566",
        logoAlt: "Draft church logo",
      });
    assert.equal(saved.status, 303, saved.text);
    assert.match(saved.headers.location, /\/hq\/website\/branding\?saved=1/);

    const loaded = await loadWebsiteBranding(pool, {
      organizationId: church.organizationId,
      productCode: "blessboard",
    });
    assert.equal(loaded.ok, true);
    assert.equal(loaded.values["brand.primary_color"], "#112233");
    assert.equal(loaded.values["brand.accent_color"], "#445566");

    const hub = await request(app)
      .get("/hq/website")
      .set("Host", church.host)
      .set("Cookie", cookie);
    assert.equal(hub.status, 200);
    assert.match(hub.text, /data-bb-website-unpublished="1"/);

    const live = await request(app).get(`/c/${church.key}`).set("Host", church.host);
    assert.equal(live.status, 200);
    assert.doesNotMatch(live.text, /--bb-violet:#112233|--bb-color-primary:#112233/);

    const preview = await request(app)
      .get(`/c/${church.key}?website_mode=draft`)
      .set("Host", church.host)
      .set("Cookie", cookie);
    assert.equal(preview.status, 200);
    assert.match(preview.text, /--bb-violet:#112233|--bb-color-primary:#112233/);

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: church.organizationId,
      productCode: "blessboard",
    });
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: church.organizationId,
      instanceId: instance.id,
      expectedProductCode: "blessboard",
      actorIdentityId: church.hqUserId,
      allowEmpty: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));

    const liveAfter = await request(app).get(`/c/${church.key}`).set("Host", church.host);
    assert.equal(liveAfter.status, 200);
    assert.match(liveAfter.text, /--bb-violet:#112233|--bb-color-primary:#112233/);

    const crossed = await request(app)
      .post("/hq/website/branding")
      .set("Host", church.host)
      .set("Cookie", await hqCookie(other, other.hqUserId))
      .type("form")
      .send({
        [CSRF_FIELD]: "invalid",
        primaryColor: "#ffffff",
        accentColor: "#000000",
      });
    assert.ok(crossed.status === 403 || crossed.status === 303);

    const branch = await request(app)
      .get("/hq/website/branding")
      .set("Host", church.host)
      .set("Cookie", await hqCookie(church, church.branchUserId));
    assert.ok(branch.status === 403 || branch.status === 303);
  });

  it("restore republishes prior branding from version history", async () => {
    requireDb();
    const church = await provisionChurch("restore");
    const app = makeBbApp();
    const cookie = await hqCookie(church, church.hqUserId);
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: church.organizationId,
      productCode: "blessboard",
    });
    assert.ok(instance);

    await contentService.saveWebsiteDraft(pool, {
      organizationId: church.organizationId,
      instanceId: instance.id,
      contentKey: "brand.primary_color",
      value: "#111111",
      actorIdentityId: church.hqUserId,
    });
    const v1 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: church.organizationId,
      instanceId: instance.id,
      expectedProductCode: "blessboard",
      actorIdentityId: church.hqUserId,
      allowEmpty: true,
    });
    assert.equal(v1.ok, true, JSON.stringify(v1));

    const brandingPage = await request(app)
      .get("/hq/website/branding")
      .set("Host", church.host)
      .set("Cookie", cookie);
    const saved = await request(app)
      .post("/hq/website/branding")
      .set("Host", church.host)
      .set("Cookie", cookieHeader(cookie, brandingPage))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(brandingPage.text),
        primaryColor: "#222222",
        accentColor: "#333333",
      });
    assert.equal(saved.status, 303);
    const v2 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: church.organizationId,
      instanceId: instance.id,
      expectedProductCode: "blessboard",
      actorIdentityId: church.hqUserId,
      allowEmpty: true,
    });
    assert.equal(v2.ok, true, JSON.stringify(v2));

    const liveV2 = await resolver.resolveWebsiteContent(pool, {
      organizationId: church.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveV2.values["brand.primary_color"], "#222222");

    const versions = await versionService.listWebsiteVersions(pool, {
      organizationId: church.organizationId,
      instanceId: instance.id,
    });
    const first = (versions.versions || []).find((v) => v.versionNumber === 1);
    assert.ok(first, "expected version 1");

    const restored = await publicationService.restoreWebsiteVersionToDraft(pool, {
      organizationId: church.organizationId,
      instanceId: instance.id,
      versionId: first.id,
      expectedProductCode: "blessboard",
      actorIdentityId: church.hqUserId,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));

    const draftAfterRestore = await resolver.resolveWebsiteContent(pool, {
      organizationId: church.organizationId,
      instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(draftAfterRestore.values["brand.primary_color"], "#111111");

    const v3 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: church.organizationId,
      instanceId: instance.id,
      expectedProductCode: "blessboard",
      actorIdentityId: church.hqUserId,
      allowEmpty: true,
    });
    assert.equal(v3.ok, true, JSON.stringify(v3));

    const liveRestored = await resolver.resolveWebsiteContent(pool, {
      organizationId: church.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveRestored.values["brand.primary_color"], "#111111");
  });

  it("ActiveClinic branding route remains unchanged", async () => {
    requireDb();
    stamp += 1;
    const result = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `BB08 AC ${stamp}`,
      contactName: "Clinic Admin",
      contactEmail: `bb08-ac-${stamp}@example.invalid`,
      contactPhone: `+2609${String(870000000 + stamp).slice(-8)}`,
      province: "Lusaka Province",
      city: "Lusaka",
      address: "1 Independence Avenue",
      countryCode: "ZM",
      notes: "bb08 regression",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: result.identityId,
      organizationId: result.organizationId,
    });
    const cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
        DATABASE_URL: "postgres://unused/local",
        SESSION_SECRET: "a".repeat(40),
      },
      log: () => {},
    });
    const page = await request(app).get("/app/settings/website/branding").set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /Branding Settings/);
    assert.match(page.text, /data-ac-mw-brand-preview/);
    assert.equal(cmsService.normalizeHexColor("#0D9488").value, "#0d9488");
  });
});
