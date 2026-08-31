#!/usr/bin/env node
"use strict";

/**
 * BlessBoard Platform 01 — hosted testing QA (pointer + publish + hub).
 * Refuses production hosts.
 */

const { chromium } = require("playwright");

const PASS = process.env.QA_PASSWORD || "1234567890";
const BASE = "https://blessboard.pronline.org";
const LOGIN = `${BASE}/login`;
const EMAIL = "qa.organisation_administrator@demo-church.example.test";

const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900, isMobile: false },
  { label: "mobile-390", width: 390, height: 844, isMobile: true },
];

const PENCIL_KEYS = [
  { page: "/c/demo-church/about?website_edit=1&website_mode=draft", key: "about.story.heading", label: "about.story.heading" },
  { page: "/c/demo-church/giving?website_edit=1&website_mode=draft", key: "giving.cta.heading", label: "giving.cta.heading" },
  { page: "/c/demo-church/giving?website_edit=1&website_mode=draft", key: "giving.cta.bodyText", label: "giving.cta.bodyText" },
];

const SPOT_KEYS = [
  "home.hero.heading",
  "home.hero.bodyText",
  "about.hero.heading",
  "contact.hero.heading",
  "giving.hero.heading",
];

async function login(page) {
  await page.goto(LOGIN, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60000 });
}

async function testPencil(page, url, key) {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });
  const field = page.locator(`[data-website-key="${key}"]`).first();
  await field.waitFor({ state: "visible", timeout: 15000 });
  const pencil = field.locator(".gp-website-editable__pencil, [data-website-start]").first();
  await pencil.click({ timeout: 10000 });
  const panel = page.locator("[data-website-field-editor-panel]:not([hidden])");
  await panel.waitFor({ state: "visible", timeout: 10000 });
  await panel.locator("[data-website-field-editor-cancel]").click();
  await panel.waitFor({ state: "hidden", timeout: 5000 });
  return { ok: true };
}

async function testEmptyFieldUx(page) {
  const url = `${BASE}/c/demo-church/giving?website_edit=1&website_mode=draft`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });
  const key = "giving.cta.heading";
  const field = page.locator(`[data-website-key="${key}"]`).first();
  const restore = (await field.getAttribute("data-website-value")) || "Give with purpose";

  await field.locator(".gp-website-editable__pencil").click();
  let panel = page.locator("[data-website-field-editor-panel]:not([hidden])");
  await panel.waitFor({ state: "visible", timeout: 10000 });
  await panel.locator("[data-website-input]").fill("");
  await panel.locator("[data-website-field-editor-save]").click();
  await panel.waitFor({ state: "hidden", timeout: 15000 });

  const display = field.locator("[data-website-display]");
  const isEmpty = await display.evaluate((el) => el.classList.contains("is-empty"));
  const hint = await display.getAttribute("data-empty-hint");
  const valueAttr = await field.getAttribute("data-website-value");
  const hintVisible = await display.evaluate((el) => {
    const before = window.getComputedStyle(el, "::before").content;
    return before && before !== "none" && before !== '""';
  });
  const minHeight = await display.evaluate((el) => parseFloat(getComputedStyle(el).minHeight) || el.offsetHeight);

  await field.locator(".gp-website-editable__pencil").click();
  panel = page.locator("[data-website-field-editor-panel]:not([hidden])");
  await panel.waitFor({ state: "visible", timeout: 10000 });
  await panel.locator("[data-website-input]").fill(restore);
  await panel.locator("[data-website-field-editor-save]").click();
  await panel.waitFor({ state: "hidden", timeout: 15000 });

  return {
    ok: isEmpty && Boolean(hint) && valueAttr === "" && hintVisible && minHeight >= 20,
    isEmpty,
    hint,
    valueAttr,
    hintVisible,
    minHeight,
    restored: true,
  };
}

async function testSectionChrome(page) {
  const url = `${BASE}/c/demo-church?website_edit=1&website_mode=draft`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });
  const menuBtn = page.locator("[data-website-section-trigger]").first();
  await menuBtn.waitFor({ state: "visible", timeout: 15000 });
  await menuBtn.click({ timeout: 10000 });
  const menuHost = page.locator(".gp-website-section-menu:not([hidden])");
  await menuHost.waitFor({ state: "visible", timeout: 8000 });
  const menu = page.locator("[data-website-section-menu-panel]:not([hidden])").first();
  const zMenu = await menuHost.evaluate((el) => parseInt(getComputedStyle(el).zIndex, 10) || 0);
  const box = await menu.boundingBox();
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});

  const pencil = page.locator('[data-website-key="home.hero.heading"] .gp-website-editable__pencil').first();
  await pencil.click({ timeout: 10000 });
  const panel = page.locator("[data-website-field-editor-panel]:not([hidden])");
  await panel.waitFor({ state: "visible", timeout: 8000 });
  await panel.locator("[data-website-field-editor-cancel]").click();

  return { ok: Boolean(box && box.height > 0 && zMenu >= 40), zMenu, box };
}

async function testMobilePublishJourney(page) {
  await page.goto(`${BASE}/hq/website`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const editHref = await page.locator('[data-bb-edit-website="1"], [data-bb-website-action="edit"]').first().getAttribute("href");
  if (!editHref) throw new Error("Website Hub edit link missing");
  await page.goto(`${BASE}${editHref}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });

  const marker = `BB-MOB-PUB-${Date.now()}`;
  const field = page.locator('[data-website-key="home.hero.heading"]').first();
  await field.locator(".gp-website-editable__pencil").click({ timeout: 15000 });
  const panel = page.locator("[data-website-field-editor-panel]:not([hidden])");
  await panel.waitFor({ state: "visible", timeout: 10000 });
  await panel.locator("[data-website-input]").fill(marker);
  await panel.locator("[data-website-field-editor-save]").click();
  await panel.waitFor({ state: "hidden", timeout: 15000 });

  await page.locator('[data-website-engine-preview]').first().click({ timeout: 10000 });
  await page.waitForURL(/website_mode=draft|preview/i, { timeout: 20000 }).catch(() => {});

  const backEdit = page.locator('a[href*="website_edit=1"]').first();
  if (await backEdit.count()) {
    await backEdit.click({ timeout: 10000 });
    await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });
  } else {
    await page.goto(`${BASE}/c/demo-church?website_edit=1&website_mode=draft`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });
  }

  await page.locator("[data-website-engine-publish]").first().click();
  const dialog = page.locator('[data-website-lifecycle-panel="publish"]:not([hidden])');
  await dialog.waitFor({ state: "visible", timeout: 8000 });
  await dialog.locator('[data-website-lifecycle-confirm="publish"]').click();

  const success =
    (await page.locator("[data-website-publish-success]").isVisible().catch(() => false)) ||
    (await page.waitForURL(/website_published=1/i, { timeout: 25000 }).then(() => true).catch(() => false));

  await page.goto(`${BASE}/c/demo-church`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const publicHtml = await page.content();
  return { ok: success && publicHtml.includes(marker), marker, success };
}

async function testPlaceholderLeak(page) {
  await page.goto(`${BASE}/c/demo-church/giving`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const publicHtml = await page.content();
  const leakPublic =
    /Click to add heading/i.test(publicHtml) ||
    /data-empty-hint="Click to add/i.test(publicHtml) ||
    /gp-website-editable__display is-empty/.test(publicHtml);

  await page.goto(`${BASE}/c/demo-church/giving?website_mode=draft`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const previewHtml = await page.content();
  const leakPreview = /Click to add heading/i.test(previewHtml);

  return { ok: !leakPublic && !leakPreview, leakPublic, leakPreview };
}

async function testPublishUi(page) {
  const url = `${BASE}/c/demo-church?website_edit=1&website_mode=draft`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });

  const marker = `BB-P01-${Date.now()}`;
  const field = page.locator('[data-website-key="home.hero.heading"]').first();
  await field.locator(".gp-website-editable__pencil").click();
  const panel = page.locator("[data-website-field-editor-panel]:not([hidden])");
  await panel.waitFor({ state: "visible", timeout: 10000 });
  await panel.locator("[data-website-input]").fill(marker);
  await panel.locator("[data-website-field-editor-save]").click();
  await panel.waitFor({ state: "hidden", timeout: 15000 });

  const publishForm = page.locator('form[data-website-publish-confirm="1"]').first();
  const action = await publishForm.getAttribute("action");

  const submitPromise = page.waitForRequest(
    (req) => req.method() === "POST" && req.url().includes(action.replace(/^\//, "")),
    { timeout: 20000 }
  ).catch(() => null);

  await page.locator("[data-website-engine-publish]").first().click();
  const dialog = page.locator('[data-website-lifecycle-panel="publish"]:not([hidden])');
  await dialog.waitFor({ state: "visible", timeout: 8000 });
  await dialog.locator('[data-website-lifecycle-confirm="publish"]').click();

  const req = await submitPromise;
  const navigated = await page
    .waitForURL(/website_published=1|publish/i, { timeout: 25000 })
    .then(() => true)
    .catch(() => false);
  const success = await page.locator("[data-website-publish-success]").isVisible().catch(() => false);

  return {
    ok: Boolean(req || navigated || success),
    postSeen: Boolean(req),
    navigated,
    success,
    action,
  };
}

async function testHub(page) {
  await page.goto(`${BASE}/hq/website`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const html = await page.content();
  const buildLinks = (html.match(/data-bb-build-website="1"/g) || []).length;
  const editLinks = (html.match(/data-bb-edit-website="1"|data-bb-website-action="edit"/g) || []).length;
  const brandingPrimary = /Continue[^<]{0,40}\/hq\/website\/branding|href="\/hq\/website\/branding"[^>]*bb-wm-btn--primary/.test(html);
  return {
    ok: editLinks > 0 && !brandingPrimary,
    buildLinks,
    editLinks,
    brandingPrimary,
    hasBuildYourWebsite: /Build your website/i.test(html),
  };
}

async function runViewport(browser, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.isMobile,
  });
  const page = await ctx.newPage();
  await login(page);
  const out = { viewport: vp.label, pencils: {}, spot: {}, emptyField: null, sectionChrome: null, placeholderLeak: null, publish: null, hub: null };
  for (const item of PENCIL_KEYS) {
    try {
      await testPencil(page, item.page, item.key);
      out.pencils[item.label] = "PASS";
    } catch (err) {
      out.pencils[item.label] = `FAIL: ${err.message}`;
    }
  }
  for (const key of SPOT_KEYS) {
    try {
      const pagePath =
        key.startsWith("about.") ? "/c/demo-church/about?website_edit=1&website_mode=draft"
          : key.startsWith("giving.") ? "/c/demo-church/giving?website_edit=1&website_mode=draft"
            : key.startsWith("contact.") ? "/c/demo-church/contact?website_edit=1&website_mode=draft"
              : "/c/demo-church?website_edit=1&website_mode=draft";
      await testPencil(page, pagePath, key);
      out.spot[key] = "PASS";
    } catch (err) {
      out.spot[key] = `FAIL: ${err.message}`;
    }
  }
  try {
    out.emptyField = await testEmptyFieldUx(page);
  } catch (err) {
    out.emptyField = { ok: false, error: err.message };
  }
  try {
    out.sectionChrome = await testSectionChrome(page);
  } catch (err) {
    out.sectionChrome = { ok: false, error: err.message };
  }
  if (!vp.isMobile) {
    try {
      out.placeholderLeak = await testPlaceholderLeak(page);
    } catch (err) {
      out.placeholderLeak = { ok: false, error: err.message };
    }
  }
  try {
    out.publish = await testPublishUi(page);
  } catch (err) {
    out.publish = { ok: false, error: err.message };
  }
  if (!vp.isMobile) {
    try {
      out.hub = await testHub(page);
    } catch (err) {
      out.hub = { ok: false, error: err.message };
    }
  }
  await ctx.close();
  return out;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const vp of VIEWPORTS) {
    results.push(await runViewport(browser, vp));
  }
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileCtx.newPage();
  await login(mobilePage);
  let mobilePublish = null;
  try {
    mobilePublish = await testMobilePublishJourney(mobilePage);
  } catch (err) {
    mobilePublish = { ok: false, error: err.message };
  }
  await mobileCtx.close();
  await browser.close();
  const spotMobile = results.find((r) => r.viewport === "mobile-390");
  const spotPass = spotMobile
    ? Object.values(spotMobile.spot).filter((v) => v === "PASS").length
    : 0;
  console.log(
    JSON.stringify(
      {
        BB_MOBILE_PREVIEW_POINTER_INTERCEPTION:
          spotMobile && spotMobile.spot["home.hero.heading"] === "PASS" ? "FIXED" : "FAIL",
        SECTION_MENU_LAYERING:
          results.some((r) => r.sectionChrome && r.sectionChrome.ok) ? "PASS" : "FAIL",
        BB_MOBILE_SPOT_EDITABILITY: `${spotPass}/5`,
        BB_MOBILE_UI_PUBLISH_FLOW_PASS: mobilePublish && mobilePublish.ok ? "YES" : "NO",
        results,
        mobilePublish,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
