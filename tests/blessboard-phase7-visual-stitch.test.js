"use strict";

/**
 * Phase 7 visual comparison: V5 path-public pages vs Stitch PNGs.
 * Captures desktop 1440×900 and mobile 390×844 (+ mobile drawer open).
 * Uses sharp for Stitch top-crop compare; writes report + local baselines.
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

const ROOT = path.join(__dirname, "..");
const STITCH_ROOT = path.join(
  ROOT,
  "design-reference/stitch-screens/church-flow/01-public-website"
);
const OUT_DIR = path.join(ROOT, "tests/__screenshots__/phase7-public");
const REPORT_PATH = path.join(OUT_DIR, "stitch-comparison-report.json");
const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";

const PAGES = Object.freeze([
  {
    key: "home",
    suffix: "",
    desktop: "01-public-home-desktop/01-public-home-desktop.png",
    mobile: "01-public-home-mobile/01-public-home-mobile.png",
  },
  {
    key: "about",
    suffix: "/about",
    desktop: "02-public-about-desktop/02-public-about-desktop.png",
    mobile: "02-public-about-mobile/02-public-about-mobile.png",
  },
  {
    key: "leadership",
    suffix: "/leadership",
    desktop: "03-public-leadership-desktop/03-public-leadership-desktop.png",
    mobile: "03-public-leadership-mobile/03-public-leadership-mobile.png",
  },
  {
    key: "ministries",
    suffix: "/ministries",
    desktop: "04-public-ministries-desktop/04-public-ministries-desktop.png",
    mobile: "04-public-ministries-mobile/04-public-ministries-mobile.png",
  },
  {
    key: "events",
    suffix: "/events",
    desktop: "05-public-events-calendar-desktop/05-public-events-calendar-desktop.png",
    mobile: "05-public-events-calendar-mobile/05-public-events-calendar-mobile.png",
  },
  {
    key: "sermons",
    suffix: "/sermons",
    desktop: "06-public-sermons-desktop/06-public-sermons-desktop.png",
    mobile: "06-public-sermons-mobile/06-public-sermons-mobile.png",
  },
  {
    key: "giving",
    suffix: "/giving",
    desktop: "07-public-giving-desktop/07-public-giving-desktop.png",
    mobile: "07-public-giving-mobile/07-public-giving-mobile.png",
  },
  {
    key: "contact",
    suffix: "/contact",
    desktop: "08-public-contact-desktop/08-public-contact-desktop.png",
    mobile: "08-public-contact-mobile/08-public-contact-mobile.png",
  },
]);

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

/**
 * Diff two equal-size raw RGB buffers. Returns ratio of differing pixels.
 */
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

function classifyDiff(ratio, meta) {
  if (ratio <= 0.08) return "FONT_TOLERANCE";
  if (ratio <= 0.18) return "CONTENT_DIFFERENCE";
  if (meta && meta.mediaMissing) return "MEDIA_BLOCKED";
  if (ratio <= 0.35) return "PRODUCT_DECISION";
  return "CODE_DEFECT";
}

async function compareToStitch(capturePath, stitchRel, width, height) {
  const stitchPath = path.join(STITCH_ROOT, stitchRel);
  if (!fs.existsSync(stitchPath)) {
    return {
      ok: false,
      classification: "MEDIA_BLOCKED",
      ratio: 1,
      note: `Missing Stitch PNG: ${stitchRel}`,
    };
  }
  const captured = await sharp(capturePath)
    .resize(width, height, { fit: "cover", position: "top" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const stitchBuf = await sharp(stitchPath)
    .resize(width, height, { fit: "cover", position: "top" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ratio = diffRatio(captured.data, stitchBuf.data, width, height);
  const classification = classifyDiff(ratio, {});
  return {
    ok: classification === "FONT_TOLERANCE" || classification === "CONTENT_DIFFERENCE",
    classification,
    ratio: Number(ratio.toFixed(4)),
    note: `diffRatio=${ratio.toFixed(4)}`,
  };
}

describe("blessboard phase7 visual Stitch comparison", () => {
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
      fs.writeFileSync(
        REPORT_PATH,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            organizationKey: orgKey,
            viewports: { desktop: "1440x900", mobile: "390x844" },
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
      // Freeze time-ish UI noise
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

  it("captures and compares all 16 public screenshots to Stitch", async () => {
    requireReady();
    let baselines = 0;
    let comparisons = 0;
    for (const page of PAGES) {
      const desktopFile = await capturePage(
        page.key,
        page.suffix,
        { width: 1440, height: 900 },
        "desktop-1440x900"
      );
      baselines += 1;
      const desktopCmp = await compareToStitch(desktopFile, page.desktop, 1440, 900);
      comparisons += 1;
      results.push({
        page: page.key,
        device: "desktop",
        capture: path.relative(ROOT, desktopFile),
        stitch: page.desktop,
        ...desktopCmp,
      });

      const mobileFile = await capturePage(
        page.key,
        page.suffix,
        { width: 390, height: 844 },
        "mobile-390x844"
      );
      baselines += 1;
      const mobileCmp = await compareToStitch(mobileFile, page.mobile, 390, 844);
      comparisons += 1;
      results.push({
        page: page.key,
        device: "mobile",
        capture: path.relative(ROOT, mobileFile),
        stitch: page.mobile,
        ...mobileCmp,
      });
    }
    assert.equal(baselines, 16);
    assert.equal(comparisons, 16);
    assert.equal(results.length, 16);
    // Completeness gate: every page compared. Do not require MATCHED.
    const blocked = results.filter((r) => r.classification === "MEDIA_BLOCKED");
    assert.equal(blocked.length, 0, `Missing Stitch refs: ${blocked.map((b) => b.stitch).join(", ")}`);
  });

  it("mobile drawer open state screenshot", async () => {
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
      page: "home",
      device: "mobile-drawer",
      capture: path.relative(ROOT, file),
      classification: "ACCEPTED",
      ratio: 0,
      note: `drawerLinkHeight=${box.height}`,
    });
    await context.close();
  });
});
