"use strict";

/**
 * BUG 07: BlessBoard GET /hq/website uses the shared Website management
 * presentation that ActiveClinic GET /app/settings/website already uses.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
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
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { repairWebsiteFoundation } = require("../src/blessboard/services/websiteFoundationRepairService");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { registerBlessBoardWebsiteTemplate } = require("../src/blessboard/website/blessboardChurchTemplate");
const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "bb-web-07-hub-parity-12";
const ROOT = path.join(__dirname, "..");

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 870000000;

function requireDb() {
  if (skipReason) {
    assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function clinicPayload() {
  stamp += 1;
  return {
    clinicName: `BB07 Clinic ${stamp}`,
    contactName: "Clinic Admin",
    contactEmail: `bb07-ac-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka Province",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "bug 07 ac regression",
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  };
}

function makeAcApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
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

async function acCookie(identityId, organizationId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

async function provisionChurch(suffix) {
  stamp += 1;
  const key = `bb07${suffix}${stamp}`;
  const host = `${key}.blessboard.org`;
  const org = await provisionPlatformTenant(pool, {
    organizationKey: key,
    displayName: `BB07 Church ${key}`,
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
    displayName: `BB07 Church ${key}`,
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
     VALUES ($1, $2, $3, 'draft')
     ON CONFLICT (church_id) DO UPDATE
       SET public_name = EXCLUDED.public_name,
           website_status = 'draft'`,
    [churchId, `BB07 Church ${key}`, `${key}@example.org`]
  );
  const repaired = await repairWebsiteFoundation(pool, {
    churchId,
    publicName: `BB07 Church ${key}`,
  });
  assert.equal(repaired.ok, true, JSON.stringify(repaired));
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

describe("BlessBoard Website management hub parity (BUG 07)", () => {
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

  it("shared presentation markup exists for BlessBoard and is not copied into ActiveClinic", () => {
    const hub = read("views/blessboard/v5/hq/website-management.ejs");
    const ac = read("views/activeclinic/app/settings-website-content.ejs");
    const route = read("src/blessboard/http/churchWebsiteAdminRoutes.js");
    const css = read("public/blessboard/v5/hq-admin.css");
    const acCss = read("public/activeclinic/website-cms.css");
    const presenter = read("src/platform/website/websiteManagementPresentation.js");
    const nav = read("src/blessboard/http/hqAdminNav.js");

    assert.match(hub, /data-bb-website-management="1"/);
    assert.match(hub, /Website Management Hub/);
    assert.match(hub, /church website/);
    assert.match(hub, /data-bb-website-status="1"/);
    assert.match(hub, /data-bb-website-public-url="1"/);
    assert.match(hub, /data-bb-website-unpublished=/);
    assert.match(hub, /data-bb-website-action="edit"/);
    assert.match(hub, /data-bb-website-action="preview"/);
    assert.match(hub, /data-bb-website-action="publish"/);
    assert.match(hub, /data-bb-website-action="unpublish"/);
    assert.match(hub, /data-bb-website-action="history"/);
    assert.match(hub, /action="<%= actions\.publishPath %>"/);
    assert.match(hub, /confirm_publish/);
    assert.match(hub, /bb-wm-hub-metrics/);
    assert.match(hub, /bb-wm-hub-quick/);
    assert.match(hub, /bb-wm-hub-tiles/);
    assert.match(route, /loadWebsiteManagementSummary/);
    assert.match(route, /website-management\.ejs/);
    assert.match(presenter, /function loadWebsiteManagementSummary/);
    assert.match(presenter, /function presentBlessBoardHqWebsiteSettingsUx/);
    assert.match(nav, /label:\s*"Website"/);
    assert.match(nav, /href:\s*"\/hq\/website"/);
    assert.match(css, /\.bb-wm-hub-metrics/);
    assert.match(css, /min-height:\s*2\.75rem/);
    assert.match(css, /@media \(max-width:\s*720px\)/);
    assert.doesNotMatch(ac, /bb-wm/);
    assert.doesNotMatch(ac, /data-bb-website-management/);
    assert.doesNotMatch(acCss, /\.bb-wm/);
    assert.match(ac, /data-ac-website-management="1"/);
    assert.match(ac, /Website Management Hub/);
  });

  it("HQ admin sees shared hub with church public URL, status, edit, preview, publish, history", async () => {
    requireDb();
    const church = await provisionChurch("a");
    const page = await request(makeBbApp())
      .get("/hq/website")
      .set("Host", church.host)
      .set("Cookie", await hqCookie(church, church.hqUserId));
    assert.equal(page.status, 200, page.text && page.text.slice(0, 300));
    assert.match(page.text, /data-bb-website-management="1"/);
    assert.match(page.text, /data-bb-website-settings-ux="1"/);
    assert.match(page.text, /Website Management Hub/);
    assert.match(page.text, /data-bb-website-status="1"/);
    assert.match(page.text, /Website not published yet|Coming soon/i);
    assert.match(page.text, new RegExp(`/c/${church.key}`));
    assert.match(page.text, /data-bb-website-public-url="1"/);
    assert.match(page.text, /data-bb-website-unpublished=/);
    assert.match(page.text, /data-bb-website-last-published="1"/);
    assert.match(page.text, /data-bb-website-published-version="1"/);
    assert.match(page.text, new RegExp(`/c/${church.key}\\?website_edit=1`));
    assert.match(page.text, new RegExp(`/c/${church.key}\\?website_mode=draft`));
    assert.doesNotMatch(page.text, /data-bb-website-action="view-live"/);
    assert.match(page.text, /data-bb-website-action="edit"/);
    assert.match(page.text, /data-bb-website-action="preview"/);
    assert.match(page.text, /data-bb-website-action="publish"/);
    assert.match(page.text, /action="\/hq\/website\/publish"/);
    assert.match(page.text, /data-bb-website-action="history"/);
    assert.match(page.text, /href="\/hq\/website\/version-history"/);
    assert.doesNotMatch(page.text, /data-ac-website-management/);
    assert.doesNotMatch(page.text, /class="ac-mw/);
  });

  it("published church shows View live and Unpublish; drafts surface unpublished changes including logo", async () => {
    requireDb();
    registerBlessBoardWebsiteTemplate();
    const church = await provisionChurch("p");
    await pool.query(
      `UPDATE blessboard.church_settings SET website_status = 'published' WHERE church_id = $1`,
      [church.churchId]
    );
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: church.organizationId,
      productCode: PRODUCT_CODE.BLESSBOARD,
    });
    assert.ok(instance);
    const livePage = await request(makeBbApp())
      .get("/hq/website")
      .set("Host", church.host)
      .set("Cookie", await hqCookie(church, church.hqUserId));
    assert.equal(livePage.status, 200);
    assert.match(livePage.text, /data-bb-website-action="view-live"/);
    assert.match(livePage.text, /data-bb-website-action="unpublish"/);
    assert.match(livePage.text, /action="\/hq\/website\/unpublish"/);
    assert.match(livePage.text, /Published/);

    const saved = await contentService.saveWebsiteDraft(pool, {
      organizationId: church.organizationId,
      instanceId: instance.id,
      contentKey: "home.logo",
      value: { alt: "Draft logo", src: "/tmp/draft-logo.png" },
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    const draftPage = await request(makeBbApp())
      .get("/hq/website")
      .set("Host", church.host)
      .set("Cookie", await hqCookie(church, church.hqUserId));
    assert.equal(draftPage.status, 200);
    assert.match(draftPage.text, /data-bb-website-unpublished="1"/);
    assert.match(draftPage.text, /unpublished change/i);
    assert.match(draftPage.text, /data-bb-website-action="view-live"/);
  });

  it("branch admin cannot open HQ website hub; other church HQ cannot use this host", async () => {
    requireDb();
    const a = await provisionChurch("x");
    const b = await provisionChurch("y");
    const branch = await request(makeBbApp())
      .get("/hq/website")
      .set("Host", a.host)
      .set("Cookie", await hqCookie(a, a.branchUserId));
    assert.ok(branch.status === 403 || branch.status === 303, `branch status=${branch.status}`);
    assert.doesNotMatch(branch.text || "", /data-bb-website-management="1"/);

    const crossed = await request(makeBbApp())
      .get("/hq/website")
      .set("Host", a.host)
      .set("Cookie", await hqCookie(b, b.hqUserId));
    assert.ok(
      crossed.status === 403 || crossed.status === 303 || crossed.status === 404,
      `cross-tenant status=${crossed.status}`
    );
    if (crossed.status === 200) {
      assert.doesNotMatch(crossed.text, new RegExp(`/c/${b.key}`));
    }
  });

  it("ActiveClinic /app/settings/website is unchanged by the BlessBoard hub", async () => {
    requireDb();
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    assert.equal(result.ok, true, JSON.stringify(result));
    const page = await request(makeAcApp())
      .get("/app/settings/website")
      .set("Cookie", await acCookie(result.identityId, result.organizationId));
    assert.equal(page.status, 200);
    assert.match(page.text, /data-ac-website-management="1"/);
    assert.match(page.text, /Website Management Hub/);
    assert.match(page.text, /data-ac-website-status-label="1"/);
    assert.match(page.text, /data-ac-website-public-url="1"/);
    assert.match(page.text, /data-ac-website-action="edit"/);
    assert.match(page.text, /data-ac-website-action="preview"/);
    assert.match(page.text, /data-ac-website-action="publish"/);
    assert.match(page.text, /data-ac-website-action="history"/);
    assert.doesNotMatch(page.text, /data-bb-website-management/);
    assert.doesNotMatch(page.text, /class="bb-wm/);
    assert.doesNotMatch(page.text, /church website/);
  });
});
