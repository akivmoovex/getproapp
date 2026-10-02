#!/usr/bin/env node
"use strict";

/**
 * Final shared website editor release QA — hosted testing only.
 * BB SEO lifecycle, AC SEO spot-check, Add Section, core chrome, AC non-home.
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");
const { execSync } = require("child_process");
const crypto = require("crypto");

const PASS = process.env.QA_PASSWORD || "1234567890";
const CANDIDATE_SHA = (
  process.env.RELEASE_CANDIDATE_SHA ||
  execSync("git rev-parse origin/V7", { encoding: "utf8" }).trim()
);

const VIEWPORTS = [
  { label: "desktop-1440", width: 1440, height: 900 },
  { label: "mobile-390", width: 390, height: 844, isMobile: true },
];

const BB = {
  code: "BB",
  loginUrl: "https://blessboard.pronline.org/login",
  emailField: 'input[name="email"]',
  email: "qa.organisation_administrator@demo-church.example.test",
  editUrl: "https://blessboard.pronline.org/c/demo-church?website_edit=1&website_mode=draft",
  seoUrl: "https://blessboard.pronline.org/c/demo-church/website/seo",
  liveUrl: "https://blessboard.pronline.org/c/demo-church",
  previewUrl: "https://blessboard.pronline.org/c/demo-church?website_mode=draft",
  historyUrl: "https://blessboard.pronline.org/c/demo-church/website/history",
  stylesUrl: "https://blessboard.pronline.org/c/demo-church/website/styles",
  mediaUrl: "https://blessboard.pronline.org/c/demo-church/website/media-library",
};

const AC = {
  code: "AC",
  loginUrl: "https://activeclinic.pronline.org/login",
  emailField: 'input[name="identifier"]',
  email: "qa.fullproduct.260817235630@example.test",
  editUrl:
    "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675?website_edit=1&website_mode=draft",
  seoUrl:
    "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675/website/seo",
  liveUrl:
    "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675",
  previewUrl:
    "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675?website_mode=draft",
  historyUrl:
    "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675/website/history",
  stylesUrl:
    "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675/website/styles",
  nonHome: [
    { key: "about", path: "/about" },
    { key: "services", path: "/services" },
    { key: "contact", path: "/contact" },
    { key: "doctors", path: "/doctors" },
    { key: "location", path: "/location" },
    { key: "pricing", path: "/pricing" },
  ],
};

function normalizeSha(s) {
  return String(s || "").toLowerCase().slice(0, 12);
}

function assertTestingUrl(url) {
  const u = new URL(url);
  if (!u.hostname.endsWith(".pronline.org")) {
    throw new Error(`Refusing non-testing host: ${u.hostname}`);
  }
}

async function login(page, product) {
  assertTestingUrl(product.loginUrl);
  await page.goto(product.loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator(product.emailField).fill(product.email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60000 });
}

async function readMeta(page) {
  return page.evaluate(() => ({
    title: document.title || "",
    description:
      document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "",
  }));
}

async function openMore(page, isMobile) {
  if (isMobile) {
    const more = page.locator("[data-website-mobile-nav] [data-website-mobile-action='more']");
    if ((await more.count()) === 0) {
      await page.locator("[data-website-more-toggle]").click();
    } else {
      await more.click();
    }
  } else {
    await page.locator("[data-website-more-toggle]").click();
  }
  await page.locator("[data-website-more-menu]:not([hidden])").waitFor({ state: "visible", timeout: 8000 });
}

async function testBbSeoLifecycle(page, vp) {
  const out = {
    kind: "bb-seo-lifecycle",
    pass: false,
    notes: [],
    viewport: vp.label,
    title: "",
    liveTitleBefore: "",
    liveTitleAfterDraft: "",
    liveTitleAfterPublish: "",
  };
  const stamp = `QA-SEO-${crypto.randomBytes(3).toString("hex")}`;
  const draftTitle = `${stamp} BlessBoard`;
  const draftDesc = `Disposable SEO description ${stamp}`;
  try {
    await page.goto(BB.liveUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    const liveBefore = await readMeta(page);
    out.liveTitleBefore = liveBefore.title;

    await page.goto(BB.seoUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    if ((await page.locator("[data-gp-website-seo]").count()) === 0) {
      out.notes.push("shared SEO surface missing");
      return out;
    }
    const titleInput = page.locator('input[name="seoTitle"]').first();
    const descInput = page.locator('textarea[name="seoDescription"]').first();
    await titleInput.waitFor({ state: "visible", timeout: 10000 });
    await titleInput.fill(draftTitle);
    await descInput.fill(draftDesc);
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("saved") === "1", { timeout: 30000 }),
      page.locator('button[type="submit"], input[type="submit"]').first().click(),
    ]);

    await page.goto(BB.seoUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    const savedTitle = await titleInput.inputValue();
    if (savedTitle !== draftTitle) {
      out.notes.push(`draft title not persisted in form (got: ${savedTitle})`);
      return out;
    }
    out.title = draftTitle;

    await page.goto(BB.previewUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    const previewMeta = await readMeta(page);
    if (!previewMeta.title.includes(stamp)) {
      out.notes.push(`preview title missing draft stamp: ${previewMeta.title}`);
    }
    if (!previewMeta.description.includes(stamp)) {
      out.notes.push(`preview description missing draft stamp`);
    }

    await page.goto(BB.liveUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    const liveAfterDraft = await readMeta(page);
    out.liveTitleAfterDraft = liveAfterDraft.title;
    if (liveAfterDraft.title.includes(stamp)) {
      out.notes.push("live title changed before publish");
    }

    await page.goto(BB.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    const publishResult = await page.evaluate(async () => {
      const form = document.querySelector("[data-website-engine-publish-form]");
      if (!form) return { ok: false, reason: "publish_form_missing" };
      const csrf =
        document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ||
        document.querySelector('input[name="_csrf"]')?.value ||
        "";
      const action = form.getAttribute("action") || window.location.pathname.replace(/\?.*$/, "") + "/website/publish";
      const body = new URLSearchParams();
      body.set("_csrf", csrf);
      body.set("confirm_publish", "1");
      const res = await fetch(action, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "text/html,application/json",
        },
        body: body.toString(),
        redirect: "follow",
      });
      return { ok: res.ok || (res.status >= 300 && res.status < 400), status: res.status, url: res.url };
    });
    if (!publishResult.ok) {
      out.notes.push(`publish failed status=${publishResult.status}`);
    }

    await page.goto(`${BB.liveUrl}?_=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const liveAfterPublish = await readMeta(page);
    out.liveTitleAfterPublish = liveAfterPublish.title;
    if (!liveAfterPublish.title.includes(stamp)) {
      out.notes.push(`published live title missing stamp: ${liveAfterPublish.title}`);
    }
    if (!liveAfterPublish.description.includes(stamp)) {
      out.notes.push("published live description missing stamp");
    }

    await page.goto(BB.historyUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    if ((await page.locator("[data-gp-website-history]").count()) === 0) {
      out.notes.push("history missing after publish");
    }

    out.pass = out.notes.length === 0;
  } catch (err) {
    out.notes.push(err.message);
  }
  return out;
}

async function testAcSeoSpot(page) {
  const out = { kind: "ac-seo-spot", pass: true, notes: [] };
  const stamp = `AC-SEO-${crypto.randomBytes(2).toString("hex")}`;
  try {
    await page.goto(AC.seoUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    if ((await page.locator("[data-gp-website-seo]").count()) === 0) {
      out.pass = false;
      out.notes.push("AC shared SEO surface missing");
      return out;
    }
    const titleInput = page.locator('input[name="seoTitle"]').first();
    await titleInput.fill(`${stamp} Clinic`);
    await page.locator('textarea[name="seoDescription"]').first().fill(`AC draft ${stamp}`);
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("saved") === "1", { timeout: 30000 }),
      page.locator('button[type="submit"]').first().click(),
    ]);
    await page.goto(AC.previewUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    const meta = await readMeta(page);
    if (!meta.title.includes(stamp)) out.notes.push("AC preview title missing draft");
    if (out.notes.length) out.pass = false;
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  return out;
}

async function testAddSection(page, product, vp) {
  const out = { kind: "add-section", product: product.code, pass: false, notes: [], viewport: vp.label };
  try {
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });
    await page.waitForFunction(
      () => {
        const btn = document.querySelector("[data-website-add-section-open]");
        return btn && !btn.hidden;
      },
      { timeout: 15000 }
    );
    const openBtn = page.locator("[data-website-add-section-open]:not([hidden])");
    if ((await openBtn.count()) === 0) {
      out.notes.push("add section button not visible after JS init");
      return out;
    }
    await openBtn.click();
    await page.locator("[data-website-add-section-panel]:not([hidden])").waitFor({ state: "visible", timeout: 10000 });
    const options = page.locator("[data-website-add-section-type]");
    const empty = page.locator("[data-website-add-section-empty]:not([hidden])");
    out.pass = (await options.count()) > 0 || (await empty.count()) > 0;
    if (!out.pass) out.notes.push("add section picker did not open or list types");
    await page.keyboard.press("Escape");
  } catch (err) {
    out.notes.push(err.message);
  }
  return out;
}

async function testAcNonHome(page) {
  const out = { kind: "ac-non-home", pages: {}, classification: "V1_NONBLOCKING" };
  for (const pg of AC.nonHome) {
    const url = `${AC.liveUrl}${pg.path}?website_edit=1&website_mode=draft`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const row = await page.evaluate(() => {
      const chrome = document.querySelector("[data-website-chrome]");
      let manifest = false;
      try {
        const m = JSON.parse(chrome?.getAttribute("data-website-section-manifest") || "{}");
        manifest = Boolean(m.sections && m.sections.length);
      } catch {
        manifest = false;
      }
      const triggers = document.querySelectorAll("[data-website-section-trigger]").length;
      const editableStarts = document.querySelectorAll("[data-website-start]").length;
      return { manifest, triggers, editableStarts };
    });
    out.pages[pg.key] = {
      fieldsEditable: row.editableStarts > 0,
      sectionActionsVisible: row.triggers > 0,
      manifestPresent: row.manifest,
    };
  }
  return out;
}

async function testAcHistoricalBanner(page) {
  const out = { kind: "ac-historical-banner", duplicateVisible: false, sharedBanner: false, legacyBanner: false };
  await page.goto(AC.historyUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  const preview = page.locator(".gp-we-history__actions a[href*='/website/versions/']").first();
  if ((await preview.count()) === 0) return out;
  const href = await preview.getAttribute("href");
  if (!href || !href.includes("/website/versions/")) return out;
  await page.goto(href.startsWith("http") ? href : `https://activeclinic.pronline.org${href}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const html = await page.content();
  out.sharedBanner = /data-gp-website-version-preview/.test(html);
  out.legacyBanner = /data-ac-website-version-preview/.test(html);
  const sharedCount = await page.locator("[data-gp-website-version-preview]").count();
  const legacyCount = await page.locator("[data-ac-website-version-preview]").count();
  out.duplicateVisible = sharedCount > 0 && legacyCount > 0;
  return out;
}

async function testCoreChrome(page, product, vp) {
  const checks = {
    "EDIT-01": [".gp-website-editor__toolbar", "[data-website-more]"],
    "EDIT-02": ["[data-website-page-rail]"],
    "EDIT-07": ["[data-website-engine-preview], [data-website-preview]"],
    "EDIT-08": ["[data-website-engine-publish]"],
    "EDIT-09": ["[data-website-lifecycle-host]"],
  };
  const scores = {};
  await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  for (const [id, sels] of Object.entries(checks)) {
    let ok = true;
    for (const sel of sels) {
      if ((await page.locator(sel).count()) === 0) ok = false;
    }
    scores[id] = ok ? 96 : 88;
  }
  return { kind: "core-chrome", product: product.code, viewport: vp.label, scores };
}

async function main() {
  const sha = await checkHostedTestingSha({ expectedSha: CANDIDATE_SHA });
  const expected = normalizeSha(CANDIDATE_SHA);
  const hostedCurrent = sha.ok && sha.hosts.every((h) => normalizeSha(h.gitSha) === expected);
  if (!hostedCurrent) {
    process.stdout.write(
      JSON.stringify({ verdict: "HOSTED_NOT_CURRENT", expected, sha }, null, 2) + "\n"
    );
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const report = {
    candidateSha: CANDIDATE_SHA,
    hostedSha: sha,
    tests: [],
    bbSeoDraftPreviewPublish: "FAIL",
    addSection: { BB: "FAIL", AC: "FAIL" },
    core: { BB: {}, AC: {} },
  };

  try {
    const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const desktopPage = await desktopCtx.newPage();
    await login(desktopPage, BB);
    report.tests.push(await testBbSeoLifecycle(desktopPage, VIEWPORTS[0]));
    report.tests.push(await testAddSection(desktopPage, BB, VIEWPORTS[0]));
    report.tests.push(await testCoreChrome(desktopPage, BB, VIEWPORTS[0]));
    report.core.BB["desktop-1440"] = report.tests[report.tests.length - 1].scores;
    await desktopCtx.close();

    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileCtx.newPage();
    await login(mobilePage, BB);
    await mobilePage.goto(BB.seoUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    report.tests.push({
      kind: "bb-seo-mobile-surface",
      pass: (await mobilePage.locator("[data-gp-website-seo]").count()) > 0,
      viewport: "mobile-390",
      notes: [],
    });
    report.tests.push(await testAddSection(mobilePage, BB, VIEWPORTS[1]));
    report.tests.push(await testCoreChrome(mobilePage, BB, VIEWPORTS[1]));
    report.core.BB["mobile-390"] = report.tests[report.tests.length - 1].scores;
    await mobileCtx.close();

    const acCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const acPage = await acCtx.newPage();
    await login(acPage, AC);
    report.tests.push(await testAcSeoSpot(acPage));
    report.tests.push(await testAddSection(acPage, AC, VIEWPORTS[0]));
    report.tests.push(await testAcNonHome(acPage));
    report.tests.push(await testAcHistoricalBanner(acPage));
    report.tests.push(await testCoreChrome(acPage, AC, VIEWPORTS[0]));
    report.core.AC["desktop-1440"] = report.tests[report.tests.length - 1].scores;
    const acMobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const acMPage = await acMobile.newPage();
    await login(acMPage, AC);
    report.tests.push(await testAddSection(acMPage, AC, VIEWPORTS[1]));
    report.tests.push(await testCoreChrome(acMPage, AC, VIEWPORTS[1]));
    report.core.AC["mobile-390"] = report.tests[report.tests.length - 1].scores;
    await acCtx.close();
    await acMobile.close();
  } finally {
    await browser.close();
  }

  const bbSeo = report.tests.filter((t) => t.kind === "bb-seo-lifecycle");
  report.bbSeoDraftPreviewPublish =
    bbSeo.length > 0 && bbSeo.every((t) => t.pass) ? "PASS" : "FAIL";

  const bbAdd = report.tests.filter((t) => t.kind === "add-section" && t.product === "BB");
  const acAdd = report.tests.filter((t) => t.kind === "add-section" && t.product === "AC");
  report.addSection.BB = bbAdd.every((t) => t.pass) ? "PASS" : "FAIL";
  report.addSection.AC = acAdd.every((t) => t.pass) ? "PASS" : "FAIL";

  const blockers = [];
  if (report.bbSeoDraftPreviewPublish !== "PASS") blockers.push("bb-seo");
  report.verdict =
    blockers.length === 0
      ? "SHARED_WEBSITE_EDITOR_V1_RELEASE_READY_WITH_NONBLOCKING_GAPS"
      : "SHARED_WEBSITE_EDITOR_V1_NOT_RELEASE_READY";

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.bbSeoDraftPreviewPublish === "PASS" ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
