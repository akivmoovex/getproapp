"use strict";

/**
 * Prompt 47 — browser visual/smoke QA for V5 mobile burger navigation.
 * Uses Playwright Chromium against an ephemeral V5 foundation app.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { chromium } = require("playwright");

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
  submitMemberRegistration,
  approveMemberRegistration,
  linkMemberToUser,
} = require("../src/blessboard/services/memberRegistrationService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const APEX = "blessboard.org";
const TENANT = "nav-qa.blessboard.org";
const VIEWPORTS = [
  { name: "320", width: 320, height: 720 },
  { name: "375", width: 375, height: 812 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "899", width: 899, height: 900 },
  { name: "900", width: 900, height: 900 },
  { name: "1024", width: 1024, height: 900 },
  { name: "desktop", width: 1280, height: 800 },
];

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    TRUST_PROXY: "1",
    ...overrides,
  };
}

function isVisible(box) {
  return Boolean(box && box.width > 0 && box.height > 0);
}

describe("blessboard v5 mobile burger browser QA", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let server;
  let baseUrl;
  let browser;
  let org;
  let church;
  let hqBranch;
  let cookies = {};
  const matrix = [];

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
        organizationKey: "nav-qa",
        displayName: "Nav QA Org With A Very Long Organization Name That Should Truncate",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "nav-qa",
        hostname: TENANT,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provisioned.ok, true, provisioned.message);
      org = provisioned.records.organization;

      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "nav-qa",
        churchKey: "nav-qa",
        displayName: "Nav QA Church With An Extremely Long Display Name For Truncation",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ Campus",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;
      hqBranch = ch.records.hqBranch;

      await ensureChurchSettingsInitialized(pool, church.id);
      await updateChurchSettings(pool, church.id, {
        publicName: "Nav QA Church With An Extremely Long Display Name For Truncation",
        websiteStatus: "published",
      });

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName,
        });
        assert.equal(created.ok, true, created.message);
        const assigned = await assignBlessBoardRole(pool, role);
        assert.equal(assigned.ok, true, assigned.message);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: org.id,
          churchId: church.id,
          branchId: hqBranch.id,
        });
        assert.equal(session.ok, true, session.code);
        return { user: created.user, cookie: `${DEFAULT_V5_COOKIE}=${session.rawToken}` };
      }

      cookies.hq = (
        await makeUser("hq@nav-qa.test", "HQ Admin", {
          email: "hq@nav-qa.test",
          organizationKey: "nav-qa",
          roleKey: "church_hq_admin",
          churchKey: "nav-qa",
        })
      ).cookie;

      cookies.branch = (
        await makeUser("branch@nav-qa.test", "Branch Admin", {
          email: "branch@nav-qa.test",
          organizationKey: "nav-qa",
          roleKey: "branch_admin",
          churchKey: "nav-qa",
          branchKey: "hq",
        })
      ).cookie;

      cookies.platform = (
        await makeUser("platform@nav-qa.test", "Platform Admin", {
          email: "platform@nav-qa.test",
          organizationKey: "nav-qa",
          roleKey: "platform_admin",
        })
      ).cookie;

      const memberUser = await createBlessBoardUser(pool, {
        email: "member@nav-qa.test",
        password: PASSWORD,
        displayName: "Member User",
      });
      assert.equal(memberUser.ok, true, memberUser.message);
      const hqForApprove = await createBlessBoardUser(pool, {
        email: "hq-approve@nav-qa.test",
        password: PASSWORD,
        displayName: "HQ Approve",
      });
      assert.equal(hqForApprove.ok, true, hqForApprove.message);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "hq-approve@nav-qa.test",
            organizationKey: "nav-qa",
            roleKey: "church_hq_admin",
            churchKey: "nav-qa",
          })
        ).ok,
        true
      );
      const submitted = await submitMemberRegistration(pool, {
        churchId: church.id,
        branchId: hqBranch.id,
        firstName: "Member",
        lastName: "User",
        preferredName: "Member",
        email: "member@nav-qa.test",
        phone: "+15551234999",
      });
      assert.equal(submitted.ok, true, submitted.message || submitted.reason);
      const approved = await approveMemberRegistration(pool, {
        registrationId: submitted.registration.id,
        actorUserId: hqForApprove.user.id,
      });
      assert.equal(approved.ok, true, approved.message || approved.reason);
      const linked = await linkMemberToUser(pool, {
        memberId: approved.member.id,
        actorUserId: hqForApprove.user.id,
        userId: memberUser.user.id,
      });
      assert.equal(linked.ok, true, linked.message || linked.reason);
      const memberSession = await createV5Session(pool, {
        deploymentCode: "blessboard-org-v5",
        userId: memberUser.user.id,
        organizationId: org.id,
        churchId: church.id,
        branchId: hqBranch.id,
      });
      assert.equal(memberSession.ok, true, memberSession.code);
      cookies.member = `${DEFAULT_V5_COOKIE}=${memberSession.rawToken}`;

      app = createV5FoundationApp({ getPool: () => pool, env: baseEnv() });
      server = http.createServer(app);
      await new Promise((resolve, reject) => {
        server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
      });
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (browser) await browser.close();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL / Playwright unavailable: ${skipReason}`);
  }

  async function openPage(host, cookie) {
    const context = await browser.newContext({
      extraHTTPHeaders: {
        "X-Forwarded-Host": host,
        "X-Forwarded-Proto": "http",
      },
    });
    if (cookie) {
      await context.addCookies([
        {
          name: DEFAULT_V5_COOKIE,
          value: cookie.split("=").slice(1).join("="),
          domain: "127.0.0.1",
          path: "/",
        },
      ]);
    }
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    return { context, page, errors };
  }

  async function measureShell(page, shell) {
    const burger = page.locator(shell.burger);
    const desktop = page.locator(shell.desktop);
    const drawer = page.locator(shell.drawer);
    const brand = page.locator(shell.brand).first();

    const burgerCount = await burger.count();
    const burgerBox = burgerCount ? await burger.first().boundingBox() : null;
    const desktopBox = (await desktop.count()) ? await desktop.first().boundingBox() : null;
    const brandBox = (await brand.count()) ? await brand.boundingBox() : null;
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      };
    });
    const bottomTabs = await page.locator('[data-bb-nav="mobile-tabs"]').count();
    const ariaExpanded = burgerCount
      ? await burger.first().getAttribute("aria-expanded")
      : null;
    const ariaControls = burgerCount
      ? await burger.first().getAttribute("aria-controls")
      : null;
    const ariaLabel = burgerCount ? await burger.first().getAttribute("aria-label") : null;

    let overlaps = false;
    if (burgerBox && brandBox) {
      const xOverlap =
        burgerBox.x + 2 < brandBox.x + brandBox.width &&
        burgerBox.x + burgerBox.width - 2 > brandBox.x;
      const yOverlap =
        burgerBox.y + 2 < brandBox.y + brandBox.height &&
        burgerBox.y + burgerBox.height - 2 > brandBox.y;
      overlaps = xOverlap && yOverlap;
    }

    return {
      burgerCount,
      burgerVisible: isVisible(burgerBox),
      desktopVisible: isVisible(desktopBox),
      drawerHidden: (await drawer.count())
        ? await drawer.first().evaluate((el) => el.hasAttribute("hidden") || !el.classList.contains("is-open"))
        : true,
      overflowX: Math.max(overflow.scrollWidth, overflow.bodyScrollWidth) > overflow.clientWidth + 1,
      bottomTabs,
      ariaExpanded,
      ariaControls,
      ariaLabel,
      overlaps,
      burgerBox,
      brandBox,
    };
  }

  async function exerciseDrawer(page, shell) {
    const burger = page.locator(shell.burger).first();
    await burger.click();
    await page.waitForFunction(
      (sel) => {
        const btn = document.querySelector(sel);
        return btn && btn.getAttribute("aria-expanded") === "true";
      },
      shell.burger,
      { timeout: 5000 }
    );
    const openExpanded = await burger.getAttribute("aria-expanded");
    const drawer = page.locator(shell.drawer).first();
    const openHidden = await drawer.getAttribute("hidden");
    const panel = page.locator(shell.panel).first();
    await panel.waitFor({ state: "attached", timeout: 5000 });
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 40) return false;
        const leftSettled = Math.abs(r.x) < 6;
        const rightSettled = Math.abs(r.x + r.width - window.innerWidth) < 6;
        return leftSettled || rightSettled;
      },
      shell.panel,
      { timeout: 5000 }
    );
    const rect = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        vw: window.innerWidth,
        vh: window.innerHeight,
        display: cs.display,
        visibility: cs.visibility,
        transform: cs.transform,
      };
    });
    // Drawer may animate from off-canvas; require a positive in-viewport footprint.
    const visibleWidth = Math.max(
      0,
      Math.min(rect.x + rect.width, rect.vw) - Math.max(rect.x, 0)
    );
    const panelInside =
      rect.width > 0 &&
      rect.height > 0 &&
      visibleWidth >= Math.min(rect.width, rect.vw) * 0.85 &&
      rect.width <= rect.vw + 2;
    const panelScroll = await panel.evaluate((el) => ({
      overflowY: getComputedStyle(el).overflowY,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));

    await page.keyboard.press("Escape");
    await page.waitForFunction(
      (sel) => {
        const btn = document.querySelector(sel);
        return btn && btn.getAttribute("aria-expanded") === "false";
      },
      shell.burger,
      { timeout: 5000 }
    );
    const afterEsc = await burger.getAttribute("aria-expanded");
    const focused = await page.evaluate(
      (sel) => document.activeElement && document.activeElement.matches(sel),
      shell.burger
    );

    await burger.click();
    await page.waitForFunction(
      (sel) => {
        const btn = document.querySelector(sel);
        return btn && btn.getAttribute("aria-expanded") === "true";
      },
      shell.burger,
      { timeout: 5000 }
    );
    const link = drawer.locator("a[href]").first();
    if (await link.count()) {
      await link.evaluate((el) => el.click());
      await page.waitForTimeout(80);
    }
    const afterLink = await burger.getAttribute("aria-expanded").catch(() => "false");

    return {
      openExpanded,
      openHidden,
      panelInside,
      panelScrollable:
        panelScroll.overflowY === "auto" ||
        panelScroll.overflowY === "scroll" ||
        panelScroll.scrollHeight >= panelScroll.clientHeight,
      afterEsc,
      focusRestored: focused,
      afterLink,
      rect,
    };
  }

  async function exerciseBreakpoint(page, shell) {
    await page.setViewportSize({ width: 375, height: 812 });
    const burger = page.locator(shell.burger).first();
    await burger.click();
    await page.waitForTimeout(50);
    assert.equal(await burger.getAttribute("aria-expanded"), "true");
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.waitForTimeout(120);
    const afterDesktop = {
      expanded: await burger.getAttribute("aria-expanded"),
      burgerVisible: isVisible(await burger.boundingBox()),
      desktopVisible: isVisible(
        await page.locator(shell.desktop).first().boundingBox().catch(() => null)
      ),
    };
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(120);
    const afterReturn = {
      expanded: await burger.getAttribute("aria-expanded"),
      drawerHidden: await page
        .locator(shell.drawer)
        .first()
        .evaluate((el) => el.hasAttribute("hidden") || !el.classList.contains("is-open")),
    };
    return { afterDesktop, afterReturn };
  }

  const shells = {
    apex: {
      burger: "#bb-apex-menu-btn",
      drawer: "#bb-apex-drawer",
      panel: ".bb-apex-drawer__panel",
      desktop: '[data-bb-apex-nav="desktop"]',
      brand: ".bb-apex-brand__name",
    },
    tenant: {
      burger: "#bb-tp-menu-btn",
      drawer: "#bb-tp-drawer",
      panel: ".bb-tp-drawer",
      desktop: ".bb-tp-nav--desktop",
      brand: ".bb-tp-brand__name",
    },
    member: {
      burger: '[data-bb-nav="mobile-toggle"]',
      drawer: "#bb-mp-drawer",
      panel: ".bb-mp-drawer__panel",
      desktop: '[data-bb-nav="desktop-sidebar"]',
      brand: ".bb-mp-wordmark, .bb-mp-context",
    },
    branch: {
      burger: '[data-bb-nav="mobile-toggle"]',
      drawer: "#bb-ba-drawer",
      panel: ".bb-ba-drawer__panel",
      desktop: '[data-bb-nav="desktop-sidebar"]',
      brand: ".bb-ba-wordmark, .bb-ba-context",
    },
    hq: {
      burger: '[data-bb-nav="mobile-toggle"]',
      drawer: "#bb-hq-drawer",
      panel: ".bb-hq-drawer__panel",
      desktop: '[data-bb-nav="desktop-sidebar"]',
      brand: ".bb-hq-wordmark, .bb-hq-context",
    },
    platform: {
      burger: '[data-bb-nav="mobile-toggle"]',
      drawer: "#bb-pa-drawer",
      panel: ".bb-pa-drawer__panel",
      desktop: '[data-bb-nav="desktop-sidebar"]',
      brand: ".bb-pa-wordmark, .bb-pa-context",
    },
  };

  const routes = [
    { shell: "apex", host: APEX, path: "/", cookie: null },
    { shell: "apex", host: APEX, path: "/features", cookie: null },
    { shell: "apex", host: APEX, path: "/pricing", cookie: null },
    { shell: "apex", host: APEX, path: "/register-church", cookie: null },
    {
      shell: "apex-auth",
      host: APEX,
      path: "/login",
      cookie: null,
      noBurger: true,
      note: "apex-auth dual-pane login has no marketing burger by design",
    },
    { shell: "tenant", host: TENANT, path: "/", cookie: null },
    { shell: "tenant", host: TENANT, path: "/about", cookie: null },
    { shell: "tenant", host: TENANT, path: "/leadership", cookie: null },
    { shell: "tenant", host: TENANT, path: "/events", cookie: null },
    { shell: "tenant", host: TENANT, path: "/sermons", cookie: null },
    { shell: "member", host: TENANT, path: "/member", cookie: () => cookies.member },
    { shell: "branch", host: TENANT, path: "/branch-admin", cookie: () => cookies.branch },
    { shell: "hq", host: TENANT, path: "/hq", cookie: () => cookies.hq },
    { shell: "hq", host: TENANT, path: "/hq/settings", cookie: () => cookies.hq },
    { shell: "hq", host: TENANT, path: "/hq/branches/new", cookie: () => cookies.hq },
    { shell: "platform", host: APEX, path: "/admin", cookie: () => cookies.platform },
    {
      shell: "platform",
      host: APEX,
      path: "/admin/organizations",
      cookie: () => cookies.platform,
    },
    {
      shell: "platform",
      host: APEX,
      path: "/admin/registration-applications",
      cookie: () => cookies.platform,
    },
    {
      shell: "platform",
      host: APEX,
      path: "/admin/subscriptions",
      cookie: () => cookies.platform,
    },
    {
      shell: "platform",
      host: APEX,
      path: "/admin/maintenance",
      cookie: () => cookies.platform,
    },
  ];

  it("passes viewport matrix, drawer interactions, and breakpoint handoff", async () => {
    requireDb();
    const sampleForDeep = new Set([
      "/",
      "/features",
      "/member",
      "/branch-admin",
      "/hq",
      "/hq/branches/new",
      "/admin",
    ]);
    const deepDone = new Set();

    for (const route of routes) {
      const cookie = typeof route.cookie === "function" ? route.cookie() : route.cookie;
      const row = {
        route: `${route.host}${route.path}`,
        shell: route.shell,
        note: route.note || null,
        viewports: {},
      };

      for (const vp of VIEWPORTS) {
        const { context, page, errors } = await openPage(route.host, cookie);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const res = await page.goto(`${baseUrl}${route.path}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        assert.ok(res && res.ok(), `${route.path} status ${res && res.status()}`);
        await page.waitForTimeout(80);

        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          return Math.max(doc.scrollWidth, document.body.scrollWidth) > doc.clientWidth + 1;
        });
        const bottomTabs = await page.locator('[data-bb-nav="mobile-tabs"]').count();
        assert.equal(overflow, false, `${route.path}@${vp.name}: no horizontal overflow`);
        assert.equal(bottomTabs, 0, `${route.path}@${vp.name}: no bottom tabs`);
        assert.equal(errors.length, 0, `${route.path}@${vp.name}: js errors ${errors.join("; ")}`);

        if (route.noBurger) {
          const burgerCount = await page.locator(".bb-shell-burger, [data-bb-nav='mobile-toggle']").count();
          assert.equal(burgerCount, 0, `${route.path}: auth shell has no burger`);
          row.viewports[vp.name] = { burger: false, overflowX: overflow, status: "ok-auth" };
          await context.close();
          continue;
        }

        const shell = shells[route.shell];
        const m = await measureShell(page, shell);
        const mobile = vp.width < 900;
        assert.equal(m.burgerCount, 1, `${route.path}@${vp.name}: one burger`);
        assert.equal(m.burgerVisible, mobile, `${route.path}@${vp.name}: burger visibility`);
        if (mobile) {
          assert.equal(m.desktopVisible, false, `${route.path}@${vp.name}: desktop hidden`);
        } else {
          assert.equal(m.desktopVisible, true, `${route.path}@${vp.name}: desktop shown`);
          assert.equal(m.burgerVisible, false, `${route.path}@${vp.name}: burger hidden desktop`);
        }
        assert.equal(m.overlaps, false, `${route.path}@${vp.name}: brand/burger overlap`);
        if (mobile) {
          assert.equal(m.ariaLabel, "Open navigation");
          assert.ok(m.ariaControls);
          assert.equal(m.ariaExpanded, "false");
        }

        row.viewports[vp.name] = {
          burger: m.burgerVisible,
          desktop: m.desktopVisible,
          overflowX: m.overflowX,
          status: "ok",
        };
        await context.close();
      }

      const deepKey = `${route.shell}:${route.path}`;
      if (!route.noBurger && sampleForDeep.has(route.path) && !deepDone.has(deepKey)) {
        deepDone.add(deepKey);
        const cookieDeep = typeof route.cookie === "function" ? route.cookie() : route.cookie;
        const shell = shells[route.shell];
        const { context, page } = await openPage(route.host, cookieDeep);
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded" });
        const drawer = await exerciseDrawer(page, shell);
        assert.equal(drawer.openExpanded, "true", `${route.path}: open aria-expanded`);
        assert.ok(
          drawer.panelInside,
          `${route.path}: drawer inside viewport ${JSON.stringify(drawer.rect)}`
        );
        assert.ok(drawer.panelScrollable, `${route.path}: drawer scrollable`);
        assert.equal(drawer.afterEsc, "false", `${route.path}: Escape closes`);
        assert.ok(drawer.focusRestored, `${route.path}: focus restored`);
        const bp = await exerciseBreakpoint(page, shell);
        assert.equal(bp.afterDesktop.expanded, "false", `${route.path}: desktop MQ closes`);
        assert.equal(bp.afterDesktop.burgerVisible, false, `${route.path}: burger hidden at 1024`);
        assert.equal(bp.afterDesktop.desktopVisible, true, `${route.path}: desktop at 1024`);
        assert.equal(bp.afterReturn.expanded, "false", `${route.path}: no reopen on mobile return`);
        assert.equal(bp.afterReturn.drawerHidden, true, `${route.path}: drawer stays closed`);
        row.deep = { drawer: "ok", breakpoint: "ok" };
        await context.close();
      }

      matrix.push(row);
    }

    assert.ok(matrix.length >= 20, "full route matrix covered");
    console.log(
      "[burger-browser-qa]",
      JSON.stringify(
        matrix.map((r) => ({
          route: r.route,
          shell: r.shell,
          note: r.note,
          deep: r.deep || null,
          viewports: Object.keys(r.viewports),
        }))
      )
    );
  });
});
