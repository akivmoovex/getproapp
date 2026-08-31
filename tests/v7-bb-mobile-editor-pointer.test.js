"use strict";

/**
 * BlessBoard mobile website editor — pointer geometry + spot editability regression.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  provisionEmptyPublicPages,
  createPageSection,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");

const ROOT = path.join(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST = "bb-mobile-editor.blessboard.org";

const SPOT_KEYS = [
  { key: "home.hero.heading", path: "/?website_edit=1&website_mode=draft" },
  { key: "home.hero.bodyText", path: "/?website_edit=1&website_mode=draft" },
  { key: "about.hero.heading", path: "/about?website_edit=1&website_mode=draft" },
  { key: "contact.hero.heading", path: "/contact?website_edit=1&website_mode=draft" },
  { key: "giving.hero.heading", path: "/giving?website_edit=1&website_mode=draft" },
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    TRUST_PROXY: "1",
    ...overrides,
  };
}

describe("V7 BlessBoard mobile editor pointer regression", () => {
  it("shell nests tenant header inside chrome stack while editing", () => {
    const shell = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    assert.match(shell, /_editingMode/);
    assert.match(shell, /if \(!_editingMode\) \{[\s\S]*<\/div>/);
    assert.match(shell, /if \(_stackChrome && _editingMode\) \{[\s\S]*<\/div>/);
    assert.match(shell, /website-inline-edit\.css\?v=v7-website-36/);
  });

  it("shared editor CSS bounds burger hit area and stacks hero pencils below header", () => {
    const css = read("public/platform/website-inline-edit.css");
    assert.match(css, /--gp-we-bb-chrome-h/);
    assert.match(css, /\.gp-website-chrome-stack \.bb-tp-header[\s\S]*pointer-events:\s*none/);
    assert.match(css, /\.bb-tp-header__actions[\s\S]*pointer-events:\s*none/);
    assert.doesNotMatch(
      css,
      /bb-tp-body--editing[\s\S]{0,1200}\[data-bb-header-actions\][\s\S]{0,80}pointer-events:\s*auto/
    );
    assert.match(css, /\[data-website-key\*="\.hero\."\][\s\S]*position:\s*static/);
    assert.match(css, /--gp-we-z-tenant-header-editor/);
    assert.match(css, /--gp-we-z-editable-pencil/);
  });

  it("ActiveClinic editor keeps shared chrome stack min-height", () => {
    const css = read("public/platform/website-inline-edit.css");
    assert.match(
      css,
      /body\.gp-website-editor-open \.gp-website-chrome-stack[\s\S]{0,120}min-height:\s*var\(--gp-we-toolbar-h\)/
    );
    const acShell = read("views/activeclinic/layouts/public-shell.ejs");
    assert.doesNotMatch(acShell, /bb-tp-header/);
  });
});

describe("V7 BlessBoard mobile editor pointer browser QA", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let server;
  let baseUrl;
  let browser;
  let cookie;

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

      const org = await provisionPlatformTenant(pool, {
        organizationKey: "bb-mobile-editor",
        displayName: "BB Mobile Editor QA",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "bb-mobile-editor",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(org.ok, true, org.message);

      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "bb-mobile-editor",
        churchKey: "bb-mobile-editor",
        displayName: "BB Mobile Editor Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(ch.ok, true, ch.message);
      const church = ch.records.church;
      await repairWebsiteFoundation(pool, { churchId: church.id });
      await ensureChurchSettingsInitialized(pool, church.id);
      await updateChurchSettings(pool, church.id, {
        websiteStatus: "published",
        publicName: "BB Mobile Editor Church",
      });
      await provisionEmptyPublicPages(pool, { churchId: church.id, branchId: null });

      for (const pageKey of ["home", "about", "contact", "giving"]) {
        const page = await pool.query(
          `SELECT id FROM blessboard.public_pages
            WHERE church_id = $1 AND page_key = $2 AND branch_id IS NULL LIMIT 1`,
          [church.id, pageKey]
        );
        assert.ok(page.rows[0], `${pageKey} page`);
        await updatePublicPage(pool, page.rows[0].id, { status: "published" });
        await createPageSection(pool, {
          pageId: page.rows[0].id,
          sectionKey: "hero",
          sectionType: "hero",
          heading: `${pageKey} hero`,
          bodyText: `${pageKey} body`,
          status: "published",
          sortOrder: 0,
        });
      }

      const created = await createBlessBoardUser(pool, {
        email: "bb-mobile-editor@example.test",
        displayName: "BB Mobile Editor",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "bb-mobile-editor@example.test",
            organizationKey: "bb-mobile-editor",
            roleKey: "church_hq_admin",
            churchKey: "bb-mobile-editor",
          })
        ).ok,
        true
      );
      const session = await createV5Session(pool, {
        deploymentCode: "blessboard-org-staging",
        userId: created.user.id,
        organizationId: org.records.organization.id,
      });
      assert.equal(session.ok, true, session.message || session.code);
      cookie = session.rawToken;

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
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL / Playwright unavailable: ${skipReason}`);
  }

  async function openEditorPage(page, pagePath) {
    await page.goto(`${baseUrl}${pagePath}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });
  }

  it("hero heading pencil sits below header chrome and opens the field editor", async () => {
    requireDb();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      extraHTTPHeaders: {
        "X-Forwarded-Host": HOST,
        "X-Forwarded-Proto": "http",
      },
    });
    await context.addCookies([
      {
        name: DEFAULT_V5_COOKIE,
        value: cookie,
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    const page = await context.newPage();
    await openEditorPage(page, "/?website_edit=1&website_mode=draft");

    const geometry = await page.evaluate(() => {
      const header = document.querySelector(".bb-tp-header");
      const burger = document.querySelector(".bb-tp-menu-btn");
      const field = document.querySelector('[data-website-key="home.hero.heading"]');
      const pencil = field && field.querySelector(".gp-website-editable__pencil");
      const display = field && field.querySelector("[data-website-display]");
      function box(el) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
      }
      const pencilBox = box(pencil);
      const headerBox = box(header);
      const burgerBox = box(burger);
      let hit = null;
      if (pencilBox) {
        const x = pencilBox.left + pencilBox.width / 2;
        const y = pencilBox.top + pencilBox.height / 2;
        const el = document.elementFromPoint(x, y);
        hit = el
          ? {
              tag: el.tagName,
              className: String(el.className || ""),
              websiteKey: el.closest("[data-website-key]")?.getAttribute("data-website-key") || null,
            }
          : null;
      }
      const burgerStyle = burger ? getComputedStyle(burger) : null;
      return {
        header: headerBox,
        burger: burgerBox,
        editable: box(display),
        pencil: pencilBox,
        hit,
        burgerPointerEvents: burgerStyle ? burgerStyle.pointerEvents : null,
        headerInsideStack: Boolean(header && header.closest(".gp-website-chrome-stack")),
      };
    });

    assert.equal(geometry.headerInsideStack, true, "tenant header should live in chrome stack while editing");
    assert.ok(geometry.pencil && geometry.header, "missing pencil/header geometry");
    assert.ok(
      geometry.pencil.top >= geometry.header.bottom - 1,
      `pencil should start below header: ${JSON.stringify(geometry)}`
    );
    assert.ok(
      geometry.burger &&
        geometry.burger.width >= 44 &&
        geometry.burger.height >= 44,
      "burger touch target should remain accessible"
    );
    assert.ok(
      geometry.hit &&
        (geometry.hit.websiteKey === "home.hero.heading" ||
          geometry.hit.className.includes("gp-website-editable__pencil")),
      `elementFromPoint should hit pencil, got ${JSON.stringify(geometry.hit)}`
    );

    await page.locator('[data-website-key="home.hero.heading"] .gp-website-editable__pencil').click();
    const panel = page.locator("[data-website-field-editor-panel]:not([hidden])");
    await panel.waitFor({ state: "visible", timeout: 10000 });
    await panel.locator("[data-website-field-editor-cancel]").click();
    await context.close();
  });

  it("five representative mobile fields open via pencil click", async () => {
    requireDb();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      extraHTTPHeaders: {
        "X-Forwarded-Host": HOST,
        "X-Forwarded-Proto": "http",
      },
    });
    await context.addCookies([
      {
        name: DEFAULT_V5_COOKIE,
        value: cookie,
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    const page = await context.newPage();
    let pass = 0;
    for (const item of SPOT_KEYS) {
      await openEditorPage(page, item.path);
      const pencil = page.locator(`[data-website-key="${item.key}"] .gp-website-editable__pencil`).first();
      await pencil.waitFor({ state: "visible", timeout: 15000 });
      await pencil.click({ timeout: 10000 });
      const panel = page.locator("[data-website-field-editor-panel]:not([hidden])");
      await panel.waitFor({ state: "visible", timeout: 10000 });
      await panel.locator("[data-website-field-editor-cancel]").click();
      await panel.waitFor({ state: "hidden", timeout: 10000 });
      pass += 1;
    }
    assert.equal(pass, 5, "BB_MOBILE_SPOT_EDITABILITY should be 5/5");
    await context.close();
  });

  it("burger navigation still opens and closes without leaving overlays", async () => {
    requireDb();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      extraHTTPHeaders: {
        "X-Forwarded-Host": HOST,
        "X-Forwarded-Proto": "http",
      },
    });
    await context.addCookies([
      {
        name: DEFAULT_V5_COOKIE,
        value: cookie,
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    const page = await context.newPage();
    await openEditorPage(page, "/?website_edit=1&website_mode=draft");
    const burger = page.locator("#bb-tp-menu-btn");
    await burger.click();
    assert.equal(await burger.getAttribute("aria-expanded"), "true");
    await page.locator("#bb-tp-drawer-close").click();
    assert.equal(await burger.getAttribute("aria-expanded"), "false");
    await page.waitForFunction(() => {
      const overlay = document.getElementById("bb-tp-drawer-overlay");
      return overlay && overlay.hasAttribute("hidden");
    });
    await context.close();
  });
});
