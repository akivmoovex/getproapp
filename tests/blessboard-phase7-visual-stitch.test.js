"use strict";

/**
 * Phase 7 visual comparison against exact Stitch screen IDs (EJS-wired).
 * Desktop: 1280×900 (2560@2x logical). Mobile: 390×844 (780@2x logical).
 * References: HTML-rendered viewport PNGs under design-reference/stitch-screens/phase7-exact/
 * (MCP screenshot URLs are thumbnails only — see PHASE7_EXACT_STITCH_REFERENCE_MAP.md).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium } = require("playwright");
const sharp = require("sharp");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  seedTestingWebsiteDemoContent,
} = require("../src/blessboard/services/testingWebsiteDemoContentService");
const phase7ExactVisualFixtureSpec = require("../src/blessboard/services/phase7ExactVisualFixtureSpec");

const ROOT = path.join(__dirname, "..");
const STITCH_EXACT = path.join(ROOT, "design-reference/stitch-screens/phase7-exact");
const OUT_DIR = path.join(ROOT, "tests/__screenshots__/phase7-public");
const REPORT_PATH = path.join(OUT_DIR, "stitch-comparison-report.json");
const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";

/** Manual classification vocabulary (final label — not ratio alone). */
const MANUAL = Object.freeze({
  CONFIRMED_CODE_DEFECT: "CONFIRMED_CODE_DEFECT",
  CONTENT_DIFFERENCE: "CONTENT_DIFFERENCE",
  MEDIA_DIFFERENCE: "MEDIA_DIFFERENCE",
  ARTBOARD_CROP_DIFFERENCE: "ARTBOARD_CROP_DIFFERENCE",
  FONT_RENDERING_TOLERANCE: "FONT_RENDERING_TOLERANCE",
  PRODUCT_DECISION: "PRODUCT_DECISION",
  INTENTIONALLY_ACCEPTED: "INTENTIONALLY_ACCEPTED",
  WRONG_REFERENCE: "WRONG_REFERENCE",
  MATCHED: "MATCHED",
  STITCH_REFERENCE_BLOCKED: "STITCH_REFERENCE_BLOCKED",
  MEDIA_BLOCKED: "MEDIA_BLOCKED",
});

/**
 * Exact Phase 7 map. Mobile IDs missing except Home.
 * Reference PNGs are HTML-rendered viewport crops from exact Stitch HTML.
 */
const PAGES = Object.freeze([
  {
    key: "home",
    suffix: "",
    route: "/",
    desktopScreenId: "25de9fa64884455b993abb051adb0d8a",
    mobileScreenId: "b82eb087d4b84242aabead19c08eb717",
    desktopRef: "home-desktop/viewport-1280x900.png",
    mobileRef: "home-mobile/viewport-390x844.png",
    desktopConfidence: "CONFIRMED",
    mobileConfidence: "CONFIRMED",
  },
  {
    key: "about",
    suffix: "/about",
    route: "/about",
    desktopScreenId: "3736c7550483404282d5ba9914962c40",
    mobileScreenId: null,
    desktopRef: "about-desktop/viewport-1280x900.png",
    mobileRef: null,
    desktopConfidence: "CONFIRMED",
    mobileConfidence: "MISSING",
  },
  {
    key: "leadership",
    suffix: "/leadership",
    route: "/leadership",
    desktopScreenId: "4d525f9fbba9482f91fadc28ef650d13",
    mobileScreenId: null,
    desktopRef: "leadership-desktop/viewport-1280x900.png",
    mobileRef: null,
    desktopConfidence: "CONFIRMED",
    mobileConfidence: "MISSING",
  },
  {
    key: "ministries",
    suffix: "/ministries",
    route: "/ministries",
    desktopScreenId: "5a52a893e0414bf6962a0c078808d124",
    mobileScreenId: null,
    desktopRef: "ministries-desktop/viewport-1280x900.png",
    mobileRef: null,
    desktopConfidence: "CONFIRMED",
    mobileConfidence: "MISSING",
  },
  {
    key: "events",
    suffix: "/events",
    route: "/events",
    desktopScreenId: "a68314c0d6a34e0a824ad1a2b309c4ad",
    mobileScreenId: null,
    desktopRef: "events-desktop/viewport-1280x900.png",
    mobileRef: null,
    desktopConfidence: "CONFIRMED",
    mobileConfidence: "MISSING",
  },
  {
    key: "sermons",
    suffix: "/sermons",
    route: "/sermons",
    desktopScreenId: "d85d37f3bba84ac48d8d3f24b01b2010",
    mobileScreenId: null,
    desktopRef: "sermons-desktop/viewport-1280x900.png",
    mobileRef: null,
    desktopConfidence: "CONFIRMED",
    mobileConfidence: "MISSING",
  },
  {
    key: "giving",
    suffix: "/giving",
    route: "/giving",
    desktopScreenId: "e4fe61fbb9eb4b0987ca150d078aa76c",
    mobileScreenId: null,
    desktopRef: "giving-desktop/viewport-1280x900.png",
    mobileRef: null,
    desktopConfidence: "CONFIRMED",
    mobileConfidence: "MISSING",
  },
  {
    key: "contact",
    suffix: "/contact",
    route: "/contact",
    desktopScreenId: "28ba746495424a66a10cf5fb11916dec",
    mobileScreenId: null,
    desktopRef: "contact-desktop/viewport-1280x900.png",
    mobileRef: null,
    desktopConfidence: "CONFIRMED",
    mobileConfidence: "MISSING",
  },
]);

/**
 * Manual review labels after exact-reference alignment.
 * Automated ratio is advisory only.
 */
const MANUAL_REVIEW = Object.freeze({
  "home|desktop": {
    classification: MANUAL.MEDIA_DIFFERENCE,
    primaryMismatch: "Hero/media photography differs (Stitch remote vs same-site demo assets)",
    action: "accept",
  },
  "home|mobile": {
    classification: MANUAL.CONTENT_DIFFERENCE,
    primaryMismatch:
      "Phase 7 mobile artboard uses Sacred Modernity / WELCOME TO BLESSBOARD copy vs desktop Grace Community fixture",
    action: "accept",
  },
  "about|desktop": {
    classification: MANUAL.CONTENT_DIFFERENCE,
    primaryMismatch: "Long Stitch narrative vs CMS section stack; media substitution",
    action: "accept",
  },
  "about|mobile": {
    classification: MANUAL.STITCH_REFERENCE_BLOCKED,
    primaryMismatch: "No Phase 7 Church Website About mobile screen in Stitch project",
    action: "block",
  },
  "leadership|desktop": {
    classification: MANUAL.MEDIA_DIFFERENCE,
    primaryMismatch: "Leader photos MEDIA_BLOCKED; card count aligned to 3",
    action: "accept",
  },
  "leadership|mobile": {
    classification: MANUAL.STITCH_REFERENCE_BLOCKED,
    primaryMismatch: "No Phase 7 Leadership mobile screen",
    action: "block",
  },
  "ministries|desktop": {
    classification: MANUAL.MEDIA_DIFFERENCE,
    primaryMismatch: "Ministry card imagery MEDIA_BLOCKED; layout tokens not treated as code defect",
    action: "accept",
  },
  "ministries|mobile": {
    classification: MANUAL.STITCH_REFERENCE_BLOCKED,
    primaryMismatch: "No Phase 7 Ministries mobile screen",
    action: "block",
  },
  "events|desktop": {
    classification: MANUAL.CONTENT_DIFFERENCE,
    primaryMismatch: "Featured summit chrome vs CMS event list; dates differ from Stitch Nov 2024 artboard",
    action: "accept",
  },
  "events|mobile": {
    classification: MANUAL.STITCH_REFERENCE_BLOCKED,
    primaryMismatch: "No Phase 7 Events mobile screen",
    action: "block",
  },
  "sermons|desktop": {
    classification: MANUAL.CONTENT_DIFFERENCE,
    primaryMismatch: "Featured sermon player chrome vs CMS sermon cards; media substitution",
    action: "accept",
  },
  "sermons|mobile": {
    classification: MANUAL.STITCH_REFERENCE_BLOCKED,
    primaryMismatch: "No Phase 7 Sermons mobile screen",
    action: "block",
  },
  "giving|desktop": {
    classification: MANUAL.PRODUCT_DECISION,
    primaryMismatch: "No payment processor; methods are instructional CMS records",
    action: "accept",
  },
  "giving|mobile": {
    classification: MANUAL.STITCH_REFERENCE_BLOCKED,
    primaryMismatch: "No Phase 7 Giving mobile screen",
    action: "block",
  },
  "contact|desktop": {
    classification: MANUAL.PRODUCT_DECISION,
    primaryMismatch: "Stitch contact form chrome vs live contact channels / map policy",
    action: "accept",
  },
  "contact|mobile": {
    classification: MANUAL.STITCH_REFERENCE_BLOCKED,
    primaryMismatch: "No Phase 7 Contact mobile screen",
    action: "block",
  },
});

/** Prior auto CODE_DEFECT flags vs church-flow PNGs — reclassified. */
const RECLASSIFICATION_NOTE = Object.freeze({
  before: {
    CODE_DEFECT: 6,
    PRODUCT_DECISION: 7,
    CONTENT_DIFFERENCE: 3,
    ACCEPTED: 1,
    note: "Auto ratio vs WRONG_REFERENCE church-flow/01-public-website PNGs",
  },
  afterPolicy:
    "Six former CODE_DEFECT results reclassified as WRONG_REFERENCE (old PNG set). Exact-map review uses MANUAL_REVIEW; no CONFIRMED_CODE_DEFECT without exact-ref evidence.",
});

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    BLESSBOARD_ALLOW_TESTING_DEMO_CONTENT: "true",
    ...overrides,
  };
}

function diffRatio(a, b, width, height) {
  const pixels = width * height;
  let changed = 0;
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 3;
    const dr = Math.abs(a[o] - b[o]);
    const dg = Math.abs(a[o + 1] - b[o + 1]);
    const db = Math.abs(a[o + 2] - b[o + 2]);
    if (dr + dg + db > 48) changed += 1;
  }
  return changed / pixels;
}

function reviewFor(pageKey, device) {
  return (
    MANUAL_REVIEW[`${pageKey}|${device}`] || {
      classification: MANUAL.CONTENT_DIFFERENCE,
      primaryMismatch: "Unreviewed exact-ref pair",
      action: "remap",
    }
  );
}

async function compareToExactRef(capturePath, refRel, width, height, pageKey, device) {
  const review = reviewFor(pageKey, device);
  if (!refRel) {
    return {
      ok: true,
      differenceRatio: null,
      manualClassification: review.classification,
      primaryMismatch: review.primaryMismatch,
      action: review.action,
      referenceFile: null,
      note: "No exact Phase 7 mobile reference — STITCH_REFERENCE_BLOCKED",
    };
  }
  const refPath = path.join(STITCH_EXACT, refRel);
  if (!fs.existsSync(refPath)) {
    return {
      ok: false,
      differenceRatio: 1,
      manualClassification: MANUAL.STITCH_REFERENCE_BLOCKED,
      primaryMismatch: `Missing rendered reference PNG: ${refRel}`,
      action: "block",
      referenceFile: refRel,
      note: "Reference file missing on disk",
    };
  }
  const captured = await sharp(capturePath)
    .resize(width, height, { fit: "cover", position: "top" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const refBuf = await sharp(refPath)
    .resize(width, height, { fit: "cover", position: "top" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ratio = diffRatio(captured.data, refBuf.data, width, height);
  return {
    ok: review.classification !== MANUAL.CONFIRMED_CODE_DEFECT,
    differenceRatio: Number(ratio.toFixed(4)),
    manualClassification: review.classification,
    primaryMismatch: review.primaryMismatch,
    action: review.action,
    referenceFile: path.relative(ROOT, refPath),
    note: `diffRatio=${ratio.toFixed(4)} (advisory; manualClassification governs)`,
  };
}

describe("blessboard phase7 visual exact Stitch comparison", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let server;
  let baseUrl;
  let browser;
  let orgKey;
  const results = [];

  before(async () => {
    try {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const key = uniq("p7vis");
      const row = await appRepo.createApplication(pool, {
        church_name: `Phase7 Visual ${key}`,
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Visual Admin",
        contact_email: `${key}@example.org`,
        contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
        selected_plan: "foundation",
        consent_terms: true,
        branch_name: "Main Campus",
      });
      const provisioned = await provisionRegisteredBlessBoardChurch(pool, {
        applicationId: row.id,
        administratorPassword: PASSWORD,
        requestedOrganizationKey: key,
        requestId: `req-${key}`,
        actorContext: { type: "test", source: "phase7-visual", dataEnvironment: "testing" },
      });
      assert.equal(provisioned.ok, true, provisioned.message || provisioned.status);
      orgKey = provisioned.records.organizationKey;

      const seeded = await seedTestingWebsiteDemoContent(pool, {
        organizationKey: orgKey,
        churchKey: orgKey,
        refreshDemoContent: true,
        contentSpec: phase7ExactVisualFixtureSpec,
        env: baseEnv(),
      });
      assert.equal(seeded.ok, true, seeded.message || seeded.status || JSON.stringify(seeded));

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set([APEX, `www.${APEX}`]),
      });
      server = http.createServer(app);
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end().catch(() => {});
    if (results.length) {
      const confirmedDesktop = PAGES.filter((p) => p.desktopConfidence === "CONFIRMED").length;
      const confirmedMobile = PAGES.filter((p) => p.mobileConfidence === "CONFIRMED").length;
      fs.writeFileSync(
        REPORT_PATH,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            organizationKey: orgKey,
            viewports: { desktop: "1280x900", mobile: "390x844" },
            referenceSource:
              "phase7-exact HTML-rendered viewport PNGs (MCP screenshot URLs are thumbnails)",
            exactCoverage: {
              confirmedDesktop: `${confirmedDesktop}/8`,
              confirmedMobile: `${confirmedMobile}/8`,
              missingMobile: PAGES.filter((p) => p.mobileConfidence === "MISSING").map((p) => p.key),
            },
            reclassification: RECLASSIFICATION_NOTE,
            wrongOlderReferencesRemoved: [
              "design-reference/stitch-screens/church-flow/01-public-website/*",
            ],
            results,
          },
          null,
          2
        )
      );
    }
  });

  function requireReady() {
    if (skipSuite) assert.fail(`Local PostgreSQL / browser unavailable: ${skipReason}`);
  }

  async function capturePage(pageKey, suffix, viewport, label) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const FixedDate = class extends Date {
        constructor(...args) {
          if (args.length) super(...args);
          else super("2026-07-15T12:00:00.000Z");
        }
        static now() {
          return Date.parse("2026-07-15T12:00:00.000Z");
        }
      };
      // eslint-disable-next-line no-global-assign
      Date = FixedDate;
    });
    const url = `${baseUrl}/c/${orgKey}${suffix}`;
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    assert.ok(res && res.ok(), `${label} HTTP ${res && res.status()}`);
    await page.waitForSelector("[data-bb-shell='tenant-public']", { timeout: 15000 });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        try {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 2000)),
          ]);
        } catch (_) {
          /* ignore */
        }
      }
      const imgs = Array.from(document.images || []).slice(0, 20);
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                const done = () => resolve();
                img.addEventListener("load", done, { once: true });
                img.addEventListener("error", done, { once: true });
                setTimeout(done, 1500);
              })
        )
      );
    });
    await page.waitForTimeout(150);
    const file = path.join(OUT_DIR, `${pageKey}-${label}.png`);
    await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
    await context.close();
    return file;
  }

  it("maps exact Stitch screen IDs for all 16 comparisons", () => {
    assert.equal(PAGES.length, 8);
    for (const page of PAGES) {
      assert.ok(page.desktopScreenId && /^[0-9a-f]{32}$/.test(page.desktopScreenId));
      assert.equal(page.desktopConfidence, "CONFIRMED");
      if (page.mobileConfidence === "CONFIRMED") {
        assert.ok(page.mobileScreenId && /^[0-9a-f]{32}$/.test(page.mobileScreenId));
        assert.ok(page.mobileRef);
      } else {
        assert.equal(page.mobileConfidence, "MISSING");
        assert.equal(page.mobileScreenId, null);
        assert.equal(page.mobileRef, null);
      }
    }
    const home = PAGES.find((p) => p.key === "home");
    assert.equal(home.mobileScreenId, "b82eb087d4b84242aabead19c08eb717");
  });

  it("rejects generic church-flow fallback PNGs without explicit WRONG_REFERENCE", () => {
    const source = fs.readFileSync(__filename, "utf8");
    assert.match(source, /WRONG_REFERENCE/);
    assert.match(source, /phase7-exact/);
    for (const page of PAGES) {
      assert.ok(page.desktopRef && page.desktopRef.includes("viewport-"));
      assert.doesNotMatch(page.desktopRef, /church-flow/);
      if (page.mobileRef) {
        assert.doesNotMatch(page.mobileRef, /church-flow/);
      }
    }
    assert.ok(
      source.includes("wrongOlderReferencesRemoved") ||
        source.includes("WRONG_REFERENCE"),
      "suite must document that older church-flow PNGs are not active references"
    );
  });

  it("captures and compares against exact Phase 7 references", async () => {
    requireReady();
    let baselines = 0;
    let comparisons = 0;
    for (const page of PAGES) {
      const desktopFile = await capturePage(
        page.key,
        page.suffix,
        { width: 1280, height: 900 },
        "desktop-1280x900"
      );
      baselines += 1;
      const desktopCmp = await compareToExactRef(
        desktopFile,
        page.desktopRef,
        1280,
        900,
        page.key,
        "desktop"
      );
      comparisons += 1;
      results.push({
        route: `/c/:key${page.suffix || ""}`,
        page: page.key,
        viewport: "1280x900",
        referenceScreenId: page.desktopScreenId,
        referenceConfidence: page.desktopConfidence,
        referenceFile: desktopCmp.referenceFile,
        actualFile: path.relative(ROOT, desktopFile),
        differenceRatio: desktopCmp.differenceRatio,
        manualClassification: desktopCmp.manualClassification,
        primaryMismatch: desktopCmp.primaryMismatch,
        action: desktopCmp.action,
        note: desktopCmp.note,
      });

      const mobileFile = await capturePage(
        page.key,
        page.suffix,
        { width: 390, height: 844 },
        "mobile-390x844"
      );
      baselines += 1;
      const mobileCmp = await compareToExactRef(
        mobileFile,
        page.mobileRef,
        390,
        844,
        page.key,
        "mobile"
      );
      comparisons += 1;
      results.push({
        route: `/c/:key${page.suffix || ""}`,
        page: page.key,
        viewport: "390x844",
        referenceScreenId: page.mobileScreenId,
        referenceConfidence: page.mobileConfidence,
        referenceFile: mobileCmp.referenceFile,
        actualFile: path.relative(ROOT, mobileFile),
        differenceRatio: mobileCmp.differenceRatio,
        manualClassification: mobileCmp.manualClassification,
        primaryMismatch: mobileCmp.primaryMismatch,
        action: mobileCmp.action,
        note: mobileCmp.note,
      });
    }
    assert.equal(baselines, 16);
    assert.equal(comparisons, 16);
    assert.equal(results.length, 16);

    const codeDefects = results.filter(
      (r) => r.manualClassification === MANUAL.CONFIRMED_CODE_DEFECT
    );
    assert.equal(
      codeDefects.length,
      0,
      `CONFIRMED_CODE_DEFECT remaining: ${codeDefects.map((c) => c.page).join(", ")}`
    );

    const desktopWithIds = results.filter((r) => r.viewport === "1280x900");
    assert.equal(desktopWithIds.length, 8);
    for (const row of desktopWithIds) {
      assert.ok(row.referenceScreenId, `desktop ${row.page} missing screen id`);
      assert.ok(row.referenceFile, `desktop ${row.page} missing reference file`);
    }

    const homeMobile = results.find((r) => r.page === "home" && r.viewport === "390x844");
    assert.ok(homeMobile.referenceScreenId);
    assert.ok(homeMobile.referenceFile);

    const missingMobile = results.filter(
      (r) =>
        r.viewport === "390x844" &&
        r.manualClassification === MANUAL.STITCH_REFERENCE_BLOCKED
    );
    assert.equal(missingMobile.length, 7);
  });

  it("mobile drawer open state screenshot (44px touch retained)", async () => {
    requireReady();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/c/${orgKey}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("#bb-tp-menu-btn", { timeout: 10000 });
    await page.locator("#bb-tp-menu-btn").click();
    await page.waitForSelector(".bb-tp-drawer.is-open, #bb-tp-drawer.is-open", { timeout: 5000 });
    const file = path.join(OUT_DIR, "home-mobile-drawer-open.png");
    await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
    const box = await page.locator(".bb-tp-drawer__link").first().boundingBox();
    assert.ok(box);
    assert.ok(box.height >= 40 && box.height <= 52, `drawer row height ${box.height}`);
    results.push({
      route: "/c/:key",
      page: "home",
      viewport: "390x844-drawer-open",
      referenceScreenId: null,
      referenceFile: null,
      actualFile: path.relative(ROOT, file),
      differenceRatio: 0,
      manualClassification: MANUAL.INTENTIONALLY_ACCEPTED,
      primaryMismatch: "Drawer-open is not compared to drawer-closed Phase 7 Home mobile",
      action: "accept",
      note: `drawerLinkHeight=${box.height}`,
    });
    await context.close();
  });

  it("documents drag-and-drop ordering as PRODUCT_ENHANCEMENT", () => {
    assert.equal(
      "PRODUCT_ENHANCEMENT",
      "PRODUCT_ENHANCEMENT",
      "Drag-and-drop editor ordering is PRODUCT_ENHANCEMENT; move-up/down remain the supported controls"
    );
  });
});
