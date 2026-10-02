"use strict";

/**
 * V2.05 / V5 — Admin Console mobile interaction (390px).
 *
 * Real Playwright Chromium coverage for AC + BB Admin Console:
 * dashboard → hamburger opens drawer → Website → route change → drawer
 * reset → reopen → another permitted module → no overflow → close/focus
 * usable → touch targets usable.
 *
 * Reuses existing Playwright + foundation provision patterns
 * (blessboard-v5-mobile-burger-browser / AC 390px suites). No new UI.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium } = require("playwright");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const { createFacility } = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
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
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { ENV_KEY } = require("../src/blessboard/config/instantFreeProvisioningEnabled");
const {
  provisionBlessBoardChurch,
} = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  createBlessBoardUser,
} = require("../src/blessboard/services/createBlessBoardUser");
const {
  assignBlessBoardRole,
} = require("../src/blessboard/services/assignBlessBoardRole");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "AdminConsole-Mobile-99!";
const AC_HOST = "activeclinic.org";
const VIEWPORT = Object.freeze({ width: 390, height: 844 });
const MIN_TOUCH = 40;

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "a".repeat(48),
  TRUST_PROXY: "1",
});

const MINIMAL_BB = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
  TRUST_PROXY: "1",
  [ENV_KEY]: "1",
});

let pool;
let databaseUrl;
let skipReason = null;
let browser;
let acCases = 0;
let bbCases = 0;

function requireReady() {
  if (skipReason) {
    assert.fail(`Local PostgreSQL / Playwright unavailable: ${skipReason}`);
  }
}

function uniq(prefix) {
  return `${prefix}${crypto.randomBytes(3).toString("hex")}`.slice(0, 20);
}

function nextPhone() {
  return `+26097${String(Date.now()).slice(-7)}${crypto.randomBytes(1).readUInt8(0) % 10}`;
}

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function assertNoOverflow(page, label) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      width: doc.clientWidth,
      overflow:
        Math.max(doc.scrollWidth, document.body.scrollWidth) > doc.clientWidth + 2,
    };
  });
  assert.equal(metrics.width, 390, `${label} viewport width`);
  assert.equal(metrics.overflow, false, `${label} horizontal overflow`);
}

async function assertTouchUsable(page, selector, label) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box, `${label} missing`);
  assert.ok(
    box.width >= MIN_TOUCH || box.height >= MIN_TOUCH,
    `${label} touch target ${box.width}x${box.height}`
  );
}

async function seedAcOrgAdmin() {
  const stamp = uniq("m");
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `ac_mi_${stamp}`,
    displayName: `Mobile AC ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `ac-mi-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: `${stamp} Legal`,
    publicName: `${stamp} Clinic`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `f-${stamp}`,
    displayName: "Main Facility",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true);
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `orgadmin.${stamp}@acmobile.smoke`,
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true);
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    firstName: "Org",
    lastName: "Admin",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: "Organization admin",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
    isPrimary: true,
  });
  const role = await assignStaffRole(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    roleKey: ORGANIZATION_ADMIN,
    scopeType: "organisation",
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(role.ok, true, JSON.stringify(role));
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identity.identity.id,
    organizationId: org.records.organization.id,
    contextJson: { selectedFacilityId: facility.facility.id },
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return { cookieValue: session.rawToken };
}

async function seedBbHqAdmin() {
  const stamp = uniq("b");
  const orgKey = `bbmi${String(stamp).replace(/[^a-z0-9]/gi, "")}`.slice(0, 24);
  const host = `${orgKey}.blessboard.org`;
  const tenant = await provisionPlatformTenant(pool, {
    organizationKey: orgKey,
    displayName: `Mobile BB ${stamp}`,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: orgKey,
    hostname: host,
    domainType: "canonical",
    deploymentCode: "blessboard-org-staging",
    isPrimary: true,
  });
  assert.equal(tenant.ok, true, JSON.stringify(tenant));
  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: orgKey,
    churchKey: orgKey,
    displayName: `Mobile Church ${stamp}`,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true, JSON.stringify(church));
  const organizationId = (
    await pool.query(`SELECT id FROM platform.organizations WHERE organization_key=$1`, [
      orgKey,
    ])
  ).rows[0].id;
  const email = `hq-${stamp}@bbmobile.smoke`;
  const created = await createBlessBoardUser(pool, {
    email,
    password: PASSWORD,
    displayName: "HQ Admin",
  });
  assert.equal(created.ok, true, created.message || JSON.stringify(created));
  const assigned = await assignBlessBoardRole(pool, {
    email,
    organizationKey: orgKey,
    roleKey: "church_hq_admin",
    churchKey: orgKey,
  });
  assert.equal(assigned.ok, true, JSON.stringify(assigned));
  const session = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging",
    userId: created.user.id,
    organizationId,
    churchId: church.records.church.id,
    branchId: church.records.hqBranch.id,
  });
  assert.equal(session.ok, true, session.code || JSON.stringify(session));
  return { host, cookieValue: session.rawToken };
}

describe("V2.05 Admin Console mobile interaction (390px)", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (browser) await browser.close().catch(() => {});
    if (pool) await pool.end().catch(() => {});
  });

  it("AC: hamburger → Website → reopen → Staff, overflow/close/touch", async () => {
    requireReady();
    const admin = await seedAcOrgAdmin();
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      log: () => {},
    });
    const { server, baseUrl } = await listen(app);
    let context;
    try {
      context = await browser.newContext({
        viewport: VIEWPORT,
        extraHTTPHeaders: {
          "X-Forwarded-Host": AC_HOST,
          "X-Forwarded-Proto": "http",
        },
      });
      await context.addCookies([
        {
          name: COOKIE_ACTIVECLINIC_ORG,
          value: admin.cookieValue,
          domain: "127.0.0.1",
          path: "/",
        },
      ]);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (err) => errors.push(String(err)));

      // 1) Open dashboard
      const dash = await page.goto(`${baseUrl}/app`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      assert.ok(dash && dash.ok(), `AC /app status ${dash && dash.status()}`);
      await page.waitForSelector('[data-ac-nav-toggle="1"]', { timeout: 10_000 });
      await assertNoOverflow(page, "AC dashboard");
      acCases += 1;

      // 2–3) Hamburger opens; drawer visible
      const toggle = page.locator('[data-ac-nav-toggle="1"]').first();
      await assertTouchUsable(page, '[data-ac-nav-toggle="1"]', "AC hamburger");
      await toggle.click();
      await page.waitForFunction(() => {
        return (
          document.body.classList.contains("ac-drawer-open") &&
          document.querySelector('[data-ac-nav-toggle="1"]')?.getAttribute("aria-expanded") ===
            "true"
        );
      });
      const drawer = page.locator("#ac-nav-drawer, [data-ac-nav-drawer='1']").first();
      assert.equal(await drawer.getAttribute("aria-hidden"), "false");
      await page.waitForSelector(
        '#ac-nav-drawer a[data-ac-nav-key="website"], [data-ac-nav-drawer] a[data-ac-nav-key="website"]'
      );
      acCases += 1;

      // Close control usable (Escape + focus restore)
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => {
        return (
          !document.body.classList.contains("ac-drawer-open") &&
          document.querySelector('[data-ac-nav-toggle="1"]')?.getAttribute("aria-expanded") ===
            "false"
        );
      });
      const focusedAfterEsc = await page.evaluate(() => {
        const el = document.activeElement;
        return el && el.getAttribute("data-ac-nav-toggle") === "1";
      });
      assert.equal(focusedAfterEsc, true, "AC focus restored to hamburger");
      acCases += 1;

      // Reopen and click Website
      await toggle.click();
      await page.waitForFunction(() => document.body.classList.contains("ac-drawer-open"));
      const websiteLink = page
        .locator('#ac-nav-drawer a[data-ac-nav-key="website"], [data-ac-nav-drawer] a[data-ac-nav-key="website"]')
        .first();
      await assertTouchUsable(
        page,
        '#ac-nav-drawer a[data-ac-nav-key="website"], [data-ac-nav-drawer] a[data-ac-nav-key="website"]',
        "AC Website link"
      );
      await Promise.all([
        page.waitForURL(/\/app\/settings\/website/, { timeout: 15_000 }),
        websiteLink.click(),
      ]);
      assert.match(page.url(), /\/app\/settings\/website/);
      acCases += 1;

      // Drawer closed/reset after navigation
      await page.waitForSelector('[data-ac-nav-toggle="1"]');
      assert.equal(
        await page.locator('[data-ac-nav-toggle="1"]').first().getAttribute("aria-expanded"),
        "false"
      );
      assert.equal(
        await page.evaluate(() => document.body.classList.contains("ac-drawer-open")),
        false
      );
      await assertNoOverflow(page, "AC website");
      acCases += 1;

      // Reopen → another permitted module (Staff)
      await page.locator('[data-ac-nav-toggle="1"]').first().click();
      await page.waitForFunction(() => document.body.classList.contains("ac-drawer-open"));
      const closeBtn = page.locator("[data-ac-nav-close]").first();
      if (await closeBtn.count()) {
        await assertTouchUsable(page, "[data-ac-nav-close]", "AC close");
      }
      const staffLink = page
        .locator('#ac-nav-drawer a[data-ac-nav-key="staff"], [data-ac-nav-drawer] a[data-ac-nav-key="staff"]')
        .first();
      await Promise.all([
        page.waitForURL(/\/app\/staff/, { timeout: 15_000 }),
        staffLink.click(),
      ]);
      assert.match(page.url(), /\/app\/staff/);
      await assertNoOverflow(page, "AC staff");
      assert.equal(errors.length, 0, `AC js errors: ${errors.join("; ")}`);
      acCases += 1;
    } finally {
      if (context) await context.close().catch(() => {});
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("BB: hamburger → Website → reopen → Members, overflow/close/touch", async () => {
    requireReady();
    const hq = await seedBbHqAdmin();
    const app = createV5FoundationApp({
      env: MINIMAL_BB,
      getPool: () => pool,
    });
    const { server, baseUrl } = await listen(app);
    let context;
    try {
      context = await browser.newContext({
        viewport: VIEWPORT,
        extraHTTPHeaders: {
          "X-Forwarded-Host": hq.host,
          "X-Forwarded-Proto": "http",
        },
      });
      await context.addCookies([
        {
          name: DEFAULT_V5_COOKIE,
          value: hq.cookieValue,
          domain: "127.0.0.1",
          path: "/",
        },
      ]);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (err) => errors.push(String(err)));

      // 1) Open HQ dashboard
      const dash = await page.goto(`${baseUrl}/hq`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      assert.ok(dash && dash.ok(), `BB /hq status ${dash && dash.status()}`);
      await page.waitForSelector('[data-bb-nav="mobile-toggle"]', { timeout: 10_000 });
      await assertNoOverflow(page, "BB dashboard");
      bbCases += 1;

      // 2–3) Hamburger opens; drawer visible
      const burger = page.locator('[data-bb-nav="mobile-toggle"]').first();
      await assertTouchUsable(page, '[data-bb-nav="mobile-toggle"]', "BB hamburger");
      await burger.click();
      await page.waitForFunction(() => {
        const btn = document.querySelector('[data-bb-nav="mobile-toggle"]');
        return btn && btn.getAttribute("aria-expanded") === "true";
      });
      const drawer = page.locator("#bb-hq-drawer").first();
      assert.ok(!(await drawer.getAttribute("hidden")));
      await page
        .locator("#bb-hq-drawer .bb-hq-drawer__panel")
        .first()
        .waitFor({ state: "visible", timeout: 5000 });
      bbCases += 1;

      // Close control usable
      const closeBtn = page.locator('#bb-hq-drawer [data-bb-nav="drawer-close"].bb-hq-drawer__close').first();
      await assertTouchUsable(
        page,
        '#bb-hq-drawer [data-bb-nav="drawer-close"].bb-hq-drawer__close',
        "BB close"
      );
      await closeBtn.click();
      await page.waitForFunction(() => {
        const btn = document.querySelector('[data-bb-nav="mobile-toggle"]');
        return btn && btn.getAttribute("aria-expanded") === "false";
      });
      bbCases += 1;

      // Reopen and click Website
      await burger.click();
      await page.waitForFunction(() => {
        const btn = document.querySelector('[data-bb-nav="mobile-toggle"]');
        return btn && btn.getAttribute("aria-expanded") === "true";
      });
      const websiteLink = page
        .locator('#bb-hq-drawer a[data-bb-nav-key="website"], #bb-hq-drawer a[href="/hq/website"]')
        .first();
      await assertTouchUsable(
        page,
        '#bb-hq-drawer a[data-bb-nav-key="website"], #bb-hq-drawer a[href="/hq/website"]',
        "BB Website link"
      );
      await Promise.all([
        page.waitForURL(/\/hq\/website/, { timeout: 15_000 }),
        websiteLink.click(),
      ]);
      assert.match(page.url(), /\/hq\/website/);
      bbCases += 1;

      // Drawer closed/reset after navigation
      await page.waitForSelector('[data-bb-nav="mobile-toggle"]');
      assert.equal(
        await page.locator('[data-bb-nav="mobile-toggle"]').first().getAttribute("aria-expanded"),
        "false"
      );
      await assertNoOverflow(page, "BB website");
      bbCases += 1;

      // Reopen → another permitted module (Members)
      await page.locator('[data-bb-nav="mobile-toggle"]').first().click();
      await page.waitForFunction(() => {
        const btn = document.querySelector('[data-bb-nav="mobile-toggle"]');
        return btn && btn.getAttribute("aria-expanded") === "true";
      });
      // Escape also closes
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => {
        const btn = document.querySelector('[data-bb-nav="mobile-toggle"]');
        return btn && btn.getAttribute("aria-expanded") === "false";
      });
      await page.locator('[data-bb-nav="mobile-toggle"]').first().click();
      await page.waitForFunction(() => {
        const btn = document.querySelector('[data-bb-nav="mobile-toggle"]');
        return btn && btn.getAttribute("aria-expanded") === "true";
      });
      const membersLink = page
        .locator('#bb-hq-drawer a[data-bb-nav-key="members"], #bb-hq-drawer a[href="/hq/members"]')
        .first();
      await Promise.all([
        page.waitForURL(/\/hq\/members/, { timeout: 15_000 }),
        membersLink.click(),
      ]);
      assert.match(page.url(), /\/hq\/members/);
      await assertNoOverflow(page, "BB members");
      assert.equal(errors.length, 0, `BB js errors: ${errors.join("; ")}`);
      bbCases += 1;
    } finally {
      if (context) await context.close().catch(() => {});
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("reports case counts for FINALs", () => {
    if (skipReason) return;
    assert.ok(acCases >= 5, `AC_CASES=${acCases}`);
    assert.ok(bbCases >= 5, `BB_CASES=${bbCases}`);
    // eslint-disable-next-line no-console
    console.log(
      `ADMIN_CONSOLE_MOBILE_INTERACTION AC_CASES=${acCases} BB_CASES=${bbCases} PASS=${acCases + bbCases} FAIL=0`
    );
  });
});
