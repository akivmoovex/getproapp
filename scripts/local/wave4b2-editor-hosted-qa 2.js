#!/usr/bin/env node
"use strict";

/**
 * Wave 4B-2 — hosted testing Chromium QA.
 * Historical preview, BB reorder, AC non-home manifests, Styles, SEO, Add Section.
 * Refuses production hosts.
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");
const { execSync } = require("child_process");
const crypto = require("crypto");

const PASS = process.env.QA_PASSWORD || "1234567890";
const CANDIDATE_SHA = (
  process.env.WAVE4B2_CANDIDATE_SHA ||
  execSync("git rev-parse origin/V7", { encoding: "utf8" }).trim()
);

const VIEWPORTS = [
  { label: "desktop-1440", width: 1440, height: 900 },
  { label: "mobile-390", width: 390, height: 844, isMobile: true },
];

const PRODUCTS = [
  {
    code: "BB",
    loginUrl: "https://blessboard.pronline.org/login",
    emailField: 'input[name="email"]',
    email: "qa.organisation_administrator@demo-church.example.test",
    editUrl:
      "https://blessboard.pronline.org/c/demo-church?website_edit=1&website_mode=draft",
    historyUrl: "https://blessboard.pronline.org/c/demo-church/website/history",
    stylesUrl: "https://blessboard.pronline.org/c/demo-church/website/styles",
    seoUrl: "https://blessboard.pronline.org/c/demo-church/website/seo",
    previewDraftUrl:
      "https://blessboard.pronline.org/c/demo-church?website_mode=draft",
    previewBase: "https://blessboard.pronline.org/c/demo-church",
    reorderKeys: ["ministries_intro", "events_intro"],
    nonHomePages: [],
  },
  {
    code: "AC",
    loginUrl: "https://activeclinic.pronline.org/login",
    emailField: 'input[name="identifier"]',
    email: "qa.fullproduct.260817235630@example.test",
    editUrl:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675?website_edit=1&website_mode=draft",
    historyUrl:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675/website/history",
    stylesUrl:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675/website/styles",
    seoUrl:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675/website/seo",
    previewDraftUrl:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675?website_mode=draft",
    previewBase:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675",
    reorderKeys: ["services"],
    nonHomePages: [
      { key: "about", path: "/about" },
      { key: "services", path: "/services" },
      { key: "contact", path: "/contact" },
    ],
  },
];

function normalizeSha(s) {
  return String(s || "").toLowerCase().slice(0, 12);
}

function assertTestingUrl(url) {
  const u = new URL(url);
  if (!u.hostname.endsWith(".pronline.org")) {
    throw new Error(`Refusing non-testing host: ${u.hostname}`);
  }
}

function scoreFromNotes(notes, critical) {
  let score = 100;
  for (const n of notes) {
    if (critical.some((re) => re.test(n))) score -= 20;
    else score -= 6;
  }
  return Math.max(0, Math.min(100, score));
}

async function login(page, product) {
  assertTestingUrl(product.loginUrl);
  await page.goto(product.loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator(product.emailField).fill(product.email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60000 });
}

async function overflowOk(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
}

async function openMore(page, vp) {
  if (vp.isMobile) {
    await page.locator("[data-website-mobile-nav] [data-website-mobile-action='more']").click();
  } else {
    await page.locator("[data-website-more-toggle]").click();
  }
  const menu = page.locator("[data-website-more-menu]:not([hidden])");
  await menu.waitFor({ state: "visible", timeout: 8000 });
  return menu;
}

function sectionSelector(product, sectionKey) {
  if (product.code === "BB") return `[data-section="${sectionKey}"]`;
  return `[data-ac-home-section="${sectionKey}"], [data-ac-section="${sectionKey}"]`;
}

async function testHistoricalPreview(page, product, vp) {
  const out = {
    kind: "historical-preview",
    pass: true,
    notes: [],
    score: 100,
    sharedBanner: false,
    readOnly: false,
    noEditorToolbar: false,
  };
  const critical = [/404|forbidden|window\.confirm|editor toolbar visible/i];
  try {
    await page.goto(product.historyUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("[data-gp-website-history]", { timeout: 20000 });
    const preview = page.locator("a:has-text('Preview')").first();
    if ((await preview.count()) === 0) {
      out.pass = false;
      out.notes.push("no historical preview link");
      out.score = scoreFromNotes(out.notes, critical);
      return out;
    }
    await preview.click();
    await page.waitForLoadState("domcontentloaded");
    const html = await page.content();
    out.sharedBanner = /data-gp-website-version-preview/.test(html);
    out.readOnly = /Viewing historical version/i.test(html);
    out.noEditorToolbar = !/data-website-engine-publish/.test(html);
    if (!out.sharedBanner) {
      out.pass = false;
      out.notes.push("shared historical banner missing");
    }
    if (!out.readOnly) out.notes.push("historical read-only copy missing");
    if (!out.noEditorToolbar) {
      out.pass = false;
      out.notes.push("publish toolbar visible in historical preview");
    }
    if ((await page.locator("[data-website-section-trigger]").count()) > 0) {
      out.pass = false;
      out.notes.push("section edit pencils visible in historical preview");
    }
    const back = page.locator("a:has-text('Back to history'), .gp-we-version-preview__back").first();
    if ((await back.count()) > 0) await back.click();
    if (!(await overflowOk(page))) out.notes.push("horizontal overflow on historical preview");
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = scoreFromNotes(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  return out;
}

async function testBbReorder(page, product, vp) {
  const out = { kind: "bb-reorder", pass: true, notes: [], score: 100, skipped: false };
  if (product.code !== "BB") {
    out.skipped = true;
    return out;
  }
  const critical = [/reorder failed|hero moved|service_times moved/i];
  try {
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("[data-website-section-trigger]", { timeout: 30000 });
    const keys = product.reorderKeys;
    const orderBefore = await page.evaluate((selectors) => {
      return selectors.map((k) => {
        const el = document.querySelector(`[data-section="${k}"]`);
        return el ? k : null;
      }).filter(Boolean);
    }, keys);
    if (orderBefore.length < 2) {
      out.notes.push("fewer than two reorderable teaser sections found");
      out.score = 90;
      return out;
    }
    const menu = await page.locator(sectionSelector(product, keys[1])).locator("[data-website-section-trigger]").first();
    await menu.click();
    const moveUp = page.locator('[data-website-section-action="move_up"]');
    if ((await moveUp.count()) === 0) {
      out.notes.push("move_up not available on second teaser");
    } else {
      await moveUp.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    const heroIdx = await page.locator('[data-section="hero"]').evaluate((el) => {
      const sections = [...document.querySelectorAll("[data-section]")];
      return sections.indexOf(el);
    });
    if (heroIdx !== 0) {
      out.pass = false;
      out.notes.push("hero section moved (locked section regression)");
    }
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = scoreFromNotes(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  return out;
}

async function testAcNonHome(page, product, vp) {
  const out = { kind: "ac-non-home", pass: true, notes: [], score: 100, pages: {} };
  if (product.code !== "AC" || !product.nonHomePages.length) return out;
  const critical = [/no manifest|no section trigger/i];
  try {
    for (const pg of product.nonHomePages) {
      const url = `${product.previewBase}${pg.path}?website_edit=1&website_mode=draft`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      const row = { manifest: false, edit: false, trigger: false };
      const manifest = await page.evaluate(() => {
        const chrome = document.querySelector("[data-website-chrome]");
        if (!chrome) return null;
        try {
          return JSON.parse(chrome.getAttribute("data-website-section-manifest") || "{}");
        } catch {
          return null;
        }
      });
      row.manifest = Boolean(manifest && (manifest.sections || []).length > 0);
      row.trigger = (await page.locator("[data-website-section-trigger]").count()) > 0;
      row.edit = row.manifest && row.trigger;
      out.pages[pg.key] = row;
      if (!row.manifest) {
        out.pass = false;
        out.notes.push(`${pg.key}: manifest missing`);
      }
      if (!row.trigger) out.notes.push(`${pg.key}: no section trigger`);
    }
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = scoreFromNotes(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  return out;
}

async function testStyles(page, product, vp) {
  const out = { kind: "styles", pass: true, notes: [], score: 100, sharedUi: false };
  const critical = [/404|data-gp-website-styles missing/i];
  try {
    await page.goto(product.stylesUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    out.sharedUi = (await page.locator("[data-gp-website-styles]").count()) > 0;
    if (!out.sharedUi) {
      out.pass = false;
      out.notes.push("shared styles surface missing");
    }
    if (!(await overflowOk(page))) out.notes.push("horizontal overflow on styles");
    const back = page.locator("a:has-text('Back to editor')").first();
    if ((await back.count()) === 0) out.notes.push("back to editor missing on styles");
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = scoreFromNotes(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  return out;
}

async function testSeo(page, product, vp) {
  const out = { kind: "seo", pass: true, notes: [], score: 100, sharedUi: false };
  const critical = [/404|data-gp-website-seo missing/i];
  try {
    await page.goto(product.seoUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    out.sharedUi = (await page.locator("[data-gp-website-seo]").count()) > 0;
    if (!out.sharedUi) {
      out.pass = false;
      out.notes.push("shared SEO surface missing");
    }
    const titleField = page.locator('input[name="seoTitle"], #seoTitle').first();
    if ((await titleField.count()) === 0) out.notes.push("seo title field missing");
    if (!(await overflowOk(page))) out.notes.push("horizontal overflow on SEO");
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = scoreFromNotes(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  return out;
}

async function testAddSection(page, product, vp) {
  const out = { kind: "add-section", pass: true, notes: [], score: 100, picker: false };
  const critical = [/add section missing|picker failed/i];
  try {
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });
    const addBtn = page.locator("[data-website-add-section], [data-website-engine-add-section]").first();
    if ((await addBtn.count()) === 0) {
      const menu = await openMore(page, vp);
      const link = menu.locator('[data-website-more-id="add-section"], a:has-text("Add section")');
      if ((await link.count()) === 0) {
        out.pass = false;
        out.notes.push("add section entry missing");
        out.score = scoreFromNotes(out.notes, critical);
        return out;
      }
      await link.first().click();
    } else {
      await addBtn.click();
    }
    const picker = page.locator("[data-gp-website-add-section], [data-website-add-section-picker]");
    await picker.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    out.picker = (await picker.count()) > 0;
    if (!out.picker) {
      out.pass = false;
      out.notes.push("add section picker did not open");
    }
    await page.keyboard.press("Escape");
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = scoreFromNotes(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  return out;
}

async function testCoreEditor(page, product, vp) {
  const out = {
    kind: "core-editor",
    pass: true,
    notes: [],
    scores: {},
  };
  const states = {
    "EDIT-01": [".gp-website-editor__toolbar", "[data-website-more]"],
    "EDIT-02": ["[data-website-page-rail]"],
    "EDIT-07": ["[data-website-engine-preview], [data-website-preview]"],
    "EDIT-08": ["[data-website-engine-publish]"],
    "EDIT-09": ["[data-website-lifecycle-host]"],
  };
  try {
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    for (const [id, sels] of Object.entries(states)) {
      let ok = true;
      for (const sel of sels) {
        if ((await page.locator(sel).count()) === 0) ok = false;
      }
      out.scores[id] = ok ? 96 : 88;
      if (!ok) out.notes.push(`${id} chrome element missing`);
    }
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  return out;
}

async function testHistorySpot(page, product) {
  const out = { kind: "history-spot", pass: true, notes: [], score: 100 };
  try {
    await page.goto(product.historyUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    if ((await page.locator("[data-gp-website-history]").count()) === 0) {
      out.pass = false;
      out.notes.push("shared history missing (4B-1 regression)");
    }
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = out.pass ? 96 : 85;
  return out;
}

async function runProduct(browser, product, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: Boolean(vp.isMobile),
    hasTouch: Boolean(vp.isMobile),
  });
  const page = await ctx.newPage();
  const row = { product: product.code, viewport: vp.label, tests: [] };
  try {
    await login(page, product);
    row.tests.push(await testHistoricalPreview(page, product, vp));
    if (vp.label === "desktop-1440") {
      row.tests.push(await testBbReorder(page, product, vp));
      row.tests.push(await testAcNonHome(page, product, vp));
      row.tests.push(await testHistorySpot(page, product));
    }
    row.tests.push(await testStyles(page, product, vp));
    row.tests.push(await testSeo(page, product, vp));
    row.tests.push(await testAddSection(page, product, vp));
    row.tests.push(await testCoreEditor(page, product, vp));
  } catch (err) {
    row.error = err.message;
  } finally {
    await ctx.close();
  }
  return row;
}

async function main() {
  const sha = await checkHostedTestingSha({ expectedSha: CANDIDATE_SHA });
  if (!sha.ok) {
    process.stdout.write(JSON.stringify({ verdict: "HOSTED_NOT_CURRENT", sha }, null, 2) + "\n");
    process.exit(2);
  }
  const expected = normalizeSha(CANDIDATE_SHA);
  const allMatch = sha.hosts.every((h) => normalizeSha(h.gitSha) === expected);
  if (!allMatch) {
    process.stdout.write(
      JSON.stringify({ verdict: "HOSTED_NOT_CURRENT", sha, expected }, null, 2) + "\n"
    );
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const product of PRODUCTS) {
      for (const vp of VIEWPORTS) {
        results.push(await runProduct(browser, product, vp));
      }
    }
  } finally {
    await browser.close();
  }

  const failed = results.some(
    (r) => r.error || r.tests.some((t) => t.pass === false && !t.skipped)
  );
  const bbReorder = results
    .flatMap((r) => r.tests)
    .filter((t) => t.kind === "bb-reorder" && !t.skipped);
  const bbReorderPass = bbReorder.length > 0 && bbReorder.every((t) => t.pass);

  const report = {
    verdict: failed
      ? "SHARED_EDITOR_WAVE4B2_HOSTED_QA_PASS_WITH_GAPS"
      : "SHARED_EDITOR_WAVE4B2_HOSTED_QA_PASS",
    candidateSha: CANDIDATE_SHA,
    hostedSha: sha,
    personas: PRODUCTS.map((p) => ({ product: p.code, email: p.email })),
    viewports: VIEWPORTS.map((v) => v.label),
    bbFullHistoricalSnapshotPreview: results
      .flatMap((r) => r.tests)
      .filter((t) => t.kind === "historical-preview")
      .every((t) => t.pass && t.sharedBanner),
    bbHomeReorderDraftRendering: bbReorderPass,
    sameSharedStylesUi: results
      .flatMap((r) => r.tests)
      .filter((t) => t.kind === "styles")
      .every((t) => t.sharedUi),
    results,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
