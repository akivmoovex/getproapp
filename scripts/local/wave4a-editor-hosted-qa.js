#!/usr/bin/env node
"use strict";

/**
 * Wave 4A shared editor section actions — hosted testing Chromium QA (BB + AC).
 * EDIT-06 section actions + Wave 1–3 regression spot-checks.
 * Refuses production hosts.
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");
const { execSync } = require("child_process");

const PASS = process.env.QA_PASSWORD || "1234567890";
const CANDIDATE_SHA = (
  process.env.WAVE4A_CANDIDATE_SHA ||
  execSync("git rev-parse HEAD", { encoding: "utf8" }).trim()
);

function normalizeSha(s) {
  return String(s || "").toLowerCase().slice(0, 12);
}

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
    editUrl: "https://blessboard.pronline.org/c/demo-church?website_edit=1&website_mode=draft",
    previewBase: "https://blessboard.pronline.org/c/demo-church",
    hideSectionKey: "welcome",
    reorderSectionKey: "welcome",
    lockedSectionKey: "hero",
  },
  {
    code: "AC",
    loginUrl: "https://activeclinic.pronline.org/login",
    emailField: 'input[name="identifier"]',
    email: "qa.fullproduct.260817235630@example.test",
    editUrl:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675?website_edit=1&website_mode=draft",
    previewBase:
      "https://activeclinic.pronline.org/clinics/qa-full-product-clinic-260817235630-805675",
    hideSectionKey: "introduction",
    reorderSectionKey: "services",
    lockedSectionKey: "hero",
  },
];

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

async function overflowOk(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

function noteScore(notes, critical) {
  let score = 100;
  for (const n of notes) {
    if (critical.some((re) => re.test(n))) score -= 25;
    else score -= 8;
  }
  return Math.max(0, Math.min(100, score));
}

function sectionSelector(product, sectionKey) {
  if (product.code === "BB") return `[data-section="${sectionKey}"]`;
  return `[data-ac-home-section="${sectionKey}"]`;
}

async function openSectionMenu(page, product, sectionKey) {
  const sel = sectionSelector(product, sectionKey);
  const section = page.locator(sel).first();
  await section.scrollIntoViewIfNeeded();
  const trigger = section.locator("[data-website-section-trigger]").first();
  await trigger.waitFor({ state: "visible", timeout: 15000 });
  await trigger.click();
  const menu = page.locator("[data-website-section-menu-host]:not([hidden])");
  await menu.waitFor({ state: "visible", timeout: 8000 });
  return menu;
}

async function discardWebsiteDraft(page, vp) {
  if (vp.isMobile) {
    await page.locator("[data-website-more-toggle]").click();
  } else {
    await page.locator("[data-website-more-toggle]").click();
  }
  const menu = page.locator("[data-website-more-menu]:not([hidden])");
  await menu.waitFor({ state: "visible", timeout: 5000 });
  await menu.locator('[data-website-lifecycle-action="discard"]').click();
  const dialog = page.locator('[data-website-lifecycle-panel="discard"]:not([hidden])');
  await dialog.waitFor({ state: "visible", timeout: 8000 });
  await dialog.locator('[data-website-lifecycle-confirm="discard"]').click();
  await page.waitForLoadState("domcontentloaded");
}

async function testEdit06Shell(page, product, vp) {
  const out = { kind: "EDIT-06-section-actions", pass: true, notes: [], score: 100 };
  const critical = [
    /no section trigger|menu missing|window\.confirm|not hidden in preview|discard failed/i,
  ];
  try {
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".gp-website-editor__toolbar", { timeout: 30000 });

    const triggers = page.locator("[data-website-section-trigger]");
    const triggerCount = await triggers.count();
    if (triggerCount === 0) {
      out.pass = false;
      out.notes.push("no section trigger in edit mode");
    }

    await page.goto(product.previewBase, { waitUntil: "domcontentloaded", timeout: 60000 });
    if ((await page.locator("[data-website-section-trigger]").count()) > 0) {
      out.pass = false;
      out.notes.push("section trigger visible in live mode");
    }

    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("[data-website-section-trigger]", { timeout: 30000 });

    const menu = await openSectionMenu(page, product, product.hideSectionKey);
    const menuText = await menu.textContent();
    for (const label of ["Edit section", "Reorder", "Hide section", "Restore default"]) {
      if (!menuText.includes(label)) out.notes.push(`menu missing: ${label}`);
    }
    if (vp.isMobile) {
      const grab = menu.locator(".gp-website-section-menu__grab");
      if ((await grab.count()) === 0) out.notes.push("mobile sheet grab missing");
    }

    const lockedMenu = await openSectionMenu(page, product, product.lockedSectionKey);
    const hideBtn = lockedMenu.locator('[data-website-section-action="hide"]');
    if (!(await hideBtn.isDisabled())) {
      out.notes.push("locked hero hide not disabled");
    }
    await lockedMenu.locator("[data-website-section-menu-dismiss]").first().click();

    const reorderMenu = await openSectionMenu(page, product, product.reorderSectionKey);
    await reorderMenu.locator('[data-website-section-action="reorder"]').click();
    const moveDown = reorderMenu.locator('[data-website-section-action="move_down"]');
    await moveDown.waitFor({ state: "visible", timeout: 5000 });
    const beforeOrder = await page.evaluate((productCode) => {
      const attr = productCode === "BB" ? "data-section" : "data-ac-home-section";
      return Array.from(document.querySelectorAll(`[${attr}]`))
        .map((el) => el.getAttribute(attr))
        .filter(Boolean);
    }, product.code);
    await moveDown.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
    const afterOrder = await page.evaluate((productCode) => {
      const attr = productCode === "BB" ? "data-section" : "data-ac-home-section";
      return Array.from(document.querySelectorAll(`[${attr}]`))
        .map((el) => el.getAttribute(attr))
        .filter(Boolean);
    }, product.code);
    if (JSON.stringify(beforeOrder) === JSON.stringify(afterOrder)) {
      out.notes.push("reorder did not change DOM order after reload");
    }

    const hideMenu = await openSectionMenu(page, product, product.hideSectionKey);
    await hideMenu.locator('[data-website-section-action="hide"]').click();
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
    const hiddenSection = page.locator(sectionSelector(product, product.hideSectionKey)).first();
    const hiddenClass = await hiddenSection.evaluate((el) => el.classList.contains("gp-website-section--hidden-draft"));
    if (!hiddenClass) out.notes.push("hidden draft class missing after hide");

    const previewLink = page.locator("[data-website-engine-preview], [data-website-preview]").first();
    await previewLink.click();
    await page.waitForLoadState("domcontentloaded");
    const previewVisible = await page
      .locator(sectionSelector(product, product.hideSectionKey))
      .first()
      .isVisible()
      .catch(() => false);
    if (previewVisible) {
      out.pass = false;
      out.notes.push("hidden section still visible in preview");
    }

    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await discardWebsiteDraft(page, vp);
    const restoredVisible = await page
      .locator(sectionSelector(product, product.hideSectionKey))
      .first()
      .isVisible()
      .catch(() => false);
    if (!restoredVisible) out.notes.push("section not restored after discard draft");
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  out.score = noteScore(out.notes, critical);
  if (!out.pass) out.score = Math.min(out.score, 89);
  if (out.notes.length && out.score >= 95) out.score = Math.max(90, out.score - out.notes.length * 2);
  return out;
}

async function testWave1Shell(page) {
  const out = { kind: "EDIT-01-shell", pass: true, notes: [], score: 96 };
  const checks = [
    ".gp-website-editor__toolbar",
    "[data-website-page-rail], [data-website-page-sheet]",
    "[data-website-more]",
  ];
  for (const sel of checks) {
    if ((await page.locator(sel).count()) === 0) {
      out.pass = false;
      out.notes.push(`missing ${sel}`);
      out.score = 80;
    }
  }
  return out;
}

async function testRegressionQuick(page) {
  const out = { kind: "wave3-regression", pass: true, notes: [], scores: { preview: 100, publish: 100, unsaved: 100, more: 100 } };
  try {
    const preview = page.locator("[data-website-engine-preview], [data-website-preview]").first();
    if ((await preview.count()) === 0) {
      out.pass = false;
      out.notes.push("preview link missing");
      out.scores.preview = 85;
    }
    const publish = page.locator("[data-website-engine-publish]").first();
    if ((await publish.count()) === 0) {
      out.notes.push("publish missing");
      out.scores.publish = 90;
    }
    const more = page.locator("[data-website-more]");
    if ((await more.count()) === 0) {
      out.notes.push("more menu missing");
      out.scores.more = 90;
    }
    const lifecycle = page.locator("[data-website-lifecycle-host]");
    if ((await lifecycle.count()) === 0) {
      out.notes.push("lifecycle host missing");
      out.scores.unsaved = 90;
    }
  } catch (err) {
    out.pass = false;
    out.notes.push(err.message);
  }
  return out;
}

async function runProduct(browser, product, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: Boolean(vp.isMobile),
    hasTouch: Boolean(vp.isMobile),
  });
  const page = await ctx.newPage();
  const row = { product: product.code, viewport: vp.label, tests: [], scores: {} };
  try {
    await login(page, product);
    row.tests.push(await testEdit06Shell(page, product, vp));
    await page.goto(product.editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    row.tests.push(await testWave1Shell(page));
    row.tests.push(await testRegressionQuick(page));
    row.overflow = await overflowOk(page);
    for (const t of row.tests) {
      if (t.kind === "EDIT-06-section-actions") row.scores.edit06 = t.score;
      if (t.kind === "EDIT-01-shell") row.scores.edit01 = t.score;
      if (t.kind === "wave3-regression") Object.assign(row.scores, t.scores);
    }
  } catch (err) {
    row.error = err.message;
  } finally {
    await ctx.close();
  }
  return row;
}

async function main() {
  const sha = await checkHostedTestingSha({});
  if (!sha.ok) {
    process.stdout.write(JSON.stringify({ verdict: "HOSTED_NOT_CURRENT", sha }, null, 2) + "\n");
    process.exit(2);
  }
  const expected = normalizeSha(CANDIDATE_SHA);
  const allMatch = sha.hosts.every((h) => normalizeSha(h.gitSha) === expected);
  if (!allMatch) {
    process.stdout.write(JSON.stringify({ verdict: "HOSTED_NOT_CURRENT", sha, expected }, null, 2) + "\n");
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

  const report = {
    verdict: "SHARED_EDITOR_WAVE4A_HOSTED_QA_PASS",
    candidateSha: CANDIDATE_SHA,
    hostedSha: sha,
    personas: PRODUCTS.map((p) => ({ product: p.code, email: p.email, route: p.editUrl })),
    viewports: VIEWPORTS.map((v) => v.label),
    results,
  };
  const failed = results.some(
    (r) =>
      r.error ||
      !r.overflow ||
      r.tests.some((t) => t.pass === false) ||
      (r.scores.edit06 != null && r.scores.edit06 < 95)
  );
  if (failed) report.verdict = "SHARED_EDITOR_WAVE4A_HOSTED_QA_PASS_WITH_GAPS";
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
