"use strict";

/**
 * V2.06 — Mobile edit → save → publish retest (~390px).
 *
 * Reproduces prior QA: editing in mobile view then publishing without
 * switching viewport could fail with a refresh-page message.
 *
 * PASS repeatedly → no product code changes.
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
const HOST = "bb-mobile-publish.blessboard.org";
const MARKER = `V206 Mobile Publish ${Date.now().toString(36)}`;

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

describe("V2.06 mobile edit/publish shared contract", () => {
  it("BB + AC share lifecycle refresh-page failure copy and 390 iframe viewport", () => {
    const lifecycle = read("public/platform/website-lifecycle.js");
    const editor = read("public/platform/website-inline-edit.js");
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    const acShell = read("views/activeclinic/layouts/public-shell.ejs");
    const bbEnd = read("views/blessboard/v5/partials/tenant-public-shell-end.ejs");
    const csrf = read("src/platform/http/v5Csrf.js");
    const bbChrome = read("src/blessboard/http/attachWebsiteAdminChrome.js");
    const acPublic = read("src/activeclinic/http/activeClinicPublicRoutes.js");
    assert.match(lifecycle, /Reload the page, then try publishing again/);
    assert.match(lifecycle, /code === "csrf"/);
    assert.match(editor, /VIEWPORT_WIDTHS[\s\S]*mobile:\s*390/);
    assert.match(editor, /website_frame=1/);
    assert.match(chrome, /data-website-viewport="mobile"/);
    assert.match(chrome, /data-website-viewport-width="390"/);
    assert.match(chrome, /data-website-publish-confirm="1"/);
    assert.match(acShell, /website-editor-mobile\.js|website-inline-edit\.js/);
    assert.match(bbEnd, /website-editor-mobile\.js|website-lifecycle\.js/);
    assert.match(csrf, /function issueOrReuseCsrfToken/);
    assert.match(bbChrome, /issueOrReuseCsrfToken/);
    assert.match(bbChrome, /reuseExisting:\s*Boolean\(frameMode\)/);
    assert.match(acPublic, /issueOrReuseCsrfToken/);
    assert.match(acPublic, /isWebsiteFrameRequest/);
  });
});

describe("V2.06 BlessBoard mobile edit → publish browser retest", () => {
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
        organizationKey: "bb-mobile-publish",
        displayName: "BB Mobile Publish QA",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "bb-mobile-publish",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(org.ok, true, org.message);

      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "bb-mobile-publish",
        churchKey: "bb-mobile-publish",
        displayName: "BB Mobile Publish Church",
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
        publicName: "BB Mobile Publish Church",
      });
      await provisionEmptyPublicPages(pool, { churchId: church.id, branchId: null });

      const page = await pool.query(
        `SELECT id FROM blessboard.public_pages
          WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
        [church.id]
      );
      assert.ok(page.rows[0], "home page");
      await updatePublicPage(pool, page.rows[0].id, { status: "published" });
      await createPageSection(pool, {
        pageId: page.rows[0].id,
        sectionKey: "hero",
        sectionType: "hero",
        heading: "Baseline Hero",
        bodyText: "Baseline body",
        mediaUrl: "https://cdn.example.test/v206-hero.jpg",
        status: "published",
        sortOrder: 0,
      });

      const created = await createBlessBoardUser(pool, {
        email: "bb-mobile-publish@example.test",
        displayName: "BB Mobile Publish",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "bb-mobile-publish@example.test",
            organizationKey: "bb-mobile-publish",
            roleKey: "church_hq_admin",
            churchKey: "bb-mobile-publish",
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

  async function newEditorContext(opts = {}) {
    const width = opts.width || 390;
    const height = opts.height || 844;
    const isMobile = opts.isMobile !== undefined ? opts.isMobile : width <= 480;
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile,
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
    return context;
  }

  async function editHeroHeading(pageOrFrame, value) {
    const pencil = pageOrFrame.locator(
      '[data-website-key="home.hero.heading"] .gp-website-editable__pencil'
    );
    await pencil.first().waitFor({ state: "visible", timeout: 20000 });
    await pencil.first().click({ timeout: 10000 });
    const panel = pageOrFrame.locator("[data-website-field-editor-panel]:not([hidden])");
    await panel.waitFor({ state: "visible", timeout: 10000 });
    const input = panel.locator(
      "textarea, input[type='text'], [data-website-field-editor-input], [data-website-input]"
    ).first();
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.fill(value);
    const save = panel.locator(
      "[data-website-field-editor-save], [data-website-save], [data-website-dialog-save]"
    ).first();
    await save.click({ timeout: 10000 });
    await panel.waitFor({ state: "hidden", timeout: 20000 }).catch(() => {});
  }

  async function replaceHeroImage(pageOrFrame) {
    const imageField = pageOrFrame.locator(
      '[data-website-key="home.hero.image"], [data-website-key="home.hero.mediaUrl"]'
    ).first();
    const pencil = imageField.locator(".gp-website-editable__pencil, [data-website-start]");
    if ((await pencil.count()) === 0) {
      return { attempted: false, reason: "no_image_pencil" };
    }
    // Hero overlay display spans can intercept the pencil; force is intentional for QA.
    await pencil.first().click({ timeout: 10000, force: true });
    const panel = pageOrFrame.locator("[data-website-field-editor-panel]:not([hidden])");
    await panel.waitFor({ state: "visible", timeout: 10000 });
    // Prefer Content Library / demo image buttons when present.
    const libraryBtn = panel.locator(
      "[data-website-library], [data-bb-se-library], button:has-text('Library'), button:has-text('Content Library')"
    ).first();
    const demoBtn = panel.locator(
      "[data-website-demo-image], [data-bb-se-demo], .bb-tp-se-demos button, [data-website-pick]"
    ).first();
    if ((await libraryBtn.count()) > 0) {
      await libraryBtn.click({ timeout: 5000, force: true }).catch(() => null);
    } else if ((await demoBtn.count()) > 0) {
      await demoBtn.click({ timeout: 5000, force: true }).catch(() => null);
    } else {
      // Keep existing URL but touch the field so save exercises the drafts path.
      const urlInput = panel.locator("input[type='url'], input[type='text'], textarea").first();
      if ((await urlInput.count()) > 0) {
        const current = await urlInput.inputValue().catch(() => "");
        await urlInput.fill(current || "https://cdn.example.test/v206-hero-replaced.jpg");
      }
    }
    const save = panel.locator(
      "[data-website-field-editor-save], [data-website-save], [data-website-dialog-save]"
    ).first();
    if ((await save.count()) > 0) {
      await save.click({ timeout: 10000 }).catch(() => null);
    }
    await panel.waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
    return { attempted: true };
  }

  async function publishFromChrome(page) {
    const publishResponses = [];
    page.on("response", async (res) => {
      try {
        const req = res.request();
        if (req.method() !== "POST") return;
        const url = res.url();
        if (!/publish|website/i.test(url)) return;
        let bodyText = "";
        try {
          bodyText = await res.text();
        } catch (_e) {
          bodyText = "";
        }
        publishResponses.push({
          url,
          status: res.status(),
          bodyText: String(bodyText || "").slice(0, 1200),
        });
      } catch (_e2) {
        /* ignore listener errors */
      }
    });

    const publishBtn = page.locator(
      '[data-website-engine-publish="1"], [data-website-publish-label="1"], form[data-website-publish-confirm="1"] button[type="submit"]'
    ).first();
    await publishBtn.waitFor({ state: "visible", timeout: 20000 });
    await publishBtn.click({ timeout: 10000 });

    // Lifecycle confirm dialog
    const confirm = page.locator('[data-website-lifecycle-confirm="publish"]');
    if (await confirm.count()) {
      await confirm.first().waitFor({ state: "visible", timeout: 10000 }).catch(() => null);
      if (await confirm.first().isVisible().catch(() => false)) {
        await confirm.first().click({ timeout: 10000 });
      }
    }

    // Wait for either failure copy, success reload, or network publish response.
    await page.waitForTimeout(2500);
    const failureText = await page.evaluate(() => {
      const status = document.querySelector(
        '[data-website-lifecycle-status="publish"]'
      );
      return status ? String(status.textContent || "").trim() : "";
    });
    const pageText = await page.locator("body").innerText().catch(() => "");
    return { publishResponses, failureText, pageText };
  }

  async function runFlowOnce(label, useIframeMobileViewport) {
    // Device 390px: same-document mobile edit (toolbar viewport toggles are hidden).
    // Iframe 390: open chrome wide enough to select Mobile preview, then stay there.
    const context = await newEditorContext(
      useIframeMobileViewport
        ? { width: 1280, height: 800, isMobile: false }
        : { width: 390, height: 844, isMobile: true }
    );
    const page = await context.newPage();
    const errors = [];
    const draftResponses = [];
    page.on("pageerror", (err) => errors.push(String(err && err.message ? err.message : err)));
    page.on("response", async (res) => {
      try {
        const req = res.request();
        if (req.method() !== "POST") return;
        if (!/\/website\/drafts(?:\?|$)/.test(res.url())) return;
        let bodyText = "";
        try {
          bodyText = await res.text();
        } catch (_e) {
          bodyText = "";
        }
        draftResponses.push({
          url: res.url(),
          status: res.status(),
          bodyText: String(bodyText || "").slice(0, 800),
        });
      } catch (_e2) {
        /* ignore */
      }
    });

    await page.goto(`${baseUrl}/?website_edit=1&website_mode=draft`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });

    let target = page;
    if (useIframeMobileViewport) {
      const mobileBtn = page.locator('[data-website-viewport="mobile"]');
      await mobileBtn.waitFor({ state: "visible", timeout: 15000 });
      await mobileBtn.click();
      await page.waitForSelector(
        'body.gp-website-viewport-frame-active, [data-website-viewport-frame][src*="website_frame=1"]',
        { timeout: 20000 }
      );
      const frameEl = page.frameLocator('[data-website-viewport-frame="1"]');
      await frameEl.locator('[data-website-key="home.hero.heading"]').waitFor({
        state: "visible",
        timeout: 30000,
      });
      target = frameEl;
    }

    const heading = `${MARKER} ${label}`;
    await editHeroHeading(target, heading);
    const imageResult = await replaceHeroImage(target);

    // Stay on mobile viewport (do not click Desktop) before publish.
    if (useIframeMobileViewport) {
      const stillMobile = await page.evaluate(() =>
        document.body.classList.contains("gp-website-viewport-mobile")
      );
      assert.equal(stillMobile, true, "must remain on mobile viewport before publish");
    }

    const publish = await publishFromChrome(page);
    const refreshMsg =
      /Reload the page|refresh the page|session expired/i.test(publish.failureText) ||
      /Reload the page|refresh the page|session expired/i.test(publish.pageText);

    // Public verification (no edit query).
    const publicPage = await context.newPage();
    await publicPage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    const publicHtml = await publicPage.content();
    const publicHasMarker = publicHtml.includes(heading);

    await context.close();
    return {
      label,
      useIframeMobileViewport,
      heading,
      imageResult,
      publish,
      draftResponses,
      refreshMsg,
      publicHasMarker,
      errors,
    };
  }

  function assertFlowPass(result, tag) {
    const draftFail = result.draftResponses.find((r) => r.status >= 400);
    assert.equal(
      Boolean(draftFail),
      false,
      `${tag} drafts failed: ${JSON.stringify(result.draftResponses)}`
    );
    assert.equal(
      result.refreshMsg,
      false,
      `${tag} refresh failure: ${result.publish.failureText || result.publish.pageText}`
    );
    assert.equal(
      result.publicHasMarker,
      true,
      `${tag} public missing published text; publish=${JSON.stringify(result.publish.publishResponses)}`
    );
    assert.equal(result.errors.length, 0, result.errors.join(" | "));
  }

  it("1–2: device 390px edit text/image → save → publish → public (repeat)", async () => {
    requireDb();
    const a = await runFlowOnce("device-a", false);
    const b = await runFlowOnce("device-b", false);
    assertFlowPass(a, "device A");
    assertFlowPass(b, "device B");
  });

  it("3–4: editor Mobile 390 iframe edit → publish without switching viewport (repeat)", async () => {
    requireDb();
    const a = await runFlowOnce("iframe-a", true);
    const b = await runFlowOnce("iframe-b", true);
    assertFlowPass(a, "iframe A");
    assertFlowPass(b, "iframe B");
  });
});

describe("V2.06 ActiveClinic same infrastructure smoke", () => {
  it("AC public shell loads shared mobile editor + lifecycle publish confirm assets", () => {
    const acShell = read("views/activeclinic/layouts/public-shell.ejs");
    const acChrome = read("views/activeclinic/partials/website-editor-chrome.ejs");
    const sharedChrome = read("views/platform/website-engine/editor-chrome.ejs");
    assert.match(acShell, /website-inline-edit\.js/);
    assert.match(acShell, /website-editor-mobile\.js/);
    assert.match(sharedChrome, /data-website-publish-confirm="1"/);
    assert.match(sharedChrome, /data-website-viewport="mobile"/);
    assert.match(acChrome, /data-website-edit-control|websitePreviewUrl|gp-website/);
  });
});
